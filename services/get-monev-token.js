// server-api/services/get-monev-token.js

const puppeteer = require("puppeteer");
const { CHROME_HEADERS } = require("../config/config"); 

async function getMonevToken(jar) {
  console.log("2️⃣  Memulai Puppeteer (Stabil) untuk mengambil Token Monev...");
  
  const browser = await puppeteer.launch({
    // 'new' kadang bermasalah di versi lama, kita pakai 'true' atau 'new' tergantung versi. 
    // Kalau masih error, ganti jadi: headless: true
    headless: "new", 
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage", // Wajib buat server/docker
      "--disable-gpu",           // Matikan GPU (hemat ram)
      // "--single-process",     <-- INI BIANG KEROKNYA (HAPUS)
      // "--no-zygote",          <-- INI JUGA BIKIN TIDAK STABIL (HAPUS)
    ]
  });

  try {
    const page = await browser.newPage();
    
    // --- TETAP PAKAI INI BIAR RINGAN (Blokir Gambar/Font) ---
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
            req.abort(); 
        } else {
            req.continue();
        }
    });
    // --------------------------------------------------------

    await page.setUserAgent(CHROME_HEADERS['User-Agent']);

    // Transfer Cookie
    const cookies = await jar.getCookies("https://account.kemnaker.go.id"); 
    const pageCookies = cookies.map(c => ({
        name: c.key,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite || 'Lax',
        expires: (c.expires && c.expires !== 'Infinity') ? new Date(c.expires).getTime() / 1000 : undefined
    }));
    
    await page.setCookie(...pageCookies);

    console.log("   - Mengakses Monev/login...");
    
    // Pakai networkidle2 biar lebih pasti loading-nya selesai (sedikit lebih lama tapi aman)
    await page.goto("https://monev.maganghub.kemnaker.go.id/login", {
      waitUntil: "networkidle2", 
      timeout: 60000 
    });

    // Cek tombol login (Defensive)
    try {
        const loginBtn = await page.$('a[href*="account.kemnaker.go.id"]');
        if (loginBtn) {
            console.log("   - Klik tombol Masuk...");
            await Promise.all([
                loginBtn.click(),
                page.waitForNavigation({ waitUntil: "networkidle2" })
            ]);
        }
    } catch (e) {
        // Ignore
    }

    await page.waitForFunction(
      () => document.cookie.includes("accessToken"),
      { timeout: 40000 }
    );

    const finalCookies = await page.cookies();
    const accessCookie = finalCookies.find((c) => c.name === "accessToken");

    if (!accessCookie) {
      throw new Error("Token tidak ditemukan di cookie.");
    }

    console.log("🎉 SUKSES! Access Token Monev didapatkan.");
    return { accessToken: accessCookie.value };

  } catch (err) {
    console.error("❌ Puppeteer error:", err.message);
    throw new Error(`Gagal sesi Monev: ${err.message}`);
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { getMonevToken };