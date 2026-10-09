# Connect a real Google Sheet (lead + assessment capture)

## 1. Create a Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) → Blank spreadsheet  
2. Name it e.g. **Parivar Rakshak Leads**  
3. Row 1 headers (example):

```
timestamp | eventType | fullName | mobile | email | city | income | children | parents | overallScore | buffer | surplus | appointmentDate | appointmentTime
```

## 2. Apps Script Web App

1. In the Sheet: **Extensions → Apps Script**  
2. Paste this code:

```javascript
function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);
    sheet.appendRow([
      new Date().toISOString(),
      data.eventType || '',
      data.fullName || '',
      data.mobile || '',
      data.email || '',
      data.city || '',
      data.income || '',
      data.children || '',
      data.parents || '',
      data.overallScore || data.resilienceScore || '',
      data.buffer || '',
      data.surplus || '',
      data.appointmentDate || '',
      data.appointmentTime || '',
      JSON.stringify(data).substring(0, 50000)
    ]);
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

3. **Deploy → New deployment → Web app**  
   - Execute as: **Me**  
   - Who has access: **Anyone**  
4. Copy the Web App URL (`https://script.google.com/macros/s/.../exec`)

## 3. Put URL in the app

Edit `public/index.html` → find `PARIVAR_DEPLOY_CONFIG` and set:

```javascript
const PARIVAR_DEPLOY_CONFIG = {
  apiBase: '',
  sheetsWebhook: 'https://script.google.com/macros/s/YOUR_ID/exec'
};
```

Redeploy the static site. Leads and “Calculate” events will append to your Sheet (browser uses `no-cors` so the request is fire-and-forget).

## Privacy

- Only send data the user has entered and consented to (mobile form / calculate).  
- Do not put passwords or full document payloads into Sheets.  
- Prefer the backend API for multi-user production data.
