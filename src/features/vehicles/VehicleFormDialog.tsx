import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Select } from '@/components/ui/Field'
import { VEHICLE_TYPE_LABEL } from '@/domain/status'
import { useAction } from '@/hooks/useAction'
import { useOperationData } from '@/hooks/useOperationData'
import { useReadySession } from '@/hooks/useSession'
import { validateVehicleInput, vehiclesService, type VehicleInput } from '@/services/vehiclesService'
import type { Vehicle, VehicleType } from '@/types/domain'
import { normalizePlate } from '@/utils/format'

const empty: VehicleInput = { plate: '', model: '', type: 'UTILITARIO', capacityKg: null, capacityVolumes: null }

const toNumber = (v: string) => (v.trim() === '' ? null : Number(v))

export function VehicleFormDialog({ open, onClose, vehicle }: { open: boolean; onClose: () => void; vehicle?: Vehicle }) {
  const { ctx } = useReadySession()
  const { vehicles } = useOperationData()
  const { pending, run } = useAction()
  const [form, setForm] = useState<VehicleInput>(empty)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!open) return
    setSubmitted(false)
    setForm(
      vehicle
        ? { plate: vehicle.plate, model: vehicle.model, type: vehicle.type, capacityKg: vehicle.capacityKg, capacityVolumes: vehicle.capacityVolumes }
        : empty,
    )
  }, [open, vehicle])

  const otherPlates = useMemo(
    () => vehicles.items.filter((v) => v.id !== vehicle?.id).map((v) => v.plate),
    [vehicles.items, vehicle?.id],
  )
  const errors = useMemo(() => (submitted ? validateVehicleInput(form, otherPlates) : {}), [form, submitted, otherPlates])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={vehicle ? `Editar ${vehicle.plate}` : 'Novo veículo'}
      className="max-w-md"
      onSubmit={async () => {
        setSubmitted(true)
        if (Object.keys(validateVehicleInput(form, otherPlates)).length) return
        const ok = await run(
          () => (vehicle ? vehiclesService.update(ctx, vehicle.id, form, otherPlates) : vehiclesService.create(ctx, form, otherPlates)),
          vehicle ? 'Veículo atualizado' : 'Veículo cadastrado',
        )
        if (ok) onClose()
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={pending}>
            {vehicle ? 'Salvar alterações' : 'Cadastrar veículo'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Placa" error={errors.plate}>
          {(p) => (
            <Input
              {...p}
              value={form.plate}
              onChange={(e) => setForm((f) => ({ ...f, plate: normalizePlate(e.target.value) }))}
              placeholder="ABC1D23"
              className="font-mono tracking-[0.08em] uppercase"
              autoFocus
            />
          )}
        </Field>
        <Field label="Tipo">
          {(p) => (
            <Select {...p} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as VehicleType }))}>
              {(Object.keys(VEHICLE_TYPE_LABEL) as VehicleType[]).map((t) => (
                <option key={t} value={t}>
                  {VEHICLE_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Modelo" error={errors.model} className="col-span-2">
          {(p) => <Input {...p} value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} placeholder="Fiat Fiorino" />}
        </Field>
        <Field label="Capacidade (kg)" optional error={errors.capacityKg}>
          {(p) => (
            <Input {...p} type="number" min={1} value={form.capacityKg ?? ''} onChange={(e) => setForm((f) => ({ ...f, capacityKg: toNumber(e.target.value) }))} />
          )}
        </Field>
        <Field label="Volumes" optional error={errors.capacityVolumes}>
          {(p) => (
            <Input
              {...p}
              type="number"
              min={1}
              value={form.capacityVolumes ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, capacityVolumes: toNumber(e.target.value) }))}
            />
          )}
        </Field>
      </div>
    </Dialog>
  )
}
