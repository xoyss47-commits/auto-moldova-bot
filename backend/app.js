const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

const apiRoutes = require('./routes/api.js');

dotenv.config();

const app = express();
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');

app.set('trust proxy', true);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, _res, next) => {
  if (req.method !== 'OPTIONS' && req.path.startsWith('/api')) {
    console.log(`[http] ${req.method} ${req.path} - ${new Date().toISOString()}`);
  }
  next();
});

app.use('/api', apiRoutes);

app.use(express.static(FRONTEND_DIST, {
  maxAge: '1h',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

app.get(/^(?!\/api).*/, (_req, res) => {
  const indexPath = path.join(FRONTEND_DIST, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(500).json({
        success: false,
        error: 'Frontend henüz derlenmemiş. Lütfen npm run build komutunu çalıştırın.',
      });
    }
  });
});

app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({
      success: false,
      error: `API метод не найден: ${req.path}`,
    });
  }
  res.status(404).json({ success: false, error: 'Страница не найдена' });
});

app.use((error, req, res, _next) => {
  console.error('[express] Ошибка middleware:', error.message);
  console.error(error.stack);
  res.status(500).json({
    success: false,
    error: 'Внутренняя ошибка сервера',
    detail: process.env.NODE_ENV === 'development' ? error.message : undefined,
  });
});

module.exports = app;
