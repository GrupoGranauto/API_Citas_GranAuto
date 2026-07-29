const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * Compara dos cadenas en tiempo constante para evitar ataques de timing.
 * Se comparan los hashes SHA-256 (siempre 32 bytes) para no filtrar la longitud
 * de la clave esperada y para que timingSafeEqual no falle por longitudes distintas.
 */
function comparacionSegura(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Middleware para validar el acceso mediante API Key en el header x-api-key.
 */
module.exports = (req, res, next) => {
  const apiKeyHeader = req.headers['x-api-key'];
  const expectedApiKey = process.env.API_KEY;

  if (!expectedApiKey) {
    logger.error('auth.api_key_not_configured', { requestId: req.requestId });
    // Sin clave configurada no se puede autenticar: se rechaza por seguridad.
    return res.status(401).json({
      ok: false,
      mensaje: "API KEY inválida",
      requestId: req.requestId
    });
  }

  if (!apiKeyHeader || !comparacionSegura(apiKeyHeader, expectedApiKey)) {
    return res.status(401).json({
      ok: false,
      mensaje: "API KEY inválida",
      requestId: req.requestId
    });
  }

  next();
};
