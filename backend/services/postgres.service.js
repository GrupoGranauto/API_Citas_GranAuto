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
        status                TEXT,
        telefono_casa         TEXT,
        telefono_oficina      TEXT,
        placas                TEXT,
        codigo_postal         TEXT,
        contacto              TEXT,
        telefono_contacto     TEXT,
        email_contacto        TEXT,
        notas_al_cliente      TEXT,
        PRIMARY KEY (folio_cita, agencia, fecha_captura)
      )
    `);

    // Migración de columnas para tablas creadas antes del renombrado
    // (status_cita -> status, tel_casa -> telefono_casa, oficina -> telefono_oficina).
    // Se usa un chequeo contra information_schema porque PostgreSQL no soporta
    // RENAME COLUMN IF EXISTS.
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='citas' AND column_name='status_cita')
           AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='citas' AND column_name='status') THEN
          ALTER TABLE citas RENAME COLUMN status_cita TO status;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='citas' AND column_name='tel_casa')
           AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='citas' AND column_name='telefono_casa') THEN
          ALTER TABLE citas RENAME COLUMN tel_casa TO telefono_casa;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='citas' AND column_name='oficina')
           AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='citas' AND column_name='telefono_oficina') THEN
          ALTER TABLE citas RENAME COLUMN oficina TO telefono_oficina;
        END IF;
      END $$;
    `);

    // Agrega columnas nuevas si la tabla ya existía sin ellas.
    await client.query(`
      ALTER TABLE citas
        ADD COLUMN IF NOT EXISTS status            TEXT,
        ADD COLUMN IF NOT EXISTS telefono_casa      TEXT,
        ADD COLUMN IF NOT EXISTS telefono_oficina   TEXT,
        ADD COLUMN IF NOT EXISTS contacto           TEXT,
        ADD COLUMN IF NOT EXISTS telefono_contacto  TEXT,
        ADD COLUMN IF NOT EXISTS email_contacto     TEXT,
        ADD COLUMN IF NOT EXISTS notas_al_cliente   TEXT
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
          status, telefono_casa, telefono_oficina, placas, codigo_postal,
          contacto, telefono_contacto, email_contacto, notas_al_cliente
        ) VALUES (
          $1, $2::date, $3::date, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21,
          $22, $23, $24, $25
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
          status                = EXCLUDED.status,
          telefono_casa         = EXCLUDED.telefono_casa,
          telefono_oficina      = EXCLUDED.telefono_oficina,
          placas                = EXCLUDED.placas,
          codigo_postal         = EXCLUDED.codigo_postal,
          contacto              = EXCLUDED.contacto,
          telefono_contacto     = EXCLUDED.telefono_contacto,
          email_contacto        = EXCLUDED.email_contacto,
          notas_al_cliente      = EXCLUDED.notas_al_cliente`,
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
          reg.STATUS,
          reg.TELEFONO_CASA,
          reg.TELEFONO_OFICINA,
          reg.PLACAS,
          reg.CODIGO_POSTAL,
          reg.CONTACTO,
          reg.TELEFONO_CONTACTO,
          reg.EMAIL_CONTACTO,
          reg.NOTAS_AL_CLIENTE
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
