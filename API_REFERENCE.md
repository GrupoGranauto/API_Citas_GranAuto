<div align="center">

# 📅 API de Citas de Servicio

**Registra citas de servicio y almacénalas en BigQuery**

Recibe una o varias citas por petición · Valida los datos · Evita duplicados · Asigna un correlativo interno

`REST` · `JSON` · `HTTPS`

</div>

---

## 📑 Contenido

1. [Inicio rápido](#-inicio-rápido)
2. [Autenticación](#-autenticación)
3. [Endpoints](#-endpoints)
4. [Campos del registro](#-campos-del-registro)
5. [Cómo funciona la deduplicación](#-cómo-funciona-la-deduplicación)
6. [Respuestas y códigos de estado](#-respuestas-y-códigos-de-estado)
7. [Buenas prácticas](#-buenas-prácticas)

---

## 🚀 Inicio rápido

Registra una cita con una sola llamada:

```bash
curl -X POST https://apicitasgranauto-production.up.railway.app/api/citas \
  -H "Content-Type: application/json" \
  -H "x-api-key: TU_API_KEY" \
  -d '{
    "FOLIO_CITA": "12345",
    "FECHA_CAPTURA": "2026-07-08",
    "FECHA_CITA": "2026-07-15",
    "AGENCIA": "Toyota Chihuahua",
    "NOMBRE": "Juan Perez"
  }'
```

Respuesta:

```json
{ "ok": true, "mensaje": "Citas insertadas correctamente", "registros_insertados": 1 }
```

> 💡 Con esos **5 campos requeridos** basta. Todo lo demás es opcional.

| | |
| :--- | :--- |
| 🌐 **URL base** | `https://apicitasgranauto-production.up.railway.app` |
| 🔑 **Auth** | Header `x-api-key` |
| 📦 **Formato** | JSON (objeto o arreglo) |
| 📊 **Límite** | 1000 registros por petición |

---

## 🔐 Autenticación

Toda petición a `/api/citas` necesita tu API Key en el header:

```
x-api-key: TU_API_KEY
```

Sin clave o con clave incorrecta → **`401 Unauthorized`**.

---

## 🔌 Endpoints

### `POST` &nbsp;`/api/citas` — Registrar citas

Registra **una** cita (objeto) o **varias** (arreglo) en una sola petición.

**Headers**

| Header | Valor | Requerido |
| :--- | :--- | :---: |
| `Content-Type` | `application/json` | ✅ |
| `x-api-key` | Tu API Key | ✅ |

**Cuerpo** — acepta dos formas:

```jsonc
// Una cita
{ "FOLIO_CITA": "12345", "FECHA_CAPTURA": "2026-07-08", ... }

// Varias citas (hasta 1000)
[
  { "FOLIO_CITA": "12346", ... },
  { "FOLIO_CITA": "12347", ... }
]
```

<details>
<summary>📥 Ejemplo: registrar varias citas</summary>

```bash
curl -X POST https://apicitasgranauto-production.up.railway.app/api/citas \
  -H "Content-Type: application/json" \
  -H "x-api-key: TU_API_KEY" \
  -d '[
    {
      "FOLIO_CITA": "12346",
      "FECHA_CAPTURA": "2026-07-08",
      "FECHA_CITA": "2026-07-16",
      "AGENCIA": "Toyota Chihuahua",
      "NOMBRE": "Maria Gomez"
    },
    {
      "FOLIO_CITA": "12347",
      "FECHA_CAPTURA": "2026-07-08",
      "FECHA_CITA": "2026-07-17",
      "AGENCIA": "Toyota Chihuahua",
      "NOMBRE": "Pedro Martinez"
    }
  ]'
```

</details>

---

### `GET` &nbsp;`/health` — Estado del servicio

Monitoreo. **No** requiere autenticación.

```json
{
  "status": "UP",
  "timestamp": "2026-07-11T17:00:00.000Z",
  "message": "Servicio de Citas activo"
}
```

---

## 📋 Campos del registro

### ✅ Requeridos

Estos 5 campos son **obligatorios** en cada cita:

| Campo | Tipo | Formato | Descripción |
| :--- | :--- | :--- | :--- |
| `FOLIO_CITA` | STRING | Texto libre | Identificador de la cita en el sistema de origen |
| `FECHA_CITA` | DATE | `YYYY-MM-DD` | Fecha agendada de la cita |
| `FECHA_CAPTURA` | DATE | `YYYY-MM-DD` | Fecha en que se registró · 🔑 parte de la llave |
| `AGENCIA` | STRING | Texto libre | Sucursal o agencia asignada |
| `NOMBRE` | STRING | Texto libre | Nombre completo del cliente |

### ➕ Opcionales

| Campo | Tipo | Formato | Descripción |
| :--- | :--- | :--- | :--- |
| `HORA_CITA` | STRING | `HH:MM` | Hora agendada (ej. "10:30") |
| `CAPTURO_CITA` | STRING | Texto libre | Canal o persona que registró la cita |
| `ORIGEN_CITA` | STRING | Texto libre | Canal origen (ej. "WEB", "TELEFONO") |
| `TIPO_CITA` | STRING | Texto libre | Tipo de cita (ej. "SERVICIO") |
| `TIPO_SERVICIO` | STRING | Texto libre | Detalle del servicio (ej. "MANTENIMIENTO") |
| `TELEFONO` | STRING | Numérico | Teléfono de contacto |
| `MODELO` | STRING | Texto libre | Modelo del vehículo |
| `ANO` | STRING | 4 dígitos | Año del vehículo (ej. "2024") |
| `SERIE` | STRING | Texto libre | Número de serie / VIN |
| `ASESOR_SERVICIO` | STRING | Texto libre | Asesor asignado en la agencia |
| `HIGHLIGHT_MES_ANTERIOR` | STRING | Texto libre | Información adicional |

> ⚠️ **Fechas reales.** `FECHA_CITA` y `FECHA_CAPTURA` deben ser fechas válidas en formato `YYYY-MM-DD`. Un valor con formato correcto pero imposible (ej. `2026-13-45`, o `2026-02-29` en año no bisiesto) es **rechazado**.

> 🔒 **Campos del sistema.** El correlativo `VC` y los campos de seguimiento (`SERVICIO_EXPRESS`, `CONFIRMADA`, `ASISTIO`, `ORDEN`, `REAGENDO`, `ASISTIO_REAGENDA`, `OBSERVACIONES`, `TIPO_OPORTUNIDAD`, `ORIGEN_REAGENDA`, `CANCELADA`) los administra el backend. Si los envías, **se ignoran**.

---

## 🔁 Cómo funciona la deduplicación

Cada cita se identifica de forma única por **tres campos combinados**:

```
🔑 Llave  =  FOLIO_CITA  +  AGENCIA  +  FECHA_CAPTURA
```

Al recibir un registro, la API decide automáticamente:

| Situación | Acción |
| :--- | :--- |
| La llave **no existe** | ➕ **Inserta** una cita nueva con un `VC` nuevo |
| La llave **ya existe** | ♻️ **Reemplaza** la cita anterior con los datos nuevos (conserva su `VC`) |
| La misma llave llega **repetida en una petición** | 🏁 Se queda con **el último** registro de la lista |

**Resultado:** nunca hay duplicados. Por cada combinación de `FOLIO_CITA` + `AGENCIA` + `FECHA_CAPTURA` existe **un único registro**, siempre con la información más reciente.

> 💡 Para **actualizar** una cita, reenvíala con la misma llave y los datos nuevos. La API la reemplaza sola.

---

## 📨 Respuestas y códigos de estado

| Código | Significado |
| :---: | :--- |
| 🟢 `200` | Citas registradas correctamente |
| 🟡 `400` | Petición inválida (campo faltante, fecha inválida, límite de lote, JSON malformado) |
| 🔴 `401` | API Key faltante o inválida |
| 🟠 `429` | Se superó el límite de peticiones |
| 🔴 `500` | Error interno del servidor |

### 🟢 Éxito — `200 OK`

```json
{
  "ok": true,
  "mensaje": "Citas insertadas correctamente",
  "registros_insertados": 2
}
```

| Campo | Descripción |
| :--- | :--- |
| `ok` | `true` si la operación fue exitosa |
| `mensaje` | Descripción del resultado |
| `registros_insertados` | Registros procesados (tras deduplicar la petición) |

### 🟡 Validación — `400 Bad Request`

```json
{ "ok": false, "mensaje": "Campo requerido: FOLIO_CITA" }
```

<details>
<summary>Ver otros mensajes de validación</summary>

```json
{ "ok": false, "mensaje": "Formato inválido para FECHA_CITA. Debe ser una fecha real YYYY-MM-DD" }
```
```json
{ "ok": false, "mensaje": "El lote excede el máximo de 1000 registros por petición" }
```
```json
{ "ok": false, "mensaje": "JSON malformado en el cuerpo de la petición" }
```

</details>

### 🔴 No autorizado — `401`

```json
{ "ok": false, "mensaje": "API KEY inválida" }
```

### 🟠 Límite excedido — `429`

```json
{ "ok": false, "mensaje": "Demasiadas peticiones, intenta más tarde" }
```

### 🔴 Error interno — `500`

```json
{ "ok": false, "mensaje": "Error interno al procesar e insertar las citas en la base de datos" }
```

---

## ✨ Buenas prácticas

- 📦 **Envía lotes** cuando registres varias citas a la vez (hasta 1000 por petición) en lugar de una llamada por cita.
- 🔑 **Mantén fijo el `FECHA_CAPTURA`** de cada cita: es parte de la llave. Cambiarlo crea un registro nuevo en vez de actualizar.
- ♻️ **Para actualizar**, reenvía el registro completo con la misma llave (`FOLIO_CITA` + `AGENCIA` + `FECHA_CAPTURA`) y los datos nuevos.
- 📅 **Fechas** siempre en formato `YYYY-MM-DD`.
- 🔁 **Maneja `429` y `5xx`** con reintentos y espera progresiva (backoff) del lado del cliente.

---

<div align="center">
<sub>API de Citas de Servicio · Integración BigQuery</sub>
</div>
