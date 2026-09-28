import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input } from '@/components/ui/Field'
import { ROLE_LABEL } from '@/domain/status'
import { useAction } from '@/hooks/useAction'
import { useReadySession } from '@/hooks/useSession'
import { usersService } from '@/services/usersService'
import { formatPhone } from '@/utils/format'

export function ProfileDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ctx, profile, organization } = useReadySession()
  const { pending, run } = useAction()
  const [name, setName] = useState(profile.name)
  const [phone, setPhone] = useState(formatPhone(profile.phone))

  useEffect(() => {
    if (open) {
      setName(profile.name)
      setPhone(formatPhone(profile.phone))
    }
  }, [open, profile.name, profile.phone])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Meu perfil"
      description={`${ROLE_LABEL[profile.role]} · ${organization?.name ?? ''}`}
      className="max-w-md"
      onSubmit={async () => {
        const ok = await run(() => usersService.updateOwnProfile(ctx, { name, phone }), 'Perfil atualizado')
        if (ok) onClose()
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={pending}>
            Salvar perfil
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Telefone" optional>
          {(p) => <Input {...p} inputMode="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} />}
        </Field>
        <Field label="E-mail" hint="O e-mail de acesso só pode ser alterado pelo administrador.">
          {(p) => <Input {...p} value={profile.email} disabled />}
        </Field>
      </div>
    </Dialog>
  )
}
