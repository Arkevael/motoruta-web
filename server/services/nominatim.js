// Servicio de geocodificación: Nominatim (principal) con Photon (respaldo).
const { fetchJson, HttpError } = require('../utils/http');
const { TTLCache } = require('../utils/cache');

const cache = new TTLCache(60 * 60 * 1000, 500);
let queue = Promise.resolve();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Función para espaciar las peticiones a Nominatim (1 por segundo)
function throttled(task) {
  const delay = process.env.NOMINATIM_DELAY_MS !== undefined ? Number(process.env.NOMINATIM_DELAY_MS) : 1100;
  const run = queue.then(task);
  queue = run.catch(() => {}).then(() => sleep(delay));
  return run;
}

// 1. Nominatim (Principal)
async function fetchNominatim(text) {
  return throttled(async () => {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&format=json&limit=1&accept-language=es`;
    const data = await fetchJson(url, {
      headers: { 
        // Es OBLIGATORIO identificar la app con un correo real
        'User-Agent': process.env.NOMINATIM_USER_AGENT || 'MotoRutaWeb/1.0 (tu-correo@gmail.com)' 
      },
      timeout: 8000
    });
    
    if (!Array.isArray(data) || data.length === 0) return null;
    
    return {
      name: data[0].display_name,
      lat: Number(data[0].lat),
      lon: Number(data[0].lon),
    };
  });
}

// 2. Photon (Respaldo)
async function fetchPhoton(text) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(text)}&limit=1&lang=es`;
  const data = await fetchJson(url, {
    headers: { 'User-Agent': process.env.NOMINATIM_USER_AGENT || 'MotoRutaWeb/1.0' },
    timeout: 6000
  });
  
  if (!data.features || data.features.length === 0) return null;
  
  const f = data.features[0];
  const parts = [f.properties.name, f.properties.state, f.properties.country].filter(Boolean);
  return {
    name: parts.join(', '),
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0],
  };
}

// Función principal
async function geocode(text) {
  const key = text.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  let place = null;

  // Intentamos con Nominatim primero
  try {
    console.log(`🔍 Geocodificando "${text}" con Nominatim...`);
    place = await fetchNominatim(text);
  } catch (err) {
    console.warn(`⚠️ Nominatim falló para "${text}": ${err.message}. Intentando respaldo (Photon)...`);
  }

  // Si Nominatim falló o no encontró nada, usamos Photon
  if (!place) {
    try {
      console.log(`🔄 Reintentando con Photon...`);
      place = await fetchPhoton(text);
    } catch (err) {
      console.error(`❌ Ambos servicios fallaron para "${text}"`);
      throw new HttpError(502, `Los servicios de mapas están saturados. Intenta de nuevo en unos minutos.`);
    }
  }

  if (!place) {
    throw new HttpError(404, `No se encontró el lugar «${text}»`);
  }

  cache.set(key, place);
  return place;
}

module.exports = { geocode };