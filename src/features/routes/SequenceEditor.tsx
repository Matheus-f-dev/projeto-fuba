import { ArrowDown, ArrowUp, GripVertical, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { IconButton } from '@/components/ui/Button'
import { cn } from '@/utils/cn'

export interface SequenceItem {
  id: string
  title: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/**
 * Lista ordenável das paradas: arrastar, ou usar as setas (acessível por teclado).
 * A ordem mostrada é a ordem de entrega.
 */
export function SequenceEditor({
  items,
  onMove,
  onRemove,
  disabled,
}: {
  items: SequenceItem[]
  onMove: (from: number, to: number) => void
  onRemove?: (id: string) => void
  disabled?: boolean
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  return (
    <ol className="space-y-1">
      {items.map((item, index) => (
        <li
          key={item.id}
          draggable={!disabled}
          onDragStart={(e) => {
            setDragIndex(index)
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(e) => {
            if (dragIndex === null) return
            e.preventDefault()
            setOverIndex(index)
          }}
          onDrop={(e) => {
            e.preventDefault()
            if (dragIndex !== null && dragIndex !== index) onMove(dragIndex, index)
            setDragIndex(null)
            setOverIndex(null)
          }}
          onDragEnd={() => {
            setDragIndex(null)
            setOverIndex(null)
          }}
          className={cn(
            'group flex items-center gap-2 rounded-md border bg-surface py-1.5 pr-1 pl-1.5 transition-colors',
            dragIndex === index ? 'border-dashed border-line-strong opacity-50' : 'border-line',
            overIndex === index && dragIndex !== index && 'border-accent bg-accent-soft/40',
          )}
        >
          <GripVertical
            className={cn('size-4 shrink-0 text-faint', disabled ? 'opacity-30' : 'cursor-grab active:cursor-grabbing')}
            aria-hidden
          />
          <span className="tnum flex size-6 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[11px] font-medium text-white">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium">{item.title}</div>
            {item.subtitle && <div className="truncate text-xs text-muted">{item.subtitle}</div>}
          </div>
          {item.meta}
          <div className="flex shrink-0 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <IconButton label="Mover para cima" disabled={disabled || index === 0} onClick={() => onMove(index, index - 1)} className="size-7">
              <ArrowUp className="size-3.5" />
            </IconButton>
            <IconButton
              label="Mover para baixo"
              disabled={disabled || index === items.length - 1}
              onClick={() => onMove(index, index + 1)}
              className="size-7"
            >
              <ArrowDown className="size-3.5" />
            </IconButton>
            {onRemove && (
              <IconButton label="Remover da rota" disabled={disabled} onClick={() => onRemove(item.id)} className="size-7 hover:text-danger">
                <X className="size-3.5" />
              </IconButton>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
