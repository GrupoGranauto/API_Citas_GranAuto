const { BigQuery } = require('@google-cloud/bigquery');
const path = require('path');

const bigqueryOptions = {
  projectId: process.env.PROJECT_ID
};

// Soporte para cargar credenciales directamente desde un JSON en texto plano (ideal para Railway)
if (process.env.GOOGLE_CREDENTIALS_JSON) {
  try {
    bigqueryOptions.credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  } catch (err) {
    console.error("Error al parsear la variable GOOGLE_CREDENTIALS_JSON:", err.message);
  }
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  // Cargar desde archivo físico (ideal para desarrollo local)
  bigqueryOptions.keyFilename = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

// Inicializar el cliente de BigQuery
const bigquery = new BigQuery(bigqueryOptions);

// Timeout del job de BigQuery y reintentos ante fallos transitorios.
const BQ_JOB_TIMEOUT_MS = Number(process.env.BQ_JOB_TIMEOUT_MS) || 30000;
const BQ_MAX_REINTENTOS = Number(process.env.BQ_MAX_REINTENTOS) || 3;

// Códigos/razones típicos de errores transitorios de BigQuery que vale la pena reintentar.
const RAZONES_TRANSITORIAS = ['rateLimitExceeded', 'backendError', 'internalError', 'jobBackendError'];

function esErrorTransitorio(error) {
  if (!error) return false;
  if (error.code === 500 || error.code === 503) return true;
  const reason = error.errors && error.errors[0] && error.errors[0].reason;
  if (reason && RAZONES_TRANSITORIAS.includes(reason)) return true;
  // Conflicto de concurrencia en DML: la sentencia se puede reintentar sin riesgo (MERGE es atómico).
  return typeof error.message === 'string' && /could not serialize|concurrent update/i.test(error.message);
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ejecuta una consulta de BigQuery con timeout y reintentos con backoff exponencial
 * ante errores transitorios. Los errores no transitorios (SQL inválido, permisos)
 * se propagan de inmediato sin reintentar.
 */
async function ejecutarConReintento(opciones) {
  let ultimoError;
  for (let intento = 1; intento <= BQ_MAX_REINTENTOS; intento++) {
    try {
      return await bigquery.query({ ...opciones, jobTimeoutMs: BQ_JOB_TIMEOUT_MS });
    } catch (error) {
      ultimoError = error;
      if (intento >= BQ_MAX_REINTENTOS || !esErrorTransitorio(error)) {
        throw error;
      }
      const backoff = 250 * 2 ** (intento - 1); // 250ms, 500ms, 1000ms...
      console.warn(`BigQuery: fallo transitorio (intento ${intento}/${BQ_MAX_REINTENTOS}), reintentando en ${backoff}ms: ${error.message}`);
      await esperar(backoff);
    }
  }
  throw ultimoError;
}

// Columnas de datos que llegan en el payload (todas menos VC, que se genera en BQ).
const COLUMNAS_DATOS = [
  'FOLIO_CITA', 'FECHA_CAPTURA', 'FECHA_CITA', 'HORA_CITA',
  'CAPTURO_CITA', 'ORIGEN_CITA', 'TIPO_CITA', 'TIPO_SERVICIO', 'AGENCIA',
  'NOMBRE', 'TELEFONO', 'MODELO', 'ANO', 'SERIE', 'ASESOR_SERVICIO',
  'SERVICIO_EXPRESS', 'CONFIRMADA', 'ASISTIO', 'ORDEN', 'REAGENDO',
  'ASISTIO_REAGENDA', 'OBSERVACIONES', 'TIPO_OPORTUNIDAD', 'ORIGEN_REAGENDA',
  'CANCELADA', 'HIGHLIGHT_MES_ANTERIOR'
];

// Columnas de tipo DATE en la tabla. Se reciben como STRING (YYYY-MM-DD) y se
// convierten con PARSE_DATE dentro del MERGE.
const COLUMNAS_FECHA = new Set(['FECHA_CAPTURA', 'FECHA_CITA']);

// Mutex de serialización de upserts. El VC se genera como MAX(VC)+ROW_NUMBER()
// dentro del MERGE, pero BigQuery usa snapshot isolation: dos MERGE concurrentes
// leen el MISMO MAX antes de que el otro haga commit, produciendo VC duplicados
// (comprobado: 12 upserts en paralelo -> solo 8 VC únicos). Encadenando los
// upserts garantizamos que cada MERGE ve el estado ya comprometido por el anterior.
//
// NOTA DE ESCALADO: esto serializa solo dentro de UN proceso Node. Si se despliega
// en varias instancias, hace falta un lock distribuido (Redis, Firestore) o una
// fuente de correlativos externa. Con una sola instancia (config actual) es correcto.
let cadenaUpsert = Promise.resolve();

function ejecutarSerializado(fn) {
  const resultado = cadenaUpsert.then(fn);
  // La cadena continúa aunque un upsert falle, para no bloquear los siguientes.
  cadenaUpsert = resultado.then(() => {}, () => {});
  return resultado;
}

/**
 * Inserta o actualiza (upsert) un lote de registros en BigQuery usando una
 * sentencia MERGE (DML), evitando el streaming buffer para que el reemplazo
 * sea inmediato.
 *
 * La deduplicación es por la tupla (FOLIO_CITA, AGENCIA, FECHA_CAPTURA), comparada
 * columna por columna (no por string concatenada, que sería ambigua). Si la tupla
 * ya existe, la fila se reemplaza conservando su VC original; si no, se inserta con
 * un VC nuevo = MAX(VC) + ROW_NUMBER().
 *
 * Los upserts se ejecutan SERIALIZADOS (ver ejecutarSerializado) para que el VC sea
 * único bajo concurrencia. El lote entrante ya debe venir deduplicado.
 *
 * @param {Array<Object>} registros - Registros formateados según el esquema (sin VC).
 */
async function upsertCitas(registros) {
  if (!registros || registros.length === 0) {
    return;
  }

  const tablaCompleta = `${process.env.PROJECT_ID}.${process.env.DATASET_ID}.${process.env.TABLE_ID}`;

  // Expresiones de la subconsulta source: las fechas se parsean a DATE.
  const selectDatos = COLUMNAS_DATOS.map((col) => {
    if (COLUMNAS_FECHA.has(col)) {
      return `SAFE.PARSE_DATE('%Y-%m-%d', reg.${col}) AS ${col}`;
    }
    return `reg.${col} AS ${col}`;
  }).join(',\n        ');

  // En MATCHED solo se actualizan los datos; el VC de la fila existente se conserva.
  const setUpdate = COLUMNAS_DATOS.map((col) => `T.${col} = S.${col}`).join(',\n      ');
  const insertCols = ['VC', ...COLUMNAS_DATOS].join(', ');
  const insertVals = ['S.VC', ...COLUMNAS_DATOS.map((col) => `S.${col}`)].join(', ');

  // La comparación de la llave es columna por columna (FECHA_CAPTURA ya parseada a
  // DATE en ambos lados), evitando ambigüedad por separadores.
  // El VC nuevo = MAX(VC actual de la tabla) + número de fila del lote. Es único
  // gracias a la serialización de upserts (snapshot isolation lo haría colisionar
  // si corrieran en paralelo).
  const query = `
    MERGE \`${tablaCompleta}\` T
    USING (
      SELECT
        ${selectDatos},
        CAST(
          (SELECT COALESCE(MAX(CAST(VC AS INT64)), 0) FROM \`${tablaCompleta}\`)
          + ROW_NUMBER() OVER ()
        AS STRING) AS VC
      FROM UNNEST(@rows) AS reg
    ) S
    ON T.FOLIO_CITA = S.FOLIO_CITA
      AND T.AGENCIA = S.AGENCIA
      AND T.FECHA_CAPTURA = S.FECHA_CAPTURA
    WHEN MATCHED THEN UPDATE SET
      ${setUpdate}
    WHEN NOT MATCHED THEN INSERT (${insertCols})
      VALUES (${insertVals})
  `;

  // Todos los campos se envían como STRING; las fechas se convierten en el MERGE.
  // El tipo explícito es necesario porque varias columnas llegan siempre en null.
  const structType = {};
  COLUMNAS_DATOS.forEach((col) => { structType[col] = 'STRING'; });

  // Serializado para garantizar unicidad del VC (ver cadenaUpsert arriba).
  return ejecutarSerializado(async () => {
    try {
      await ejecutarConReintento({
        query,
        params: { rows: registros },
        types: { rows: [structType] }
      });
    } catch (error) {
      // Se loguea solo el motivo del error, NO los datos del registro, para no
      // filtrar PII (nombre, teléfono) a los logs.
      const razones = (error.errors || []).map((e) => e.reason || e.message).filter(Boolean);
      console.error(
        `Error al ejecutar MERGE (upsert) en BigQuery: ${error.message}` +
        (razones.length ? ` | razones: ${razones.join(', ')}` : '')
      );
      throw error;
    }
  });
}

module.exports = {
  upsertCitas
};
