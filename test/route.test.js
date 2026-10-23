// Pruebas del endpoint /api/route con las APIs externas simuladas (no gastan cuota).
// Ejecutar: npm test

process.env.NOMINATIM_DELAY_MS = '0';
process.env.PEXELS_API_KEY = 'clave-de-prueba';
process.env.RATE_LIMIT_MAX = '1000';

const test = require('node:test');
const assert = require('node:assert/strict');

const realFetch = global.fetch;
const calls = [];
let failHost = null;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

global.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  calls.push(u.hostname);
  if (failHost && u.hostname === failHost) return json({ message: 'boom' }, 503);

  if (u.hostname === 'nominatim.openstreetmap.org') {
    const q = u.searchParams.get('q').toLowerCase();
    if (q.includes('zzzz')) return json([]);
    if (q.includes('cusco')) return json([{ lat: '-13.5320', lon: '-71.9675', display_name: 'Cusco, Perú' }]);
    return json([{ lat: '-13.2587', lon: '-72.2640', display_name: 'Ollantaytambo, Urubamba, Cusco, Perú' }]);
  }
  if (u.hostname === 'router.project-osrm.org') {
    const coordinates = Array.from({ length: 40 }, (_, i) => [-71.9675 - i * 0.0075, -13.532 + i * 0.007]);
    return json({ code: 'Ok', routes: [{ distance: 72000, duration: 5400, geometry: { type: 'LineString', coordinates } }] });
  }
  if (u.hostname.startsWith('overpass')) {
    return json({
      elements: [
        { type: 'node', id: 1, lat: -13.45, lon: -72.05, tags: { shop: 'motorcycle_repair', name: 'Taller Moto Sur' } },
        { type: 'node', id: 2, lat: -13.40, lon: -72.10, tags: { shop: 'car_repair' } },
        { type: 'node', id: 3, lat: -13.35, lon: -72.15, tags: { tourism: 'viewpoint', name: 'Mirador del Valle' } },
      ],
    });
  }
  if (u.hostname === 'api.open-meteo.com') {
    const n = u.searchParams.get('latitude').split(',').length;
    const one = { current: { temperature_2m: 14.2, wind_speed_10m: 11, precipitation: 0, weather_code: 3 },
      daily: { time: ['2026-10-22', '2026-10-23'], temperature_2m_max: [20, 21], temperature_2m_min: [5, 6], precipitation_probability_max: [70, 20] } };
    return json(Array.from({ length: n }, () => one));
  }
  if (u.hostname === 'api.pexels.com') {
    assert.equal(opts.headers.Authorization, 'clave-de-prueba');
    return json({ photos: [{ id: 9, src: { large: 'https://x/l.jpg', medium: 'https://x/m.jpg' }, photographer: 'Ana', photographer_url: 'https://p/ana', url: 'https://p/9', alt: 'Valle' }] });
  }
  throw new Error(`Host no simulado: ${u.hostname}`);
};

const app = require('../server/index');
let server;
let base;
test.before(async () => {
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());
test.beforeEach(() => { failHost = null; calls.length = 0; });

const get = (path) => realFetch(base + path);

test('CP-01 ruta válida devuelve todas las propiedades', async () => {
  const res = await get('/api/route?from=Cusco&to=Ollantaytambo');
  assert.equal(res.status, 200);
  const b = await res.json();
  for (const k of ['geometry', 'distance', 'duration', 'workshops', 'weather', 'photos']) assert.ok(k in b, `falta ${k}`);
  assert.equal(b.distance, 72000);
  assert.equal(b.weather.length, 4);
  assert.equal(b.workshops[0].kind, 'moto'); // talleres de moto primero
  assert.equal(b.viewpoints[0].name, 'Mirador del Valle');
  assert.equal(b.photos[0].photographer, 'Ana');
  assert.deepEqual(b.warnings, []);
  assert.ok(b.weather[0].alerts.some((a) => a.includes('lluvia'))); // 70 % de lluvia
});

test('CP-06 la segunda consulta sale de la caché sin llamar a APIs', async () => {
  await get('/api/route?from=Cusco&to=Ollantaytambo');
  calls.length = 0;
  const b = await (await get('/api/route?from=cusco&to=OLLANTAYTAMBO')).json();
  assert.equal(b.cached, true);
  assert.equal(calls.length, 0);
});

test('CE-01 parámetros ausentes o inválidos → 400', async () => {
  assert.equal((await get('/api/route?from=Cusco')).status, 400);
  assert.equal((await get('/api/route?from=a&to=b')).status, 400);
  assert.equal((await get('/api/route?from=Cusco&to=<script>')).status, 400);
});

test('CE-02 lugar inexistente → 404', async () => {
  const res = await get('/api/route?from=Cusco&to=zzzzzzz');
  assert.equal(res.status, 404);
});

test('CE-03 OSRM caído → 502 sin romper el servidor', async () => {
  failHost = 'router.project-osrm.org';
  const res = await get('/api/route?from=Cusco&to=Ollantaytambo+Peru');
  assert.equal(res.status, 502);
  assert.equal((await get('/api/health')).status, 200);
});

test('CE-04 Overpass caído → 200 con talleres vacíos y aviso', async () => {
  failHost = 'overpass-api.de';
  // también cae el espejo
  const orig = global.fetch;
  global.fetch = async (url, o) => (new URL(url).hostname.startsWith('overpass') ? json({}, 503) : orig(url, o));
  const res = await get('/api/route?from=Cusco&to=Ollantaytambo+Valle');
  global.fetch = orig;
  const b = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(b.workshops, []);
  assert.ok(b.warnings.some((w) => w.startsWith('Talleres')));
  assert.ok(b.weather.length > 0); // el resto sigue funcionando
});

test('CE-05 Pexels caído → 200 sin fotos', async () => {
  failHost = 'api.pexels.com';
  const res = await get('/api/route?from=Cusco&to=Ollantaytambo+Sacsayhuaman');
  const b = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(b.photos, []);
  assert.ok(b.warnings.some((w) => w.startsWith('Fotos')));
});

test('endpoint inexistente → 404 JSON', async () => {
  const res = await get('/api/nada');
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, 'not_found');
});
