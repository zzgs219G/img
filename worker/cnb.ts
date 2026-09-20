import git from 'isomorphic-git'
import http from 'isomorphic-git/http/web'
import LightningFS from '@isomorphic-git/lightning-fs'
import { MemoryBackend } from './memory-backend'
import { ensureWebLocksShim } from './web-locks-shim'

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
  // Workers 没有 Web Locks API，而 lightning-fs 的 DefaultBackend 在
  // navigator.locks 缺失时会退回基于 IndexedDB 的 Mutex（同样会炸）。
  // 必须在 new LightningFS 之前垫上内存版 locks shim。
  ensureWebLocksShim()

  // 每个请求创建一个全新的内存文件系统,请求结束随作用域丢弃,无需 reset。
  // 用 db 选项注入内存后端,绕开 Workers 中不可用的 IndexedDB。
  const fs = new LightningFS('mem', {
    // lightning-fs 的 .d.ts 未导出 FS.Options.db 类型,这里做一次性受控断言
    db: new MemoryBackend() as never,
    defer: true,
  }).promises
  const dir = '/'
  const author = { name: 'cdn-img-bot', email: 'bot@cdn-img.local' }

  await git.init({ fs, dir, defaultBranch: opts.branch })

  const dirPath = '/' + opts.filePath.split('/').slice(0, -1).join('/')
  if (dirPath !== '/') {
    // lightning-fs 的 mkdir 不支持 recursive,逐层创建并容忍 EEXIST
    const parts = dirPath.split('/').filter(Boolean)
    let cur = ''
    for (const part of parts) {
      cur += '/' + part
      try {
        await fs.mkdir(cur)
      } catch (e) {
        if ((e as { code?: string }).code !== 'EEXIST') throw e
      }
    }
  }
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
