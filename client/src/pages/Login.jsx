import { PlayCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-6 p-8 max-w-sm w-full">
        <div className="flex justify-center">
          <PlayCircle className="size-16 text-red-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">YT Organizer</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Organiza tus suscripciones, playlists y videos pendientes.
          </p>
        </div>
        <Button
          className="w-full"
          onClick={() => window.location.href = '/api/auth/login'}
        >
          Continuar con Google
        </Button>
      </div>
    </div>
  )
}
