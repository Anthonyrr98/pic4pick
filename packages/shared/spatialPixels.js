// Bilinear interpolation on raw pixels keeps model preprocessing independent of
// OffscreenCanvas, which is unavailable in some Safari/WebKit Worker contexts.
export function resizeSpatialPixels(data, width, height, channels, newWidth, newHeight) {
  const output = new Uint8ClampedArray(newWidth * newHeight * channels);
  for (let y = 0; y < newHeight; y += 1) {
    const sourceY = Math.max(0, Math.min(height - 1, (y + 0.5) * height / newHeight - 0.5));
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(height - 1, y0 + 1);
    const fy = sourceY - y0;
    for (let x = 0; x < newWidth; x += 1) {
      const sourceX = Math.max(0, Math.min(width - 1, (x + 0.5) * width / newWidth - 0.5));
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(width - 1, x0 + 1);
      const fx = sourceX - x0;
      for (let c = 0; c < channels; c += 1) {
        const top = data[(y0 * width + x0) * channels + c] * (1 - fx) + data[(y0 * width + x1) * channels + c] * fx;
        const bottom = data[(y1 * width + x0) * channels + c] * (1 - fx) + data[(y1 * width + x1) * channels + c] * fx;
        output[(y * newWidth + x) * channels + c] = top * (1 - fy) + bottom * fy;
      }
    }
  }
  return output;
}
