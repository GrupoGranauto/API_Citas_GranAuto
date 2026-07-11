const { test, before, after } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();

// Estas pruebas tocan BigQuery real. Se saltan si no hay credenciales configuradas.
const hayCredenciales = !!(process.env.GOOGLE_CREDENTIALS_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS);
const opcionesSkip = { skip: hayCredenciales ? false : 'Sin credenciales de BigQuery (GOOGLE_APPLICATION_CREDENTIALS)' };

const AGENCIA_TEST = 'AG_TEST_INTEGRATION';

const COLUMNAS_DATOS = [
  'FOLIO_CITA', 'FECHA_CAPTURA', 'FECHA_CITA', 'HORA_CITA', 'CAPTURO_CITA',
  'ORIGEN_CITA', 'TIPO_CITA', 'TIPO_SERVICIO', 'AGENCIA', 'NOMBRE', 'TELEFONO',
  'MODELO', 'ANO', 'SERIE', 'ASESOR_SERVICIO', 'SERVICIO_EXPRESS', 'CONFIRMADA',
  'ASISTIO', 'ORDEN', 'REAGENDO', 'ASISTIO_REAGENDA', 'OBSERVACIONES',
  'TIPO_OPORTUNIDAD', 'ORIGEN_REAGENDA', 'CANCELADA', 'HIGHLIGHT_MES_ANTERIOR'
];

function fila(folio, nombre) {
  const r = {};
  COLUMNAS_DATOS.forEach((c) => { r[c] = null; });
  r.FOLIO_CITA = folio;
  r.AGENCIA = AGENCIA_TEST;
  r.FECHA_CAPTURA = '2026-07-11';
  r.FECHA_CITA = '2026-07-20';
  r.NOMBRE = nombre;
  return r;
}

let bigquery, tabla, svc;

async function limpiar() {
  await bigquery.query({ query: `DELETE FROM \`${tabla}\` WHERE AGENCIA = '${AGENCIA_TEST}'` });
}

before(async () => {
  if (!hayCredenciales) return;
  const { BigQuery } = require('@google-cloud/bigquery');
  const path = require('path');
  const opts = { projectId: process.env.PROJECT_ID };
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    opts.keyFilename = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }
  bigquery = new BigQuery(opts);
  tabla = `${process.env.PROJECT_ID}.${process.env.DATASET_ID}.${process.env.TABLE_ID}`;
  svc = require('../services/bigquery.service');
  await limpiar();
});

after(async () => {
  if (hayCredenciales) await limpiar();
});

test('upsert inserta registro nuevo con VC', opcionesSkip, async () => {
  await svc.upsertCitas([fila('ZZINT_1', 'Primero')]);
  const [r] = await bigquery.query({
    query: `SELECT VC, NOMBRE FROM \`${tabla}\` WHERE AGENCIA='${AGENCIA_TEST}' AND FOLIO_CITA='ZZINT_1'`
  });
  assert.strictEqual(r.length, 1);
  assert.ok(r[0].VC, 'debe tener VC asignado');
  assert.strictEqual(r[0].NOMBRE, 'Primero');
});

test('upsert misma llave reemplaza y conserva VC (no duplica)', opcionesSkip, async () => {
  const [antes] = await bigquery.query({
    query: `SELECT VC FROM \`${tabla}\` WHERE AGENCIA='${AGENCIA_TEST}' AND FOLIO_CITA='ZZINT_1'`
  });
  const vcOriginal = antes[0].VC;
  await svc.upsertCitas([fila('ZZINT_1', 'Segundo')]);
  const [r] = await bigquery.query({
    query: `SELECT VC, NOMBRE FROM \`${tabla}\` WHERE AGENCIA='${AGENCIA_TEST}' AND FOLIO_CITA='ZZINT_1'`
  });
  assert.strictEqual(r.length, 1, 'no debe duplicar');
  assert.strictEqual(r[0].NOMBRE, 'Segundo', 'debe actualizar el dato');
  assert.strictEqual(r[0].VC, vcOriginal, 'debe conservar el VC original');
});

test('upsert concurrente genera VC únicos', opcionesSkip, async () => {
  const N = 12;
  await Promise.all(
    Array.from({ length: N }, (_, i) => svc.upsertCitas([fila('ZZINT_C' + i, 'c' + i)]))
  );
  const [r] = await bigquery.query({
    query: `SELECT COUNT(*) c, COUNT(DISTINCT VC) vc FROM \`${tabla}\` WHERE AGENCIA='${AGENCIA_TEST}' AND STARTS_WITH(FOLIO_CITA, 'ZZINT_C')`
  });
  assert.strictEqual(Number(r[0].c), N);
  assert.strictEqual(Number(r[0].vc), N, 'todos los VC deben ser únicos');
});
