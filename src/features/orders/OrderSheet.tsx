import { Camera, Check, CircleX, ExternalLink, Image, Pencil, Phone, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { OccurrenceStatusBadge, OrderStatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog, Sheet } from '@/components/ui/Dialog'
import { Field, Input } from '@/components/ui/Field'
import { DetailRow, EmptyState } from '@/components/ui/misc'
import { Plate } from '@/components/ui/Plate'
import { Skeleton } from '@/components/ui/Spinner'
import { OCCURRENCE_TYPE_LABEL, ORDER_PROGRESS_STEPS } from '@/domain/status'
import { HistoryTimeline } from '@/features/history/HistoryTimeline'
import { NewOccurrenceDialog } from '@/features/occurrences/OccurrenceDialogs'
import { ProofViewer } from '@/features/proofs/ProofViewer'
import { AttachPhotoDialog, DeliverDialog, FailDialog } from '@/features/routes/StopDialogs'
import { useAction } from '@/hooks/useAction'
import { useOperationData } from '@/hooks/useOperationData'
import { useOrderSheet } from '@/hooks/useSelectors'
import { useReadySession } from '@/hooks/useSession'
import { EDITABLE_ORDER_STATUSES, ordersService } from '@/services/ordersService'
import type { Order } from '@/types/domain'
import { cn } from '@/utils/cn'
import { addDaysISO, formatDate, formatDateTime, todayISO } from '@/utils/dates'
import { addressLine, cityLine, formatPhone, formatZip } from '@/utils/format'
import { OrderFormDialog } from './OrderFormDialog'

type DialogName = 'edit' | 'cancel' | 'reschedule' | 'deliver' | 'fail' | 'occurrence' | 'proof' | 'attach' | null

function ProgressSteps({ order }: { order: Order }) {
  const terminal = order.status === 'FAILED' || order.status === 'CANCELLED'
  const reachedIndex = terminal
    ? order.routeId || order.status === 'FAILED'
      ? 3
      : 0
    : ORDER_PROGRESS_STEPS.findIndex((s) => s.status === order.status)
  const steps = terminal
    ? [
        ...ORDER_PROGRESS_STEPS.slice(0, reachedIndex + 1),
        { status: order.status, label: order.status === 'FAILED' ? 'Não entregue' : 'Cancelado' },
      ]
    : ORDER_PROGRESS_STEPS

  return (
    <ol className="flex flex-col gap-0">
      {steps.map((step, i) => {
        const done = i < reachedIndex || (i === reachedIndex && (order.status === 'DELIVERED' || terminal))
        const current = !terminal && i === reachedIndex && order.status !== 'DELIVERED'
        const isTerminalStep = terminal && i === steps.length - 1
        const state = isTerminalStep ? 'terminal' : done ? 'done' : current ? 'current' : 'todo'
        return (
          <li key={step.label} className="flex items-stretch gap-3">
            <div className="flex w-4 flex-col items-center">
              <span
                className={cn(
                  'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full',
                  state === 'done' && 'bg-ink text-white',
                  state === 'current' && 'border-[1.5px] border-accent bg-surface ring-[3px] ring-accent/15',
                  state === 'todo' && 'border-[1.5px] border-line-strong bg-surface',
                  state === 'terminal' && (order.status === 'FAILED' ? 'bg-danger text-white' : 'bg-faint text-white'),
                )}
              >
                {state === 'done' && <Check className="size-2.5" strokeWidth={3.5} />}
                {state === 'terminal' && <CircleX className="size-3" strokeWidth={2.5} />}
                {state === 'current' && <span className="size-1.5 rounded-full bg-accent" />}
              </span>
              {i < steps.length - 1 && (
                <span className={cn('my-0.5 w-px flex-1', i < reachedIndex ? 'bg-ink/60' : 'bg-line-strong')} />
              )}
            </div>
            <p
              className={cn(
                'pb-3 text-[13px] leading-5',
                state === 'todo' ? 'text-faint' : 'text-ink',
                state === 'current' && 'font-semibold text-accent-ink',
                state === 'terminal' && order.status === 'FAILED' && 'font-semibold text-danger',
              )}
            >
              {step.label}
            </p>
          </li>
        )
      })}
    </ol>
  )
}

function Block({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('border-t border-line px-6 py-4', className)}>
      <h3 className="eyebrow mb-2">{title}</h3>
      {children}
    </section>
  )
}

function RescheduleDialog({ order, open, onClose }: { order: Order; open: boolean; onClose: () => void }) {
  const { ctx } = useReadySession()
  const { pending, run } = useAction()
  const [date, setDate] = useState(addDaysISO(todayISO(), 1))
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Reagendar entrega"
      description={`${order.number} volta para a fila de planejamento com a nova data.`}
      className="max-w-sm"
      onSubmit={async () => {
        const ok = await run(() => ordersService.reschedule(ctx, order.id, date), `${order.number} reagendado`)
        if (ok) onClose()
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Voltar
          </Button>
          <Button type="submit" variant="primary" loading={pending}>
            Reagendar
          </Button>
        </>
      }
    >
      <Field label="Nova data">
        {(p) => <Input {...p} type="date" min={todayISO()} value={date} onChange={(e) => setDate(e.target.value)} />}
      </Field>
    </Dialog>
  )
}

export function OrderSheet() {
  const { orderId, close } = useOrderSheet()
  const { orders, routes, drivers, vehicles, occurrences } = useOperationData()
  const { ctx } = useReadySession()
  const [dialog, setDialog] = useState<DialogName>(null)
  const cancel = useAction()

  const order = orderId ? orders.byId.get(orderId) : undefined
  const route = order?.routeId ? routes.byId.get(order.routeId) : undefined
  const driver = order?.driverId ? drivers.byId.get(order.driverId) : undefined
  const vehicle = order?.vehicleId ? vehicles.byId.get(order.vehicleId) : undefined
  const orderOccurrences = order ? occurrences.items.filter((o) => o.orderId === order.id) : []
  const canEdit = order && (EDITABLE_ORDER_STATUSES as readonly string[]).includes(order.status)
  const inRoute = order?.status === 'IN_TRANSIT' && route?.status === 'IN_PROGRESS' && order.stopId

  const closeDialog = () => setDialog(null)

  return (
    <Sheet
      open={Boolean(orderId)}
      onClose={close}
      title={
        order ? (
          <div>
            <div className="flex items-center gap-2">
              <span className="tnum font-mono text-xs font-medium text-muted">{order.number}</span>
              <OrderStatusBadge status={order.status} />
            </div>
            <h2 className="mt-1.5 font-display text-xl font-semibold tracking-[-0.02em]">{order.recipient.name}</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              {addressLine(order.address)} · {cityLine(order.address)}
            </p>
          </div>
        ) : (
          <Skeleton className="h-12 w-60" />
        )
      }
      footer={
        order && (
          <>
            {inRoute && (
              <>
                <Button variant="primary" icon={<Check className="size-4" />} onClick={() => setDialog('deliver')}>
                  Registrar entrega
                </Button>
                <Button icon={<CircleX className="size-4" />} onClick={() => setDialog('fail')}>
                  Não entregue
                </Button>
              </>
            )}
            {order.status === 'FAILED' && (
              <Button variant="primary" onClick={() => setDialog('reschedule')}>
                Reagendar
              </Button>
            )}
            {canEdit && (
              <Button icon={<Pencil className="size-3.5" />} onClick={() => setDialog('edit')}>
                Editar
              </Button>
            )}
            <Button variant="ghost" icon={<TriangleAlert className="size-3.5" />} onClick={() => setDialog('occurrence')}>
              Ocorrência
            </Button>
            {(order.status === 'CREATED' || order.status === 'FAILED') && (
              <Button variant="quiet-danger" onClick={() => setDialog('cancel')} className="ml-auto">
                Cancelar pedido
              </Button>
            )}
          </>
        )
      }
    >
      {orderId && !order && !orders.loading && (
        <EmptyState title="Pedido não encontrado" description="Ele pode ter sido concluído há mais de 30 dias ou pertence a outra organização." />
      )}
      {order && (
        <>
          <div className="grid gap-6 px-6 py-5 sm:grid-cols-[1fr_180px]">
            <div>
              <h3 className="eyebrow mb-3">Andamento</h3>
              <ProgressSteps order={order} />
            </div>
            <dl className="space-y-3 text-[13px]">
              <div>
                <dt className="text-xs text-muted">Previsto para</dt>
                <dd className="mt-0.5 font-medium">
                  {formatDate(order.scheduledDate)}
                  {order.timeWindow && (
                    <span className="tnum block font-mono text-xs font-normal text-ink-2">
                      {order.timeWindow.start}–{order.timeWindow.end}
                    </span>
                  )}
                </dd>
              </div>
              {order.attempts > 0 && (
                <div>
                  <dt className="text-xs text-muted">Tentativas sem sucesso</dt>
                  <dd className="tnum mt-0.5 font-medium">{order.attempts}</dd>
                </div>
              )}
              {order.reference && (
                <div>
                  <dt className="text-xs text-muted">Referência</dt>
                  <dd className="mt-0.5 font-mono text-xs">{order.reference}</dd>
                </div>
              )}
            </dl>
          </div>

          {order.proof && (
            <Block title="Comprovante">
              <div className="flex items-center gap-3 rounded-lg bg-success-soft/60 px-3 py-2.5">
                <div className="min-w-0 flex-1 text-[13px]">
                  <p className="font-medium text-ink">Recebido por {order.proof.recipientName}</p>
                  <p className="text-xs text-ink-2">{formatDateTime(order.proof.deliveredAt)}</p>
                </div>
                {order.proof.hasImage ? (
                  <Button size="sm" icon={<Image className="size-3.5" />} onClick={() => setDialog('proof')}>
                    Ver comprovante
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setDialog('proof')}>
                      Detalhes
                    </Button>
                    <Button size="sm" icon={<Camera className="size-3.5" />} onClick={() => setDialog('attach')}>
                      Anexar foto
                    </Button>
                  </>
                )}
              </div>
            </Block>
          )}

          <Block title="Rota">
            {route ? (
              <dl>
                <DetailRow label="Rota">
                  <Link to={`/rotas/${route.id}`} className="inline-flex items-center gap-1 font-medium text-accent-ink hover:underline">
                    {route.code}
                    <ExternalLink className="size-3" />
                  </Link>
                  {order.routeSequence && <span className="text-muted"> · parada {order.routeSequence} de {route.stopCount}</span>}
                </DetailRow>
                <DetailRow label="Motorista">{driver?.name ?? <span className="text-faint">Não atribuído</span>}</DetailRow>
                <DetailRow label="Veículo">
                  {vehicle ? (
                    <span className="inline-flex items-center gap-2">
                      <Plate plate={vehicle.plate} />
                      <span className="text-muted">{vehicle.model}</span>
                    </span>
                  ) : (
                    <span className="text-faint">Não atribuído</span>
                  )}
                </DetailRow>
              </dl>
            ) : (
              <p className="text-[13px] text-muted">
                {order.status === 'CREATED' ? (
                  <>
                    Aguardando planejamento.{' '}
                    <Link to="/planejamento" className="font-medium text-accent-ink hover:underline">
                      Abrir planejamento
                    </Link>
                  </>
                ) : (
                  'Sem rota vinculada.'
                )}
              </p>
            )}
          </Block>

          <Block title="Destinatário e endereço">
            <dl>
              <DetailRow label="Telefone">
                <a href={`tel:${order.recipient.phone}`} className="tnum inline-flex items-center gap-1.5 hover:text-accent-ink">
                  <Phone className="size-3 text-muted" />
                  {formatPhone(order.recipient.phone)}
                </a>
              </DetailRow>
              <DetailRow label="Endereço">
                {addressLine(order.address)}
                <br />
                <span className="text-ink-2">
                  {cityLine(order.address)} · <span className="tnum">{formatZip(order.address.zipCode)}</span>
                </span>
              </DetailRow>
              <DetailRow label="Mapa">
                {order.location ? (
                  <span className="tnum font-mono text-xs">
                    {order.location.lat.toFixed(5)}, {order.location.lng.toFixed(5)}
                  </span>
                ) : (
                  <span className="text-faint">Sem ponto marcado</span>
                )}
              </DetailRow>
              {order.deliveryNotes && <DetailRow label="Instruções">{order.deliveryNotes}</DetailRow>}
              {order.notes && <DetailRow label="Obs. interna">{order.notes}</DetailRow>}
            </dl>
          </Block>

          {orderOccurrences.length > 0 && (
            <Block title="Ocorrências">
              <ul className="space-y-2">
                {orderOccurrences.map((o) => (
                  <li key={o.id} className="rounded-lg border border-line px-3 py-2.5 text-[13px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{OCCURRENCE_TYPE_LABEL[o.type]}</span>
                      <OccurrenceStatusBadge status={o.status} />
                    </div>
                    <p className="mt-1 text-ink-2">{o.description}</p>
                    <p className="mt-1 text-xs text-faint">
                      {formatDateTime(o.createdAt)} · {o.createdBy.name}
                    </p>
                    {o.resolution && <p className="mt-1.5 border-t border-line pt-1.5 text-xs text-ink-2">Tratativa: {o.resolution}</p>}
                  </li>
                ))}
              </ul>
            </Block>
          )}

          <Block title="Histórico" className="pb-6">
            <HistoryTimeline scope={{ orderId: order.id }} />
          </Block>

          <OrderFormDialog open={dialog === 'edit'} onClose={closeDialog} order={order} />
          <DeliverDialog open={dialog === 'deliver'} onClose={closeDialog} order={order} />
          <FailDialog open={dialog === 'fail'} onClose={closeDialog} order={order} />
          <AttachPhotoDialog open={dialog === 'attach'} onClose={closeDialog} order={order} />
          <RescheduleDialog open={dialog === 'reschedule'} onClose={closeDialog} order={order} />
          {order.proof && <ProofViewer open={dialog === 'proof'} onClose={closeDialog} order={order} />}
          <NewOccurrenceDialog
            open={dialog === 'occurrence'}
            onClose={closeDialog}
            orderId={order.id}
            routeId={order.routeId}
            driverId={order.driverId}
            subtitle={`${order.number} · ${order.recipient.name}`}
          />
          <ConfirmDialog
            open={dialog === 'cancel'}
            onClose={closeDialog}
            title={`Cancelar ${order.number}?`}
            description="O pedido sai da operação e não poderá ser reaberto."
            confirmLabel="Cancelar pedido"
            tone="danger"
            reasonLabel="Motivo do cancelamento"
            pending={cancel.pending}
            onConfirm={async (reason) => {
              const ok = await cancel.run(() => ordersService.cancel(ctx, order.id, reason), `${order.number} cancelado`)
              if (ok) closeDialog()
            }}
          />
        </>
      )}
      {orderId && !order && orders.loading && (
        <div className="space-y-3 p-6">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
    </Sheet>
  )
}
