const NIVELES = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };
const nivelConfigurado = String(process.env.LOG_LEVEL || 'info').toLowerCase();
const umbral = NIVELES[nivelConfigurado] || NIVELES.info;

const CAMPOS_SENSIBLES = /api[-_]?key|authorization|cookie|password|secret|token|credential|telefono|nombre|serie/i;

function limpiar(valor, profundidad = 0, vistos = new WeakSet()) {
  if (valor === null || valor === undefined) return valor;
  if (profundidad > 5) return '[TRUNCATED]';
  if (typeof valor === 'bigint') return valor.toString();
  if (typeof valor !== 'object') return valor;
  if (vistos.has(valor)) return '[CIRCULAR]';

  vistos.add(valor);
  if (Array.isArray(valor)) {
    return valor.slice(0, 20).map((item) => limpiar(item, profundidad + 1, vistos));
  }

  const resultado = {};
  for (const [clave, contenido] of Object.entries(valor)) {
    resultado[clave] = CAMPOS_SENSIBLES.test(clave)
      ? '[REDACTED]'
      : limpiar(contenido, profundidad + 1, vistos);
  }
  return resultado;
}

function serializarError(error) {
  if (!error) return undefined;
  return limpiar({
    name: error.name,
    message: error.message || String(error),
    stack: error.stack,
    code: error.code,
    status: error.status || error.statusCode,
    details: error.errors
  });
}

function escribir(level, event, metadata = {}, error) {
  if (NIVELES[level] < umbral) return;

  const registro = limpiar({
    timestamp: new Date().toISOString(),
    level,
    event,
    service: process.env.RAILWAY_SERVICE_NAME || process.env.SERVICE_NAME || 'api-citas',
    environment: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'development',
    ...metadata,
    ...(error ? { error: serializarError(error) } : {})
  });

  const linea = JSON.stringify(registro);
  if (level === 'error' || level === 'fatal') {
    console.error(linea);
  } else if (level === 'warn') {
    console.warn(linea);
  } else {
    console.log(linea);
  }
}

module.exports = {
  debug: (event, metadata) => escribir('debug', event, metadata),
  info: (event, metadata) => escribir('info', event, metadata),
  warn: (event, metadata, error) => escribir('warn', event, metadata, error),
  error: (event, metadata, error) => escribir('error', event, metadata, error),
  fatal: (event, metadata, error) => escribir('fatal', event, metadata, error),
  limpiar,
  serializarError
};
