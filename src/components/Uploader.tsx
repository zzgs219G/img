import { useCallback, useRef, useState } from 'react'
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
  const [result, setResult] = useState<UploadResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
    setProgress(10)
    setError('')
    setResult(null)
    try {
      setProgress(40)
      // 上传时才生成文件名，确保用的是当前 type（切换后目录跟着变）
      const name = generateFilename(compressed.ext, type)
      const fd = new FormData()
      fd.append('file', compressed.blob, name)
      const resp = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = (await resp.json()) as UploadResult
      setProgress(100)
      if (!resp.ok || !data.ok) {
        setError(data.error || `上传失败（HTTP ${resp.status}）`)
      } else {
        setResult(data)
      }
    } catch {
      setError('网络错误，上传失败')
    } finally {
      setUploading(false)
    }
  }, [compressed, type])

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

        {uploading && <Progress value={progress} />}

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
