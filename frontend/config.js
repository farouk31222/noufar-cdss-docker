// Auto-detect environment
// Local Docker (localhost) -> use nginx proxy at /api
// Production (Railway) -> use full Railway URL
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  window.NOUFAR_API_BASE_URL = '/api';
} else {
  window.NOUFAR_API_BASE_URL = 'https://noufar-cdss-production.up.railway.app/api';
}
