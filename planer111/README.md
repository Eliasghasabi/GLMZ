<div dir="rtl">

# 📚 استادی‌فلو (StudyFlow)

**برنامه‌ریز هوشمند مطالعه — فارسی، راست‌به‌چپ، آمادهٔ استقرار روی Cloudflare**

استادی‌فلو یک وب‌اپلیکیشن تمام‌عیار (full-stack) برای دانش‌آموزان و دانشجویان است: مدیریت درس‌ها و مباحث، برنامهٔ هفتگی و روزانه، سیستم مرور فاصله‌دار خودکار، پومودورو، امتحان‌ها، اهداف، یادداشت‌ها، آمار و استریک — همه با رابط فارسیِ زیبا و پشتیبانی کامل از حالت تیره و نصب به‌صورت PWA.

---

## ✨ امکانات

| بخش | شرح |
|---|---|
| 🏠 **داشبورد** | سلام بر اساس ساعت، تاریخ شمسی، پیشرفت امروز، کارهای امروز، مرورهای امروز، امتحان‌های پیش‌رو، استریک، نمودار ۷ روز |
| 📚 **درس‌ها** | ساخت/ویرایش/حذف/بایگانی درس با آیکون و رنگ؛ کارت‌های پیشرفت با درصد و زمان مطالعه |
| 🗂️ **مباحث** | فصل‌بندی مباحث، وضعیت (شروع نشده / در حال انجام / تکمیل)، دشواری، زمان تخمینی و ثبت‌شده |
| 🔁 **مرور فاصله‌دار** | پس از تکمیل هر مبحث، خودکار مرور در ۱، ۳، ۷، ۱۴ و ۳۰ روز ساخته می‌شود (قابل شخصی‌سازی) |
| 📋 **کارها** | اولویت (کم تا فوری)، تاریخ شمسی، برچسب، فیلتر و مرتب‌سازی |
| 🗓️ **برنامهٔ هفتگی** | بلوک‌های مطالعهٔ تکرارشونده شنبه تا جمعه با قابلیت جابه‌جایی با درگ‌اند‌دراپ |
| ⏱️ **برنامهٔ روزانه** | تایم‌لاین ساعتی، ثبت جلسات مطالعه با محاسبهٔ خودکار مدت |
| 🍅 **پومودورو** | تایمر حلقه‌ای، تمرکز/استراحت/استراحت بلند، شمارش دوره، ذخیرهٔ خودکار جلسات در دیتابیس، ادامهٔ کار هنگام جابه‌جایی بین صفحات |
| 🧪 **امتحان‌ها** | شمارش معکوس روز، محل، مباحث، اسلایدر پیشرفت آمادگی |
| 🎯 **اهداف** | هدف با مقدار، واحد و مهلت؛ دکمه‌های افزایش/کاهش سریع؛ تکمیل خودکار |
| 🗒️ **یادداشت‌ها** | جست‌وجو، سنجاق، برچسب، اتصال به درس، ذخیرهٔ خودکار |
| 📊 **آمار** | زمان امروز/هفته/ماه، استریک و رکورد، نمودار میله‌ای ۷ روز، روند ۳۰ روز، دونات توزیع درس‌ها |
| 🔔 **اعلان‌ها** | تولید خودکار (کار عقب‌افتاده، مرور امروز، امتحان نزدیک) + پشتیبانی اعلان مرورگر |
| 🔍 **جست‌وجوی سراسری** | پالت فرمان با `Ctrl + K` در درس‌ها، مباحث، کارها، یادداشت‌ها و امتحان‌ها |
| 📱 **PWA** | نصب روی موبایل، آیکون، اسپلش، آفلاین شل با Service Worker |
| 🌗 **حالت تیره/روشن/سیستم** | پالت سرمه‌ای–بنفش با شیشه‌ای (glassmorphism) ظریف |
| 🧾 **دادهٔ نمونه** | بارگذاری/حذف یک‌کلیکی دمو کامل (۵ درس نمونه، کارها، امتحان‌ها، مرورها و آمار ۳۰ روزه) |
| 📤 **خروجی داده** | دانلود JSON همهٔ داده‌ها + حذف کامل حساب |

## 🧪 حساب دمو

```
ایمیل:  demo@studyflow.ir
رمز:    demo12345
```

یا در صفحهٔ ورود روی دکمهٔ «حساب آزمایشی دمو» کلیک کنید تا فرم پر شود.
(این حساب با `npm run seed` ساخته می‌شود و از قبل با دادهٔ نمونه پر شده است.)

---

## 🏗 معماری

```
Next.js 16 (App Router, TypeScript)  ←→  REST API (Route Handlers)  ←→  Prisma  ←→  SQLite/D1
        │
        ├── SPA با هش‌روتر (#/dashboard، #/tasks، …) — بدون بارگذاری مجدد صفحه
        ├── TanStack Query برای دادهٔ سمت سرور + Zustand برای موتور پومودورو
        ├── احراز هویت اختصاصی: PBKDF2-SHA256 (۱۰۰k تکرار) + کوکی httpOnly
        └── Tailwind CSS 4 + shadcn/ui + Vazirmatn (فونت فارسیِ self-hosted)
```

**چرا SPA با هش‌روتر؟** کل اپ روی یک route (`/`) اجرا می‌شود؛ این کار استقرار را روی هر میزبان استاتیکی (از جمله Cloudflare) ساده می‌کند، پیمایش را آنی نگه می‌دارد و با آفلاین‌شل PWA سازگار است. لایهٔ API زیر `src/app/api/*` کاملاً مجزا و قابل استفادهٔ مجدد است.

**چرا تاریخ‌ها ISO ذخیره می‌شوند؟** همهٔ تاریخ‌ها به‌صورت `YYYY-MM-DD` میلادی ذخیره و فقط در رابط کاربری به شمسی تبدیل می‌شوند (تبدیل شمسی بدون وابستگی، پیاده‌سازی‌شده در `src/lib/jalali.ts`). کلاینت تاریخِ محلی خود را با پارامتر `?today=` به سرور می‌فرستد تا آمار و مرورها در منطقهٔ زمانی شما دقیق باشد.

### ساختار پوشه‌ها

```
├── migrations/0001_init.sql      # مایگریشن کامل D1 (معادل اسکیمای Prisma)
├── prisma/schema.prisma          # ۱۴ جدول — کاربران، جلسات، تنظیمات، درس‌ها، …
├── public/
│   ├── fonts/                    # Vazirmatn (woff2، self-hosted)
│   ├── icons/                    # آیکون‌های PWA
│   ├── manifest.webmanifest      # مانیفست PWA
│   └── sw.js                     # سرویس‌ورکر (آفلاین شل + کش API)
├── scripts/
│   ├── seed-demo.mjs             # ساخت/بازنشانی حساب دمو
│   └── make_icons.py             # تولیدکنندهٔ آیکون‌های PWA
├── src/
│   ├── app/
│   │   ├── api/                  # بک‌اند REST (auth، subjects، tasks، …)
│   │   ├── layout.tsx            # RTL، فونت، تم، Toaster
│   │   └── page.tsx              # ریشهٔ SPA
│   ├── components/
│   │   ├── app/                  # شل، سایدبار، پالت فرمان، زنگ اعلان‌ها
│   │   ├── charts/               # نمودارهای SVG سبک (بدون کتابخانهٔ سنگین)
│   │   ├── shared/               # حالت خالی، تقویم شمسی، اسکلت‌ها
│   │   ├── ui/                   # shadcn/ui
│   │   └── views/                # ۱۵ صفحهٔ اپلیکیشن
│   ├── hooks/                    # useToast و …
│   └── lib/
│       ├── server/               # هش رمز، نشست‌ها، rate-limit، آمار، اعلان‌ها
│       ├── client/               # AuthProvider، i18n، موتور پومودورو
│       ├── jalali.ts             # تبدیل شمسی (بدون وابستگی)
│       ├── api.ts                # کلاینت fetch با مدیریت خطای فارسی
│       └── router.ts             # هش‌روتر سبک
├── wrangler.jsonc                # پیکربندی Cloudflare Workers + D1
└── .env.example
```

---

## 🚀 راه‌اندازی (توسعهٔ محلی)

### پیش‌نیازها

- **Node.js ≥ 20** (یا Bun ≥ 1.1)
- یک ترمینال :)

### نصب

```bash
# ۱) نصب وابستگی‌ها
npm install

# ۲) تنظیم متغیرهای محیطی
cp .env.example .env        # مسیر DATABASE_URL را در صورت نیاز ویرایش کنید

# ۳) ساخت جداول در SQLite
npx prisma db push

# ۴) (اختیاری) ساخت حساب دمو با دادهٔ نمونه
npm run seed

# ۵) اجرای سرور توسعه
npm run dev
# → http://localhost:3000
```

### اسکریپت‌ها

| دستور | کار |
|---|---|
| `npm run dev` | سرور توسعه |
| `npm run build` | بیلد production |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | بررسی تایپ‌ها |
| `npm run db:push` | اعمال اسکیما روی دیتابیس |
| `npm run seed` | ساخت/بازنشانی حساب دمو (`demo@studyflow.ir / demo12345`) |
| `npm run db:migrate-d1` | اعمال مایگریشن‌ها روی D1 (نیازمند ورود wrangler) |

---

## ☁️ استقرار روی Cloudflare

این پروژه به‌صورت بومی برای Cloudflare طراحی شده: **Workers (از طریق OpenNext) + D1** — بدون VPS، بدون Firebase، بدون MongoDB.

### گام ۱: نصب ابزارها

```bash
npm install -D wrangler @opennextjs/cloudflare
npx wrangler login
```

### گام ۲: ساخت دیتابیس D1

```bash
npx wrangler d1 create studyflow-db
```

خروجی شامل `database_id` است؛ آن را در `wrangler.jsonc` جای `REPLACE_WITH_YOUR_D1_DATABASE_ID` بگذارید.

### گام ۳: اعمال مایگریشن‌ها

```bash
npx wrangler d1 migrations apply studyflow-db --remote
```

فایل `migrations/0001_init.sql` تمام جداول، ایندکس‌ها و کلیدهای خارجی را مطابق اسکیمای Prisma می‌سازد.

### گام ۴: اتصال Prisma به D1 (خودکار — نیازی به تغییر کد نیست)

کلاینت دیتابیس (`src/lib/db.ts`) از قبل هر دو حالت را پوشش می‌دهد:

- **روی Cloudflare Workers:** Prisma با آداپتور رسمی `@prisma/adapter-d1` از طریق بایندینگ `DB` (تعریف‌شده در `wrangler.jsonc`) راه‌اندازی می‌شود — موتور کلاینتی، بدون باینری Rust، سازگار با پلن رایگان.
- **در توسعهٔ محلی:** همان کوئری‌ها روی SQLite (از `DATABASE_URL` در `.env`) اجرا می‌شود.

هیچ سواپ دستی لازم نیست؛ در صورت نیاز، دامنه‌های مجاز CSRF را با `TRUSTED_ORIGINS` در `.env.example` تنظیم کنید.

### گام ۵: بیلد و انتشار

```bash
npx opennextjs-cloudflare build    # خروجی: .open-next/worker.js + assets
npx opennextjs-cloudflare deploy   # یا: npx wrangler deploy
```

پیکربندی آداپتور در `open-next.config.ts` است (حالت حداقلی — بدون KV/R2/Durable Object، مناسب پلن رایگان). حجم ورکر فشرده ≈ ۲.۲MB (زیر سقف ۳MB پلن رایگان).

### متغیرهای محیطی در production

- **Secrets:** `npx wrangler secret put <NAME>` — لازم نیست؛ نشست‌ها با توکن تصادفی ۳۲ بایتی کار می‌کنند که هش‌شده در D1 ذخیره می‌شود.
- **Vars:** در `wrangler.jsonc` بخش `vars`.
- **Rate limiting:** برای محیط multi-isolate، از قواعد WAF یا یک KV namespace (بخش کامنت‌شدهٔ `wrangler.jsonc`) استفاده کنید. محدودساز درون‌حافظه‌ای فعلی برای تک‌نمونه کافی است.

### به‌روزرسانی اپ

```bash
git pull && npm install
npx prisma generate
npx opennextjs-cloudflare build
npx opennextjs-cloudflare deploy
# در صورت تغییر اسکیما: migration جدید به migrations/ اضافه کنید، سپس:
npx wrangler d1 migrations apply studyflow-db --remote
```

---

## 🔐 امنیت

| مورد | پیاده‌سازی |
|---|---|
| **رمز عبور** | هرگز به‌صورت متن ساده ذخیره نمی‌شود — PBKDF2-SHA256 با ۱۰۰٬۰۰۰ تکرار و نمک تصادفی ۱۶ بایتی |
| **نشست‌ها** | توکن تصادفی ۳۲ بایتی در کوکی `httpOnly` + `sameSite=lax` + `secure` (در production)؛ در دیتابیس فقط SHA-256 توکن ذخیره می‌شود؛ تمدید لغزان ۳۰ روزه |
| **ایزوله بودن داده‌ها** | هر کوئری با `userId` نشست فیلتر می‌شود؛ هیچ کاربری به دادهٔ کاربر دیگر دسترسی ندارد (تست‌شده) |
| **CSRF** | بررسی `Origin` نسبت به `Host`/`X-Forwarded-Host` (سازگار با پروکسی) + هدر سفارشی `X-Requested-With: StudyFlow` که سایت‌های خارجی نمی‌توانند تنظیم کنند (بدون CORS preflight) + `sameSite` کوکی |
| **SQL Injection** | کوئری‌های پارامتری Prisma |
| **XSS** | React به‌صورت پیش‌فرض escape می‌کند؛ هیچ `dangerouslySetInnerHTML` در پروژه نیست |
| **اعتبارسنجی ورودی** | Zod روی همهٔ بدنه‌ها و کوئری‌ها با پیام‌های خطای فارسی |
| **Rate limiting** | ورود/ثبت‌نام: ۱۰ درخواست در ۵ دقیقه؛ API عمومی: سقف هر دقیقه |
| **حذف حساب** | حذف کامل و آبشاری همهٔ داده‌ها + ابطال نشست‌ها |

## ⚡ کارایی

- **Code-splitting:** هر صفحه با `next/dynamic` جداگانه باندل می‌شود
- **نمودارها:** SVG دست‌ساز (بدون recharts و …) — چند کیلوبایت به‌جای صدها
- **فونت:** Vazirmatn با `font-display: swap` و self-hosting
- **کش:** سرویس‌ورکر با استراتژی cache-first برای استاتیک و network-first برای API
- **دیتابیس:** ایندکس‌گذاری روی همهٔ کوئری‌های پرتکرار (`userId + date`, `userId + status`, …)؛ داشبورد با یک درخواست تجمیعی

## ♿ دسترس‌پذیری

- ناوبری کامل با کیبورد + `Ctrl+K` برای پالت فرمان
- `aria-label` فارسی روی همهٔ دکمه‌های آیکونی
- حالت‌های `focus-visible` واضح
- پشتیبانی از `prefers-reduced-motion`
- ساختار سمانتیک (`main`, `nav`, `header`، `aria-current`)

## 🌐 چندزبانه

فارسی زبان پیش‌فرض است. معماری i18n در `src/lib/client/i18n.tsx` آماده است: دیکشنری‌ها fa/en، سوییچ `dir`/`lang`، و `t()` برای متن‌های شل. برای افزودن زبان جدید کافی است دیکشنری را کامل کنید و گزینهٔ زبان را در تنظیمات فعال نمایید.

## 📄 مجوز

MIT — ساخته‌شده با ❤️ برای دانش‌آموزان ایران.

</div>

---

<div dir="ltr">

# 📚 StudyFlow (English summary)

**A production-ready Persian (RTL) study planner, Cloudflare-native.**

Full-stack app: subjects & topics, spaced-repetition reviews (1/3/7/14/30 days), weekly & daily planner, Pomodoro with auto-logged sessions, exams with countdowns, goals, notes, statistics & streaks, global search (Ctrl+K), notifications, PWA with offline shell — all behind real authentication (PBKDF2-SHA256 + httpOnly session cookies).

- **Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · shadcn/ui · TanStack Query · Zustand · Prisma (SQLite dev / D1 prod) · Vazirmatn font
- **SPA hash-routing** (`#/dashboard`, `#/tasks`, …) → deploys anywhere, perfect for PWA offline
- **Auth:** register / login / logout / change password / delete account, sessions stored as SHA-256 hashes, sliding 30-day expiry, per-user data isolation enforced on every query
- **Demo account:** `demo@studyflow.ir` / `demo12345` (via `npm run seed`)
- **Local dev:** `npm install` → `cp .env.example .env` → `npx prisma db push` → `npm run seed` → `npm run dev`
- **Deploy (Cloudflare):** `npx wrangler d1 create studyflow-db` → set `database_id` in `wrangler.jsonc` → `npx wrangler d1 migrations apply studyflow-db --remote` → `npx opennextjs-cloudflare build && npx opennextjs-cloudflare deploy` (the D1 Prisma adapter is wired automatically in `src/lib/db.ts`)
- **Migrations:** `migrations/0001_init.sql` mirrors `prisma/schema.prisma` exactly (14 tables, FKs, indexes)
- **Export:** full JSON export of every record; account deletion cascades all data
- **License:** MIT

See the Persian section above for the complete documentation, folder structure, and security/performance details.

</div>
