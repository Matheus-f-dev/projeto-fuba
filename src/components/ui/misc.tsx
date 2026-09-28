import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'
import { initials } from '@/utils/format'

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex flex-wrap items-end gap-x-6 gap-y-3 pb-5', className)}>
      <div className="min-w-[240px] flex-1">
        <h1 className="font-display text-[22px] leading-7 font-semibold tracking-[-0.02em] text-ink">{title}</h1>
        {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      {icon && <div className="mb-3 text-faint [&>svg]:size-6">{icon}</div>}
      <p className="font-display text-[15px] font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-ink/[0.07] text-[11px] font-semibold tracking-wide text-ink-2',
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}

/** Controle segmentado para filtros de poucas opções. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; count?: number }[]
  label: string
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-md bg-ink/[0.05] p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors',
            value === o.value ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(20_24_27/0.08)]' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
          {o.count != null && <span className="tnum text-2xs text-faint">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** Par rótulo/valor para painéis de detalhe. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-1.5 text-[13px]">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="font-display text-[15px] font-semibold tracking-[-0.01em]">{children}</h2>
      {action}
    </div>
  )
}
