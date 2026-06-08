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

/**
 * Obtiene el valor máximo actual de la columna VC en la tabla de BigQuery.
 * Realiza un CAST a INT64 para poder obtener el máximo numérico de forma correcta.
 * Retorna un número (0 si la tabla está vacía o no tiene registros válidos).
 */
async function obtenerMaxVC() {
  const query = `
    SELECT
      COALESCE(MAX(CAST(VC AS INT64)), 0) AS max_vc
    FROM \`${process.env.PROJECT_ID}.${process.env.DATASET_ID}.${process.env.TABLE_ID}\`
  `;

  try {
    const options = {
      query: query
    };
    const [rows] = await bigquery.query(options);
    
    if (rows && rows.length > 0) {
      return Number(rows[0].max_vc);
    }
    return 0;
  } catch (error) {
    console.error("Error en obtenerMaxVC de BigQuery:", error.message);
    throw error;
  }
}

/**
 * Inserta un lote de registros (uno o varios) en la tabla destino de BigQuery.
 * Utiliza la API de inserción por streaming (table.insert).
 * 
 * @param {Array<Object>} registros - Arreglo de objetos formateados según el esquema de BigQuery.
 */
async function insertarCitas(registros) {
  const datasetId = process.env.DATASET_ID;
  const tableId = process.env.TABLE_ID;

  try {
    const dataset = bigquery.dataset(datasetId);
    const table = dataset.table(tableId);

    // Inserción por streaming (insert rows)
    await table.insert(registros);
  } catch (error) {
    console.error("Error al insertar en BigQuery:", error.message);
    if (error.errors) {
      // Imprimir el detalle completo de errores de validación de BigQuery por cada fila
      console.error("Detalles de errores de filas en BigQuery:", JSON.stringify(error.errors, null, 2));
    }
    throw error;
  }
}

module.exports = {
  obtenerMaxVC,
  insertarCitas
};
