/**
 * Advance one preview candidate without letting srcset select the failed URL again.
 * @param {HTMLImageElement} image
 * @param {string[]} candidates
 */
export const advanceImageFallback = (image, candidates) => {
  let index = Number(image.dataset.previewFallbackIndex || '0');
  const current = image.currentSrc || image.src;
  while (candidates[index] === current) index += 1;
  const next = candidates[index];
  if (!next) return false;
  image.dataset.previewFallbackIndex = `${index + 1}`;
  image.srcset = '';
  image.sizes = '';
  image.src = next;
  return true;
};
