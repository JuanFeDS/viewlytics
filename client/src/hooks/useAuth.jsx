import { useState, useEffect, createContext, useContext } from 'react'
import { supabase } from '@/lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    // If auth hangs (expired token refresh on paused project), force login after 8s
    const timeout = setTimeout(() => setUser(prev => prev === undefined ? null : prev), 8000)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      clearTimeout(timeout)
      setUser(session?.user ?? null)
      if (event === 'SIGNED_IN' && session?.provider_token) {
        await supabase.from('profiles').upsert({
          id: session.user.id,
          email: session.user.email,
          name: session.user.user_metadata?.full_name ?? session.user.user_metadata?.name ?? null,
          avatar_url: session.user.user_metadata?.avatar_url ?? null,
          provider_token: session.provider_token,
          provider_refresh_token: session.provider_refresh_token ?? null,
          token_expires_at: new Date(Date.now() + 55 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
      }
    })

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        clearTimeout(timeout)
        setUser(prev => prev === undefined ? (session?.user ?? null) : prev)
      })
      .catch(() => {
        clearTimeout(timeout)
        setUser(prev => prev === undefined ? null : prev)
      })

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  const logout = () => {
    supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    window.location.replace(window.location.origin + '/viewlytics/')
  }

  return (
    <AuthContext.Provider value={{ user, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
