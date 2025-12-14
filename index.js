require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

// --- Imports Services ---
const { loginMagangHub } = require('./services/sso-login');
const { getMonevToken } = require('./services/get-monev-token'); 

// Update: Import semua fungsi, termasuk helper getParticipantInfo
const { 
    todaySubmitted, 
    submitDailyLog, 
    getSalaryAnalysis,
    getLogbookHistory,
    getParticipantInfo // <--- Import helper untuk ambil ID peserta
} = require('./services/api/monev-api'); 

const { summarizeLogbook } = require('./utils/llm'); 
const { getCombinedProfile } = require('./services/profile-service');
const { getExcludeDays, setExcludeDays } = require('./services/settings-service'); // <--- Import Service Setting Baru

const app = express();
app.use(cors());
app.use(express.json());

// --- MIDDLEWARE ---
const requireToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ message: 'No Token' });
    
    // Format: "Bearer <token>"
    const token = authHeader.split(' ')[1]; 
    if (!token) return res.status(401).json({ message: 'Invalid Token Format' });
    
    req.userToken = token; 
    next();
};

// [BARU] MIDDLEWARE: Mengambil ID Peserta & Hari Libur dari Settings
const requireParticipant = async (req, res, next) => {
    // Pastikan token sudah ada dari requireToken
    if (!req.userToken) return res.status(401).json({ message: 'Token missing in requireParticipant' });

    try {
        // Panggil helper untuk mendapatkan ID peserta
        const info = await getParticipantInfo(req.userToken); //
        req.participantId = info.id; // Simpan ID peserta
        
        // Ambil hari libur dari file settings berdasarkan ID
        req.excludeDays = getExcludeDays(info.id); 
        next();
    } catch (e) {
        // Jika token valid tapi gagal fetch ID, kemungkinan token expired atau API Monev down
        res.status(401).json({ message: 'Failed to verify token or fetch participant info. Please login again.', error: e.message });
    }
}
// -----------------------------------------------------------

// --- HELPER (Legacy) ---
async function getUserMonevProfile(token) {
    try {
        const response = await axios.get('https://monev.maganghub.kemnaker.go.id/api/users/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        return response.data.data; 
    } catch (error) { return null; }
}

// --- ENDPOINTS ---

// 1. Login (SSO -> Puppeteer -> Return Tokens)
app.post('/api/login', async (req, res) => {
    req.setTimeout(120000); 
    try {
        const { username, password } = req.body;
        const ssoResult = await loginMagangHub(username, password);
        const monevTokenResult = await getMonevToken(ssoResult.jar); 
        
        res.json({ 
            status: 'success', 
            accessToken: monevTokenResult.accessToken, 
            magangToken: ssoResult.tokens.access_token, 
            magangCookie: ssoResult.cookieString
        });
    } catch (error) { 
        console.error("Login Error:", error.message);
        res.status(401).json({ status: 'error', message: error.message }); 
    }
});

// 2. Get Profile (Gabungan Monev + Foto/Logo MagangHub)
app.get('/api/profile', requireToken, async (req, res) => {
    try {
        const magangToken = req.headers['x-magang-token'];
        const magangCookie = req.headers['x-magang-cookie'];
        const profile = await getCombinedProfile(req.userToken, magangToken, magangCookie);
        res.json({ status: 'success', data: profile });
    } catch (error) { 
        res.status(500).json({ message: error.message }); 
    }
});

// 3. Dashboard Check (Apakah hari ini sudah isi?)
app.get('/api/dashboard', requireToken, async (req, res) => {
    try {
        const isSubmitted = await todaySubmitted(req.userToken);
        res.json({ status: 'success', data: { today_submitted: isSubmitted } });
    } catch (error) { 
        res.status(500).json({ message: error.message }); 
    }
});

// 4. Salary Analysis & Tanggal Bolong (Menerima excludeDays dari Middleware)
app.get('/api/salary-analysis', requireToken, requireParticipant, async (req, res) => {
    try {
        // Mengirim excludeDays (hari libur user) dari middleware ke fungsi analisis
        const analysis = await getSalaryAnalysis(req.userToken, req.excludeDays); //
        res.json({ status: 'success', data: analysis });
    } catch (error) {
        console.error("Salary Analysis Error:", error.message);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// 5. History Logbook (Filter by Month/Year)
app.get('/api/history', requireToken, async (req, res) => {
    try {
        const { month, year } = req.query; 
        const history = await getLogbookHistory(req.userToken, month, year);
        
        res.json({ 
            status: 'success', 
            count: history.length,
            data: history 
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// 6. Generate Logbook dengan AI
app.post('/api/preview', async (req, res) => {
    try {
        const { rawText } = req.body;
        const draft = await summarizeLogbook(rawText);
        res.json({ status: 'success', draft });
    } catch (error) { 
        res.status(500).json({ status: 'error', message: error.message }); 
    }
});

// 7. Submit Final Logbook
app.post('/api/submit-final', requireToken, async (req, res) => {
    try {
        const { finalLog } = req.body; 
        const result = await submitDailyLog(finalLog, req.userToken);
        res.json({ status: 'success', result });
    } catch (error) { 
        res.status(500).json({ status: 'error', message: error.message }); 
    }
});

// 8. Refresh Token (Placeholder)
app.post('/api/refresh-token', async (req, res) => {
    res.status(401).json({ status: 'auth_error', message: 'Silakan login ulang.' });
});

// 9. [BARU] Endpoint Pengaturan Hari Libur (GET)
app.get('/api/settings/work-days', requireToken, requireParticipant, async (req, res) => {
    const dayMap = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    res.json({ 
        status: 'success', 
        exclude_days: req.excludeDays,
        day_names: req.excludeDays.map(d => dayMap[d]),
        description: '0=Minggu, 1=Senin, dst. Ini adalah hari di mana kamu TIDAK mengisi logbook.'
    });
});

// 10. [BARU] Endpoint Pengaturan Hari Libur (POST: Mengubah)
app.post('/api/settings/work-days', requireToken, requireParticipant, async (req, res) => {
    try {
        const { excludeDays } = req.body; // Expects body: { excludeDays: [0, 1] }
        if (!excludeDays || !Array.isArray(excludeDays)) {
            return res.status(400).json({ message: "Body harus berupa array 'excludeDays' [0-6]." });
        }
        
        const newDays = setExcludeDays(req.participantId, excludeDays);
        const dayMap = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        
        res.json({ 
            status: 'success', 
            message: 'Hari libur berhasil diperbarui.',
            exclude_days: newDays,
            day_names: newDays.map(d => dayMap[d])
        });

    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});


// --- SERVER START ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server Ready at http://localhost:${PORT} 🚀`);
});