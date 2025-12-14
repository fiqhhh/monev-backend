// server-api/services/api/monev-api.js

const axios = require("axios");
const { MONEM_URL } = require("../../config/config"); 

// --- KONFIGURASI CONSTANT ---
const BASE_SALARY = 5396761; // Gaji Pokok (Bisa diset di .env atau didapat dari API jika ada)

// Default Hari Libur (Minggu=0, Sabtu=6) - Ini bisa di-override
const DEFAULT_EXCLUDE_DAYS = [0, 6]; 

// --- BASE REQUEST HELPER ---
async function monevGet(path, token) {
  try {
    const res = await axios.get(MONEM_URL + path, {
      headers: {
        'Authorization': `Bearer ${token}`, // Token dari Parameter Header
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    return res.data;
  } catch (err) {
    if (err.response && err.response.status === 401) throw new Error("TOKEN_EXPIRED");
    throw err;
  }
}

async function monevPost(path, body, token) {
  try {
    const res = await axios.post(MONEM_URL + path, body, {
      headers: {
        'Authorization': `Bearer ${token}`, 
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    return res.data;
  } catch (err) {
    if (err.response && err.response.status === 401) throw new Error("TOKEN_EXPIRED");
    throw err;
  }
}

// [BARU] Helper untuk mendapatkan data dasar peserta secara dinamis
async function getParticipantInfo(token) {
    const profile = await monevGet('/api/users/me', token);
    const data = profile.data;
    if (!data || !data.id || !data.internship_start_date) {
        throw new Error("Gagal mendapatkan data peserta (ID atau Start Date hilang).");
    }
    return {
        id: data.id,
        startDate: data.internship_start_date // "2025-10-20T..."
    };
}

// --- BASIC FEATURES ---

async function todaySubmitted(token) {
  const today = new Date().toISOString().slice(0, 10);
  const data = await monevGet(`/api/attendances?start_date=${today}&end_date=${today}`, token);
  const list = data.data || [];
  return list.length > 0 && (list[0].approval_status === "SUBMITTED" || list[0].approval_status === "APPROVED");
}

async function submitDailyLog(logData, token) {
    return await monevPost('/api/daily-logs', logData, token);
}

// --- ADVANCED FEATURES (SALARY & HISTORY) ---

// Helper: Ambil Data Absensi dalam Range Tertentu
async function getAttendancesRange(start, end, token) {
    // Ambil ID Peserta secara dinamis
    const info = await getParticipantInfo(token);
    const pId = info.id;

    // Fetch data absensi
    const url = `/api/attendances?participant_id=${pId}&start_date=${start}&end_date=${end}`;
    const data = await monevGet(url, token);
    return data?.data || [];
}

// Helper: Logic Cari Hari Bolong (Sekarang Dinamis)
async function findEmptyDaysInRange(startDateStr, endDateStr, token, excludeDays = DEFAULT_EXCLUDE_DAYS) {
  const logs = await getAttendancesRange(startDateStr, endDateStr, token);
  const existingDates = logs.map((x) => x.date);
  const emptyDates = [];
  
  let current = new Date(startDateStr);
  const end = new Date(endDateStr);
  const today = new Date(); 
  today.setHours(0, 0, 0, 0);

  while (current <= end) {
    if (current > today) break; // Jangan cek masa depan

    const dayOfWeek = current.getDay();
    // Skip hari yang ada di array excludeDays
    if (!excludeDays.includes(dayOfWeek)) {
      const dayStr = current.toISOString().slice(0, 10);
      if (!existingDates.includes(dayStr)) {
        emptyDates.push(dayStr);
      }
    }
    current.setDate(current.getDate() + 1);
  }
  return emptyDates;
}

// Feature 1: Analisis Gaji & Hari Bolong (Sekarang Dinamis)
async function getSalaryAnalysis(token, excludeDays = DEFAULT_EXCLUDE_DAYS) {
  const now = new Date();
  
  // [PERUBAHAN]: Ambil Tanggal Mulai Magang secara Dinamis
  const info = await getParticipantInfo(token);
  let currentStart = new Date(info.startDate);
  
  const result = [];
  let index = 1;

  // Loop per periode bulan sampai sekarang
  while (currentStart <= now) {
    // Periode magang biasanya tanggal 20 sampai 19 bulan depannya
    let nextMonth = new Date(currentStart);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setDate(19); 

    const startStr = currentStart.toISOString().slice(0, 10);
    const endStr = nextMonth.toISOString().slice(0, 10);

    // Hitung Total Hari Kerja (Menggunakan excludeDays)
    let totalWorkDays = 0;
    let loopDate = new Date(currentStart);
    const endObj = new Date(nextMonth);
    
    while(loopDate <= endObj) {
        const d = loopDate.getDay();
        // Cek jika hari ini BUKAN hari libur
        if(!excludeDays.includes(d)) totalWorkDays++;
        loopDate.setDate(loopDate.getDate() + 1);
    }

    // Cari Hari Bolong (Panggil helper dengan excludeDays)
    const emptyDates = await findEmptyDaysInRange(startStr, endStr, token, excludeDays);
    const missedCount = emptyDates.length;

    // Hitung Uang
    const dailyRate = totalWorkDays > 0 ? Math.round(BASE_SALARY / totalWorkDays) : 0;
    const deduction = missedCount * dailyRate;
    const estimatedSalary = BASE_SALARY - deduction;

    // Cek apakah ini periode yang sedang berjalan?
    const isCurrent = (now >= currentStart && now <= endObj);

    result.push({
        period_index: index,
        range_text: `${startStr} s.d ${endStr}`,
        start_date: startStr,
        end_date: endStr,
        stats: {
            total_work_days: totalWorkDays,
            missed_days_count: missedCount,
            daily_rate: dailyRate,
            base_salary: BASE_SALARY,
            deduction: deduction,
            estimated_salary: estimatedSalary,
        },
        is_current_period: isCurrent,
        missed_dates_detail: emptyDates
    });

    // Setup next loop (Mulai tgl 20 bulan berikutnya)
    currentStart = new Date(nextMonth);
    currentStart.setDate(20);
    index++;
  }

  return result;
}

// Feature 2: Lihat History Logbook (Filter Bulan & Tahun)
async function getLogbookHistory(token, month, year) {
    // 1. Ambil ID Peserta
    const info = await getParticipantInfo(token);
    const userId = info.id;

    // 2. Tentukan Range Tanggal
    const now = new Date();
    const m = month || (now.getMonth() + 1);
    const y = year || now.getFullYear();

    // Start Date: Tanggal 1 bulan tersebut
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    
    // End Date: Tanggal terakhir bulan tersebut
    const lastDay = new Date(y, m, 0).getDate(); 
    const endDate = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;

    // 3. Request ke API Daily Logs
    const url = `/api/daily-logs?participant_id=${userId}&start_date=${startDate}&end_date=${endDate}`;
    const res = await monevGet(url, token);
    
    return res.data; 
}

module.exports = { 
    // Export Helper
    getParticipantInfo, // <--- Baru, bisa dipakai di fitur lain

    // Export Core Features
    todaySubmitted, 
    submitDailyLog, 
    getSalaryAnalysis, 
    getLogbookHistory 
};