require('dotenv').config();
const express = require('express');
const cors = require('cors');
const citasRouter = require('./routes/citas.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para habilitar CORS
app.use(cors());

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
