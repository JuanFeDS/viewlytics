import { useState, useEffect, createContext, useContext } from 'react'
import { supabase } from '@/lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
    })

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

    return () => subscription.unsubscribe()
  }, [])

  const logout = async () => {
    await supabase.auth.signOut({ scope: 'local' })
    window.location.replace(window.location.origin + '/viewlytics/')
  }

  return (
    <AuthContext.Provider value={{ user, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
