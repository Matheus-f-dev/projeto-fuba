import { useEffect, useState } from 'react'
import { Page } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { DetailRow, PageHeader } from '@/components/ui/misc'
import { useAction } from '@/hooks/useAction'
import { useReadySession } from '@/hooks/useSession'
import { usersService } from '@/services/usersService'

function formatCnpj(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

export function OrganizationPage() {
  const { ctx, organization, profile } = useReadySession()
  const { pending, run } = useAction()
  const [name, setName] = useState('')
  const [document, setDocument] = useState('')
  const isAdmin = profile.role === 'ADMIN'

  useEffect(() => {
    setName(organization?.name ?? '')
    setDocument(formatCnpj(organization?.document ?? ''))
  }, [organization?.name, organization?.document])

  return (
    <Page className="max-w-3xl">
      <PageHeader title="Organização" description="Dados da empresa responsável pela operação." />
      <form
        className="panel p-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void run(() => usersService.updateOrganization(ctx, { name, document }), 'Dados da organização salvos')
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome">{(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} disabled={!isAdmin} />}</Field>
          <Field label="CNPJ" optional>
            {(p) => <Input {...p} inputMode="numeric" value={document} onChange={(e) => setDocument(formatCnpj(e.target.value))} disabled={!isAdmin} />}
          </Field>
        </div>
        {isAdmin ? (
          <div className="mt-5 flex justify-end">
            <Button type="submit" variant="primary" loading={pending}>
              Salvar alterações
            </Button>
          </div>
        ) : (
          <p className="mt-4 text-xs text-muted">Somente administradores alteram estes dados.</p>
        )}
      </form>

      <section className="panel mt-6 p-5">
        <h2 className="font-display text-[15px] font-semibold">Dados e privacidade</h2>
        <dl className="mt-3">
          <DetailRow label="Localização">Registrada apenas durante rotas em andamento, com intervalo mínimo de 15 segundos.</DetailRow>
          <DetailRow label="Comprovantes">Uma foto por entrega, reduzida antes de salvar. Visível somente para a sua organização.</DetailRow>
          <DetailRow label="Histórico">Toda alteração de pedido e rota fica registrada com autor e horário do servidor.</DetailRow>
          <DetailRow label="Identificador">
            <code className="font-mono text-xs text-muted">{ctx.organizationId}</code>
          </DetailRow>
        </dl>
      </section>
    </Page>
  )
}
