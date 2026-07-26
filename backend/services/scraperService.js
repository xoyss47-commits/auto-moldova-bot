const axios = require('axios');
const cheerio = require('cheerio');
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

// ==================== SCRAPER API ====================
async function scrapeWithScraperAPI(url) {
  const apiKey = process.env.SCRAPER_API_KEY;
  if (!apiKey) {
    throw new Error('SCRAPER_API_KEY not configured');
  }

  const encodedUrl = encodeURIComponent(url);
  const apiUrl = `https://api.scraperapi.com?api_key=${apiKey}&url=${encodedUrl}&render=true&premium=true&country=US`;

  console.log(`[scraper] ScraperAPI request: ${url}`);

  try {
    const response = await axios.get(apiUrl, {
      timeout: 60000,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    console.log(`[scraper] ScraperAPI response status: ${response.status}`);
    return response.data;
  } catch (error) {
    console.error('[scraper] ScraperAPI error:', error.message);
    if (error.response) {
      console.error('[scraper] HTTP Status:', error.response.status);
      console.error('[scraper] Response data:', error.response.data?.substring(0, 500));
    }
    throw error;
  }
}

// ==================== BROWSER SCRAPING (FALLBACK) ====================
async function scrapeSearchPageWithCheerio(searchQuery) {
  const searchUrl = `${config.scraper.baseUrl}${config.scraper.searchEndpoint}?q=${encodeURIComponent(searchQuery)}`;
  console.log(`[scraper] Scraping search page: ${searchUrl}`);

  try {
    const html = await scrapeWithScraperAPI(searchUrl);
    const $ = cheerio.load(html);

    const results = [];

    // Find all vehicle cards
    $('a[href*="/lot/"], a[href*="/vehicle/"]').each((index, element) => {
      const href = $(element).attr('href') || '';
      const lotIdMatch = href.match(/\/(?:lot|vehicle)\/(\d+)/);
      if (!lotIdMatch) return;

      const lotId = lotIdMatch[1];
      if (lotId.length < 5) return;

      const card = $(element).closest('div[class*="card"], div[class*="Card"], article, [class*="lot"], [class*="Lot"]') || $(element).parent();

      const titleEl = card.find('h2, h3, [class*="title"], [class*="Title"], [class*="name"], [class*="Name"]').first();
      const title = titleEl.text().trim() || $(element).text().trim();

      const fullText = card.text() || '';

      const priceEl = card.find('[class*="price"], [class*="Price"], [class*="bid"], [class*="Bid"]').first();
      const priceText = priceEl.text().trim();

      const timeEl = card.find('[class*="time"], [class*="Time"], [class*="left"], [class*="Left"]').first();
      const timeText = timeEl.text().trim();

      const locationEl = card.find('[class*="location"], [class*="Location"], [class*="yard"], [class*="Yard"]').first();
      const locationText = locationEl.text().trim();

      const damageEl = card.find('[class*="damage"], [class*="Damage"]').first();
      const damageText = damageEl.text().trim();

      const images = [];
      card.find('img').each((i, img) => {
        const src = $(img).attr('src') || $(img).attr('data-src') || '';
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
  } catch (error) {
    console.error('[scraper] Cheerio scraping failed:', error.message);
    return [];
  }
}

async function scrapeVehicleDetailWithCheerio(lotId) {
  const detailUrl = `${config.scraper.baseUrl}/lot/${lotId}`;
  console.log(`[scraper] Scraping detail: ${detailUrl}`);

  try {
    const html = await scrapeWithScraperAPI(detailUrl);
    const $ = cheerio.load(html);

    const getText = (selectors) => {
      for (const sel of selectors) {
        const text = $(sel).first().text().trim();
        if (text) return text;
      }
      return '';
    };

    const title = getText(['h1', '[class*="title"]', '[class*="Title"]']) || $('title').text() || '';
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
    $('img').each((i, img) => {
      const src = $(img).attr('src') || $(img).attr('data-src') || $(img).attr('data-lazy-src') || '';
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
  } catch (error) {
    console.error(`[scraper] Detail scraping failed for lot ${lotId}:`, error.message);
    return null;
  }
}

// ==================== MAIN SCRAPING LOGIC ====================
async function scrapeVehiclesFromBidCars(searchQuery) {
  if (isScraping) {
    console.log('[scraper] Already scraping, returning cached results');
    return lastScrapeResult;
  }

  isScraping = true;

  try {
    console.log('[scraper] Starting real scrape with ScraperAPI...');

    // Scrape search page
    const searchResults = await scrapeSearchPageWithCheerio(searchQuery);
    console.log(`[scraper] Found ${searchResults.length} cards on search page`);

    if (searchResults.length === 0) {
      console.log('[scraper] No results found from search page');
      return [];
    }

    const vehicles = [];
    const seenLotIds = new Set();

    const validResults = searchResults.filter(card => card.lotId && card.lotId.length >= 5);
    console.log(`[scraper] Valid lot IDs found: ${validResults.length}`);

    for (const card of validResults.slice(0, 8)) {
      if (seenLotIds.has(card.lotId)) continue;
      seenLotIds.add(card.lotId);

      try {
        const detail = await scrapeVehicleDetailWithCheerio(card.lotId);
        if (!detail) continue;

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

    console.log('[scraper] No vehicles found from real scraping');
    return [];
    
  } catch (error) {
    console.error('[scraper] Real scraping failed:', error.message);
    console.error('[scraper] Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
    });
    return [];
  } finally {
    isScraping = false;
  }
}

// ==================== LIVE PRICE UPDATER ====================
async function updateLivePrices() {
  if (isScraping) return;
  if (vehicleCache.size === 0) return;

  console.log('[scraper] Updating live prices...');
  isScraping = true;

  try {
    const searchUrl = `${config.scraper.baseUrl}${config.scraper.searchEndpoint}?q=BMW`;
    const html = await scrapeWithScraperAPI(searchUrl);
    const $ = cheerio.load(html);

    const liveData = new Map();
    $('a[href*="/lot/"], a[href*="/vehicle/"]').each((index, element) => {
      const href = $(element).attr('href') || '';
      const lotIdMatch = href.match(/\/(?:lot|vehicle)\/(\d+)/);
      if (!lotIdMatch) return;

      const lotId = lotIdMatch[1];
      const card = $(element).closest('div[class*="card"], div[class*="Card"], article') || $(element).parent();
      const priceEl = card.find('[class*="price"], [class*="Price"], [class*="bid"], [class*="Bid"]').first();
      const priceText = priceEl.text().trim();
      const timeEl = card.find('[class*="time"], [class*="Time"], [class*="left"], [class*="Left"]').first();
      const timeText = timeEl.text().trim();

      if (priceText || timeText) {
        liveData.set(lotId, { priceText, timeText });
      }
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
  scrapeVehicleDetailWithCheerio,
  scrapeSearchPageWithCheerio,
};