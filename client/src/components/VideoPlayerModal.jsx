import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ExternalLink, CheckCircle, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'

function loadYouTubeAPI() {
  return new Promise((resolve) => {
    if (window.YT?.Player) { resolve(window.YT); return }
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT) }
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(script)
    }
  })
}

function SidebarItem({ video, isCurrent, onClick }) {
  const thumb = video.thumbnail_url ?? video.thumbnail
  const channel = video.channel_title ?? video.channelTitle

  return (
    <button
      onClick={() => !isCurrent && onClick(video)}
      className={`group flex gap-2.5 p-2 rounded-lg w-full text-left transition-colors ${
        isCurrent
          ? 'bg-white/15 cursor-default ring-1 ring-white/20'
          : 'hover:bg-white/10 cursor-pointer'
      }`}
    >
      <div className="relative w-28 aspect-video rounded-md overflow-hidden shrink-0 bg-white/10">
        {thumb
          ? <img src={thumb} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full" />
        }
        {isCurrent && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Play className="size-4 text-white fill-white" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium line-clamp-2 leading-snug ${
          isCurrent ? 'text-white' : 'text-white/90 group-hover:text-white'
        }`}>
          {video.title}
        </p>
        {channel && <p className="text-xs text-white/45 truncate mt-0.5">{channel}</p>}
      </div>
    </button>
  )
}

function SidebarSkeleton() {
  return Array.from({ length: 5 }).map((_, i) => (
    <div key={i} className="flex gap-2.5 p-2 animate-pulse">
      <div className="w-28 aspect-video rounded-md bg-white/10 shrink-0" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-2 bg-white/10 rounded w-full" />
        <div className="h-2 bg-white/10 rounded w-2/3" />
      </div>
    </div>
  ))
}

export default function VideoPlayerModal({ video, onClose, onWatched, queue, onPlayVideo }) {
  const playerRef = useRef(null)
  const containerRef = useRef(null)

  // Active video — can be changed internally via sidebar
  const [activeVideo, setActiveVideo] = useState(video)
  const [embedError, setEmbedError] = useState(false)
  const [watched, setWatched] = useState(false)
  const [confirmingClose, setConfirmingClose] = useState(false)
  const [sidebarTab, setSidebarTab] = useState('cola')
  const [recentVideos, setRecentVideos] = useState([])
  const [recentLoading, setRecentLoading] = useState(false)
  const [recentError, setRecentError] = useState(null)

  // Sync when parent changes the video
  useEffect(() => { setActiveVideo(video) }, [video])

  const activeId = activeVideo?.video_id ?? activeVideo?.videoId

  // YouTube IFrame player
  useEffect(() => {
    if (!activeVideo) return
    setEmbedError(false)
    setWatched(false)

    let destroyed = false

    loadYouTubeAPI().then(YT => {
      if (destroyed || !containerRef.current) return
      containerRef.current.innerHTML = ''
      const playerDiv = document.createElement('div')
      containerRef.current.appendChild(playerDiv)
      playerRef.current = new YT.Player(playerDiv, {
        videoId: activeId,
        width: '100%',
        height: '100%',
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1 },
        events: {
          onError: (e) => { if ([100, 101, 150].includes(e.data)) setEmbedError(true) },
          onStateChange: (e) => {
            if (e.data === window.YT.PlayerState.ENDED && !watched) {
              setWatched(true)
              onWatched?.(activeId)
            }
          },
        },
      })
    })

    return () => {
      destroyed = true
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [activeId])

  // Fetch recent videos from the active video's channel
  useEffect(() => {
    setRecentVideos([])
    setRecentError(null)

    if (!activeVideo) return
    const channelId = activeVideo.channel_id ?? activeVideo.channelId
    const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY
    if (!apiKey) {
      setRecentError('API key de YouTube no configurada')
      return
    }

    setRecentLoading(true)

    // If channel_id is missing, resolve it first via videos.list (1 quota unit)
    const resolveChannelId = async () => {
      if (channelId) return channelId
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?key=${apiKey}&id=${activeId}&part=snippet`
      )
      const data = await res.json()
      return data.items?.[0]?.snippet?.channelId ?? null
    }

    resolveChannelId()
      .then(resolvedId => {
        if (!resolvedId) { setRecentError('No se pudo obtener el canal del video'); return }
        const url = new URL('https://www.googleapis.com/youtube/v3/search')
        url.searchParams.set('key', apiKey)
        url.searchParams.set('channelId', resolvedId)
        url.searchParams.set('part', 'snippet')
        url.searchParams.set('order', 'date')
        url.searchParams.set('type', 'video')
        url.searchParams.set('maxResults', '15')
        return fetch(url.toString()).then(r => r.json()).then(data => {
          if (data.error) { setRecentError(data.error.message ?? 'Error de YouTube API'); return }
          setRecentVideos(
            (data.items ?? [])
              .filter(item => item.id?.videoId && item.id.videoId !== activeId)
              .map(item => ({
                video_id: item.id.videoId,
                title: item.snippet.title,
                channel_id: resolvedId,
                channel_title: item.snippet.channelTitle,
                thumbnail_url:
                  item.snippet.thumbnails?.medium?.url ??
                  item.snippet.thumbnails?.default?.url,
              }))
          )
        })
      })
      .catch(e => setRecentError(e.message))
      .finally(() => setRecentLoading(false))
  }, [activeId])

  // Escape key
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (confirmingClose) { setConfirmingClose(false) } else { setConfirmingClose(true) }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [confirmingClose])

  const handlePlayVideo = (v) => {
    setActiveVideo(v)
    onPlayVideo?.(v)
  }

  if (!activeVideo) return null

  const ytUrl = `https://www.youtube.com/watch?v=${activeId}`
  const queueList = queue ?? []
  const channelName = activeVideo.channel_title ?? activeVideo.channelTitle

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/90 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) setConfirmingClose(true) }}
    >
      <div
        className="flex min-h-full items-center justify-center p-4"
        onClick={(e) => { if (e.target === e.currentTarget) setConfirmingClose(true) }}
      >
      <div className="relative w-full max-w-6xl flex flex-col lg:flex-row gap-4 items-stretch">

        {/* Close button — top-right corner of the whole modal card */}
        <button
          onClick={() => setConfirmingClose(true)}
          className="absolute -top-2 -right-2 z-30 flex items-center justify-center size-8 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-white/70 hover:text-white transition-colors shadow-lg"
          title="Cerrar"
        >
          <X className="size-4" />
        </button>

        {/* Left: player + info bar */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden">
            {embedError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                <p className="text-sm text-white/60">Este video no permite reproducción embebida</p>
                <a
                  href={ytUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium text-white transition-colors"
                >
                  <ExternalLink className="size-4" /> Abrir en YouTube
                </a>
              </div>
            ) : (
              <div ref={containerRef} className="w-full h-full" />
            )}

            {/* Confirm close overlay */}
            {confirmingClose && (
              <div
                className="absolute inset-0 z-20 bg-black/70 flex items-center justify-center"
                onKeyDown={e => {
                  if (e.key !== 'Tab') return
                  const buttons = e.currentTarget.querySelectorAll('button')
                  const first = buttons[0], last = buttons[buttons.length - 1]
                  if (e.shiftKey) {
                    if (document.activeElement === first) { e.preventDefault(); last.focus() }
                  } else {
                    if (document.activeElement === last) { e.preventDefault(); first.focus() }
                  }
                }}
              >
                <div className="bg-zinc-900 border border-white/10 rounded-xl px-6 py-5 flex flex-col items-center gap-4 shadow-xl">
                  <p className="text-white text-sm font-medium">¿Cerrar el reproductor?</p>
                  <div className="flex gap-3">
                    <button
                      autoFocus
                      onClick={() => setConfirmingClose(false)}
                      className="px-4 py-1.5 rounded-lg text-xs font-medium text-white/70 hover:text-white border border-white/15 hover:border-white/30 transition-colors focus:outline-none focus:ring-2 focus:ring-white/40"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={onClose}
                      className="px-4 py-1.5 rounded-lg text-xs font-medium bg-white text-black hover:bg-white/90 transition-colors focus:outline-none focus:ring-2 focus:ring-white/60"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium text-sm line-clamp-1">{activeVideo.title}</p>
              {channelName && <p className="text-white/50 text-xs mt-0.5">{channelName}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {watched && onWatched && (
                <span className="flex items-center gap-1.5 text-xs text-green-400">
                  <CheckCircle className="size-3.5" /> Marcado como visto
                </span>
              )}
              <a href={ytUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="icon" className="size-8 text-white/50 hover:text-white">
                  <ExternalLink className="size-4" />
                </Button>
              </a>
            </div>
          </div>
        </div>

        {/* Right: sidebar (hidden on small screens) */}
        <div className="hidden lg:flex lg:w-64 xl:w-72 shrink-0 flex-col bg-zinc-900 border border-white/10 rounded-xl overflow-hidden max-h-[calc(100vh-8rem)]">
          {/* Tab headers */}
          <div className="flex border-b border-white/10 shrink-0">
            {[
              { id: 'cola', label: `Cola${queueList.length > 0 ? ` (${queueList.length})` : ''}` },
              { id: 'recientes', label: 'Recientes' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSidebarTab(tab.id)}
                className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                  sidebarTab === tab.id
                    ? 'text-white border-white'
                    : 'text-white/50 border-transparent hover:text-white/80'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-0.5">
            {sidebarTab === 'cola' && (
              <>
                {queueList.length === 0 ? (
                  <p className="text-xs text-white/40 text-center py-10">Cola vacía</p>
                ) : (
                  queueList.map(v => (
                    <SidebarItem
                      key={v.video_id ?? v.videoId}
                      video={v}
                      isCurrent={(v.video_id ?? v.videoId) === activeId}
                      onClick={handlePlayVideo}
                    />
                  ))
                )}
              </>
            )}

            {sidebarTab === 'recientes' && (
              <>
                {recentLoading
                  ? <SidebarSkeleton />
                  : recentError
                    ? <p className="text-xs text-red-400/80 text-center py-10 px-3">{recentError}</p>
                    : recentVideos.length === 0
                      ? <p className="text-xs text-white/40 text-center py-10">Sin videos recientes</p>
                      : recentVideos.map(v => (
                          <SidebarItem
                            key={v.video_id}
                            video={v}
                            isCurrent={false}
                            onClick={handlePlayVideo}
                          />
                        ))
                }
              </>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>,
    document.body
  )
}
