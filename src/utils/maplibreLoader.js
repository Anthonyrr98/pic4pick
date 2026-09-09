let maplibrePromise = null;

export async function loadMapLibre() {
  if (!maplibrePromise) {
    maplibrePromise = Promise.all([
      import('maplibre-gl'),
      import('maplibre-gl/dist/maplibre-gl.css'),
    ])
      // MapLibre GL JS v6 is ESM-only and exposes its API as named exports.
      .then(([module]) => module)
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
