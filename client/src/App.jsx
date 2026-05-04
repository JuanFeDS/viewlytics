import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { ThemeProvider } from '@/hooks/useTheme'
import AppSidebar from '@/components/layout/AppSidebar'
import ErrorBoundary from '@/components/ErrorBoundary'
import Login from '@/pages/Login'
import { LogOut } from 'lucide-react'
import { Toaster } from 'sonner'
import Subscriptions from '@/pages/Subscriptions'
import Playlists from '@/pages/Playlists'
import Pending from '@/pages/Pending'
import Search from '@/pages/Search'
import Favorites from '@/pages/Favorites'
const Stats = lazy(() => import('@/pages/Stats'))

const pageTitles = {
  '/subscriptions': 'Suscripciones',
  '/playlists': 'Playlists',
  '/pending': 'Pendientes',
  '/search': 'Buscar videos',
  '/favorites': 'Favoritos',
  '/stats': 'Estadísticas',
}

function PageHeader() {
  const location = useLocation()
  const { user, logout } = useAuth()
  const title = pageTitles[location.pathname] || ''
  const initial = (user?.user_metadata?.full_name ?? user?.email ?? '?').charAt(0).toUpperCase()

  return (
    <header className="flex h-14 items-center gap-3 border-b px-4 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-5" />
      <h1 className="text-sm font-semibold flex-1">{title}</h1>
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center size-7 rounded-full bg-primary text-primary-foreground text-xs font-semibold select-none">
          {initial}
        </div>
        <Separator orientation="vertical" className="h-5" />
        <button
          onClick={logout}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1 px-1.5 rounded-md hover:bg-accent"
          title="Cerrar sesión"
        >
          <LogOut className="size-3.5" />
          <span>Salir</span>
        </button>
      </div>
    </header>
  )
}

function AppLayout() {
  const { user } = useAuth()

  if (user === undefined) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="size-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    </div>
  )
  if (!user) return <Login />

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <PageHeader />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Navigate to="/subscriptions" replace />} />
              <Route path="/subscriptions" element={<ErrorBoundary><Subscriptions /></ErrorBoundary>} />
              <Route path="/playlists" element={<ErrorBoundary><Playlists /></ErrorBoundary>} />
              <Route path="/pending" element={<ErrorBoundary><Pending /></ErrorBoundary>} />
              <Route path="/search" element={<ErrorBoundary><Search /></ErrorBoundary>} />
              <Route path="/favorites" element={<ErrorBoundary><Favorites /></ErrorBoundary>} />
              <Route path="/stats" element={<ErrorBoundary><Suspense fallback={null}><Stats /></Suspense></ErrorBoundary>} />
            </Routes>
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter basename="/viewlytics">
        <AuthProvider>
          <AppLayout />
          <Toaster richColors position="bottom-right" />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
