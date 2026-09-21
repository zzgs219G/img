/**
 * CNB 图片上传（OpenAPI 方案，不碰 git 仓库）。
 *
 * 历史备注：最早用 isomorphic-git 在 Worker 里 push 到 git 仓库，会让克隆体积
 * 随图片数线性膨胀，Worker 内存迟早撑爆，故废弃。
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
  /** 前端送来的原始文件名（仅作 multipart 元数据；实际存储名由 CNB 生成） */
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

/** https://cnb.cool/zzgs219/cdn-img.git → https://cnb.cool */
function repoOrigin(repoUrl: string): string {
  const m = /^(https?:\/\/[^/]+)/.exec(repoUrl)
  if (!m) throw new Error(`无法从 CNB_REPO 解析站点地址: ${repoUrl}`)
  return m[1]
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

  // ③ 拼公开 URL：assets.path 可能是完整路径 /{slug}/-/imgs/xx/xxxx.webp
  //    （已含仓库 slug），也可能只是 /-/imgs/... —— 需分别用站点 origin
  //    或仓库页面地址拼接，避免 slug 重复（见 docs/修复文档.md）。
  const path = apply.assets?.path
  if (!path) throw new Error('CNB 返回缺少 assets.path')
  const slugPrefix = `/${slug}/`
  const base = path.startsWith(slugPrefix) ? repoOrigin(opts.repoUrl) : repoPage(opts.repoUrl)
  // 存储文件名由 CNB 对象存储生成（UUID），从 assets.path 末段提取，
  // 不再使用前端上传时的原始文件名。
  const storedName = path.split('/').pop() || opts.fileName
  return {
    url: `${base}${path}`,
    name: storedName,
    size: opts.content.byteLength,
  }
}
