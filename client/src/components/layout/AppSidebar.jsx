import { useLocation, useNavigate } from 'react-router-dom'
import { PlayCircle, Users, ListVideo, Clock, Search, Star, Sun, Moon, BarChart2 } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/hooks/useTheme'

const navItems = [
  { to: '/subscriptions', icon: Users, label: 'Suscripciones' },
  { to: '/playlists', icon: ListVideo, label: 'Playlists' },
  { to: '/pending', icon: Clock, label: 'Pendientes' },
  { to: '/search', icon: Search, label: 'Buscar' },
  { to: '/favorites', icon: Star, label: 'Favoritos' },
  { to: '/stats', icon: BarChart2, label: 'Estadísticas' },
]

export default function AppSidebar() {
  const { user } = useAuth()
  const { theme, toggle } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-8 rounded-lg bg-red-500/10">
            <PlayCircle className="text-red-500 size-5" />
          </div>
          <div>
            <p className="font-semibold text-sm leading-tight">YT Organizer</p>
            <p className="text-xs text-muted-foreground leading-tight">Tu YouTube personal</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent className="px-2 py-2">
        <SidebarGroup>
          <SidebarGroupLabel className="px-2 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
            Navegación
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {navItems.map(({ to, icon: Icon, label }) => (
                <SidebarMenuItem key={to}>
                  <SidebarMenuButton
                    isActive={location.pathname === to}
                    onClick={() => navigate(to)}
                    className="gap-3 px-3 py-2 h-9 rounded-md cursor-pointer"
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="text-sm">{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter className="px-4 py-4 gap-3">
        <SidebarMenuButton
          onClick={toggle}
          className="gap-3 px-3 py-2 h-9 rounded-md w-full cursor-pointer"
        >
          {theme === 'dark'
            ? <Sun className="size-4 shrink-0" />
            : <Moon className="size-4 shrink-0" />
          }
          <span className="text-sm">{theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>
        </SidebarMenuButton>

        {user && (
          <div className="flex items-center gap-3 px-1">
            <div className="flex items-center justify-center size-8 rounded-full bg-primary text-primary-foreground text-xs font-semibold shrink-0">
              {(user.user_metadata?.full_name ?? user.email ?? '?').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate leading-tight">{user.user_metadata?.full_name ?? user.email}</p>
              <p className="text-xs text-muted-foreground truncate leading-tight">{user.email}</p>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  )
}
