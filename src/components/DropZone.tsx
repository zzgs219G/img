import { useCallback, useState } from 'react'
import type { DragEvent } from 'react'
import { CloudUpload } from 'lucide-react'

interface DropZoneProps {
  disabled?: boolean
  onDrop: (e: DragEvent<HTMLDivElement>) => void
  onBrowse: () => void
}

export function DropZone({ disabled, onDrop, onBrowse }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false)

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }, [])
  const handleDragLeave = useCallback(() => setDragOver(false), [])

  return (
    <div
      onDrop={onDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDragEnd={handleDragLeave}
      onClick={onBrowse}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onBrowse()
        }
      }}
      className={
        'group relative flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-all ' +
        (dragOver
          ? 'border-primary bg-primary/5 scale-[1.01]'
          : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40')
      }
    >
      <span
        className={
          'bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full transition-transform group-hover:scale-110 ' +
          (dragOver ? 'scale-110' : '')
        }
      >
        <CloudUpload className="size-6" />
      </span>
      <div>
        <p className="text-sm font-medium">
          {dragOver ? '松开鼠标，开始上传' : '拖拽图片到这里，或点击选择'}
        </p>
        <p className="text-muted-foreground/60 mt-1 text-xs">
          上传即表示图片将被压缩并保存到图床
        </p>
      </div>
      {disabled && <span className="sr-only">上传中，请稍候</span>}
    </div>
  )
}
