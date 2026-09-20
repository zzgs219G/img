/**
 * isomorphic-git / lightning-fs 官方推荐的 Workers 内存存储后端。
 * 通过 LightningFS 的 `db` 选项注入,替代依赖 IndexedDB 的 IdbBackend。
 * 每个请求创建一个全新实例,请求结束随作用域丢弃,无需手动 reset。
 */
export class MemoryBackend {
  private _map = new Map<string | number, unknown>()

  saveSuperblock(superblock: unknown) {
    this._map.set('!root', superblock)
  }

  loadSuperblock() {
    return this._map.get('!root') || null
  }

  readFile(inode: string | number) {
    return this._map.get(inode) || null
  }

  writeFile(inode: string | number, data: unknown) {
    this._map.set(inode, data)
  }

  unlink(inode: string | number) {
    this._map.delete(inode)
  }

  async wipe() {
    this._map.clear()
  }

  close() {
    // 与 IdbBackend 接口保持一致:内存存储无需关闭
  }
}
