import { X } from 'lucide-react'
import { useEffect, useRef, type FormEvent, type ReactNode } from 'react'
import { cn } from '@/utils/cn'
import { IconButton } from './Button'

interface BaseProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  /** Quando informado, o conteúdo vira um <form> e Enter envia. */
  onSubmit?: () => void
}

/** Usa o <dialog> nativo: foco preso, Esc e backdrop sem bibliotecas. */
function useNativeDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onCancel = (e: Event) => {
      e.preventDefault()
      onClose()
    }
    el.addEventListener('cancel', onCancel)
    return () => el.removeEventListener('cancel', onCancel)
  }, [onClose])
  return ref
}

function Body({ onSubmit, children, className }: { onSubmit?: () => void; children: ReactNode; className: string }) {
  if (!onSubmit) return <div className={className}>{children}</div>
  return (
    <form
      className={className}
      noValidate
      onSubmit={(e: FormEvent) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      {children}
    </form>
  )
}

export function Dialog({ open, onClose, title, description, children, footer, className, onSubmit }: BaseProps) {
  const ref = useNativeDialog(open, onClose)
  return (
    <dialog
      ref={ref}
      className={cn(
        'm-auto w-[calc(100%-2rem)] max-w-lg overflow-visible rounded-xl bg-transparent p-0 backdrop:backdrop-blur-[1px]',
        className,
      )}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {open && (
        <Body
          onSubmit={onSubmit}
          className="flex max-h-[calc(100dvh-2rem)] animate-pop-in flex-col rounded-xl border border-line bg-surface shadow-pop"
        >
          <header className="flex items-start gap-4 border-b border-line px-5 pt-4 pb-3.5">
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-base font-semibold tracking-[-0.01em]">{title}</h2>
              {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
            </div>
            <IconButton label="Fechar" onClick={onClose} className="-mr-1.5 -mt-0.5">
              <X className="size-4" />
            </IconButton>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-sunken/60 px-5 py-3 rounded-b-xl">
              {footer}
            </footer>
          )}
        </Body>
      )}
    </dialog>
  )
}

/** Painel lateral para detalhes (pedido, parada). */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: Omit<BaseProps, 'onSubmit'>) {
  const ref = useNativeDialog(open, onClose)
  return (
    <dialog
      ref={ref}
      className={cn(
        'ml-auto h-dvh max-h-dvh w-full max-w-[560px] bg-transparent p-0 backdrop:bg-ink/20',
        className,
      )}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {open && (
        <div className="flex h-full animate-sheet-in flex-col border-l border-line bg-surface shadow-sheet">
          <header className="flex items-start gap-4 border-b border-line px-6 pt-5 pb-4">
            <div className="min-w-0 flex-1">{title}{description}</div>
            <IconButton label="Fechar" onClick={onClose} className="-mr-2">
              <X className="size-4" />
            </IconButton>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer && <footer className="flex flex-wrap gap-2 border-t border-line px-6 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  )
}
