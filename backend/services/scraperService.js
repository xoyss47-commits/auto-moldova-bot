const { RealBrowser } = require('puppeteer-real-browser');
const cron = require('node-cron');
const config = require('../../config/default');
const calculatorService = require('./calculatorService');

// ==================== CACHE & STATE ====================
let vehicleCache = new Map();
let cacheTimestamp = Date.now();
const CACHE_TTL_MS = 30 * 1000;
let isScraping = false;
let lastScrapeResult = [];

// ==================== HELPERS ====================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateVin() {
  const chars = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
  let vin = '';
  for (let i = 0; i < 17; i++) {
    vin += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return vin;
}

function parseNumber(text) {
  if (!text) return 0;
  const cleaned = String(text).replace(/[^0-9]/g, '');
  return cleaned ? parseInt(cleaned, 10) : 0;
}

function parseFloatNumber(text) {
  if (!text) return 0;
  const cleaned = String(text).replace(/[^0-9.,]/g, '').replace(',', '.');
  const parts = cleaned.split('.');
  if (parts.length > 2) return parseFloat(parts.join('')) || 0;
  return parseFloat(cleaned) || 0;
}

function normalizeFuelType(raw) {
  const text = String(raw || '').toLowerCase();
  if (text.includes('электро') || text.includes('electric') || text.includes('ev')) return 'Электро';
  if (text.includes('гибрид') || text.includes('hybrid')) return 'Гибрид';
  if (text.includes('дизель') || text.includes('diesel')) return 'Дизель';
  return 'Бензин';
}

function normalizeTransmission(raw) {
  const text = String(raw || '').toLowerCase();
  if (text.includes('автомат') || text.includes('automatic') || text.includes('a/t') || text.includes('amt')) return 'Automatic';
  if (text.includes('механик') || text.includes('manual') || text.includes('m/t')) return 'Manual';
  return '';
}

function normalizeDriveType(raw) {
  const text = String(raw || '').toLowerCase();
  if (text.includes('awd') || text.includes('4wd') || text.includes('полный') || text.includes('4x4')) return 'AWD';
  if (text.includes('fwd') || text.includes('передний') || text.includes('front')) return 'FWD';
  if (text.includes('rwd') || text.includes('задний') || text.includes('rear')) return 'RWD';
  return '';
}

function extractYearFromTitle(title) {
  const match = String(title || '').match(/\b(19|20)\d{2}\b/);
  return match ? parseInt(match[0], 10) : 0;
}

function extractEngineCcFromTitle(title) {
  const text = String(title || '');
  const lMatch = text.match(/(\d+(?:[.,]\d+)?)\s*L/i);
  if (lMatch) {
    const val = parseFloat(lMatch[1].replace(',', '.'));
    return val < 10 ? Math.round(val * 1000) : Math.round(val);
  }
  const ccMatch = text.match(/(\d{3,4})\s*cc/i);
  if (ccMatch) return parseInt(ccMatch[1], 10);
  const vMatch = text.match(/[Vv]\s*(\d)/);
  if (vMatch) return parseInt(vMatch[1], 10) * 1000;
  return 0;
}

function extractMileage(text) {
  const cleaned = String(text || '').replace(/[^0-9]/g, '');
  const num = cleaned ? parseInt(cleaned, 10) : 0;
  if (!num) return { text: 'Уточняется', raw: 0 };
  return { text: `${num.toLocaleString('ru-RU')} км`, raw: num };
}

function extractPrice(text) {
  const cleaned = String(text || '').replace(/[^0-9]/g, '');
  return cleaned ? parseInt(cleaned, 10) : 0;
}

function extractTimeLeft(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  return raw;
}

// ==================== BROWSER SCRAPING ====================
async function getBrowser() {
  const rb = new RealBrowser({
    headless: false,
    connectOverCDP: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1920,1080',
      '--lang=en-US,en;q=0.9',
    ],
  });

  const browser = await rb.start();
  return browser;
}

async function scrapeSearchPage(browser, searchQuery) {
  const page = await browser.newPage();

  await page.setViewport({ width: 1920, height: 1080 });
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  });

  const searchUrl = `${config.scraper.baseUrl}${config.scraper.searchEndpoint}`;
  console.log(`[scraper] Searching: ${searchUrl}?q=${encodeURIComponent(searchQuery)}`);

  await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 45000 });
  await sleep(8000); // Wait for Cloudflare challenge to complete

  // Try to find and use search input
  const inputSelectors = [
    'input[type="text"]',
    'input[placeholder*="Search"]',
    'input[placeholder*="search"]',
    'input[placeholder*="Make"]',
    'input[placeholder*="Model"]',
    'input[name="q"]',
    'input[name="search"]',
    '#search',
    '.search-input',
    '[class*="search"] input',
    '[class*="Search"] input'
  ];

  let searchAttempted = false;
  for (const selector of inputSelectors) {
    try {
      const inputEl = await page.$(selector);
      if (inputEl) {
        await inputEl.click({ clickCount: 3 });
        await sleep(2000);
        await inputEl.type(searchQuery, { delay: 100 });
        await sleep(3000);
        await page.keyboard.press('Enter');
        await sleep(15000); // Wait for search results
        searchAttempted = true;
        console.log(`[scraper] Search input found and used: ${selector}`);
        break;
      }
    } catch (e) {
      // Try next selector
    }
  }

  if (!searchAttempted) {
    console.log('[scraper] No search input found, scraping current page');
  }

  // Scroll to load more content
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await sleep(3000);
  }

  const vehicles = await page.evaluate(() => {
    const results = [];
    
    // Find all links to lot/vehicle pages
    const links = document.querySelectorAll('a[href*="/lot/"], a[href*="/vehicle/"]');
    console.log(`[scraper] Found ${links.length} lot/vehicle links`);
    
    links.forEach(link => {
      const href = link.getAttribute('href') || '';
      const lotIdMatch = href.match(/\/(?:lot|vehicle)\/(\d+)/);
      if (!lotIdMatch) return;
      
      const lotId = lotIdMatch[1];
      const lotIdNum = parseInt(lotId, 10);
      
      // Skip invalid lot IDs (real lot IDs are typically 5+ digits and not 0,1,2)
      if (lotId.length < 5) {
        console.log(`[scraper] Skipping short lot ID: ${lotId}`);
        return;
      }
      
      // Find the card container
      const card = link.closest('div[class*="card"], div[class*="Card"], article, [class*="lot"], [class*="Lot"]') || link.parentElement;
      
      const titleEl = card.querySelector('h2, h3, [class*="title"], [class*="Title"], [class*="name"], [class*="Name"]');
      const title = titleEl ? titleEl.innerText.trim() : link.innerText.trim();
      
      const fullText = card.innerText || '';
      
      const priceEl = card.querySelector('[class*="price"], [class*="Price"], [class*="bid"], [class*="Bid"]');
      const priceText = priceEl ? priceEl.innerText.trim() : '';
      
      const timeEl = card.querySelector('[class*="time"], [class*="Time"], [class*="left"], [class*="Left"]');
      const timeText = timeEl ? timeEl.innerText.trim() : '';
      
      const locationEl = card.querySelector('[class*="location"], [class*="Location"], [class*="yard"], [class*="Yard"]');
      const locationText = locationEl ? locationEl.innerText.trim() : '';
      
      const damageEl = card.querySelector('[class*="damage"], [class*="Damage"]');
      const damageText = damageEl ? damageEl.innerText.trim() : '';
      
      const imgEls = card.querySelectorAll('img');
      const images = [];
      imgEls.forEach(img => {
        const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
        if (src && src.startsWith('http') && !src.includes('svg') && !src.includes('icon')) {
          images.push(src);
        }
      });
      
      console.log(`[scraper] Card: lot=${lotId}, title="${title.substring(0, 50)}", price="${priceText}"`);
      
      if (title || priceText) {
        results.push({
          title,
          lotId,
          priceText,
          timeText,
          locationText,
          damageText,
          images: images.slice(0, 6),
          fullText,
        });
      }
    });
    
    console.log(`[scraper] Extracted ${results.length} valid vehicle cards`);
    return results;
  });

  await page.close();
  return vehicles;
}

async function scrapeVehicleDetail(browser, lotId) {
  const page = await browser.newPage();

  await page.setViewport({ width: 1920, height: 1080 });
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  });

  const detailUrl = `${config.scraper.baseUrl}/lot/${lotId}`;
  console.log(`[scraper] Detail: ${detailUrl}`);

  await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(3000);

  const data = await page.evaluate(() => {
    const getText = (selectors) => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText && el.innerText.trim()) return el.innerText.trim();
      }
      return '';
    };

    const title = getText(['h1', '[class*="title"]', '[class*="Title"]']) || document.title || '';
    const price = getText(['[class*="current-bid"]', '[class*="CurrentBid"]', '[class*="price"]', '[class*="Price"]', '[class*="bid"]']);
    const buyItNow = getText(['[class*="buy-it-now"]', '[class*="BuyItNow"]', '[class*="buyNow"]']);
    const timeLeft = getText(['[class*="time-left"]', '[class*="TimeLeft"]', '[class*="time"]', '[class*="Time"]']);
    const location = getText(['[class*="location"]', '[class*="Location"]', '[class*="yard"]', '[class*="Yard"]']);
    const damage = getText(['[class*="damage"]', '[class*="Damage"]']);
    const engine = getText(['[class*="engine"]', '[class*="Engine"]', '[class*="displacement"]']);
    const transmission = getText(['[class*="transmission"]', '[class*="Transmission"]']);
    const driveType = getText(['[class*="drive"]', '[class*="Drive"]', '[class*="drivetrain"]']);
    const fuel = getText(['[class*="fuel"]', '[class*="Fuel"]']);
    const mileage = getText(['[class*="mileage"]', '[class*="Mileage"]', '[class*="odometer"]']);
    const color = getText(['[class*="color"]', '[class*="Color"]']);
    const vin = getText(['[class*="vin"]', '[class*="VIN"]']) || '';

    const images = [];
    document.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
      if (src && src.startsWith('http') && !src.includes('svg') && !src.includes('icon')) {
        if (src.includes('w_') || src.includes('width')) {
          src = src.replace(/w_\d+/, 'w_1200').replace(/width=\d+/, 'width=1200');
        }
        images.push(src);
      }
    });

    return {
      title,
      price,
      buyItNow,
      timeLeft,
      location,
      damage,
      engine,
      transmission,
      driveType,
      fuel,
      mileage,
      color,
      vin,
      images: [...new Set(images)].slice(0, 12),
    };
  });

  await page.close();
  return data;
}

// ==================== MAIN SCRAPING LOGIC ====================
async function scrapeVehiclesFromBidCars(searchQuery) {
  if (isScraping) {
    console.log('[scraper] Already scraping, returning cached results');
    return lastScrapeResult;
  }

  isScraping = true;
  let browser = null;

  try {
    // Real scraping with Cloudflare bypass
    browser = await getBrowser();
    console.log('[scraper] Real browser launched, attempting scrape...');

    const searchResults = await scrapeSearchPage(browser, searchQuery);
    console.log(`[scraper] Found ${searchResults.length} cards on search page`);

    const vehicles = [];
    const seenLotIds = new Set();

    const validResults = searchResults.filter(card => card.lotId && card.lotId.length >= 5);
    console.log(`[scraper] Valid lot IDs found: ${validResults.length}`);
    
    for (const card of validResults.slice(0, 8)) {
      if (seenLotIds.has(card.lotId)) continue;
      seenLotIds.add(card.lotId);

      try {
        const detail = await scrapeVehicleDetail(browser, card.lotId);
        console.log(`[scraper] Detail scraped for lot ${card.lotId}:`, detail.title || card.title);

        const year = extractYearFromTitle(detail.title || card.title);
        const engineCc = extractEngineCcFromTitle(detail.title || card.title) || parseFloatNumber(detail.engine);
        const fuelType = normalizeFuelType(detail.fuel);
        const transmission = normalizeTransmission(detail.transmission);
        const driveType = normalizeDriveType(detail.driveType);
        const mileageInfo = extractMileage(detail.mileage || card.fullText);
        const currentBidUsd = extractPrice(detail.price || card.priceText);
        const buyItNowUsd = detail.buyItNow ? extractPrice(detail.buyItNow) : 0;
        const timeLeft = extractTimeLeft(detail.timeLeft || card.timeText);
        const location = detail.location || card.locationText || 'США';
        const damage = detail.damage || card.damageText || '';
        const images = detail.images.length > 0 ? detail.images : card.images;
        const vin = detail.vin || card.lotId || generateVin();

        if (!year || year < 1990 || year > new Date().getFullYear() + 1) continue;
        if (!currentBidUsd || currentBidUsd < 1000) continue;

        const vehicle = {
          title: detail.title || card.title || `${year} Vehicle ${card.lotId}`,
          year,
          engineCc: engineCc || 0,
          fuelType,
          transmission,
          driveType,
          currentBidUsd,
          buyItNowUsd: buyItNowUsd || undefined,
          timeLeft,
          location,
          damage,
          mileage: mileageInfo.text,
          mileageRaw: mileageInfo.raw,
          color: detail.color || '',
          vin,
          images: images.length > 0 ? images : [],
          source: 'bid.cars',
          lotId: card.lotId,
        };

        vehicles.push(vehicle);
        vehicleCache.set(vin, vehicle);
      } catch (detailErr) {
        console.warn(`[scraper] Detail scrape failed for lot ${card.lotId}:`, detailErr.message);
      }
    }

    if (vehicles.length > 0) {
      cacheTimestamp = Date.now();
      lastScrapeResult = vehicles;
      console.log(`[scraper] Successfully scraped ${vehicles.length} vehicles with full details`);
      return vehicles;
    }

    // If no vehicles found, return empty array (NO MOCK DATA)
    console.log('[scraper] No vehicles found from real scraping');
    return [];
    
  } catch (error) {
    console.error('[scraper] Real scraping failed:', error.message);
    // Return empty array on error (NO MOCK DATA)
    return [];
  } finally {
    isScraping = false;
    if (browser) {
      try {
        await browser.close();
      } catch (e) {}
    }
  }
}

// ==================== LIVE PRICE UPDATER ====================
async function updateLivePrices() {
  if (isScraping) return;
  if (vehicleCache.size === 0) return;

  console.log('[scraper] Updating live prices...');
  isScraping = true;

  try {
    const browser = await getBrowser();
    const page = await browser.newPage();

    await page.setViewport({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
    });

    const searchUrl = `${config.scraper.baseUrl}${config.scraper.searchEndpoint}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(3000);

    const liveData = await page.evaluate(() => {
      const results = new Map();
      document.querySelectorAll('a[href*="/lot/"], a[href*="/vehicle/"]').forEach(card => {
        const href = card.getAttribute('href') || '';
        const lotIdMatch = href.match(/\/(?:lot|vehicle)\/(\d+)/);
        if (!lotIdMatch) return;

        const lotId = lotIdMatch[1];
        const priceEl = card.querySelector('[class*="price"], [class*="Price"], [class*="bid"], [class*="Bid"]');
        const priceText = priceEl ? priceEl.innerText.trim() : '';
        const timeEl = card.querySelector('[class*="time"], [class*="Time"], [class*="left"], [class*="Left"]');
        const timeText = timeEl ? timeEl.innerText.trim() : '';

        if (priceText || timeText) {
          results.set(lotId, { priceText, timeText });
        }
      });
      return results;
    });

    let updatedCount = 0;
    for (const [vin, vehicle] of vehicleCache) {
      if (liveData.has(vehicle.lotId)) {
        const live = liveData.get(vehicle.lotId);
        const newPrice = extractPrice(live.priceText);
        if (newPrice > 0 && newPrice !== vehicle.currentBidUsd) {
          vehicle.currentBidUsd = newPrice;
          updatedCount++;
        }
        vehicle.timeLeft = live.timeText || vehicle.timeLeft;
      }
    }

    cacheTimestamp = Date.now();
    console.log(`[scraper] Live prices updated: ${updatedCount} vehicles changed`);
  } catch (error) {
    console.error('[scraper] Live price update failed:', error.message);
  } finally {
    isScraping = false;
    if (browser) {
      try {
        await browser.close();
      } catch (e) {}
    }
  }
}

// ==================== PUBLIC API ====================
async function searchVehicles(searchQuery) {
  if (!searchQuery || typeof searchQuery !== 'string') {
    return [];
  }

  const trimmed = searchQuery.trim();
  if (trimmed.length < 2) return [];

  // Return fresh cache if available and not expired
  if (vehicleCache.size > 0 && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    const q = trimmed.toLowerCase();
    const filtered = Array.from(vehicleCache.values()).filter(v => {
      const hay = `${v.title} ${v.brand || ''} ${v.model || ''} ${v.fuelType || ''}`.toLowerCase();
      return hay.includes(q) || q.split(/\s+/).some(word => word.length > 2 && hay.includes(word));
    });

    if (filtered.length > 0) {
      console.log(`[scraper] Returning ${filtered.length} cached results for: ${trimmed}`);
      return filtered.slice(0, config.scraper.maxResults);
    }
  }

  console.log(`[scraper] Cache miss or expired, scraping fresh data for: ${trimmed}`);
  const vehicles = await scrapeVehiclesFromBidCars(trimmed);

  const withCalculations = vehicles.map(vehicle => {
    try {
      const calculation = calculatorService.calculateFinalPrice(
        vehicle.currentBidUsd,
        vehicle.engineCc || 0,
        vehicle.year,
        vehicle.fuelType || 'Бензин'
      );
      return { ...vehicle, ...calculation };
    } catch (calcErr) {
      console.warn('[scraper] Calculation failed for vehicle:', calcErr.message);
      return vehicle;
    }
  });

  return withCalculations.slice(0, config.scraper.maxResults);
}

function getCachedVehicles() {
  return Array.from(vehicleCache.values());
}

function clearCache() {
  vehicleCache.clear();
  cacheTimestamp = Date.now();
  lastScrapeResult = [];
}

// ==================== CRON JOB ====================
function startCronJobs() {
  // Update live prices every 60 seconds
  cron.schedule('* * * * *', () => {
    console.log('[cron] Running live price update job');
    updateLivePrices().catch(err => {
      console.error('[cron] Live price update error:', err.message);
    });
  });

  // Full re-scrape every 10 minutes
  cron.schedule('*/10 * * * *', () => {
    console.log('[cron] Running full re-scrape job');
    clearCache();
    scrapeVehiclesFromBidCars('BMW').then(() => {
      console.log('[cron] Full re-scrape completed');
    }).catch(err => {
      console.error('[cron] Full re-scrape error:', err.message);
    });
  });

  console.log('[cron] Cron jobs started: live prices every 60s, full scrape every 10m');
}

// ==================== INIT ====================
function initScraper() {
  console.log('[scraper] Initializing scraper service...');
  startCronJobs();

  // Initial scrape on startup
  setTimeout(() => {
    scrapeVehiclesFromBidCars('BMW').then(() => {
      console.log('[scraper] Initial scrape completed');
    }).catch(err => {
      console.error('[scraper] Initial scrape failed:', err.message);
    });
  }, 5000);
}

module.exports = {
  searchVehicles,
  getCachedVehicles,
  clearCache,
  initScraper,
  updateLivePrices,
  scrapeVehiclesFromBidCars,
  scrapeVehicleDetail,
  scrapeSearchPage,
};