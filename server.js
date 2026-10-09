/**
 * Parivar Rakshak API — zero external dependency server
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3847;
const JWT_SECRET = process.env.JWT_SECRET || 'parivar-dev-secret-change-in-production';
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY_DB = {
  users: [], families: [], familyMembers: [], assessments: [],
  documents: [], consents: [], advisorClients: [], notes: [],
  appointments: [], snapshots: []
};

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(EMPTY_DB, null, 2));
}
function readDb() {
  ensureDb();
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return JSON.parse(JSON.stringify(EMPTY_DB)); }
}
function writeDb(db) {
  ensureDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}
function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const h = crypto.scryptSync(password, salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(hash, 'hex'));
  } catch { return false; }
}
function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 7 * 86400000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + body).digest('base64url');
  return header + '.' + body + '.' + sig;
}
function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(header + '.' + body).digest('base64url');
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) reject(new Error('too large')); });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}
function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
  });
  res.end(body);
}
function authUser(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  return verifyToken(token);
}

async function handler(req, res) {
  const u = new URL(req.url, 'http://localhost:' + PORT);
  const p = u.pathname;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    });
    return res.end();
  }

  try {
    if (method === 'GET' && p === '/api/health') {
      return send(res, 200, { ok: true, service: 'parivar-rakshak-api', version: '1.0.0', time: new Date().toISOString() });
    }

    if (method === 'POST' && p === '/api/auth/register') {
      const body = await readBody(req);
      const { email, password, name, role, mobile } = body;
      if (!email || !password || !name) return send(res, 400, { error: 'name, email and password are required' });
      if (String(password).length < 6) return send(res, 400, { error: 'Password must be at least 6 characters' });
      const db = readDb();
      if (db.users.find(x => x.email === String(email).toLowerCase())) {
        return send(res, 409, { error: 'Email already registered' });
      }
      const userRole = role === 'advisor' ? 'advisor' : 'user';
      const { salt, hash } = hashPassword(password);
      const user = {
        id: uuid(), email: String(email).toLowerCase().trim(), passwordSalt: salt, passwordHash: hash,
        name: String(name).trim(), mobile: mobile ? String(mobile) : '', role: userRole,
        createdAt: new Date().toISOString()
      };
      db.users.push(user);
      let familyId = null;
      if (userRole === 'user') {
        const family = { id: uuid(), ownerId: user.id, name: user.name + "'s Family", createdAt: new Date().toISOString() };
        db.families.push(family);
        familyId = family.id;
        db.familyMembers.push({
          id: uuid(), familyId, userId: user.id, name: user.name, role: 'Primary Earner',
          age: null, incomeShare: 0, createdAt: new Date().toISOString()
        });
      }
      writeDb(db);
      const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name });
      return send(res, 201, {
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role, mobile: user.mobile },
        familyId
      });
    }

    if (method === 'POST' && p === '/api/auth/login') {
      const body = await readBody(req);
      const db = readDb();
      const user = db.users.find(x => x.email === String(body.email || '').toLowerCase());
      if (!user || !verifyPassword(body.password || '', user.passwordSalt, user.passwordHash)) {
        return send(res, 401, { error: 'Invalid credentials' });
      }
      const family = db.families.find(f => f.ownerId === user.id);
      const token = signToken({ id: user.id, email: user.email, role: user.role, name: user.name });
      return send(res, 200, {
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role, mobile: user.mobile },
        familyId: family ? family.id : null
      });
    }

    if (method === 'GET' && p === '/api/auth/me') {
      const me = authUser(req);
      if (!me) return send(res, 401, { error: 'Authentication required' });
      const db = readDb();
      const user = db.users.find(x => x.id === me.id);
      if (!user) return send(res, 404, { error: 'User not found' });
      const family = db.families.find(f => f.ownerId === user.id);
      return send(res, 200, {
        user: { id: user.id, email: user.email, name: user.name, role: user.role, mobile: user.mobile },
        familyId: family ? family.id : null
      });
    }

    const me = authUser(req);

    if (p.startsWith('/api/family')) {
      if (!me) return send(res, 401, { error: 'Authentication required' });
      const db = readDb();
      const family = db.families.find(f => f.ownerId === me.id);

      if (method === 'GET' && p === '/api/family') {
        if (!family) return send(res, 404, { error: 'No family profile' });
        const members = db.familyMembers.filter(m => m.familyId === family.id);
        const consent = db.consents.find(c => c.familyId === family.id && c.type === 'advisor');
        return send(res, 200, { family, members, advisorConsent: consent ? consent.granted : false });
      }

      if (method === 'POST' && p === '/api/family/members') {
        if (!family) return send(res, 404, { error: 'No family profile' });
        const body = await readBody(req);
        if (!body.name) return send(res, 400, { error: 'name required' });
        const member = {
          id: uuid(), familyId: family.id, name: String(body.name).trim(),
          role: body.role || 'Other', age: body.age != null ? Number(body.age) : null,
          incomeShare: body.incomeShare != null ? Number(body.incomeShare) : 0,
          createdAt: new Date().toISOString()
        };
        db.familyMembers.push(member);
        writeDb(db);
        return send(res, 201, { member });
      }

      if (method === 'POST' && p === '/api/family/assessment') {
        if (!family) return send(res, 404, { error: 'No family profile' });
        const body = await readBody(req);
        const assessment = {
          id: uuid(), familyId: family.id, userId: me.id,
          overall: body.overall, label: body.label, buffer: body.buffer,
          surplus: body.surplus, hlvGap: body.hlvGap, income: body.income,
          debt: body.debt, liquid: body.liquid, payload: body.payload || {},
          createdAt: new Date().toISOString()
        };
        db.assessments.push(assessment);
        db.snapshots.push({
          id: uuid(), familyId: family.id, date: new Date().toISOString().slice(0, 10),
          overall: body.overall, buffer: body.buffer, surplus: body.surplus,
          createdAt: new Date().toISOString()
        });
        writeDb(db);
        return send(res, 201, { assessment });
      }

      if (method === 'GET' && p === '/api/family/assessments') {
        if (!family) return send(res, 404, { error: 'No family profile' });
        const list = db.assessments.filter(a => a.familyId === family.id)
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        return send(res, 200, { assessments: list });
      }

      if (method === 'PUT' && p === '/api/family/consent') {
        if (!family) return send(res, 404, { error: 'No family profile' });
        const body = await readBody(req);
        const granted = !!body.granted;
        let consent = db.consents.find(c => c.familyId === family.id && c.type === 'advisor');
        if (consent) {
          consent.granted = granted;
          consent.updatedAt = new Date().toISOString();
        } else {
          consent = {
            id: uuid(), familyId: family.id, userId: me.id, type: 'advisor',
            granted, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
          };
          db.consents.push(consent);
        }
        writeDb(db);
        return send(res, 200, { consent });
      }

      if (method === 'GET' && p === '/api/family/documents') {
        if (!family) return send(res, 404, { error: 'No family profile' });
        const docs = db.documents.filter(d => d.familyId === family.id).map(d => ({
          id: d.id, label: d.label, category: d.category, ready: d.ready,
          hasEncryptedPayload: !!d.encryptedPayload, updatedAt: d.updatedAt || d.createdAt
        }));
        return send(res, 200, { documents: docs });
      }

      if (method === 'POST' && p === '/api/family/documents') {
        if (!family) return send(res, 404, { error: 'No family profile' });
        const body = await readBody(req);
        if (!body.label) return send(res, 400, { error: 'label required' });
        const doc = {
          id: uuid(), familyId: family.id, label: String(body.label),
          category: body.category || 'general', ready: !!body.ready,
          encryptedPayload: body.encryptedPayload || null,
          createdAt: new Date().toISOString()
        };
        db.documents.push(doc);
        writeDb(db);
        return send(res, 201, {
          document: { id: doc.id, label: doc.label, category: doc.category, ready: doc.ready, hasEncryptedPayload: !!doc.encryptedPayload }
        });
      }
    }

    if (p.startsWith('/api/advisor')) {
      if (!me) return send(res, 401, { error: 'Authentication required' });
      if (me.role !== 'advisor') return send(res, 403, { error: 'Advisor role required' });
      const db = readDb();

      if (method === 'GET' && p === '/api/advisor/clients') {
        const links = db.advisorClients.filter(c => c.advisorId === me.id);
        const clients = links.map(link => {
          const fam = link.familyId ? db.families.find(f => f.id === link.familyId) : null;
          const owner = fam ? db.users.find(u => u.id === fam.ownerId) : null;
          const consent = link.familyId && db.consents.find(c => c.familyId === link.familyId && c.type === 'advisor' && c.granted);
          const latest = link.familyId
            ? db.assessments.filter(a => a.familyId === link.familyId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]
            : null;
          return {
            linkId: link.id, familyId: link.familyId,
            name: owner ? owner.name : link.name || 'Client',
            mobile: owner ? owner.mobile : link.mobile || '',
            email: owner ? owner.email : link.email || '',
            consent: !!consent,
            score: consent && latest ? latest.overall : null,
            label: consent && latest ? latest.label : null,
            buffer: consent && latest ? latest.buffer : null,
            lastAssessment: consent && latest ? latest.createdAt : null
          };
        });
        return send(res, 200, { clients });
      }

      if (method === 'POST' && p === '/api/advisor/clients') {
        const body = await readBody(req);
        const owner = body.email ? db.users.find(u => u.email === String(body.email).toLowerCase()) : null;
        const fam = owner ? db.families.find(f => f.ownerId === owner.id) : null;
        if (!fam) {
          const link = {
            id: uuid(), advisorId: me.id, familyId: null,
            name: body.name || 'Pending client', mobile: body.mobile || '', email: body.email || '',
            createdAt: new Date().toISOString()
          };
          db.advisorClients.push(link);
          writeDb(db);
          return send(res, 201, { client: link, note: 'Pending — client must register and grant consent' });
        }
        const existing = db.advisorClients.find(c => c.advisorId === me.id && c.familyId === fam.id);
        if (existing) return send(res, 200, { client: existing });
        const link = {
          id: uuid(), advisorId: me.id, familyId: fam.id,
          name: owner.name, mobile: owner.mobile || '', email: owner.email,
          createdAt: new Date().toISOString()
        };
        db.advisorClients.push(link);
        writeDb(db);
        return send(res, 201, { client: link });
      }

      if (method === 'GET' && /^\/api\/advisor\/clients\/[^/]+$/.test(p)) {
        const familyId = p.split('/')[4];
        const link = db.advisorClients.find(c => c.advisorId === me.id && c.familyId === familyId);
        if (!link) return send(res, 404, { error: 'Client not linked' });
        const consent = db.consents.find(c => c.familyId === familyId && c.type === 'advisor' && c.granted);
        if (!consent) return send(res, 403, { error: 'Consent not granted' });
        const fam = db.families.find(f => f.id === familyId);
        const owner = fam ? db.users.find(u => u.id === fam.ownerId) : null;
        const members = db.familyMembers.filter(m => m.familyId === familyId);
        const latest = db.assessments.filter(a => a.familyId === familyId)
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
        return send(res, 200, {
          family: fam,
          owner: owner ? { id: owner.id, name: owner.name, email: owner.email, mobile: owner.mobile } : null,
          members, latestAssessment: latest || null,
          disclaimer: 'Educational guidance only.'
        });
      }

      if (method === 'POST' && p === '/api/advisor/notes') {
        const body = await readBody(req);
        if (!body.text) return send(res, 400, { error: 'text required' });
        const note = { id: uuid(), advisorId: me.id, familyId: body.familyId || null, text: String(body.text).trim(), createdAt: new Date().toISOString() };
        db.notes.push(note);
        writeDb(db);
        return send(res, 201, { note });
      }

      if (method === 'GET' && p === '/api/advisor/notes') {
        const notes = db.notes.filter(n => n.advisorId === me.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 50);
        return send(res, 200, { notes });
      }

      if (method === 'POST' && p === '/api/advisor/appointments') {
        const body = await readBody(req);
        if (!body.date) return send(res, 400, { error: 'date required' });
        const appt = {
          id: uuid(), advisorId: me.id, familyId: body.familyId || null,
          clientName: body.clientName || '', date: body.date, time: body.time || '',
          notes: body.notes || '', status: 'requested', createdAt: new Date().toISOString()
        };
        db.appointments.push(appt);
        writeDb(db);
        return send(res, 201, { appointment: appt });
      }

      if (method === 'GET' && p === '/api/advisor/appointments') {
        return send(res, 200, { appointments: db.appointments.filter(a => a.advisorId === me.id) });
      }
    }

    if (method === 'GET' && (p === '/' || p === '/index.html')) {
      const frontend = path.join(__dirname, '..', 'parivar-rakshak-hardened.html');
      if (fs.existsSync(frontend)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(fs.readFileSync(frontend));
      }
      return send(res, 200, { message: 'Parivar Rakshak API', health: '/api/health' });
    }

    send(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'Internal server error' });
  }
}

http.createServer(handler).listen(PORT, () => {
  console.log('Parivar Rakshak API on http://localhost:' + PORT);
  console.log('Health: http://localhost:' + PORT + '/api/health');
});
