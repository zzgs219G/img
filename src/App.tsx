import { ImageIcon, Sparkles } from 'lucide-react'

import { Uploader } from '@/components/Uploader'
import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'

function ThemeToggle() {
  const [dark, setDark] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('theme') === 'dark'
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="切换深色模式"
      onClick={() => setDark((d) => !d)}
    >
      {dark ? '☀️' : '🌙'}
    </Button>
  )
}

function App() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      {/* 背景装饰：品牌色光晕 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <div className="absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute right-[10%] bottom-[-8rem] h-72 w-72 rounded-full bg-primary/8 blur-3xl" />
      </div>

      <header className="container mx-auto flex w-full items-center justify-between px-4 py-5">
        <div className="flex items-center gap-2 font-semibold">
          <span className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg">
            <ImageIcon className="size-4.5" />
          </span>
          img 图床
        </div>
        <ThemeToggle />
      </header>

      <main className="container mx-auto flex w-full flex-1 flex-col items-center justify-center gap-6 px-4 pb-10">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            快速、干净地分享图片
          </h1>
          <p className="text-muted-foreground mt-2 flex items-center justify-center gap-1.5 text-sm">
            <Sparkles className="text-primary size-4" />
            浏览器本地压缩后直传对象存储，不占仓库体积
          </p>
        </div>
        <Uploader />
      </main>

      <footer className="container mx-auto w-full pb-6 text-center text-xs text-muted-foreground/70">
        支持 jpg / png / webp / gif / bmp / avif · 最大 10MB · 输出统一 webp（GIF 除外）
      </footer>
    </div>
  )
}

export default App
