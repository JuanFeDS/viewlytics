import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ExternalLink, CheckCircle, Play, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { isoToSeconds, fetchChannelVideos, resolveChannelId as resolveChannelIdUtil } from '@/lib/youtube'

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
        isCurrent ? 'bg-white/15 cursor-default ring-1 ring-white/20' : 'hover:bg-white/10 cursor-pointer'
      }`}
    >
      <div className="relative w-28 aspect-video rounded-md overflow-hidden shrink-0 bg-white/10">
        {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full" />}
        {isCurrent && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Play className="size-4 text-white fill-white" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium line-clamp-2 leading-snug ${isCurrent ? 'text-white' : 'text-white/90 group-hover:text-white'}`}>
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

const AUTOPLAY_SECONDS = 5

export default function VideoPlayerModal({ video, onClose, onWatched, queue, onExpand, mini }) {
  const playerRef = useRef(null)
  const containerRef = useRef(null)

  /**
   * The YouTube IFrame API creates callbacks (onStateChange, onError) once at player
   * construction time. Those callbacks form a closure over the values that existed when
   * the effect ran, so props/state read inside them would be permanently stale.
   *
   * Solution: keep a ref for every value the callbacks need. Refs are mutable objects
   * whose `.current` is always the latest value — no closure staleness.
   * Each ref is written unconditionally in the render body so it stays fresh.
   */
  const queueRef = useRef([])
  const activeIdRef = useRef(null)
  const onWatchedRef = useRef(onWatched)
  const handlePlayVideoRef = useRef(null)
  const watchedRef = useRef(false)
  const nextVideoRef = useRef(null)

  const [activeVideo, setActiveVideo] = useState(video)
  const [embedError, setEmbedError] = useState(false)
  const [watched, setWatched] = useState(false)
  const [confirmingClose, setConfirmingClose] = useState(false)
  const [sidebarTab, setSidebarTab] = useState('cola')
  const [filterShorts, setFilterShorts] = useState(true)
  const [recentVideos, setRecentVideos] = useState([])
  const [recentLoading, setRecentLoading] = useState(false)
  const [recentError, setRecentError] = useState(null)
  const [countdownVideo, setCountdownVideo] = useState(null)
  const [countdown, setCountdown] = useState(AUTOPLAY_SECONDS)

  queueRef.current = queue ?? []
  onWatchedRef.current = onWatched

  const queueList = queue ?? []
  const currentQueueIdx = queueList.findIndex(v => (v.video_id ?? v.videoId) === (activeVideo?.video_id ?? activeVideo?.videoId))
  nextVideoRef.current =
    currentQueueIdx >= 0 && currentQueueIdx < queueList.length - 1
      ? queueList[currentQueueIdx + 1]
      : currentQueueIdx === -1 && queueList.length > 0
        ? queueList[0]
        : null

  useEffect(() => {
    setActiveVideo(video)
    setConfirmingClose(false)
    setCountdownVideo(null)
  }, [video])

  const activeId = activeVideo?.video_id ?? activeVideo?.videoId
  activeIdRef.current = activeId

  useEffect(() => {
    if (!activeVideo) return
    setEmbedError(false)
    setWatched(false)
    watchedRef.current = false
    setCountdownVideo(null)

    let destroyed = false

    loadYouTubeAPI().then(YT => {
      if (destroyed || !containerRef.current) return
      containerRef.current.innerHTML = ''
      const playerDiv = document.createElement('div')
      containerRef.current.appendChild(playerDiv)
      playerRef.current = new YT.Player(playerDiv, {
        videoId: activeIdRef.current,
        width: '100%',
        height: '100%',
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1 },
        events: {
          onError: (e) => { if ([100, 101, 150].includes(e.data)) setEmbedError(true) },
          onStateChange: (e) => {
            if (e.data !== 0) return
            const currentId = activeIdRef.current

            if (!watchedRef.current) {
              watchedRef.current = true
              setWatched(true)
              onWatchedRef.current?.(currentId)
            }

            const next = nextVideoRef.current
            if (next) {
              setCountdownVideo(next)
              setCountdown(AUTOPLAY_SECONDS)
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

  useEffect(() => {
    if (!countdownVideo) return
    const next = countdownVideo
    setCountdown(AUTOPLAY_SECONDS)
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          setCountdownVideo(null)
          handlePlayVideoRef.current?.(next)
          return AUTOPLAY_SECONDS
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [countdownVideo])

  useEffect(() => {
    setRecentVideos([])
    setRecentError(null)
    if (!activeVideo) return

    const channelId = activeVideo.channel_id ?? activeVideo.channelId
    const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY
    if (!apiKey) { setRecentError('API key de YouTube no configurada'); return }

    setRecentLoading(true)

    const load = async () => {
      const resolvedId = channelId ?? await resolveChannelIdUtil(apiKey, activeId)
      if (!resolvedId) { setRecentError('No se pudo obtener el canal del video'); return }
      const videos = await fetchChannelVideos(apiKey, resolvedId, { maxResults: 15, excludeVideoId: activeId })
      setRecentVideos(videos.map(v => ({ ...v, channel_id: resolvedId })))
    }

    load().catch(e => setRecentError(e.message)).finally(() => setRecentLoading(false))
  }, [activeId])

  useEffect(() => {
    if (mini) return
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (confirmingClose) setConfirmingClose(false)
        else setConfirmingClose(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [confirmingClose, mini])

  const handlePlayVideo = (v) => setActiveVideo(v)
  handlePlayVideoRef.current = handlePlayVideo

  if (!activeVideo) return null

  const ytUrl = `https://www.youtube.com/watch?v=${activeId}`
  const channelName = activeVideo.channel_title ?? activeVideo.channelTitle

  // ─── Layout classes ──────────────────────────────────────────────────────────
  // containerRef stays at the same JSX depth in both modes — only CSS changes.
  const outerCls = mini
    ? 'fixed bottom-4 right-4 z-50 w-72 rounded-xl overflow-hidden shadow-2xl bg-zinc-900'
    : 'fixed inset-0 z-50 bg-black/90 overflow-y-auto'
  const centerCls = mini ? '' : 'flex min-h-full items-center justify-center p-4'
  const contentCls = mini ? '' : 'relative w-full max-w-6xl flex flex-col lg:flex-row gap-4 items-stretch'
  const leftColCls = mini ? '' : 'flex-1 flex flex-col gap-2 min-w-0'
  const playerAreaCls = mini
    ? 'relative w-full aspect-video bg-black cursor-pointer'
    : 'relative w-full aspect-video bg-black rounded-xl overflow-hidden'

  const modal = createPortal(
    <div
      className={outerCls}
      onClick={!mini ? (e) => { if (e.target === e.currentTarget) setConfirmingClose(true) } : undefined}
    >
      <div
        className={centerCls}
        onClick={!mini ? (e) => { if (e.target === e.currentTarget) setConfirmingClose(true) } : undefined}
      >
        <div className={contentCls}>

          {/* Close button — full mode only */}
          {!mini && (
            <button
              onClick={() => setConfirmingClose(true)}
              className="absolute -top-2 -right-2 z-30 flex items-center justify-center size-8 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-white/70 hover:text-white transition-colors shadow-lg"
              title="Cerrar"
            >
              <X className="size-4" />
            </button>
          )}

          <div className={leftColCls}>

            {/* ── Player area — containerRef is always here ── */}
            <div className={playerAreaCls}>
              {embedError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-900">
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

              {/* Mini mode: hover overlay with expand + close */}
              {mini && (
                <div className="absolute inset-0 flex flex-col justify-between opacity-0 hover:opacity-100 transition-opacity duration-150">
                  <div className="flex justify-end gap-1 p-1.5 bg-gradient-to-b from-black/60 to-transparent">
                    <button
                      onClick={onExpand}
                      className="flex items-center justify-center size-6 rounded bg-black/70 hover:bg-black/90 text-white transition-colors"
                      title="Expandir"
                    >
                      <Maximize2 className="size-3" />
                    </button>
                    <button
                      onClick={onClose}
                      className="flex items-center justify-center size-6 rounded bg-black/70 hover:bg-black/90 text-white transition-colors"
                      title="Cerrar"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                </div>
              )}

              {/* Full mode: confirm close overlay */}
              {!mini && confirmingClose && (
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
            {/* ── /Player area ── */}

            {/* Full mode: autoplay countdown */}
            {!mini && countdownVideo && (
              <div className="flex items-center gap-3 bg-zinc-900 border border-white/10 rounded-xl p-3">
                {countdownVideo.thumbnail_url && (
                  <img src={countdownVideo.thumbnail_url} alt="" className="w-16 aspect-video rounded object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white/50 text-[10px] uppercase tracking-wider">A continuación</p>
                  <p className="text-white text-xs font-medium line-clamp-1 mt-0.5">{countdownVideo.title}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => { setCountdownVideo(null); handlePlayVideo(countdownVideo) }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-black rounded-lg text-xs font-medium hover:bg-white/90 transition-colors"
                  >
                    <Play className="size-3 fill-black" /> Reproducir
                  </button>
                  <button
                    onClick={() => setCountdownVideo(null)}
                    className="flex items-center justify-center size-8 text-white/60 hover:text-white border border-white/15 hover:border-white/30 rounded-lg text-sm font-semibold transition-colors"
                    title="Cancelar"
                  >
                    {countdown}
                  </button>
                </div>
              </div>
            )}

            {/* Full mode: info bar */}
            {!mini && (
              <div className="flex items-center gap-3 mt-1">
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
            )}

          </div>

          {/* Full mode: sidebar */}
          {!mini && (
            <div className="flex w-full lg:w-64 xl:w-72 shrink-0 flex-col bg-zinc-900 border border-white/10 rounded-xl overflow-hidden max-h-[50vh] lg:max-h-[calc(100vh-8rem)]">
              <div className="flex border-b border-white/10 shrink-0">
                {[
                  { id: 'cola', label: `Cola${queueList.length > 0 ? ` (${queueList.length})` : ''}` },
                  { id: 'recientes', label: 'Recientes' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setSidebarTab(tab.id)}
                    className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                      sidebarTab === tab.id ? 'text-white border-white' : 'text-white/50 border-transparent hover:text-white/80'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="px-2 py-1.5 border-b border-white/10 shrink-0 flex justify-end">
                <Badge
                  variant={filterShorts ? 'secondary' : 'outline'}
                  className="cursor-pointer select-none text-xs"
                  onClick={() => setFilterShorts(f => !f)}
                >
                  Sin Shorts
                </Badge>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-0.5">
                {sidebarTab === 'cola' && (() => {
                  const visible = filterShorts
                    ? queueList.filter(v => !v.duration || isoToSeconds(v.duration) > 180)
                    : queueList
                  return visible.length === 0
                    ? <p className="text-xs text-white/40 text-center py-10">Cola vacía</p>
                    : visible.map(v => (
                        <SidebarItem
                          key={v.video_id ?? v.videoId}
                          video={v}
                          isCurrent={(v.video_id ?? v.videoId) === activeId}
                          onClick={handlePlayVideo}
                        />
                      ))
                })()}

                {sidebarTab === 'recientes' && (() => {
                  const visible = filterShorts
                    ? recentVideos.filter(v => isoToSeconds(v.duration) > 180)
                    : recentVideos
                  return recentLoading
                    ? <SidebarSkeleton />
                    : recentError
                      ? <p className="text-xs text-red-400/80 text-center py-10 px-3">{recentError}</p>
                      : visible.length === 0
                        ? <p className="text-xs text-white/40 text-center py-10">Sin videos recientes</p>
                        : visible.map(v => (
                            <SidebarItem
                              key={v.video_id}
                              video={v}
                              isCurrent={false}
                              onClick={handlePlayVideo}
                            />
                          ))
                })()}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Mini mode: title bar */}
      {mini && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 bg-zinc-900">
          <p
            className="text-white text-xs font-medium flex-1 line-clamp-1 cursor-pointer hover:text-white/80 transition-colors"
            onClick={onExpand}
          >
            {activeVideo.title}
          </p>
          <button
            onClick={onExpand}
            className="flex items-center justify-center size-5 text-white/60 hover:text-white transition-colors shrink-0"
            title="Expandir"
          >
            <Maximize2 className="size-3" />
          </button>
          <button
            onClick={onClose}
            className="flex items-center justify-center size-5 text-white/60 hover:text-white transition-colors shrink-0"
            title="Cerrar"
          >
            <X className="size-3" />
          </button>
        </div>
      )}
    </div>,
    document.body
  )

  return <>{modal}</>
}
