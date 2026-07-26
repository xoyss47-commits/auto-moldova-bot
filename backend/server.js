const app = require('./app.js');

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`[server] Локальный сервер запущен на порту ${PORT}`);
  console.log(`[server] API: http://localhost:${PORT}/api`);
});

process.on('SIGTERM', () => {
  console.log('[server] Получен сигнал SIGTERM, завершаюсь...');
  server.close(() => {
    console.log('[server] Сервер остановлен.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[server] Получен сигнал SIGINT (Ctrl+C), завершаюсь...');
  server.close(() => {
    console.log('[server] Сервер остановлен.');
    process.exit(0);
  });
});

module.exports = app;
