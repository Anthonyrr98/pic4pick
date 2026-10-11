const CURVE = 1.42;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const project = ([lng, lat]) => {
  const radians = clamp(lat, -85.051129, 85.051129) * Math.PI / 180;
  return [(lng + 180) / 360, (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2];
};

const unproject = ([x, y]) => [
  ((x * 360 % 360 + 360) % 360) - 180,
  Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI,
];

// Asymmetric ease: reach cruising speed early, then spend longer settling.
// Both velocity and acceleration reach zero at arrival, avoiding a hard stop.
export const cityFlightEasing = t => t * t * (6 + t * (-8 + 3 * t));

/** Continuous zoom/pan path based on Van Wijk & Nuij (2003), equations 8–9.
 * https://www.win.tue.nl/~vanwijk/zoompan.pdf
 * All distances use normalized Web Mercator coordinates, independent of the SDK.
 */
export function createCityFlight({ from, to, zoom, targetZoom = 10.2, width, height,
  offset = [0, 0], tileSize = 256 }) {
  const start = project(from);
  const destination = project(to);
  const finalScale = tileSize * 2 ** targetZoom;
  destination[0] -= offset[0] / finalScale;
  destination[1] = clamp(destination[1] - offset[1] / finalScale, 0, 1);
  // Take the shorter route when crossing the date line.
  destination[0] += Math.round(start[0] - destination[0]);
  const dx = destination[0] - start[0];
  const dy = destination[1] - start[1];
  const distance = Math.hypot(dx, dy);
  const span = Math.max(width, height, 1);
  const w0 = span / (tileSize * 2 ** zoom);
  const w1 = span / finalScale;
  const rho2 = CURVE ** 2;
  let length;
  let position;

  if (distance < 1e-9) {
    length = Math.abs(Math.log(w1 / w0)) / CURVE;
    position = t => ({ center: unproject(start), zoom: zoom + (targetZoom - zoom) * t });
  } else {
    const difference = w1 * w1 - w0 * w0;
    const travel = rho2 * rho2 * distance * distance;
    const r0 = -Math.asinh((difference + travel) / (2 * w0 * rho2 * distance));
    const r1 = -Math.asinh((difference - travel) / (2 * w1 * rho2 * distance));
    length = (r1 - r0) / CURVE;
    position = t => {
      const r = r0 + t * (r1 - r0);
      const progress = clamp(w0 * (Math.cosh(r0) * Math.tanh(r) - Math.sinh(r0)) / (rho2 * distance), 0, 1);
      const visibleSpan = w0 * Math.cosh(r0) / Math.cosh(r);
      return { center: unproject([start[0] + dx * progress, start[1] + dy * progress]),
        zoom: clamp(Math.log2(span / (tileSize * visibleSpan)), 2, 20) };
    };
  }

  const stationary = distance * tileSize * 2 ** zoom < 0.5 && Math.abs(zoom - targetZoom) < 0.01;
  return {
    duration: stationary ? 0 : Math.round(clamp(length / 1.5 * 1000, 900, 3600)) + 250,
    destination: unproject(destination),
    sample: t => t >= 1
      ? { center: unproject(destination), zoom: targetZoom }
      : t <= 0 ? { center: from, zoom } : position(cityFlightEasing(t)),
  };
}

/** Aim into the unobstructed part of the map, including the mobile bottom sheet. */
export function getCityFocusOffset(mapRect, panelRect) {
  if (!panelRect?.width || !panelRect.height) return [0, 0];
  if (panelRect.width > mapRect.width * 0.7) {
    const top = clamp(panelRect.top - mapRect.top, 0, mapRect.height);
    return [0, (top - mapRect.height) / 2];
  }
  const right = clamp(panelRect.right - mapRect.left, 0, mapRect.width);
  return [right / 2, 0];
}
