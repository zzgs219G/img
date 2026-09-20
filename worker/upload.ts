import type { Env } from './env'
import { uploadImageToCnb } from './cnb'

const MAX_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'])

function extFromName(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name)
  return m ? m[1].toLowerCase() : ''
}

/** 文件扩展名 → MIME 类型 */
const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  avif: 'image/avif',
}

export async function handleUpload(request: Request, env: Env): Promise<Response> {
  try {
    if (!env.CNB_TOKEN || !env.CNB_REPO) {
      return Response.json(
        { ok: false, error: '服务端未配置 CNB_TOKEN / CNB_REPO' },
        { status: 500 }
      )
    }

    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return Response.json({ ok: false, error: '缺少 file 字段' }, { status: 400 })
    }

    const ext = extFromName(file.name)
    if (!ALLOWED_EXT.has(ext)) {
      return Response.json({ ok: false, error: '不支持的文件格式' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return Response.json({ ok: false, error: '文件过大' }, { status: 400 })
    }

    const mime = MIME[ext] || 'application/octet-stream'

    const r = await uploadImageToCnb({
      repoUrl: env.CNB_REPO,
      token: env.CNB_TOKEN,
      fileName: file.name,
      content: new Uint8Array(await file.arrayBuffer()),
      contentType: mime,
    })

    return Response.json({
      ok: true,
      url: r.url,
      name: file.name,
      size: file.size,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : '上传失败'
    return Response.json({ ok: false, error: msg }, { status: 500 })
  }
}
