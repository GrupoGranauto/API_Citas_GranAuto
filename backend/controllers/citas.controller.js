const bigqueryService = require('../services/bigquery.service');

// Expresión regular para validar formato YYYY-MM-DD
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Controlador para la creación e inserción de citas de servicio.
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
      if (!reg.SERIE) {
        return res.status(400).json({ ok: false, mensaje: "Campo requerido: SERIE" });
      }

      // Validar formato YYYY-MM-DD de FECHA_CITA
      if (!DATE_REGEX.test(reg.FECHA_CITA)) {
        return res.status(400).json({
          ok: false,
          mensaje: "Formato inválido para FECHA_CITA. Debe ser YYYY-MM-DD"
        });
      }

      // Validar formato YYYY-MM-DD de FECHA_CAPTURA si está presente
      if (reg.FECHA_CAPTURA && !DATE_REGEX.test(reg.FECHA_CAPTURA)) {
        return res.status(400).json({
          ok: false,
          mensaje: "Formato inválido para FECHA_CAPTURA. Debe ser YYYY-MM-DD"
        });
      }
    }

    // 4. Obtener el max_vc actual de BigQuery
    let maxVc = 0;
    try {
      maxVc = await bigqueryService.obtenerMaxVC();
    } catch (err) {
      console.error("Error al consultar obtenerMaxVC durante la inserción:", err);
      return res.status(500).json({
        ok: false,
        mensaje: "Error interno al verificar correlativos en la base de datos"
      });
    }

    // 5. Formatear los registros y asignar VC incremental
    const vcInicialNum = maxVc + 1;
    const vcFinalNum = maxVc + registros.length;

    const registrosFormateados = registros.map((reg, index) => {
      const currentVc = (maxVc + index + 1).toString();

      return {
        VC: currentVc,
        FOLIO_CITA: reg.FOLIO_CITA ? String(reg.FOLIO_CITA) : null,
        FECHA_CAPTURA: reg.FECHA_CAPTURA ? String(reg.FECHA_CAPTURA) : null,
        FECHA_CITA: reg.FECHA_CITA ? String(reg.FECHA_CITA) : null,
        HORA_CITA: reg.HORA_CITA ? String(reg.HORA_CITA) : null,
        CAPTURO_CITA: reg.CAPTURO_CITA ? String(reg.CAPTURO_CITA) : null,
        ORIGEN_CITA: reg.ORIGEN_CITA ? String(reg.ORIGEN_CITA) : null,
        TIPO_CITA: reg.TIPO_CITA ? String(reg.TIPO_CITA) : null,
        TIPO_SERVICIO: reg.TIPO_SERVICIO ? String(reg.TIPO_SERVICIO) : null,
        AGENCIA: reg.AGENCIA ? String(reg.AGENCIA) : null,
        NOMBRE: reg.NOMBRE ? String(reg.NOMBRE) : null,
        TELEFONO: reg.TELEFONO ? String(reg.TELEFONO) : null,
        MODELO: reg.MODELO ? String(reg.MODELO) : null,
        ANO: reg.ANO ? String(reg.ANO) : null,
        SERIE: reg.SERIE ? String(reg.SERIE) : null,
        ASESOR_SERVICIO: reg.ASESOR_SERVICIO ? String(reg.ASESOR_SERVICIO) : null,
        // Campos que deben forzarse en null
        SERVICIO_EXPRESS: null,
        CONFIRMADA: null,
        ASISTIO: null,
        ORDEN: null,
        REAGENDO: null,
        ASISTIO_REAGENDA: null,
        OBSERVACIONES: null,
        TIPO_OPORTUNIDAD: null,
        ORIGEN_REAGENDA: null,
        CANCELADA: null,
        // Campo del esquema destino
        HIGHLIGHT_MES_ANTERIOR: reg.HIGHLIGHT_MES_ANTERIOR ? String(reg.HIGHLIGHT_MES_ANTERIOR) : null
      };
    });

    // 6. Insertar en BigQuery
    await bigqueryService.insertarCitas(registrosFormateados);

    // 7. Retornar respuesta exitosa
    return res.status(200).json({
      ok: true,
      mensaje: "Citas insertadas correctamente",
      registros_insertados: registros.length,
      vc_inicial: vcInicialNum.toString(),
      vc_final: vcFinalNum.toString()
    });

  } catch (error) {
    // El error de inserción ya fue logueado detalladamente en el servicio.
    // Respondemos con un mensaje seguro al cliente.
    console.error("Error no manejado en crearCitas:", error);
    return res.status(500).json({
      ok: false,
      mensaje: "Error interno al procesar e insertar las citas en la base de datos"
    });
  }
}

module.exports = {
  crearCitas
};
