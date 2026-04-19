const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Multer setup for thumbnail upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../public/uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'thumb_' + Date.now() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Зөвхөн зураг файл'));
  }
});

router.use(requireAdmin);

// GET /admin
router.get('/', (req, res) => {
  const users = db.prepare('SELECT COUNT(*) as c FROM users WHERE role!=?').get('admin').c;
  const comments = db.prepare('SELECT COUNT(*) as c FROM comments').get().c;
  const notifs = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE is_read=0').get().c;
  const recentComments = db.prepare(`
    SELECT cm.*, u.name as user_name, l.title as lesson_title
    FROM comments cm JOIN users u ON cm.user_id=u.id JOIN lessons l ON cm.lesson_id=l.id
    ORDER BY cm.created_at DESC LIMIT 10
  `).all();
  const notifications = db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 20').all();

  res.send(adminLayout('Dashboard', `
    <div class="admin-stats">
      <div class="astat"><div class="astat-n">${users}</div><div class="astat-l">Нийт сурагч</div></div>
      <div class="astat"><div class="astat-n">${comments}</div><div class="astat-l">Нийт коммент</div></div>
      <div class="astat"><div class="astat-n">${notifs}</div><div class="astat-l">Уншаагүй мэдэгдэл</div></div>
    </div>

    <div class="admin-grid">
      <div class="admin-card">
        <h3>Шинэ мэдэгдлүүд</h3>
        ${notifications.map(n => `
          <div class="notif-item ${n.is_read ? 'read' : 'unread'}">
            <div class="notif-type">${n.type === 'comment' ? '💬' : '🔔'}</div>
            <div class="notif-body">
              <div>${n.message}</div>
              <div class="notif-date">${new Date(n.created_at).toLocaleString('mn-MN')}</div>
            </div>
          </div>
        `).join('') || '<p class="empty">Мэдэгдэл байхгүй</p>'}
        <form method="POST" action="/admin/notifications/read-all" style="margin-top:1rem">
          <button type="submit" class="btn-small">Бүгдийг уншсан гэж тэмдэглэх</button>
        </form>
      </div>

      <div class="admin-card">
        <h3>Сүүлийн комментууд</h3>
        ${recentComments.map(c => `
          <div class="admin-comment">
            <div class="ac-meta"><b>${c.user_name}</b> · ${c.lesson_title}</div>
            <div class="ac-body">${c.content}</div>
            <div class="ac-actions">
              <form method="POST" action="/admin/comments/${c.id}/delete" style="display:inline">
                <button type="submit" class="btn-danger-sm" onclick="return confirm('Устгах уу?')">Устгах</button>
              </form>
            </div>
          </div>
        `).join('') || '<p class="empty">Коммент байхгүй</p>'}
      </div>
    </div>

    <div class="admin-nav-links">
      <a href="/admin/users" class="admin-link-btn">👥 Сурагчид</a>
      <a href="/admin/codes" class="admin-link-btn">🔑 Нэвтрэх кодууд</a>
      <a href="/admin/categories" class="admin-link-btn">📂 Бүлгүүд</a>
      <a href="/admin/lessons" class="admin-link-btn">📚 Хичээлүүд</a>
    </div>
  `));
  // Mark all as read
  db.prepare('UPDATE notifications SET is_read=1').run();
});

// ─── Users ───────────────────────────────────────────────────────
router.get('/users', (req, res) => {
  const users = db.prepare("SELECT u.*, (SELECT COUNT(*) FROM progress p WHERE p.user_id=u.id) as done FROM users u WHERE u.role!='admin' ORDER BY u.created_at DESC").all();
  res.send(adminLayout('Сурагчид', `
    <h2>Сурагчид (${users.length})</h2>
    <table class="admin-table">
      <thead><tr><th>#</th><th>Нэр</th><th>И-мэйл</th><th>Код</th><th>Үзсэн</th><th>Огноо</th><th></th></tr></thead>
      <tbody>
        ${users.map(u => `
          <tr>
            <td>${u.id}</td>
            <td>${u.name}</td>
            <td>${u.email}</td>
            <td><code>${u.access_code || '—'}</code></td>
            <td>${u.done} хичээл</td>
            <td>${new Date(u.created_at).toLocaleDateString('mn-MN')}</td>
            <td>
              <form method="POST" action="/admin/users/${u.id}/delete" style="display:inline">
                <button class="btn-danger-sm" onclick="return confirm('Устгах уу?')">Устгах</button>
              </form>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `));
});

router.post('/users/:id/delete', (req, res) => {
  db.prepare('DELETE FROM users WHERE id=? AND role!=?').run(req.params.id, 'admin');
  res.redirect('/admin/users');
});

// ─── Categories ───────────────────────────────────────────────────
const CAT_COLORS = ['blue','purple','green','teal','amber','pink','rose','indigo','coral'];

router.get('/categories', (req, res) => {
  const cats = db.prepare('SELECT c.*, (SELECT COUNT(*) FROM lessons l WHERE l.category_id=c.id) as lesson_count FROM categories c ORDER BY c.sort_order').all();
  res.send(adminLayout('Бүлгүүд', `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem">
      <h2 style="margin:0">Бүлгүүд (${cats.length})</h2>
      <a href="/admin/categories/new" class="btn-primary" style="text-decoration:none">+ Шинэ бүлэг</a>
    </div>
    <table class="admin-table">
      <thead><tr><th>Дараалал</th><th>Нэр</th><th>Slug</th><th>Өнгө</th><th>Хичээл</th><th></th></tr></thead>
      <tbody>
        ${cats.map(c => `
          <tr>
            <td style="font-family:var(--mono);color:var(--hint)">${c.sort_order}</td>
            <td style="font-weight:600;color:#fff">${c.title}</td>
            <td><code>${c.slug}</code></td>
            <td><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${colorHex(c.color)};margin-right:6px;vertical-align:middle"></span>${c.color}</td>
            <td style="font-family:var(--mono)">${c.lesson_count}</td>
            <td style="display:flex;gap:6px">
              <a href="/admin/categories/${c.id}/edit" class="btn-small" style="text-decoration:none">Засах</a>
              <form method="POST" action="/admin/categories/${c.id}/delete" style="display:inline">
                <button class="btn-danger-sm" onclick="return confirm('Бүлэг болон бүх хичээлийг устгах уу?')">Устгах</button>
              </form>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <p style="font-size:12px;color:var(--hint);margin-top:1rem">⚠ Бүлэг устгавал тухайн бүлгийн бүх хичээл мөн устана.</p>
  `));
});

router.get('/categories/new', (req, res) => {
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM categories').get().m || 0;
  res.send(adminLayout('Шинэ бүлэг', catForm(null, maxOrder + 1)));
});

router.post('/categories/new', (req, res) => {
  const { title, slug, color, sort_order } = req.body;
  if (!title || !slug) return res.redirect('/admin/categories');
  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  try {
    db.prepare('INSERT INTO categories (title, slug, color, sort_order) VALUES (?,?,?,?)').run(title.trim(), cleanSlug, color || 'purple', parseInt(sort_order) || 0);
  } catch(e) {
    return res.send(adminLayout('Шинэ бүлэг', catForm(null, sort_order) + `<p style="color:#f87171;margin-top:1rem">Алдаа: slug давхардсан байна. Өөр slug ашиглана уу.</p>`));
  }
  res.redirect('/admin/categories');
});

router.get('/categories/:id/edit', (req, res) => {
  const cat = db.prepare('SELECT * FROM categories WHERE id=?').get(req.params.id);
  if (!cat) return res.redirect('/admin/categories');
  res.send(adminLayout('Бүлэг засах', catForm(cat, cat.sort_order)));
});

router.post('/categories/:id/edit', (req, res) => {
  const { title, slug, color, sort_order } = req.body;
  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  try {
    db.prepare('UPDATE categories SET title=?, slug=?, color=?, sort_order=? WHERE id=?').run(title.trim(), cleanSlug, color || 'purple', parseInt(sort_order) || 0, req.params.id);
  } catch(e) {}
  res.redirect('/admin/categories');
});

router.post('/categories/:id/delete', (req, res) => {
  db.prepare('DELETE FROM lessons WHERE category_id=?').run(req.params.id);
  db.prepare('DELETE FROM categories WHERE id=?').run(req.params.id);
  res.redirect('/admin/categories');
});

function colorHex(c) {
  const m = {blue:'#3b82f6',purple:'#8b5cf6',green:'#10b981',teal:'#14b8a6',amber:'#f59e0b',pink:'#ec4899',rose:'#f43f5e',indigo:'#6366f1',coral:'#f97316'};
  return m[c] || '#8b5cf6';
}

function catForm(cat, defaultOrder) {
  const colors = ['blue','purple','green','teal','amber','pink','rose','indigo'];
  return `
    <h2>${cat ? 'Бүлэг засах' : 'Шинэ бүлэг'}</h2>
    <form method="POST" action="${cat ? `/admin/categories/${cat.id}/edit` : '/admin/categories/new'}" class="lesson-form">
      <div class="field">
        <label>Бүлгийн нэр (Монголоор)</label>
        <input type="text" name="title" value="${cat?.title||''}" placeholder="жишээ: AI засвар" required>
      </div>
      <div class="field">
        <label>Slug (латин үсгээр, зайгүй)</label>
        <input type="text" name="slug" value="${cat?.slug||''}" placeholder="жишээ: ai-zasvar" required
          oninput="this.value=this.value.toLowerCase().replace(/[^a-z0-9_-]/g,'')">
        <small style="color:var(--hint);font-size:11px">Жижиг латин үсэг, тоо, зураас (-) л ашиглана</small>
      </div>
      <div class="field">
        <label>Өнгө</label>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">
          ${colors.map(c => `
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--muted)">
              <input type="radio" name="color" value="${c}" ${(cat?.color||'purple')===c?'checked':''} style="width:auto">
              <span style="width:16px;height:16px;border-radius:50%;background:${colorHex(c)};display:inline-block"></span>
              ${c}
            </label>
          `).join('')}
        </div>
      </div>
      <div class="field">
        <label>Дараалал (жижиг тоо = эхэнд)</label>
        <input type="number" name="sort_order" value="${cat?.sort_order ?? defaultOrder}" min="0" style="width:100px">
      </div>
      <div style="display:flex;gap:12px;align-items:center;margin-top:1rem">
        <button type="submit" class="btn-primary">${cat ? 'Хадгалах' : 'Үүсгэх'}</button>
        <a href="/admin/categories" style="font-size:13px;color:var(--muted)">Цуцлах</a>
      </div>
    </form>
  `;
}

// ─── Access Codes ────────────────────────────────────────────────
router.get('/codes', (req, res) => {
  const codes = db.prepare('SELECT ac.*, u.name as used_by_name FROM access_codes ac LEFT JOIN users u ON ac.used_by=u.id ORDER BY ac.created_at DESC').all();
  res.send(adminLayout('Нэвтрэх кодууд', `
    <h2>Нэвтрэх кодууд</h2>
    <form method="POST" action="/admin/codes/generate" class="gen-form">
      <input type="number" name="count" value="1" min="1" max="50" style="width:80px">
      <button type="submit" class="btn-primary">Код үүсгэх</button>
    </form>
    <table class="admin-table">
      <thead><tr><th>Код</th><th>Статус</th><th>Ашигласан</th><th>Огноо</th><th></th></tr></thead>
      <tbody>
        ${codes.map(c => `
          <tr>
            <td><code style="font-size:15px;letter-spacing:2px">${c.code}</code></td>
            <td>${c.used ? '<span class="badge-used">Ашиглагдсан</span>' : '<span class="badge-free">Шинэ</span>'}</td>
            <td>${c.used_by_name || '—'}</td>
            <td>${new Date(c.created_at).toLocaleDateString('mn-MN')}</td>
            <td>
              ${!c.used ? `<form method="POST" action="/admin/codes/${c.id}/delete" style="display:inline">
                <button class="btn-danger-sm" onclick="return confirm('Устгах уу?')">Устгах</button>
              </form>` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `));
});

router.post('/codes/generate', (req, res) => {
  const count = Math.min(parseInt(req.body.count) || 1, 50);
  const insert = db.prepare('INSERT OR IGNORE INTO access_codes (code) VALUES (?)');
  for (let i = 0; i < count; i++) {
    const code = randomCode();
    insert.run(code);
  }
  res.redirect('/admin/codes');
});

router.post('/codes/:id/delete', (req, res) => {
  db.prepare('DELETE FROM access_codes WHERE id=? AND used=0').run(req.params.id);
  res.redirect('/admin/codes');
});

// ─── Lessons admin ───────────────────────────────────────────────
router.get('/lessons', (req, res) => {
  const lessons = db.prepare('SELECT l.*, c.title as cat_title FROM lessons l JOIN categories c ON l.category_id=c.id ORDER BY l.category_id, l.sort_order').all();
  const cats = db.prepare('SELECT * FROM categories ORDER BY sort_order').all();

  res.send(adminLayout('Хичээлүүд', `
    <h2>Хичээлүүд</h2>
    <a href="/admin/lessons/new" class="btn-primary" style="margin-bottom:1rem;display:inline-block">+ Шинэ хичээл</a>
    <table class="admin-table">
      <thead><tr><th>#</th><th>Гарчиг</th><th>Бүлэг</th><th>Хугацаа</th><th>Видео</th><th></th></tr></thead>
      <tbody>
        ${lessons.map(l => `
          <tr>
            <td>${l.lesson_num}</td>
            <td>${l.title}</td>
            <td>${l.cat_title}</td>
            <td>${l.duration || '—'}</td>
            <td>${l.video_url ? '<span class="badge-free">Тийм</span>' : '<span class="badge-used">Үгүй</span>'}</td>
            <td>
              <a href="/admin/lessons/${l.id}/edit" class="btn-small">Засах</a>
              <form method="POST" action="/admin/lessons/${l.id}/delete" style="display:inline">
                <button class="btn-danger-sm" onclick="return confirm('Устгах уу?')">Устгах</button>
              </form>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `));
});

router.get('/lessons/new', (req, res) => {
  const cats = db.prepare('SELECT * FROM categories ORDER BY sort_order').all();
  res.send(adminLayout('Шинэ хичээл', lessonForm(null, cats)));
});

router.post('/lessons/new', upload.single('thumbnail'), (req, res) => {
  const { category_id, lesson_num, title, description, video_url, duration, is_free, sort_order } = req.body;
  const thumbnail = req.file ? '/uploads/' + req.file.filename : null;
  db.prepare('INSERT INTO lessons (category_id,lesson_num,title,description,video_url,thumbnail,duration,is_free,sort_order) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(category_id, lesson_num, title, description, video_url, thumbnail, duration, is_free ? 1 : 0, sort_order || 0);
  res.redirect('/admin/lessons');
});

router.get('/lessons/:id/edit', (req, res) => {
  const lesson = db.prepare('SELECT * FROM lessons WHERE id=?').get(req.params.id);
  const cats = db.prepare('SELECT * FROM categories ORDER BY sort_order').all();
  res.send(adminLayout('Хичээл засах', lessonForm(lesson, cats)));
});

router.post('/lessons/:id/edit', upload.single('thumbnail'), (req, res) => {
  const { category_id, lesson_num, title, description, video_url, duration, is_free, sort_order } = req.body;
  const existing = db.prepare('SELECT thumbnail FROM lessons WHERE id=?').get(req.params.id);
  const thumbnail = req.file ? '/uploads/' + req.file.filename : (existing?.thumbnail || null);
  db.prepare('UPDATE lessons SET category_id=?,lesson_num=?,title=?,description=?,video_url=?,thumbnail=?,duration=?,is_free=?,sort_order=? WHERE id=?')
    .run(category_id, lesson_num, title, description, video_url, thumbnail, duration, is_free ? 1 : 0, sort_order || 0, req.params.id);
  res.redirect('/admin/lessons');
});

router.post('/lessons/:id/delete', (req, res) => {
  db.prepare('DELETE FROM lessons WHERE id=?').run(req.params.id);
  res.redirect('/admin/lessons');
});

// ─── Site Settings ───────────────────────────────────────────────
router.get('/settings', (req, res) => {
  const settings = {};
  db.prepare('SELECT key, value FROM site_settings').all().forEach(r => settings[r.key] = r.value);

  res.send(adminLayout('Сайтын тохиргоо', `
    <h2 style="margin-bottom:1.5rem">Сайтын тохиргоо</h2>
    <form method="POST" action="/admin/settings" enctype="multipart/form-data" class="lesson-form" style="max-width:720px;background:var(--bg);padding:1.5rem;border-radius:14px;border:1px solid var(--border)">

      <div style="font-size:12px;font-weight:700;color:var(--purple-l);letter-spacing:1px;text-transform:uppercase;margin-bottom:1rem;padding-bottom:.5rem;border-bottom:1px solid var(--border)">Лого</div>

      <div class="field">
        <label>Одоогийн лого</label>
        ${settings.site_logo ? `<div style="margin-bottom:8px;background:#000;padding:10px;border-radius:8px;display:inline-block"><img src="${settings.site_logo}" style="height:${settings.logo_size||48}px;object-fit:contain"></div>` : '<p style="color:var(--hint);font-size:12px">Одоогоор лого байхгүй</p>'}
        <input type="file" name="site_logo" accept="image/*" style="color:var(--muted);font-size:13px;margin-top:8px">
        <small style="color:var(--hint);font-size:11px;display:block;margin-top:4px">PNG (ил тод дэвсгэртэй) зөвлөнө · Хамгийн ихдээ 2MB</small>
      </div>

      <div class="field">
        <label>Логоны хэмжээ (px)</label>
        <div style="display:flex;align-items:center;gap:12px">
          <input type="range" name="logo_size" min="24" max="96" value="${settings.logo_size||48}" step="4" id="logoSizeRange" oninput="document.getElementById('logoSizeVal').textContent = this.value + 'px'" style="flex:1">
          <span id="logoSizeVal" style="font-family:var(--mono);font-size:14px;font-weight:700;color:var(--purple-l);min-width:60px;text-align:right">${settings.logo_size||48}px</span>
        </div>
        <small style="color:var(--hint);font-size:11px;display:block;margin-top:4px">Жижиг (24) — Том (96)</small>
      </div>

      <div style="font-size:12px;font-weight:700;color:var(--purple-l);letter-spacing:1px;text-transform:uppercase;margin:1.5rem 0 1rem;padding-bottom:.5rem;border-bottom:1px solid var(--border)">Хэв маягийн өнгө</div>

      <div class="field-row">
        <div class="field">
          <label>Градиент эхний өнгө</label>
          <input type="color" name="grad_from" value="${settings.grad_from||'#8b5cf6'}" style="width:100%;height:44px;padding:4px;border:1px solid var(--border);border-radius:8px;background:var(--bg2)">
        </div>
        <div class="field">
          <label>Градиент төгсгөлийн өнгө</label>
          <input type="color" name="grad_to" value="${settings.grad_to||'#10b981'}" style="width:100%;height:44px;padding:4px;border:1px solid var(--border);border-radius:8px;background:var(--bg2)">
        </div>
      </div>

      <div style="padding:1rem;border-radius:10px;background:linear-gradient(135deg,${settings.grad_from||'#8b5cf6'},${settings.grad_to||'#10b981'});text-align:center;color:#fff;font-weight:700;margin-top:8px">
        Үзэг — энэ бол таны градиент
      </div>

      <div style="font-size:12px;font-weight:700;color:var(--purple-l);letter-spacing:1px;text-transform:uppercase;margin:1.5rem 0 1rem;padding-bottom:.5rem;border-bottom:1px solid var(--border)">Нүүр хуудас — Hero хэсэг</div>

      <div class="field">
        <label>Badge текст (жижиг тэмдэглэгээ)</label>
        <input type="text" name="hero_badge" value="${settings.hero_badge||''}" placeholder="Монгол хэлний reel сургалт">
      </div>
      <div class="field">
        <label>Гол гарчиг</label>
        <input type="text" name="hero_title" value="${settings.hero_title||''}" placeholder="Reel бичлэгийн мэргэжлийн сургалт">
      </div>
      <div class="field">
        <label>Тайлбар текст</label>
        <textarea name="hero_subtitle" rows="3" placeholder="Тайлбар...">${settings.hero_subtitle||''}</textarea>
      </div>

      <div style="font-size:12px;font-weight:700;color:var(--purple-l);letter-spacing:1px;text-transform:uppercase;margin:1.5rem 0 1rem;padding-bottom:.5rem;border-bottom:1px solid var(--border)">Статистик тоонууд</div>

      <div class="field-row">
        <div class="field"><label>Хичээлийн тоо</label><input type="text" name="stat_lessons" value="${settings.stat_lessons||'32'}"></div>
        <div class="field"><label>Блокийн тоо</label><input type="text" name="stat_blocks" value="${settings.stat_blocks||'8'}"></div>
      </div>
      <div class="field-row">
        <div class="field"><label>Нийт цаг</label><input type="text" name="stat_hours" value="${settings.stat_hours||'~32ц'}"></div>
        <div class="field"><label>Хандалт</label><input type="text" name="stat_access" value="${settings.stat_access||'∞'}"></div>
      </div>

      <div style="font-size:12px;font-weight:700;color:var(--purple-l);letter-spacing:1px;text-transform:uppercase;margin:1.5rem 0 1rem;padding-bottom:.5rem;border-bottom:1px solid var(--border)">CTA хэсэг (доод дуудлага)</div>

      <div class="field">
        <label>CTA гарчиг</label>
        <input type="text" name="cta_title" value="${settings.cta_title||''}">
      </div>
      <div class="field">
        <label>CTA тайлбар</label>
        <input type="text" name="cta_subtitle" value="${settings.cta_subtitle||''}">
      </div>

      <div style="margin-top:1.5rem">
        <button type="submit" class="btn-primary">Хадгалах</button>
      </div>
    </form>
  `));
});

const uploadSettings = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, '../public/uploads');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, 'setting_' + file.fieldname + '_' + Date.now() + ext);
    }
  }),
  limits: { fileSize: 2 * 1024 * 1024 }
});

router.post('/settings', uploadSettings.fields([{ name: 'site_logo', maxCount: 1 }]), (req, res) => {
  const fields = ['hero_title','hero_subtitle','hero_badge','cta_title','cta_subtitle','stat_lessons','stat_blocks','stat_hours','stat_access','logo_size','grad_from','grad_to'];
  const upsert = db.prepare('INSERT OR REPLACE INTO site_settings (key, value) VALUES (?,?)');
  fields.forEach(f => { if (req.body[f] !== undefined) upsert.run(f, req.body[f]); });
  if (req.files?.site_logo?.[0]) {
    upsert.run('site_logo', '/uploads/' + req.files.site_logo[0].filename);
  }
  res.redirect('/admin/settings');
});

// ─── Homepage categories (tool pills) ────────────────────────────
router.get('/homepage', (req, res) => {
  const cats = db.prepare('SELECT * FROM homepage_categories ORDER BY sort_order').all();
  res.send(adminLayout('Нүүр хуудасны бүлгүүд', `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem">
      <div>
        <h2 style="margin:0">Нүүр хуудасны бүлгүүд</h2>
        <p style="color:var(--hint);font-size:12px;margin-top:4px">Нүүр хуудасны баруун талд харагдах багана</p>
      </div>
      <a href="/admin/homepage/new" class="btn-primary" style="text-decoration:none">+ Шинэ бүлэг</a>
    </div>
    <table class="admin-table">
      <thead><tr><th>Дараалал</th><th>Зураг</th><th>Нэр</th><th>Тайлбар</th><th>Хичээлийн муж</th><th></th></tr></thead>
      <tbody>
        ${cats.map(c => `
          <tr>
            <td style="font-family:var(--mono)">${c.sort_order}</td>
            <td>${c.thumbnail
              ? `<img src="${c.thumbnail}" style="width:40px;height:40px;object-fit:cover;border-radius:8px">`
              : `<div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:var(--bg3);border-radius:8px;font-size:18px">${c.icon||'📚'}</div>`
            }</td>
            <td style="color:#fff;font-weight:600">${c.title}</td>
            <td style="color:var(--muted);font-size:12px">${c.subtitle||''}</td>
            <td><code>${c.lesson_range||''}</code></td>
            <td style="display:flex;gap:6px">
              <a href="/admin/homepage/${c.id}/edit" class="btn-small" style="text-decoration:none">Засах</a>
              <form method="POST" action="/admin/homepage/${c.id}/delete" style="display:inline">
                <button class="btn-danger-sm" onclick="return confirm('Устгах уу?')">Устгах</button>
              </form>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `));
});

router.get('/homepage/new', (req, res) => {
  const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM homepage_categories').get().m || 0;
  res.send(adminLayout('Шинэ бүлэг', homeCatForm(null, maxOrder + 1)));
});

router.post('/homepage/new', uploadSettings.single('thumbnail'), (req, res) => {
  const { title, subtitle, icon, lesson_range, sort_order } = req.body;
  const thumbnail = req.file ? '/uploads/' + req.file.filename : null;
  db.prepare('INSERT INTO homepage_categories (title, subtitle, icon, lesson_range, thumbnail, sort_order) VALUES (?,?,?,?,?,?)')
    .run(title.trim(), subtitle?.trim() || '', icon?.trim() || '📚', lesson_range?.trim() || '', thumbnail, parseInt(sort_order) || 0);
  res.redirect('/admin/homepage');
});

router.get('/homepage/:id/edit', (req, res) => {
  const c = db.prepare('SELECT * FROM homepage_categories WHERE id=?').get(req.params.id);
  if (!c) return res.redirect('/admin/homepage');
  res.send(adminLayout('Бүлэг засах', homeCatForm(c, c.sort_order)));
});

router.post('/homepage/:id/edit', uploadSettings.single('thumbnail'), (req, res) => {
  const { title, subtitle, icon, lesson_range, sort_order } = req.body;
  const existing = db.prepare('SELECT thumbnail FROM homepage_categories WHERE id=?').get(req.params.id);
  const thumbnail = req.file ? '/uploads/' + req.file.filename : (existing?.thumbnail || null);
  db.prepare('UPDATE homepage_categories SET title=?, subtitle=?, icon=?, lesson_range=?, thumbnail=?, sort_order=? WHERE id=?')
    .run(title.trim(), subtitle?.trim() || '', icon?.trim() || '📚', lesson_range?.trim() || '', thumbnail, parseInt(sort_order) || 0, req.params.id);
  res.redirect('/admin/homepage');
});

router.post('/homepage/:id/delete', (req, res) => {
  db.prepare('DELETE FROM homepage_categories WHERE id=?').run(req.params.id);
  res.redirect('/admin/homepage');
});

function homeCatForm(c, defaultOrder) {
  return `
    <h2>${c ? 'Бүлэг засах' : 'Шинэ бүлэг'}</h2>
    <form method="POST" action="${c ? `/admin/homepage/${c.id}/edit` : '/admin/homepage/new'}" enctype="multipart/form-data" class="lesson-form" style="max-width:640px;background:var(--bg);padding:1.5rem;border-radius:14px;border:1px solid var(--border)">
      <div class="field">
        <label>Нэр</label>
        <input type="text" name="title" value="${c?.title||''}" placeholder="жишээ: iPhone бичлэг" required>
      </div>
      <div class="field">
        <label>Тайлбар</label>
        <input type="text" name="subtitle" value="${c?.subtitle||''}" placeholder="жишээ: Камерын тохиргоо, cinematic техник">
      </div>
      <div class="field-row">
        <div class="field">
          <label>Хичээлийн муж</label>
          <input type="text" name="lesson_range" value="${c?.lesson_range||''}" placeholder="1–4 хичээл">
        </div>
        <div class="field">
          <label>Дараалал</label>
          <input type="number" name="sort_order" value="${c?.sort_order ?? defaultOrder}" min="0">
        </div>
      </div>
      <div class="field">
        <label>Icon (emoji — зураг байхгүй үед харагдана)</label>
        <input type="text" name="icon" value="${c?.icon||'📚'}" placeholder="📱" style="width:100px;font-size:20px;text-align:center">
      </div>
      <div class="field">
        <label>Thumbnail зураг</label>
        ${c?.thumbnail ? `<div style="margin-bottom:8px"><img src="${c.thumbnail}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;border:1px solid var(--border)"></div>` : ''}
        <input type="file" name="thumbnail" accept="image/*" style="color:var(--muted);font-size:13px">
        <small style="color:var(--hint);font-size:11px;display:block;margin-top:4px">1:1 хэлбэр зөвлөнө · 2MB хүртэл</small>
      </div>
      <div style="display:flex;gap:12px;align-items:center;margin-top:1.25rem">
        <button type="submit" class="btn-primary">${c ? 'Хадгалах' : 'Нэмэх'}</button>
        <a href="/admin/homepage" style="font-size:13px;color:var(--muted)">Цуцлах</a>
      </div>
    </form>
  `;
}

// ─── Comments ────────────────────────────────────────────────────
router.post('/comments/:id/delete', (req, res) => {
  db.prepare('DELETE FROM comments WHERE id=?').run(req.params.id);
  res.redirect('/admin');
});

// ─── Notifications ───────────────────────────────────────────────
router.post('/notifications/read-all', (req, res) => {
  db.prepare('UPDATE notifications SET is_read=1').run();
  res.redirect('/admin');
});

// ─── Helpers ─────────────────────────────────────────────────────
function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function lessonForm(l, cats) {
  return `
    <h2 style="margin-bottom:1.5rem">${l ? 'Хичээл засах — ' + (l.title||'') : 'Шинэ хичээл'}</h2>
    <form method="POST" action="${l ? `/admin/lessons/${l.id}/edit` : '/admin/lessons/new'}" class="lesson-form" enctype="multipart/form-data" style="max-width:640px;position:relative;z-index:10;background:var(--bg);padding:1.5rem;border-radius:14px;border:1px solid var(--border)">
      <div class="field">
        <label>Бүлэг</label>
        <select name="category_id" required>
          ${cats.map(c => `<option value="${c.id}" ${l && l.category_id==c.id ? 'selected' : ''}>${c.title}</option>`).join('')}
        </select>
      </div>
      <div class="field-row">
        <div class="field"><label>Хичээл №</label><input type="number" name="lesson_num" value="${l?.lesson_num||''}" required></div>
        <div class="field"><label>Дараалал</label><input type="number" name="sort_order" value="${l?.sort_order||0}"></div>
      </div>
      <div class="field">
        <label>Гарчиг</label>
        <input type="text" name="title" value="${l?.title||''}" required>
      </div>
      <div class="field">
        <label>Тайлбар</label>
        <textarea name="description" rows="3">${l?.description||''}</textarea>
      </div>
      <div class="field">
        <label>Видео URL</label>
        <input type="text" name="video_url" value="${l?.video_url||''}" placeholder="https://player.vimeo.com/video/123456789">
        <small style="color:var(--hint);font-size:11px;margin-top:4px;display:block">Vimeo: https://player.vimeo.com/video/ID · YouTube: https://www.youtube.com/embed/ID</small>
      </div>
      <div class="field">
        <label>Хугацаа</label>
        <input type="text" name="duration" value="${l?.duration||''}" placeholder="25 мин" style="width:160px">
      </div>
      <div class="field">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" name="is_free" ${l?.is_free ? 'checked' : ''} style="width:auto">
          Үнэгүй хичээл (нэвтрэлтгүйгээр үзэж болно)
        </label>
      </div>
      <div class="field">
        <label>Thumbnail зураг</label>
        ${l?.thumbnail ? `<div style="margin-bottom:8px"><img src="${l.thumbnail}" style="width:120px;height:70px;object-fit:cover;border-radius:8px;border:1px solid var(--border)"><br><small style="color:var(--hint);font-size:11px">Одоогийн зураг — шинэ файл сонговол солигдоно</small></div>` : ''}
        <input type="file" name="thumbnail" accept="image/*" style="color:var(--muted);font-size:13px">
        <small style="color:var(--hint);font-size:11px;display:block;margin-top:4px">JPG, PNG, WEBP · Хамгийн ихдээ 5MB · 16:9 харьцаа зөвлөнө</small>
      </div>
      <div style="display:flex;gap:12px;align-items:center;margin-top:1.25rem">
        <button type="submit" class="btn-primary">${l ? 'Хадгалах' : 'Нэмэх'}</button>
        <a href="/admin/lessons" style="font-size:13px;color:var(--muted)">Цуцлах</a>
      </div>
    </form>
  `;
}

function adminLayout(title, body) {
  return `<!DOCTYPE html><html lang="mn"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/main.css">
</head>
<body>
  <nav class="main-nav admin-nav">
    <a href="/" class="nav-logo">ReeL<span>BOOM</span> <em>Admin</em></a>
    <div class="nav-links">
      <a href="/admin" class="nav-link">Dashboard</a>
      <a href="/admin/users" class="nav-link">Сурагчид</a>
      <a href="/admin/codes" class="nav-link">Кодууд</a>
      <a href="/admin/categories" class="nav-link">Бүлгүүд</a>
      <a href="/admin/lessons" class="nav-link">Хичээл</a>
      <a href="/admin/homepage" class="nav-link">Нүүр бүлэг</a>
      <a href="/admin/settings" class="nav-link">⚙ Тохиргоо</a>
      <a href="/chat" class="nav-link">💬 Чат</a>
      <a href="/logout" class="nav-logout">Гарах</a>
    </div>
  </nav>
  <main class="admin-main">${body}</main>
</body></html>`;
}

module.exports = router;
