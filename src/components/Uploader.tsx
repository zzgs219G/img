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

export function Uploader() {
  const [file, setFile] = useState<File | null>(null)
  const [originalUrl, setOriginalUrl] = useState<string>('')
  const [originalSize, setOriginalSize] = useState(0)
  const [compressed, setCompressed] = useState<{ blob: Blob; name: string } | null>(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<UploadResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSelect = useCallback(async (f: File) => {
    setError('')
    setResult(null)
    setCompressed(null)
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
      setCompressed({ blob: r.blob, name: generateFilename(r.ext) })
    } catch (e) {
      setError(e instanceof Error ? e.message : '压缩失败')
    }
  }, [])

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
      const fd = new FormData()
      fd.append('file', compressed.blob, compressed.name)
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
  }, [compressed])

  const reset = useCallback(() => {
    if (originalUrl) URL.revokeObjectURL(originalUrl)
    setFile(null)
    setOriginalUrl('')
    setCompressed(null)
    setResult(null)
    setError('')
    setProgress(0)
    if (inputRef.current) inputRef.current.value = ''
  }, [originalUrl])

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>图片上传</CardTitle>
        <CardDescription>
          拖拽或点击选择图片，浏览器本地压缩后上传（GIF 保持原样）
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <DropZone
          disabled={uploading}
          onDrop={onDrop}
          onBrowse={() => inputRef.current?.click()}
        />
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
          <Preview
            url={compressed ? URL.createObjectURL(compressed.blob) : originalUrl}
            originalSize={originalSize}
            compressedSize={compressed?.blob.size ?? 0}
          />
        )}

        {uploading && <Progress value={progress} />}

        {result?.ok && result.url && (
          <ResultCard url={result.url} name={result.name ?? ''} />
        )}

        <div className="flex gap-2">
          <Button onClick={handleUpload} disabled={!compressed || uploading} className="flex-1">
            {uploading ? '上传中…' : '上传'}
          </Button>
          <Button variant="outline" onClick={reset} disabled={uploading}>
            重选
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
