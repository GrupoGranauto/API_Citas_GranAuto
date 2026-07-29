const crypto = require('crypto');
const logger = require('../utils/logger');

const REQUEST_ID_VALIDO = /^[a-zA-Z0-9._-]{1,100}$/;

function observabilidad(req, res, next) {
  const idRecibido = req.get('x-request-id');
  req.requestId = idRecibido && REQUEST_ID_VALIDO.test(idRecibido)
    ? idRecibido
    : crypto.randomUUID();
  res.setHeader('x-request-id', req.requestId);

  const inicio = process.hrtime.bigint();
  let terminado = false;

  function registrar(evento) {
    if (terminado) return;
    terminado = true;

    const duracionMs = Number(process.hrtime.bigint() - inicio) / 1e6;
    const metadata = {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl ? req.originalUrl.split('?')[0] : req.path,
      statusCode: res.statusCode,
      durationMs: Number(duracionMs.toFixed(2))
    };

    // Los chequeos exitosos de Railway son muy frecuentes y no aportan señal.
    if (metadata.path === '/health' && res.statusCode < 400) return;
    if (evento === 'aborted') {
      return logger.warn('http.request_aborted', metadata);
    }
    if (res.statusCode >= 500) return logger.error('http.request_completed', metadata);
    if (res.statusCode >= 400) return logger.warn('http.request_completed', metadata);
    return logger.info('http.request_completed', metadata);
  }

  res.once('finish', () => registrar('finish'));
  res.once('close', () => {
    if (!res.writableEnded) registrar('aborted');
  });
  next();
}

module.exports = observabilidad;
