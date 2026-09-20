/**
 * Cloudflare Workers 的 Web Locks API (navigator.locks) shim。
 *
 * 背景：@isomorphic-git/lightning-fs 的 DefaultBackend 初始化时选择锁实现：
 *   navigator.locks 存在   → Mutex2（基于 Web Locks，无 IndexedDB 依赖）
 *   navigator.locks 不存在 → Mutex（基于 idb-keyval → indexedDB，
 *                             Workers 中直接 ReferenceError: indexedDB is not defined）
 * Cloudflare Workers 不提供 Web Locks API，因此必须垫一个，否则即使把存储后端
 * 换成 MemoryBackend，第一次 fs 操作仍会触发 IndexedDB 路径。
 *
 * 实现说明：
 * - Worker isolate 内 JS 执行是单线程的，用"每锁名一个 held 标记 + 等待队列"
 *   即可完整模拟同名互斥语义，足以支撑 lightning-fs 的 Mutex2 用法。
 * - 仅覆盖 Mutex2 实际用到的三个选项：ifAvailable / signal / steal。
 * - 进程内 shim，不跨 isolate、不持久化——与 MemoryBackend 的生命周期假设一致。
 */

type LockMode = 'shared' | 'exclusive'

interface LockHandle {
  name: string
  mode: LockMode
}

type LockRequestOptions = {
  mode?: LockMode
  ifAvailable?: boolean
  steal?: boolean
  signal?: AbortSignal
}

type LockGrantedCallback = (lock: LockHandle | null) => Promise<unknown> | unknown

interface LockManagerLike {
  request(name: string, callback: LockGrantedCallback): Promise<unknown>
  request(
    name: string,
    options: LockRequestOptions,
    callback: LockGrantedCallback,
  ): Promise<unknown>
}

interface GlobalLike {
  navigator?: { locks?: LockManagerLike }
}

interface LockEntry {
  held: boolean
  waiters: Array<() => void>
}

const table = new Map<string, LockEntry>()

function entryOf(name: string): LockEntry {
  let e = table.get(name)
  if (!e) {
    e = { held: false, waiters: [] }
    table.set(name, e)
  }
  return e
}

function makeAbortError(): Error {
  const e = new Error('The operation was aborted.')
  e.name = 'AbortError'
  return e
}

async function requestLock(
  name: string,
  options: LockRequestOptions,
  callback: LockGrantedCallback,
): Promise<unknown> {
  const entry = entryOf(name)

  // steal：强制抢占。Mutex2 仅在 release({force:true}) 时使用，
  // 此时本 isolate 要么持有该锁要么无人持有，直接清空状态重拿即可。
  if (options.steal) {
    entry.held = false
    entry.waiters.length = 0
  }

  // 第一阶段：获取锁（可能立即拿到、立即失败、或排队等待）
  const lock = await new Promise<LockHandle | null>((resolve, reject) => {
    if (!entry.held) {
      entry.held = true
      resolve({ name, mode: options.mode ?? 'exclusive' })
      return
    }
    if (options.ifAvailable) {
      resolve(null)
      return
    }
    if (options.signal?.aborted) {
      reject(makeAbortError())
      return
    }
    entry.waiters.push(() => {
      if (options.signal?.aborted) {
        reject(makeAbortError())
        return
      }
      entry.held = true
      resolve({ name, mode: options.mode ?? 'exclusive' })
    })
  })

  // 没拿到锁（ifAvailable 且被占用）：按 Web Locks 规范以 null 回调
  if (!lock) {
    return callback(null)
  }

  // 拿到锁：回调 promise 结束时释放并唤醒下一个等待者
  try {
    return await callback(lock)
  } finally {
    entry.held = false
    const next = entry.waiters.shift()
    if (next) next()
  }
}

/**
 * 确保 globalThis.navigator.locks 存在；不存在则安装内存 shim。
 * 幂等，可在每次 push 前安全调用（须在 new LightningFS(...) 之前执行，
 * 因为 DefaultBackend 在 init 时同步读取 navigator.locks）。
 */
export function ensureWebLocksShim(): void {
  const g = globalThis as GlobalLike
  if (!g.navigator) {
    g.navigator = {}
  }
  if (!g.navigator.locks) {
    g.navigator.locks = {
      request(name: string, optionsOrCb: LockRequestOptions | LockGrantedCallback, maybeCb?: LockGrantedCallback) {
        const [options, callback] =
          typeof optionsOrCb === 'function'
            ? [{}, optionsOrCb as LockGrantedCallback]
            : [optionsOrCb, maybeCb as LockGrantedCallback]
        return requestLock(name, options, callback)
      },
    }
  }
}
