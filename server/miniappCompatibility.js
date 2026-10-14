// Keep middleware instances shared: switching HTTP methods must not reset limits.
export function registerLikeRoutes(app, limiter, handler) {
  app.patch('/api/photos/:id/likes', limiter, handler);
  app.post('/api/photos/:id/likes', limiter, handler);
}
export function registerAdminUpdateRoutes(app, authenticateToken, requireAdmin, handler) {
  app.patch('/api/admin/photos/:id', authenticateToken, requireAdmin, handler);
  app.post('/api/admin/photos/:id/update', authenticateToken, requireAdmin, handler);
}
