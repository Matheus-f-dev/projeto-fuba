import { MapPin, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { MapView } from '@/components/map/MapView'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { useAction } from '@/hooks/useAction'
import { useReadySession } from '@/hooks/useSession'
import { ordersService, validateOrderInput, type OrderInput } from '@/services/ordersService'
import type { Order } from '@/types/domain'
import { todayISO } from '@/utils/dates'
import { formatPhone, formatZip } from '@/utils/format'

const empty = (): OrderInput => ({
  reference: '',
  notes: '',
  recipient: { name: '', phone: '' },
  address: { zipCode: '', street: '', number: '', complement: '', district: '', city: '', state: 'MG' },
  location: null,
  scheduledDate: todayISO(),
  timeWindow: null,
  deliveryNotes: '',
})

const fromOrder = (o: Order): OrderInput => ({
  reference: o.reference,
  notes: o.notes,
  recipient: { name: o.recipient.name, phone: formatPhone(o.recipient.phone) },
  address: { ...o.address, zipCode: formatZip(o.address.zipCode) },
  location: o.location,
  scheduledDate: o.scheduledDate,
  timeWindow: o.timeWindow,
  deliveryNotes: o.deliveryNotes,
})

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-line pt-4 first:border-t-0 first:pt-0">
      <legend className="eyebrow mb-3 float-left w-full">{title}</legend>
      <div className="clear-both grid grid-cols-6 gap-x-3 gap-y-3.5">{children}</div>
    </fieldset>
  )
}

export function OrderFormDialog({
  open,
  onClose,
  order,
}: {
  open: boolean
  onClose: () => void
  /** Ausente = novo pedido. */
  order?: Order
}) {
  const { ctx } = useReadySession()
  const navigate = useNavigate()
  const { pending, run } = useAction()
  const [form, setForm] = useState<OrderInput>(empty)
  const [submitted, setSubmitted] = useState(false)
  const [showMap, setShowMap] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(order ? fromOrder(order) : empty())
    setSubmitted(false)
    setShowMap(false)
  }, [open, order])

  const errors = useMemo(() => (submitted ? validateOrderInput(form) : {}), [form, submitted])

  const set = <K extends keyof OrderInput>(key: K, value: OrderInput[K]) => setForm((f) => ({ ...f, [key]: value }))
  const setRecipient = (key: keyof OrderInput['recipient'], value: string) =>
    setForm((f) => ({ ...f, recipient: { ...f.recipient, [key]: value } }))
  const setAddress = (key: keyof OrderInput['address'], value: string) =>
    setForm((f) => ({ ...f, address: { ...f.address, [key]: value } }))

  const submit = async () => {
    setSubmitted(true)
    if (Object.keys(validateOrderInput(form)).length > 0) return
    if (order) {
      const ok = await run(() => ordersService.update(ctx, order.id, form), `Pedido ${order.number} atualizado`)
      if (ok) onClose()
    } else {
      await run(async () => {
        const { id, number } = await ordersService.create(ctx, form)
        onClose()
        navigate(`/pedidos?pedido=${id}`)
        toast.success(`Pedido ${number} criado`, { description: 'Já está disponível no planejamento.' })
      })
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={order ? `Editar ${order.number}` : 'Novo pedido'}
      description={order ? undefined : 'O número do pedido é gerado ao salvar.'}
      className="max-w-2xl"
      onSubmit={submit}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={pending}>
            {order ? 'Salvar alterações' : 'Criar pedido'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Section title="Identificação">
          <Field label="Referência do cliente" optional hint="Código no sistema de origem, nota fiscal etc." className="col-span-6 sm:col-span-3">
            {(p) => <Input {...p} value={form.reference} onChange={(e) => set('reference', e.target.value)} placeholder="NF 18422" />}
          </Field>
          <Field label="Observação interna" optional className="col-span-6 sm:col-span-3">
            {(p) => <Input {...p} value={form.notes} onChange={(e) => set('notes', e.target.value)} />}
          </Field>
        </Section>

        <Section title="Destinatário">
          <Field label="Nome" error={errors['recipient.name']} className="col-span-6 sm:col-span-4">
            {(p) => <Input {...p} value={form.recipient.name} onChange={(e) => setRecipient('name', e.target.value)} autoFocus={!order} />}
          </Field>
          <Field label="Telefone" error={errors['recipient.phone']} className="col-span-6 sm:col-span-2">
            {(p) => (
              <Input
                {...p}
                inputMode="tel"
                value={form.recipient.phone}
                onChange={(e) => setRecipient('phone', formatPhone(e.target.value))}
                placeholder="(31) 99999-0000"
              />
            )}
          </Field>
        </Section>

        <Section title="Endereço">
          <Field label="CEP" error={errors['address.zipCode']} className="col-span-3 sm:col-span-2">
            {(p) => (
              <Input {...p} inputMode="numeric" value={form.address.zipCode} onChange={(e) => setAddress('zipCode', formatZip(e.target.value))} placeholder="30130-000" />
            )}
          </Field>
          <div className="hidden sm:col-span-4 sm:block" />
          <Field label="Logradouro" error={errors['address.street']} className="col-span-6 sm:col-span-3">
            {(p) => <Input {...p} value={form.address.street} onChange={(e) => setAddress('street', e.target.value)} placeholder="Rua, avenida…" />}
          </Field>
          <Field label="Número" error={errors['address.number']} className="col-span-2 sm:col-span-1">
            {(p) => <Input {...p} value={form.address.number} onChange={(e) => setAddress('number', e.target.value)} />}
          </Field>
          <Field label="Complemento" optional className="col-span-4 sm:col-span-2">
            {(p) => <Input {...p} value={form.address.complement} onChange={(e) => setAddress('complement', e.target.value)} />}
          </Field>
          <Field label="Bairro" error={errors['address.district']} className="col-span-6 sm:col-span-2">
            {(p) => <Input {...p} value={form.address.district} onChange={(e) => setAddress('district', e.target.value)} />}
          </Field>
          <Field label="Cidade" error={errors['address.city']} className="col-span-4 sm:col-span-3">
            {(p) => <Input {...p} value={form.address.city} onChange={(e) => setAddress('city', e.target.value)} />}
          </Field>
          <Field label="UF" error={errors['address.state']} className="col-span-2 sm:col-span-1">
            {(p) => (
              <Input {...p} maxLength={2} value={form.address.state} onChange={(e) => setAddress('state', e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} />
            )}
          </Field>
          <div className="col-span-6">
            {form.location ? (
              <div className="flex items-center gap-2 text-[13px]">
                <MapPin className="size-4 text-accent" />
                <span className="tnum font-mono text-xs text-ink-2">
                  {form.location.lat.toFixed(5)}, {form.location.lng.toFixed(5)}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setShowMap((s) => !s)}>
                  {showMap ? 'Fechar mapa' : 'Ajustar no mapa'}
                </Button>
                <Button size="sm" variant="ghost" icon={<X className="size-3.5" />} onClick={() => set('location', null)}>
                  Remover
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" icon={<MapPin className="size-3.5" />} onClick={() => setShowMap((s) => !s)} className="-ml-2.5">
                {showMap ? 'Fechar mapa' : 'Marcar local no mapa'}
              </Button>
            )}
            {!form.location && !showMap && (
              <p className="mt-0.5 text-xs text-muted">Sem o ponto no mapa, o pedido não aparece no mapa do planejamento.</p>
            )}
            {showMap && (
              <div className="mt-2">
                <MapView
                  className="h-56 rounded-lg border border-line"
                  markers={form.location ? [{ id: 'pin', position: form.location, variant: 'order-selected', label: '•' }] : []}
                  fitKey={form.location ? 'has' : 'none'}
                  onMapClick={(point) => set('location', point)}
                />
                <p className="mt-1 text-xs text-muted">Clique no mapa para marcar o ponto de entrega.</p>
              </div>
            )}
          </div>
        </Section>

        <Section title="Entrega">
          <Field label="Data prevista" error={errors.scheduledDate} className="col-span-6 sm:col-span-2">
            {(p) => <Input {...p} type="date" value={form.scheduledDate} onChange={(e) => set('scheduledDate', e.target.value)} />}
          </Field>
          <Field label="Janela de horário" optional error={errors.timeWindow} className="col-span-6 sm:col-span-4">
            {(p) => (
              <div className="flex items-center gap-2">
                <Input
                  {...p}
                  type="time"
                  value={form.timeWindow?.start ?? ''}
                  onChange={(e) =>
                    set('timeWindow', e.target.value || form.timeWindow?.end ? { start: e.target.value, end: form.timeWindow?.end ?? '' } : null)
                  }
                  aria-label="Início da janela"
                />
                <span className="text-muted">até</span>
                <Input
                  type="time"
                  value={form.timeWindow?.end ?? ''}
                  onChange={(e) =>
                    set('timeWindow', e.target.value || form.timeWindow?.start ? { start: form.timeWindow?.start ?? '', end: e.target.value } : null)
                  }
                  aria-label="Fim da janela"
                  aria-invalid={p['aria-invalid']}
                />
              </div>
            )}
          </Field>
          <Field label="Instruções para o motorista" optional className="col-span-6">
            {(p) => (
              <Textarea
                {...p}
                rows={2}
                value={form.deliveryNotes}
                onChange={(e) => set('deliveryNotes', e.target.value)}
                placeholder="Ex.: entregar na portaria, falar com a recepção"
              />
            )}
          </Field>
        </Section>
      </div>
    </Dialog>
  )
}
