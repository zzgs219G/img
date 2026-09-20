import { useCallback, useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { compressImage, formatBytes, isAllowedImage, MAX_SIZE } from '@/lib/compress'
import { generateFilename } from '@/lib/filename'
import { DropZone } from '@/components/DropZone'
import { Preview } from '@/components/Preview'
import { ResultCard } from '@/components/ResultCard'

interface UploadResult {
  ok: boolean
  url?: string
  name?: string
  size?: number
  error?: string
}

type ImgType = 'img' | 'icon'

/** 上传阶段：transfer = 图片传到 Worker，push = 服务端 git push 仓库 */
type UploadStage = 'transfer' | 'push'

export function Uploader() {
  const [type, setType] = useState<ImgType>('img')
  const [file, setFile] = useState<File | null>(null)
  const [originalUrl, setOriginalUrl] = useState<string>('')
  const [originalSize, setOriginalSize] = useState(0)
  // compressed 只存 blob 和 ext：文件名在上传时按当前 type 现算，
  // 这样选图后切换"普通图片 / APP 图标"，上传目录会跟着变
  const [compressed, setCompressed] = useState<{ blob: Blob; ext: string } | null>(null)
  const [compressedUrl, setCompressedUrl] = useState<string>('')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState<UploadStage>('transfer')
  const [result, setResult] = useState<UploadResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // 服务端 push 期间“缓慢爬行”进度条的定时器句柄
  const crawlRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /** 停止爬行（幂等） */
  const stopCrawl = useCallback(() => {
    if (crawlRef.current) {
      clearInterval(crawlRef.current)
      crawlRef.current = null
    }
  }, [])

  /**
   * 从 from 每秒缓慢爬 1%，封顶到 cap。
   * 服务端 git push 耗时无法精确测知，用“在动但变慢”如实表达“还在工作”。
   */
  const crawl = useCallback((from: number, cap: number) => {
    stopCrawl()
    let cur = from
    crawlRef.current = setInterval(() => {
      if (cur < cap) {
        cur += 1
        setProgress(cur)
      } else {
        stopCrawl()
      }
    }, 1000)
  }, [stopCrawl])

  // 组件卸载时清掉定时器，避免内存泄漏和对已卸载组件 setState
  useEffect(() => stopCrawl, [stopCrawl])

  const handleSelect = useCallback(
    async (f: File) => {
      setError('')
      setResult(null)
      setCompressed(null)
      // 上一次压缩产物还没 revoke 就换图，先释放
      if (compressedUrl) {
        URL.revokeObjectURL(compressedUrl)
        setCompressedUrl('')
      }
      if (!isAllowedImage(f)) {
        setError('不支持的格式，允许：jpg / png / webp / gif / bmp / avif')
        return
      }
      if (f.size > MAX_SIZE) {
        setError(`文件过大（${formatBytes(f.size)}），上限 10MB`)
        return
      }
      setFile(f)
      setOriginalUrl(URL.createObjectURL(f))
      setOriginalSize(f.size)
      try {
        const r = await compressImage(f)
        setCompressed({ blob: r.blob, ext: r.ext })
        setCompressedUrl(URL.createObjectURL(r.blob))
      } catch (e) {
        setError(e instanceof Error ? e.message : '压缩失败')
      }
    },
    [compressedUrl]
  )

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault()
      const f = e.dataTransfer.files[0]
      if (f) void handleSelect(f)
    },
    [handleSelect]
  )

  const handleUpload = useCallback(async () => {
    if (!compressed) return
    setUploading(true)
    setStage('transfer')
    setProgress(5)
    setError('')
    setResult(null)
    try {
      // 上传时才生成文件名，确保用的是当前 type（切换后目录跟着变）
      const name = generateFilename(compressed.ext, type)
      const fd = new FormData()
      fd.append('file', compressed.blob, name)

      // 用 XHR 而不是 fetch：只有 XHR 能拿到“浏览器→Worker”这段的真实字节进度。
      // 拿到响应后服务端还在做 git push 的收尾已不存在——push 完才返回响应，
      // 所以 100% 出现即代表 push 已落库。
      const data = await new Promise<UploadResult>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/upload')
        xhr.responseType = 'json'
        // 上传段真实进度：映射到 5% → 80%。图片传完只代表到达 Worker，
        // 剩下的 80% → 99% 留给服务端 git push，那段无法精确测知。
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setStage('push')
            setProgress(5 + (e.loaded / e.total) * 75)
          }
        }
        xhr.upload.onload = () => {
          // 字节传完 ≠ 完成，服务端在 push 仓库；进度条转入缓慢爬行
          setStage('push')
          setProgress(80)
          crawl(80, 95)
        }
        xhr.onload = () => {
          stopCrawl()
          setProgress(100)
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.response as UploadResult)
          } else {
            resolve({
              ok: false,
              error:
                (xhr.response as UploadResult | null)?.error ||
                `上传失败（HTTP ${xhr.status}）`,
            })
          }
        }
        xhr.onerror = () => {
          stopCrawl()
          reject(new Error('网络错误，上传失败'))
        }
        xhr.ontimeout = () => {
          stopCrawl()
          reject(new Error('上传超时，请重试'))
        }
        xhr.timeout = 120_000
        xhr.send(fd)
      })

      if (!data.ok) {
        setError(data.error || '上传失败')
      } else {
        setResult(data)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '网络错误，上传失败')
    } finally {
      stopCrawl()
      setUploading(false)
    }
  }, [compressed, type, crawl, stopCrawl])

  const reset = useCallback(() => {
    if (originalUrl) URL.revokeObjectURL(originalUrl)
    if (compressedUrl) URL.revokeObjectURL(compressedUrl)
    setFile(null)
    setOriginalUrl('')
    setCompressed(null)
    setCompressedUrl('')
    setResult(null)
    setError('')
    setProgress(0)
    if (inputRef.current) inputRef.current.value = ''
  }, [originalUrl, compressedUrl])

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>图片上传</CardTitle>
        <CardDescription>
          拖拽或点击选择图片，浏览器本地压缩后上传（GIF 保持原样）
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex gap-2">
          <Button
            variant={type === 'img' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setType('img')}
            disabled={uploading}
          >
            普通图片
          </Button>
          <Button
            variant={type === 'icon' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setType('icon')}
            disabled={uploading}
          >
            APP 图标
          </Button>
        </div>

        {!file && (
          <DropZone
            disabled={uploading}
            onDrop={onDrop}
            onBrowse={() => inputRef.current?.click()}
          />
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/avif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleSelect(f)
          }}
        />

        {error && (
          <div className="text-destructive bg-destructive/10 rounded-md px-3 py-2 text-sm">
            {error}
          </div>
        )}

        {file && (
          <>
            <Preview
              url={compressedUrl || originalUrl}
              originalSize={originalSize}
              compressedSize={compressed?.blob.size ?? 0}
            />
            <Button variant="outline" size="sm" onClick={reset} disabled={uploading}>
              重选图片
            </Button>
          </>
        )}

        {uploading && (
          <div className="flex flex-col gap-1">
            <Progress value={progress} />
            <span className="text-muted-foreground text-xs">
              {stage === 'transfer' ? '正在传输图片…' : '正在写入仓库，请稍候…'}
            </span>
          </div>
        )}

        {result?.ok && result.url && (
          <ResultCard url={result.url} name={result.name ?? ''} />
        )}

        {file && (
          <Button onClick={handleUpload} disabled={!compressed || uploading} className="flex-1">
            {uploading ? '上传中…' : '上传'}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
