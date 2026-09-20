import git from 'isomorphic-git'
import http from 'isomorphic-git/http/web'
import { fs as memfs } from 'memfs'

export interface CnbPushOptions {
  repoUrl: string
  branch: string
  token: string
  /** 仓库内路径，如 assets/uploads/img_260920_143025_a3f9.webp */
  filePath: string
  /** 图片二进制内容 */
  content: Uint8Array
  /** 提交说明 */
  message: string
}

/**
 * 在内存文件系统里完成 init → add → commit → push 到 CNB。
 * 全程内存操作，push 成功即丢弃；失败无脏数据残留。
 */
export async function pushToCnb(opts: CnbPushOptions): Promise<void> {
  const fs = memfs.promises as unknown as import('isomorphic-git').PromiseFsClient &
    typeof memfs.promises
  const vol = memfs as unknown as { reset(): void }
  vol.reset()
  const dir = '/'
  const author = { name: 'cdn-img-bot', email: 'bot@cdn-img.local' }

  await git.init({ fs, dir, defaultBranch: opts.branch })

  const dirPath = '/' + opts.filePath.split('/').slice(0, -1).join('/')
  if (dirPath !== '/') await fs.mkdir(dirPath, { recursive: true })
  await fs.writeFile(`/${opts.filePath}`, opts.content)

  await git.add({ fs, dir, filepath: opts.filePath })
  await git.commit({ fs, dir, message: opts.message, author })

  await git.push({
    fs,
    http,
    dir,
    url: opts.repoUrl,
    ref: opts.branch,
    // CNB 走 Basic Auth：username 固定 token，password 为令牌
    onAuth: () => ({ username: 'token', password: opts.token }),
    force: true, // 仓库只由本服务写入，避免历史分叉后 push 被拒
  })
}
