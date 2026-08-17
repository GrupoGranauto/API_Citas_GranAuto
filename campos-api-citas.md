# Campos API de Citas — Especificación para el DMS

**Endpoint:** `POST https://apicitasgranauto-production.up.railway.app/api/citas`
**Autenticación:** header `x-api-key`
**Formato:** JSON — un objeto (una cita) o un arreglo (hasta 1000 citas)

---

## 1. Campos nuevos

Estos cinco campos se agregaron a la API. **Todos son opcionales**, pero se piden para completar la información de la cita.

| Campo API | Campo en el DMS | Ejemplo |
| :--- | :--- | :--- |
| `STATUS_CITA` | Estatus de Cita | `"Activa"` |
| `TEL_CASA` | Tel. de Casa | `"6621234567"` |
| `OFICINA` | Tel. y Ext. (Oficina) | `"289-34-00 ext 15"` |
| `PLACAS` | Placas | `"WAK8497"` |
| `CODIGO_POSTAL` | C.P. | `"83000"` |

Todos son texto libre. La API no valida su formato: se guardan tal como lleguen.

---

## 2. Campos obligatorios

Estos cinco son **requeridos en toda petición**, tanto al dar de alta como al actualizar. Si falta cualquiera, la API responde `400` y **la cita completa se rechaza**.

| Campo | Formato | Descripción |
| :--- | :--- | :--- |
| `FOLIO_CITA` | Texto | No. de Cita. Enviar **con los ceros a la izquierda**: `"00051391"`, no `51391` |
| `FECHA_CITA` | `YYYY-MM-DD` | Fecha agendada de la cita |
| `FECHA_CAPTURA` | `YYYY-MM-DD` | Fecha de alta del registro |
| `AGENCIA` | Texto | Agencia que atiende |
| `NOMBRE` | Texto | Nombre del cliente |

---

## 3. Campos opcionales

| Campo | Campo en el DMS | Formato |
| :--- | :--- | :--- |
| `HORA_CITA` | Hr. de Cita | `"08:35"` |
| `CAPTURO_CITA` | Usuario / Elaboró Captura | Texto |
| `ORIGEN_CITA` | Origen de la Cita | Texto |
| `TIPO_CITA` | Tipo de Cita | Texto |
| `TIPO_SERVICIO` | Tipo de Servicio | Texto |
| `TELEFONO` | Tel. Celular | Texto |
| `MODELO` | Línea de Unidad | Texto |
| `ANO` | Año Modelo | `"2024"` |
| `SERIE` | # de Serie | Texto |
| `ASESOR_SERVICIO` | No. de Asesor / Asesor | Texto |
| `HIGHLIGHT_MES_ANTERIOR` | — | Texto |
| `STATUS_CITA` | Estatus de Cita | Texto |
| `TEL_CASA` | Tel. de Casa | Texto |
| `OFICINA` | Tel. y Ext. (Oficina) | Texto |
| `PLACAS` | Placas | Texto |
| `CODIGO_POSTAL` | C.P. | Texto |

Cualquier campo que no esté en esta lista **se ignora en silencio**, sin error.

> **Los tres teléfonos.** El DMS maneja tres números y cada uno tiene su campo. Importa mandarlos en el correcto:
>
> | Campo API | Campo en el DMS |
> | :--- | :--- |
> | `TELEFONO` | **Tel. Celular** |
> | `OFICINA` | **Tel. y Ext. (Oficina)** |
> | `TEL_CASA` | **Tel. de Casa** |
>
> `TELEFONO` ya existía y ahora corresponde específicamente al **celular**. No mandar el mismo número en dos campos.

---

## 4. Reglas importantes

### 4.1 Codificación: UTF-8 obligatorio

El cuerpo de la petición debe ir en **UTF-8**, con el header:

```
Content-Type: application/json; charset=utf-8
```

Sin esto, la `Ñ` y las vocales acentuadas llegan corruptas. Ejemplo real de lo que pasó:

| Enviado | Recibido sin UTF-8 |
| :--- | :--- |
| `PEÑASCO NISSAUTO` | `PE?ASCO NISSAUTO` |
| `José García Muñoz` | `Jos? Garc?a Mu?oz` |

Y como `AGENCIA` forma parte de la llave del registro, una agencia mal codificada **crea un registro separado** en lugar de actualizar el existente.

> La API intenta recuperar el texto cuando detecta Windows-1252, pero es una red de seguridad, no un sustituto. Manden UTF-8.

### 4.2 Al actualizar, enviar el registro completo

La API **reemplaza**, no combina. Cualquier campo que no venga en la petición se guarda vacío y **se pierde el valor anterior**.

Ejemplo — una reagenda enviando solo lo mínimo:

```json
{
  "FOLIO_CITA": "00051391",
  "FECHA_CAPTURA": "2026-08-17",
  "AGENCIA": "NOGALES NISSAUTO",
  "NOMBRE": "Juan Perez",
  "FECHA_CITA": "2026-08-25"
}
```

Resultado: la fecha se actualiza, pero `TELEFONO`, `MODELO`, `SERIE`, `PLACAS` y `STATUS_CITA` **quedan vacíos**.

**Siempre enviar todos los campos disponibles, también en las actualizaciones.**

### 4.3 `FECHA_CAPTURA` no debe cambiar nunca

Un registro se identifica por estos tres campos juntos:

```
FOLIO_CITA  +  AGENCIA  +  FECHA_CAPTURA
```

Si los tres coinciden con un registro existente, se **actualiza**. Si cualquiera cambia, se crea un **registro nuevo**.

Por eso `FECHA_CAPTURA` debe conservar siempre la fecha de alta original del registro. Si se envía la fecha del día en que se sincroniza, cada envío genera una cita duplicada.

### 4.4 Formato de fechas

`FECHA_CITA` y `FECHA_CAPTURA` van como `YYYY-MM-DD`, sin hora.

| Valor | Resultado |
| :--- | :--- |
| `"2026-08-20"` | ✅ correcto |
| `"20/08/2026"` | ❌ `400` |
| `"2026-08-20T08:35:00"` | ❌ `400` |
| `"2026-02-30"` | ❌ `400` — fecha inexistente |

### 4.5 Valores vacíos

Enviar `0`, `""` o `false` equivale a no enviar el campo: se guarda vacío. Los números se aceptan y se convierten a texto, pero **`FOLIO_CITA` debe ir como texto** para no perder los ceros iniciales.

---

## 5. Ejemplo completo

```json
{
  "FOLIO_CITA": "00051391",
  "FECHA_CAPTURA": "2026-08-17",
  "FECHA_CITA": "2026-08-20",
  "HORA_CITA": "08:35",
  "AGENCIA": "NOGALES NISSAUTO",
  "NOMBRE": "CADENA COMERCIAL OXXO S.A. DE C.V.",
  "TELEFONO": "6621234567",
  "TEL_CASA": "6622893400",
  "OFICINA": "289-34-00 ext 15",
  "CODIGO_POSTAL": "83000",
  "MODELO": "TIIDA SEDAN",
  "ANO": "2011",
  "SERIE": "3N1BC1AS6BL441646",
  "PLACAS": "WAK8497",
  "TIPO_CITA": "SERVICIO",
  "TIPO_SERVICIO": "MANTENIMIENTO 10, 30 Y 50,000 KMS",
  "ORIGEN_CITA": "Llamada del Cliente",
  "CAPTURO_CITA": "Portal Web",
  "ASESOR_SERVICIO": "ARMANDO RIVERA PIRI",
  "STATUS_CITA": "Activa"
}
```

Petición con cURL:

```bash
curl -X POST https://apicitasgranauto-production.up.railway.app/api/citas \
  -H "Content-Type: application/json; charset=utf-8" \
  -H "x-api-key: LA_API_KEY" \
  --data-binary @cita.json
```

---

## 6. Respuestas

| Código | Significado |
| :---: | :--- |
| `200` | Registrado correctamente |
| `400` | Falta un campo obligatorio, fecha inválida, JSON mal formado, o más de 1000 registros |
| `401` | API key ausente o incorrecta |
| `403` | Origen no permitido (solo aplica a navegadores) |
| `413` | Cuerpo mayor a 10 MB |
| `429` | Más de 600 peticiones por minuto |
| `500` | Error interno |

Éxito:

```json
{ "ok": true, "mensaje": "Citas insertadas correctamente", "registros_insertados": 1 }
```

Error:

```json
{ "ok": false, "mensaje": "Campo requerido: FECHA_CITA" }
```

> `200` no distingue entre alta y actualización: ambas responden igual.

---

## 7. Límites

| Límite | Valor |
| :--- | :--- |
| Registros por petición | 1000 |
| Tamaño del cuerpo | 10 MB |
| Peticiones por minuto | 600 |

**Un solo registro inválido rechaza el lote completo.** Si se envían 500 citas y una tiene la fecha mal, ninguna se guarda y la respuesta es `400`.

Se recomienda enviar en lotes en lugar de una petición por cita, y **verificar el código de respuesta de cada petición**: un `429` o un `500` significa que esas citas no se guardaron y hay que reintentarlas.
