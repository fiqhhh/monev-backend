// server-api/services/sso-login.js

const axios = require("axios")
const tough = require("tough-cookie")
const { wrapper } = require("axios-cookiejar-support")

const { MAGANG_SSO_URL, CHROME_HEADERS } = require("../config/config")

async function loginMagangHub(username, password) {
  // 1. Siapkan Cookie Jar untuk menampung sesi
  const jar = new tough.CookieJar()
  const client = wrapper(
    axios.create({
      jar,
      withCredentials: true
    })
  )

  console.log("   - Mengambil halaman SSO...")
  // 2. Buka halaman login untuk dapat CSRF Token
  const page = await client.get(MAGANG_SSO_URL, { headers: CHROME_HEADERS })
  const html = page.data
  const csrf = html.match(/name="csrf-token" content="([^"]+)"/)?.[1]

  if (!csrf) throw new Error("Gagal ambil CSRF token")

  console.log("   - Mengirim kredensial...")
  // 3. Post Username & Password
  const loginResp = await client.post(
    "https://account.kemnaker.go.id/auth/login",
    new URLSearchParams({ username, password }),
    {
      headers: {
        ...CHROME_HEADERS,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-CSRF-TOKEN": csrf
      },
      maxRedirects: 0,
      validateStatus: () => true
    }
  )

  // 4. Cek Redirect
  const redirect1 =
    loginResp.data?.data?.redirect_uri || loginResp.headers.location

  if (!redirect1) throw new Error("Login gagal. Tidak ada redirect")
  
  // Fungsi Helper untuk mengikuti rantai redirect
  async function follow(url, depth = 0) {
    if (depth > 10) return url

    const r = await client.get(url, {
      headers: CHROME_HEADERS,
      maxRedirects: 0,
      validateStatus: () => true
    })

    const loc = r.headers.location
    if (!loc) return url

    const next = loc.startsWith("http")
      ? loc
      : new URL(loc, url).toString()

    return follow(next, depth + 1)
  }

  console.log("   - Mengikuti redirect...")
  const finalUrl = await follow(redirect1)

  // 5. Ambil Token dari URL Final
  const access = finalUrl.match(/access_token=([^&]+)/)?.[1]
  const refresh = finalUrl.match(/refresh_token=([^&]+)/)?.[1]

  if (!access || !refresh) {
    throw new Error("Token tidak ditemukan di URL final. Cek ulang kredensial.")
  }

  // --- [FITUR BARU] Ambil Cookie String untuk MagangHub ---
  // Ini bagian penting agar kita bisa akses endpoint profile tanpa dianggap bot/unauthorized
  // Cookie ini berisi 'maganghub_session', 'XSRF-TOKEN', dll.
  const cookieString = await jar.getCookieString("https://maganghub.kemnaker.go.id");
  
  console.log("   - Cookie Session MagangHub berhasil diambil.");
  // --------------------------------------------------------

  const tokens = {
    access_token: decodeURIComponent(access),
    refresh_token: decodeURIComponent(refresh),
    obtained_at: Date.now()
  }

  console.log("   - Login SSO Sukses (Stateless).")
  
  // Return tokens, jar (untuk puppeteer), dan cookieString (untuk header request profile)
  return { tokens, jar, cookieString }
}

module.exports = { loginMagangHub }