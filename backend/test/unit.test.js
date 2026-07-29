const { test } = require('node:test');
const assert = require('node:assert');
const { esFechaValida, deduplicarLote } = require('../controllers/citas.controller');
const { limpiar, serializarError } = require('../utils/logger');
const { normalizarFechaPostgres } = require('../services/postgres.service');

test('esFechaValida: acepta fechas reales YYYY-MM-DD', () => {
  assert.strictEqual(esFechaValida('2026-07-11'), true);
  assert.strictEqual(esFechaValida('2024-02-29'), true); // bisiesto
  assert.strictEqual(esFechaValida('2000-01-01'), true);
});

test('esFechaValida: rechaza formato inválido', () => {
  assert.strictEqual(esFechaValida('2026-7-1'), false);
  assert.strictEqual(esFechaValida('11/07/2026'), false);
  assert.strictEqual(esFechaValida(''), false);
  assert.strictEqual(esFechaValida('hola'), false);
  assert.strictEqual(esFechaValida(undefined), false);
});

test('esFechaValida: rechaza fechas con formato válido pero irreales', () => {
  assert.strictEqual(esFechaValida('2026-13-45'), false); // mes/día imposibles
  assert.strictEqual(esFechaValida('2026-02-29'), false); // 2026 no es bisiesto
  assert.strictEqual(esFechaValida('2026-00-10'), false); // mes 0
  assert.strictEqual(esFechaValida('2026-04-31'), false); // abril no tiene 31
});

test('deduplicarLote: conserva el último por llave (FOLIO, AGENCIA, FECHA_CAPTURA)', () => {
  const lote = [
    { FOLIO_CITA: '1', AGENCIA: 'A', FECHA_CAPTURA: '2026-07-11', NOMBRE: 'viejo' },
    { FOLIO_CITA: '1', AGENCIA: 'A', FECHA_CAPTURA: '2026-07-11', NOMBRE: 'nuevo' },
    { FOLIO_CITA: '2', AGENCIA: 'A', FECHA_CAPTURA: '2026-07-11', NOMBRE: 'otro' }
  ];
  const res = deduplicarLote(lote);
  assert.strictEqual(res.length, 2);
  assert.strictEqual(res.find((r) => r.FOLIO_CITA === '1').NOMBRE, 'nuevo');
});

test('deduplicarLote: llaves con guiones NO colisionan', () => {
  const lote = [
    { FOLIO_CITA: 'A-B', AGENCIA: 'C', FECHA_CAPTURA: '2026-07-11', NOMBRE: 'uno' },
    { FOLIO_CITA: 'A', AGENCIA: 'B-C', FECHA_CAPTURA: '2026-07-11', NOMBRE: 'dos' }
  ];
  const res = deduplicarLote(lote);
  assert.strictEqual(res.length, 2); // no se fusionan
});

test('logger: oculta secretos y PII en metadata anidada', () => {
  const limpio = limpiar({
    requestId: 'abc',
    headers: { authorization: 'Bearer secreto', 'x-api-key': 'secreto' },
    registro: { NOMBRE: 'Persona', TELEFONO: '555', FOLIO_CITA: 'F-1' }
  });
  assert.strictEqual(limpio.headers.authorization, '[REDACTED]');
  assert.strictEqual(limpio.headers['x-api-key'], '[REDACTED]');
  assert.strictEqual(limpio.registro.NOMBRE, '[REDACTED]');
  assert.strictEqual(limpio.registro.TELEFONO, '[REDACTED]');
  assert.strictEqual(limpio.registro.FOLIO_CITA, 'F-1');
});

test('logger: conserva stack y código de un error', () => {
  const error = new Error('falló conexión');
  error.code = 'ECONNRESET';
  const serializado = serializarError(error);
  assert.strictEqual(serializado.message, 'falló conexión');
  assert.strictEqual(serializado.code, 'ECONNRESET');
  assert.match(serializado.stack, /falló conexión/);
});

test('normalizarFechaPostgres: soporta DATE como string o Date', () => {
  assert.strictEqual(normalizarFechaPostgres('2026-07-28'), '2026-07-28');
  assert.strictEqual(
    normalizarFechaPostgres(new Date('2026-07-28T23:59:59.000Z')),
    '2026-07-28'
  );
  assert.strictEqual(normalizarFechaPostgres(null), null);
  assert.throws(
    () => normalizarFechaPostgres('28/07/2026'),
    /formato inesperado/
  );
});

test('crearCitas: rechaza elementos no objeto como error de cliente', async () => {
  const { crearCitas } = require('../controllers/citas.controller');
  const req = { body: [null] };
  const respuesta = {};
  const res = {
    status(codigo) {
      respuesta.codigo = codigo;
      return this;
    },
    json(body) {
      respuesta.body = body;
      return this;
    }
  };
  let errorSiguiente;

  await crearCitas(req, res, (error) => {
    errorSiguiente = error;
  });

  assert.strictEqual(errorSiguiente, undefined);
  assert.strictEqual(respuesta.codigo, 400);
  assert.match(respuesta.body.mensaje, /posición 0/);
});
