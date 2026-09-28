import { useState, type ReactNode } from 'react'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { Field, Textarea } from './Field'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  confirmLabel: string
  tone?: 'primary' | 'danger'
  /** Pede um motivo obrigatório (vai para o histórico). */
  reasonLabel?: string
  pending?: boolean
  onConfirm: (reason: string) => void
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  reasonLabel,
  pending,
  onConfirm,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const missing = Boolean(reasonLabel) && !reason.trim()

  const close = () => {
    setReason('')
    setTouched(false)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      className="max-w-md"
      onSubmit={() => {
        setTouched(true)
        if (!missing) onConfirm(reason.trim())
      }}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Voltar
          </Button>
          <Button type="submit" variant={tone} loading={pending}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description && <div className="text-[13px] leading-relaxed text-ink-2">{description}</div>}
      {reasonLabel && (
        <Field label={reasonLabel} error={touched && missing ? 'Obrigatório. Fica registrado no histórico.' : undefined} className="mt-4">
          {(p) => <Textarea {...p} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />}
        </Field>
      )}
    </Dialog>
  )
}
