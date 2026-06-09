# Documentación de Integración: API de Citas de Servicio

Esta API REST permite recibir citas de servicio (de forma individual o en lotes masivos) e insertarlas directamente en la tabla destino de Google BigQuery: `base-maestra-gn.Respaldo.tab_respaldo_master_citas`.

---

## 1. Conexión y Endpoints

* **Entorno de Producción (URL base)**: `https://apicitasgranauto-production.up.railway.app`
* **Prefijo de Rutas**: `/api`
* **Método HTTP**: `POST`
* **Ruta de Inserción**: `/api/citas`

---

## 2. Autenticación

Todas las solicitudes a la API deben estar autenticadas mediante un encabezado (Header) HTTP personalizado.

* **Nombre del Header**: `x-api-key`
* **Valor**: *(Para obtener la API Key activa para el entorno de producción, favor de solicitarla directamente al **Equipo de Desarrollo**)*.

Si el Header `x-api-key` no es enviado o el valor es incorrecto, la API responderá con un error `401 Unauthorized`.

---

## 3. Esquema de Datos (Schema)

La API acepta un **objeto JSON** (para una sola cita) o un **arreglo de objetos JSON** (para carga por lotes).

### Columnas del Request

| Campo | Tipo | ¿Requerido? | Formato / Reglas | Descripción |
| :--- | :--- | :---: | :--- | :--- |
| **FOLIO_CITA** | `STRING` | **Sí** | Texto libre | Identificador único de la cita en origen |
| **FECHA_CITA** | `DATE` | **Sí** | `YYYY-MM-DD` | Fecha agendada de la cita |
| **AGENCIA** | `STRING` | **Sí** | Texto libre | Sucursal o agencia asignada (ej. "Toyota Chihuahua") |
| **NOMBRE** | `STRING` | **Sí** | Texto libre | Nombre completo del cliente |
| **SERIE** | `STRING` | **Sí** | Texto libre | Número de serie / VIN del vehículo (17 caracteres) |
| **FECHA_CAPTURA**| `DATE` | No | `YYYY-MM-DD` | Fecha en la que se registró la cita originalmente |
| **HORA_CITA** | `STRING` | No | `HH:MM` (ej. "10:30") | Hora agendada de la cita |
| **CAPTURO_CITA** | `STRING` | No | Texto libre | Canal o persona que registró (ej. "Portal", "Call Center") |
| **ORIGEN_CITA** | `STRING` | No | Texto libre | Canal origen de la cita (ej. "WEB", "TELEFONO") |
| **TIPO_CITA** | `STRING` | No | Texto libre | Tipo de cita (ej. "SERVICIO") |
| **TIPO_SERVICIO** | `STRING` | No | Texto libre | Detalle del servicio (ej. "MANTENIMIENTO") |
| **TELEFONO** | `STRING` | No | Numérico | Teléfono de contacto del cliente |
| **MODELO** | `STRING` | No | Texto libre | Modelo del vehículo (ej. "Corolla") |
| **ANO** | `STRING` | No | 4 dígitos (ej. "2024")| Año del vehículo |
| **ASESOR_SERVICIO**| `STRING` | No | Texto libre | Asesor asignado en la agencia |
| **HIGHLIGHT_MES_ANTERIOR**| `STRING` | No | Texto libre | Información adicional o banderas del mes anterior |

### Campos Auto-generados (No enviar en el Request)

* **VC (`STRING`)**: Es el correlativo incremental principal. La API consulta automáticamente el máximo actual en BigQuery (`max_vc`) y le asigna el valor secuencial correspondiente a cada registro de forma secuencial (`max_vc + 1`, `max_vc + 2`, etc.).
* **Campos Auditoría / Auditoria en `null`**: Los siguientes campos se insertan automáticamente con valor `null`:
  * `SERVICIO_EXPRESS`, `CONFIRMADA`, `ASISTIO`, `ORDEN`, `REAGENDO`, `ASISTIO_REAGENDA`, `OBSERVACIONES`, `TIPO_OPORTUNIDAD`, `ORIGEN_REAGENDA`, `CANCELADA`.

---

## 4. Ejemplos de Peticiones

### Petición 1: Inserción Individual
* **URL**: `POST https://apicitasgranauto-production.up.railway.app/api/citas`

```json
{
  "FOLIO_CITA": "12345",
  "FECHA_CAPTURA": "2026-06-08",
  "FECHA_CITA": "2026-06-15",
  "HORA_CITA": "10:00",
  "CAPTURO_CITA": "Portal",
  "ORIGEN_CITA": "WEB",
  "TIPO_CITA": "SERVICIO",
  "TIPO_SERVICIO": "MANTENIMIENTO",
  "AGENCIA": "Toyota Chihuahua",
  "NOMBRE": "Juan Perez",
  "TELEFONO": "6141234567",
  "MODELO": "Corolla",
  "ANO": "2024",
  "SERIE": "JT123456789",
  "ASESOR_SERVICIO": "Carlos Lopez"
}
```

### Petición 2: Inserción Masiva (Lote)
* **URL**: `POST https://apicitasgranauto-production.up.railway.app/api/citas`

```json
[
  {
    "FOLIO_CITA": "12346",
    "FECHA_CAPTURA": "2026-06-08",
    "FECHA_CITA": "2026-06-16",
    "AGENCIA": "Toyota Chihuahua",
    "NOMBRE": "Maria Gomez",
    "SERIE": "JT987654321"
  },
  {
    "FOLIO_CITA": "12347",
    "FECHA_CITA": "2026-06-17",
    "AGENCIA": "Toyota Chihuahua",
    "NOMBRE": "Pedro Martinez",
    "SERIE": "JT555555555"
  }
]
```

---

## 5. Respuestas de la API

### Respuesta Exitosa (`200 OK`)
Devuelve la confirmación junto con el número de registros insertados y el rango correlativo `VC` asignado.

```json
{
  "ok": true,
  "mensaje": "Citas insertadas correctamente",
  "registros_insertados": 2,
  "vc_inicial": "15001",
  "vc_final": "15002"
}
```

### Error de Validación (`400 Bad Request`)
Se produce al omitir campos requeridos o al enviar fechas con un formato no válido.

```json
{
  "ok": false,
  "mensaje": "Campo requerido: FOLIO_CITA"
}
```
o
```json
{
  "ok": false,
  "mensaje": "Formato inválido para FECHA_CITA. Debe ser YYYY-MM-DD"
}
```

### Error de Autenticación (`401 Unauthorized`)
Se produce si no se envía el header `x-api-key` o si la clave es incorrecta.

```json
{
  "ok": false,
  "mensaje": "API KEY inválida"
}
```

### Error Interno (`500 Internal Server Error`)
Manejo de errores seguro ante problemas de red, base de datos o fallos internos.

```json
{
  "ok": false,
  "mensaje": "Error interno al procesar e insertar las citas en la base de datos"
}
```
