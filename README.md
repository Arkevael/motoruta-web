# MotoRuta Web

Aplicación web para planificar viajes en moto. Con un origen y un destino devuelve, en una sola consulta, la **ruta**, el **clima del trayecto**, los **talleres mecánicos y miradores** cercanos y **fotos del destino**.

Stack: Node.js 20 + Express + dotenv, frontend HTML/CSS/JS vanilla, Leaflet + OpenStreetMap. Sin base de datos (caché en memoria de 5 min).

## APIs usadas (todas gratuitas)

| API | Uso | Key |
|---|---|---|
| Nominatim | Geocodificar origen/destino | No (User-Agent obligatorio) |
| OSRM | Ruta, distancia y duración | No |
| Overpass | Talleres y miradores | No |
| Open-Meteo | Clima actual y pronóstico | No |
| Pexels | Fotos del destino | Sí (gratis, sin tarjeta) |

## Puesta en marcha

```bash
npm install
cp server/.env.example server/.env   # en Windows: copy server\.env.example server\.env
# edita server/.env: PEXELS_API_KEY y NOMINATIM_USER_AGENT (con tu correo)
npm start
```

Abre http://localhost:3000. Key de Pexels gratis en https://www.pexels.com/api/

Sin `PEXELS_API_KEY` la app funciona igual, pero sin fotos (se muestra un aviso).

## Estructura

```
motoruta-web/
├── server/
│   ├── index.js          # App Express: rate limit, estáticos, errores
│   ├── routes/route.js   # GET /api/route
│   ├── services/         # nominatim, osrm, overpass, openmeteo, pexels
│   ├── utils/            # http (timeout), cache (TTL), geo (distancias)
│   └── .env              # claves (NO se sube a Git)
├── public/               # index.html, style.css, app.js
├── test/route.test.js    # pruebas con APIs simuladas
└── package.json
```

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/route?from=Cusco&to=Ollantaytambo` | Ruta + clima + talleres + miradores + fotos |
| GET | `/api/health` | Estado del servicio |

```bash
curl "http://localhost:3000/api/route?from=Cusco&to=Ollantaytambo"
```

Respuesta (resumida): `{ origin, destination, geometry, distance, duration, workshops, viewpoints, weather, photos, warnings, cached }`

Códigos: `200` ok · `400` parámetros inválidos · `404` lugar o ruta no encontrados · `429` demasiadas peticiones · `502/504` API externa caída o lenta. Si fallan Overpass, Open-Meteo o Pexels, la respuesta sigue siendo `200` con ese bloque vacío y un texto en `warnings`.

## Pruebas

```bash
npm test
```

Cubre ruta válida, caché, parámetros inválidos (400), lugar inexistente (404), OSRM caído (502), Overpass caído y Pexels caído (200 degradado). Usa APIs simuladas, así que no gasta cuota.

## Despliegue gratuito (Render)

1. Sube el proyecto a GitHub (el `.gitignore` ya excluye `.env` y `node_modules`).
2. En Render: **New → Web Service**, conecta el repositorio.
3. Build command: `npm install` · Start command: `npm start` · Plan: Free.
4. En **Environment** agrega `PEXELS_API_KEY` y `NOMINATIM_USER_AGENT`.

El plan gratuito de Render se «duerme» tras un rato sin uso: la primera visita puede tardar unos segundos.

## Variables de entorno opcionales

`PORT` (3000), `CACHE_TTL_SECONDS` (300), `RATE_LIMIT_MAX` (20 por minuto e IP), `SEARCH_RADIUS_METERS` (3000), `OVERPASS_URL`, `OSRM_URL`.

## Notas

- El servidor público de OSRM y Overpass son de uso compartido y pueden ser lentos o caer; por eso el backend usa timeouts, un espejo de Overpass y degrada la respuesta en vez de fallar.
- Nominatim permite 1 petición por segundo: el backend las espacia y cachea los geocodificados 1 hora.
- Las fotos requieren mostrar el crédito al fotógrafo y a Pexels (ya incluido en la galería).
