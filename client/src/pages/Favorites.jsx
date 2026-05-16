import { useEffect, useState } from 'react'
import { Star, Trash2, Eye, ArrowUpDown, Play, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'
import VideoPlayerModal from '@/components/VideoPlayerModal'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'

function VideoSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="w-full aspect-video rounded-xl" />
      <Skeleton className="h-3.5 w-full" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  )
}

function VideoCard({ v, onRemove, onPlay }) {
  const ytUrl = `https://www.youtube.com/watch?v=${v.video_id}`

  return (
    <div className="group relative flex flex-col gap-2">
      <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button
          onClick={() => onRemove(v.video_id)}
          className="flex items-center justify-center size-8 rounded-lg bg-black/60 hover:bg-red-600 text-white transition-colors"
          title="Eliminar de favoritos"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {/* Thumbnail — click opens player */}
      <div
        role="button"
        onClick={() => onPlay(v)}
        className="relative block w-full aspect-video rounded-xl overflow-hidden bg-muted cursor-pointer"
      >
        {v.thumbnail_url
          ? <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" />
          : <div className="w-full h-full flex items-center justify-center"><Eye className="size-8 text-muted-foreground/40" /></div>
        }
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-200 flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-full p-3">
            <Play className="size-6 text-white fill-white" />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-0.5 px-0.5">
        <div className="flex items-start justify-between gap-1">
          <button
            onClick={() => onPlay(v)}
            className="text-sm font-medium line-clamp-2 leading-snug hover:underline text-left"
          >
            {v.title || <span className="text-muted-foreground italic">Sin título</span>}
          </button>
          <a href={ytUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 mt-0.5 text-muted-foreground/50 hover:text-muted-foreground" title="Abrir en YouTube">
            <ExternalLink className="size-3" />
          </a>
        </div>
        <p className="text-xs text-muted-foreground truncate">{v.channel_title || '—'}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(v.saved_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>
    </div>
  )
}

const SORT_OPTIONS = [
  { value: 'newest', label: 'Más recientes' },
  { value: 'oldest', label: 'Más antiguos' },
  { value: 'channel', label: 'Por canal' },
]

function sortVideos(videos, sort) {
  return [...videos].sort((a, b) => {
    if (sort === 'oldest') return new Date(a.saved_at) - new Date(b.saved_at)
    if (sort === 'channel') return (a.channel_title ?? '').localeCompare(b.channel_title ?? '')
    return new Date(b.saved_at) - new Date(a.saved_at)
  })
}

export default function Favorites() {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sort, setSort] = useState('newest')
  const [playerVideo, setPlayerVideo] = useState(null)

  useEffect(() => {
    api.get('/favorites')
      .then(async r => {
        const videos = r.data ?? []
        const missing = videos.filter(v => !v.title || !v.thumbnail_url)

        if (missing.length > 0) {
          const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY
          const ids = missing.map(v => v.video_id).filter(Boolean).join(',')
          const url = new URL('https://www.googleapis.com/youtube/v3/videos')
          url.searchParams.set('key', apiKey)
          url.searchParams.set('id', ids)
          url.searchParams.set('part', 'snippet')

          const ytData = await fetch(url.toString()).then(r => r.json()).catch(() => ({ items: [] }))
          const byId = Object.fromEntries(
            (ytData.items ?? []).map(item => [item.id, {
              title: item.snippet?.title,
              thumbnail_url: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url,
              channel_title: item.snippet?.channelTitle,
            }])
          )

          setVideos(videos.map(v => ({
            ...v,
            title: v.title || byId[v.video_id]?.title || '(sin título)',
            thumbnail_url: v.thumbnail_url || byId[v.video_id]?.thumbnail_url || null,
            channel_title: v.channel_title || byId[v.video_id]?.channel_title || '—',
          })))
        } else {
          setVideos(videos)
        }
      })
      .catch(e => setError(e.response?.data?.error ?? e.message))
      .finally(() => setLoading(false))
  }, [])

  const remove = async (videoId) => {
    try {
      await api.delete(`/favorites/${videoId}`)
      setVideos(prev => prev.filter(v => v.video_id !== videoId))
      toast.success('Eliminado de favoritos')
    } catch (e) {
      toast.error('No se pudo eliminar: ' + (e.response?.data?.error ?? e.message))
    }
  }

  const sorted = sortVideos(videos, sort)

  return (
    <>
    <VideoPlayerModal
      video={playerVideo}
      onClose={() => setPlayerVideo(null)}
      queue={sorted}
      onPlayVideo={setPlayerVideo}
    />
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Badge variant="outline" className="gap-1.5">
          <Star className="size-3" />{loading ? '...' : videos.length} guardados
        </Badge>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ArrowUpDown className="size-3" />
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="bg-transparent border-none text-xs text-muted-foreground focus:outline-none cursor-pointer"
          >
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <VideoSkeleton key={i} />)}
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState icon={Star} title="Sin favoritos" description="Guarda videos desde la búsqueda para verlos aquí" />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {sorted.map(v => <VideoCard key={v.id} v={v} onRemove={remove} onPlay={setPlayerVideo} />)}
        </div>
      )}
    </div>
    </>
  )
}
