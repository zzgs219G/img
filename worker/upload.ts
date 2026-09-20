import type { Env } from './env'
import { pushToCnb } from './cnb'

const MAX_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'])

function extFromName(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name)
  return m ? m[1].toLowerCase() : ''
}

/** 目标文件在 CNB 仓库内的路径：src/img/<name>；icons 路径由文件名前缀 icon_ 触发 */
function repoPathFor(name: string): string {
  const folder = name.startsWith('icon') ? 'src/icons' : 'src/img'
  return `${folder}/${name}`
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

    const branch = env.CNB_BRANCH || 'main'
    const filePath = repoPathFor(file.name)
    const content = new Uint8Array(await file.arrayBuffer())

    await pushToCnb({
      repoUrl: env.CNB_REPO,
      branch,
      token: env.CNB_TOKEN,
      filePath,
      content,
      message: `upload: ${file.name}`,
    })

    // https://cnb.cool/zzgs219/cdn-img.git → https://cnb.cool/zzgs219/cdn-img
    const repoPage = env.CNB_REPO.replace(/\.git$/, '')
    const url = `${repoPage}/-/git/raw/${branch}/${filePath}`

    return Response.json({
      ok: true,
      url,
      name: file.name,
      size: file.size,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : '上传失败'
    return Response.json({ ok: false, error: msg }, { status: 500 })
  }
}
