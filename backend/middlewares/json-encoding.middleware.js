const { TextDecoder } = require('util');
const logger = require('../utils/logger');

// Decodificador estricto: lanza si el buffer no es UTF-8 válido, en lugar de
// sustituir los bytes inválidos por U+FFFD (que es una pérdida irreversible).
const utf8Estricto = new TextDecoder('utf-8', { fatal: true });

// Windows-1252 coincide con ISO-8859-1 salvo en el rango 0x80-0x9F, donde define
// comillas tipográficas, guiones largos y algunos símbolos. Las vocales acentuadas
// y la Ñ del español viven en 0xC0-0xFF y son idénticas en ambos, así que este
// mapa solo cubre la diferencia.
const CP1252_ALTO = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…',
  0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8A: 'Š',
  0x8B: '‹', 0x8C: 'Œ', 0x8E: 'Ž', 0x91: '‘', 0x92: '’',
  0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x98: '˜', 0x99: '™', 0x9A: 'š', 0x9B: '›', 0x9C: 'œ',
  0x9E: 'ž', 0x9F: 'Ÿ'
};

function decodificarCp1252(buffer) {
  let salida = '';
  for (const byte of buffer) {
    salida += byte >= 0x80 && byte <= 0x9F
      ? (CP1252_ALTO[byte] || '�')
      : String.fromCharCode(byte);
  }
  return salida;
}

/**
 * Decodifica el cuerpo crudo a texto. Prefiere UTF-8; si el buffer no es UTF-8
 * válido asume Windows-1252, que es lo que mandan los clientes que no declaran
 * charset. Sin esto, Node convertiría cada byte inválido en U+FFFD y el carácter
 * original (Ñ, á, é...) se perdería para siempre antes de llegar a la base.
 */
function decodificar(buffer) {
  try {
    return { texto: utf8Estricto.decode(buffer), encoding: 'utf-8' };
  } catch {
    return { texto: decodificarCp1252(buffer), encoding: 'windows-1252' };
  }
}

/**
 * Sustituye a express.json(). Espera que un express.raw() previo haya dejado el
 * cuerpo como Buffer en req.body.
 */
function jsonConEncoding(req, res, next) {
  if (!Buffer.isBuffer(req.body)) return next();

  if (req.body.length === 0) {
    req.body = {};
    return next();
  }

  const { texto, encoding } = decodificar(req.body);

  if (encoding !== 'utf-8') {
    // El cliente no está mandando UTF-8. Se recupera el contenido, pero conviene
    // corregirlo en origen: declarar charset=utf-8 y serializar en UTF-8.
    logger.warn('http.encoding_recuperado', {
      requestId: req.requestId,
      encodingDetectado: encoding,
      bytes: req.body.length
    });
  }

  try {
    req.body = JSON.parse(texto);
  } catch (error) {
    // Se replican las marcas que pone body-parser para que el manejador de
    // errores de app.js lo trate como "JSON malformado" y responda 400.
    error.status = 400;
    error.body = texto;
    return next(error);
  }

  return next();
}

module.exports = jsonConEncoding;
module.exports.decodificar = decodificar;
module.exports.decodificarCp1252 = decodificarCp1252;
