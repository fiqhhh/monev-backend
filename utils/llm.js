require("dotenv").config()
const axios = require("axios")

const BLOCKED = [
  "Kevin","Nadira","Bhumi","MagangHub","USGS","ASF",
  "Geosquare","Figma","Docker","React","Python","Kemnaker"
]

function sanitizeForbidden(text) {
  let out = text
  for (const word of BLOCKED) {
    const regex = new RegExp(word, "gi")
    out = out.replace(regex, "[redacted]")
  }
  return out
}

function extractJson(text) {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) } catch { return null }
}

function simpleFallbackParse(text) {
  const cleanText = text.trim()

  let parts = cleanText.split(/\n+/).map(t => t.trim()).filter(Boolean)

  if (parts.length < 2) {
    parts = cleanText.split(/\.\s+/).map(t => t.trim()).filter(Boolean)
  }

  const act = parts[0] || cleanText
  
  const lesson = parts[1] || "Saya belajar bagaimana mengelola tugas ini dengan lebih efisien dan teliti."
  
  const obs = parts[2] || "Tidak terdapat kendala yang signifikan dalam pengerjaan tugas ini."

  let finalActivity = act
  if (parts.length > 3) {
    finalActivity += " " + parts.slice(3).join(" ")
  }

  return {
    activity_log: finalActivity,
    lesson_learned: lesson,
    obstacles: obs
  }
}

function ensureMinLength(obj) {
  const pad = (t) => {
    if (!t) t = ""
    if (t.length >= 100) return t
    const filler = " Penjelasan tambahan ditambahkan agar memenuhi batas minimal panjang penulisan sesuai ketentuan."
    return t + filler
  }

  return {
    activity_log: pad(obj.activity_log),
    lesson_learned: pad(obj.lesson_learned),
    obstacles: pad(obj.obstacles)
  }
}

async function callGroq(prompt) {
  const url = "https://api.groq.com/openai/v1/chat/completions"

  const body = {
    model: "llama-3.1-8b-instant",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    max_tokens: 1800
  }

  const headers = {
    Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    "Content-Type": "application/json"
  }

  for (let i = 1; i <= 3; i++) {
    try {
      const res = await axios.post(url, body, { headers, timeout: 30000 })
      return res.data
    } catch (err) {
      console.error(`[Groq] attempt ${i} failed:`, err?.response?.data || err.message)
      if (i === 3) throw err
      await new Promise(r => setTimeout(r, 400 * i))
    }
  }
}

async function summarizeLogbook(text) {
  const clean = sanitizeForbidden(text)

  const fewShot = `
Berikut adalah contoh gaya penulisan logbook yang WAJIB kamu tiru:

Contoh 1:
activity_log:
"Hari ini saya melanjutkan pengkondisian status pengguna untuk membedakan akses fitur pada beberapa modul. Saya juga memperbaiki alur pencarian lokasi agar hasil yang dipilih dapat digunakan dengan benar oleh fitur lainnya. Penyesuaian dilakukan pada struktur data dan cara modul membaca informasi lokasi."

lesson_learned:
"Saya mempelajari cara mengatur pembatasan fitur berdasarkan status pengguna serta memahami hubungan antar modul saat menggunakan data lokasi. Pengetahuan ini membantu saya menyusun alur kerja yang lebih konsisten."

obstacles:
"Tidak ada kendala signifikan. Hanya dibutuhkan beberapa penyesuaian kecil pada struktur data agar integrasinya berjalan stabil."

Contoh 2:
activity_log:
"Hari ini saya melakukan penyempurnaan tampilan pada salah satu modul dengan menyesuaikan ulang struktur dan penempatan komponen agar informasi lebih mudah dipahami. Saya juga mulai mengerjakan pengaturan status pengguna agar alur penggunaan fitur menjadi lebih jelas."

lesson_learned:
"Saya mempelajari cara menata ulang tampilan agar lebih jelas serta memahami bagaimana status pengguna memengaruhi alur fitur di dalam aplikasi."

obstacles:
"Tidak terdapat kendala berarti. Perubahan berjalan lancar dengan beberapa penyesuaian kecil."
`

  const prompt = `
TUGAS:
Ubah teks berikut menjadi logbook magang dengan aturan:
1. activity_log harus mulai dengan "Hari ini saya".
2. Setiap bagian minimal 100 karakter.
3. Tidak boleh menyebut nama orang, institusi, aplikasi, framework, atau merk apapun.
4. Gaya harus mengikuti contoh few-shot di atas.
5. Tulis natural, formal, rapi, tidak seperti AI.
6. Output wajib dalam format JSON valid:
{
  "activity_log": "...",
  "lesson_learned": "...",
  "obstacles": "..."
}

Contoh gaya penulisan:
${fewShot}

Teks pengguna:
"""${clean}"""
`

  try {
    const data = await callGroq(prompt)

    const raw =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.text ||
      ""

    console.log("[DEBUG RAW]:", raw)

    let parsed = null

    try { parsed = JSON.parse(raw) } catch { parsed = extractJson(raw) }

    if (!parsed) throw new Error("response bukan JSON")

    return ensureMinLength(parsed)

  } catch (err) {
    console.error("[Groq] final error:", err?.response?.data || err.message)
    console.warn("[Groq] fallback parser dipakai.")
    const basic = simpleFallbackParse(text)
    return ensureMinLength(basic)
  }
}

module.exports = { summarizeLogbook }