import { useState, useEffect, createContext, useContext } from 'react'
import { supabase } from '@/lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
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

    // Fallback: onAuthStateChange reads from storage (no network), getSession makes HTTP call.
    // Only updates if onAuthStateChange hasn't resolved yet (prev === undefined).
    supabase.auth.getSession()
      .then(({ data: { session } }) => setUser(prev => prev === undefined ? (session?.user ?? null) : prev))
      .catch(() => setUser(prev => prev === undefined ? null : prev))

    return () => subscription.unsubscribe()
  }, [])

  const logout = () => {
    Object.keys(localStorage)
      .filter(k => k.startsWith('sb-'))
      .forEach(k => localStorage.removeItem(k))
    window.location.replace(window.location.origin + '/viewlytics/')
  }

  return (
    <AuthContext.Provider value={{ user, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
