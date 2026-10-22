import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';

export function registerFrontendStatic(app, { enabled, distDir }) {
  const indexPath = path.join(distDir, 'index.html');
  if (!enabled || !existsSync(indexPath)) return;

  app.use('/assets', express.static(path.join(distDir, 'assets')));
  app.use(express.static(distDir));
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(indexPath, (error) => {
      // A missing build, including one removed after startup, is a 404.
      if (error?.code === 'ENOENT' || error?.status === 404) return next();
      if (error) next(error);
    });
  });
}
