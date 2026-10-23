// Frontend de MotoRuta Web (JS vanilla). Solo habla con el backend propio (/api/route).
// Todo texto externo se inserta con textContent (nunca innerHTML) para evitar XSS.

const $ = (id) => document.getElementById(id);

const map = L.map('map').setView([-9.19, -75.01], 5);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);
const layer = L.layerGroup().addTo(map);
let markersById = new Map();

/** Crea un elemento con texto y atributos opcionales. */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

const fmtKm = (m) => `${(m / 1000).toLocaleString('es-PE', { maximumFractionDigits: 1 })} km`;
function fmtDuration(s) {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}
const shortName = (full) => full.split(',').slice(0, 2).join(',');

function setStatus(kind, text) {
  const box = $('status');
  if (!kind) { box.hidden = true; return; }
  box.hidden = false;
  box.className = kind;
  box.replaceChildren();
  if (kind === 'loading') box.append(el('span', { class: 'spinner' }));
  box.append(text);
}

function pin(emoji) {
  return L.divIcon({ className: '', html: `<div class="pin">${emoji}</div>`, iconSize: [24, 24], iconAnchor: [12, 22], popupAnchor: [0, -20] });
}

function drawMap(data) {
  layer.clearLayers();
  markersById = new Map();
  const line = L.geoJSON(data.geometry, { style: { color: '#e8590c', weight: 5, opacity: 0.9 } }).addTo(layer);

  L.marker([data.origin.lat, data.origin.lon], { icon: pin('🟢') }).bindPopup(`<b>Origen</b><br>${escapeHtml(shortName(data.origin.name))}`).addTo(layer);
  L.marker([data.destination.lat, data.destination.lon], { icon: pin('🏁') }).bindPopup(`<b>Destino</b><br>${escapeHtml(shortName(data.destination.name))}`).addTo(layer);

  const add = (p, emoji) => {
    const m = L.marker([p.lat, p.lon], { icon: pin(emoji) })
      .bindPopup(`<b>${escapeHtml(p.name)}</b><br>Km ${p.kmFromStart} del recorrido`)
      .addTo(layer);
    markersById.set(p.id, m);
  };
  data.workshops.forEach((p) => add(p, p.kind === 'moto' ? '🔧' : '🛠️'));
  data.viewpoints.forEach((p) => add(p, '📷'));

  // Leaflet necesita recalcular el tamaño porque el contenedor estaba oculto
  setTimeout(() => { map.invalidateSize(); map.fitBounds(line.getBounds(), { padding: [30, 30] }); }, 50);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderSummary(data) {
  const box = $('summary');
  box.replaceChildren(
    el('h2', { text: 'Resumen del viaje' }),
    el('p', { class: 'route-names', text: `${shortName(data.origin.name)} → ${shortName(data.destination.name)}` }),
    el('div', { class: 'stats' },
      el('div', { class: 'stat' }, el('b', { text: fmtKm(data.distance) }), el('span', { text: 'Distancia' })),
      el('div', { class: 'stat' }, el('b', { text: fmtDuration(data.duration) }), el('span', { text: 'Duración estimada' })),
      el('div', { class: 'stat' }, el('b', { text: String(data.workshops.length) }), el('span', { text: 'Talleres cercanos' })),
      el('div', { class: 'stat' }, el('b', { text: String(data.viewpoints.length) }), el('span', { text: 'Miradores' })),
    ),
  );
}

function renderWeather(data) {
  const box = $('weather');
  box.replaceChildren(el('h2', { text: 'Clima en el trayecto' }));
  if (!data.weather.length) return box.append(el('p', { class: 'empty', text: 'No se pudo obtener el clima en este momento.' }));

  for (const w of data.weather) {
    const tomorrow = w.forecast?.[1];
    const row = el('div', { class: 'wx' },
      el('span', { class: 'icon', text: w.icon }),
      el('div', {}, el('b', { text: `${w.label}: ` }), `${w.temperature ?? '–'} °C · ${w.description}`),
      el('small', { text: `Viento ${w.windSpeed ?? '–'} km/h · Lluvia hoy ${w.rainProbability ?? '–'} %` +
        (tomorrow ? ` · Mañana ${tomorrow.tempMin ?? '–'}–${tomorrow.tempMax ?? '–'} °C (${tomorrow.rainProbability ?? '–'} %)` : '') }),
    );
    for (const a of w.alerts || []) row.append(el('div', { class: 'alert', text: `⚠️ ${a}` }));
    box.append(row);
  }
}

function placeList(items, emptyText) {
  if (!items.length) return el('p', { class: 'empty', text: emptyText });
  const ul = el('ul', { class: 'place-list' });
  for (const p of items) {
    const sub = [`Km ${p.kmFromStart}`, `a ${p.offRouteMeters} m de la ruta`, p.phone].filter(Boolean).join(' · ');
    const btn = el('button', { type: 'button' }, el('b', { text: p.name }), el('small', { text: sub }));
    btn.addEventListener('click', () => {
      const m = markersById.get(p.id);
      if (!m) return;
      map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 13));
      m.openPopup();
      $('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    ul.append(el('li', {}, btn));
  }
  return ul;
}

function renderPlaces(data) {
  $('places').replaceChildren(
    el('h2', { text: 'Talleres y miradores en la ruta' }),
    el('div', { class: 'places-cols' },
      el('div', {}, el('h3', { text: '🔧 Talleres mecánicos' }), placeList(data.workshops, 'No se encontraron talleres cerca de la ruta.')),
      el('div', {}, el('h3', { text: '📷 Miradores' }), placeList(data.viewpoints, 'No se encontraron miradores cerca de la ruta.')),
    ),
  );
}

function renderPhotos(data) {
  const box = $('photos');
  box.replaceChildren(el('h2', { text: `Fotos de ${shortName(data.destination.name)}` }));
  if (!data.photos.length) return box.append(el('p', { class: 'empty', text: 'No hay fotos disponibles.' }));
  const gallery = el('div', { class: 'gallery' });
  for (const p of data.photos) {
    const img = el('img', { src: p.thumb || p.url, alt: p.alt, loading: 'lazy' });
    const credit = el('figcaption', {}, 'Foto de ',
      el('a', { href: p.photographerUrl, target: '_blank', rel: 'noopener', text: p.photographer }),
      ' en ',
      el('a', { href: p.pexelsUrl, target: '_blank', rel: 'noopener', text: 'Unsplash' }),
    );
    gallery.append(el('figure', {}, el('a', { href: p.pexelsUrl, target: '_blank', rel: 'noopener' }, img), credit));
  }
  box.append(gallery);
}

function renderWarnings(data) {
  document.querySelector('.warnings')?.remove();
  if (!data.warnings?.length) return;
  const ul = el('ul');
  data.warnings.forEach((w) => ul.append(el('li', { text: w })));
  $('results').prepend(el('div', { class: 'warnings' }, 'Algunos datos no estuvieron disponibles:', ul));
}

async function search(from, to) {
  const btn = $('go');
  btn.disabled = true;
  $('results').hidden = true;
  setStatus('loading', 'Calculando ruta, clima y talleres…');
  try {
    const res = await fetch(`/api/route?${new URLSearchParams({ from, to })}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `Error ${res.status}`);

    $('results').hidden = false;
    renderWarnings(data);
    renderSummary(data);
    renderWeather(data);
    renderPlaces(data);
    renderPhotos(data);
    drawMap(data);
    setStatus(null);
  } catch (err) {
    setStatus('error', err.message || 'No se pudo completar la búsqueda.');
  } finally {
    btn.disabled = false;
  }
}

$('search').addEventListener('submit', (e) => {
  e.preventDefault();
  search($('from').value, $('to').value);
});
$('swap').addEventListener('click', () => {
  [$('from').value, $('to').value] = [$('to').value, $('from').value];
});
document.querySelectorAll('.chip').forEach((chip) =>
  chip.addEventListener('click', () => {
    $('from').value = chip.dataset.from;
    $('to').value = chip.dataset.to;
    search(chip.dataset.from, chip.dataset.to);
  })
);