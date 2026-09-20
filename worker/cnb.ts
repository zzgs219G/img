/**
 * CNB 图片上传（OpenAPI 方案，不碰 git 仓库）。
 *
 * 历史：旧实现用 isomorphic-git 在内存里 init 空仓库 + force push，
 * 会把远程分支整个覆盖成"只含一张图"的仓库（真实事故）；后改为浅克隆再 push，
 * 但图片是对象存储的事，往 git 仓库里塞图片会让克隆体积随图片数线性膨胀，
 * Worker 内存迟早撑爆。
 *
 * 现方案走 CNB OpenAPI：
 *   ① POST /{repo}/-/upload/imgs          → 拿预签名 upload_url + form 参数
 *   ② PUT  {upload_url}（multipart/form）  → 流式上传图片二进制
 *   ③ 返回 assets.path 即图片访问路径，拼成公开 URL
 *
 * 全程零 git 操作：不产生 commit、不撑大仓库历史、无需 clone 任何文件。
 * 参考文档：https://api.cnb.cool/swagger.json（operationId: UploadImgs）
 */

export interface CnbUploadOptions {
  /** 形如 https://cnb.cool/zzgs219/cdn-img.git */
  repoUrl: string
  /** CNB 访问令牌 */
  token: string
  /** 目标文件名，如 img_260920_a3f9c1.webp */
  fileName: string
  /** 图片二进制内容 */
  content: Uint8Array
  /** MIME 类型，如 image/webp */
  contentType: string
}

export interface CnbUploadResult {
  /** 图片公开访问 URL */
  url: string
  /** 服务端存储的文件名 */
  name: string
  /** 文件大小（字节） */
  size: number
}

/** https://cnb.cool/zzgs219/cdn-img.git → https://api.cnb.cool/zzgs219/cdn-img */
function repoSlug(repoUrl: string): string {
  const m = /https?:\/\/[^/]+\/(.+?)(?:\.git)?\/?$/.exec(repoUrl)
  if (!m) throw new Error(`无法从 CNB_REPO 解析仓库路径: ${repoUrl}`)
  return m[1]
}

/** https://cnb.cool/zzgs219/cdn-img.git → https://cnb.cool/zzgs219/cdn-img */
function repoPage(repoUrl: string): string {
  return repoUrl.replace(/\.git$/, '')
}

export async function uploadImageToCnb(opts: CnbUploadOptions): Promise<CnbUploadResult> {
  const slug = repoSlug(opts.repoUrl)

  // ① 申请预签名上传地址
  const applyResp = await fetch(`https://api.cnb.cool/${slug}/-/upload/imgs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ name: opts.fileName, size: opts.content.byteLength }),
  })
  if (!applyResp.ok) {
    const text = await applyResp.text().catch(() => '')
    throw new Error(`CNB 申请上传地址失败（HTTP ${applyResp.status}）${text.slice(0, 200)}`)
  }
  const apply = (await applyResp.json()) as {
    upload_url: string
    form?: Record<string, string>
    assets: { path: string }
  }

  // ② 用预签名地址流式上传二进制（PUT，带表单参数）
  const putResp = await fetch(apply.upload_url, {
    method: 'PUT',
    headers: {
      ...(apply.form ?? {}),
      'Content-Type': opts.contentType,
    },
    body: opts.content as unknown as BodyInit,
  })
  if (!putResp.ok) {
    const text = await putResp.text().catch(() => '')
    throw new Error(`CNB 上传图片失败（HTTP ${putResp.status}）${text.slice(0, 200)}`)
  }

  // ③ 拼公开 URL：assets.path 形如 /{slug}/-/imgs/xx/xxxx.png
  const path = apply.assets?.path
  if (!path) throw new Error('CNB 返回缺少 assets.path')
  return {
    url: `${repoPage(opts.repoUrl)}${path}`,
    name: opts.fileName,
    size: opts.content.byteLength,
  }
}
