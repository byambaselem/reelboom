# 🚀 Railway.app deployment — Алхам алхмаар

Railway бол хамгийн хялбар онлайн deployment платформ. GitHub-тай холбогдож, push хийхэд автоматаар deploy болдог.

## АЛХАМ 1 — GitHub дээр repo үүсгэх

1. [github.com](https://github.com) → бүртгэлгүй бол **Sign up**
2. Нэвтэрсний дараа баруун дээд буланд **+ → New repository**
3. Name: `reelboom`
4. **Private** сонгоно (код нь нээлттэй байх шаардлагагүй)
5. **Create repository** дарна

## АЛХАМ 2 — Кодоо GitHub дээр upload хийх

### А. GitHub Desktop ашиглах (хамгийн хялбар):

1. [desktop.github.com](https://desktop.github.com) → татаж суулгана
2. GitHub акаунтаараа нэвтэрнэ
3. **File → Clone repository** → `reelboom` repo сонгоно → `C:\reelboom` руу clone хийнэ
4. `D:\Reel Boom\files\reelboom_project\reelboom\` хавтаснаас **бүх файлуудыг** `C:\reelboom` руу хуулна
   - ⚠️ `node_modules` хавтсыг **ҮЛ** хуул, `reelboom.db`, `sessions.db` мөн үл хуул
5. GitHub Desktop-т буцаж орно → өөрчлөлтүүдийг харна
6. **Summary**: "initial commit" гэж бичнэ → **Commit to main** → **Push origin**

### Б. Git CLI ашиглах (дэвшилтэт):

```cmd
cd /d "D:\Reel Boom\files\reelboom_project\reelboom"
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/reelboom.git
git push -u origin main
```

## АЛХАМ 3 — Railway дээр бүртгүүлэх

1. [railway.app](https://railway.app) → **Login**
2. **Login with GitHub** сонгоно
3. GitHub эрх өгнө

**Үнэгүй tier:** Сард 5 доллар credit — жижиг төсөлд хангалттай

## АЛХАМ 4 — Project үүсгэх

1. Dashboard-д **+ New Project**
2. **Deploy from GitHub repo** сонгоно
3. `reelboom` repo сонгоно
4. Railway автоматаар build хийж эхэлнэ ✅

## АЛХАМ 5 — Environment variable нэмэх

**Variables** tab руу орно:

```
PORT=3000
SESSION_SECRET=ReelBoom2024_урт_санамсаргүй_тэмдэгт_энд_бич
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=танийн_gmail@gmail.com
SMTP_PASS=gmail_app_password
ADMIN_EMAIL=танийн_gmail@gmail.com
```

**Gmail App Password:**
1. Gmail → Settings → Security → 2-Step Verification **идэвхжүүлнэ**
2. **App passwords** → **Mail** → **Generate** → 16 тэмдэгт хуулна

## АЛХАМ 6 — Public URL авах

1. **Settings** tab → **Networking**
2. **Generate Domain** дарна
3. Автоматаар `reelboom-production.up.railway.app` шиг URL өгнө

## АЛХАМ 7 — Vimeo domain update

Railway URL авсан тул Vimeo-д шинэ домайн нэмнэ:

1. Vimeo → Settings → Privacy → **Where can this be embedded?**
2. **Add domain** → `reelboom-production.up.railway.app`
3. **Also apply to all existing videos** ✅
4. **Save**

## АЛХАМ 8 — Custom domain (сонголттой)

**reelboom.mn** эсвэл өөр домайнтай болвол:

1. Railway → Settings → Networking → **Custom Domain**
2. Өөрийн домайнаа оруулна
3. Railway CNAME заавар өгнө
4. Domain provider (nic.mn, namecheap г.м.) дээр CNAME record нэмнэ:
   ```
   Type: CNAME
   Name: @ (эсвэл www)
   Value: <Railway-ээс өгсөн утга>
   ```
5. SSL автоматаар гарч ирнэ (10-30 минут)

## АЛХАМ 9 — Админ нэвтрэлт

`https://танай-url/login`
- Email: `admin@reelboom.mn`
- Password: `admin123`

**⚠️ ЗААВАЛ нууц үгийг солих!** (хэрэглэгчдийн хэсэгт шинэ admin эрхтэй хэрэглэгч үүсгээд дараа нь хуучныг устгах)

## 🔄 Өөрчлөлт хийх үед

GitHub-д push хийхэд Railway автоматаар дахин deploy хийнэ.

### GitHub Desktop-ээр:
1. Код өөрчилнө
2. GitHub Desktop-т очно → commit message бичнэ → **Commit** → **Push origin**
3. 1-2 минутын дараа сайт шинэчлэгдэнэ

### Command line:
```cmd
cd "D:\Reel Boom\files\reelboom_project\reelboom"
git add .
git commit -m "update: тайлбар"
git push
```

## ⚠️ Анхаарах зүйлс

**DB persistence:** Railway-д SQLite файл контейнер дахин эхлэхэд устгагдаж болно. Production-д PostgreSQL ашиглах нь зөв (Railway дээр үнэгүй).

Одоогоор туршилтын зориулалтаар SQLite л ажиллана. Жинхэнэ хэрэглээнд гарахдаа PostgreSQL руу шилжүүлэх хэрэгтэй.

**Upload файлууд:** `public/uploads/` хавтсанд орох зураг/файлууд мөн адил контейнер restart-д устна. Production-д **Cloudinary** эсвэл **AWS S3** ашиглах хэрэгтэй.

## 🆘 Асуудал гарвал

**Build fail болж байвал:**
- Railway dashboard → **Deployments** → хамгийн сүүлийн deployment → **View Logs**
- Алдаа мессежийг харж, шийдвэрлэнэ

**Сайт 502 error өгвөл:**
- Logs харах
- PORT env variable зөв байгааг шалгах
- `node server.js` локал дээр туршиж үзэх
