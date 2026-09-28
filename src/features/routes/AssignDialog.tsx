import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Select } from '@/components/ui/Field'
import { useAction } from '@/hooks/useAction'
import { useOperationData } from '@/hooks/useOperationData'
import { useActiveAssignments } from '@/hooks/useSelectors'
import { useReadySession } from '@/hooks/useSession'
import { routesService } from '@/services/routesService'
import type { Route } from '@/types/domain'

export function AssignDialog({ route, open, onClose }: { route: Route; open: boolean; onClose: () => void }) {
  const { ctx } = useReadySession()
  const { drivers, vehicles } = useOperationData()
  const { byDriver, byVehicle } = useActiveAssignments()
  const { pending, run } = useAction()
  const [driverId, setDriverId] = useState('')
  const [vehicleId, setVehicleId] = useState('')

  useEffect(() => {
    if (open) {
      setDriverId(route.driverId ?? '')
      setVehicleId(route.vehicleId ?? '')
    }
  }, [open, route.driverId, route.vehicleId])

  const busyElsewhere = (r: Route | undefined) => Boolean(r && r.id !== route.id)
  const isChange = route.status === 'ASSIGNED'

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isChange ? `Trocar motorista ou veículo · ${route.code}` : `Atribuir rota ${route.code}`}
      description="Só aparecem liberados os motoristas e veículos ativos que não estão em outra rota."
      className="max-w-md"
      onSubmit={async () => {
        if (!driverId || !vehicleId) return
        const ok = await run(
          () => routesService.assign(ctx, route.id, driverId, vehicleId),
          isChange ? 'Atribuição atualizada' : `Rota ${route.code} atribuída`,
        )
        if (ok) onClose()
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Voltar
          </Button>
          <Button type="submit" variant="primary" loading={pending} disabled={!driverId || !vehicleId}>
            {isChange ? 'Salvar atribuição' : 'Atribuir rota'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Motorista">
          {(p) => (
            <Select {...p} value={driverId} onChange={(e) => setDriverId(e.target.value)}>
              <option value="">Selecione</option>
              {drivers.items
                .filter((d) => d.status === 'ACTIVE')
                .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
                .map((d) => {
                  const busy = byDriver.get(d.id)
                  return (
                    <option key={d.id} value={d.id} disabled={busyElsewhere(busy)}>
                      {d.name}
                      {busyElsewhere(busy) ? ` — na rota ${busy!.code}` : ''}
                    </option>
                  )
                })}
            </Select>
          )}
        </Field>
        <Field label="Veículo">
          {(p) => (
            <Select {...p} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              <option value="">Selecione</option>
              {vehicles.items
                .filter((v) => v.status === 'ACTIVE')
                .sort((a, b) => a.plate.localeCompare(b.plate))
                .map((v) => {
                  const busy = byVehicle.get(v.id)
                  return (
                    <option key={v.id} value={v.id} disabled={busyElsewhere(busy)}>
                      {v.plate} · {v.model}
                      {busyElsewhere(busy) ? ` — na rota ${busy!.code}` : ''}
                    </option>
                  )
                })}
            </Select>
          )}
        </Field>
      </div>
    </Dialog>
  )
}
