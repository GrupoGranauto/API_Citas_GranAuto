const express = require('express');
const router = express.Router();
const citasController = require('../controllers/citas.controller');
const authMiddleware = require('../middlewares/auth.middleware');

/**
 * Ruta POST /api/citas
 * Requiere autenticación mediante API Key
 */
router.post('/', authMiddleware, citasController.crearCitas);

module.exports = router;
