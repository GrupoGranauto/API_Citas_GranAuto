const { Pool } = require('pg');

// En Railway, la variable DATABASE_URL apunta al host interno (railway.internal).
// En desarrollo local usa DATABASE_URL con la URL pública (switchback.proxy.rlwy.net).
// Solo se requiere SSL para conexiones externas al cluster de Railway.
const connectionString = process.env.DATABASE_URL;
const esConexionInterna = connectionString && connectionString.includes('railway.internal');

const pool = new Pool({
  connectionString,
  ssl: esConexionInterna ? false : { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('[Postgres] Error inesperado en el pool de conexiones:', err.message);
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
        servicio_express      TEXT,
        confirmada            TEXT,
        asistio               TEXT,
        orden                 TEXT,
        reagendo              TEXT,
        asistio_reagenda      TEXT,
        observaciones         TEXT,
        tipo_oportunidad      TEXT,
        origen_reagenda       TEXT,
        cancelada             TEXT,
        highlight_mes_anterior TEXT,
        PRIMARY KEY (folio_cita, agencia, fecha_captura)
      )
    `);
    console.log('[Postgres] Tabla "citas" verificada/creada correctamente.');
  } catch (err) {
    console.error('[Postgres] Error al crear/verificar la tabla:', err.message);
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
          servicio_express, confirmada, asistio, orden, reagendo,
          asistio_reagenda, observaciones, tipo_oportunidad, origen_reagenda,
          cancelada, highlight_mes_anterior
        ) VALUES (
          $1, $2::date, $3::date, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
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
          servicio_express      = EXCLUDED.servicio_express,
          confirmada            = EXCLUDED.confirmada,
          asistio               = EXCLUDED.asistio,
          orden                 = EXCLUDED.orden,
          reagendo              = EXCLUDED.reagendo,
          asistio_reagenda      = EXCLUDED.asistio_reagenda,
          observaciones         = EXCLUDED.observaciones,
          tipo_oportunidad      = EXCLUDED.tipo_oportunidad,
          origen_reagenda       = EXCLUDED.origen_reagenda,
          cancelada             = EXCLUDED.cancelada,
          highlight_mes_anterior = EXCLUDED.highlight_mes_anterior`,
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
          reg.SERVICIO_EXPRESS,
          reg.CONFIRMADA,
          reg.ASISTIO,
          reg.ORDEN,
          reg.REAGENDO,
          reg.ASISTIO_REAGENDA,
          reg.OBSERVACIONES,
          reg.TIPO_OPORTUNIDAD,
          reg.ORIGEN_REAGENDA,
          reg.CANCELADA,
          reg.HIGHLIGHT_MES_ANTERIOR
        ]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    // No se loguean los datos del registro para evitar filtrar PII a los logs.
    console.error('[Postgres] Error en upsertCitas, ROLLBACK ejecutado:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Devuelve todas las citas cuya FECHA_CITA coincide con la fecha indicada,
 * formateadas como strings (formato esperado por bigquery.service.js).
 *
 * @param {string} fecha - Fecha en formato YYYY-MM-DD.
 * @returns {Promise<Array<Object>>} Registros listos para enviar a BigQuery.
 */
async function getCitasByFecha(fecha) {
  const { rows } = await pool.query(
    `SELECT * FROM citas WHERE fecha_cita = $1::date ORDER BY vc ASC`,
    [fecha]
  );

  // Las fechas llegan como objetos Date de pg; se convierten a string YYYY-MM-DD.
  const formatFecha = (d) => (d ? d.toISOString().split('T')[0] : null);
  const str = (v) => (v !== null && v !== undefined ? String(v) : null);

  return rows.map((row) => ({
    FOLIO_CITA:            str(row.folio_cita),
    FECHA_CAPTURA:         formatFecha(row.fecha_captura),
    FECHA_CITA:            formatFecha(row.fecha_cita),
    HORA_CITA:             str(row.hora_cita),
    CAPTURO_CITA:          str(row.capturo_cita),
    ORIGEN_CITA:           str(row.origen_cita),
    TIPO_CITA:             str(row.tipo_cita),
    TIPO_SERVICIO:         str(row.tipo_servicio),
    AGENCIA:               str(row.agencia),
    NOMBRE:                str(row.nombre),
    TELEFONO:              str(row.telefono),
    MODELO:                str(row.modelo),
    ANO:                   str(row.ano),
    SERIE:                 str(row.serie),
    ASESOR_SERVICIO:       str(row.asesor_servicio),
    SERVICIO_EXPRESS:      str(row.servicio_express),
    CONFIRMADA:            str(row.confirmada),
    ASISTIO:               str(row.asistio),
    ORDEN:                 str(row.orden),
    REAGENDO:              str(row.reagendo),
    ASISTIO_REAGENDA:      str(row.asistio_reagenda),
    OBSERVACIONES:         str(row.observaciones),
    TIPO_OPORTUNIDAD:      str(row.tipo_oportunidad),
    ORIGEN_REAGENDA:       str(row.origen_reagenda),
    CANCELADA:             str(row.cancelada),
    HIGHLIGHT_MES_ANTERIOR: str(row.highlight_mes_anterior)
  }));
}

module.exports = { initDB, upsertCitas, getCitasByFecha };
