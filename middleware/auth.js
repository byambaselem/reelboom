function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
  }
  // Админд шалгалтгүй
  if (req.session.role === 'admin') return next();

  // Хугацаа болон идэвх шалгах
  const db = require('../db');
  try {
    const u = db.prepare('SELECT is_active, expires_at FROM users WHERE id=?').get(req.session.userId);
    if (!u || u.is_active === 0) {
      req.session.destroy(() => {});
      return res.redirect('/login?err=inactive');
    }
    if (u.expires_at) {
      const exp = new Date(u.expires_at);
      if (exp < new Date()) {
        db.prepare('UPDATE users SET is_active=0 WHERE id=?').run(req.session.userId);
        req.session.destroy(() => {});
        return res.redirect('/login?err=expired');
      }
    }
  } catch(e) {}
  next();
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') return next();
  res.status(403).send('Хандах эрхгүй');
}

function optionalAuth(req, res, next) {
  if (!req.session.userId) {
    res.locals.user = null;
    res.locals.unread = 0;
    return next();
  }
  res.locals.user = { id: req.session.userId, name: req.session.userName, role: req.session.role };

  // Unread chat count
  const db = require('../db');
  try {
    let unread = 0;
    if (req.session.role === 'admin') {
      // Админд: бүх сурагчаас ирсэн уншаагүй мессежийн тоо
      // target_id = сурагчийн ID, user_id = сурагч өөрөө, is_read=0
      const r = db.prepare(`
        SELECT COUNT(*) as c FROM chat_messages
        WHERE user_id = target_id AND is_read = 0
      `).get();
      unread = r.c;
    } else {
      // Сурагчид: админаас ирсэн уншаагүй мессежийн тоо
      const r = db.prepare(`
        SELECT COUNT(*) as c FROM chat_messages
        WHERE target_id = ? AND user_id != ? AND is_read = 0
      `).get(req.session.userId, req.session.userId);
      unread = r.c;
    }
    res.locals.unread = unread;
    req.session.unreadChat = unread;
  } catch(e) {
    res.locals.unread = 0;
  }

  next();
}

module.exports = { requireAuth, requireAdmin, optionalAuth };
