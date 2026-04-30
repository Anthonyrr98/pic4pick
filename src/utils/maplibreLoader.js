let maplibrePromise = null;

export async function loadMapLibre() {
  if (!maplibrePromise) {
    maplibrePromise = Promise.all([
      import('maplibre-gl'),
      import('maplibre-gl/dist/maplibre-gl.css'),
    ]).then(([module]) => module.default);
  }

  return maplibrePromise;
}
