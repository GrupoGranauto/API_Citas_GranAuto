require('dotenv').config();
const postgresService = require('./services/postgres.service');
const logger = require('./utils/logger');

let server;
let apagando = false;

function leerEntero(nombre, valorPredeterminado, minimo, maximo) {
  const valorCrudo = process.env[nombre];
  if (valorCrudo === undefined || valorCrudo === '') return valorPredeterminado;
  const valor = Number(valorCrudo);
  if (!Number.isInteger(valor) || valor < minimo || valor > maximo) {
    const error = new Error(`${nombre} inválido: ${valorCrudo}`);
    error.code = 'CONFIG_INVALID';
    throw error;
  }
  return valor;
}

function validarConfiguracion() {
  const faltantes = ['DATABASE_URL', 'API_KEY'].filter((nombre) => !process.env[nombre]);
  if (faltantes.length) {
    const error = new Error(`Variables de entorno requeridas ausentes: ${faltantes.join(', ')}`);
    error.code = 'CONFIG_MISSING';
    throw error;
  }
  if (process.env.API_KEY === 'CAMBIAR_API_KEY') {
    const error = new Error('API_KEY conserva el valor inseguro del archivo de ejemplo');
    error.code = 'CONFIG_INSECURE';
    throw error;
  }

  const configuracion = {
    port: leerEntero('PORT', 3000, 1, 65535),
    shutdownTimeoutMs: leerEntero('SHUTDOWN_TIMEOUT_MS', 10000, 1000, 120000)
  };
  leerEntero('RATE_LIMIT_WINDOW_MS', 60000, 1000, 86400000);
  leerEntero('RATE_LIMIT_MAX', 600, 1, 1000000);
  leerEntero('PG_CONNECTION_TIMEOUT_MS', 5000, 100, 120000);
  leerEntero('PG_QUERY_TIMEOUT_MS', 30000, 100, 600000);
  return configuracion;
}

async function cerrarServidorHttp() {
  if (!server) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function apagar(signal, error) {
  if (apagando) return;
  apagando = true;
  logger[error ? 'fatal' : 'info']('server.shutdown_started', { signal }, error);

  let shutdownTimeoutMs = 10000;
  try {
    shutdownTimeoutMs = leerEntero('SHUTDOWN_TIMEOUT_MS', 10000, 1000, 120000);
  } catch (configError) {
    logger.error('server.invalid_shutdown_timeout', {}, configError);
  }

  const forzar = setTimeout(() => {
    logger.fatal('server.shutdown_timeout', { signal });
    process.exit(1);
  }, shutdownTimeoutMs);
  forzar.unref();

  try {
    await cerrarServidorHttp();
    await postgresService.close();
    clearTimeout(forzar);
    logger.info('server.shutdown_completed', { signal });
    process.exit(error ? 1 : 0);
  } catch (shutdownError) {
    logger.fatal('server.shutdown_failed', { signal }, shutdownError);
    process.exit(1);
  }
}

function instalarManejadoresDeProceso() {
  process.once('SIGTERM', () => apagar('SIGTERM'));
  process.once('SIGINT', () => apagar('SIGINT'));
  process.once('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    apagar('unhandledRejection', error);
  });
  process.once('uncaughtException', (error) => apagar('uncaughtException', error));
}

async function iniciar() {
  const { port } = validarConfiguracion();
  instalarManejadoresDeProceso();
  await postgresService.initDB();
  const app = require('./app');
  server = app.listen(port, () => {
    logger.info('server.started', { port });
  });
  return server;
}

if (require.main === module) {
  iniciar().catch((error) => {
    logger.fatal('server.startup_failed', {}, error);
    process.exit(1);
  });
}

module.exports = {
  iniciar,
  apagar,
  leerEntero,
  validarConfiguracion
};
