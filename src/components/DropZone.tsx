import { useCallback } from 'react'
import type { DragEvent } from 'react'

import { Button } from '@/components/ui/button'

interface DropZoneProps {
  disabled?: boolean
  onDrop: (e: DragEvent<HTMLDivElement>) => void
  onBrowse: () => void
}

export function DropZone({ disabled, onDrop, onBrowse }: DropZoneProps) {
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }, [])

  return (
    <div
      onDrop={onDrop}
      onDragOver={handleDragOver}
      className="border-muted-foreground/25 hover:border-muted-foreground/50 flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors"
    >
      <p className="text-muted-foreground text-sm">拖拽图片到这里，或</p>
      <Button variant="outline" size="sm" onClick={onBrowse} disabled={disabled}>
        点击选择图片
      </Button>
      <p className="text-muted-foreground/60 text-xs">
        支持 jpg / png / webp / gif / bmp / avif，最大 10MB
      </p>
    </div>
  )
}
