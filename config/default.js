require('dotenv').config();

const config = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    polling: true,
    managerContact: process.env.MANAGER_CONTACT || '@manager_username',
    webAppUrl: process.env.WEBAPP_URL || `http://localhost:${process.env.PORT || 3000}`,
  },

  scraper: {
    timeout: 30000,
    maxResults: 8,
    userAgents: [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    ],
    baseUrl: 'https://bid.cars',
    searchEndpoint: '/search',
  },

  calculator: {
    logisticsCostUsd: 2200,
    commissionRate: 0.05,
    minCommissionUsd: 500,
    currentYear: new Date().getFullYear(),
    customs: {
      ageBrackets: [
        { maxAge: 3, ratePerCc: 0.15 },
        { maxAge: 5, ratePerCc: 0.35 },
        { maxAge: 7, ratePerCc: 0.65 },
        { maxAge: 10, ratePerCc: 1.10 },
        { maxAge: 15, ratePerCc: 1.80 },
        { maxAge: Infinity, ratePerCc: 2.50 },
      ],
      electricRatePerCc: 0.08,
      hybridMultiplier: 0.7,
    },
  },

  fuelTypes: {
    BENZIN: 'Бензин',
    DIESEL: 'Дизель',
    HYBRID: 'Гибрид',
    ELECTRIC: 'Электро',
    GAS: 'Газ',
  },

  locations: [
    'США, Делавэр',
    'США, Нью-Джерси',
    'США, Флорида',
    'США, Техас',
    'США, Калифорния',
    'Германия, Гамбург',
    'Нидерланды, Роттердам',
    'Польша, Гданьск',
  ],
};

module.exports = config;
