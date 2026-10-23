// Photon (Komoot): geocodificador rápido y gratuito basado en OpenStreetMap.
// No requiere API Key ni límites tan estrictos como Nominatim.

const { fetchJson, HttpError } = require('../utils/http');
const { TTLCache } = require('../utils/cache');

const BASE = 'https://photon.komoot.io/api/';
const cache = new TTLCache(60 * 60 * 1000, 500); // 1 hora de caché

async function geocode(text) {
  const key = text.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  // Photon usa el parámetro 'q' y devuelve un objeto con 'features'
  const url = `${BASE}?q=${encodeURIComponent(text)}&limit=1&lang=es`;
  
  const data = await fetchJson(url, {
    headers: {
      // Aunque no es estricto, es buena práctica identificarse
      'User-Agent': process.env.NOMINATIM_USER_AGENT || 'MotoRutaWeb/1.0',
    },
  });

  if (!data.features || data.features.length === 0) {
    throw new HttpError(404, `No se encontró el lugar «${text}»`);
  }

  const feature = data.features[0];
  const props = feature.properties;
  
  // Photon no da un "display_name" completo, así que lo construimos
  // Ejemplo: "Cusco, Cusco, Perú"
  const parts = [props.name, props.state, props.country].filter(Boolean);
  const displayName = parts.length > 0 ? parts.join(', ') : text;

  const place = {
    name: displayName,
    lat: feature.geometry.coordinates[1], // Photon devuelve [lon, lat]
    lon: feature.geometry.coordinates[0],
  };
  
  cache.set(key, place);
  return place;
}

module.exports = { geocode };