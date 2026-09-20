import { useState } from 'react'

import { Button } from '@/components/ui/button'

interface ResultCardProps {
  url: string
  name: string
}

export function ResultCard({ url, name }: ResultCardProps) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="bg-muted/50 flex flex-col gap-2 rounded-lg border p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">上传成功 🎉</p>
      <p className="text-muted-foreground truncate text-xs">{name}</p>
      <div className="flex items-center gap-2">
        <code className="bg-background flex-1 truncate rounded border px-2 py-1.5 text-xs">
          {url}
        </code>
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? '已复制' : '复制'}
        </Button>
      </div>
      <img
        src={url}
        alt={name}
        className="bg-[repeating-conic-gradient(#00000008_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] max-h-40 w-auto self-center rounded-md"
      />
    </div>
  )
}
