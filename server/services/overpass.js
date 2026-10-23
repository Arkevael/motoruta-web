// Overpass API: talleres mecánicos y miradores cerca de la ruta.

const { fetchJson } = require('../utils/http');
const { cumulativeDistances, samplePoints, nearestVertex } = require('../utils/geo');

const DEFAULT_URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

function buildQuery(points, radius) {
  // "around" con varias coordenadas se interpreta como una polilínea
  const line = points.map(([lon, lat]) => `${lat.toFixed(5)},${lon.toFixed(5)}`).join(',');
  const around = `(around:${radius},${line})`;
  return `[out:json][timeout:25];
(
  nwr["shop"="motorcycle_repair"]${around};
  nwr["shop"="motorcycle"]${around};
  nwr["shop"="car_repair"]${around};
  nwr["tourism"="viewpoint"]${around};
);
out center tags 150;`;
}

function classify(tags) {
  if (tags.tourism === 'viewpoint') return 'viewpoint';
  if (tags.shop === 'motorcycle_repair' || tags.shop === 'motorcycle' || tags.shop === 'car_repair') return 'workshop';
  return null;
}

async function queryOverpass(query) {
  const urls = process.env.OVERPASS_URL ? [process.env.OVERPASS_URL] : DEFAULT_URLS;
  let lastError;
  for (const url of urls) {
    try {
      return await fetchJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        timeout: 28000,
      });
    } catch (err) {
      lastError = err; // intenta el siguiente espejo
    }
  }
  throw lastError;
}

async function findPlaces(geometry) {
  const coords = geometry.coordinates;
  const radius = Number(process.env.SEARCH_RADIUS_METERS) || 3000;
  const data = await queryOverpass(buildQuery(samplePoints(coords, 25), radius));
  const cum = cumulativeDistances(coords);

  const workshops = [];
  const viewpoints = [];
  const seen = new Set();

  for (const el of data.elements || []) {
    const tags = el.tags || {};
    const type = classify(tags);
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!type || lat === undefined || lon === undefined) continue;

    const near = nearestVertex(coords, lat, lon);
    const kind = tags.shop === 'motorcycle_repair' || tags.shop === 'motorcycle' ? 'moto' : tags.shop === 'car_repair' ? 'auto' : 'mirador';
    const item = {
      id: `${el.type}/${el.id}`,
      name: tags.name || (type === 'viewpoint' ? 'Mirador' : kind === 'moto' ? 'Taller de motos' : 'Taller mecánico'),
      kind,
      lat,
      lon,
      kmFromStart: Math.round(cum[near.index] / 100) / 10,
      offRouteMeters: Math.round(near.distance),
      phone: tags.phone || tags['contact:phone'] || null,
      openingHours: tags.opening_hours || null,
    };
    const dedupe = `${item.name}|${item.lat.toFixed(4)}|${item.lon.toFixed(4)}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    (type === 'viewpoint' ? viewpoints : workshops).push(item);
  }

  // Talleres de moto primero; después por orden de aparición a lo largo del viaje.
  const rank = { moto: 0, auto: 1 };
  workshops.sort((a, b) => rank[a.kind] - rank[b.kind] || a.kmFromStart - b.kmFromStart);
  viewpoints.sort((a, b) => a.kmFromStart - b.kmFromStart);

  return { workshops: workshops.slice(0, 30), viewpoints: viewpoints.slice(0, 20) };
}

module.exports = { findPlaces };
