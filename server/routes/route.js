// GET /api/route?from=...&to=...
// Compone Nominatim + OSRM y, en paralelo, Overpass + Open-Meteo + Pexels.

const express = require('express');
const { HttpError } = require('../utils/http');
const { TTLCache } = require('../utils/cache');
const { samplePoints } = require('../utils/geo');
const { geocode } = require('../services/nominatim');
const { getRoute } = require('../services/osrm');
const { findPlaces } = require('../services/overpass');
const { getWeather } = require('../services/openmeteo');
const { getPhotos } = require('../services/pexels');

const router = express.Router();
const cache = new TTLCache((Number(process.env.CACHE_TTL_SECONDS) || 300) * 1000);

function readPlace(value, field) {
  if (typeof value !== 'string') throw new HttpError(400, `El parámetro «${field}» es obligatorio`);
  const text = value.trim().replace(/\s+/g, ' ');
  if (text.length < 2 || text.length > 120) {
    throw new HttpError(400, `«${field}» debe tener entre 2 y 120 caracteres`);
  }
  if (/[\u0000-\u001f<>]/.test(text)) throw new HttpError(400, `«${field}» contiene caracteres no válidos`);
  return text;
}

function weatherPoints(geometry) {
  const pts = samplePoints(geometry.coordinates, 4);
  const labels = ['Origen', 'Tramo 1', 'Tramo 2', 'Destino'];
  return pts.map(([lon, lat], i) => ({ label: labels[i] ?? `Tramo ${i}`, lat, lon }));
}

function photoQuery(place) {
  const parts = place.name.split(',').map((s) => s.trim());
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]}` : parts[0];
}

router.get('/', async (req, res, next) => {
  try {
    const from = readPlace(req.query.from, 'from');
    const to = readPlace(req.query.to, 'to');

    const cacheKey = `${from.toLowerCase()}|${to.toLowerCase()}`;
    const hit = cache.get(cacheKey);
    if (hit) return res.json({ ...hit, cached: true });

    // 1) Geocodificación (Nominatim las serializa por su límite de 1 req/s)
    const [origin, destination] = await Promise.all([geocode(from), geocode(to)]);

    // 2) Ruta (si falla, no hay respuesta útil → error)
    const route = await getRoute(origin, destination);

    // 3) Datos complementarios en paralelo; si alguno falla, se degrada con aviso
    const [places, weather, photos] = await Promise.allSettled([
      findPlaces(route.geometry),
      getWeather(weatherPoints(route.geometry)),
      getPhotos(photoQuery(destination)),
    ]);

    const warnings = [];
    const unwrap = (r, fallback, label) => {
      if (r.status === 'fulfilled') return r.value;
      warnings.push(`${label}: ${r.reason?.message || 'no disponible'}`);
      return fallback;
    };

    const placesData = unwrap(places, { workshops: [], viewpoints: [] }, 'Talleres y miradores');
    const body = {
      origin,
      destination,
      geometry: route.geometry,
      distance: route.distance,
      duration: route.duration,
      workshops: placesData.workshops,
      viewpoints: placesData.viewpoints,
      weather: unwrap(weather, [], 'Clima'),
      photos: unwrap(photos, [], 'Fotos'),
      warnings,
      cached: false,
    };

    // Solo se cachean respuestas completas, para reintentar lo que falló
    if (warnings.length === 0) cache.set(cacheKey, body);
    res.json(body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
