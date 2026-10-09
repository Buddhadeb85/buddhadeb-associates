# Parivar Rakshak — Deployment Guide

## What you are deploying

| Piece | What | Required? |
|-------|------|-----------|
| **Static app** | `public/index.html` | Yes — the full family tool |
| **Google Sheet webhook** | Lead / assessment capture | Recommended for leads |
| **API backend** | Auth, families, advisors | Optional for multi-user SaaS |

---

## Option A — Static site only (fastest)

### Netlify (drag & drop)

1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site → Deploy manually**  
2. Drag the **`public`** folder  
3. Site goes live at `https://random-name.netlify.app`  
4. (Optional) Set custom domain under Domain settings  

### Vercel

```bash
cd public
npx vercel --yes
```

### GitHub Pages

1. Create a repo, put contents of `public/` in the root or `/docs`  
2. Settings → Pages → Deploy from branch  

### Any static host

Upload `index.html` (+ `api-client.js` if needed). No build step.

After upload, open the URL on phone and desktop and run the test checklist once.

---

## Option B — Static + Google Sheets leads

1. Follow `GOOGLE_SHEETS_SETUP.md`  
2. Set `sheetsWebhook` in `PARIVAR_DEPLOY_CONFIG` inside `index.html`  
3. Redeploy static files  

---

## Option C — Full stack (static + API)

### API on a VPS / Railway / Render

```bash
cd backend
export JWT_SECRET='long-random-secret'
export PORT=3847
node server.js
```

Or use a process manager (pm2):

```bash
npm i -g pm2
pm2 start server.js --name parivar-api
```

### Point the frontend at the API

In `index.html`:

```javascript
const PARIVAR_DEPLOY_CONFIG = {
  apiBase: 'https://api.yourdomain.com',
  sheetsWebhook: 'https://script.google.com/macros/s/.../exec'
};
```

Enable CORS on the API host if the HTML is on another domain (`CORS_ORIGIN` in backend).

---

## Advisor packaging

Give each advisor:

1. The live URL of the static app  
2. Their own Advisor Mode password (set on first open — stored on their browser only for local mode)  
3. For multi-user: register with `role: "advisor"` on the API  
4. A short PDF/one-pager: how to use Shield, What-If, consent, and that the tool is **educational**  

Do **not** share a universal demo PIN. Each advisor sets their own password.

---

## Production checklist

- [ ] Open live URL on mobile + desktop  
- [ ] Calculate with sample profile  
- [ ] Language switch works  
- [ ] Sheet receives a test row (if configured)  
- [ ] Advisor password set; no demo PIN  
- [ ] HTTPS only (Netlify/Vercel provide this)  
- [ ] JWT_SECRET set if API is public  
- [ ] Privacy note / consent visible on lead form  

---

## Domains & branding

Suggested subdomain examples:

- `app.yourfirm.com` → static app  
- `api.yourfirm.com` → backend  

Replace title/logo in HTML header if you white-label for your tax / insurance practice — keep the educational, non-pressure positioning.
