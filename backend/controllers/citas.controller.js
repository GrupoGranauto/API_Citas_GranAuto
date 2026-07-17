const bigqueryService = require('../services/bigquery.service');
const postgresService = require('../services/postgres.service');

// Expresión regular para validar formato YYYY-MM-DD
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Máximo de registros por petición. Evita lotes gigantes que disparan costo y
// latencia (protección contra DoS/abuso accidental).
const MAX_REGISTROS = 1000;

/**
 * Valida que una cadena sea una fecha real en formato YYYY-MM-DD.
 * No basta el formato: "2026-13-45" cumple el patrón pero no es una fecha válida,
 * y una fecha inválida rompería la deduplicación (la llave usa FECHA_CAPTURA).
 */
function esFechaValida(str) {
  if (!DATE_REGEX.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Deduplica un lote por la tupla (FOLIO_CITA, AGENCIA, FECHA_CAPTURA).
 * Si la misma llave aparece varias veces, gana el último registro del arreglo.
 * La llave se arma con JSON.stringify para que sea inequívoca (concatenar con "-"
 * colisiona si algún campo contiene guiones).
 */
function deduplicarLote(registros) {
  const mapaPorLlave = new Map();
  for (const reg of registros) {
    const llave = JSON.stringify([reg.FOLIO_CITA, reg.AGENCIA, reg.FECHA_CAPTURA]);
    mapaPorLlave.set(llave, reg);
  }
  return Array.from(mapaPorLlave.values());
}

/**
 * Controlador para la creación e inserción de citas de servicio.
 * El almacenamiento primario ahora es PostgreSQL (Railway).
 */
async function crearCitas(req, res) {
  try {
    // 1. Validar que exista cuerpo en la petición
    if (!req.body) {
      return res.status(400).json({
        ok: false,
        mensaje: "El cuerpo de la petición no puede estar vacío"
      });
    }

    // 2. Normalizar payload a un arreglo
    let registros = [];
    if (Array.isArray(req.body)) {
      registros = req.body;
    } else if (typeof req.body === 'object' && req.body !== null) {
      registros = [req.body];
    } else {
      return res.status(400).json({
        ok: false,
        mensaje: "El cuerpo de la petición debe ser un objeto o un arreglo de objetos"
      });
    }

    if (registros.length === 0) {
      return res.status(400).json({
        ok: false,
        mensaje: "No se proporcionaron registros de citas para insertar"
      });
    }

    // 2.1 Limitar el tamaño del lote para proteger la base de datos de peticiones abusivas.
    if (registros.length > MAX_REGISTROS) {
      return res.status(400).json({
        ok: false,
        mensaje: `El lote excede el máximo de ${MAX_REGISTROS} registros por petición`
      });
    }

    // 3. Validar requeridos y formato de fechas para cada registro
    for (let i = 0; i < registros.length; i++) {
      const reg = registros[i];

      // Campos requeridos mínimos
      if (!reg.FOLIO_CITA) {
        return res.status(400).json({ ok: false, mensaje: "Campo requerido: FOLIO_CITA" });
      }
      if (!reg.FECHA_CITA) {
        return res.status(400).json({ ok: false, mensaje: "Campo requerido: FECHA_CITA" });
      }
      if (!reg.AGENCIA) {
        return res.status(400).json({ ok: false, mensaje: "Campo requerido: AGENCIA" });
      }
      if (!reg.NOMBRE) {
        return res.status(400).json({ ok: false, mensaje: "Campo requerido: NOMBRE" });
      }
      // FECHA_CAPTURA es requerida porque forma parte de la llave de deduplicación
      if (!reg.FECHA_CAPTURA) {
        return res.status(400).json({ ok: false, mensaje: "Campo requerido: FECHA_CAPTURA" });
      }

      // Validar que FECHA_CITA sea una fecha real en formato YYYY-MM-DD
      if (!esFechaValida(reg.FECHA_CITA)) {
        return res.status(400).json({
          ok: false,
          mensaje: "Formato inválido para FECHA_CITA. Debe ser una fecha real YYYY-MM-DD"
        });
      }

      // Validar que FECHA_CAPTURA sea una fecha real en formato YYYY-MM-DD
      if (!esFechaValida(reg.FECHA_CAPTURA)) {
        return res.status(400).json({
          ok: false,
          mensaje: "Formato inválido para FECHA_CAPTURA. Debe ser una fecha real YYYY-MM-DD"
        });
      }
    }

    // 3.1 Deduplicar dentro del mismo lote (gana el último registro por llave).
    registros = deduplicarLote(registros);

    // 4. Formatear los registros.
    const registrosFormateados = registros.map((reg) => {
      return {
        FOLIO_CITA:            reg.FOLIO_CITA ? String(reg.FOLIO_CITA) : null,
        FECHA_CAPTURA:         reg.FECHA_CAPTURA ? String(reg.FECHA_CAPTURA) : null,
        FECHA_CITA:            reg.FECHA_CITA ? String(reg.FECHA_CITA) : null,
        HORA_CITA:             reg.HORA_CITA ? String(reg.HORA_CITA) : null,
        CAPTURO_CITA:          reg.CAPTURO_CITA ? String(reg.CAPTURO_CITA) : null,
        ORIGEN_CITA:           reg.ORIGEN_CITA ? String(reg.ORIGEN_CITA) : null,
        TIPO_CITA:             reg.TIPO_CITA ? String(reg.TIPO_CITA) : null,
        TIPO_SERVICIO:         reg.TIPO_SERVICIO ? String(reg.TIPO_SERVICIO) : null,
        AGENCIA:               reg.AGENCIA ? String(reg.AGENCIA) : null,
        NOMBRE:                reg.NOMBRE ? String(reg.NOMBRE) : null,
        TELEFONO:              reg.TELEFONO ? String(reg.TELEFONO) : null,
        MODELO:                reg.MODELO ? String(reg.MODELO) : null,
        ANO:                   reg.ANO ? String(reg.ANO) : null,
        SERIE:                 reg.SERIE ? String(reg.SERIE) : null,
        ASESOR_SERVICIO:       reg.ASESOR_SERVICIO ? String(reg.ASESOR_SERVICIO) : null,
        // Campos que deben forzarse en null
        SERVICIO_EXPRESS:      null,
        CONFIRMADA:            null,
        ASISTIO:               null,
        ORDEN:                 null,
        REAGENDO:              null,
        ASISTIO_REAGENDA:      null,
        OBSERVACIONES:         null,
        TIPO_OPORTUNIDAD:      null,
        ORIGEN_REAGENDA:       null,
        CANCELADA:             null,
        // Campo del esquema destino
        HIGHLIGHT_MES_ANTERIOR: reg.HIGHLIGHT_MES_ANTERIOR ? String(reg.HIGHLIGHT_MES_ANTERIOR) : null
      };
    });

    // 5. Insertar/actualizar en PostgreSQL (almacenamiento primario).
    // Upsert por llave FOLIO_CITA-AGENCIA-FECHA_CAPTURA.
    await postgresService.upsertCitas(registrosFormateados);

    // 6. Retornar respuesta exitosa
    return res.status(200).json({
      ok: true,
      mensaje: "Citas insertadas correctamente",
      registros_insertados: registros.length
    });

  } catch (error) {
    // El error de inserción ya fue logueado en el servicio. Aquí solo el mensaje,
    // sin volcar el objeto completo (podría contener datos del payload / PII).
    console.error("Error no manejado en crearCitas:", error.message);
    return res.status(500).json({
      ok: false,
      mensaje: "Error interno al procesar e insertar las citas en la base de datos"
    });
  }
}

/**
 * Sincroniza hacia BigQuery todas las citas de una FECHA_CITA específica,
 * tomando los datos desde PostgreSQL como fuente de verdad.
 *
 * Body esperado: { "fecha": "YYYY-MM-DD" }
 */
async function syncBigquery(req, res) {
  try {
    const { fecha } = req.body || {};

    // Validar que se proporcionó la fecha
    if (!fecha) {
      return res.status(400).json({
        ok: false,
        mensaje: "Campo requerido: fecha (formato YYYY-MM-DD)"
      });
    }

    // Validar que sea una fecha real
    if (!esFechaValida(fecha)) {
      return res.status(400).json({
        ok: false,
        mensaje: "Formato inválido para fecha. Debe ser una fecha real YYYY-MM-DD"
      });
    }

    // Leer desde PostgreSQL todas las citas de esa FECHA_CITA
    const registros = await postgresService.getCitasByFecha(fecha);

    if (registros.length === 0) {
      return res.status(200).json({
        ok: true,
        mensaje: `No se encontraron citas para la fecha ${fecha} en la base de datos`,
        registros_sincronizados: 0
      });
    }

    // Insertar/actualizar en BigQuery usando el servicio existente
    await bigqueryService.upsertCitas(registros);

    return res.status(200).json({
      ok: true,
      mensaje: `Citas de ${fecha} sincronizadas correctamente en BigQuery`,
      registros_sincronizados: registros.length
    });

  } catch (error) {
    console.error("Error no manejado en syncBigquery:", error.message);
    return res.status(500).json({
      ok: false,
      mensaje: "Error interno al sincronizar citas con BigQuery"
    });
  }
}

module.exports = {
  crearCitas,
  syncBigquery,
  esFechaValida,
  deduplicarLote,
  MAX_REGISTROS
};
