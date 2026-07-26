require('dotenv').config();

const express = require('express');
const http = require('http');
const { initBot, getBotInstance } = require('./bot/telegramBot');
const { initScraper } = require('./backend/services/scraperService');
const app = require('./backend/app');

let ngrok = null;
let ngrokUrl = null;

const PORT = Number(process.env.PORT) || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const USE_TUNNEL =
  process.env.USE_TUNNEL === '1' ||
  process.env.USE_TUNNEL === 'true' ||
  process.argv.includes('--tunnel');

let currentTunnel = null;
let tunnelReconnectTimeout = null;

async function openTunnel() {
  console.log('🌐 [tünel] HTTPS tüneli açılıyor...');
  
  // Close existing tunnel if any
  if (currentTunnel) {
    try {
      currentTunnel.close();
    } catch (e) {}
    currentTunnel = null;
  }
  
  // Clear any pending reconnect
  if (tunnelReconnectTimeout) {
    clearTimeout(tunnelReconnectTimeout);
    tunnelReconnectTimeout = null;
  }
  
  // Use localtunnel with auto-reconnect
  try {
    const localtunnel = require('localtunnel');
    const tunnel = await localtunnel({
      port: PORT,
      subdomain: process.env.TUNNEL_SUBDOMAIN || `auto-moldova-${Date.now().toString().slice(-6)}`,
      allow_invalid_cert: true,
    });

    currentTunnel = tunnel;
    
    // Setup tunnel event handlers with auto-reconnect
    tunnel.on('url', (url) => {
      console.log(`✅ [tünel] Açıldı! HTTPS URL: ${url}`);
    });

    tunnel.on('error', (err) => {
      console.error('❌ [tünel] Hata:', err.message);
      console.log('🔄 [tünel] 10 saniye sonra yeniden bağlanmayı deniyorum...');
      
      // Schedule reconnect
      tunnelReconnectTimeout = setTimeout(async () => {
        try {
          await openTunnel();
        } catch (e) {
          console.error('💥 [tünel] Yeniden bağlanma başarısız:', e.message);
        }
      }, 10000);
    });

    tunnel.on('close', () => {
      console.log('⚠️  [tünel] Bağlantı koptu. 5 saniye sonra yeniden bağlanılıyor...');
      
      // Schedule reconnect
      tunnelReconnectTimeout = setTimeout(async () => {
        try {
          await openTunnel();
        } catch (e) {
          console.error('💥 [tünel] Yeniden bağlanma başarısız:', e.message);
        }
      }, 5000);
    });

    return { url: tunnel.url, tunnel };
  } catch (err) {
    console.error('❌ [tünel] Tünel açılamadı:', err.message);
    console.error('   Manuel: npx localtunnel --port 3000');
    throw err;
  }
}

async function startApp() {
  if (!BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN .env içinde bulunamadı!');
    process.exit(1);
  }

  // ===== (Opsiyonel) Tünel ile HTTPS URL =====
  let tunnelUrl = null;
  if (USE_TUNNEL) {
    try {
      const t = await openTunnel();
      tunnelUrl = t.url;
      process.env.WEBAPP_URL = tunnelUrl;
      const cfg = require('./config/default');
      cfg.telegram.webAppUrl = tunnelUrl;
      console.log('');
      console.log('='.repeat(62));
      console.log(' 🎯  TELEGRAM WEBAPP / MINI APP İÇİN HTTPS URL HAZIR:');
      console.log(`   👉  ${tunnelUrl}`);
      console.log('='.repeat(62));
      console.log('');
      console.log(' 📝  BOTA YÜKLEME ADIMLARI:');
      console.log('   1. Telegramda @BotFather botunu aç');
      console.log('   2. /mybots  ->  senin botunu seç  ->  Bot Settings');
      console.log('   3. "Menu Button"  ->  "Configure menu button"');
      console.log('   4. Buton metni: "🚗 Автокаталог"');
      console.log(`   5. URL yapıştır:  ${tunnelUrl}`);
      console.log('');
      console.log('   Alternatif (butonsuz test): /start yazın çıkan inline butona tıkla!');
      console.log('');
    } catch (tunnelErr) {
      console.warn('⚠️  HTTPS tünel açılamadı, localhost ile devam ediliyor (Mini App tarayıcıda çalışır, Telegram içi açılmaz):');
      console.warn('   Hata: ' + tunnelErr.message);
    }
  } else {
    console.log('💡 İpucu: HTTPS tüneli (Mini App için) otomatik açmak için:');
    console.log('   npm run tunnel   (VEYA)   npm start -- --tunnel');
    console.log('');
  }

  // ===== Scraper Service =====
  try {
    initScraper();
    console.log('✅ Scraper servisi başlatıldı (Puppeteer + Cron).');
  } catch (scraperErr) {
    console.error('❌ Scraper servisi hatası:', scraperErr.message);
    console.warn('⚠️  Scraper çalışmasa bile bot ve sunucu çalışmaya devam edecek.');
  }

  // ===== Telegram Bot =====
  try {
    await initBot();
    console.log('✅ Telegram Bot çalışıyor.');
    const bot = getBotInstance();
    if (bot && tunnelUrl) {
      try {
        await bot.setChatMenuButton({
          menu_button: {
            type: 'web_app',
            text: '🚗 Автокаталог',
            web_app: { url: tunnelUrl },
          },
        }).catch(() => {});
        console.log('✅ Bot menü butonu otomatik olarak güncellendi (🚗 Автокаталог).');
      } catch (_) {}
    }
  } catch (botErr) {
    console.error('❌ Telegram Bot hatası:', botErr.message);
    console.warn('⚠️  Bot açılamasa bile HTTP/WebApp sunucusu çalışmaya devam edecek.');
  }

  // ===== HTTP Server =====
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log(`🚀 Yerel HTTP sunucu:  http://localhost:${PORT}`);
  console.log(`   API sağlık:          http://localhost:${PORT}/api/health`);
  console.log(`   WebApp (tarayıcı):   ${tunnelUrl || `http://localhost:${PORT}`}`);

  console.log('\n🎉 Hazır! Şimdi Telegram botuna git ve /start yaz 🚗');
}

startApp().catch((err) => {
  console.error('\n💥 Uygulama başlatılamadı:', err);
  process.exit(1);
});
