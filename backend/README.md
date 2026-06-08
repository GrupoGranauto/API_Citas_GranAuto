# API de Citas de Servicio a BigQuery

Esta es una API REST desarrollada en Node.js con Express diseñada para recibir citas de servicio, validarlas, asignarles una columna correlativa/incremental `VC` (consultando el máximo actual de la tabla destino de BigQuery) y realizar la inserción de registros por streaming en Google Cloud BigQuery.

## Estructura del Proyecto

```
backend/
├── app.js
├── package.json
├── .env
├── .env.example
├── routes/
│   └── citas.routes.js
├── controllers/
│   └── citas.controller.js
├── services/
│   └── bigquery.service.js
├── middlewares/
│   └── auth.middleware.js
└── credentials/
    └── service-account.json
```

## Requisitos Previos

- [Node.js](https://nodejs.org/) (versión 18 o superior recomendada).
- Cuenta de Google Cloud con acceso a BigQuery.

## Instalación

1. Navegar al directorio `backend/`:
   ```bash
   cd backend
   ```

2. Instalar las dependencias del proyecto:
   ```bash
   npm install
   ```

## Configuración

### 1. Configuración del archivo `.env`

Copia el archivo `.env.example` como `.env`:
```bash
cp .env.example .env
```

Edita el archivo `.env` configurando tus valores:
- `PORT`: Puerto donde correrá el servidor (por defecto `3000`).
- `PROJECT_ID`: ID del proyecto de Google Cloud (por defecto `base-maestra-gn`).
- `DATASET_ID`: ID del Dataset en BigQuery (por defecto `Respaldo`).
- `TABLE_ID`: ID de la tabla destino en BigQuery (por defecto `tab_respaldo_master_citas`).
- `API_KEY`: API Key secreta requerida para autorizar las peticiones.
- `GOOGLE_APPLICATION_CREDENTIALS`: Ruta relativa o absoluta al archivo JSON de credenciales (por defecto `./credentials/service-account.json`).

### 2. Cuenta de Servicio de Google Cloud (`service-account.json`)

1. Ve a la consola de Google Cloud, sección **IAM y administración > Cuentas de servicio**.
2. Crea o selecciona una cuenta de servicio con permisos adecuados:
   - **Lector de datos de BigQuery** (para realizar la consulta del VC máximo).
   - **Editor de datos de BigQuery** (para poder realizar inserciones).
   - **Usuario de BigQuery** (para poder ejecutar jobs/consultas).
3. Genera una nueva clave en formato JSON.
4. Descarga el archivo, cámbiale el nombre a `service-account.json` y colócalo dentro de la carpeta:
   `backend/credentials/` (asegurándote de que coincida con la ruta definida en tu `.env`).

## Ejecución del Servidor

Para iniciar el servidor en modo de producción:
```bash
npm start
```

Para iniciar el servidor en modo de desarrollo (con recarga automática ante cambios):
```bash
npm run dev
```

El servidor estará escuchando en `http://localhost:3000` (o el puerto configurado). Puedes monitorear la salud de la API en: `http://localhost:3000/health`.

## Ejemplos de Uso (Peticiones con cURL)

Recuerda reemplazar `mi-super-secreto-api-key` por la API Key que configuraste en tu archivo `.env`.

### 1. Insertar una cita (Objeto Único)

```bash
curl -X POST http://localhost:3000/api/citas \
  -H "Content-Type: application/json" \
  -H "x-api-key: mi-super-secreto-api-key" \
  -d '{
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
  }'
```

### 2. Insertar múltiples citas (Arreglo de Objetos)

```bash
curl -X POST http://localhost:3000/api/citas \
  -H "Content-Type: application/json" \
  -H "x-api-key: mi-super-secreto-api-key" \
  -d '\''[
    {
      "FOLIO_CITA": "12346",
      "FECHA_CAPTURA": "2026-06-08",
      "FECHA_CITA": "2026-06-16",
      "HORA_CITA": "11:00",
      "CAPTURO_CITA": "Portal",
      "ORIGEN_CITA": "WEB",
      "TIPO_CITA": "SERVICIO",
      "TIPO_SERVICIO": "MANTENIMIENTO",
      "AGENCIA": "Toyota Chihuahua",
      "NOMBRE": "Maria Gomez",
      "TELEFONO": "6147654321",
      "MODELO": "RAV4",
      "ANO": "2023",
      "SERIE": "JT987654321",
      "ASESOR_SERVICIO": "Carlos Lopez"
    },
    {
      "FOLIO_CITA": "12347",
      "FECHA_CAPTURA": "2026-06-08",
      "FECHA_CITA": "2026-06-17",
      "HORA_CITA": "12:00",
      "CAPTURO_CITA": "Llamada",
      "ORIGEN_CITA": "Call Center",
      "TIPO_CITA": "SERVICIO",
      "TIPO_SERVICIO": "DIAGNOSTICO",
      "AGENCIA": "Toyota Chihuahua",
      "NOMBRE": "Pedro Martinez",
      "TELEFONO": "6141112233",
      "MODELO": "Hilux",
      "ANO": "2022",
      "SERIE": "JT555555555",
      "ASESOR_SERVICIO": "Carlos Lopez"
    }
  ]'\''
```
