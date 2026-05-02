import { useEffect, useState } from 'react'
import { Star, Trash2 } from 'lucide-react'
import api from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EmptyState } from '@/components/ui/empty-state'

function FavoriteSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="w-full aspect-video" />
      <CardContent className="p-3 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </CardContent>
    </Card>
  )
}

export default function Favorites() {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/favorites').then(r => {
      setVideos(r.data)
      setLoading(false)
    })
  }, [])

  const remove = async (videoId) => {
    await api.delete(`/favorites/${videoId}`)
    setVideos(prev => prev.filter(v => v.video_id !== videoId))
  }

  return (
    <div className="p-6 space-y-5">
      <Badge variant="outline" className="gap-1">
        <Star className="size-3" />{loading ? '...' : videos.length} videos guardados
      </Badge>

      <ScrollArea className="h-[calc(100vh-160px)]">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pr-2">
            {Array.from({ length: 8 }).map((_, i) => <FavoriteSkeleton key={i} />)}
          </div>
        ) : videos.length === 0 ? (
          <EmptyState
            icon={Star}
            title="Sin favoritos"
            description="Guarda videos desde la búsqueda para verlos aquí"
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pr-2">
            {videos.map(v => (
              <Card key={v.id} className="overflow-hidden hover:shadow-md transition-shadow group">
                <a href={`https://www.youtube.com/watch?v=${v.video_id}`} target="_blank" rel="noopener noreferrer">
                  {v.thumbnail_url && (
                    <img src={v.thumbnail_url} alt={v.title} className="w-full aspect-video object-cover" />
                  )}
                </a>
                <CardContent className="p-3">
                  <p className="font-medium text-sm line-clamp-2">{v.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{v.channel_title}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">
                      {new Date(v.saved_at).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => remove(v.video_id)}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
