const express = require('express');
const router = express.Router();
const citasController = require('../controllers/citas.controller');
const authMiddleware = require('../middlewares/auth.middleware');

/**
 * POST /api/citas
 * Inserta o actualiza citas en la base de datos PostgreSQL (almacenamiento primario).
 * Requiere autenticación mediante API Key.
 */
router.post('/', authMiddleware, citasController.crearCitas);

/**
 * POST /api/citas/sync-bigquery
 * Sincroniza hacia BigQuery todas las citas de una FECHA_CITA específica,
 * tomando los datos desde PostgreSQL como fuente de verdad.
 * Body: { "fecha": "YYYY-MM-DD" }
 * Requiere autenticación mediante API Key.
 */
router.post('/sync-bigquery', authMiddleware, citasController.syncBigquery);

module.exports = router;
