const BASE = 'https://photon.komoot.io/api'; // Nueva URL

async function geocode(text) {
  const key = text.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  const url = `${BASE}?q=${encodeURIComponent(text)}&limit=1&lang=es`;
  // La cabecera 'User-Agent' ya no es obligatoria aquí, pero puedes dejarla.
  const data = await fetchJson(url, {
    headers: { 'User-Agent': process.env.NOMINATIM_USER_AGENT || 'MotoRutaWeb/1.0' },
  });

  // Photon devuelve un objeto con una propiedad 'features'
  if (!data.features || data.features.length === 0) {
    throw new HttpError(404, `No se encontró el lugar «${text}»`);
  }

  const feature = data.features[0];
  // Photon devuelve las coordenadas en orden [lon, lat]
  const place = {
    name: feature.properties.name + (feature.properties.country ? `, ${feature.properties.country}` : ''),
    lat: feature.geometry.coordinates[1],
    lon: feature.geometry.coordinates[0],
  };
  cache.set(key, place);
  return place;
}