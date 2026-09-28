import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { DELIVERY_FAILURE_TYPES, OCCURRENCE_TYPE_LABEL } from '@/domain/status'
import { PhotoPicker } from '@/features/proofs/PhotoPicker'
import { useAction } from '@/hooks/useAction'
import { useReadySession } from '@/hooks/useSession'
import { deliveryProofService } from '@/services/deliveryProofService'
import { stopsService } from '@/services/stopsService'
import type { OccurrenceType, Order } from '@/types/domain'
import type { ProcessedImage } from '@/utils/compressImage'

interface StopDialogProps {
  order: Order
  open: boolean
  onClose: () => void
}

export function DeliverDialog({ order, open, onClose }: StopDialogProps) {
  const { ctx } = useReadySession()
  const { pending, run } = useAction()
  const [recipientName, setRecipientName] = useState('')
  const [notes, setNotes] = useState('')
  const [image, setImage] = useState<ProcessedImage | null>(null)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (open) {
      setRecipientName(order.recipient.name)
      setNotes('')
      setImage(null)
      setTouched(false)
    }
  }, [open, order.recipient.name])

  const submit = async () => {
    setTouched(true)
    if (!recipientName.trim() || !order.stopId) return
    const ok = await run(
      // Pelo painel não há localização real do aparelho; o app do motorista enviará a posição.
      () => stopsService.deliver(ctx, order.stopId!, { recipientName, notes, image, location: null }),
      `Entrega de ${order.number} registrada`,
    )
    if (ok) onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Registrar entrega"
      description={`${order.number} · ${order.recipient.name}`}
      onSubmit={submit}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Voltar
          </Button>
          <Button type="submit" variant="primary" loading={pending}>
            Registrar entrega
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Recebido por" error={touched && !recipientName.trim() ? 'Informe quem recebeu.' : undefined}>
          {(p) => <Input {...p} value={recipientName} onChange={(e) => setRecipientName(e.target.value)} autoFocus />}
        </Field>
        <Field label="Foto do comprovante" optional>
          {() => <PhotoPicker value={image} onChange={setImage} />}
        </Field>
        <Field label="Observação" optional>
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex.: entregue na portaria"
            />
          )}
        </Field>
      </div>
    </Dialog>
  )
}

export function FailDialog({ order, open, onClose }: StopDialogProps) {
  const { ctx } = useReadySession()
  const { pending, run } = useAction()
  const [type, setType] = useState<OccurrenceType>('DESTINATARIO_AUSENTE')
  const [description, setDescription] = useState('')
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (open) {
      setType('DESTINATARIO_AUSENTE')
      setDescription('')
      setTouched(false)
    }
  }, [open])

  const submit = async () => {
    setTouched(true)
    if (!description.trim() || !order.stopId) return
    const ok = await run(
      () => stopsService.fail(ctx, order.stopId!, { type, description }),
      `Não entrega de ${order.number} registrada`,
    )
    if (ok) onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Registrar não entrega"
      description={`${order.number} · ${order.recipient.name}. Uma ocorrência será aberta para tratamento.`}
      onSubmit={submit}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Voltar
          </Button>
          <Button type="submit" variant="danger" loading={pending}>
            Registrar não entrega
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Motivo">
          {(p) => (
            <Select {...p} value={type} onChange={(e) => setType(e.target.value as OccurrenceType)}>
              {DELIVERY_FAILURE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {OCCURRENCE_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="O que aconteceu" error={touched && !description.trim() ? 'Descreva a situação.' : undefined}>
          {(p) => (
            <Textarea
              {...p}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex.: três tentativas de contato por telefone sem resposta"
              autoFocus
            />
          )}
        </Field>
      </div>
    </Dialog>
  )
}

export function AttachPhotoDialog({ order, open, onClose }: StopDialogProps) {
  const { ctx } = useReadySession()
  const { pending, run } = useAction()
  const [image, setImage] = useState<ProcessedImage | null>(null)

  useEffect(() => {
    if (open) setImage(null)
  }, [open])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Anexar foto ao comprovante"
      description={`${order.number} · recebido por ${order.proof?.recipientName ?? '—'}`}
      onSubmit={async () => {
        if (!image) return
        const ok = await run(() => deliveryProofService.attachImage(ctx, order.id, image), 'Foto anexada ao comprovante')
        if (ok) onClose()
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Voltar
          </Button>
          <Button type="submit" variant="primary" loading={pending} disabled={!image}>
            Anexar foto
          </Button>
        </>
      }
    >
      <PhotoPicker value={image} onChange={setImage} />
    </Dialog>
  )
}
