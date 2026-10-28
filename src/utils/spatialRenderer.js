import { VERTEX, FRAGMENT, clampSpatialInput } from '../../packages/shared/spatialCore.js';
import { getSpatialMotionProfile, spatialSmoothingAlpha } from './spatialMotion.js';
export { clampSpatialInput, orientationToSpatialInput } from '../../packages/shared/spatialCore.js';

export function createSpatialRenderer(canvas, image, depth) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: false });
  if (!gl) throw new Error('此浏览器暂不支持空间场景，请尝试新版 Safari 或 Chrome。');
  const shaders = [];
  const textures = [];
  let program;
  let buffer;
  let frame = 0;
  let disposed = false;
  const dispose = () => {
    disposed = true;
    cancelAnimationFrame(frame);
    textures.forEach((texture) => gl.deleteTexture(texture));
    shaders.forEach((shader) => gl.deleteShader(shader));
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
  };
  try {
    program = gl.createProgram();
    [ [gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT] ].forEach(([type, source]) => {
      const shader = gl.createShader(type);
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('空间场景着色器初始化失败。');
      gl.attachShader(program, shader);
    });
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('空间场景渲染初始化失败。');
    gl.useProgram(program);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const upload = (unit, name, source) => {
      const texture = gl.createTexture();
      textures.push(texture);
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      if (unit === 0) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, depth.width, depth.height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, depth.values);
      }
      gl.uniform1i(gl.getUniformLocation(program, name), unit);
    };
    const photo = document.createElement('canvas');
    const scale = Math.min(1, Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE)) / Math.max(image.naturalWidth, image.naturalHeight));
    photo.width = Math.max(1, Math.round(image.naturalWidth * scale));
    photo.height = Math.max(1, Math.round(image.naturalHeight * scale));
    photo.getContext('2d').drawImage(image, 0, 0, photo.width, photo.height);
    upload(0, 'u_photo', photo);
    upload(1, 'u_depth');
    const offset = gl.getUniformLocation(program, 'u_offset');
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    const { strength } = getSpatialMotionProfile(depth);
    let lastFrameAt = null;
    let timeConstantMs = 120;
    const aspect = image.naturalWidth / image.naturalHeight;
    const draw = (timestamp) => {
      frame = 0;
      if (disposed || document.hidden) return;
      const alpha = spatialSmoothingAlpha(lastFrameAt === null ? 0 : timestamp - lastFrameAt, timeConstantMs);
      lastFrameAt = timestamp;
      current.x += (target.x - current.x) * alpha;
      current.y += (target.y - current.y) * alpha;
      const settled = Math.abs(target.x - current.x) + Math.abs(target.y - current.y) <= 0.001;
      if (settled) { current.x = target.x; current.y = target.y; }
      // Adaptive movement never exceeds the existing 2x amplitude/edge margin.
      gl.uniform2f(offset, current.x * 0.024 * strength, current.y * 0.016 * strength);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (!settled) frame = requestAnimationFrame(draw);
      else lastFrameAt = null;
    };
    const invalidate = () => {
      if (!frame && !disposed && !document.hidden) {
        lastFrameAt = performance.now();
        frame = requestAnimationFrame(draw);
      }
    };
    const resize = () => {
      const parent = canvas.parentElement;
      const preview = parent.querySelector('img');
      const cover = preview && getComputedStyle(preview).objectFit === 'cover';
      const width = (cover ? Math.max : Math.min)(parent.clientWidth, parent.clientHeight * aspect);
      const height = width / aspect;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const resolution = Math.min(window.devicePixelRatio || 1, 1.5, 1600 / Math.max(width, height, 1));
      canvas.width = Math.max(1, Math.round(width * resolution));
      canvas.height = Math.max(1, Math.round(height * resolution));
      gl.viewport(0, 0, canvas.width, canvas.height);
      cancelAnimationFrame(frame);
      frame = 0;
      lastFrameAt = null;
      draw(performance.now());
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas.parentElement);
    const visibility = () => {
      if (document.hidden) { cancelAnimationFrame(frame); frame = 0; lastFrameAt = null; }
      else invalidate();
    };
    document.addEventListener('visibilitychange', visibility);
    resize();
    return {
      setTarget(x, y, { returning = false } = {}) {
        target.x = clampSpatialInput(x); target.y = clampSpatialInput(y);
        timeConstantMs = returning ? 180 : 120;
        invalidate();
      },
      dispose() { observer.disconnect(); document.removeEventListener('visibilitychange', visibility); dispose(); },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
