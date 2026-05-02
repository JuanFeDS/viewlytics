import { useEffect, useState } from 'react'
import { CheckCircle, Trash2, Clock, Star } from 'lucide-react'
import api from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'

function VideoSkeleton() {
  return (
    <Card>
      <CardContent className="p-3 flex gap-3">
        <Skeleton className="w-28 aspect-video rounded shrink-0" />
        <div className="flex-1 space-y-2 py-1">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </CardContent>
    </Card>
  )
}

function VideoItem({ v, onWatched, onRemove }) {
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-3 flex gap-3 items-start">
        {v.thumbnail_url && (
          <a href={`https://www.youtube.com/watch?v=${v.video_id}`} target="_blank" rel="noopener noreferrer" className="shrink-0">
            <img src={v.thumbnail_url} alt="" className="w-28 aspect-video rounded object-cover" />
          </a>
        )}
        <div className="flex-1 min-w-0">
          <a
            href={`https://www.youtube.com/watch?v=${v.video_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-sm line-clamp-2 hover:underline"
          >
            {v.title}
          </a>
          <p className="text-xs text-muted-foreground mt-1">{v.channel_title}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {new Date(v.added_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          {!v.watched_at && (
            <Button variant="outline" size="icon" className="size-8" title="Marcar como visto" onClick={() => onWatched(v.id)}>
              <CheckCircle className="size-4 text-green-500" />
            </Button>
          )}
          <Button variant="outline" size="icon" className="size-8" title="Eliminar" onClick={() => onRemove(v.id)}>
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function Pending() {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/pending').then(r => {
      setVideos(r.data)
      setLoading(false)
    })
  }, [])

  const markWatched = async (id) => {
    await api.patch(`/pending/${id}/watched`)
    setVideos(prev => prev.map(v => v.id === id ? { ...v, watched_at: new Date().toISOString() } : v))
  }

  const remove = async (id) => {
    await api.delete(`/pending/${id}`)
    setVideos(prev => prev.filter(v => v.id !== id))
  }

  const pending = videos.filter(v => !v.watched_at)
  const watched = videos.filter(v => v.watched_at)

  return (
    <div className="p-6 space-y-5">
      <div className="flex gap-2">
        <Badge variant="outline" className="gap-1"><Clock className="size-3" />{pending.length} por ver</Badge>
        <Badge variant="secondary" className="gap-1"><Star className="size-3" />{watched.length} vistos</Badge>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Por ver ({pending.length})</TabsTrigger>
          <TabsTrigger value="watched">Vistos ({watched.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <ScrollArea className="h-[calc(100vh-240px)]">
            {loading ? (
              <div className="space-y-2 pr-2">{Array.from({ length: 4 }).map((_, i) => <VideoSkeleton key={i} />)}</div>
            ) : pending.length === 0 ? (
              <EmptyState icon={Clock} title="No hay videos pendientes" description="Busca videos y agrégalos desde la sección Buscar" />
            ) : (
              <div className="space-y-2 pr-2">
                {pending.map(v => <VideoItem key={v.id} v={v} onWatched={markWatched} onRemove={remove} />)}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="watched" className="mt-4">
          <ScrollArea className="h-[calc(100vh-240px)]">
            {watched.length === 0 ? (
              <EmptyState icon={CheckCircle} title="Sin videos vistos" description="Marca videos como vistos para verlos aquí" />
            ) : (
              <div className="space-y-2 pr-2">
                {watched.map(v => <VideoItem key={v.id} v={v} onWatched={markWatched} onRemove={remove} />)}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}
