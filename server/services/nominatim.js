// Nominatim (OpenStreetMap): geocodifica un texto a coordenadas.
// Política de uso: máx. 1 petición/segundo y User-Agent identificable.

const { fetchJson, HttpError } = require('../utils/http');
const { TTLCache } = require('../utils/cache');

const BASE = 'https://nominatim.openstreetmap.org/search';
const cache = new TTLCache(60 * 60 * 1000, 500); // 1 hora
let queue = Promise.resolve();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Serializa las llamadas y deja ≥1,1 s entre una y otra. */
function throttled(task) {
  const delay = process.env.NOMINATIM_DELAY_MS !== undefined ? Number(process.env.NOMINATIM_DELAY_MS) : 1100;
  const run = queue.then(task);
  queue = run.catch(() => {}).then(() => sleep(delay));
  return run;
}

async function geocode(text) {
  const key = text.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  const url = `${BASE}?${new URLSearchParams({ q: text, format: 'json', limit: '1', 'accept-language': 'es' })}`;
  const data = await throttled(() =>
    fetchJson(url, {
      headers: {
        'User-Agent': process.env.NOMINATIM_USER_AGENT || 'MotoRutaWeb/1.0 (proyecto academico)',
      },
    })
  );

  if (!Array.isArray(data) || data.length === 0) {
    throw new HttpError(404, `No se encontró el lugar «${text}»`);
  }
  const place = {
    name: data[0].display_name,
    lat: Number(data[0].lat),
    lon: Number(data[0].lon),
  };
  cache.set(key, place);
  return place;
}

module.exports = { geocode };
