const crypto = require('crypto');

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
    console.warn("ADVERTENCIA: API_KEY no está configurada en las variables de entorno (.env).");
    // Sin clave configurada no se puede autenticar: se rechaza por seguridad.
    return res.status(401).json({
      ok: false,
      mensaje: "API KEY inválida"
    });
  }

  if (!apiKeyHeader || !comparacionSegura(apiKeyHeader, expectedApiKey)) {
    return res.status(401).json({
      ok: false,
      mensaje: "API KEY inválida"
    });
  }

  next();
};
