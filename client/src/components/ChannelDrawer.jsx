import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, Star, Clock, X } from 'lucide-react'
import api from '@/lib/api'
import { parseDuration, formatViews, timeAgo } from '@/lib/youtube'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'

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
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [added, setAdded] = useState({})
  const [mounted, setMounted] = useState(false)

  // Animate in/out
  useEffect(() => {
    if (open) {
      setMounted(true)
    } else {
      const t = setTimeout(() => setMounted(false), 300)
      return () => clearTimeout(t)
    }
  }, [open])

  // Fetch channel data
  useEffect(() => {
    if (!open || !channel?.channelId) return
    const controller = new AbortController()
    setData(null)
    setLoading(true)
    setAdded({})
    api.get(`/subscriptions/channel/${channel.channelId}/recent`, { signal: controller.signal })
      .then(r => setData(r.data))
      .catch(e => {
        if (e.code === 'ERR_CANCELED') return
        setData({ videos: [], error: e.response?.data?.error ?? e.message })
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [open, channel?.channelId])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const addToPending = async (video) => {
    await api.post('/pending', {
      video_id: video.videoId,
      title: video.title,
      channel_id: channel.channelId,
      channel_title: channel.title,
      thumbnail_url: video.thumbnail,
    }).catch(() => {})
    setAdded(prev => ({ ...prev, [video.videoId]: 'pending' }))
  }

  const addToFavorites = async (video) => {
    await api.post('/favorites', {
      video_id: video.videoId,
      title: video.title,
      channel_id: channel.channelId,
      channel_title: channel.title,
      thumbnail_url: video.thumbnail,
    }).catch(() => {})
    setAdded(prev => ({ ...prev, [video.videoId]: 'favorite' }))
  }

  if (!mounted && !open) return null

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 transition-opacity duration-300"
        style={{ opacity: open ? 1 : 0 }}
      />

      {/* Drawer panel */}
      <div
        className="fixed inset-y-0 right-0 z-50 flex flex-col w-full max-w-[480px] bg-background border-l shadow-2xl transition-transform duration-300 ease-in-out"
        style={{ transform: open ? 'translateX(0)' : 'translateX(100%)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-5 shrink-0">
          {(data?.channel?.thumbnail || channel?.thumbnail) && (
            <img
              src={data?.channel?.thumbnail || channel?.thumbnail}
              alt=""
              className="size-12 rounded-full object-cover shrink-0"
            />
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
            <a
              href={`https://www.youtube.com/channel/${channel?.channelId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
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

        <div className="px-5 py-3 shrink-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Últimos 5 videos
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="px-5 space-y-4 pb-6">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <VideoSkeleton key={i} />)
            ) : data?.error ? (
              <p className="text-sm text-destructive text-center py-8">{data.error}</p>
            ) : !data?.videos?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin videos recientes</p>
            ) : (
              data.videos.map(video => {
                const state = added[video.videoId]
                return (
                  <div key={video.videoId} className="flex gap-3">
                    {/* Thumbnail */}
                    <a
                      href={`https://www.youtube.com/watch?v=${video.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 relative"
                    >
                      <img
                        src={video.thumbnail}
                        alt=""
                        className="w-36 aspect-video rounded-lg object-cover"
                      />
                      {video.duration && (
                        <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1 rounded">
                          {parseDuration(video.duration)}
                        </span>
                      )}
                    </a>

                    {/* Info */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                      <div>
                        <a
                          href={`https://www.youtube.com/watch?v=${video.videoId}`}
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
                        {state === 'pending' ? (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Clock className="size-2.5" /> Agregado
                          </Badge>
                        ) : state === 'favorite' ? (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Star className="size-2.5" /> Guardado
                          </Badge>
                        ) : (
                          <>
                            <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => addToPending(video)}>
                              <Clock className="size-3 mr-1" /> Pendiente
                            </Button>
                            <Button variant="outline" size="icon" className="size-7" onClick={() => addToFavorites(video)}>
                              <Star className="size-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>
      </div>
    </>,
    document.body
  )
}
