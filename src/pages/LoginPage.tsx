import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { RouteTrack } from '@/features/routes/RouteTrack'
import { isFirebaseConfigured, useEmulators } from '@/firebase/app'
import { useSession } from '@/hooks/useSession'
import { toUserMessage } from '@/services/context'

const demoTrack = [
  { sequence: 1, status: 'DELIVERED' as const },
  { sequence: 2, status: 'DELIVERED' as const },
  { sequence: 3, status: 'FAILED' as const },
  { sequence: 4, status: 'DELIVERED' as const },
  { sequence: 5, status: 'PENDING' as const },
  { sequence: 6, status: 'PENDING' as const },
  { sequence: 7, status: 'PENDING' as const },
]

export function LoginPage() {
  const { signIn } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setPending(true)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(toUserMessage(err))
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-8">
          <span className="font-display text-[26px] font-bold tracking-[-0.04em]">
            fubá<span className="text-accent">.</span>
          </span>
          <p className="mt-1 text-[13px] text-muted">Painel da operação de entregas</p>
          <RouteTrack points={demoTrack} live size="lg" className="mt-6 max-w-[220px]" />
        </div>

        <form onSubmit={submit} noValidate className="panel space-y-4 p-6">
          <h1 className="font-display text-lg font-semibold tracking-[-0.02em]">Entrar</h1>
          <Field label="E-mail">
            {(p) => (
              <Input {...p} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required />
            )}
          </Field>
          <Field label="Senha">
            {(p) => (
              <Input {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            )}
          </Field>
          {error && (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" loading={pending} className="w-full" disabled={!email || !password}>
            Entrar
          </Button>
        </form>

        <p className="mt-4 text-xs text-muted">
          O acesso é criado pelo administrador da sua organização.
        </p>
        {!isFirebaseConfigured && (
          <p className="mt-3 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
            Firebase não configurado. Preencha o arquivo .env (veja .env.example).
          </p>
        )}
        {useEmulators && (
          <p className="mt-3 rounded-md bg-ink/[0.04] px-3 py-2 text-xs text-muted">
            Ambiente local (emuladores). Após <code className="font-mono">npm run seed:emulator</code>, entre com{' '}
            <code className="font-mono text-ink-2">admin@demo.fuba</code> / <code className="font-mono text-ink-2">demo1234</code>.
          </p>
        )}
      </div>
    </div>
  )
}
