const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const chatStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../public/uploads/chat');
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
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Зөвхөн зураг'));
  }
});

// GET /chat — чат хуудас
router.get('/', requireAuth, (req, res) => {
  const messages = db.prepare(`
    SELECT m.*, u.name as user_name, u.role as user_role
    FROM chat_messages m
    JOIN users u ON m.user_id = u.id
    ORDER BY m.created_at DESC
    LIMIT 100
  `).all().reverse();

  res.send(renderChat(messages, req.session));
});

// POST /chat — шинэ мессеж
router.post('/', requireAuth, uploadChat.single('image'), (req, res) => {
  const { content } = req.body;
  if (!content?.trim() && !req.file) return res.redirect('/chat');
  const image = req.file ? '/uploads/chat/' + req.file.filename : null;
  db.prepare('INSERT INTO chat_messages (user_id, content, image) VALUES (?,?,?)')
    .run(req.session.userId, content?.trim() || '', image);
  res.redirect('/chat');
});

// GET /chat/messages — AJAX (live refresh)
router.get('/messages', requireAuth, (req, res) => {
  const since = parseInt(req.query.since) || 0;
  const messages = db.prepare(`
    SELECT m.*, u.name as user_name, u.role as user_role
    FROM chat_messages m
    JOIN users u ON m.user_id = u.id
    WHERE m.id > ?
    ORDER BY m.created_at ASC
    LIMIT 50
  `).all(since);
  res.json(messages);
});

function escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderChat(messages, session) {
  const msgHtml = messages.map(m => {
    const isOwn = m.user_id === session.userId;
    const isAdmin = m.user_role === 'admin';
    const initial = m.user_name.charAt(0).toUpperCase();
    return `
      <div class="chat-msg ${isOwn ? 'own' : ''}" data-id="${m.id}">
        ${!isOwn ? `<div class="chat-avatar ${isAdmin ? 'avatar-admin' : ''}">${initial}</div>` : ''}
        <div class="chat-bubble ${isOwn ? 'own' : ''} ${isAdmin ? 'admin' : ''}">
          ${!isOwn ? `<div class="chat-name">${escHtml(m.user_name)}${isAdmin ? ' <span class="admin-tag">ADMIN</span>' : ''}</div>` : ''}
          ${m.content ? `<div class="chat-text">${escHtml(m.content).replace(/\n/g,'<br>')}</div>` : ''}
          ${m.image ? `<a href="${m.image}" target="_blank"><img src="${m.image}" class="chat-img"></a>` : ''}
          <div class="chat-time">${new Date(m.created_at).toLocaleTimeString('mn-MN',{hour:'2-digit',minute:'2-digit'})}</div>
        </div>
      </div>`;
  }).join('');

  const lastId = messages.length > 0 ? messages[messages.length - 1].id : 0;

  return `<!DOCTYPE html><html lang="mn"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Чат — ReeL BOOM</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/main.css">
</head><body>
  <nav class="main-nav">
    <a href="/" class="nav-logo">ReeL<span>BOOM</span></a>
    <div class="nav-links">
      <a href="/lessons" class="nav-link">Хичээлүүд</a>
      <a href="/chat" class="nav-link" style="color:var(--purple-l)">💬 Чат</a>
      ${session.role === 'admin' ? '<a href="/admin" class="nav-link nav-admin">⚙ Admin</a>' : ''}
      <span class="nav-user">${session.userName || ''}</span>
      <a href="/logout" class="nav-logout">Гарах</a>
    </div>
  </nav>

  <div class="chat-wrap">
    <div class="chat-header">
      <h1 class="chat-h">💬 Нийтийн чат</h1>
      <p class="chat-sub">Бүх гишүүд, админ хоорондоо харилцах</p>
    </div>
    <div class="chat-messages" id="chatMsgs">
      ${msgHtml || '<p class="no-msg">Энэ чат хоосон байна. Эхний мессежийг та бичээрэй!</p>'}
    </div>
    <form class="chat-form" method="POST" action="/chat" enctype="multipart/form-data" id="chatForm">
      <div class="chat-form-inner">
        <label class="chat-attach"><input type="file" name="image" accept="image/*" onchange="showChatFile(this)">📎</label>
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

    function renderMsg(m) {
      const isOwn = m.user_id === currentUserId;
      const isAdmin = m.user_role === 'admin';
      const initial = m.user_name.charAt(0).toUpperCase();
      const time = new Date(m.created_at).toLocaleTimeString('mn-MN',{hour:'2-digit',minute:'2-digit'});
      const content = (m.content||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>');
      return '<div class="chat-msg ' + (isOwn?'own':'') + '" data-id="' + m.id + '">' +
        (!isOwn ? '<div class="chat-avatar ' + (isAdmin?'avatar-admin':'') + '">' + initial + '</div>' : '') +
        '<div class="chat-bubble ' + (isOwn?'own':'') + ' ' + (isAdmin?'admin':'') + '">' +
          (!isOwn ? '<div class="chat-name">' + m.user_name + (isAdmin?' <span class="admin-tag">ADMIN</span>':'') + '</div>' : '') +
          (m.content ? '<div class="chat-text">' + content + '</div>' : '') +
          (m.image ? '<a href="' + m.image + '" target="_blank"><img src="' + m.image + '" class="chat-img"></a>' : '') +
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
