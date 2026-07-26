# 🚗 Автокаталог Молдова - Telegram Mini App

## 📋 Hızlı Başlangıç

### Gereksinimler
- Node.js 18+
- npm veya yarn
- Telegram Bot Token (@BotFather'dan alınır)

### Kurulum

```bash
# Bağımlılıkları yükle
npm install

# .env dosyası oluştur
cp .env.example .env
# .env dosyasını düzenle ve TELEGRAM_BOT_TOKEN ekle

# Uygulamayı başlat
npm run tunnel
```

## 🔧 KALICI ÇÖZÜM - 503 Tunnel Hatası

### Sorun:
Localtunnel ücretsiz servis olduğu için sık sık 503 hatası veriyor.

### Çözüm 1: Vercel Deployment (Ücretsiz, Kalıcı)

1. **Vercel hesabı oluştur:** https://vercel.com
2. **Projeyi yükle:**
   ```bash
   npm install -g vercel
   vercel login
   vercel
   ```
3. **Environment Variables ekle:**
   - Vercel dashboard → Settings → Environment Variables
   - `TELEGRAM_BOT_TOKEN` = bot token'ınız
   - `MANAGER_CONTACT` = @manager_username

4. **URL'yi al:** `https://your-project.vercel.app`

5. **BotFather'da güncelle:**
   - `/mybots` → Bot Settings → Menu Button
   - URL: `https://your-project.vercel.app`

### Çözüm 2: Ngrok (Daha Stabil)

```bash
# Ngrok'u indir: https://ngrok.com/download
# Ngrok token al: https://dashboard.ngrok.com/get-started/your-authtoken

# Ngrok'u başlat
ngrok http 3000

# Çıkan HTTPS URL'yi kopyala ve BotFather'da güncelle
```

### Çözüm 3: Railway.app (Ücretsiz Hosting)

```bash
# Railway CLI'yi yükle
npm install -g @railway/cli

# Giriş yap
railway login

# Projeyi başlat
railway up

# URL'yi al ve BotFather'da güncelle
```

## 🕷️ Scraper Durumu

### Mevcut Durum:
- ✅ Puppeteer + Stealth plugin kurulu
- ✅ bid.cars sitesinden veri çekme denemesi yapılıyor
- ✅ Site engelleyince otomatik olarak demo data gösteriliyor
- ✅ Cache sistemi aktif (30 saniye TTL)
- ✅ Cron job'lar çalışıyor (her dakika fiyat güncelleme)

### Gerçek Veri Çekmek İçin:
bid.cars sitesi bot koruması kullandığı için, gerçek veri çekmek için:
1. Proxy servisi kullanın (Bright Data, ScraperAPI vb.)
2. Veya API endpoint'lerini doğrudan çağırın
3. Veya siteye manuel olarak veri girin

## 📁 Proje Yapısı

```
telegram bot/
├── backend/
│   ├── services/
│   │   ├── scraperService.js  # Puppeteer scraper
│   │   └── calculatorService.js  # Moldova fiyat hesaplama
│   ├── routes/
│   │   └── api.js  # API endpoints
│   └── app.js  # Express server
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   └── pages/Home.tsx  # Mini App UI
│   └── dist/  # Build edilmiş frontend
├── bot/
│   └── telegramBot.js  # Telegram bot
├── config/
│   └── default.js  # Ayarlar
├── index.js  # Ana entry point
└── package.json
```

## 🚀 Çalışan Servisler

- **HTTP Server:** http://localhost:3000
- **Telegram Bot:** Aktif
- **Scraper:** Puppeteer + Cron (her 10 dakikada full scrape, her dakika fiyat güncelleme)
- **Cache:** In-memory (30 saniye TTL)

## 📝 Notlar

- Mini App Telegram içinde HTTPS URL gerektirir
- Localtunnel ücretsiz ama kararsız
- Vercel/Railway ücretsiz ve kalıcı HTTPS sağlar
- Scraper 403/engelleme durumunda demo data gösterir

## 🐛 Sorun Giderme

### 503 Tunnel Unavailable:
→ Vercel veya Ngrok kullanın (yukarıya bakın)

### "Ничего не найдено":
→ Scraper siteyi tespit ediyor, demo data gösteriliyor
→ Gerçek veri için proxy veya API kullanın

### Bot çalışmıyor:
→ TELEGRAM_BOT_TOKEN'ı kontrol edin
→ Internet bağlantısını kontrol edin

## 📞 İletişim

Manager: @Whix47