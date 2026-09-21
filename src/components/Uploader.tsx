import { useCallback, useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { compressImage, formatBytes, isAllowedImage, MAX_SIZE } from '@/lib/compress'
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

/** 上传阶段：transfer = 图片传到 Worker，upload = 服务端写入对象存储 */
type UploadStage = 'transfer' | 'upload'

export function Uploader() {
  const [file, setFile] = useState<File | null>(null)
  const [originalUrl, setOriginalUrl] = useState<string>('')
  const [originalSize, setOriginalSize] = useState(0)
  const [compressed, setCompressed] = useState<{ blob: Blob; ext: string } | null>(null)
  const [compressedUrl, setCompressedUrl] = useState<string>('')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState<UploadStage>('transfer')
  const [result, setResult] = useState<UploadResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // 服务端写入对象存储期间“缓慢爬行”进度条的定时器句柄
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
   * 服务端写对象存储耗时无法精确测知，用“在动但变慢”如实表达“还在工作”。
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
    if (!compressed || !file) return
    setUploading(true)
    setStage('transfer')
    setProgress(5)
    setError('')
    setResult(null)
    try {
      const fd = new FormData()
      // 文件名不再由前端生成：实际存储名由 CNB 对象存储生成（UUID），
      // 前端送的 multipart 文件名仅是元数据，Worker 不会用它落存储。
      fd.append('file', compressed.blob, file.name)

      // 用 XHR 而不是 fetch：只有 XHR 能拿到"浏览器→Worker"这段的真实字节进度。
      // 字节传完 ≠ 完成，服务端还要写入对象存储并返回最终 URL。
      const data = await new Promise<UploadResult>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/upload')
        xhr.responseType = 'json'
        // 上传段真实进度：映射到 5% → 80%。图片传完只代表到达 Worker，
        // 剩下的 80% → 99% 留给服务端写入对象存储，那段无法精确测知。
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setStage('upload')
            setProgress(5 + (e.loaded / e.total) * 75)
          }
        }
        xhr.upload.onload = () => {
          // 字节传完 ≠ 完成，服务端在写对象存储；进度条转入缓慢爬行
          setStage('upload')
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
  }, [compressed, file, crawl, stopCrawl])

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
    <Card className="w-full max-w-xl shadow-md shadow-primary/5 backdrop-blur-sm">
      <CardHeader>
        <CardTitle>上传图片</CardTitle>
        <CardDescription>
          拖拽或点击选择图片，浏览器本地压缩后上传（GIF 保持原样）
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
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
          <div className="text-destructive bg-destructive/10 border-destructive/20 rounded-md border px-3 py-2 text-sm">
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
              {stage === 'transfer' ? '正在传输图片…' : '正在写入对象存储，请稍候…'}
            </span>
          </div>
        )}

        {result?.ok && result.url && (
          <ResultCard url={result.url} name={result.name ?? ''} />
        )}

        {file && (
          <Button
            onClick={handleUpload}
            disabled={!compressed || uploading}
            className="w-full"
            size="lg"
          >
            {uploading ? '上传中…' : '上传'}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
