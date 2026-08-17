# API de Citas de Servicio

API REST en Node.js y Express para recibir citas, validarlas y almacenarlas en
PostgreSQL.

Incluye autenticación por API key, rate limiting, CORS por whitelist, logs JSON
sin PII, identificadores de petición, health check de PostgreSQL y apagado
controlado.

## Estructura del Proyecto

```
backend/
├── app.js
├── server.js
├── package.json
├── .env
├── .env.example
├── routes/
│   └── citas.routes.js
├── controllers/
│   └── citas.controller.js
├── services/
│   └── postgres.service.js
├── middlewares/
│   ├── auth.middleware.js
│   └── observability.middleware.js
├── utils/
│   └── logger.js
└── test/
    ├── http.test.js
    └── unit.test.js
```

## Requisitos Previos

- [Node.js](https://nodejs.org/) (versión 18 o superior recomendada).
- Una base de datos PostgreSQL.

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

### Archivo `.env`

Copia el archivo `.env.example` como `.env`:
```bash
cp .env.example .env
```

Edita el archivo `.env` configurando tus valores:
- `PORT`: Puerto donde correrá el servidor (por defecto `3000`).
- `DATABASE_URL`: URL de conexión de PostgreSQL.
- `API_KEY`: API Key secreta requerida para autorizar las peticiones.
- `ALLOWED_ORIGINS`: Orígenes web permitidos, separados por comas. Vacío permite
  únicamente clientes sin encabezado `Origin`.
- `RATE_LIMIT_WINDOW_MS` y `RATE_LIMIT_MAX`: Ventana y máximo del rate limit.
- `PG_CONNECTION_TIMEOUT_MS` y `PG_QUERY_TIMEOUT_MS`: Límites de espera de PostgreSQL.
- `SHUTDOWN_TIMEOUT_MS`: Tiempo máximo para el apagado controlado.
- `LOG_LEVEL`: `debug`, `info`, `warn`, `error` o `fatal`.

## Ejecución del Servidor

Para iniciar el servidor en modo de producción:
```bash
npm start
```

Para iniciar el servidor en modo de desarrollo (con recarga automática ante cambios):
```bash
npm run dev
```

El servidor estará escuchando en `http://localhost:3000` (o el puerto configurado).
`GET /health` devuelve `200` cuando PostgreSQL está disponible y `503` cuando no
lo está.

## Pruebas

```bash
npm test
```

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
