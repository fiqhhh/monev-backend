# Gunakan Node.js versi 18
FROM node:18

# 1. Install "Bahan Bakar" buat Google Chrome (Puppeteer)
# Ini wajib biar Chrome bisa jalan di server Linux (Hugging Face)
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libnss3 \
    libgbm1 \
    && rm -rf /var/lib/apt/lists/*

# 2. Siapkan Folder Aplikasi
WORKDIR /app

# 3. Copy file package.json dan install
COPY package*.json ./
RUN npm install

# 4. Copy semua kodingan kamu
COPY . .

# 5. Hugging Face jalan di port 7860 (Wajib setting ini)
ENV PORT=7860
EXPOSE 7860

# 6. Jalankan Aplikasi
CMD ["node", "index.js"]