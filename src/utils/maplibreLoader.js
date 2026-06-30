let maplibrePromise = null;

export async function loadMapLibre() {
  if (!maplibrePromise) {
    maplibrePromise = Promise.all([
      import('maplibre-gl'),
      import('maplibre-gl/dist/maplibre-gl.css'),
    ])
      .then(([module]) => module.default)
      .catch((error) => {
        maplibrePromise = null;
        throw error;
      });
  }

  return maplibrePromise;
}

export function preloadMapLibre() {
  if (typeof window === 'undefined') return;
  loadMapLibre().catch(() => {});
}
