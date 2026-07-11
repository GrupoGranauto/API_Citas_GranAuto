require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const citasRouter = require('./routes/citas.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Detrás de un proxy (Railway) para que el rate limit vea la IP real del cliente.
app.set('trust proxy', 1);

// Cabeceras de seguridad HTTP.
app.use(helmet());

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
    return callback(new Error('Origen no permitido por CORS'));
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
  message: { ok: false, mensaje: "Demasiadas peticiones, intenta más tarde" }
}));

// Middleware para parsear cuerpos de peticiones JSON (límite ampliado a 10MB para lotes grandes)
app.use(express.json({ limit: '10mb' }));

// Endpoint base para monitoreo o salud de la API
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    message: 'Servicio de Citas activo'
  });
});

// Registrar las rutas de citas
app.use('/api/citas', citasRouter);

// Middleware para manejo de errores de sintaxis (por ejemplo, JSON mal formado)
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      ok: false,
      mensaje: "JSON malformado en el cuerpo de la petición"
    });
  }

  console.error("Error global no controlado:", err);
  return res.status(500).json({
    ok: false,
    mensaje: "Error interno en el servidor"
  });
});

// Iniciar servidor express
app.listen(PORT, () => {
  console.log(`[Servidor] API de Citas corriendo en el puerto ${PORT}`);
  console.log(`[Servidor] Endpoint listo en: http://localhost:${PORT}/api/citas`);
});
