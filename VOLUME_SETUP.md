# 🔴 CHУГА! Railway Volume тохируулах — DB алга болгохгүй байхын тулд

## АСУУДАЛ

Railway шинэ deploy хийх бүрт кодыг дахин build хийдэг. SQLite DB (`reelboom.db`) болон upload хийсэн зураг, видеонууд (`uploads/`) **код дотор хадгалагдсан** тул шинэ deploy болох бүрт **УСТДАГ**.

## ШИЙДЭЛ — Volume ашиглах

Railway-ийн Volume бол код-оос **тусдаа тогтвортой** хадгалах сан. Бид DB болон uploads-г тэнд хадгална.

---

## АЛХАМ 1 — Volume үүсгэх/шалгах

1. Railway dashboard → **web** service дээр дар
2. **Settings** tab → доош scroll хийгээд **Volumes** хэсэг
3. Volume аль хэдийн байвал **Mount Path**-г тэмдэглэж ав (ж.нь `/data`)
4. Байхгүй бол **+ New Volume** → Mount path: `/data`

## АЛХАМ 2 — Environment Variable нэмэх

1. **web** service → **Variables** tab
2. **+ New Variable** дар
3. Нэмэх:
   ```
   DATA_DIR = /data
   ```
4. **Add** дар

> Жич: Хэрэв Volume mount path-аа өөрөөр нэрлэсэн бол (`/mnt/data` г.м.) `DATA_DIR`-г адилхан нэрлэнэ.

## АЛХАМ 3 — Код push хийх

Энэ шинэ кодонд DB, sessions, uploads бүгд `DATA_DIR` ашиглах болсон:
- `DATA_DIR/reelboom.db`
- `DATA_DIR/sessions.db`
- `DATA_DIR/uploads/` — зураг, видео

GitHub-д push хийнэ:
```cmd
cd D:\Reel Boom\files\reelboom_project\reelboom
git add .
git commit -m "use volume for data persistence"
git push
```

Railway автомат deploy болно. Үүнээс хойш **deploy хийхэд өгөгдөл устахгүй**! 🎉

---

## ⚠️ Одоо байгаа өгөгдлөө АВАХ

Хэрэв одоогийн Railway дээр чухал өгөгдөл (хэрэглэгч, чат, хичээл) байгаа бол **энэ шинэ кодыг push хийхээс өмнө download хийж аваарай** — эс тэгвээс устана.

### Санал болгох:
1. Railway-д deploy-ийг түр **зогсоо** (service settings → pause)
2. Хэрэв одоогийн өгөгдөл шаардлагагүй бол шууд push хий — ерөнхийдөө хэрэглэгчийн код, сурагчид дахин бүртгүүлэх хэрэгтэй болно
3. Хэрэв өгөгдөл хадгалах гэж байгаа бол Railway-ийн CLI-ээр SSH хийж файл хуулах (нэлээд хэцүү, ихэвчлэн дахин бүртгүүлэхэд л хялбар)

---

## ✅ БАТЛАХ

Deploy дууссаны дараа:
1. Сайтад шинэ админ үүсгэ (эсвэл default `admin@reelboom.mn` / `admin123`)
2. Хичээл, сурагч нэмэх
3. Railway dashboard-оос **Redeploy** товч дарж шалга
4. Deploy дууссаны дараа мэдээлэл **хэвээр** байвал амжилттай! 🎉

---

## 📊 Хэр их хадгалалт байна?

Railway-ийн үнэгүй tier:
- **Volume** — 1GB үнэгүй (хангалттай)
- Хэрэв илүү шаардлагатай бол $0.25/GB/сар

Жижиг сургалтын сайтад 1GB нь **маш их**. Жишээ нь:
- 100 сурагч
- 500 коммент (зурагтай)
- 1000 чат мессеж
- 32 хичээлийн thumbnail
- Нийт ~200MB ашиглана
