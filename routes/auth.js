const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');

// GET /login
router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/lessons');
  const next = req.query.next || '/lessons';
  res.send(renderLogin({ error: null, next }));
});

// POST /login
router.post('/login', (req, res) => {
  const { email, password, next } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email?.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.send(renderLogin({ error: 'И-мэйл эсвэл нууц үг буруу байна.', next: next || '/lessons' }));
  }

  // Device session шалгах (admin-д хязгаар байхгүй)
  if (user.role !== 'admin') {
    const MAX_DEVICES = 3;
    const sessions = db.prepare('SELECT * FROM user_sessions WHERE user_id=? ORDER BY last_seen DESC').all(user.id);
    if (sessions.length >= MAX_DEVICES) {
      // Хамгийн хуучныг устгах
      const oldest = sessions[sessions.length - 1];
      db.prepare('DELETE FROM user_sessions WHERE id=?').run(oldest.id);
    }
  }

  req.session.userId = user.id;
  req.session.userName = user.name;
  req.session.role = user.role;
  req.session.avatar = user.avatar;

  // Шинэ device бүртгэх
  const ua = (req.headers['user-agent'] || '').substring(0, 200);
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || '';
  try {
    db.prepare('INSERT OR REPLACE INTO user_sessions (user_id, session_id, device_info, ip, last_seen) VALUES (?,?,?,?,CURRENT_TIMESTAMP)')
      .run(user.id, req.sessionID, ua, ip);
  } catch(e) {}

  res.redirect(next || '/lessons');
});

// GET /register
router.get('/register', (req, res) => {
  res.send(renderRegister({ error: null }));
});

// POST /register
router.post('/register', (req, res) => {
  const { name, email, password, password2, code } = req.body;
  if (!name || !email || !password || !password2 || !code) {
    return res.send(renderRegister({ error: 'Бүх талбарыг бөглөнө үү.' }));
  }
  if (password !== password2) {
    return res.send(renderRegister({ error: 'Нууц үг таарахгүй байна.' }));
  }
  if (password.length < 6) {
    return res.send(renderRegister({ error: 'Нууц үг дор хаяж 6 тэмдэгт байх ёстой.' }));
  }
  const ac = db.prepare('SELECT * FROM access_codes WHERE code=? AND used=0').get(code.trim().toUpperCase());
  if (!ac) {
    return res.send(renderRegister({ error: 'Нэвтрэх код буруу эсвэл ашиглагдсан байна.' }));
  }
  const exists = db.prepare('SELECT id FROM users WHERE email=?').get(email.trim().toLowerCase());
  if (exists) {
    return res.send(renderRegister({ error: 'Энэ и-мэйл бүртгэлтэй байна.' }));
  }
  const hash = bcrypt.hashSync(password, 10);
  const r = db.prepare('INSERT INTO users (name,email,password,access_code,is_verified) VALUES (?,?,?,?,1)')
    .run(name.trim(), email.trim().toLowerCase(), hash, code.trim().toUpperCase());
  db.prepare('UPDATE access_codes SET used=1, used_by=? WHERE id=?').run(r.lastInsertRowid, ac.id);
  req.session.userId = r.lastInsertRowid;
  req.session.userName = name.trim();
  req.session.role = 'student';
  res.redirect('/lessons');
});

// GET /logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// ─── HTML Renderers ────────────────────────────────────────────
function renderLogin({ error, next }) {
  return page('Нэвтрэх', `
    <div class="auth-wrap">
      <div class="auth-box">
        <div class="auth-logo">
          <span class="logo-text">ReeL<span class="logo-accent">BOOM</span></span>
        </div>
        <h2 class="auth-title">Нэвтрэх</h2>
        ${error ? `<div class="auth-error">${error}</div>` : ''}
        <form method="POST" action="/login">
          <input type="hidden" name="next" value="${next}">
          <div class="field">
            <label>И-мэйл</label>
            <input type="email" name="email" placeholder="you@email.com" required>
          </div>
          <div class="field">
            <label>Нууц үг</label>
            <input type="password" name="password" placeholder="••••••••" required>
          </div>
          <button type="submit" class="btn-submit">Нэвтрэх</button>
        </form>
        <div class="auth-footer">Бүртгэлгүй юу? <a href="/register">Бүртгүүлэх</a></div>
      </div>
    </div>
  `);
}

function renderRegister({ error }) {
  return page('Бүртгүүлэх', `
    <div class="auth-wrap">
      <div class="auth-box">
        <div class="auth-logo">
          <span class="logo-text">ReeL<span class="logo-accent">BOOM</span></span>
        </div>
        <h2 class="auth-title">Бүртгүүлэх</h2>
        <p class="auth-sub">Нэвтрэх кодыг худалдан авсны дараа авна.</p>
        ${error ? `<div class="auth-error">${error}</div>` : ''}
        <form method="POST" action="/register">
          <div class="field">
            <label>Нэр</label>
            <input type="text" name="name" placeholder="Таны нэр" required>
          </div>
          <div class="field">
            <label>И-мэйл</label>
            <input type="email" name="email" placeholder="you@email.com" required>
          </div>
          <div class="field">
            <label>Нууц үг</label>
            <input type="password" name="password" placeholder="Хамгийн багадаа 6 тэмдэгт" required minlength="6">
          </div>
          <div class="field">
            <label>Нууц үг давтах</label>
            <input type="password" name="password2" placeholder="Нууц үгээ дахин оруулна уу" required minlength="6">
          </div>
          <div class="field">
            <label>Нэвтрэх код</label>
            <input type="text" name="code" placeholder="XXXX-XXXX" required style="text-transform:uppercase;letter-spacing:2px">
          </div>
          <button type="submit" class="btn-submit">Бүртгүүлэх</button>
        </form>
        <div class="auth-footer">Бүртгэлтэй юу? <a href="/login">Нэвтрэх</a></div>
      </div>
    </div>
  `);
}

function page(title, body) {
  return `<!DOCTYPE html><html lang="mn"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — ReeL BOOM</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/main.css">
</head><body class="auth-page">${body}</body></html>`;
}

module.exports = router;
