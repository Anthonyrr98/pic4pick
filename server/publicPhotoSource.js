export function parsePublicPhotoSource(rawUrl, currentHost) {
  try {
    const url = new URL(rawUrl);
    const key = decodeURIComponent(url.pathname.slice(1));
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || ![currentHost, 'websiteanthony.oss-cn-beijing.aliyuncs.com'].includes(url.hostname)
      || !/^(origin|ore|pic4pick)\//.test(key)
      || key.split('/').some(segment => segment === '..' || segment === '.') || key.includes('\\')) return null;
    // The legacy bucket holds public photos. Never forward signatures, query
    // commands or our current bucket's credentials to that host.
    return { key, legacy: url.hostname !== currentHost, url: `${url.origin}/${key.split('/').map(encodeURIComponent).join('/')}` };
  } catch { return null; }
}
