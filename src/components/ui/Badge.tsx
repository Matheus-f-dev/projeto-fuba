import type { ReactNode } from 'react'
import {
  OCCURRENCE_STATUS_META,
  ORDER_STATUS_META,
  ROUTE_STATUS_META,
  STOP_STATUS_META,
  type Tone,
} from '@/domain/status'
import type { OccurrenceStatus, OrderStatus, RouteStatus, StopStatus } from '@/types/domain'
import { cn } from '@/utils/cn'

export const toneText: Record<Tone, string> = {
  neutral: 'text-muted',
  slate: 'text-slate',
  violet: 'text-violet',
  accent: 'text-accent-ink',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
}
export const toneBg: Record<Tone, string> = {
  neutral: 'bg-ink/[0.05]',
  slate: 'bg-slate-soft',
  violet: 'bg-violet-soft',
  accent: 'bg-accent-soft',
  success: 'bg-success-soft',
  warning: 'bg-warning-soft',
  danger: 'bg-danger-soft',
}
export const toneDot: Record<Tone, string> = {
  neutral: 'bg-faint',
  slate: 'bg-slate',
  violet: 'bg-violet',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

export function Badge({
  tone = 'neutral',
  children,
  className,
  pulse,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
  pulse?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full pr-2 pl-1.5 text-xs font-medium whitespace-nowrap',
        toneBg[tone],
        toneText[tone],
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', toneDot[tone], pulse && 'animate-pulse-dot')} />
      {children}
    </span>
  )
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const m = ORDER_STATUS_META[status]
  return <Badge tone={m.tone}>{m.label}</Badge>
}
export function RouteStatusBadge({ status }: { status: RouteStatus }) {
  const m = ROUTE_STATUS_META[status]
  return (
    <Badge tone={m.tone} pulse={status === 'IN_PROGRESS'}>
      {m.label}
    </Badge>
  )
}
export function StopStatusBadge({ status }: { status: StopStatus }) {
  const m = STOP_STATUS_META[status]
  return <Badge tone={m.tone}>{m.label}</Badge>
}
export function OccurrenceStatusBadge({ status }: { status: OccurrenceStatus }) {
  const m = OCCURRENCE_STATUS_META[status]
  return <Badge tone={m.tone}>{m.label}</Badge>
}
