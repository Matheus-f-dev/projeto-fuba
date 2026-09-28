import { cn } from '@/utils/cn'

/** Placa no formato Mercosul: faixa azul no topo e caracteres em fonte monoespaçada. */
export function Plate({ plate, className }: { plate: string | null | undefined; className?: string }) {
  if (!plate) return <span className="text-faint">—</span>
  return (
    <span
      className={cn(
        'inline-flex flex-col overflow-hidden rounded-[4px] border border-ink/25 bg-white align-middle leading-none',
        className,
      )}
      title={`Placa ${plate}`}
    >
      <span className="h-[3px] bg-[#1f4fb3]" aria-hidden />
      <span className="px-1.5 pt-[3px] pb-[3px] font-mono text-[11px] font-medium tracking-[0.08em] text-ink">
        {plate}
      </span>
    </span>
  )
}
