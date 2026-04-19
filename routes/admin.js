const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// Multer setup for thumbnail upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    cb(null, UPLOADS_DIR);
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

// Одоогийн request-ын unread count-г хадгалах (adminLayout-д ашиглана)
let _currentUnread = 0;
router.use((req, res, next) => {
  _currentUnread = req.session.unreadChat || 0;
  next();
});

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
        ${notifications.map(n => {
          const link = n.type === 'comment' ? `/lessons/${n.related_id}#comments` : (n.type === 'chat' ? `/admin/chat/${n.related_id}` : '#');
          return `
          <a href="${link}" class="notif-item ${n.is_read ? 'read' : 'unread'}" style="text-decoration:none;display:flex;gap:10px;padding:.75rem;margin:0 -.75rem;border-radius:10px;transition:background .15s">
            <div class="notif-type">${n.type === 'comment' ? '💬' : n.type === 'chat' ? '✉️' : '🔔'}</div>
            <div class="notif-body" style="flex:1">
              <div>${n.message}</div>
              <div class="notif-date">${new Date(n.created_at).toLocaleString('mn-MN')}</div>
            </div>
          </a>`;
        }).join('') || '<p class="empty">Мэдэгдэл байхгүй</p>'}
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
  const users = db.prepare("SELECT u.*, (SELECT COUNT(*) FROM progress p WHERE p.user_id=u.id) as done FROM users u ORDER BY u.role DESC, u.created_at DESC").all();
  res.send(adminLayout('Сурагчид', `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem">
      <h2 style="margin:0">Бүх хэрэглэгч (${users.length})</h2>
      <a href="/admin/users/new-admin" class="btn-primary" style="text-decoration:none">+ Шинэ Admin нэмэх</a>
    </div>
    <table class="admin-table">
      <thead><tr><th>#</th><th>Эрх</th><th>Нэр</th><th>И-мэйл</th><th>Код</th><th>Үзсэн</th><th>Огноо</th><th></th></tr></thead>
      <tbody>
        ${users.map(u => `
          <tr style="cursor:pointer" onclick="if(event.target.tagName!=='BUTTON' && event.target.tagName!=='FORM') window.location='/admin/users/${u.id}'">
            <td>${u.id}</td>
            <td>${u.role === 'admin' ? '<span class="admin-tag">ADMIN</span>' : '<span style="font-size:11px;color:var(--hint);font-family:var(--mono)">student</span>'}</td>
            <td style="color:#fff;font-weight:600">
              ${u.avatar ? `<img src="${u.avatar}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:8px">` : ''}
              ${u.name}
            </td>
            <td>${u.email}</td>
            <td><code>${u.access_code || '—'}</code></td>
            <td>${u.done} хичээл</td>
            <td>${new Date(u.created_at).toLocaleDateString('mn-MN')}</td>
            <td>
              ${u.id !== req.session.userId ? `
              <form method="POST" action="/admin/users/${u.id}/delete" style="display:inline" onclick="event.stopPropagation()">
                <button class="btn-danger-sm" onclick="return confirm('Устгах уу?')">Устгах</button>
              </form>` : '<span style="font-size:11px;color:var(--hint)">Та өөрөө</span>'}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `));
});

router.get('/users/new-admin', (req, res) => {
  res.send(adminLayout('Шинэ Admin', `
    <h2 style="margin-bottom:1.5rem">Шинэ Admin нэмэх</h2>
    <form method="POST" action="/admin/users/new-admin" class="lesson-form" style="max-width:500px;background:var(--bg);padding:1.5rem;border-radius:14px;border:1px solid var(--border)">
      <div class="field">
        <label>Нэр</label>
        <input type="text" name="name" required placeholder="Админы нэр">
      </div>
      <div class="field">
        <label>И-мэйл</label>
        <input type="email" name="email" required placeholder="admin@example.com">
      </div>
      <div class="field">
        <label>Нууц үг (6+ тэмдэгт)</label>
        <input type="password" name="password" required minlength="6">
      </div>
      <div class="field">
        <label>Нууц үг давтах</label>
        <input type="password" name="password2" required minlength="6">
      </div>
      <div style="display:flex;gap:12px;margin-top:1rem">
        <button type="submit" class="btn-primary">Admin нэмэх</button>
        <a href="/admin/users" style="font-size:13px;color:var(--muted)">Цуцлах</a>
      </div>
    </form>
  `));
});

router.post('/users/new-admin', (req, res) => {
  const { name, email, password, password2 } = req.body;
  if (!name?.trim() || !email?.trim() || !password) return res.redirect('/admin/users/new-admin');
  if (password !== password2) return res.redirect('/admin/users/new-admin');
  if (password.length < 6) return res.redirect('/admin/users/new-admin');
  const exists = db.prepare('SELECT id FROM users WHERE email=?').get(email.trim().toLowerCase());
  if (exists) return res.redirect('/admin/users');
  const hash = bcrypt.hashSync(password, 10);
  db.prepare("INSERT INTO users (name,email,password,role,is_verified) VALUES (?,?,?,?,1)")
    .run(name.trim(), email.trim().toLowerCase(), hash, 'admin');
  res.redirect('/admin/users');
});

router.post('/users/:id/delete', (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.session.userId) return res.redirect('/admin/users');
  db.prepare('DELETE FROM user_sessions WHERE user_id=?').run(id);
  db.prepare('DELETE FROM users WHERE id=?').run(id);
  res.redirect('/admin/users');
});

// Admin-аас тухайн хэрэглэгчийг удирдах хуудас
router.get('/users/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.redirect('/admin/users');
  const sessions = db.prepare('SELECT * FROM user_sessions WHERE user_id=? ORDER BY last_seen DESC').all(user.id);
  const progress = db.prepare(`
    SELECT p.*, l.title as lesson_title, l.lesson_num
    FROM progress p JOIN lessons l ON p.lesson_id=l.id
    WHERE p.user_id=? ORDER BY p.completed_at DESC LIMIT 20
  `).all(user.id);

  function parseUA(ua) {
    if (!ua) return 'Үл мэдэгдэх';
    if (/iPhone|iPad/.test(ua)) return '📱 iPhone/iPad';
    if (/Android/.test(ua)) return '📱 Android';
    if (/Windows/.test(ua)) return '💻 Windows';
    if (/Mac/.test(ua)) return '💻 Mac';
    if (/Linux/.test(ua)) return '💻 Linux';
    return ua.substring(0, 30);
  }

  res.send(adminLayout(user.name, `
    <a href="/admin/users" style="color:var(--purple-l);font-size:13px;text-decoration:none">← Бүх хэрэглэгч</a>

    <div style="display:flex;gap:1.5rem;align-items:center;margin:1rem 0 2rem;padding:1.5rem;background:var(--card);border:1px solid var(--border);border-radius:16px">
      ${user.avatar
        ? `<img src="${user.avatar}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:2px solid var(--purple-bdr)">`
        : `<div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#8b5cf6,#10b981);display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:800;color:#fff">${user.name.charAt(0).toUpperCase()}</div>`
      }
      <div style="flex:1">
        <h2 style="color:#fff;font-size:1.5rem;margin-bottom:4px">${user.name} ${user.role === 'admin' ? '<span class="admin-tag">ADMIN</span>' : ''}</h2>
        <p style="color:var(--hint);font-size:13px;margin-bottom:4px">${user.email}</p>
        <p style="color:var(--hint);font-size:11px;font-family:var(--mono)">Код: ${user.access_code || '—'} · Бүртгүүлсэн: ${new Date(user.created_at).toLocaleDateString('mn-MN')}</p>
      </div>
      ${user.id !== req.session.userId ? `
      <div style="display:flex;gap:8px">
        <a href="/admin/chat/${user.id}" class="btn-small" style="text-decoration:none">💬 Чатлах</a>
        <form method="POST" action="/admin/users/${user.id}/delete" style="display:inline">
          <button class="btn-danger-sm" onclick="return confirm('Хэрэглэгчийг бүхэлд нь устгах уу?')">Устгах</button>
        </form>
      </div>` : ''}
    </div>

    ${user.role === 'student' ? `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:1.25rem;margin-bottom:1rem">
      <h3 style="color:#fff;font-size:14px;margin-bottom:4px">🔒 Нэвтэрсэн төхөөрөмжүүд (${sessions.length}/3)</h3>
      <p style="color:var(--hint);font-size:12px;margin-bottom:1rem">3 төхөөрөмжийн хязгаартай. Та энд төхөөрөмж бүрийг гаргаж чадна.</p>
      ${sessions.map(s => `
        <div class="session-item">
          <div>
            <div style="font-size:13px;font-weight:600;color:#fff">${parseUA(s.device_info)}</div>
            <div style="font-size:11px;color:var(--hint);font-family:var(--mono);margin-top:2px">IP: ${s.ip || '?'} · ${new Date(s.last_seen).toLocaleString('mn-MN')}</div>
          </div>
          <form method="POST" action="/admin/users/${user.id}/session/${s.id}/delete" style="display:inline">
            <button class="btn-danger-sm" onclick="return confirm('Энэ төхөөрөмжөөс гаргах уу?')">Гаргах</button>
          </form>
        </div>
      `).join('') || '<p style="color:var(--hint);font-size:13px;padding:1rem 0">Идэвхтэй төхөөрөмж байхгүй</p>'}
      ${sessions.length > 0 ? `
      <form method="POST" action="/admin/users/${user.id}/sessions/clear" style="margin-top:12px">
        <button class="btn-danger-sm" onclick="return confirm('Бүх төхөөрөмжөөс гаргах уу?')">Бүгдээс гаргах</button>
      </form>` : ''}
    </div>

    <div style="background:var(--card);border:1px solid var(--border);border-radius:16px;padding:1.25rem">
      <h3 style="color:#fff;font-size:14px;margin-bottom:12px">📚 Сүүлд үзсэн хичээлүүд (${progress.length})</h3>
      ${progress.map(p => `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px">
          <div><span style="font-family:var(--mono);color:var(--hint)">${String(p.lesson_num).padStart(2,'0')}</span> <a href="/lessons/${p.lesson_id}" style="color:#fff">${p.lesson_title}</a></div>
          <span style="color:var(--hint);font-size:11px">${new Date(p.completed_at).toLocaleDateString('mn-MN')}</span>
        </div>
      `).join('') || '<p style="color:var(--hint);font-size:13px">Хичээл үзээгүй</p>'}
    </div>
    ` : ''}
  `));
});

router.post('/users/:id/session/:sid/delete', (req, res) => {
  db.prepare('DELETE FROM user_sessions WHERE id=? AND user_id=?').run(req.params.sid, req.params.id);
  res.redirect('/admin/users/' + req.params.id);
});

router.post('/users/:id/sessions/clear', (req, res) => {
  db.prepare('DELETE FROM user_sessions WHERE user_id=?').run(req.params.id);
  res.redirect('/admin/users/' + req.params.id);
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
      <thead><tr><th>Дараалал</th><th>Зураг</th><th>Нэр</th><th>Slug</th><th>Өнгө</th><th>Хичээл</th><th></th></tr></thead>
      <tbody>
        ${cats.map(c => `
          <tr>
            <td style="font-family:var(--mono);color:var(--hint)">${c.sort_order}</td>
            <td>${c.thumbnail
              ? `<img src="${c.thumbnail}" style="width:40px;height:40px;object-fit:cover;border-radius:8px">`
              : `<div style="width:40px;height:40px;border-radius:8px;background:${colorHex(c.color)}22;border:1px solid ${colorHex(c.color)}44"></div>`
            }</td>
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

router.post('/categories/new', upload.single('thumbnail'), (req, res) => {
  const { title, slug, color, sort_order } = req.body;
  if (!title || !slug) return res.redirect('/admin/categories');
  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const thumbnail = req.file ? '/uploads/' + req.file.filename : null;
  try {
    db.prepare('INSERT INTO categories (title, slug, color, thumbnail, sort_order) VALUES (?,?,?,?,?)').run(title.trim(), cleanSlug, color || 'purple', thumbnail, parseInt(sort_order) || 0);
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

router.post('/categories/:id/edit', upload.single('thumbnail'), (req, res) => {
  const { title, slug, color, sort_order } = req.body;
  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const existing = db.prepare('SELECT thumbnail FROM categories WHERE id=?').get(req.params.id);
  const thumbnail = req.file ? '/uploads/' + req.file.filename : (existing?.thumbnail || null);
  try {
    db.prepare('UPDATE categories SET title=?, slug=?, color=?, thumbnail=?, sort_order=? WHERE id=?').run(title.trim(), cleanSlug, color || 'purple', thumbnail, parseInt(sort_order) || 0, req.params.id);
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
    <form method="POST" action="${cat ? `/admin/categories/${cat.id}/edit` : '/admin/categories/new'}" enctype="multipart/form-data" class="lesson-form">
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
        <label>Thumbnail зураг</label>
        ${cat?.thumbnail ? `<div style="margin-bottom:8px"><img src="${cat.thumbnail}" style="width:80px;height:80px;object-fit:cover;border-radius:10px;border:1px solid var(--border)"></div>` : ''}
        <input type="file" name="thumbnail" accept="image/*" style="color:var(--muted);font-size:13px">
        <small style="color:var(--hint);font-size:11px;display:block;margin-top:4px">JPG, PNG · 1:1 харьцаа зөвлөнө · 2MB хүртэл</small>
      </div>
      <div class="field">
        <label>Өнгө (thumbnail байхгүй үед ашиглана)</label>
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
        <label>Badge текст</label>
        <input type="text" name="hero_badge" value="${settings.hero_badge||''}" placeholder="Монгол хэлний reel сургалт">
      </div>

      <div style="padding:1rem;background:var(--bg2);border:1px solid var(--border);border-radius:10px;margin-bottom:1rem">
        <div style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:12px">📝 Гарчиг — 3 мөр (өнгө тус тусдаа сонгоно)</div>

        <div class="field">
          <label>1-р мөр</label>
          <div style="display:flex;gap:8px">
            <input type="text" name="hero_line1" value="${settings.hero_line1||'Reel бичлэгийн'}" style="flex:1">
            <select name="hero_line1_mode" style="width:140px">
              <option value="white" ${(settings.hero_line1_mode||'white')==='white'?'selected':''}>Цагаан</option>
              <option value="gradient" ${settings.hero_line1_mode==='gradient'?'selected':''}>Градиент</option>
            </select>
          </div>
        </div>

        <div class="field">
          <label>2-р мөр</label>
          <div style="display:flex;gap:8px">
            <input type="text" name="hero_line2" value="${settings.hero_line2||'мэргэжлийн'}" style="flex:1">
            <select name="hero_line2_mode" style="width:140px">
              <option value="white" ${settings.hero_line2_mode==='white'?'selected':''}>Цагаан</option>
              <option value="gradient" ${(settings.hero_line2_mode||'gradient')==='gradient'?'selected':''}>Градиент</option>
            </select>
          </div>
        </div>

        <div class="field" style="margin-bottom:0">
          <label>3-р мөр</label>
          <div style="display:flex;gap:8px">
            <input type="text" name="hero_line3" value="${settings.hero_line3||'сургалт'}" style="flex:1">
            <select name="hero_line3_mode" style="width:140px">
              <option value="white" ${(settings.hero_line3_mode||'white')==='white'?'selected':''}>Цагаан</option>
              <option value="gradient" ${settings.hero_line3_mode==='gradient'?'selected':''}>Градиент</option>
            </select>
          </div>
        </div>
      </div>

      <div class="field">
        <label>Тайлбар текст (доод талын жижиг бичиг)</label>
        <textarea name="hero_subtitle" rows="3">${settings.hero_subtitle||''}</textarea>
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

      <div style="font-size:12px;font-weight:700;color:var(--purple-l);letter-spacing:1px;text-transform:uppercase;margin:1.5rem 0 1rem;padding-bottom:.5rem;border-bottom:1px solid var(--border)">Бидэнтэй холбогдох</div>

      <div class="field">
        <label>Хэсгийн гарчиг</label>
        <input type="text" name="contact_title" value="${settings.contact_title||'Бидэнтэй холбогдох'}">
      </div>
      <div class="field">
        <label>Хэсгийн тайлбар</label>
        <input type="text" name="contact_subtitle" value="${settings.contact_subtitle||''}">
      </div>
      <div class="field-row">
        <div class="field"><label>📞 Утас</label><input type="text" name="contact_phone" value="${settings.contact_phone||''}" placeholder="+976 99112233"></div>
        <div class="field"><label>✉ И-мэйл</label><input type="email" name="contact_email" value="${settings.contact_email||''}" placeholder="info@reelboom.mn"></div>
      </div>
      <div class="field">
        <label>📍 Хаяг</label>
        <input type="text" name="contact_address" value="${settings.contact_address||''}" placeholder="Улаанбаатар хот">
      </div>
      <div class="field-row">
        <div class="field"><label>Facebook</label><input type="text" name="contact_facebook" value="${settings.contact_facebook||''}" placeholder="https://facebook.com/..."></div>
        <div class="field"><label>Instagram</label><input type="text" name="contact_instagram" value="${settings.contact_instagram||''}" placeholder="https://instagram.com/..."></div>
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
      if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, 'setting_' + file.fieldname + '_' + Date.now() + ext);
    }
  }),
  limits: { fileSize: 2 * 1024 * 1024 }
});

router.post('/settings', uploadSettings.fields([{ name: 'site_logo', maxCount: 1 }]), (req, res) => {
  const fields = ['hero_title','hero_line1','hero_line2','hero_line3','hero_line1_mode','hero_line2_mode','hero_line3_mode','hero_subtitle','hero_badge','cta_title','cta_subtitle','stat_lessons','stat_blocks','stat_hours','stat_access','logo_size','grad_from','grad_to','text_color_mode','contact_title','contact_subtitle','contact_phone','contact_email','contact_facebook','contact_instagram','contact_address'];
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

// ─── Admin Chat Inbox ────────────────────────────────────────────
router.get('/chat', (req, res) => {
  // Бүх сурагчдын thread — target_id = сурагчийн ID
  const users = db.prepare(`
    SELECT u.id, u.name, u.email,
      (SELECT content FROM chat_messages WHERE target_id=u.id OR (user_id=u.id AND target_id IN (SELECT id FROM users WHERE role='admin')) ORDER BY created_at DESC LIMIT 1) as last_msg,
      (SELECT created_at FROM chat_messages WHERE target_id=u.id OR (user_id=u.id AND target_id IN (SELECT id FROM users WHERE role='admin')) ORDER BY created_at DESC LIMIT 1) as last_time,
      (SELECT COUNT(*) FROM chat_messages WHERE user_id=u.id AND target_id=u.id AND is_read=0) as unread_count
    FROM users u
    WHERE u.role='student'
    ORDER BY last_time DESC NULLS LAST
  `).all();

  res.send(adminLayout('Чат Inbox', `
    <h2 style="margin-bottom:1.25rem">💬 Чат Inbox (${users.length} сурагч)</h2>
    <p style="color:var(--hint);font-size:12px;margin-bottom:1rem">Бүх админ нэг thread-д хариулна. Сурагч хэн хариулсныг харна.</p>
    <div class="chat-inbox">
      ${users.map(u => `
        <a href="/admin/chat/${u.id}" class="inbox-item ${u.unread_count > 0 ? 'unread' : ''}">
          <div class="inbox-avatar">${u.name.charAt(0).toUpperCase()}</div>
          <div class="inbox-info">
            <div class="inbox-top">
              <span class="inbox-name">${u.name}</span>
              ${u.last_time ? `<span class="inbox-time">${new Date(u.last_time).toLocaleDateString('mn-MN')}</span>` : ''}
            </div>
            <div class="inbox-msg">${u.last_msg ? u.last_msg.substring(0, 80) + (u.last_msg.length > 80 ? '...' : '') : '<em style="color:var(--hint)">Чат хоосон</em>'}</div>
          </div>
          ${u.unread_count > 0 ? `<span class="inbox-badge">${u.unread_count}</span>` : ''}
        </a>
      `).join('')}
      ${users.length === 0 ? '<p style="color:var(--hint);padding:2rem;text-align:center">Одоогоор сурагч байхгүй</p>' : ''}
    </div>
  `));
});

router.get('/chat/:userId', (req, res) => {
  const user = db.prepare("SELECT id, name, email, avatar FROM users WHERE id=? AND role='student'").get(req.params.userId);
  if (!user) return res.redirect('/admin/chat');

  // Thread — target_id = сурагчийн ID, илгээгч: сурагч өөрөө ЭСВЭЛ аль нэг админ
  const messages = db.prepare(`
    SELECT m.*, u.name as user_name, u.role as user_role, u.avatar as user_avatar
    FROM chat_messages m
    JOIN users u ON m.user_id = u.id
    WHERE m.target_id=? OR (m.user_id=? AND m.target_id IN (SELECT id FROM users WHERE role='admin'))
    ORDER BY m.created_at ASC
  `).all(user.id, user.id);

  // Mark as read (сурагчаас ирсэн мессежүүдийг)
  db.prepare('UPDATE chat_messages SET is_read=1 WHERE user_id=? AND target_id=?').run(user.id, user.id);

  const msgHtml = messages.map(m => {
    const isOwn = m.user_id === req.session.userId; // миний өөрийн админ мессеж
    const initials = (m.user_name||'?').charAt(0).toUpperCase();
    const avatarHtml = m.user_avatar
      ? `<img src="${m.user_avatar}" class="chat-avatar-img">`
      : `<div class="chat-avatar ${m.user_role === 'admin' ? 'avatar-admin' : ''}">${initials}</div>`;
    return `
      <div class="chat-msg ${isOwn ? 'own' : ''}" data-id="${m.id}">
        ${!isOwn ? avatarHtml : ''}
        <div class="chat-bubble ${isOwn ? 'own' : (m.user_role === 'admin' ? 'admin' : '')}">
          ${!isOwn ? `<div class="chat-name">${m.user_name}${m.user_role === 'admin' ? ' <span class="admin-tag">ADMIN</span>' : ''}</div>` : ''}
          ${m.content ? `<div class="chat-text">${escHtmlAdmin(m.content).replace(/\n/g,'<br>')}</div>` : ''}
          ${m.image ? `<a href="${m.image}" target="_blank"><img src="${m.image}" class="chat-img"></a>` : ''}
          ${m.video ? `<video src="${m.video}" controls class="chat-video"></video>` : ''}
          <div class="chat-time">${new Date(m.created_at).toLocaleTimeString('mn-MN',{hour:'2-digit',minute:'2-digit'})}</div>
        </div>
      </div>`;
  }).join('');

  const lastId = messages.length > 0 ? messages[messages.length - 1].id : 0;

  res.send(adminLayout(`Чат — ${user.name}`, `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
      <div>
        <a href="/admin/chat" style="color:var(--purple-l);font-size:13px;text-decoration:none">← Inbox</a>
        <h2 style="margin-top:4px;display:flex;align-items:center;gap:10px">
          ${user.avatar ? `<img src="${user.avatar}" style="width:36px;height:36px;border-radius:50%;object-fit:cover">` : `<span class="inbox-avatar">${user.name.charAt(0).toUpperCase()}</span>`}
          ${user.name}
        </h2>
        <p style="color:var(--hint);font-size:12px">${user.email}</p>
      </div>
    </div>
    <div class="chat-wrap" style="max-width:760px;margin:0;height:calc(100vh - 260px);border:1px solid var(--border);border-radius:14px;padding:0 1rem">
      <div class="chat-messages" id="chatMsgs">
        ${msgHtml || '<p class="no-msg">Чат хоосон байна</p>'}
      </div>
      <form class="chat-form" method="POST" action="/admin/chat/${user.id}" enctype="multipart/form-data" id="chatForm">
        <div class="chat-form-inner">
          <label class="chat-attach" title="Зураг эсвэл видео"><input type="file" name="media" accept="image/*,video/*" onchange="document.getElementById('fname').textContent=this.files[0]?.name||''">📎</label>
          <textarea name="content" placeholder="Хариулт бичих..." rows="1" id="chatInput"></textarea>
          <button type="submit" class="chat-send">Илгээх</button>
        </div>
        <div id="fname" style="font-size:11px;color:var(--hint);margin-top:6px;padding:0 10px"></div>
      </form>
    </div>
    <script>
      const msgsEl = document.getElementById('chatMsgs');
      msgsEl.scrollTop = msgsEl.scrollHeight;
      let lastId = ${lastId};
      const adminId = ${req.session.userId};
      const userId = ${user.id};

      function esc(s) {
        return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>');
      }

      async function checkNew() {
        try {
          const r = await fetch('/admin/chat/' + userId + '/poll?since=' + lastId);
          const data = await r.json();
          if (data.length > 0) {
            data.forEach(m => {
              lastId = Math.max(lastId, m.id);
              msgsEl.insertAdjacentHTML('beforeend', renderMsg(m));
            });
            msgsEl.scrollTop = msgsEl.scrollHeight;
          }
        } catch(e) {}
      }
      function renderMsg(m) {
        const isOwn = m.user_id === adminId;
        const isAdmin = m.user_role === 'admin';
        const initial = (m.user_name||'?').charAt(0).toUpperCase();
        const time = new Date(m.created_at).toLocaleTimeString('mn-MN',{hour:'2-digit',minute:'2-digit'});
        const avatarHtml = m.user_avatar
          ? '<img src="' + m.user_avatar + '" class="chat-avatar-img">'
          : '<div class="chat-avatar ' + (isAdmin?'avatar-admin':'') + '">' + initial + '</div>';
        return '<div class="chat-msg ' + (isOwn?'own':'') + '">' +
          (!isOwn ? avatarHtml : '') +
          '<div class="chat-bubble ' + (isOwn?'own':(isAdmin?'admin':'')) + '">' +
            (!isOwn ? '<div class="chat-name">' + (m.user_name||'') + (isAdmin?' <span class="admin-tag">ADMIN</span>':'') + '</div>' : '') +
            (m.content ? '<div class="chat-text">' + esc(m.content) + '</div>' : '') +
            (m.image ? '<a href="' + m.image + '" target="_blank"><img src="' + m.image + '" class="chat-img"></a>' : '') +
            (m.video ? '<video src="' + m.video + '" controls class="chat-video"></video>' : '') +
            '<div class="chat-time">' + time + '</div>' +
          '</div></div>';
      }
      setInterval(checkNew, 4000);
      document.getElementById('chatInput').addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('chatForm').submit(); }
      });
    </script>
  `));
});

const uploadChatAdmin = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(UPLOADS_DIR, 'chat');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, 'adm_' + Date.now() + '_' + Math.random().toString(36).slice(2,6) + ext);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 }
});

router.post('/chat/:userId', uploadChatAdmin.single('media'), (req, res) => {
  const userId = parseInt(req.params.userId);
  const { content } = req.body;
  if (!content?.trim() && !req.file) return res.redirect('/admin/chat/' + userId);
  let image = null, video = null;
  if (req.file) {
    const url = '/uploads/chat/' + req.file.filename;
    if (req.file.mimetype.startsWith('image/')) image = url;
    else video = url;
  }
  // Илгээгч = энэ админ, target = сурагчийн ID (thread identifier)
  db.prepare('INSERT INTO chat_messages (user_id, target_id, content, image, video) VALUES (?,?,?,?,?)')
    .run(req.session.userId, userId, content?.trim() || '', image, video);
  res.redirect('/admin/chat/' + userId);
});

router.get('/chat/:userId/poll', (req, res) => {
  const userId = parseInt(req.params.userId);
  const since = parseInt(req.query.since) || 0;
  const messages = db.prepare(`
    SELECT m.*, u.name as user_name, u.role as user_role, u.avatar as user_avatar
    FROM chat_messages m
    JOIN users u ON m.user_id = u.id
    WHERE (m.target_id=? OR (m.user_id=? AND m.target_id IN (SELECT id FROM users WHERE role='admin'))) AND m.id > ?
    ORDER BY m.created_at ASC
  `).all(userId, userId, since);
  res.json(messages);
});

function escHtmlAdmin(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Comments management ────────────────────────────────────────
router.get('/comments', (req, res) => {
  const comments = db.prepare(`
    SELECT c.*, u.name as user_name, u.role as user_role, l.title as lesson_title, l.id as lesson_id
    FROM comments c
    JOIN users u ON c.user_id = u.id
    JOIN lessons l ON c.lesson_id = l.id
    ORDER BY c.created_at DESC
    LIMIT 100
  `).all();

  res.send(adminLayout('Коммент удирдах', `
    <h2 style="margin-bottom:1.25rem">💬 Коммент удирдах (${comments.length})</h2>
    <div class="admin-comments-list">
      ${comments.map(c => `
        <div class="admin-cm-card">
          <div class="admin-cm-head">
            <div>
              <b style="color:#fff">${c.user_name}</b>
              ${c.user_role === 'admin' ? '<span class="admin-tag">ADMIN</span>' : ''}
              ${c.parent_id ? '<span style="font-size:11px;color:var(--hint);font-family:var(--mono)">↳ хариулт</span>' : ''}
            </div>
            <span style="font-size:11px;color:var(--hint);font-family:var(--mono)">${new Date(c.created_at).toLocaleString('mn-MN')}</span>
          </div>
          <div style="font-size:12px;color:var(--purple-l);margin-bottom:8px">
            <a href="/lessons/${c.lesson_id}#cm-${c.id}" style="color:var(--purple-l)">📚 ${c.lesson_title}</a>
          </div>
          ${c.content ? `<div style="font-size:14px;color:var(--text);margin-bottom:8px;white-space:pre-wrap">${c.content}</div>` : ''}
          ${c.image ? `<img src="${c.image}" style="max-width:200px;border-radius:8px;margin-bottom:8px">` : ''}
          <div style="display:flex;gap:8px">
            <a href="/lessons/${c.lesson_id}#cm-${c.id}" class="btn-small" style="text-decoration:none">Хичээл дээр харах</a>
            <form method="POST" action="/admin/comments/${c.id}/delete" style="display:inline">
              <button class="btn-danger-sm" onclick="return confirm('Устгах уу?')">Устгах</button>
            </form>
          </div>
        </div>
      `).join('') || '<p class="empty">Коммент байхгүй</p>'}
    </div>
  `));
});

// ─── Legacy Comments delete ──────────────────────────────────────
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
  const unread = _currentUnread;
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
      <a href="/admin/comments" class="nav-link">Коммент</a>
      <a href="/admin/chat" class="nav-link" style="position:relative">💬 Inbox${unread > 0 ? `<span class="nav-badge">${unread}</span>` : ''}</a>
      <a href="/admin/settings" class="nav-link">⚙ Тохиргоо</a>
      <a href="/profile" class="nav-link" style="color:var(--purple-l)">👤 Профайл</a>
      <a href="/logout" class="nav-logout">Гарах</a>
    </div>
  </nav>
  <main class="admin-main">${body}</main>
</body></html>`;
}

module.exports = router;
