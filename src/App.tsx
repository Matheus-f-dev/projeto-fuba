import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
import { AppShell } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/misc'
import { SessionProvider, useSession } from '@/hooks/useSession'
import { AccessBlocked, FullScreenLoading } from '@/pages/AccessStates'
import { DashboardPage } from '@/pages/DashboardPage'
import { LoginPage } from '@/pages/LoginPage'
import { OrdersPage } from '@/pages/OrdersPage'

// Telas com mapa carregam sob demanda (Leaflet fica fora do bundle inicial)
const PlanningPage = lazy(() => import('@/pages/PlanningPage').then((m) => ({ default: m.PlanningPage })))
const MonitoringPage = lazy(() => import('@/pages/MonitoringPage').then((m) => ({ default: m.MonitoringPage })))
const RoutesPage = lazy(() => import('@/pages/RoutesPage').then((m) => ({ default: m.RoutesPage })))
const RouteDetailPage = lazy(() => import('@/pages/RouteDetailPage').then((m) => ({ default: m.RouteDetailPage })))
const OccurrencesPage = lazy(() => import('@/pages/OccurrencesPage').then((m) => ({ default: m.OccurrencesPage })))
const DriversPage = lazy(() => import('@/pages/DriversPage').then((m) => ({ default: m.DriversPage })))
const VehiclesPage = lazy(() => import('@/pages/VehiclesPage').then((m) => ({ default: m.VehiclesPage })))
const UsersPage = lazy(() => import('@/pages/UsersPage').then((m) => ({ default: m.UsersPage })))
const OrganizationPage = lazy(() => import('@/pages/OrganizationPage').then((m) => ({ default: m.OrganizationPage })))

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<FullScreenLoading />}>{children}</Suspense>
}

/** Decide entre login, bloqueio e painel a partir do estado da sessão. */
function Gate() {
  const { state } = useSession()
  switch (state.status) {
    case 'loading':
      return <FullScreenLoading />
    case 'signedOut':
      return <LoginPage />
    case 'noProfile':
      return (
        <AccessBlocked
          title="Acesso não liberado"
          description="Sua conta existe, mas ainda não está vinculada a uma organização. Peça ao administrador para liberar o seu acesso."
        />
      )
    case 'blocked':
      return state.reason === 'driver' ? (
        <AccessBlocked
          title="Acesso de motorista"
          description="O painel é usado pela equipe de operação. O aplicativo do motorista estará disponível em breve."
        />
      ) : (
        <AccessBlocked title="Acesso bloqueado" description="Seu usuário foi desativado. Fale com o administrador da organização." />
      )
    case 'ready':
      return <AppShell />
  }
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <Gate />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'pedidos', element: <OrdersPage /> },
      { path: 'planejamento', element: <Lazy><PlanningPage /></Lazy> },
      { path: 'rotas', element: <Lazy><RoutesPage /></Lazy> },
      { path: 'rotas/:id', element: <Lazy><RouteDetailPage /></Lazy> },
      { path: 'monitoramento', element: <Lazy><MonitoringPage /></Lazy> },
      { path: 'ocorrencias', element: <Lazy><OccurrencesPage /></Lazy> },
      { path: 'motoristas', element: <Lazy><DriversPage /></Lazy> },
      { path: 'veiculos', element: <Lazy><VehiclesPage /></Lazy> },
      { path: 'usuarios', element: <Lazy><UsersPage /></Lazy> },
      { path: 'organizacao', element: <Lazy><OrganizationPage /></Lazy> },
      {
        path: '*',
        element: <EmptyState title="Página não encontrada" description="Use o menu para voltar à operação." className="py-24" />,
      },
    ],
  },
])

export function App() {
  return (
    <SessionProvider>
      <RouterProvider router={router} />
      <Toaster
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast: '!rounded-lg !border !border-line !bg-surface !font-sans !text-[13px] !shadow-pop',
            title: '!font-semibold !text-ink',
            description: '!text-muted',
          },
        }}
      />
    </SessionProvider>
  )
}
