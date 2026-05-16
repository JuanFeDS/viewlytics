import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, Star, Clock, X } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'
import { parseDuration, formatViews, timeAgo, isoToSeconds } from '@/lib/youtube'
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
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [pendingIds, setPendingIds] = useState(new Set())
  const [favIds, setFavIds] = useState(new Set())
  const [mounted, setMounted] = useState(false)
  const [filterShorts, setFilterShorts] = useState(true)
  const [videoCount, setVideoCount] = useState(5)

  // Animate in/out
  useEffect(() => {
    if (open) {
      setMounted(true)
    } else {
      const t = setTimeout(() => setMounted(false), 300)
      return () => clearTimeout(t)
    }
  }, [open])

  // Fetch channel data + existing pending/favorites
  useEffect(() => {
    if (!open || !channel?.channelId) return
    const controller = new AbortController()
    setData(null)
    setLoading(true)
    setPendingIds(new Set())
    setFavIds(new Set())
    setFilterShorts(true)
    setVideoCount(5)

    const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY

    // Load existing saved IDs — independent of video fetch so one never blocks the other
    Promise.all([
      api.get('/pending').then(r => (r.data ?? []).map(v => v.video_id)).catch(() => []),
      api.get('/favorites').then(r => (r.data ?? []).map(v => v.video_id)).catch(() => []),
    ]).then(([p, f]) => {
      setPendingIds(new Set(p))
      setFavIds(new Set(f))
    })

    async function fetchVideos() {
      const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search')
      searchUrl.searchParams.set('key', apiKey)
      searchUrl.searchParams.set('channelId', channel.channelId)
      searchUrl.searchParams.set('part', 'snippet')
      searchUrl.searchParams.set('order', 'date')
      searchUrl.searchParams.set('type', 'video')
      searchUrl.searchParams.set('maxResults', '50')

      const searchRes = await fetch(searchUrl.toString(), { signal: controller.signal })
      const searchData = await searchRes.json()
      if (searchData.error) throw new Error(searchData.error.message)

      const candidates = (searchData.items ?? [])
        .map(item => ({
          videoId: item.id?.videoId ?? '',
          title: item.snippet?.title ?? '',
          thumbnail: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? '',
          publishedAt: item.snippet?.publishedAt ?? '',
        }))
        .filter(v => v.videoId)

      const ids = candidates.map(v => v.videoId).join(',')
      const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos')
      detailsUrl.searchParams.set('key', apiKey)
      detailsUrl.searchParams.set('id', ids)
      detailsUrl.searchParams.set('part', 'contentDetails')

      const detailsRes = await fetch(detailsUrl.toString(), { signal: controller.signal })
      const detailsData = await detailsRes.json()

      const durationMap = Object.fromEntries(
        (detailsData.items ?? []).map(item => [item.id, item.contentDetails?.duration ?? ''])
      )

      const videos = candidates.map(v => ({ ...v, duration: durationMap[v.videoId] ?? '' }))
      setData({ channel: { id: channel.channelId, title: channel.title }, videos })
    }

    fetchVideos()
      .catch(e => {
        if (e.name === 'AbortError') return
        setData({ videos: [], error: e.message })
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
    try {
      await api.post('/pending', {
        video_id: video.videoId,
        title: video.title,
        channel_id: channel.channelId,
        channel_title: channel.title,
        thumbnail_url: video.thumbnail,
      })
      setPendingIds(prev => new Set([...prev, video.videoId]))
      toast.success('Agregado a pendientes')
    } catch (e) {
      const msg = e.response?.data?.error ?? e.message
      if (e.response?.status === 409) {
        setPendingIds(prev => new Set([...prev, video.videoId]))
      } else {
        toast.error('No se pudo agregar a pendientes', { description: msg })
      }
    }
  }

  const addToFavorites = async (video) => {
    try {
      await api.post('/favorites', {
        video_id: video.videoId,
        title: video.title,
        channel_id: channel.channelId,
        channel_title: channel.title,
        thumbnail_url: video.thumbnail,
      })
      setFavIds(prev => new Set([...prev, video.videoId]))
      toast.success('Guardado en favoritos')
    } catch (e) {
      const msg = e.response?.data?.error ?? e.message
      if (e.response?.status === 409) {
        setFavIds(prev => new Set([...prev, video.videoId]))
      } else {
        toast.error('No se pudo guardar en favoritos', { description: msg })
      }
    }
  }

  const removeFromPending = async (video) => {
    try {
      await api.delete(`/pending/${video.videoId}`)
      setPendingIds(prev => { const s = new Set(prev); s.delete(video.videoId); return s })
      toast.success('Quitado de pendientes')
    } catch (e) {
      toast.error('No se pudo quitar', { description: e.response?.data?.error ?? e.message })
    }
  }

  const removeFromFavorites = async (video) => {
    try {
      await api.delete(`/favorites/${video.videoId}`)
      setFavIds(prev => { const s = new Set(prev); s.delete(video.videoId); return s })
      toast.success('Quitado de favoritos')
    } catch (e) {
      toast.error('No se pudo quitar', { description: e.response?.data?.error ?? e.message })
    }
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
        className="fixed inset-y-0 right-0 z-50 w-full max-w-[480px] bg-background border-l shadow-2xl transition-transform duration-300 ease-in-out"
        style={{
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          display: 'grid',
          gridTemplateRows: 'auto auto auto 1fr',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-5">
          {(data?.channel?.thumbnail || channel?.thumbnail) && (
            <a
              href={`https://www.youtube.com/channel/${channel?.channelId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0"
            >
              <img
                src={data?.channel?.thumbnail || channel?.thumbnail}
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
            {(() => {
              const visibleVideos = data?.videos
                ? (filterShorts
                    ? data.videos.filter(v => isoToSeconds(v.duration) > 180).slice(0, videoCount)
                    : data.videos.slice(0, videoCount))
                : []
              return loading ? (
                Array.from({ length: 5 }).map((_, i) => <VideoSkeleton key={i} />)
              ) : data?.error ? (
                <p className="text-sm text-destructive text-center py-8">{data.error}</p>
              ) : !visibleVideos.length ? (
                <p className="text-sm text-muted-foreground text-center py-8">Sin videos recientes</p>
              ) : (
                visibleVideos.map(video => {
                  const inPending = pendingIds.has(video.videoId)
                  const inFav = favIds.has(video.videoId)
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
                          {inPending ? (
                            <Badge
                              variant="secondary"
                              className="text-xs gap-1 cursor-pointer hover:bg-destructive/15 hover:text-destructive transition-colors"
                              onClick={() => removeFromPending(video)}
                              title="Quitar de pendientes"
                            >
                              <Clock className="size-2.5" /> En pendientes
                            </Badge>
                          ) : (
                            <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => addToPending(video)}>
                              <Clock className="size-3 mr-1" /> Pendiente
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="icon"
                            className={`size-7 transition-colors ${inFav ? 'border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-red-500/20 hover:border-red-500/40 hover:text-red-500' : ''}`}
                            onClick={() => inFav ? removeFromFavorites(video) : addToFavorites(video)}
                            title={inFav ? 'Quitar de favoritos' : 'Guardar en favoritos'}
                          >
                            <Star className={`size-3.5 ${inFav ? 'fill-amber-500' : ''}`} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })
              )
            })()}
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
