import { Plus, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Page } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Select } from '@/components/ui/Field'
import { Avatar, EmptyState, PageHeader } from '@/components/ui/misc'
import { SkeletonRows } from '@/components/ui/Spinner'
import { ROLE_LABEL } from '@/domain/status'
import { useAction } from '@/hooks/useAction'
import { useReadySession } from '@/hooks/useSession'
import { usersService, type NewUserInput } from '@/services/usersService'
import type { AppUser, UserRole } from '@/types/domain'
import { formatPhone } from '@/utils/format'

const ROLES: UserRole[] = ['ADMIN', 'OPERATOR', 'DRIVER']
const ROLE_HINT: Record<UserRole, string> = {
  ADMIN: 'Acesso total, incluindo usuários e organização.',
  OPERATOR: 'Opera pedidos, rotas, motoristas e veículos.',
  DRIVER: 'Acesso ao app do motorista (em breve). Não entra no painel.',
}

function NewUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ctx } = useReadySession()
  const { pending, run } = useAction()
  const [form, setForm] = useState<NewUserInput>({ name: '', email: '', phone: '', role: 'OPERATOR', password: '' })

  useEffect(() => {
    if (open) setForm({ name: '', email: '', phone: '', role: 'OPERATOR', password: '' })
  }, [open])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Novo usuário"
      description="Compartilhe a senha inicial com a pessoa por um canal seguro."
      className="max-w-md"
      onSubmit={async () => {
        const ok = await run(() => usersService.create(ctx, form), `Acesso criado para ${form.email}`)
        if (ok) onClose()
      }}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={pending}>
            Criar acesso
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome completo">{(p) => <Input {...p} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />}</Field>
        <Field label="E-mail">
          {(p) => <Input {...p} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
        </Field>
        <Field label="Telefone" optional>
          {(p) => <Input {...p} inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })} />}
        </Field>
        <Field label="Perfil" hint={ROLE_HINT[form.role]}>
          {(p) => (
            <Select {...p} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Senha inicial" hint="Mínimo de 8 caracteres.">
          {(p) => <Input {...p} type="text" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
        </Field>
      </div>
    </Dialog>
  )
}

export function UsersPage() {
  const { ctx, profile } = useReadySession()
  const [users, setUsers] = useState<AppUser[] | null>(null)
  const [creating, setCreating] = useState(false)
  const update = useAction()

  useEffect(() => usersService.subscribeOrgUsers(ctx.organizationId, setUsers, () => setUsers([])), [ctx.organizationId])

  if (profile.role !== 'ADMIN')
    return (
      <Page>
        <EmptyState title="Área do administrador" description="Somente administradores gerenciam usuários." />
      </Page>
    )

  return (
    <Page>
      <PageHeader
        title="Usuários"
        description="Quem acessa o painel da sua organização."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Novo usuário
          </Button>
        }
      />
      <div className="panel overflow-hidden">
        {!users ? (
          <SkeletonRows rows={4} />
        ) : users.length === 0 ? (
          <EmptyState icon={<Users />} title="Nenhum usuário" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-medium">Usuário</th>
                  <th className="px-4 py-2.5 font-medium">Perfil</th>
                  <th className="px-4 py-2.5 font-medium">Situação</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {users
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
                  .map((u) => {
                    const isMe = u.id === ctx.actor.uid
                    return (
                      <tr key={u.id} className="table-row">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <Avatar name={u.name} />
                            <div>
                              <p className="font-semibold">
                                {u.name} {isMe && <span className="text-xs font-normal text-muted">(você)</span>}
                              </p>
                              <p className="text-xs text-muted">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <Select
                            value={u.role}
                            disabled={isMe || update.pending}
                            onChange={(e) =>
                              update.run(() => usersService.update(ctx, u.id, { role: e.target.value as UserRole }), 'Perfil alterado')
                            }
                            aria-label={`Perfil de ${u.name}`}
                            className="w-40"
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge tone={u.status === 'ACTIVE' ? 'success' : 'neutral'}>{u.status === 'ACTIVE' ? 'Ativo' : 'Sem acesso'}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {!isMe && (
                            <Button
                              size="sm"
                              variant={u.status === 'ACTIVE' ? 'quiet-danger' : 'ghost'}
                              disabled={update.pending}
                              onClick={() =>
                                update.run(
                                  () => usersService.update(ctx, u.id, { status: u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }),
                                  u.status === 'ACTIVE' ? 'Acesso bloqueado' : 'Acesso liberado',
                                )
                              }
                            >
                              {u.status === 'ACTIVE' ? 'Bloquear acesso' : 'Liberar acesso'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <NewUserDialog open={creating} onClose={() => setCreating(false)} />
    </Page>
  )
}
