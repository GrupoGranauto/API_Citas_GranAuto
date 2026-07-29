require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const citasRouter = require('./routes/citas.routes');
const postgresService = require('./services/postgres.service');
const observabilidad = require('./middlewares/observability.middleware');
const logger = require('./utils/logger');

const app = express();

// Detrás de un proxy (Railway) para que el rate limit vea la IP real del cliente.
app.set('trust proxy', 1);

// Cabeceras de seguridad HTTP.
app.use(helmet());
app.use(observabilidad);

// CORS restringido por whitelist. ALLOWED_ORIGINS = lista separada por comas.
// Vacío = no se refleja ningún origen de navegador (esta API es servidor-a-servidor;
// clientes como Python/cURL no aplican CORS, así que no se ven afectados).
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Sin header Origin (server-to-server) o en la whitelist -> permitido.
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    const error = new Error('Origen no permitido por CORS');
    error.status = 403;
    return callback(error);
  }
}));

// Rate limiting global. Configurable por env; valores por defecto pensados para
// ingestión 24/7 de un cliente server-to-server.
const rateWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000;
const rateMax = Number(process.env.RATE_LIMIT_MAX) || 600;

app.use(rateLimit({
  windowMs: rateWindowMs,
  max: rateMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler(req, res) {
    res.status(429).json({
      ok: false,
      mensaje: "Demasiadas peticiones, intenta más tarde",
      requestId: req.requestId
    });
  }
}));

// Middleware para parsear cuerpos de peticiones JSON (límite ampliado a 10MB para lotes grandes)
app.use(express.json({ limit: '10mb' }));

// Endpoint base para monitoreo o salud de la API
app.get('/health', async (req, res) => {
  try {
    await postgresService.healthCheck();
    res.status(200).json({
      status: 'UP',
      timestamp: new Date().toISOString(),
      dependencies: { postgres: 'UP' }
    });
  } catch (error) {
    logger.error('health.postgres_unavailable', { requestId: req.requestId }, error);
    res.status(503).json({
      status: 'DOWN',
      timestamp: new Date().toISOString(),
      dependencies: { postgres: 'DOWN' },
      requestId: req.requestId
    });
  }
});

// Registrar las rutas de citas
app.use('/api/citas', citasRouter);

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    mensaje: 'Ruta no encontrada',
    requestId: req.requestId
  });
});

// Manejador final: registra stack, código y requestId, pero nunca body/headers/PII.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  const esJsonInvalido = err instanceof SyntaxError && err.status === 400 && 'body' in err;
  const statusCode = esJsonInvalido ? 400 : (err.status || err.statusCode || 500);
  logger[statusCode >= 500 ? 'error' : 'warn']('http.unhandled_error', {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl ? req.originalUrl.split('?')[0] : req.path,
    statusCode
  }, err);

  if (esJsonInvalido) {
    return res.status(400).json({
      ok: false,
      mensaje: "JSON malformado en el cuerpo de la petición",
      requestId: req.requestId
    });
  }

  return res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
    ok: false,
    mensaje: statusCode >= 500 ? (err.publicMessage || "Error interno en el servidor") : err.message,
    requestId: req.requestId
  });
});

module.exports = app;
