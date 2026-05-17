import { useEffect, useState } from 'react'
import { ListVideo, ChevronRight, ArrowLeft, Clock, Star, ExternalLink, Play } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'
import VideoPlayerModal from '@/components/VideoPlayerModal'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'

function PlaylistSkeleton() {
  return (
    <div className="flex gap-3 items-center p-3 rounded-lg border">
      <Skeleton className="size-12 rounded shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  )
}

function VideoItemSkeleton() {
  return (
    <Card>
      <CardContent className="p-3 flex gap-3">
        <Skeleton className="size-6 rounded shrink-0 mt-1" />
        <Skeleton className="w-24 aspect-video rounded shrink-0" />
        <div className="flex-1 space-y-2 py-1">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </CardContent>
    </Card>
  )
}

export default function Playlists() {
  const [playlists, setPlaylists] = useState([])
  const [selected, setSelected] = useState(null)
  const [items, setItems] = useState([])
  const [loadingPlaylists, setLoadingPlaylists] = useState(true)
  const [loadingItems, setLoadingItems] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [pendingIds, setPendingIds] = useState(new Set())
  const [favIds, setFavIds] = useState(new Set())
  const [playing, setPlaying] = useState(null)

  const toPlayer = (item) => ({
    video_id: item.contentDetails.videoId,
    title: item.snippet.title,
    channel_title: item.snippet.videoOwnerChannelTitle,
    thumbnail_url: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url,
  })

  useEffect(() => {
    api.get('/playlists').then(r => {
      setPlaylists(r.data)
      setLoadingPlaylists(false)
    })

    Promise.all([
      api.get('/pending').then(r => (r.data ?? []).map(v => v.video_id)).catch(() => []),
      api.get('/favorites').then(r => (r.data ?? []).map(v => v.video_id)).catch(() => []),
    ]).then(([p, f]) => {
      setPendingIds(new Set(p))
      setFavIds(new Set(f))
    })
  }, [])

  const openPlaylist = async (pl) => {
    setSelected(pl)
    setShowDetail(true)
    setLoadingItems(true)
    const { data } = await api.get(`/playlists/${pl.id}/items`)
    setItems(data)
    setLoadingItems(false)
  }

  const addToPending = async (item) => {
    const videoId = item.contentDetails.videoId
    try {
      await api.post('/pending', {
        video_id: videoId,
        title: item.snippet.title,
        channel_id: item.snippet.videoOwnerChannelId,
        channel_title: item.snippet.videoOwnerChannelTitle,
        thumbnail_url: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url,
      })
      setPendingIds(prev => new Set([...prev, videoId]))
      toast.success('Agregado a pendientes')
    } catch (e) {
      if (e.response?.status === 409) {
        setPendingIds(prev => new Set([...prev, videoId]))
      } else {
        toast.error('No se pudo agregar a pendientes')
      }
    }
  }

  const removeFromPending = async (videoId) => {
    try {
      await api.delete(`/pending/${videoId}`)
      setPendingIds(prev => { const s = new Set(prev); s.delete(videoId); return s })
      toast.success('Quitado de pendientes')
    } catch (e) {
      toast.error('No se pudo quitar', { description: e.response?.data?.error ?? e.message })
    }
  }

  const addToFavorites = async (item) => {
    const videoId = item.contentDetails.videoId
    try {
      await api.post('/favorites', {
        video_id: videoId,
        title: item.snippet.title,
        channel_title: item.snippet.videoOwnerChannelTitle,
        thumbnail_url: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url,
      })
      setFavIds(prev => new Set([...prev, videoId]))
      toast.success('Guardado en favoritos')
    } catch (e) {
      if (e.response?.status === 409) {
        setFavIds(prev => new Set([...prev, videoId]))
      } else {
        toast.error('No se pudo guardar en favoritos')
      }
    }
  }

  const removeFromFavorites = async (videoId) => {
    try {
      await api.delete(`/favorites/${videoId}`)
      setFavIds(prev => { const s = new Set(prev); s.delete(videoId); return s })
      toast.success('Quitado de favoritos')
    } catch (e) {
      toast.error('No se pudo quitar', { description: e.response?.data?.error ?? e.message })
    }
  }

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Playlist list — full screen on mobile (hidden when detail showing), sidebar on sm+ */}
      <div className={`${showDetail ? 'hidden sm:flex' : 'flex'} flex-col w-full sm:w-72 sm:shrink-0 border-r`}>
        <div className="p-4 border-b">
          <p className="text-sm text-muted-foreground">
            {loadingPlaylists ? 'Cargando...' : `${playlists.length} playlists`}
          </p>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {loadingPlaylists
              ? Array.from({ length: 6 }).map((_, i) => <PlaylistSkeleton key={i} />)
              : playlists.length === 0
                ? <EmptyState icon={ListVideo} title="Sin playlists" />
                : playlists.map(pl => (
                  <button
                    key={pl.id}
                    onClick={() => openPlaylist(pl)}
                    className={`w-full text-left rounded-lg p-3 flex gap-3 items-center hover:bg-accent transition-colors ${selected?.id === pl.id ? 'bg-accent' : ''}`}
                  >
                    {pl.snippet.thumbnails?.default?.url ? (
                      <img src={pl.snippet.thumbnails.default.url} alt="" className="size-10 rounded object-cover shrink-0" />
                    ) : (
                      <div className="size-10 rounded bg-muted flex items-center justify-center shrink-0">
                        <ListVideo className="size-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{pl.snippet.title}</p>
                      <p className="text-xs text-muted-foreground">{pl.contentDetails?.itemCount} videos</p>
                    </div>
                    <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                  </button>
                ))
            }
          </div>
        </ScrollArea>
      </div>

      {/* Detail panel — full screen on mobile when showDetail, always visible on sm+ */}
      <div className={`${showDetail ? 'flex' : 'hidden sm:flex'} flex-col flex-1 min-w-0`}>
        {!selected ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={ListVideo}
              title="Selecciona una playlist"
              description="Elige una playlist de la izquierda para ver sus videos"
            />
          </div>
        ) : (
          <>
            <div className="p-4 border-b flex items-center gap-3">
              <button
                onClick={() => setShowDetail(false)}
                className="sm:hidden flex items-center justify-center size-8 -ml-1 shrink-0 rounded-md hover:bg-accent transition-colors"
              >
                <ArrowLeft className="size-4" />
              </button>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{selected.snippet.title}</p>
                <p className="text-xs text-muted-foreground">{selected.contentDetails?.itemCount} videos</p>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-2">
                {loadingItems
                  ? Array.from({ length: 5 }).map((_, i) => <VideoItemSkeleton key={i} />)
                  : items.length === 0
                    ? <EmptyState icon={ListVideo} title="Playlist vacía" />
                    : items.map((item, i) => {
                      const videoId = item.contentDetails.videoId
                      const inPending = pendingIds.has(videoId)
                      const inFav = favIds.has(videoId)
                      return (
                        <Card key={item.id} className="hover:shadow-sm transition-shadow">
                          <CardContent className="p-3 flex gap-3 items-start">
                            <span className="text-muted-foreground text-xs w-5 shrink-0 pt-2 text-right">{i + 1}</span>
                            {item.snippet.thumbnails?.default?.url && (
                              <div
                                role="button"
                                onClick={() => setPlaying(toPlayer(item))}
                                className="relative cursor-pointer group/thumb shrink-0"
                              >
                                <img
                                  src={item.snippet.thumbnails.default.url}
                                  alt=""
                                  className="w-24 aspect-video rounded object-cover"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/40 transition-colors rounded flex items-center justify-center">
                                  <Play className="size-4 text-white fill-white opacity-0 group-hover/thumb:opacity-100 transition-opacity" />
                                </div>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm line-clamp-2">{item.snippet.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{item.snippet.videoOwnerChannelTitle}</p>
                              <div className="flex gap-1.5 mt-2 flex-wrap">
                                {inPending ? (
                                  <Badge
                                    variant="secondary"
                                    className="text-xs gap-1 cursor-pointer hover:bg-destructive/15 hover:text-destructive transition-colors"
                                    onClick={() => removeFromPending(videoId)}
                                    title="Quitar de pendientes"
                                  >
                                    <Clock className="size-2.5" /> En pendientes
                                  </Badge>
                                ) : (
                                  <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => addToPending(item)}>
                                    <Clock className="size-3 mr-1" /> Pendiente
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className={`size-7 transition-colors ${inFav ? 'border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-500' : ''}`}
                                  onClick={() => inFav ? removeFromFavorites(videoId) : addToFavorites(item)}
                                  title={inFav ? 'Quitar de favoritos' : 'Guardar en favoritos'}
                                >
                                  <Star className={`size-3.5 ${inFav ? 'fill-amber-500' : ''}`} />
                                </Button>
                                <a
                                  href={`https://www.youtube.com/watch?v=${videoId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center"
                                >
                                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground/50 hover:text-muted-foreground">
                                    <ExternalLink className="size-3.5" />
                                  </Button>
                                </a>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })
                }
              </div>
            </ScrollArea>
          </>
        )}
      </div>
    </div>

    {playing && (
      <VideoPlayerModal
        video={playing}
        queue={items.map(toPlayer)}
        onClose={() => setPlaying(null)}
      />
    )}
  )
}
