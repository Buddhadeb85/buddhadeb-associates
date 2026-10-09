/**
 * Drop-in API client for Parivar Rakshak HTML frontend.
 * Usage: set API_BASE, then call api.register / api.login / api.saveAssessment etc.
 */
const API_BASE = window.PARIVAR_API || 'http://localhost:3847';

const api = {
  token: localStorage.getItem('pr_api_token') || null,

  async request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = 'Bearer ' + this.token;
    const res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  },

  async register(name, email, password, opts = {}) {
    const data = await this.request('POST', '/api/auth/register', {
      name, email, password, role: opts.role || 'user', mobile: opts.mobile || ''
    });
    this.token = data.token;
    localStorage.setItem('pr_api_token', data.token);
    localStorage.setItem('pr_api_user', JSON.stringify(data.user));
    return data;
  },

  async login(email, password) {
    const data = await this.request('POST', '/api/auth/login', { email, password });
    this.token = data.token;
    localStorage.setItem('pr_api_token', data.token);
    localStorage.setItem('pr_api_user', JSON.stringify(data.user));
    return data;
  },

  logout() {
    this.token = null;
    localStorage.removeItem('pr_api_token');
    localStorage.removeItem('pr_api_user');
  },

  me() { return this.request('GET', '/api/auth/me'); },
  family() { return this.request('GET', '/api/family'); },
  saveAssessment(payload) { return this.request('POST', '/api/family/assessment', payload); },
  setConsent(granted) { return this.request('PUT', '/api/family/consent', { granted }); },
  addMember(member) { return this.request('POST', '/api/family/members', member); },
  listDocuments() { return this.request('GET', '/api/family/documents'); },
  addDocument(doc) { return this.request('POST', '/api/family/documents', doc); },

  // Advisor
  advisorClients() { return this.request('GET', '/api/advisor/clients'); },
  linkClient(email) { return this.request('POST', '/api/advisor/clients', { email }); },
  clientDetail(familyId) { return this.request('GET', '/api/advisor/clients/' + familyId); },
  addNote(text, familyId) { return this.request('POST', '/api/advisor/notes', { text, familyId }); },
  addAppointment(appt) { return this.request('POST', '/api/advisor/appointments', appt); }
};

window.ParivarAPI = api;
