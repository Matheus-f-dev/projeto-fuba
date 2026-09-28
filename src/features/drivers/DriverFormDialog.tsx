import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Select } from '@/components/ui/Field'
import { useAction } from '@/hooks/useAction'
import { useReadySession } from '@/hooks/useSession'
import { driversService, validateDriverInput, type DriverInput } from '@/services/driversService'
import type { Driver } from '@/types/domain'
import { formatPhone } from '@/utils/format'

const empty: DriverInput = { name: '', phone: '', document: '', license: '', licenseCategory: 'B' }

export function DriverFormDialog({ open, onClose, driver }: { open: boolean; onClose: () => void; driver?: Driver }) {
  const { ctx } = useReadySession()
  const { pending, run } = useAction()
  const [form, setForm] = useState<DriverInput>(empty)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!open) return
    setSubmitted(false)
    setForm(
      driver
        ? { name: driver.name, phone: formatPhone(driver.phone), document: driver.document, license: driver.license, licenseCategory: driver.licenseCategory || 'B' }
        : empty,
    )
  }, [open, driver])

  const errors = useMemo(() => (submitted ? validateDriverInput(form) : {}), [form, submitted])
  const set = (key: keyof DriverInput, value: string) => setForm((f) => ({ ...f, [key]: value }))

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={driver ? `Editar ${driver.name}` : 'Novo motorista'}
      className="max-w-md"
      onSubmit={async () => {
        setSubmitted(true)
        if (Object.keys(validateDriverInput(form)).length) return
        const ok = await run(
          () => (driver ? driversService.update(ctx, driver.id, form) : driversService.create(ctx, form)),
          driver ? 'Motorista atualizado' : 'Motorista cadastrado',
        )
        if (ok) onClose()
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={pending}>
            {driver ? 'Salvar alterações' : 'Cadastrar motorista'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Nome completo" error={errors.name} className="col-span-2">
          {(p) => <Input {...p} value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />}
        </Field>
        <Field label="Telefone" error={errors.phone} className="col-span-2 sm:col-span-1">
          {(p) => <Input {...p} inputMode="tel" value={form.phone} onChange={(e) => set('phone', formatPhone(e.target.value))} placeholder="(31) 99999-0000" />}
        </Field>
        <Field label="CPF" optional error={errors.document} className="col-span-2 sm:col-span-1">
          {(p) => <Input {...p} inputMode="numeric" value={form.document} onChange={(e) => set('document', e.target.value.replace(/\D/g, '').slice(0, 11))} />}
        </Field>
        <Field label="CNH" optional error={errors.license}>
          {(p) => <Input {...p} inputMode="numeric" value={form.license} onChange={(e) => set('license', e.target.value.replace(/\D/g, '').slice(0, 11))} />}
        </Field>
        <Field label="Categoria">
          {(p) => (
            <Select {...p} value={form.licenseCategory} onChange={(e) => set('licenseCategory', e.target.value)}>
              {['A', 'B', 'AB', 'C', 'D', 'E'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Dialog>
  )
}
