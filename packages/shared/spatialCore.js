export const VERTEX = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = vec2((a_position.x + 1.0) * 0.5, (1.0 - a_position.y) * 0.5);
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

export const FRAGMENT = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_photo;
uniform sampler2D u_depth;
uniform vec2 u_offset;
void main() {
  // Small overscan hides the exposed outside edges; depth-dependent inverse
  // reprojection gives near objects more movement than the distant background.
  vec2 base = (v_uv - 0.5) / 1.045 + 0.5;
  vec2 uv = base;
  for (int i = 0; i < 3; i++) {
    float nearDepth = texture2D(u_depth, uv).r;
    uv = base - u_offset * (nearDepth - 0.35);
  }
  gl_FragColor = texture2D(u_photo, clamp(uv, vec2(0.001), vec2(0.999)));
}`;

export const clampSpatialInput = (value) => Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));

// Convert device coordinates to screen coordinates, including landscape iPhone.
export function orientationToSpatialInput(beta, gamma, baseline, angle = 0) {
  const radians = angle * Math.PI / 180;
  const x = (gamma - baseline.gamma) / 18;
  const y = (((beta - baseline.beta + 540) % 360) - 180) / 18;
  return {
    x: clampSpatialInput(x * Math.cos(radians) + y * Math.sin(radians)),
    y: clampSpatialInput(y * Math.cos(radians) - x * Math.sin(radians)),
  };
}


