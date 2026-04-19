# 🚀 ReeL BOOM — Deployment заавар

## Файлын бүтэц
```
reelboom/
├── server.js          # Гол сервер
├── db.js              # Мэдээллийн сан
├── package.json
├── .env               # Тохиргоо (солих!)
├── middleware/
│   ├── auth.js        # Нэвтрэлт шалгах
│   └── mailer.js      # Email мэдэгдэл
├── routes/
│   ├── auth.js        # Нэвтрэх/бүртгэх
│   ├── lessons.js     # Хичээлүүд
│   └── admin.js       # Админ панель
└── public/
    └── css/main.css   # Загвар
```

## 1️⃣ Алхам — Орчин суулгах (VPS дээр)

```bash
# Node.js суулгах (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Файлуудаа upload хийх (SFTP эсвэл git)
# /var/www/reelboom руу хуулна

cd /var/www/reelboom
npm install
```

## 2️⃣ Алхам — .env тохируулах

```bash
cp .env .env.backup
nano .env
```

Доорх зүйлсийг **заавал** өөрчлөх:
```
SESSION_SECRET=энд_урт_санамсаргүй_тэмдэгт_бичнэ_2024xyz
SMTP_USER=таны_gmail@gmail.com
SMTP_PASS=gmail_app_password_энд  
ADMIN_EMAIL=admin@reelboom.mn
SITE_URL=https://reelboom.mn
```

**Gmail App Password авах:**
1. Gmail → Settings → Security → 2-Step Verification идэвхжүүлэх
2. App passwords → Generate → хуулах

## 3️⃣ Алхам — Туршиж ажиллуулах

```bash
node server.js
# http://localhost:3000 дээр нээнэ
# Admin: admin@reelboom.mn / admin123
```

## 4️⃣ Алхам — PM2 суулгаж, байнга ажиллуулах

```bash
npm install -g pm2

pm2 start server.js --name reelboom
pm2 save
pm2 startup   # <-- гарах командыг ажиллуулна

# Харах
pm2 status
pm2 logs reelboom
```

## 5️⃣ Алхам — Nginx тохируулах (domain + HTTPS)

```bash
sudo apt install nginx certbot python3-certbot-nginx -y

# /etc/nginx/sites-available/reelboom
sudo nano /etc/nginx/sites-available/reelboom
```

Дараах агуулгыг оруулах:
```nginx
server {
    listen 80;
    server_name reelboom.mn www.reelboom.mn;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/reelboom /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# HTTPS (SSL) certificate
sudo certbot --nginx -d reelboom.mn -d www.reelboom.mn
```

## 6️⃣ Алхам — Admin панелд нэвтрэн кодууд үүсгэх

1. `https://reelboom.mn/login` → `admin@reelboom.mn` / `admin123`
2. **⚠️ Эхлээд нууц үгийг солих:** Admin → Кодууд руу орно
3. `/admin/codes` → **"Код үүсгэх"** товч → тоо оруулна (жишээ: 20)
4. Гарсан кодуудыг сурагчдад илгээнэ (жишээ: `REEL-7K3M`)

## 7️⃣ Алхам — Видео URL-ийг солих

Одоогоор placeholder YouTube URL байна. Жинхэнэ видеогоо:
1. `/admin/lessons` → хичээл дээр **"Засах"** 
2. **YouTube embed URL** оруулах формат:
   ```
   https://www.youtube.com/embed/VIDEO_ID
   ```
   Жишээ: `https://youtu.be/abc123` → `https://www.youtube.com/embed/abc123`

## 🔐 Аюулгүй байдал

- Admin нууц үгийг заавал солих (`/admin/users` → admin хэрэглэгч)
- `.env` файлыг git-д commit хийхгүй байх (`.gitignore`-д нэмэх)
- Server firewall: зөвхөн 80, 443, 22 портуудыг нээх

```bash
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## 📊 Хяналт

```bash
pm2 monit          # CPU/RAM харах
pm2 logs reelboom  # Log харах
```

## 🆘 Асуудал гарвал

```bash
# Port ашиглагдаж байвал
sudo lsof -i :3000
sudo kill -9 <PID>

# Log харах
pm2 logs reelboom --lines 50

# DB reset (бүх датаг устгана!)
rm reelboom.db sessions.db && node server.js
```
