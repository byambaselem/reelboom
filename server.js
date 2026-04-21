require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
const fs = require('fs');
const db = require('./db');
const { optionalAuth } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Railway volume path (локал дээр __dirname, Railway дээр /data)
const DATA_DIR = process.env.DATA_DIR || __dirname;
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// Uploads — volume-ээс serve хийх
app.use('/uploads', express.static(UPLOADS_DIR));

// Session
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: DATA_DIR }),
  secret: process.env.SESSION_SECRET || 'reelboom_secret_2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}));

app.use(optionalAuth);

// Хандалт бүртгэх middleware
app.use((req, res, next) => {
  // Зөвхөн GET хуудас бүртгэнэ
  if (req.method !== 'GET') return next();

  // Алгасах зүйлс
  const skipPaths = ['/uploads', '/css', '/js', '/favicon', '/robots.txt', '/video-', '/admin', '/chat/messages', '/chat/poll', '/video-token', '/video-src'];
  if (skipPaths.some(p => req.path.startsWith(p))) return next();
  if (req.path.includes('/poll') || req.path.includes('/messages')) return next();

  // Bot шалгах
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  const isBot = /bot|crawler|spider|crawling|facebookexternalhit|slack|discord|telegram|whatsapp|linkedin|twitter|preview|scanner/.test(ua);
  if (isBot) return next();

  const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();

  // Нэг IP-ээс нэг замаас хамгийн багадаа 1 минутын дараа л дахин тоолно
  try {
    const recent = db.prepare(`
      SELECT id FROM page_visits
      WHERE ip = ? AND path = ? AND created_at > datetime('now', '-1 minute')
      LIMIT 1
    `).get(ip, req.path);

    if (!recent) {
      db.prepare('INSERT INTO page_visits (ip, path, user_id) VALUES (?,?,?)')
        .run(ip, req.path.substring(0, 200), req.session.userId || null);
    }
  } catch(e) {}

  // Session heartbeat
  if (req.session.userId && req.sessionID) {
    try {
      db.prepare('UPDATE user_sessions SET last_seen=CURRENT_TIMESTAMP WHERE session_id=?').run(req.sessionID);
    } catch(e) {}
  }

  next();
});

// Routes
app.use('/', require('./routes/auth'));
app.use('/profile', require('./routes/profile'));

// Session cleanup — 24 цагийн турш идэвхгүй session-ыг устгана
setInterval(() => {
  try {
    db.prepare(`DELETE FROM user_sessions WHERE last_seen < datetime('now','-1 day')`).run();
  } catch(e) {}
}, 10 * 60 * 1000); // 10 минут тутамд
app.use('/lessons', require('./routes/lessons'));
app.use('/chat', require('./routes/chat'));
app.use('/admin', require('./routes/admin'));

// ─── Secure video proxy ──────────────────────────────────────────
// Видео URL-г нуух — нэвтэрсэн хэрэглэгчид л токен өгнө
app.get('/video-token/:lessonId', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Нэвтрэх шаардлагатай' });
  const lesson = db.prepare('SELECT video_url FROM lessons WHERE id=?').get(req.params.lessonId);
  if (!lesson || !lesson.video_url) return res.status(404).json({ error: 'Видео олдсонгүй' });
  // Нэг удаагийн токен үүсгэж URL-г encrypt хийхийн оронд
  // зүгээр л session шалгаад URL-г буцааж өгнө (frontend-д харагдахгүй)
  const token = Buffer.from(JSON.stringify({
    url: lesson.video_url,
    uid: req.session.userId,
    exp: Date.now() + 3600000
  })).toString('base64');
  res.json({ token });
});

app.get('/video-src/:token', (req, res) => {
  if (!req.session.userId) return res.status(401).send('Unauthorized');
  try {
    const data = JSON.parse(Buffer.from(req.params.token, 'base64').toString());
    if (data.exp < Date.now()) return res.status(403).send('Expired');
    if (data.uid !== req.session.userId) return res.status(403).send('Forbidden');
    // Redirect to actual URL - browser sees /video-src/TOKEN not YouTube URL
    res.redirect(data.url);
  } catch(e) {
    res.status(400).send('Invalid token');
  }
});

// Homepage
// Homepage
app.get('/__debug__', (req, res) => {
  const homeCats = db.prepare('SELECT * FROM homepage_categories ORDER BY sort_order').all();
  const settings = db.prepare('SELECT key, value FROM site_settings').all();
  const dbPath = require('path').join(process.env.DATA_DIR || __dirname, 'reelboom.db');
  res.json({
    DATA_DIR: process.env.DATA_DIR || 'NOT SET',
    dbPath,
    homeCats,
    settings
  });
});

app.get('/', (req, res) => {
  if (req.session.userId) return res.redirect('/lessons');
  const freeLessons = db.prepare('SELECT * FROM lessons WHERE is_free=1 ORDER BY lesson_num LIMIT 2').all();
  const settingsRaw = db.prepare('SELECT key, value FROM site_settings').all();
  const s = {};
  settingsRaw.forEach(r => s[r.key] = r.value);
  const homeCats = db.prepare('SELECT * FROM homepage_categories ORDER BY sort_order').all();
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.send(renderHomepage(freeLessons, s, homeCats));
});

function renderHomepage(freeLessons, s = {}, homeCats = []) {
  const title = s.hero_title || 'Reel бичлэгийн мэргэжлийн сургалт';
  const subtitle = s.hero_subtitle || 'iPhone бичлэгээс эхлэн CapCut монтаж, Freepik AI, агуулгын стратеги хүртэл — бүх зүйлийг нэг газраас.';
  const badge = s.hero_badge || 'Монгол хэлний reel сургалт';
  const ctaTitle = s.cta_title || 'Өнөөдөр эхлэцгээе';
  const ctaSub = s.cta_subtitle || '32 хичээл · 8 блок · ~32 цаг · бүх түвшинд тохиромжтой';
  const logo = s.site_logo || null;
  const logoSize = parseInt(s.logo_size) || 48;
  const gradFrom = s.grad_from || '#8b5cf6';
  const gradTo = s.grad_to || '#10b981';
  const line1 = s.hero_line1 || 'Reel бичлэгийн';
  const line2 = s.hero_line2 || 'мэргэжлийн';
  const line3 = s.hero_line3 || 'сургалт';
  const mode1 = s.hero_line1_mode || 'white';
  const mode2 = s.hero_line2_mode || 'gradient';
  const mode3 = s.hero_line3_mode || 'white';
  const styleOf = (mode) => mode === 'gradient'
    ? `background:linear-gradient(135deg,${gradFrom},${gradTo});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text`
    : `color:#fff`;

  const toolPillsHtml = homeCats.map(c => {
    const thumbHtml = c.thumbnail
      ? `<img src="${c.thumbnail}" style="width:36px;height:36px;border-radius:9px;object-fit:cover">`
      : `<div class="tp-icon" style="background:rgba(139,92,246,.18)">${c.icon || '📚'}</div>`;
    return `
      <div class="tp">
        ${thumbHtml}
        <div style="flex:1">
          <div class="tp-name">${c.title}</div>
          <div class="tp-sub">${c.subtitle || ''}</div>
        </div>
        ${c.lesson_range ? `<span class="tp-tag">${c.lesson_range}</span>` : ''}
      </div>`;
  }).join('');
  const freeCards = freeLessons.map(l => `
    <div class="free-card">
      <div class="free-video">
        <iframe src="${l.video_url}" frameborder="0" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe>
      </div>
      <div class="free-body">
        <div class="free-badge">ҮНЭГҮЙ</div>
        <div class="free-title">Хичээл ${String(l.lesson_num).padStart(2,'0')} — ${l.title}</div>
        <div class="free-desc">${l.description || ''}</div>
      </div>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="mn">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ReeL BOOM — Reel бичлэгийн мэргэжлийн сургалт</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/main.css">
</head>
<body>
  <nav class="main-nav">
    ${logo ? `<a href="/" class="nav-logo"><img src="${logo}" style="height:${logoSize}px;object-fit:contain"></a>` : `<div class="nav-logo">ReeL<span>BOOM</span></div>`}
    <div class="nav-links">
      <a href="#contact" class="nav-link">Бидэнтэй холбогдох</a>
      <a href="/login" class="nav-link">Нэвтрэх</a>
      <a href="/register" class="btn-grad" style="padding:7px 16px;border-radius:8px;font-size:13px;font-weight:700">Бүртгүүлэх</a>
    </div>
  </nav>

  <!-- Hero -->
  <div class="landing-hero">
    <div>
      <div class="hero-eyebrow"><span class="eyebrow-line"></span>${badge}</div>
      <h1 class="hero-h1">
        <span style="${styleOf(mode1)};display:block">${line1}</span>
        <span style="${styleOf(mode2)};display:block">${line2}</span>
        <span style="${styleOf(mode3)};display:block">${line3}</span>
      </h1>
      <p class="hero-p">${subtitle}</p>
      <div class="hero-btns">
        <a href="/register" class="btn-grad">Бүртгүүлэх ↗</a>
        <a href="/login" class="btn-outline">Нэвтрэх</a>
      </div>
    </div>
    <div class="tool-pills">
      ${homeCats.length > 0 ? homeCats.map((hc, i) => {
        const bgColors = ['rgba(139,92,246,.2)', 'rgba(16,185,129,.15)', 'rgba(59,130,246,.15)', 'rgba(245,158,11,.15)', 'rgba(236,72,153,.15)', 'rgba(244,63,94,.15)'];
        const bg = bgColors[i % bgColors.length];
        const iconHtml = hc.thumbnail
          ? `<img src="${hc.thumbnail}" class="tp-icon-img">`
          : `<div class="tp-icon" style="background:${bg}">${hc.icon || '📚'}</div>`;
        return `
        <div class="tp">
          ${iconHtml}
          <div style="flex:1">
            <div class="tp-name">${hc.title}</div>
            <div class="tp-sub">${hc.subtitle || ''}</div>
          </div>
          ${hc.lesson_range ? `<span class="tp-tag">${hc.lesson_range}</span>` : ''}
        </div>`;
      }).join('') : `
        <div class="tp"><div class="tp-icon" style="background:rgba(139,92,246,.2)">📱</div><div style="flex:1"><div class="tp-name">iPhone бичлэг</div><div class="tp-sub">Камерын тохиргоо, cinematic техник</div></div><span class="tp-tag">1–4 хичээл</span></div>
        <div class="tp"><div class="tp-icon" style="background:rgba(16,185,129,.15)">✂️</div><div style="flex:1"><div class="tp-name">CapCut засвар</div><div class="tp-sub">Монтаж, transition, AI засвар</div></div><span class="tp-tag">12–22 хичээл</span></div>
        <div class="tp"><div class="tp-icon" style="background:rgba(59,130,246,.15)">🎨</div><div style="flex:1"><div class="tp-name">Freepik AI</div><div class="tp-sub">Зураг үүсгэх, орчин солих</div></div><span class="tp-tag">19–20 хичээл</span></div>
        <div class="tp"><div class="tp-icon" style="background:rgba(245,158,11,.15)">📈</div><div style="flex:1"><div class="tp-name">Стратеги & өсөлт</div><div class="tp-sub">Алгоритм, брэнд, монетизаци</div></div><span class="tp-tag">23–32 хичээл</span></div>
      `}
    </div>
  </div>

  <!-- Free lessons -->
  ${freeLessons.length > 0 ? `
  <div class="free-videos">
    <div class="section-tag">// үнэгүй хичээл</div>
    <div class="section-h">Туршаад үзээрэй</div>
    <div class="free-grid">${freeCards}</div>
  </div>` : ''}

  <!-- Contact -->
  <div class="landing-contact" id="contact">
    <div class="section-tag">// холбоо барих</div>
    <div class="contact-head">
      <h2 class="contact-title">${s.contact_title || 'Бидэнтэй холбогдох'}</h2>
      <p class="contact-sub">${s.contact_subtitle || ''}</p>
    </div>
    <div class="contact-grid">
      ${s.contact_phone ? `
      <a href="tel:${s.contact_phone}" class="contact-item">
        <div class="contact-icon">📞</div>
        <div>
          <div class="contact-label">Утас</div>
          <div class="contact-value">${s.contact_phone}</div>
        </div>
      </a>` : ''}
      ${s.contact_email ? `
      <a href="mailto:${s.contact_email}" class="contact-item">
        <div class="contact-icon">✉️</div>
        <div>
          <div class="contact-label">И-мэйл</div>
          <div class="contact-value">${s.contact_email}</div>
        </div>
      </a>` : ''}
      ${s.contact_facebook ? `
      <a href="${s.contact_facebook}" target="_blank" class="contact-item">
        <div class="contact-icon">📘</div>
        <div>
          <div class="contact-label">Facebook</div>
          <div class="contact-value">Хуудас харах</div>
        </div>
      </a>` : ''}
      ${s.contact_instagram ? `
      <a href="${s.contact_instagram}" target="_blank" class="contact-item">
        <div class="contact-icon">📸</div>
        <div>
          <div class="contact-label">Instagram</div>
          <div class="contact-value">Хуудас харах</div>
        </div>
      </a>` : ''}
      ${s.contact_address ? `
      <div class="contact-item" style="grid-column:1/-1">
        <div class="contact-icon">📍</div>
        <div>
          <div class="contact-label">Хаяг</div>
          <div class="contact-value">${s.contact_address}</div>
        </div>
      </div>` : ''}
    </div>
  </div>

  <!-- CTA -->
  <div class="landing-cta">
    <div class="cta-h">${ctaTitle}</div>
    <p class="cta-p">${ctaSub}</p>
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
      <a href="/register" class="btn-grad" style="font-size:15px;padding:13px 30px">Бүртгүүлэх ↗</a>
      <a href="/login" class="btn-outline" style="font-size:15px;padding:13px 28px">Нэвтрэх</a>
    </div>
  </div>

  <script>
  // Accordion toggle for lesson list page
  function toggleCat(slug) {
    const el = document.getElementById('lessons-' + slug);
    const arrow = document.getElementById('arrow-' + slug);
    if (!el) return;
    el.classList.toggle('open');
    arrow.style.transform = el.classList.contains('open') ? 'rotate(180deg)' : '';
  }
  </script>
</body>
</html>`;
}

app.listen(PORT, () => {
  console.log(`✅ ReeL BOOM running at http://localhost:${PORT}`);
  console.log(`   Admin: admin@reelboom.mn / admin123`);
});
