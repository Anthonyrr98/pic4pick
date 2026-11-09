const publicMapFields = {
  VITE_MAP_STYLE_PRESET: /^(?:street|satellite(?:_roads)?|js_(?:normal|light|whitesmoke|fresh|grey|graffiti|macaron|blue|darkblue|wine|dark))$/,
  VITE_MAP_USE_AMAP_SDK: /^(?:true|false)$/,
  VITE_AMAP_MAP_STYLE: /^amap:\/\/styles\/(?:normal|light|whitesmoke|fresh|grey|graffiti|macaron|blue|darkblue|wine|dark)$/,
  VITE_GAODE_RASTER_STYLE: /^[678]$/,
};

export function createPublicMapConfigHandler({ db, logger }) {
  return async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const rows = await db('app_settings', new URLSearchParams({
        select: 'data',
        id: 'eq.env_config',
        limit: '1',
      }), { signal: AbortSignal.timeout(8_000) });
      if (!Array.isArray(rows)) throw new Error('Unexpected settings response');
      const settings = rows[0]?.data;
      const data = {};
      for (const [key, pattern] of Object.entries(publicMapFields)) {
        const value = settings?.[key];
        if (typeof value === 'string' && pattern.test(value)) data[key] = value;
      }
      res.json({ data });
    } catch {
      logger.warn('公开地图配置读取失败');
      res.status(503).json({ error: '地图配置暂不可用' });
    }
  };
}
