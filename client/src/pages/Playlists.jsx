import { useEffect, useState } from 'react'
import { ListVideo, ChevronRight } from 'lucide-react'
import api from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
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

  useEffect(() => {
    api.get('/playlists').then(r => {
      setPlaylists(r.data)
      setLoadingPlaylists(false)
    })
  }, [])

  const openPlaylist = async (pl) => {
    setSelected(pl)
    setLoadingItems(true)
    const { data } = await api.get(`/playlists/${pl.id}/items`)
    setItems(data)
    setLoadingItems(false)
  }

  return (
    <div className="flex h-[calc(100vh-56px)]">
      <div className="w-72 border-r shrink-0 flex flex-col">
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

      <div className="flex-1 min-w-0 flex flex-col">
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
            <div className="p-4 border-b">
              <p className="font-semibold text-sm">{selected.snippet.title}</p>
              <p className="text-xs text-muted-foreground">{selected.contentDetails?.itemCount} videos</p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-2">
                {loadingItems
                  ? Array.from({ length: 5 }).map((_, i) => <VideoItemSkeleton key={i} />)
                  : items.length === 0
                    ? <EmptyState icon={ListVideo} title="Playlist vacía" />
                    : items.map((item, i) => (
                      <Card key={item.id} className="hover:shadow-sm transition-shadow">
                        <CardContent className="p-3 flex gap-3 items-start">
                          <span className="text-muted-foreground text-xs w-5 shrink-0 pt-2 text-right">{i + 1}</span>
                          {item.snippet.thumbnails?.default?.url && (
                            <img
                              src={item.snippet.thumbnails.default.url}
                              alt=""
                              className="w-24 aspect-video rounded object-cover shrink-0"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm line-clamp-2">{item.snippet.title}</p>
                            <p className="text-xs text-muted-foreground mt-1">{item.snippet.videoOwnerChannelTitle}</p>
                          </div>
                          <a
                            href={`https://www.youtube.com/watch?v=${item.contentDetails.videoId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button variant="outline" size="sm" className="shrink-0">Ver</Button>
                          </a>
                        </CardContent>
                      </Card>
                    ))
                }
              </div>
            </ScrollArea>
          </>
        )}
      </div>
    </div>
  )
}
