const { test, before, after } = require('node:test');
const assert = require('node:assert');

process.env.API_KEY = 'clave-pruebas-http';
process.env.ALLOWED_ORIGINS = 'https://permitido.example';
process.env.RATE_LIMIT_MAX = '1000';

const app = require('../app');

let server;
let baseUrl;

before(async () => {
  server = await new Promise((resolve) => {
    const instancia = app.listen(0, '127.0.0.1', () => resolve(instancia));
  });
  const direccion = server.address();
  baseUrl = `http://127.0.0.1:${direccion.port}`;
});

after(async () => {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('404 responde JSON y conserva un requestId válido del cliente', async () => {
  const response = await fetch(`${baseUrl}/no-existe`, {
    headers: { 'x-request-id': 'prueba-404' }
  });
  const body = await response.json();

  assert.strictEqual(response.status, 404);
  assert.strictEqual(response.headers.get('x-request-id'), 'prueba-404');
  assert.strictEqual(body.requestId, 'prueba-404');
  assert.strictEqual(body.ok, false);
});

test('autenticación rechaza una API key inválida sin exponer información', async () => {
  const response = await fetch(`${baseUrl}/api/citas`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': 'incorrecta'
    },
    body: JSON.stringify({})
  });
  const body = await response.json();

  assert.strictEqual(response.status, 401);
  assert.strictEqual(body.mensaje, 'API KEY inválida');
  assert.strictEqual(body.requestId, response.headers.get('x-request-id'));
});

test('JSON malformado responde 400 con requestId', async () => {
  const response = await fetch(`${baseUrl}/api/citas`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': 'clave-pruebas-http'
    },
    body: '{"incompleto":'
  });
  const body = await response.json();

  assert.strictEqual(response.status, 400);
  assert.match(body.mensaje, /JSON malformado/);
  assert.strictEqual(body.requestId, response.headers.get('x-request-id'));
});

// Codifica una cadena en Windows-1252. Solo cubre el rango latino, suficiente
// para las vocales acentuadas y la Ñ del español.
function aCp1252(texto) {
  return Buffer.from(Array.from(texto, (c) => c.charCodeAt(0)));
}

test('un cuerpo en Windows-1252 conserva la Ñ y los acentos', async () => {
  const payload = JSON.stringify({
    FOLIO_CITA: '00051391',
    FECHA_CAPTURA: '2026-08-17',
    FECHA_CITA: '2026-08-20',
    AGENCIA: 'PEÑASCO NISSAUTO',
    NOMBRE: 'José García Muñoz'
  });

  const response = await fetch(`${baseUrl}/api/citas`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': 'clave-pruebas-http'
    },
    body: aCp1252(payload)
  });

  // Falla en la escritura a PostgreSQL (no hay base en las pruebas), pero para
  // entonces el cuerpo ya se decodificó: un 500 significa que pasó la validación
  // con los acentos intactos. Si el encoding se hubiera roto, el contenido
  // llegaría con U+FFFD igual, así que se comprueba el decodificador directo.
  assert.ok(response.status === 500 || response.status === 200);

  const { decodificar } = require('../middlewares/json-encoding.middleware');
  const { texto, encoding } = decodificar(aCp1252(payload));
  const objeto = JSON.parse(texto);

  assert.strictEqual(encoding, 'windows-1252');
  assert.strictEqual(objeto.AGENCIA, 'PEÑASCO NISSAUTO');
  assert.strictEqual(objeto.NOMBRE, 'José García Muñoz');
  assert.ok(!texto.includes('�'), 'no debe quedar ningún carácter de reemplazo');
});

test('un cuerpo en UTF-8 se sigue decodificando como UTF-8', () => {
  const { decodificar } = require('../middlewares/json-encoding.middleware');
  const original = { AGENCIA: 'PEÑASCO NISSAUTO', NOMBRE: 'José García Muñoz' };
  const { texto, encoding } = decodificar(Buffer.from(JSON.stringify(original), 'utf8'));

  assert.strictEqual(encoding, 'utf-8');
  assert.deepStrictEqual(JSON.parse(texto), original);
});

test('CORS rechaza con 403 un origen fuera de la whitelist', async () => {
  const response = await fetch(`${baseUrl}/no-existe`, {
    headers: { origin: 'https://no-permitido.example' }
  });
  const body = await response.json();

  assert.strictEqual(response.status, 403);
  assert.strictEqual(body.mensaje, 'Origen no permitido por CORS');
  assert.strictEqual(body.requestId, response.headers.get('x-request-id'));
});
