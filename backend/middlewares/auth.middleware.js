/**
 * Middleware para validar el acceso mediante API Key en el header x-api-key.
 */
module.exports = (req, res, next) => {
  const apiKeyHeader = req.headers['x-api-key'];
  const expectedApiKey = process.env.API_KEY;

  if (!expectedApiKey) {
    console.warn("ADVERTENCIA: API_KEY no está configurada en las variables de entorno (.env).");
  }

  if (!apiKeyHeader || apiKeyHeader !== expectedApiKey) {
    return res.status(401).json({
      ok: false,
      mensaje: "API KEY inválida"
    });
  }

  next();
};
