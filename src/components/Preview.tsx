import { formatBytes } from '@/lib/compress'

interface PreviewProps {
  url: string
  originalSize: number
  compressedSize: number
}

export function Preview({ url, originalSize, compressedSize }: PreviewProps) {
  const saved = originalSize > 0 ? Math.round((1 - compressedSize / originalSize) * 100) : 0
  return (
    <div className="flex flex-col gap-3">
      <img
        src={url}
        alt="预览"
        className="max-h-64 w-auto self-center rounded-md object-contain"
      />
      <div className="text-muted-foreground flex justify-between text-sm">
        <span>原始：{formatBytes(originalSize)}</span>
        <span>
          压缩后：{formatBytes(compressedSize)}
          {saved > 0 && <span className="text-green-600">（-{saved}%）</span>}
        </span>
      </div>
    </div>
  )
}
