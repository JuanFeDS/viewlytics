import { useEffect, useState } from 'react'
import { Search as SearchIcon, Plus, Star, Clock } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EmptyState } from '@/components/ui/empty-state'

function VideoCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="w-full aspect-video" />
      <CardContent className="p-3 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-7 w-full mt-2" />
      </CardContent>
    </Card>
  )
}

export default function Search() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [pendingIds, setPendingIds] = useState(new Set())
  const [favIds, setFavIds] = useState(new Set())

  // Load existing saved IDs on mount
  useEffect(() => {
    Promise.all([
      api.get('/pending').then(r => (r.data ?? []).map(v => v.video_id)).catch(() => []),
      api.get('/favorites').then(r => (r.data ?? []).map(v => v.video_id)).catch(() => []),
    ]).then(([p, f]) => {
      setPendingIds(new Set(p))
      setFavIds(new Set(f))
    }).catch(() => {})
  }, [])

  const doSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    setSearched(true)
    try {
      const { data } = await api.get('/search', { params: { q: query } })
      setResults(data)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const addToPending = async (item) => {
    try {
      await api.post('/pending', {
        video_id: item.id.videoId,
        title: item.snippet.title,
        channel_id: item.snippet.channelId,
        channel_title: item.snippet.channelTitle,
        thumbnail_url: item.snippet.thumbnails?.medium?.url,
      })
      setPendingIds(prev => new Set([...prev, item.id.videoId]))
      toast.success('Agregado a pendientes')
    } catch (e) {
      if (e.response?.status === 409) {
        setPendingIds(prev => new Set([...prev, item.id.videoId]))
      } else {
        toast.error('No se pudo agregar a pendientes')
      }
    }
  }

  const addToFavorites = async (item) => {
    try {
      await api.post('/favorites', {
        video_id: item.id.videoId,
        title: item.snippet.title,
        channel_id: item.snippet.channelId,
        channel_title: item.snippet.channelTitle,
        thumbnail_url: item.snippet.thumbnails?.medium?.url,
      })
      setFavIds(prev => new Set([...prev, item.id.videoId]))
      toast.success('Guardado en favoritos')
    } catch (e) {
      if (e.response?.status === 409) {
        setFavIds(prev => new Set([...prev, item.id.videoId]))
      } else {
        toast.error('No se pudo guardar en favoritos')
      }
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex gap-2 max-w-xl">
        <Input
          placeholder="Buscar en YouTube..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && doSearch()}
          className="h-9"
        />
        <Button onClick={doSearch} disabled={loading} size="sm" className="h-9 px-4">
          <SearchIcon className="size-4 mr-2" />
          Buscar
        </Button>
      </div>

      <ScrollArea className="h-[calc(100vh-190px)]">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pr-2">
            {Array.from({ length: 8 }).map((_, i) => <VideoCardSkeleton key={i} />)}
          </div>
        ) : !searched ? (
          <EmptyState
            icon={SearchIcon}
            title="Busca un video"
            description="Escribe algo y presiona Enter o el botón Buscar"
          />
        ) : results.length === 0 ? (
          <EmptyState icon={SearchIcon} title="Sin resultados" description={`No se encontró nada para "${query}"`} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pr-2">
            {results.map(item => {
              const videoId = item.id.videoId
              const inPending = pendingIds.has(videoId)
              const inFav = favIds.has(videoId)
              return (
                <Card key={videoId} className="overflow-hidden hover:shadow-md transition-shadow">
                  <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noopener noreferrer">
                    <img
                      src={item.snippet.thumbnails?.medium?.url}
                      alt={item.snippet.title}
                      className="w-full aspect-video object-cover"
                    />
                  </a>
                  <CardContent className="p-3">
                    <p className="font-medium text-sm line-clamp-2">{item.snippet.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.snippet.channelTitle}</p>
                    <div className="flex gap-2 mt-3">
                      {inPending ? (
                        <Badge variant="secondary" className="flex-1 justify-center gap-1 h-7">
                          <Clock className="size-3" /> En pendientes
                        </Badge>
                      ) : (
                        <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" onClick={() => addToPending(item)}>
                          <Plus className="size-3 mr-1" /> Pendiente
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="icon"
                        className={`size-7 transition-colors ${inFav ? 'border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20' : ''}`}
                        onClick={() => !inFav && addToFavorites(item)}
                      >
                        <Star className={`size-3.5 ${inFav ? 'fill-amber-500' : ''}`} />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
