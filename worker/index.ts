/// <reference types="@cloudflare/workers-types" />

import type { Env } from './env'
import { handleUpload } from './upload'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/api/hello' && request.method === 'GET') {
      return Response.json({ message: 'Hello from Worker' })
    }

    if (url.pathname === '/api/upload' && request.method === 'POST') {
      return handleUpload(request, env)
    }

    return Response.json({ ok: false, error: 'Not Found' }, { status: 404 })
  },
}
