import { PlayCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

export default function Login() {
  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/youtube.readonly',
        queryParams: { access_type: 'offline', prompt: 'consent' },
        redirectTo: `${window.location.origin}/viewlytics/`,
      },
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-6 p-8 max-w-sm w-full">
        <div className="flex justify-center">
          <PlayCircle className="size-16 text-red-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Viewlytics</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Organiza tus suscripciones, playlists y videos pendientes.
          </p>
        </div>
        <Button className="w-full" onClick={handleLogin}>
          Continuar con Google
        </Button>
      </div>
    </div>
  )
}
