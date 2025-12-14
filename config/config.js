// File: server-api/system/config.js
module.exports = {
  MAGANG_SSO_URL:
    "https://account.kemnaker.go.id/auth?response_type=code&scopes=basic+profile&client=b6c5a166-5cc4-4c72-a521-715075b811af&state=auto&continue=https%253A%252F%252Fmaganghub.kemnaker.go.id%252Fbe%252Fv1%253Faction%253Dauth",

  MONEV_LOGIN_URL: "https://monev.maganghub.kemnaker.go.id/login",

  // URL untuk Monev (API Logbook/Absensi)
  MONEM_URL: "https://monev.maganghub.kemnaker.go.id",
  
  // --- [PERBAIKAN DI SINI] ---
  // Tambahkan '/be' agar request mengarah ke Backend API, bukan Frontend Web
  MAGANG_URL: "https://maganghub.kemnaker.go.id/be", 
  // ---------------------------

  MAGANG_API_BASE: "https://maganghub.kemnaker.go.id/be/v1",

  CHROME_HEADERS: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Cache-Control": "max-age=0"
  },

  TOKENS_FILE: "tokens.json",
  MONEV_FILE: "monev_token.json"
}