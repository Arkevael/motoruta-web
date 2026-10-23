// server/services/pexels.js (renombra el archivo si quieres, ej. unsplash.js)
const { fetchJson, HttpError } = require('../utils/http');

const BASE = 'https://api.unsplash.com/search/photos';

async function getPhotos(query, perPage = 6) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) throw new HttpError(502, 'UNSPLASH_ACCESS_KEY no está configurada en el servidor');

  const url = `${BASE}?${new URLSearchParams({ query, per_page: String(perPage) })}`;
  const data = await fetchJson(url, { headers: { Authorization: `Client-ID ${key}` } });

  return (data.results || []).map((p) => ({
    id: p.id,
    url: p.urls?.regular,
    thumb: p.urls?.small,
    alt: p.alt_description || query,
    photographer: p.user?.name,
    photographerUrl: p.user?.links?.html,
    pexelsUrl: p.links?.html, // Puedes renombrar esta propiedad si quieres
  }));
}

module.exports = { getPhotos };
