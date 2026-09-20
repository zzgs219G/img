/**
 * 生成上传文件名：img_YYMMDD_xxxxxx.webp
 * - YYMMDD 年月日（本地时间）
 * - xxxxxx 3 字节随机数的 6 位十六进制（24^6 ≈ 1.9 亿种不撞名）
 * - GIF 保留 .gif，其余固定 .webp
 */
export function generateFilename(ext: string): string {
  const d = new Date()
  const p = (n: number, len = 2) => String(n).padStart(len, '0')
  const yymmdd = `${p(d.getFullYear() % 100)}${p(d.getMonth() + 1)}${p(d.getDate())}`
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(3)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `img_${yymmdd}${rand}.${ext}`
}
