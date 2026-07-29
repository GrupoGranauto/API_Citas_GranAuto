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

test('CORS rechaza con 403 un origen fuera de la whitelist', async () => {
  const response = await fetch(`${baseUrl}/no-existe`, {
    headers: { origin: 'https://no-permitido.example' }
  });
  const body = await response.json();

  assert.strictEqual(response.status, 403);
  assert.strictEqual(body.mensaje, 'Origen no permitido por CORS');
  assert.strictEqual(body.requestId, response.headers.get('x-request-id'));
});
