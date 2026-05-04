import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-64 gap-4 p-8 text-center">
          <div className="flex items-center justify-center size-12 rounded-xl bg-destructive/10">
            <AlertTriangle className="size-6 text-destructive" />
          </div>
          <div>
            <p className="font-semibold text-sm">Algo salió mal en esta sección</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">{this.state.error.message}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => this.setState({ error: null })}>
            <RefreshCw className="size-3.5 mr-1.5" /> Reintentar
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
