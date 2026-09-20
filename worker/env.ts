export interface Env {
  /** CNB 访问令牌（读写仓库权限），Cloudflare Secret 配置 */
  CNB_TOKEN: string
  /** 如 https://cnb.cool/zzgs219/cdn-img.git */
  CNB_REPO: string
  /** 默认 main */
  CNB_BRANCH: string
}
