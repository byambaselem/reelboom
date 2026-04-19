const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'reelboom.db'));

db.exec(`
  PRAGMA journal_mode=WAL;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'student',
    access_code TEXT,
    avatar TEXT,
    is_verified INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS access_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    used INTEGER DEFAULT 0,
    used_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    color TEXT DEFAULT 'purple',
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    lesson_num INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    video_url TEXT,
    video_type TEXT DEFAULT 'youtube',
    thumbnail TEXT,
    duration TEXT,
    is_free INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lesson_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    image TEXT,
    parent_id INTEGER,
    is_approved INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lesson_id) REFERENCES lessons(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    lesson_id INTEGER NOT NULL,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, lesson_id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    related_id INTEGER,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    target_id INTEGER,
    content TEXT NOT NULL,
    image TEXT,
    video TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS homepage_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    subtitle TEXT,
    icon TEXT,
    lesson_range TEXT,
    thumbnail TEXT,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    session_id TEXT UNIQUE NOT NULL,
    device_info TEXT,
    ip TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

const migrations = [
  'ALTER TABLE lessons ADD COLUMN thumbnail TEXT',
  'ALTER TABLE comments ADD COLUMN image TEXT',
  'ALTER TABLE comments ADD COLUMN parent_id INTEGER',
  'ALTER TABLE users ADD COLUMN avatar TEXT',
  'ALTER TABLE chat_messages ADD COLUMN target_id INTEGER',
  'ALTER TABLE chat_messages ADD COLUMN video TEXT',
  'ALTER TABLE chat_messages ADD COLUMN is_read INTEGER DEFAULT 0',
];
migrations.forEach(sql => { try { db.exec(sql); } catch(e) {} });

const cats = db.prepare('SELECT COUNT(*) as c FROM categories').get();
if (cats.c === 0) {
  const insertCat = db.prepare('INSERT INTO categories (title, slug, color, sort_order) VALUES (?,?,?,?)');
  [
    ['Бичлэг техник', 'bichleg', 'blue', 1],
    ['Гэрэлтүүлэг', 'gerel', 'amber', 2],
    ['Авиа ба хөгжим', 'avia', 'green', 3],
    ['Монтаж засвар', 'montaj', 'teal', 4],
    ['AI засвар', 'ai', 'purple', 5],
    ['Агуулга стратеги', 'strategi', 'pink', 6],
    ['Брэнд ба өсөлт', 'brand', 'rose', 7],
    ['Бизнес ба монетизаци', 'biznes', 'indigo', 8],
  ].forEach(r => insertCat.run(...r));
}

const lcount = db.prepare('SELECT COUNT(*) as c FROM lessons').get();
if (lcount.c === 0) {
  const insertLesson = db.prepare(
    'INSERT INTO lessons (category_id, lesson_num, title, description, video_url, duration, is_free, sort_order) VALUES (?,?,?,?,?,?,?,?)'
  );
  [
    [1,1,'iPhone камерын тохиргоо','Resolution, FPS, format, Grid, Level, AE/AF Lock.','','15 мин',1,1],
    [1,2,'Босоо бичлэгийн техник','9:16 зохион байгуулалт, Rule of thirds.','','18 мин',0,2],
    [1,3,'Хөдөлгөөнт камер','Walk-and-talk, orbit shot, pull back reveal.','','20 мин',0,3],
    [1,4,'Cinematic ба Slow-mo','Cinematic mode rack focus, 120/240fps.','','22 мин',0,4],
    [2,5,'Байгалийн гэрэл','Цонхны гэрэл, golden hour.','','18 мин',0,1],
    [2,6,'Ring light ба студи гэрэл','Ring light байрлуулалт, two-point lighting.','','25 мин',0,2],
    [2,7,'Гэрлийн тохиргоо iPhone-д','AE lock, exposure slider, True Tone.','','15 мин',0,3],
    [3,8,'iPhone mic тохиргоо','Орчны чимээ, lapel mic, Wind noise.','','20 мин',0,1],
    [3,9,'Trending хөгжим сонгох','CapCut хөгжмийн сан, Instagram audio.','','18 мин',0,2],
    [3,10,'Beat тааруулах засвар','CapCut Beat Sync.','','22 мин',0,3],
    [3,11,'Voiceover ба AI дуу','CapCut AI Voice Clone.','','20 мин',0,4],
    [4,12,'CapCut — бүтэн ажлын урсгал','Import → тайрах → export.','','35 мин',0,1],
    [4,13,'Transition техник','Match cut, smash cut, whip pan.','','28 мин',0,2],
    [4,14,'Өнгийн засвар','CapCut LUT, HSL тохиргоо.','','25 мин',0,3],
    [4,15,'Текст ба caption','CapCut Auto-caption, animated text.','','22 мин',0,4],
    [4,16,'Advanced засвар','Keyframe, masking, speed ramp.','','40 мин',0,5],
    [5,17,'AI дүр ба нүүр солих','CapCut AI Face Swap.','','25 мин',0,1],
    [5,18,'AI орчин солих','CapCut AI Background Remover.','','22 мин',0,2],
    [5,19,'Freepik AI зураг үүсгэх','Pikaso AI prompt бичих.','','30 мин',0,3],
    [5,20,'Freepik AI видео хэрэглэл','AI motion background.','','28 мин',0,4],
    [5,21,'Гартаа зүйл барих эффект','Green screen + chroma key.','','35 мин',0,5],
    [5,22,'AI бүрэн workflow','End-to-end дасгал.','','45 мин',0,6],
    [6,23,'Hook бичих арга','Асуулт, гайхшрал, амлалт.','','25 мин',0,1],
    [6,24,'Рийлийн бүтэц загвар','Hook → Value → CTA.','','28 мин',0,2],
    [6,25,'Өгүүллэгтэй рийл','Narrative arc.','','30 мин',0,3],
    [6,26,'Агуулгын хуваарь','Batch shooting.','','25 мин',0,4],
    [6,27,'Платформ бүрийн онцлог','IG, TikTok, YT Shorts.','','22 мин',0,5],
    [7,28,'Брэндийн дүр төрх','Өнгөний палитр, фонт.','','28 мин',0,1],
    [7,29,'Аналитик уншилт','Instagram Insights.','','30 мин',0,2],
    [7,30,'Вирал механизм','Trending topic, алгоритм.','','25 мин',0,3],
    [8,31,'Брэнд хамтын ажиллагаа','Санал бэлтгэх, үнэ тогтоох.','','30 мин',0,1],
    [8,32,'Контент стратегист болох','Portfolio, клиент олох.','','35 мин',0,2],
  ].forEach(l => insertLesson.run(...l));
}

const hcCount = db.prepare('SELECT COUNT(*) as c FROM homepage_categories').get();
if (hcCount.c === 0) {
  const insertHC = db.prepare('INSERT INTO homepage_categories (title, subtitle, icon, lesson_range, sort_order) VALUES (?,?,?,?,?)');
  [
    ['iPhone бичлэг', 'Камерын тохиргоо, cinematic техник', '📱', '1–4 хичээл', 1],
    ['CapCut засвар', 'Монтаж, transition, AI засвар', '✂️', '12–22 хичээл', 2],
    ['Freepik AI', 'Зураг үүсгэх, орчин солих', '🎨', '19–20 хичээл', 3],
    ['Стратеги & өсөлт', 'Алгоритм, брэнд, монетизаци', '📈', '23–32 хичээл', 4],
  ].forEach(r => insertHC.run(...r));
}

const bcrypt = require('bcryptjs');
const adminExists = db.prepare("SELECT id FROM users WHERE email='admin@reelboom.mn'").get();
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare("INSERT INTO users (name,email,password,role,is_verified) VALUES (?,?,?,?,?)").run('Admin','admin@reelboom.mn',hash,'admin',1);
}

const defaultSettings = {
  'hero_title': 'Reel бичлэгийн мэргэжлийн сургалт',
  'hero_line1': 'Reel бичлэгийн',
  'hero_line2': 'мэргэжлийн',
  'hero_line3': 'сургалт',
  'hero_line1_mode': 'white',
  'hero_line2_mode': 'gradient',
  'hero_line3_mode': 'white',
  'hero_subtitle': 'iPhone бичлэгээс эхлэн CapCut монтаж, Freepik AI, агуулгын стратеги хүртэл.',
  'hero_badge': 'Монгол хэлний reel сургалт',
  'cta_title': 'Өнөөдөр эхлэцгээе',
  'cta_subtitle': '32 хичээл · 8 блок · ~32 цаг · бүх түвшинд',
  'stat_lessons': '32', 'stat_blocks': '8', 'stat_hours': '~32ц', 'stat_access': '∞',
  'logo_size': '48',
  'grad_from': '#8b5cf6', 'grad_to': '#10b981',
  'text_color_mode': 'gradient',
  'contact_phone': '+976 99112233',
  'contact_email': 'info@reelboom.mn',
  'contact_facebook': 'https://facebook.com/reelboom',
  'contact_instagram': 'https://instagram.com/reelboom',
  'contact_address': 'Улаанбаатар хот, Монгол улс',
  'contact_title': 'Бидэнтэй холбогдох',
  'contact_subtitle': 'Асуулт, санал хүсэлт байвал манай багтай холбогдоно уу',
};
const insertSetting = db.prepare('INSERT OR IGNORE INTO site_settings (key, value) VALUES (?,?)');
Object.entries(defaultSettings).forEach(([k,v]) => insertSetting.run(k, v));

module.exports = db;
