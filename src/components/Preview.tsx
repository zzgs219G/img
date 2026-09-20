import { formatBytes } from '@/lib/compress'

interface PreviewProps {
  url: string
  originalSize: number
  compressedSize: number
}

export function Preview({ url, originalSize, compressedSize }: PreviewProps) {
  const saved = originalSize > 0 ? Math.round((1 - compressedSize / originalSize) * 100) : 0
  return (
    <div className="bg-muted/40 flex flex-col gap-3 rounded-lg p-3">
      <img
        src={url}
        alt="预览"
        className="bg-[repeating-conic-gradient(#00000008_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] max-h-64 w-auto self-center rounded-md object-contain"
      />
      <div className="text-muted-foreground flex justify-between text-sm">
        <span>原始：{formatBytes(originalSize)}</span>
        <span>
          压缩后：{formatBytes(compressedSize)}
          {saved > 0 && (
            <span className="ml-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-600 dark:text-emerald-400">
              -{saved}%
            </span>
          )}
        </span>
      </div>
    </div>
  )
}
