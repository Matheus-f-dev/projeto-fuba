import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Select, Textarea } from '@/components/ui/Field'
import { OCCURRENCE_TYPE_LABEL } from '@/domain/status'
import { useAction } from '@/hooks/useAction'
import { useReadySession } from '@/hooks/useSession'
import { occurrencesService } from '@/services/occurrencesService'
import type { Occurrence, OccurrenceType } from '@/types/domain'

const TYPES = Object.keys(OCCURRENCE_TYPE_LABEL) as OccurrenceType[]

/** Ocorrência avulsa, vinculada a um pedido e/ou rota. Não muda o status da entrega. */
export function NewOccurrenceDialog({
  open,
  onClose,
  orderId = null,
  routeId = null,
  driverId = null,
  subtitle,
  defaultType = 'OUTRO',
}: {
  open: boolean
  onClose: () => void
  orderId?: string | null
  routeId?: string | null
  driverId?: string | null
  subtitle: string
  defaultType?: OccurrenceType
}) {
  const { ctx } = useReadySession()
  const { pending, run } = useAction()
  const [type, setType] = useState<OccurrenceType>(defaultType)
  const [description, setDescription] = useState('')
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (open) {
      setType(defaultType)
      setDescription('')
      setTouched(false)
    }
  }, [open, defaultType])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Registrar ocorrência"
      description={subtitle}
      onSubmit={async () => {
        setTouched(true)
        if (!description.trim()) return
        const ok = await run(
          () => occurrencesService.create(ctx, { type, description, orderId, routeId, driverId }),
          'Ocorrência registrada',
        )
        if (ok) onClose()
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Voltar
          </Button>
          <Button type="submit" variant="primary" loading={pending}>
            Registrar ocorrência
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Tipo">
          {(p) => (
            <Select {...p} value={type} onChange={(e) => setType(e.target.value as OccurrenceType)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {OCCURRENCE_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Descrição" error={touched && !description.trim() ? 'Descreva a ocorrência.' : undefined}>
          {(p) => <Textarea {...p} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} autoFocus />}
        </Field>
        <p className="text-xs text-muted">
          Para encerrar uma parada sem entrega, use “Registrar não entrega” na rota.
        </p>
      </div>
    </Dialog>
  )
}

export function ResolveOccurrenceDialog({
  occurrence,
  onClose,
}: {
  occurrence: Occurrence | null
  onClose: () => void
}) {
  const { ctx } = useReadySession()
  const { pending, run } = useAction()
  const [resolution, setResolution] = useState('')
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    setResolution('')
    setTouched(false)
  }, [occurrence?.id])

  return (
    <Dialog
      open={Boolean(occurrence)}
      onClose={onClose}
      title="Resolver ocorrência"
      description={occurrence ? `${OCCURRENCE_TYPE_LABEL[occurrence.type]} · ${occurrence.description}` : undefined}
      onSubmit={async () => {
        setTouched(true)
        if (!resolution.trim() || !occurrence) return
        const ok = await run(() => occurrencesService.resolve(ctx, occurrence.id, resolution), 'Ocorrência resolvida')
        if (ok) onClose()
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Voltar
          </Button>
          <Button type="submit" variant="primary" loading={pending}>
            Marcar como resolvida
          </Button>
        </>
      }
    >
      <Field
        label="Como foi tratada"
        error={touched && !resolution.trim() ? 'Obrigatório. Fica registrado no histórico.' : undefined}
      >
        {(p) => (
          <Textarea
            {...p}
            rows={3}
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            placeholder="Ex.: cliente contatado, nova entrega agendada para amanhã"
            autoFocus
          />
        )}
      </Field>
    </Dialog>
  )
}
