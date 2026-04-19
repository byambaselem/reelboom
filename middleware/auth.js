function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') return next();
  res.status(403).send('Хандах эрхгүй');
}

function optionalAuth(req, res, next) {
  res.locals.user = req.session.userId ? { id: req.session.userId, name: req.session.userName, role: req.session.role } : null;
  next();
}

module.exports = { requireAuth, requireAdmin, optionalAuth };
