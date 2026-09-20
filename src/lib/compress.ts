const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/avif',
])

export const MAX_SIZE = 10 * 1024 * 1024 // 10MB
export const MAX_WIDTH = 1920
export const DEFAULT_QUALITY = 0.8

export interface CompressResult {
  blob: Blob
  width: number
  height: number
  ext: string
}

export function isAllowedImage(file: File): boolean {
  return ALLOWED_TYPES.has(file.type)
}

/**
 * 浏览器端 Canvas 压缩（0 请求消耗）。
 * - GIF：直接返回原文件，ext = 'gif'（不压缩、不转格式，动图不变）
 * - 其他：Canvas 压缩 → toBlob('image/webp', 0.8)
 * - 宽度超过 1920 → 等比缩放；不超过 → 不放大
 */
export async function compressImage(
  file: File,
  options?: { maxWidth?: number; quality?: number }
): Promise<CompressResult> {
  const maxWidth = options?.maxWidth ?? MAX_WIDTH
  const quality = options?.quality ?? DEFAULT_QUALITY

  if (file.type === 'image/gif') {
    return { blob: file, width: 0, height: 0, ext: 'gif' }
  }

  const bitmap = await createImageBitmap(file)
  const scale = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D 上下文不可用')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', quality)
  )
  if (!blob) throw new Error('webp 编码失败')

  return { blob, width, height, ext: 'webp' }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
