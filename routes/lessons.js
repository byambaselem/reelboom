const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendAdminNotification } = require('../middleware/mailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Comment image upload
const commentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../public/uploads/comments');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2,8) + ext);
  }
});
const uploadComment = multer({
  storage: commentStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Зөвхөн зураг'));
  }
});

// GET /lessons — хичээлийн жагсаалт (нэвтэрсэн)
router.get('/', requireAuth, (req, res) => {
  const cats = db.prepare('SELECT * FROM categories ORDER BY sort_order').all();
  const lessons = db.prepare('SELECT l.*, c.title as cat_title, c.color FROM lessons l JOIN categories c ON l.category_id=c.id ORDER BY l.category_id, l.sort_order').all();
  const done = db.prepare('SELECT lesson_id FROM progress WHERE user_id=?').all(req.session.userId).map(r => r.lesson_id);

  const grouped = cats.map(cat => ({
    ...cat,
    lessons: lessons.filter(l => l.category_id === cat.id)
  }));

  res.send(renderLessons(grouped, done, req.session));
});

// GET /lessons/:id — хичээл үзэх
router.get('/:id', requireAuth, (req, res) => {
  const lesson = db.prepare('SELECT l.*, c.title as cat_title, c.color, c.slug as cat_slug FROM lessons l JOIN categories c ON l.category_id=c.id WHERE l.id=?').get(req.params.id);
  if (!lesson) return res.redirect('/lessons');

  const comments = db.prepare(`
    SELECT cm.*, u.name as user_name, u.role as user_role FROM comments cm
    JOIN users u ON cm.user_id=u.id
    WHERE cm.lesson_id=? AND cm.is_approved=1
    ORDER BY cm.created_at ASC
  `).all(lesson.id);

  const prev = db.prepare('SELECT id, title FROM lessons WHERE category_id=? AND sort_order<? ORDER BY sort_order DESC LIMIT 1').get(lesson.category_id, lesson.sort_order);
  const next = db.prepare('SELECT id, title FROM lessons WHERE category_id=? AND sort_order>? ORDER BY sort_order ASC LIMIT 1').get(lesson.category_id, lesson.sort_order);

  // Mark as viewed
  db.prepare('INSERT OR IGNORE INTO progress (user_id, lesson_id) VALUES (?,?)').run(req.session.userId, lesson.id);

  res.send(renderLesson(lesson, comments, prev, next, req.session));
});

// POST /lessons/:id/comment
router.post('/:id/comment', requireAuth, uploadComment.single('image'), async (req, res) => {
  const { content, parent_id } = req.body;
  const lessonId = req.params.id;
  const lesson = db.prepare('SELECT * FROM lessons WHERE id=?').get(lessonId);
  if (!lesson) return res.redirect(`/lessons/${lessonId}`);
  if (!content?.trim() && !req.file) return res.redirect(`/lessons/${lessonId}`);

  const image = req.file ? '/uploads/comments/' + req.file.filename : null;
  const parentId = parent_id ? parseInt(parent_id) : null;

  db.prepare('INSERT INTO comments (lesson_id, user_id, content, image, parent_id) VALUES (?,?,?,?,?)')
    .run(lessonId, req.session.userId, content?.trim() || '', image, parentId);

  if (req.session.role !== 'admin') {
    const notif = `Шинэ коммент: <b>${req.session.userName}</b> — "${lesson.title}"<br><br>"${(content||'').trim()}"`;
    db.prepare('INSERT INTO notifications (type, message, related_id) VALUES (?,?,?)').run('comment', notif, lessonId);
    await sendAdminNotification(`💬 Шинэ коммент — ${lesson.title}`, notif);
  }

  res.redirect(`/lessons/${lessonId}#comments`);
});

// POST /lessons/:id/done
router.post('/:id/done', requireAuth, (req, res) => {
  db.prepare('INSERT OR IGNORE INTO progress (user_id, lesson_id) VALUES (?,?)').run(req.session.userId, req.params.id);
  res.json({ ok: true });
});

// ─── HTML: Lessons List ─────────────────────────────────────────
function renderLessons(grouped, done, session) {
  const total = grouped.reduce((s, c) => s + c.lessons.length, 0);
  const doneCount = done.length;
  const progress = total > 0 ? Math.round(doneCount / total * 100) : 0;

  const catColors = {
    blue:'#3b82f6', amber:'#f59e0b', green:'#10b981',
    teal:'#14b8a6', purple:'#8b5cf6', pink:'#ec4899',
    rose:'#f43f5e', indigo:'#6366f1'
  };

  const catBg = {
    blue:'rgba(59,130,246,0.12)', amber:'rgba(245,158,11,0.12)', green:'rgba(16,185,129,0.12)',
    teal:'rgba(20,184,166,0.12)', purple:'rgba(139,92,246,0.12)', pink:'rgba(236,72,153,0.12)',
    rose:'rgba(244,63,94,0.12)', indigo:'rgba(99,102,241,0.12)'
  };

  const catIcons = {
    bichleg:'📱', gerel:'💡', avia:'🎵', montaj:'✂️',
    ai:'🤖', strategi:'🎯', brand:'📊', biznes:'💼'
  };

  const groupHtml = grouped.map(cat => {
    const color = catColors[cat.color] || '#8b5cf6';
    const bg = catBg[cat.color] || 'rgba(139,92,246,0.12)';
    const icon = catIcons[cat.slug] || '📚';
    const catDone = cat.lessons.filter(l => done.includes(l.id)).length;
    const catProg = cat.lessons.length > 0 ? Math.round(catDone / cat.lessons.length * 100) : 0;

    const cardsHtml = cat.lessons.map(l => {
      const isDone = done.includes(l.id);
      const hasVideo = !!l.video_url;
      const thumbStyle = l.thumbnail
        ? `background:url('${l.thumbnail}') center/cover no-repeat`
        : `background:${bg}`;
      return `
        <a href="/lessons/${l.id}" class="lcard ${isDone ? 'lcard-done' : ''}">
          <div class="lcard-thumb" style="${thumbStyle}">
            ${!l.thumbnail ? `<div class="lcard-thumb-icon">${icon}</div>` : ''}
            <div class="lcard-num-badge">${String(l.lesson_num).padStart(2,'0')}</div>
            ${isDone ? '<div class="lcard-done-badge">✓</div>' : ''}
            ${hasVideo ? '<div class="lcard-play"><div class="lcard-play-tri"></div></div>' : ''}
          </div>
          <div class="lcard-body">
            <div class="lcard-title">${l.title}</div>
            <div class="lcard-desc">${l.description ? l.description.substring(0,80) + (l.description.length > 80 ? '...' : '') : ''}</div>
            <div class="lcard-foot">
              <span class="lcard-dur">${l.duration || ''}</span>
              ${l.is_free ? '<span class="lcard-free">Үнэгүй</span>' : ''}
            </div>
          </div>
        </a>`;
    }).join('');

    return `
      <div class="cat-section" id="cat-${cat.slug}">
        <div class="cat-sec-header" onclick="toggleCat('${cat.slug}')">
          <div class="cat-sec-left">
            <span class="cat-sec-icon" style="background:${bg};border-color:${color}30">${icon}</span>
            <div>
              <div class="cat-sec-title" style="color:${color}">${cat.title}</div>
              <div class="cat-sec-meta">${cat.lessons.length} хичээл · ${catDone} үзсэн</div>
            </div>
          </div>
          <div class="cat-sec-right">
            <div class="cat-prog-wrap">
              <div class="cat-prog-bar"><div class="cat-prog-fill" style="width:${catProg}%;background:${color}"></div></div>
              <span class="cat-prog-label" style="color:${color}">${catProg}%</span>
            </div>
            <span class="cat-sec-arrow" id="arrow-${cat.slug}">▼</span>
          </div>
        </div>
        <div class="cat-cards-wrap" id="lessons-${cat.slug}">
          <div class="lcard-grid">${cardsHtml}</div>
        </div>
      </div>`;
  }).join('');

  return layout('Хичээлүүд', session, `
    <div class="lessons-page2">

      <div class="lp-header">
        <div class="lp-header-left">
          <h1 class="lp-title">Хичээлүүд</h1>
          <p class="lp-sub">${total} хичээл · ${doneCount} үзсэн · ${total - doneCount} үлдсэн</p>
        </div>
        <div class="lp-prog-big">
          <svg width="72" height="72" viewBox="0 0 72 72">
            <circle cx="36" cy="36" r="30" fill="none" stroke="rgba(139,92,246,0.15)" stroke-width="6"/>
            <circle cx="36" cy="36" r="30" fill="none" stroke="#8b5cf6" stroke-width="6"
              stroke-dasharray="${Math.round(2*3.14159*30)}"
              stroke-dashoffset="${Math.round(2*3.14159*30 * (1 - progress/100))}"
              stroke-linecap="round" transform="rotate(-90 36 36)"/>
            <text x="36" y="41" text-anchor="middle" font-size="14" font-weight="700" fill="#a78bfa" font-family="Plus Jakarta Sans,sans-serif">${progress}%</text>
          </svg>
        </div>
      </div>

      <div class="cat-sections">${groupHtml}</div>
    </div>

    <script>
    document.addEventListener('DOMContentLoaded', function() {
      const first = document.getElementById('lessons-' + '${grouped[0]?.slug || ''}');
      const firstArrow = document.getElementById('arrow-' + '${grouped[0]?.slug || ''}');
      if (first) { first.classList.add('open'); }
      if (firstArrow) { firstArrow.style.transform = 'rotate(180deg)'; }
    });
    </script>
  `);
}

// ─── HTML: Single Lesson ─────────────────────────────────────────
function renderLesson(lesson, comments, prev, next, session) {
  // Thread comments — parent -> replies
  const rootComments = comments.filter(c => !c.parent_id);
  const replyMap = {};
  comments.filter(c => c.parent_id).forEach(c => {
    if (!replyMap[c.parent_id]) replyMap[c.parent_id] = [];
    replyMap[c.parent_id].push(c);
  });

  const renderCommentHtml = (c, isReply=false) => {
    const isAdmin = c.role === 'admin' || c.user_role === 'admin';
    const initial = c.user_name.charAt(0).toUpperCase();
    return `
    <div class="comment ${isReply ? 'comment-reply' : ''} ${isAdmin ? 'comment-admin' : ''}" id="cm-${c.id}">
      <div class="comment-meta">
        <span class="comment-avatar ${isAdmin ? 'avatar-admin' : ''}">${initial}</span>
        <span class="comment-name">${escHtml(c.user_name)}${isAdmin ? ' <span class="admin-tag">ADMIN</span>' : ''}</span>
        <span class="comment-date">${new Date(c.created_at).toLocaleDateString('mn-MN')} ${new Date(c.created_at).toLocaleTimeString('mn-MN',{hour:'2-digit',minute:'2-digit'})}</span>
      </div>
      ${c.content ? `<div class="comment-body">${escHtml(c.content).replace(/\n/g,'<br>')}</div>` : ''}
      ${c.image ? `<a href="${c.image}" target="_blank"><img src="${c.image}" class="comment-img" alt="comment image"></a>` : ''}
      ${!isReply ? `<button type="button" class="reply-btn" onclick="showReplyForm(${c.id})">↳ Хариулах</button>` : ''}
      ${!isReply ? `
      <form class="reply-form" id="rf-${c.id}" style="display:none" method="POST" action="/lessons/${lesson.id}/comment" enctype="multipart/form-data">
        <input type="hidden" name="parent_id" value="${c.id}">
        <textarea name="content" placeholder="Хариултаа бичих..." rows="2"></textarea>
        <div class="comment-form-bot">
          <label class="img-btn">📎 Зураг<input type="file" name="image" accept="image/*" style="display:none"></label>
          <button type="submit">Илгээх</button>
        </div>
      </form>` : ''}
    </div>`;
  };

  const commentsHtml = rootComments.length === 0
    ? '<p class="no-comments">Одоогоор коммент байхгүй байна. Эхний коммент бичнэ үү!</p>'
    : rootComments.map(c => `
        ${renderCommentHtml(c)}
        ${(replyMap[c.id]||[]).map(r => renderCommentHtml(r, true)).join('')}
      `).join('');

  return layout(lesson.title, session, `
    <div class="lesson-page">
      <div class="lesson-main">
        <!-- Video -->
        <div class="video-wrap" id="vwrap-${lesson.id}">
          ${lesson.video_url
            ? `<div class="video-loading"><div class="vload-spinner"></div><span>Видео ачааллаж байна...</span></div>`
            : `<div class="video-placeholder"><span>Тун удахгүй...</span></div>`
          }
        </div>
        ${lesson.video_url ? `
        <script>
        (function() {
          fetch('/video-token/${lesson.id}')
            .then(r => r.json())
            .then(d => {
              if (!d.token) return;
              const wrap = document.getElementById('vwrap-${lesson.id}');
              wrap.innerHTML = '<iframe src="/video-src/' + d.token + '" frameborder="0" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" style="width:100%;height:100%"></iframe>';
            });
        })();
        </script>` : ''}

        <div class="lesson-info">
          <div class="lesson-meta-row">
            <span class="lesson-cat">${lesson.cat_title}</span>
            <span class="lesson-dur">${lesson.duration || ''}</span>
          </div>
          <h1 class="lesson-title">${escHtml(lesson.title)}</h1>
          <p class="lesson-desc">${escHtml(lesson.description || '').replace(/\n/g,'<br>')}</p>

          <div class="lesson-nav">
            ${prev ? `<a href="/lessons/${prev.id}" class="nav-btn nav-prev">← ${escHtml(prev.title)}</a>` : '<span></span>'}
            <button class="btn-done" onclick="markDone(${lesson.id})">✓ Дууслаа</button>
            ${next ? `<a href="/lessons/${next.id}" class="nav-btn nav-next">${escHtml(next.title)} →</a>` : '<span></span>'}
          </div>
        </div>

        <div class="comments-section" id="comments">
          <h3 class="comments-title">Асуулт & Коммент (${comments.length})</h3>
          <div class="comments-list">${commentsHtml}</div>

          <form class="comment-form" method="POST" action="/lessons/${lesson.id}/comment" enctype="multipart/form-data">
            <textarea name="content" placeholder="Асуулт эсвэл санал бодлоо бичнэ үү..." rows="3"></textarea>
            <div class="comment-form-bot">
              <label class="img-btn">📎 Зураг хавсаргах<input type="file" name="image" accept="image/*" style="display:none" onchange="showFileName(this)"></label>
              <span id="file-name" style="font-size:11px;color:var(--hint);flex:1"></span>
              <button type="submit">Илгээх</button>
            </div>
          </form>
        </div>
      </div>

      <div class="lesson-sidebar">
        <div class="sidebar-title">Хичээлийн жагсаалт</div>
        <a href="/lessons" class="back-link">← Бүх хичээл</a>
      </div>
    </div>
    <script>
    function showReplyForm(id) {
      const el = document.getElementById('rf-' + id);
      el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }
    function showFileName(input) {
      const name = input.files[0]?.name || '';
      document.getElementById('file-name').textContent = name;
    }
    </script>
  `);
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Layout wrapper ──────────────────────────────────────────────
function layout(title, session, body) {
  return `<!DOCTYPE html><html lang="mn"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — ReeL BOOM</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/main.css">
</head>
<body>
  <nav class="main-nav">
    <a href="/" class="nav-logo">ReeL<span>BOOM</span></a>
    <div class="nav-links">
      <a href="/lessons" class="nav-link">Хичээлүүд</a>
      ${session.role !== 'admin' ? '<a href="/chat" class="nav-link">💬 Админтай чатлах</a>' : ''}
      ${session.role === 'admin' ? '<a href="/admin" class="nav-link nav-admin">⚙ Admin</a>' : ''}
      <a href="/profile" class="nav-link nav-profile">
        ${session.avatar ? `<img src="${session.avatar}" class="nav-avatar">` : `<span class="nav-avatar-init">${(session.userName||'?').charAt(0).toUpperCase()}</span>`}
        ${session.userName || ''}
      </a>
      <a href="/logout" class="nav-logout">Гарах</a>
    </div>
  </nav>
  <main>${body}</main>
  <script>
  function toggleCat(slug) {
    const el = document.getElementById('lessons-' + slug);
    const arrow = document.getElementById('arrow-' + slug);
    if (!el) return;
    const isOpen = el.classList.contains('open');
    el.classList.toggle('open');
    if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
  }
  function markDone(id) {
    fetch('/lessons/' + id + '/done', {method:'POST'})
      .then(() => {
        const btn = document.querySelector('.btn-done');
        if (btn) { btn.textContent = '✓ Бүртгэгдлээ'; btn.style.background='#10b981'; }
      });
  }
  </script>
</body></html>`;
}

module.exports = router;
