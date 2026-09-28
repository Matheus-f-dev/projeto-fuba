import { ImageOff, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog } from '@/components/ui/Dialog'
import { DetailRow } from '@/components/ui/misc'
import { Skeleton } from '@/components/ui/Spinner'
import { useAction } from '@/hooks/useAction'
import { useReadySession } from '@/hooks/useSession'
import { toUserMessage } from '@/services/context'
import { deliveryProofService } from '@/services/deliveryProofService'
import type { DeliveryProof, Order } from '@/types/domain'
import { formatDateTime } from '@/utils/dates'

/** Carrega o comprovante (com a imagem) somente quando é aberto. */
export function ProofViewer({ order, open, onClose }: { order: Order; open: boolean; onClose: () => void }) {
  const { ctx } = useReadySession()
  const [proof, setProof] = useState<DeliveryProof | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const remove = useAction()
  const proofId = order.proof?.id
  const hasImage = order.proof?.hasImage

  useEffect(() => {
    if (!open || !proofId) return
    let active = true
    setProof(null)
    setError(null)
    deliveryProofService
      .get(ctx, proofId)
      .then((p) => active && setProof(p))
      .catch((e) => active && setError(toUserMessage(e)))
    return () => {
      active = false
    }
  }, [open, proofId, hasImage, ctx])

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        title="Comprovante de entrega"
        description={`${order.number} · ${order.recipient.name}`}
        className="max-w-xl"
        footer={
          <>
            {ctx.role === 'ADMIN' && proof?.imageData && (
              <Button variant="quiet-danger" icon={<Trash2 className="size-4" />} onClick={() => setConfirmRemove(true)} className="mr-auto">
                Remover foto
              </Button>
            )}
            <Button onClick={onClose}>Fechar</Button>
          </>
        }
      >
        {error ? (
          <p className="text-[13px] text-danger">{error}</p>
        ) : !proof ? (
          <Skeleton className="aspect-[4/3] w-full" />
        ) : (
          <>
            {proof.imageData ? (
              <img
                src={proof.imageData}
                alt={`Foto do comprovante de ${order.number}`}
                className="max-h-[55vh] w-full rounded-lg bg-sunken object-contain"
              />
            ) : (
              <div className="flex aspect-[5/2] flex-col items-center justify-center gap-2 rounded-lg bg-sunken text-[13px] text-muted">
                <ImageOff className="size-5 text-faint" />
                Entrega registrada sem foto
              </div>
            )}
            <dl className="mt-4">
              <DetailRow label="Recebido por">{proof.recipientName}</DetailRow>
              <DetailRow label="Data">{formatDateTime(proof.createdAt)}</DetailRow>
              <DetailRow label="Registrado por">{proof.createdBy.name}</DetailRow>
              {proof.notes && <DetailRow label="Observação">{proof.notes}</DetailRow>}
              {proof.latitude != null && proof.longitude != null && (
                <DetailRow label="Localização">
                  <span className="tnum font-mono text-xs">
                    {proof.latitude.toFixed(5)}, {proof.longitude.toFixed(5)}
                  </span>
                </DetailRow>
              )}
            </dl>
          </>
        )}
      </Dialog>
      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title="Remover foto do comprovante?"
        description="O registro da entrega e o nome do recebedor continuam no histórico. Só a imagem é apagada."
        confirmLabel="Remover foto"
        tone="danger"
        reasonLabel="Motivo da remoção"
        pending={remove.pending}
        onConfirm={async (reason) => {
          const ok = await remove.run(() => deliveryProofService.deleteImage(ctx, order.id, reason), 'Foto removida')
          if (ok) setConfirmRemove(false)
        }}
      />
    </>
  )
}
