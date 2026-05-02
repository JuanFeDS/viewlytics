import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { ThemeProvider } from '@/hooks/useTheme'
import AppSidebar from '@/components/layout/AppSidebar'
import Login from '@/pages/Login'
import { LogOut } from 'lucide-react'
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
  const { logout } = useAuth()
  const title = pageTitles[location.pathname] || ''
  return (
    <header className="flex h-14 items-center gap-3 border-b px-4 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-5" />
      <h1 className="text-sm font-semibold flex-1">{title}</h1>
      <button
        onClick={logout}
        className="text-muted-foreground hover:text-foreground transition-colors p-1"
        title="Cerrar sesión"
      >
        <LogOut className="size-4" />
      </button>
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
              <Route path="/subscriptions" element={<Subscriptions />} />
              <Route path="/playlists" element={<Playlists />} />
              <Route path="/pending" element={<Pending />} />
              <Route path="/search" element={<Search />} />
              <Route path="/favorites" element={<Favorites />} />
              <Route path="/stats" element={<Suspense fallback={null}><Stats /></Suspense>} />
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
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
