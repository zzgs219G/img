# cdn-img 图床

Cloudflare Workers 图床：浏览器端 Canvas 压缩 → Worker 内 isomorphic-git push 到 CNB 仓库（[cnb.cool/zzgs219/cdn-img](https://cnb.cool/zzgs219/cdn-img)）。

一次上传 = 1 次 Worker 请求；页面浏览/压缩/文件名生成全部消耗 0 请求（`run_worker_first: false`，静态资源直接命中）。

## 接口

- `GET /api/hello` → `{ "message": "Hello from Worker" }`
- `POST /api/upload`（multipart，字段 `file`）→ `{ ok, url, name, size }`
  - url 形如 `https://cnb.cool/zzgs219/cdn-img/-/raw/main/assets/uploads/img_260920_143025_a3f9.webp`
  - 文件名规则：`img_YYMMDD_HHmmss_xxxx.webp`（GIF 保留原样）
  - 限制：10MB，格式 jpg/png/webp/gif/bmp/avif，输出统一 webp（GIF 除外）

## 环境变量（Cloudflare Secrets）

| 名称 | 值 |
|---|---|
| `CNB_TOKEN` | CNB 访问令牌（读写仓库权限） |
| `CNB_REPO` | `https://cnb.cool/zzgs219/cdn-img.git` |
| `CNB_BRANCH` | `main` |

## 开发

```bash
npm install
npm run dev      # 本地开发（/api/* 由 vite 代理外需自建，见下）
npm run build    # tsc -b && vite build
npm run lint     # oxlint
```

## 部署（Termux 无法本地跑 wrangler，走 GitHub 自动部署）

1. 代码 push 到 GitHub（`origin` = github.com/zzgs219G/img）
2. Cloudflare Dashboard → Workers & Pages → 连接该 GitHub 仓库
3. Build command: `npm run build`；Deploy command: `npx wrangler deploy`
4. 在 Cloudflare 控制台配置上表 3 个 Secret
