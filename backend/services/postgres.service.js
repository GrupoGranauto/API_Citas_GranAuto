const { Pool } = require('pg');
const logger = require('../utils/logger');
const connectionString = process.env.DATABASE_URL;
const esConexionInterna = connectionString && connectionString.includes('railway.internal');

const pool = new Pool({
  connectionString,
  ssl: esConexionInterna ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS) || 5000,
  query_timeout: Number(process.env.PG_QUERY_TIMEOUT_MS) || 30000
});

pool.on('error', (err) => {
  logger.error('postgres.pool_error', {}, err);
});

/**
 * Crea la tabla `citas` si no existe.
 * Debe llamarse una vez al arrancar el servidor.
 */
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS citas (
        vc                    SERIAL,
        folio_cita            TEXT        NOT NULL,
        fecha_captura         DATE        NOT NULL,
        fecha_cita            DATE,
        hora_cita             TEXT,
        capturo_cita          TEXT,
        origen_cita           TEXT,
        tipo_cita             TEXT,
        tipo_servicio         TEXT,
        agencia               TEXT        NOT NULL,
        nombre                TEXT,
        telefono              TEXT,
        modelo                TEXT,
        ano                   TEXT,
        serie                 TEXT,
        asesor_servicio       TEXT,
        highlight_mes_anterior TEXT,
        status_cita           TEXT,
        tel_casa              TEXT,
        oficina               TEXT,
        placas                TEXT,
        codigo_postal         TEXT,
        PRIMARY KEY (folio_cita, agencia, fecha_captura)
      )
    `);
    logger.info('postgres.schema_ready');
  } catch (err) {
    logger.error('postgres.schema_init_failed', {}, err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Inserta o actualiza (upsert) un lote de registros en la tabla `citas`.
 * La deduplicación es por la tupla (folio_cita, agencia, fecha_captura).
 * Si la llave ya existe, todos los campos de datos se actualizan.
 * El correlativo `vc` es SERIAL y no se toca en los updates.
 *
 * @param {Array<Object>} registros - Registros formateados (campo → string | null).
 */
async function upsertCitas(registros) {
  if (!registros || registros.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const reg of registros) {
      await client.query(
        `INSERT INTO citas (
          folio_cita, fecha_captura, fecha_cita, hora_cita,
          capturo_cita, origen_cita, tipo_cita, tipo_servicio, agencia,
          nombre, telefono, modelo, ano, serie, asesor_servicio,
          highlight_mes_anterior,
          status_cita, tel_casa, oficina, placas, codigo_postal
        ) VALUES (
          $1, $2::date, $3::date, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21
        )
        ON CONFLICT (folio_cita, agencia, fecha_captura) DO UPDATE SET
          fecha_cita            = EXCLUDED.fecha_cita,
          hora_cita             = EXCLUDED.hora_cita,
          capturo_cita          = EXCLUDED.capturo_cita,
          origen_cita           = EXCLUDED.origen_cita,
          tipo_cita             = EXCLUDED.tipo_cita,
          tipo_servicio         = EXCLUDED.tipo_servicio,
          nombre                = EXCLUDED.nombre,
          telefono              = EXCLUDED.telefono,
          modelo                = EXCLUDED.modelo,
          ano                   = EXCLUDED.ano,
          serie                 = EXCLUDED.serie,
          asesor_servicio       = EXCLUDED.asesor_servicio,
          highlight_mes_anterior = EXCLUDED.highlight_mes_anterior,
          status_cita           = EXCLUDED.status_cita,
          tel_casa              = EXCLUDED.tel_casa,
          oficina               = EXCLUDED.oficina,
          placas                = EXCLUDED.placas,
          codigo_postal         = EXCLUDED.codigo_postal`,
        [
          reg.FOLIO_CITA,
          reg.FECHA_CAPTURA,
          reg.FECHA_CITA,
          reg.HORA_CITA,
          reg.CAPTURO_CITA,
          reg.ORIGEN_CITA,
          reg.TIPO_CITA,
          reg.TIPO_SERVICIO,
          reg.AGENCIA,
          reg.NOMBRE,
          reg.TELEFONO,
          reg.MODELO,
          reg.ANO,
          reg.SERIE,
          reg.ASESOR_SERVICIO,
          reg.HIGHLIGHT_MES_ANTERIOR,
          reg.STATUS_CITA,
          reg.TEL_CASA,
          reg.OFICINA,
          reg.PLACAS,
          reg.CODIGO_POSTAL
        ]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    // No se loguean los datos del registro para evitar filtrar PII a los logs.
    throw err;
  } finally {
    client.release();
  }
}

/**
 * node-postgres normalmente entrega DATE como string, pero un parser global
 * personalizado puede entregarlo como Date. Se soportan ambos casos sin aplicar
 * conversiones de zona horaria a los strings que ya vienen como YYYY-MM-DD.
 */
function normalizarFechaPostgres(valor) {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) {
      throw new TypeError('PostgreSQL devolvió una fecha inválida');
    }
    return valor.toISOString().slice(0, 10);
  }
  const fecha = String(valor);
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha;
  throw new TypeError(`PostgreSQL devolvió una fecha con formato inesperado: ${fecha}`);
}

async function healthCheck() {
  await pool.query('SELECT 1');
}

async function close() {
  await pool.end();
}

module.exports = {
  initDB,
  upsertCitas,
  healthCheck,
  close,
  normalizarFechaPostgres
};
