/**
 * 生成上传文件名：img_YYMMDD_HHmmss_xxxx.webp
 * - img 固定前缀
 * - YYMMDD 年月日、HHmmss 时分秒（本地时间）
 * - xxxx 4 位随机十六进制（同一秒 65536 种不撞名）
 * - GIF 保留 .gif，其余固定 .webp
 */
export function generateFilename(ext: string): string {
  const d = new Date()
  const p = (n: number, len = 2) => String(n).padStart(len, '0')
  const yymmdd = `${p(d.getFullYear() % 100)}${p(d.getMonth() + 1)}${p(d.getDate())}`
  const hhmmss = `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(2)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `img_${yymmdd}_${hhmmss}_${rand}.${ext}`
}
