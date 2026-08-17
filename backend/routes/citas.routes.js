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

module.exports = router;
