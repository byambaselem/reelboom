const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

const chatStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOADS_DIR, 'chat');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'ch_' + Date.now() + '_' + Math.random().toString(36).slice(2,6) + ext);
  }
});
const uploadChat = multer({
  storage: chatStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB — видео дэмжих
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Зөвхөн зураг эсвэл видео'));
  }
});

// Admin user олох helper
function getAdmin() {
  return db.prepare("SELECT id, name FROM users WHERE role='admin' LIMIT 1").get();
}

// GET /chat — хэрэглэгч бүх админтай group chat
router.get('/', requireAuth, (req, res) => {
  if (req.session.role === 'admin') return res.redirect('/admin/chat');

  // Энэ сурагчийн chat thread — target_id = сурагчийн ID
  // Илгээгч: сурагч өөрөө ЭСВЭЛ аль нэг админ
  const messages = db.prepare(`
    SELECT m.*, u.name as user_name, u.role as user_role, u.avatar as user_avatar
    FROM chat_messages m
    JOIN users u ON m.user_id = u.id
    WHERE m.target_id=? OR (m.user_id=? AND m.target_id IN (SELECT id FROM users WHERE role='admin'))
    ORDER BY m.created_at ASC
  `).all(req.session.userId, req.session.userId);

  // Админаас ирсэн мессежүүдийг уншсан гэж тэмдэглэх
  db.prepare(`
    UPDATE chat_messages SET is_read = 1
    WHERE target_id = ? AND user_id != ? AND is_read = 0
  `).run(req.session.userId, req.session.userId);
  req.session.unreadChat = 0;

  res.send(renderUserChat(messages, req.session));
});

// POST /chat — хэрэглэгч мессеж илгээх (target = сурагчийн өөрийнх нь ID — thread identifier)
router.post('/', requireAuth, uploadChat.single('media'), (req, res) => {
  if (req.session.role === 'admin') return res.redirect('/admin/chat');

  const { content } = req.body;
  if (!content?.trim() && !req.file) return res.redirect('/chat');
  let image = null, video = null;
  if (req.file) {
    const url = '/uploads/chat/' + req.file.filename;
    if (req.file.mimetype.startsWith('image/')) image = url;
    else video = url;
  }
  // target_id = сурагчийн ID (thread identifier)
  db.prepare('INSERT INTO chat_messages (user_id, target_id, content, image, video) VALUES (?,?,?,?,?)')
    .run(req.session.userId, req.session.userId, content?.trim() || '', image, video);

  // Бүх админд мэдэгдэл
  db.prepare('INSERT INTO notifications (type, message, related_id) VALUES (?,?,?)')
    .run('chat', `Шинэ чат: <b>${req.session.userName}</b> — "${(content||'').trim().substring(0,80)}"`, req.session.userId);

  res.redirect('/chat');
});

// GET /chat/messages — live polling
router.get('/messages', requireAuth, (req, res) => {
  const since = parseInt(req.query.since) || 0;
  const messages = db.prepare(`
    SELECT m.*, u.name as user_name, u.role as user_role, u.avatar as user_avatar
    FROM chat_messages m
    JOIN users u ON m.user_id = u.id
    WHERE (m.target_id=? OR (m.user_id=? AND m.target_id IN (SELECT id FROM users WHERE role='admin'))) AND m.id > ?
    ORDER BY m.created_at ASC
    LIMIT 50
  `).all(req.session.userId, req.session.userId, since);
  res.json(messages);
});

function escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderUserChat(messages, session) {
  const msgHtml = messages.map(m => {
    const isOwn = m.user_id === session.userId;
    const initials = (m.user_name || '?').charAt(0).toUpperCase();
    const avatarHtml = m.user_avatar
      ? `<img src="${m.user_avatar}" class="chat-avatar-img">`
      : `<div class="chat-avatar ${m.user_role === 'admin' ? 'avatar-admin' : ''}">${initials}</div>`;
    return `
      <div class="chat-msg ${isOwn ? 'own' : ''}" data-id="${m.id}">
        ${!isOwn ? avatarHtml : ''}
        <div class="chat-bubble ${isOwn ? 'own' : (m.user_role === 'admin' ? 'admin' : '')}">
          ${!isOwn ? `<div class="chat-name">${escHtml(m.user_name)}${m.user_role === 'admin' ? ' <span class="admin-tag">ADMIN</span>' : ''}</div>` : ''}
          ${m.content ? `<div class="chat-text">${escHtml(m.content).replace(/\n/g,'<br>')}</div>` : ''}
          ${m.image ? `<a href="${m.image}" target="_blank"><img src="${m.image}" class="chat-img"></a>` : ''}
          ${m.video ? `<video src="${m.video}" controls class="chat-video"></video>` : ''}
          <div class="chat-time">${new Date(m.created_at).toLocaleTimeString('mn-MN',{hour:'2-digit',minute:'2-digit'})}</div>
        </div>
      </div>`;
  }).join('');

  const lastId = messages.length > 0 ? messages[messages.length - 1].id : 0;

  return `<!DOCTYPE html><html lang="mn"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Админтай чатлах — ReeL BOOM</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/main.css">
</head><body>
  <nav class="main-nav">
    <a href="/" class="nav-logo">ReeL<span>BOOM</span></a>
    <div class="nav-links">
      <a href="/lessons" class="nav-link">Хичээлүүд</a>
      <a href="/chat" class="nav-link" style="color:var(--purple-l);position:relative">💬 Админтай чатлах${session.unreadChat > 0 ? `<span class="nav-badge">${session.unreadChat}</span>` : ''}</a>
      <a href="/profile" class="nav-link nav-profile">
        ${session.avatar ? `<img src="${session.avatar}" class="nav-avatar">` : `<span class="nav-avatar-init">${(session.userName||'?').charAt(0).toUpperCase()}</span>`}
        ${session.userName || ''}
      </a>
      <a href="/logout" class="nav-logout">Гарах</a>
    </div>
  </nav>

  <div class="chat-wrap">
    <div class="chat-header">
      <h1 class="chat-h">💬 Админтай чатлах</h1>
      <p class="chat-sub">Манай админ баг таны асуултад хариулна</p>
    </div>
    <div class="chat-messages" id="chatMsgs">
      ${msgHtml || '<p class="no-msg">Админд анхны мессежээ илгээнэ үү!</p>'}
    </div>
    <form class="chat-form" method="POST" action="/chat" enctype="multipart/form-data" id="chatForm">
      <div class="chat-form-inner">
        <label class="chat-attach" title="Зураг эсвэл видео"><input type="file" name="media" accept="image/*,video/*" onchange="showChatFile(this)">📎</label>
        <textarea name="content" placeholder="Мессежээ бичнэ үү..." rows="1" id="chatInput"></textarea>
        <button type="submit" class="chat-send">Илгээх</button>
      </div>
      <div id="chat-filename" style="font-size:11px;color:var(--hint);margin-top:6px;padding:0 10px"></div>
    </form>
  </div>

  <script>
    const msgsEl = document.getElementById('chatMsgs');
    msgsEl.scrollTop = msgsEl.scrollHeight;
    let lastId = ${lastId};
    const currentUserId = ${session.userId};

    function showChatFile(input) {
      document.getElementById('chat-filename').textContent = input.files[0]?.name || '';
    }

    async function checkNewMessages() {
      try {
        const r = await fetch('/chat/messages?since=' + lastId);
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

    function esc(s) {
      return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>');
    }

    function renderMsg(m) {
      const isOwn = m.user_id === currentUserId;
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

    setInterval(checkNewMessages, 4000);

    document.getElementById('chatInput').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('chatForm').submit();
      }
    });
  </script>
</body></html>`;
}

module.exports = router;
