"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { BookOpen, Loader2, LockKeyhole, Mail, UserRound, ArrowLeft, Sparkles } from "lucide-react"
import { useAuth } from "@/lib/client/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { ApiClientError } from "@/lib/api"
import { ThemeToggle } from "@/components/app/theme-toggle"

export function AuthScreen({ initialMode }: { initialMode: "login" | "register" }) {
  const [mode, setMode] = useState<"login" | "register">(initialMode)

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>
      <div className="flex-1 flex items-center justify-center px-4 pb-10">
        <div className="w-full max-w-5xl grid lg:grid-cols-2 gap-10 items-center">
          {/* Brand panel */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="hidden lg:flex flex-col gap-6"
          >
            <div className="flex items-center gap-3">
              <span className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center shadow-lift">
                <BookOpen className="w-6 h-6 text-white" aria-hidden />
              </span>
              <div>
                <div className="text-2xl font-extrabold text-gradient">استادی‌فلو</div>
                <div className="text-xs text-muted-foreground">StudyFlow</div>
              </div>
            </div>
            <h2 className="text-3xl font-extrabold leading-relaxed">
              برنامه‌ریزی مطالعه،
              <br />
              <span className="text-gradient">ساده و هوشمند.</span>
            </h2>
            <p className="text-muted-foreground leading-7 max-w-md">
              درس‌ها و مباحثت را بساز، برنامهٔ هفتگی بچین، با سیستم مرور فاصله‌دار یادگیری‌ات را ماندگار کن
              و پیشرفتت را با آمار دقیق ببین — همه در یک جای زیبا و سریع.
            </p>
            <ul className="space-y-3 text-sm">
              {["مرور فاصله‌دار خودکار (۱، ۳، ۷، ۱۴ و ۳۰ روز)", "پومودورو با ثبت خودکار زمان مطالعه", "شمارش روزهای پیاپی (استریک) و اهداف هفتگی"].map((f) => (
                <li key={f} className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Sparkles className="w-3.5 h-3.5" aria-hidden />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Form card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="glass rounded-3xl shadow-soft p-6 sm:p-8 w-full max-w-md mx-auto"
          >
            <div className="lg:hidden flex items-center justify-center gap-2 mb-6">
              <span className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-lift">
                <BookOpen className="w-5 h-5 text-white" aria-hidden />
              </span>
              <span className="text-xl font-extrabold text-gradient">استادی‌فلو</span>
            </div>

            {mode === "login" ? (
              <LoginForm onSwitch={() => setMode("register")} />
            ) : (
              <RegisterForm onSwitch={() => setMode("login")} />
            )}
          </motion.div>
        </div>
      </div>
    </div>
  )
}

function LoginForm({ onSwitch }: { onSwitch: () => void }) {
  const { login } = useAuth()
  const { toast } = useToast()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await login(email, password)
      toast({ title: "خوش آمدید! 👋" })
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "ورود ناموفق بود.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate={false}>
      <div>
        <h1 className="text-xl font-extrabold">ورود به حساب</h1>
        <p className="text-sm text-muted-foreground mt-1">ادامهٔ مسیر مطالعه‌ات همین‌جاست.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">ایمیل</Label>
        <div className="relative">
          <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden />
          <Input
            id="email"
            type="email"
            dir="ltr"
            className="pr-9 text-left h-11"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">رمز عبور</Label>
        <div className="relative">
          <LockKeyhole className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden />
          <Input
            id="password"
            type="password"
            dir="ltr"
            className="pr-9 text-left h-11"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading} className="w-full h-11 gradient-primary text-white border-0 rounded-xl shadow-lift hover:opacity-90">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : "ورود"}
      </Button>

      {/* Demo account */}
      <button
        type="button"
        onClick={() => {
          setEmail("demo@studyflow.ir")
          setPassword("demo12345")
        }}
        className="w-full text-xs text-muted-foreground hover:text-primary transition-colors bg-muted/60 hover:bg-primary/5 border border-dashed rounded-xl px-3 py-2.5"
      >
        حساب آزمایشی دمو: <b dir="ltr" className="inline-block">demo@studyflow.ir / demo12345</b> — کلیک کن تا پر شود
      </button>

      <p className="text-sm text-center text-muted-foreground">
        حساب نداری؟{" "}
        <button type="button" onClick={onSwitch} className="text-primary font-semibold hover:underline">
          بساز
        </button>
      </p>
    </form>
  )
}

function RegisterForm({ onSwitch }: { onSwitch: () => void }) {
  const { register } = useAuth()
  const { toast } = useToast()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    if (name.trim().length < 2) return setError("نام باید حداقل ۲ کاراکتر باشد.")
    if (password.length < 8) return setError("رمز عبور باید حداقل ۸ کاراکتر باشد.")
    setLoading(true)
    try {
      await register(name.trim(), email.trim(), password)
      toast({ title: "حسابت ساخته شد! خوش اومدی 🎉" })
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "ثبت‌نام ناموفق بود.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold">ساخت حساب جدید</h1>
        <p className="text-sm text-muted-foreground mt-1">چند ثانیه طول می‌کشد.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="name">نام</Label>
        <div className="relative">
          <UserRound className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden />
          <Input
            id="name"
            className="pr-9 h-11"
            placeholder="مثلاً الیاس"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
            minLength={2}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="remail">ایمیل</Label>
        <div className="relative">
          <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden />
          <Input
            id="remail"
            type="email"
            dir="ltr"
            className="pr-9 text-left h-11"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rpassword">رمز عبور</Label>
        <div className="relative">
          <LockKeyhole className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden />
          <Input
            id="rpassword"
            type="password"
            dir="ltr"
            className="pr-9 text-left h-11"
            placeholder="حداقل ۸ کاراکتر"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading} className="w-full h-11 gradient-primary text-white border-0 rounded-xl shadow-lift hover:opacity-90">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : (
          <>ساخت حساب <ArrowLeft className="w-4 h-4" aria-hidden /></>
        )}
      </Button>

      <p className="text-sm text-center text-muted-foreground">
        قبلاً ثبت‌نام کردی؟{" "}
        <button type="button" onClick={onSwitch} className="text-primary font-semibold hover:underline">
          وارد شو
        </button>
      </p>
    </form>
  )
}
