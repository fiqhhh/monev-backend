const axios = require("axios");
const { MAGANG_URL, MONEM_URL } = require("../config/config");

// --- Helper Fetch MagangHub (Lengkap dengan Cookie & Header Penyamaran) ---
async function fetchMagang(path, token, cookie) {
    if (!token) throw new Error("Magang Token missing");
    
    const url = `${MAGANG_URL}${path}`;
    console.log(`[DEBUG HTTP] GET ${url}`);

    return axios.get(url, {
        headers: { 
            'Authorization': `Bearer ${token}`,
            'Cookie': cookie, // <--- HEADER KRUSIAL (Session Cookie)
            
            // Header Standar Browser
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'Connection': 'keep-alive',
            
            // Header Penyamaran (Agar tidak terdeteksi bot)
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': 'https://maganghub.kemnaker.go.id/',
            'Origin': 'https://maganghub.kemnaker.go.id',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
    });
}

// --- Helper Fetch Monev ---
async function fetchMonev(path, token) {
    return axios.get(`${MONEM_URL}${path}`, {
        headers: { 
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
    });
}

// --- FUNGSI UTAMA ---
async function getCombinedProfile(monevToken, magangToken, magangCookie) {
    
    // 1. Ambil Data Monev (Basis Utama)
    const monevRes = await fetchMonev('/api/users/me', monevToken);
    const monevData = monevRes.data?.data;
    
    if (!monevData) throw new Error("Gagal mengambil data profil Monev.");

    // 2. Ambil KPI (Optional)
    let kpiData = { kpi: "-", period: "-" };
    try {
        const kpiRes = await fetchMonev(`/api/kpis/latest?participant_id=${monevData.id}`, monevToken);
        if (kpiRes.data?.data) {
            kpiData.kpi = kpiRes.data.data.kpi;
            kpiData.period = `${kpiRes.data.data.start_date} s/d ${kpiRes.data.data.end_date}`;
        }
    } catch (e) {
        // Silent ignore (Mungkin belum ada KPI)
    }

    // 3. Ambil Data MagangHub (Foto & Logo)
    let photoUrl = null;
    let companyLogoUrl = null;

    console.log("--- DEBUG START: GET PROFILE ---");
    
    // Pastikan Token DAN Cookie ada
    if (magangToken && magangCookie) {
        try {
            console.log("2. Fetching User MagangHub...");
            
            // Pass cookie ke fungsi fetch
            const userRes = await fetchMagang('/v1/api/users/me', magangToken, magangCookie);
            console.log("3. Status:", userRes.status);
            
            // Validasi: Apakah response benar-benar JSON?
            const contentType = userRes.headers['content-type'];
            const isHtml = typeof userRes.data === 'string' && userRes.data.includes("<!DOCTYPE html>");

            if (isHtml || (contentType && contentType.includes('text/html'))) {
                console.error("❌ GAGAL: Server masih mengembalikan HTML. Cookie mungkin expired atau tidak valid.");
            } else {
                // Response Sukses JSON
                const userData = userRes.data?.data?.[0];
                
                if (userData) {
                    console.log("✅ User Data Ditemukan!");
                    console.log("   📸 Foto URL:", userData.foto);
                    photoUrl = userData.foto;
                    
                    // Ambil Logo Perusahaan
                    const participantId = userData.last_ditetapkan_id_peserta;
                    if (participantId) {
                        try {
                            const progRes = await fetchMagang(`/v1/api/my-program-participants?id_peserta=${participantId}`, magangToken, magangCookie);
                            const progData = progRes.data?.data?.[0];
                            if (progData) {
                                companyLogoUrl = progData.perusahaan?.logo;
                                console.log("   🏢 Logo Perusahaan Ditemukan.");
                            }
                        } catch (errLogo) {
                            console.warn("x Gagal ambil logo:", errLogo.message);
                        }
                    }
                } else {
                    console.warn("x JSON valid, tapi array data user kosong.");
                }
            }

        } catch (e) {
            console.error("!!! ERROR FETCH MAGANGHUB !!!");
            console.error("   Message:", e.message);
            if(e.response) console.log("   Status:", e.response.status);
        }
    } else {
        console.warn("!!! Header 'x-magang-token' atau 'x-magang-cookie' hilang/kosong !!!");
        console.warn("   Pastikan login ulang dan copy header dengan benar.");
    }
    console.log("--- DEBUG END ---");

    // 4. Return Data Gabungan
    return {
        name: monevData.name,
        email: monevData.email,
        phone: monevData.phone_number,
        
        photo: photoUrl || "https://via.placeholder.com/150", 
        companyLogo: companyLogoUrl,
        
        company: monevData.internship_company,
        
        // [PENTING] Ditambahkan untuk fitur Salary Analysis
        companyRegency: monevData.internship_company_regency_name, 
        
        jobRole: monevData.job_role,
        mentor: monevData.mentor_name,
        startDate: monevData.internship_start_date,
        endDate: monevData.internship_end_date,
        batch: monevData.internship_batch_name,
        
        kpi: kpiData.kpi,
        kpiPeriod: kpiData.period
    };
}

module.exports = { getCombinedProfile };