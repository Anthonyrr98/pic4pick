// Include both current photo fields and film-stock tags from older uploads.
export function collectFilmStockOptions(entries = []) {
  const options = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const tags = Array.isArray(entry?.tags) ? entry.tags : String(entry?.tags || '').split(',');
    const legacy = tags.find((tag) => /^film_stock:/i.test(String(tag).trim()));
    const value = typeof entry === 'string'
      ? entry
      : entry?.filmStock || entry?.film_stock || String(legacy || '').trim().slice('film_stock:'.length);
    if (typeof value !== 'string' || !value.trim()) continue;
    const name = value.trim();
    const key = name.toLowerCase();
    if (!options.has(key)) options.set(key, name);
  }
  return [...options.values()];
}
