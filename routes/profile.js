const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOADS_DIR, 'avatars');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'av_' + req.session.userId + '_' + Date.now() + ext);
  }
});
const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Зөвхөн зураг'));
  }
});

// GET /profile
router.get('/', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.session.userId);
  const sessions = db.prepare('SELECT * FROM user_sessions WHERE user_id=? ORDER BY last_seen DESC').all(user.id);
  res.send(renderProfile(user, sessions, req.query.msg, req.query.err, req.session));
});

// POST /profile/avatar
router.post('/avatar', requireAuth, uploadAvatar.single('avatar'), (req, res) => {
  if (!req.file) return res.redirect('/profile?err=Зураг сонгогдоогүй');
  const url = '/uploads/avatars/' + req.file.filename;
  db.prepare('UPDATE users SET avatar=? WHERE id=?').run(url, req.session.userId);
  req.session.avatar = url;
  res.redirect('/profile?msg=Профайл зураг шинэчлэгдлээ');
});

// POST /profile/password
router.post('/password', requireAuth, (req, res) => {
  const { current_password, new_password, new_password2 } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.session.userId);
  if (!bcrypt.compareSync(current_password || '', user.password)) {
    return res.redirect('/profile?err=Одоогийн нууц үг буруу байна');
  }
  if (!new_password || new_password.length < 6) {
    return res.redirect('/profile?err=Шинэ нууц үг 6+ тэмдэгт байх ёстой');
  }
  if (new_password !== new_password2) {
    return res.redirect('/profile?err=Шинэ нууц үг таарахгүй байна');
  }
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password=? WHERE id=?').run(hash, req.session.userId);
  res.redirect('/profile?msg=Нууц үг амжилттай солигдлоо');
});

// POST /profile/name
router.post('/name', requireAuth, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.redirect('/profile?err=Нэрээ оруулна уу');
  db.prepare('UPDATE users SET name=? WHERE id=?').run(name.trim(), req.session.userId);
  req.session.userName = name.trim();
  res.redirect('/profile?msg=Нэр шинэчлэгдлээ');
});

// POST /profile/sessions/:id/delete
router.post('/sessions/:id/delete', requireAuth, (req, res) => {
  db.prepare('DELETE FROM user_sessions WHERE id=? AND user_id=?').run(req.params.id, req.session.userId);
  res.redirect('/profile');
});

function parseUA(ua) {
  if (!ua) return 'Үл мэдэгдэх';
  if (/iPhone|iPad/.test(ua)) return '📱 iPhone/iPad';
  if (/Android/.test(ua)) return '📱 Android';
  if (/Windows/.test(ua)) return '💻 Windows';
  if (/Mac/.test(ua)) return '💻 Mac';
  if (/Linux/.test(ua)) return '💻 Linux';
  return ua.substring(0, 30);
}

function renderProfile(user, sessions, msg, err, session) {
  const initials = (user.name || '?').charAt(0).toUpperCase();
  const avatar = user.avatar
    ? `<img src="${user.avatar}" class="prof-avatar-img">`
    : `<div class="prof-avatar-init">${initials}</div>`;

  return `<!DOCTYPE html><html lang="mn"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Миний профайл — ReeL BOOM</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/main.css">
</head><body>
  <nav class="main-nav">
    <a href="/" class="nav-logo">ReeL<span>BOOM</span></a>
    <div class="nav-links">
      <a href="/lessons" class="nav-link">Хичээлүүд</a>
      ${session.role !== 'admin' ? '<a href="/chat" class="nav-link">💬 Админтай чатлах</a>' : ''}
      ${session.role === 'admin' ? '<a href="/admin" class="nav-link nav-admin">⚙ Admin</a>' : ''}
      <a href="/profile" class="nav-link" style="color:var(--purple-l)">👤 ${session.userName}</a>
      <a href="/logout" class="nav-logout">Гарах</a>
    </div>
  </nav>
  <div class="prof-wrap">
    <h1 class="prof-h">Миний профайл</h1>
    ${msg ? `<div class="prof-alert ok">✓ ${msg}</div>` : ''}
    ${err ? `<div class="prof-alert err">✗ ${err}</div>` : ''}

    <div class="prof-card">
      <div class="prof-avatar-wrap">
        ${avatar}
      </div>
      <form method="POST" action="/profile/avatar" enctype="multipart/form-data" style="text-align:center">
        <label class="btn-outline" style="cursor:pointer;display:inline-block;padding:8px 18px;font-size:13px">
          Зураг солих
          <input type="file" name="avatar" accept="image/*" onchange="this.form.submit()" style="display:none">
        </label>
      </form>
      <div style="text-align:center;margin-top:1rem">
        <h2 style="color:#fff;font-size:1.25rem">${user.name}</h2>
        <p style="color:var(--hint);font-size:13px;margin-top:4px">${user.email}</p>
        ${user.role === 'admin' ? '<span class="admin-tag" style="margin-top:6px;display:inline-block">ADMIN</span>' : ''}
      </div>
    </div>

    <div class="prof-card">
      <h3 class="prof-section-h">Нэр</h3>
      <form method="POST" action="/profile/name" style="display:flex;gap:10px">
        <input type="text" name="name" value="${user.name}" required style="flex:1">
        <button type="submit" class="btn-primary">Хадгалах</button>
      </form>
    </div>

    <div class="prof-card">
      <h3 class="prof-section-h">Нууц үг солих</h3>
      <form method="POST" action="/profile/password">
        <div class="field">
          <label>Одоогийн нууц үг</label>
          <input type="password" name="current_password" required>
        </div>
        <div class="field">
          <label>Шинэ нууц үг (6+ тэмдэгт)</label>
          <input type="password" name="new_password" required minlength="6">
        </div>
        <div class="field">
          <label>Шинэ нууц үг дахин</label>
          <input type="password" name="new_password2" required minlength="6">
        </div>
        <button type="submit" class="btn-primary">Нууц үг солих</button>
      </form>
    </div>

    ${user.role !== 'admin' ? `
    <div class="prof-card">
      <h3 class="prof-section-h">🔒 Нэвтэрсэн төхөөрөмж (${sessions.length}/3)</h3>
      <p style="color:var(--hint);font-size:12px;margin-bottom:1rem">Хамгийн ихдээ 3 төхөөрөмжид нэвтэрч болно. Шинэ төхөөрөмжид нэвтрэхэд хамгийн хуучин нь автоматаар гарна.</p>
      ${sessions.map(s => `
        <div class="session-item">
          <div>
            <div style="font-size:13px;font-weight:600;color:#fff">${parseUA(s.device_info)}</div>
            <div style="font-size:11px;color:var(--hint);font-family:var(--mono);margin-top:2px">IP: ${s.ip || '?'} · Нэвтэрсэн: ${new Date(s.created_at).toLocaleDateString('mn-MN')}</div>
          </div>
          <form method="POST" action="/profile/sessions/${s.id}/delete" style="display:inline">
            <button class="btn-danger-sm" onclick="return confirm('Энэ төхөөрөмжөөс гаргах уу?')">Гарах</button>
          </form>
        </div>
      `).join('') || '<p style="color:var(--hint);font-size:13px">Төхөөрөмж байхгүй</p>'}
    </div>` : ''}
  </div>
</body></html>`;
}

module.exports = router;
