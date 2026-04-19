# 🔒 Өгөгдөл хадгалах тухай — бүрэн заавар

## Railway Volume — ТОГТМОЛ хадгалах

Railway-д **Volume** гэсэн систем бий. Энэ нь код deploy хийгдсэн ч **арилдаггүй** тусдаа хадгалах сан.

Хэрэв та `DATA_DIR=/data` Environment Variable тохируулж, Volume-г `/data`-д mount хийсэн бол:

### ✅ Deploy хийхэд УСТАХГҮЙ:

| Өгөгдөл | Хаана хадгалагдана |
|---|---|
| 📝 Бүх хэрэглэгч (admin, student) | `/data/reelboom.db` |
| 🔑 Нэвтрэх эрхийн кодууд | `/data/reelboom.db` |
| 💬 Бүх чат мессеж (текст) | `/data/reelboom.db` |
| 🖼 Чатны зураг | `/data/uploads/chat/` |
| 🎥 Чатны видео | `/data/uploads/chat/` |
| 💭 Бүх коммент | `/data/reelboom.db` |
| 🖼 Коммент дэх зураг | `/data/uploads/comments/` |
| 👤 Хэрэглэгчийн профайл зураг | `/data/uploads/avatars/` |
| 📚 Хичээлийн гарчиг, тайлбар, видео URL | `/data/reelboom.db` |
| 🖼 Хичээлийн thumbnail зураг | `/data/uploads/` |
| 📁 Бүлгийн нэр, thumbnail | `/data/reelboom.db` + `/data/uploads/` |
| 🎨 Сайтын бүх тохиргоо (hero текст, лого, өнгө, холбоо барих) | `/data/reelboom.db` |
| 🖼 Сайтын лого | `/data/uploads/` |
| 📱 Нэвтэрсэн төхөөрөмжийн мэдээлэл | `/data/reelboom.db` |
| ✅ Хичээлийн прогресс (үзсэн хичээлүүд) | `/data/reelboom.db` |
| 🔔 Мэдэгдэл | `/data/reelboom.db` |
| 🏠 Нүүр хуудасны tool pills | `/data/reelboom.db` + `/data/uploads/` |

### ❌ Deploy хийхэд УСТАНА (код дотор байдаг):

- JavaScript файлууд (`.js`) — энэ нь кодны өөрчлөлт, шинэчлэлт учраас зөв
- CSS файлууд (`.css`)
- HTML template-ууд (код дотор)

> **Нэг өгүүлбэрээр:** "Кодын файлууд шинэчлэгддэг, өгөгдөл, зураг, видео нь хэвээр үлддэг."

---

## 🚀 Эхний удаа тохируулах (хэрэв хараахан хийгээгүй бол)

### 1. Volume үүсгэх

Railway dashboard → **web** service → **Settings** → доош → **Volumes**
- **+ New Volume** (эсвэл `web-volume` байгаа бол тохиргоог шалгах)
- Mount path: `/data`

### 2. Environment Variable нэмэх

**web** service → **Variables** tab → **+ New Variable**:
```
DATA_DIR = /data
```

### 3. Push хийх

```cmd
cd D:\Reel Boom\files\reelboom_project\reelboom
git add .
git commit -m "persistent storage"
git push
```

Railway автомат deploy хийнэ. 3-5 минутын дараа бэлэн.

### 4. Batla

1. `https://reelboom.mn` руу ор
2. Admin-ээр нэвтрэх: `admin@reelboom.mn` / `admin123`
3. Ямар нэг өөрчлөлт хий (сурагч бүртгэх, хичээл засах, зураг upload)
4. Railway dashboard → **web** → **Deployments** → сүүлийн deployment баруун талын `⋮` → **Redeploy**
5. Deploy дууссаны дараа тэдгээр өөрчлөлтүүд **хэвээрээ** байвал амжилттай ✅

---

## ⚠️ ЧУХАЛ: Одоогийн өгөгдөл алга болж болзошгүй

Хэрэв Railway-д өмнө нь өгөгдөл байсан бол (код дотор `reelboom.db` гэж), **энэ шинэ кодыг push хийснээр** тэр өгөгдөл алга болно. Шалтгаан — Volume хоосон эхэлж байгаа учраас.

**Шинээр эхлэх нь зөв шийдэл** — default хичээлүүд, admin, tool pills автомат үүснэ.

---

## 📊 Өгөгдлийн хэмжээ

Railway-ийн **Hobby Plan ($5/сар)**:
- **Volume storage**: 5GB
- 100 сурагч + 1000 коммент + 5000 чат = ~500MB л хангалттай

---

## 🔄 Өөрчлөлт хийх үед

Ямар нэг зүйл засах үед:

```cmd
cd D:\Reel Boom\files\reelboom_project\reelboom
git add .
git commit -m "тайлбар"
git push
```

**Өгөгдөл бүгд үлдэнэ** — зөвхөн код шинэчлэгдэнэ. ✨
