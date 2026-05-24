import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, Star, Clock, X, Play } from 'lucide-react'
import VideoPlayerModal from '@/components/VideoPlayerModal'
import { fetchChannelVideos } from '@/lib/youtube'
import { parseDuration, formatViews, timeAgo, isoToSeconds } from '@/lib/youtube'
import { useSavedIds } from '@/hooks/useSavedIds'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'

function VideoSkeleton() {
  return (
    <div className="flex gap-3">
      <Skeleton className="w-36 aspect-video rounded-lg shrink-0" />
      <div className="flex-1 space-y-2 py-1">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  )
}

export default function ChannelDrawer({ channel, open, onClose }) {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [filterShorts, setFilterShorts] = useState(true)
  const [videoCount, setVideoCount] = useState(5)
  const [playing, setPlaying] = useState(null)

  const { pendingIds, favIds, addToPending, removeFromPending, addToFavorites, removeFromFavorites } = useSavedIds()

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMounted(true)
    } else {
      const t = setTimeout(() => setMounted(false), 300)
      return () => clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    if (!open || !channel?.channelId) return
    const controller = new AbortController()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVideos([])
    setLoading(true)
    setFilterShorts(true)
    setVideoCount(5)

    const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY
    fetchChannelVideos(apiKey, channel.channelId, { maxResults: 50, signal: controller.signal })
      .then(setVideos)
      .catch(e => { if (e.name !== 'AbortError') setVideos([]) })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [open, channel?.channelId])

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!mounted && !open) return null

  const visibleVideos = filterShorts
    ? videos.filter(v => isoToSeconds(v.duration) > 180).slice(0, videoCount)
    : videos.slice(0, videoCount)

  const toPlayer = (v) => ({ ...v, channel_id: channel?.channelId, channel_title: v.channel_title ?? channel?.title })

  return (
    <>
      {createPortal(
        <>
          <div
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40 transition-opacity duration-300"
            style={{ opacity: open ? 1 : 0 }}
          />

          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-y-0 right-0 z-50 w-full max-w-[480px] bg-background border-l shadow-2xl transition-transform duration-300 ease-in-out"
            style={{
              transform: open ? 'translateX(0)' : 'translateX(100%)',
              display: 'grid',
              gridTemplateRows: 'auto auto auto 1fr',
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 p-5">
              {(channel?.thumbnail) && (
                <a
                  href={`https://www.youtube.com/channel/${channel?.channelId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0"
                >
                  <img
                    src={channel.thumbnail}
                    alt=""
                    className="size-12 rounded-full object-cover hover:opacity-80 transition-opacity"
                  />
                </a>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold leading-tight truncate">{channel?.title}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {channel?.categories?.map(cat => (
                    <Badge key={cat.id} variant="secondary" className="text-xs">{cat.name}</Badge>
                  ))}
                  {channel?.recentVideos > 0 && (
                    <Badge variant="outline" className="text-xs">{channel.recentVideos} videos/90d</Badge>
                  )}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <a href={`https://www.youtube.com/channel/${channel?.channelId}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="icon" className="size-8">
                    <ExternalLink className="size-3.5" />
                  </Button>
                </a>
                <Button variant="ghost" size="icon" className="size-8" onClick={onClose}>
                  <X className="size-4" />
                </Button>
              </div>
            </div>

            <Separator />

            <div className="px-5 py-3 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider shrink-0">
                Últimos {videoCount} videos
              </p>
              <div className="flex items-center gap-1.5">
                {[5, 10, 15].map(n => (
                  <Badge
                    key={n}
                    variant={videoCount === n ? 'secondary' : 'outline'}
                    className="cursor-pointer select-none text-xs px-2"
                    onClick={() => setVideoCount(n)}
                  >
                    {n}
                  </Badge>
                ))}
                <div className="w-px h-3 bg-border mx-0.5" />
                <Badge
                  variant={filterShorts ? 'secondary' : 'outline'}
                  className="cursor-pointer select-none text-xs"
                  onClick={() => setFilterShorts(f => !f)}
                >
                  Sin Shorts
                </Badge>
              </div>
            </div>

            <div className="overflow-y-auto min-h-0 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full" style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}>
              <div className="px-5 space-y-4 pb-6">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => <VideoSkeleton key={i} />)
                ) : !visibleVideos.length ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Sin videos recientes</p>
                ) : (
                  visibleVideos.map(video => {
                    const inPending = pendingIds.has(video.video_id)
                    const inFav = favIds.has(video.video_id)
                    return (
                      <div key={video.video_id} className="flex gap-3">
                        <div
                          role="button"
                          onClick={() => setPlaying(toPlayer(video))}
                          className="shrink-0 relative cursor-pointer group/thumb"
                        >
                          <img src={video.thumbnail_url} alt="" className="w-36 aspect-video rounded-lg object-cover" />
                          {video.duration && (
                            <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 rounded">
                              {parseDuration(video.duration)}
                            </span>
                          )}
                          <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/40 transition-colors rounded-lg flex items-center justify-center">
                            <Play className="size-5 text-white fill-white opacity-0 group-hover/thumb:opacity-100 transition-opacity" />
                          </div>
                        </div>

                        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                          <div>
                            <a
                              href={`https://www.youtube.com/watch?v=${video.video_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium line-clamp-2 hover:underline leading-tight"
                            >
                              {video.title}
                            </a>
                            <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                              <span>{timeAgo(video.publishedAt)}</span>
                              {video.viewCount && <span>· {formatViews(video.viewCount)} vistas</span>}
                            </div>
                          </div>
                          <div className="flex gap-1.5 mt-2">
                            {inPending ? (
                              <Badge
                                variant="secondary"
                                className="text-xs gap-1 cursor-pointer hover:bg-destructive/15 hover:text-destructive transition-colors"
                                onClick={() => removeFromPending(video.video_id)}
                                title="Quitar de pendientes"
                              >
                                <Clock className="size-2.5" /> En pendientes
                              </Badge>
                            ) : (
                              <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => addToPending({ ...video, channel_id: channel?.channelId, channel_title: channel?.title })}>
                                <Clock className="size-3 mr-1" /> Pendiente
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="icon"
                              className={`size-7 transition-colors ${inFav ? 'border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-500' : ''}`}
                              onClick={() => inFav ? removeFromFavorites(video.video_id) : addToFavorites({ ...video, channel_id: channel?.channelId, channel_title: channel?.title })}
                              title={inFav ? 'Quitar de favoritos' : 'Guardar en favoritos'}
                            >
                              <Star className={`size-3.5 ${inFav ? 'fill-amber-500' : ''}`} />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

      {playing && (
        <VideoPlayerModal
          video={playing}
          queue={visibleVideos.map(toPlayer)}
          onClose={() => setPlaying(null)}
        />
      )}
    </>
  )
}
