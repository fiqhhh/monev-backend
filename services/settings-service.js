// server-api/services/settings-service.js
const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '../system/settings.json');

// Pastikan file settings.json ada
if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ working_days: { default: [0, 6] } }, null, 2));
}

function readSettings() {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
}

function saveSettings(data) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

// Mengambil hari libur berdasarkan ID user
function getExcludeDays(userId) {
    const settings = readSettings();
    const days = settings.working_days[userId] || settings.working_days.default;
    return days;
}

// Menyimpan hari libur untuk ID user tertentu
function setExcludeDays(userId, daysArray) {
    if (!Array.isArray(daysArray)) return false;
    
    const settings = readSettings();
    // Pastikan array hanya berisi angka 0-6 (Minggu-Sabtu)
    const validDays = daysArray.filter(d => d >= 0 && d <= 6);
    
    settings.working_days[userId] = validDays;
    saveSettings(settings);
    return validDays;
}

module.exports = { getExcludeDays, setExcludeDays };