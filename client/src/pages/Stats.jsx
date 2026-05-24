import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import ReactECharts from 'echarts-for-react'
import { Users, Clock, Star, Tag, CheckCircle, BarChart2, RefreshCw, Ghost, TrendingUp, TrendingDown, Flame, HelpCircle, ThumbsUp, BookmarkCheck, ListVideo } from 'lucide-react'
import api, { streamSSE } from '@/lib/api'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EmptyState } from '@/components/ui/empty-state'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import ChannelDrawer from '@/components/ChannelDrawer'
import { useTheme } from '@/hooks/useTheme'

const COLORS = ['#6366f1', '#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6']

// ─── Small helpers ────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color, sub }) {
  return (
    <div className="rounded-2xl border bg-card p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-center size-10 rounded-xl" style={{ background: `${color}20` }}>
        <Icon className="size-5" style={{ color }} />
      </div>
      <div>
        <p className="text-3xl font-bold tracking-tight">{value ?? '—'}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  )
}

function ChartCard({ title, subtitle, children, loading }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <p className="font-semibold text-sm">{title}</p>
      <p className="text-xs text-muted-foreground mt-0.5 mb-4">{subtitle}</p>
      {loading ? <Skeleton className="h-52 w-full rounded-xl" /> : children}
    </div>
  )
}

function EngagementBadge({ channel }) {
  if (channel.recentVideos === 0)
    return <Badge variant="outline" className="text-xs text-muted-foreground">Inactivo</Badge>
  if (channel.engagementScore === 0)
    return <Badge variant="outline" className="text-xs text-orange-500 border-orange-300">Fantasma</Badge>
  if (channel.watchedCount > 0)
    return <Badge variant="outline" className="text-xs text-green-600 border-green-300">Consumiendo</Badge>
  return <Badge variant="outline" className="text-xs text-blue-500 border-blue-300">Pendiente</Badge>
}

// ─── Tab: Resumen ─────────────────────────────────────────────────────────────

function TabResumen({ stats, ytStats, ytApiStats, loading, theme }) {
  const tc = theme === 'dark' ? '#9ca3af' : '#6b7280'
  const gc = theme === 'dark' ? '#374151' : '#f3f4f6'

  const totalVideos = (stats?.pendingCount ?? 0) + (stats?.watchedCount ?? 0)
  const watchRate = totalVideos > 0 ? Math.round((stats.watchedCount / totalVideos) * 100) : 0

  // Subscription history by year — derived from subscription items
  const subHistory = useMemo(() => {
    const items = ytStats?.subscriptionItems ?? []
    if (!items.length) return []
    const byYear = {}
    items.forEach(s => {
      const year = new Date(s.snippet.publishedAt).getFullYear()
      byYear[year] = (byYear[year] || 0) + 1
    })
    return Object.entries(byYear)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([year, count]) => ({ year: String(year), count }))
  }, [ytStats?.subscriptionItems])

  const subHistoryOpt = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p) => `${p[0].name}: ${p[0].value} suscripciones` },
    grid: { left: 16, right: 16, top: 10, bottom: 0, containLabel: true },
    xAxis: { type: 'category', data: subHistory.map(d => d.year), axisLabel: { color: tc, fontSize: 11 }, axisTick: { show: false }, axisLine: { lineStyle: { color: gc } } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: gc } }, axisLabel: { color: tc }, minInterval: 1 },
    series: [{
      type: 'bar',
      data: subHistory.map((d, i) => ({
        value: d.count,
        itemStyle: { color: COLORS[i % COLORS.length], borderRadius: [4, 4, 0, 0] },
      })),
      label: { show: true, position: 'top', color: tc, fontSize: 10 },
    }],
  }), [subHistory, tc, gc])

  const likesOpt = useMemo(() => {
    const channels = ytApiStats?.topLikedChannels ?? []
    if (!channels.length) return null
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p) => `${p[0].name}: ${p[0].value} likes` },
      grid: { left: 16, right: 16, top: 10, bottom: 0, containLabel: true },
      xAxis: { type: 'value', splitLine: { lineStyle: { color: gc } }, axisLabel: { color: tc } },
      yAxis: {
        type: 'category',
        data: [...channels].reverse().map(c => c.title),
        axisLabel: { color: tc, width: 130, overflow: 'truncate' },
        axisTick: { show: false },
      },
      series: [{
        type: 'bar',
        data: [...channels].reverse().map((c, i) => ({
          value: c.count,
          itemStyle: { color: COLORS[i % COLORS.length], borderRadius: [0, 4, 4, 0] },
        })),
        label: { show: true, position: 'right', color: tc, fontSize: 10 },
      }],
    }
  }, [ytApiStats?.topLikedChannels, tc, gc])

  const weeklyOpt = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: 16, right: 16, top: 10, bottom: 0, containLabel: true },
    xAxis: { type: 'category', data: stats?.weeklyAdded?.map(w => w.week) ?? [], axisLabel: { color: tc, fontSize: 11 }, axisTick: { show: false }, axisLine: { lineStyle: { color: gc } } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: gc } }, axisLabel: { color: tc }, minInterval: 1 },
    series: [{
      type: 'line', data: stats?.weeklyAdded?.map(w => w.count) ?? [],
      smooth: true, symbol: 'circle', symbolSize: 7,
      lineStyle: { color: '#6366f1', width: 2.5 },
      itemStyle: { color: '#6366f1' },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(99,102,241,0.3)' }, { offset: 1, color: 'rgba(99,102,241,0)' }] } },
    }],
  }), [stats, tc, gc])

  const donutOpt = useMemo(() => ({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, textStyle: { color: tc } },
    series: [{
      type: 'pie', radius: ['50%', '75%'],
      label: { show: false },
      emphasis: { label: { show: true, fontSize: 14, fontWeight: 'bold' } },
      data: [
        { value: stats?.watchedCount ?? 0, name: 'Vistos', itemStyle: { color: '#10b981' } },
        { value: stats?.pendingCount ?? 0, name: 'Pendientes', itemStyle: { color: '#6366f1' } },
      ],
    }],
  }), [stats, tc])

  const skeletonCards = Array.from({ length: 5 }).map((_, i) => (
    <div key={i} className="rounded-2xl border bg-card p-5 space-y-3">
      <Skeleton className="size-10 rounded-xl" /><Skeleton className="h-7 w-16" /><Skeleton className="h-3 w-24" />
    </div>
  ))

  return (
    <div className="space-y-6">

      {/* YouTube data cards */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">En YouTube</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {loading ? skeletonCards : <>
            <StatCard icon={Users} label="Suscripciones" value={ytStats?.subscriptions} color="#6366f1" />
            <StatCard icon={ThumbsUp} label="Videos que te gustaron" value={ytApiStats?.likesTotal ?? '—'} color="#f43f5e" />
            <StatCard icon={ListVideo} label="Playlists" value={ytStats?.playlists} color="#3b82f6" />
            {ytApiStats?.watchLaterTotal != null && (
              <StatCard icon={BookmarkCheck} label="Ver más tarde" value={ytApiStats.watchLaterTotal} color="#f59e0b" />
            )}
          </>}
        </div>
      </div>

      {/* App data cards */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">En la app</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {loading ? skeletonCards : <>
            <StatCard icon={Clock} label="Pendientes" value={stats?.pendingCount} color="#f59e0b" />
            <StatCard icon={CheckCircle} label="Vistos" value={stats?.watchedCount} color="#10b981" sub={`${watchRate}% completado`} />
            <StatCard icon={Star} label="Favoritos" value={stats?.favoritesCount} color="#f43f5e" />
            <StatCard icon={Tag} label="Categorías" value={ytStats?.categories} color="#8b5cf6" />
          </>}
        </div>
      </div>

      {/* YouTube charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Cuándo te suscribiste"
          subtitle="Número de canales por año de suscripción"
          loading={loading}
        >
          {subHistory.length === 0
            ? <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">Sin datos</div>
            : <ReactECharts option={subHistoryOpt} style={{ height: 220 }} theme={theme === 'dark' ? 'dark' : undefined} />}
        </ChartCard>

        <ChartCard
          title="Canales que más te han gustado"
          subtitle="Basado en tus últimos 200 likes"
          loading={loading}
        >
          {!likesOpt
            ? <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">Sin datos de likes</div>
            : <ReactECharts option={likesOpt} style={{ height: 220 }} theme={theme === 'dark' ? 'dark' : undefined} />}
        </ChartCard>
      </div>

      {/* App charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Actividad en la app" subtitle="Videos agregados a pendientes por semana" loading={loading}>
          <ReactECharts option={weeklyOpt} style={{ height: 200 }} theme={theme === 'dark' ? 'dark' : undefined} />
        </ChartCard>
        <ChartCard title="Vistos vs Pendientes" subtitle="De tu lista de videos guardados" loading={loading}>
          <ReactECharts option={donutOpt} style={{ height: 200 }} theme={theme === 'dark' ? 'dark' : undefined} />
        </ChartCard>
      </div>

    </div>
  )
}

// ─── Tab: Suscripciones ───────────────────────────────────────────────────────

function TabSuscripciones({ data, loading, progress, message, onRefresh }) {
  const [filter, setFilter] = useState('all')
  const [selectedChannel, setSelectedChannel] = useState(null)
  const { theme } = useTheme()
  const tc = theme === 'dark' ? '#9ca3af' : '#6b7280'
  const gc = theme === 'dark' ? '#374151' : '#f3f4f6'

  const channels = useMemo(() => data?.channels ?? [], [data])
  const categoryStats = useMemo(() => data?.categoryStats ?? [], [data])

  const filtered = useMemo(() => {
    if (filter === 'all') return channels
    if (filter === 'consuming') return channels.filter(c => c.watchedCount > 0)
    if (filter === 'ghosts') return channels.filter(c => c.recentVideos > 0 && c.engagementScore === 0)
    if (filter === 'inactive') return channels.filter(c => c.recentVideos === 0)
    // filter is a category id
    return channels.filter(c => c.categories.some(cat => cat.id === Number(filter)))
  }, [channels, filter])

  const ghostCount = channels.filter(c => c.recentVideos > 0 && c.engagementScore === 0).length
  const inactiveCount = channels.filter(c => c.recentVideos === 0).length
  const consumingCount = channels.filter(c => c.watchedCount > 0).length

  // Category engagement chart
  const catChartOpt = useMemo(() => {
    if (!categoryStats.length) return null
    const sorted = [...categoryStats].sort((a, b) => (b.totalWatched + b.totalPending) - (a.totalWatched + a.totalPending))
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { bottom: 0, textStyle: { color: tc } },
      grid: { left: 16, right: 16, top: 10, bottom: 40, containLabel: true },
      xAxis: { type: 'category', data: sorted.map(c => c.name), axisLabel: { color: tc, fontSize: 11, interval: 0, overflow: 'truncate', width: 70 }, axisTick: { show: false } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: gc } }, axisLabel: { color: tc }, minInterval: 1 },
      series: [
        { name: 'Vistos', type: 'bar', stack: 'total', data: sorted.map(c => c.totalWatched), itemStyle: { color: '#10b981' }, barMaxWidth: 40 },
        { name: 'Pendientes', type: 'bar', stack: 'total', data: sorted.map(c => c.totalPending), itemStyle: { color: '#6366f1' }, barMaxWidth: 40, borderRadius: [4, 4, 0, 0] },
      ],
    }
  }, [categoryStats, tc, gc])

  const catDonutOpt = useMemo(() => {
    if (!categoryStats.length) return null
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', formatter: '{b}: {c} canales' },
      legend: { bottom: 0, textStyle: { color: tc } },
      series: [{
        type: 'pie', radius: ['45%', '70%'],
        label: { show: false },
        data: categoryStats.map((c, i) => ({ value: c.channelCount, name: c.name, itemStyle: { color: c.color || COLORS[i % COLORS.length] } })),
      }],
    }
  }, [categoryStats, tc])

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-6 max-w-sm mx-auto text-center">
      <div className="size-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
        <BarChart2 className="size-7 text-indigo-500 animate-pulse" />
      </div>
      <div className="w-full space-y-2">
        <Progress value={progress} className="h-2" />
        <p className="text-sm text-muted-foreground">{message}</p>
        <p className="text-xs text-muted-foreground">{progress}%</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Esto puede tardar un momento dependiendo de cuántas suscripciones tengas.
      </p>
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Flame} label="Consumiendo" value={consumingCount} color="#10b981" sub="canales con videos vistos" />
        <StatCard icon={Ghost} label="Fantasmas" value={ghostCount} color="#f59e0b" sub="activos pero sin interacción" />
        <StatCard icon={TrendingDown} label="Inactivos" value={inactiveCount} color="#9ca3af" sub="sin posts en 90 días" />
        <StatCard icon={TrendingUp} label="Total" value={channels.length} color="#6366f1" sub="canales suscritos" />
      </div>

      {/* Category charts */}
      {categoryStats.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard title="Engagement por categoría" subtitle="Videos vistos y pendientes agrupados por categoría" loading={false}>
            <ReactECharts option={catChartOpt} style={{ height: 240 }} theme={theme === 'dark' ? 'dark' : undefined} />
          </ChartCard>
          <ChartCard title="Distribución de canales" subtitle="Cantidad de canales por categoría" loading={false}>
            <ReactECharts option={catDonutOpt} style={{ height: 240 }} theme={theme === 'dark' ? 'dark' : undefined} />
          </ChartCard>
        </div>
      )}

      {/* Category stat cards */}
      {categoryStats.length > 0 && (
        <TooltipProvider delayDuration={100}>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">Resumen por categoría</p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="size-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs text-xs space-y-1.5 p-3">
                  <p className="font-semibold mb-1">¿Qué significa cada métrica?</p>
                  <p><span className="font-medium">Engagement</span> — % de canales con los que interactuaste (guardaste o viste algún video).</p>
                  <p><span className="font-medium text-green-600">Vistos</span> — videos marcados como vistos en la app.</p>
                  <p><span className="font-medium text-indigo-500">Pendientes</span> — videos guardados pero aún sin ver.</p>
                  <p><span className="font-medium text-orange-500">Fantasmas</span> — canales activos (publicaron en 90 días) con los que nunca interactuaste.</p>
                  <p><span className="font-medium text-gray-400">Inactivos</span> — canales que no han publicado nada en los últimos 90 días.</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="flex flex-col gap-2">
              {categoryStats.map(cat => {
                const color = cat.color || '#9ca3af'
                const engagementPct = cat.channelCount > 0
                  ? Math.round((cat.engagedChannels / cat.channelCount) * 100)
                  : 0
                const inactive = cat.channelCount - cat.activeChannels

                return (
                  <div key={cat.id} className="rounded-xl border bg-card hover:shadow-md transition-shadow">
                    <div className="px-4 py-3 space-y-2.5 sm:space-y-0 sm:flex sm:items-center sm:gap-4">
                      {/* Name + engagement bar — side by side on mobile, separate columns on desktop */}
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 flex-1 min-w-0 sm:w-36 sm:flex-none sm:shrink-0">
                          <div className="size-2 rounded-full shrink-0" style={{ background: color }} />
                          <p className="font-semibold text-sm truncate">{cat.name}</p>
                        </div>
                        <div className="w-28 sm:w-32 shrink-0 space-y-1">
                          <div className="flex justify-between">
                            <span className="text-[10px] text-muted-foreground">Engagement</span>
                            <span className="text-[10px] font-semibold" style={{ color }}>{engagementPct}%</span>
                          </div>
                          <div className="h-1 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${engagementPct}%`, background: color }} />
                          </div>
                        </div>
                      </div>

                      {/* Stats — 5-column grid on mobile, flex on desktop */}
                      <div className="grid grid-cols-5 gap-1.5 sm:flex sm:gap-2 sm:flex-1">
                        <div className="rounded-lg bg-green-500/10 px-2 py-1.5 text-center">
                          <p className="text-sm font-bold text-green-600 leading-none">{cat.totalWatched}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Vistos</p>
                        </div>
                        <div className="rounded-lg bg-indigo-500/10 px-2 py-1.5 text-center">
                          <p className="text-sm font-bold text-indigo-500 leading-none">{cat.totalPending}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Pendientes</p>
                        </div>
                        <div className="rounded-lg bg-orange-500/10 px-2 py-1.5 text-center">
                          <p className="text-sm font-bold text-orange-500 leading-none">{cat.ghostChannels}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Fantasmas</p>
                        </div>
                        <div className="rounded-lg bg-muted/60 px-2 py-1.5 text-center">
                          <p className="text-sm font-bold text-muted-foreground leading-none">{inactive}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Inactivos</p>
                        </div>
                        <div className="rounded-lg bg-muted/40 px-2 py-1.5 text-center">
                          <p className="text-sm font-bold text-muted-foreground leading-none">{cat.channelCount}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Canales</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </TooltipProvider>
      )}

      {/* Channel filter bar */}
      <div className="flex gap-2 flex-wrap items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {[
            { key: 'all', label: `Todos (${channels.length})` },
            { key: 'consuming', label: `Consumiendo (${consumingCount})` },
            { key: 'ghosts', label: `Fantasmas (${ghostCount})` },
            { key: 'inactive', label: `Inactivos (${inactiveCount})` },
            ...data?.categoryStats?.filter(c => c.id !== null).map(c => ({ key: String(c.id), label: `${c.name} (${c.channelCount})` })) ?? [],
          ].map(({ key, label }) => (
            <Button key={key} size="sm" variant={filter === key ? 'default' : 'outline'} className="h-7 text-xs" onClick={() => setFilter(key)}>
              {label}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onRefresh}>
          <RefreshCw className="size-3" /> {data?.fetchedAt ? `Actualizado ${new Date(data.fetchedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}` : 'Actualizar'}
        </Button>
      </div>

      {/* Channel grid */}
      <ScrollArea className="h-[calc(100vh-100px)]">
        {filtered.length === 0 ? (
          <EmptyState icon={Users} title="Sin canales en este filtro" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pr-2">
            {filtered.map(ch => (
              <button
                key={ch.id}
                onClick={() => setSelectedChannel(ch)}
                className="rounded-xl border bg-card p-3 flex gap-3 hover:shadow-md hover:border-primary/40 transition-all text-left cursor-pointer w-full"
              >
                <img src={ch.thumbnail} alt="" className="size-11 rounded-full object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{ch.title}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <EngagementBadge channel={ch} />
                    {ch.recentVideos > 0 && (
                      <Badge variant="secondary" className="text-xs">{ch.recentVideos} videos/90d</Badge>
                    )}
                  </div>
                  <div className="flex gap-2 mt-1.5 text-xs text-muted-foreground">
                    {ch.watchedCount > 0 && <span className="text-green-600">{ch.watchedCount} vistos</span>}
                    {ch.pendingCount > 0 && <span className="text-indigo-500">{ch.pendingCount} pendientes</span>}
                    {ch.favoritesCount > 0 && <span className="text-pink-500">{ch.favoritesCount} favs</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>

      <ChannelDrawer
        channel={selectedChannel}
        open={!!selectedChannel}
        onClose={() => setSelectedChannel(null)}
      />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Stats() {
  const [summary, setSummary] = useState(null)
  const [ytStats, setYtStats] = useState(null)
  const [ytApiStats, setYtApiStats] = useState(null)
  const [channelData, setChannelData] = useState(null)
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [loadProgress, setLoadProgress] = useState(0)
  const [loadMessage, setLoadMessage] = useState('')
  const [loadingChannels, setLoadingChannels] = useState(false)
  const [activeTab, setActiveTab] = useState('resumen')
  const { theme } = useTheme()
  const abortRef = useRef(null)

  // Load summary on mount
  useEffect(() => {
    Promise.all([
      api.get('/stats'),
      api.get('/subscriptions').catch(() => ({ data: { subscriptions: [], categories: [] } })),
      api.get('/playlists').catch(() => ({ data: [] })),
      api.get('/youtube-stats').catch(() => ({ data: null })),
    ]).then(([sRes, subsRes, plRes, ytRes]) => {
      setSummary(sRes.data)
      setYtApiStats(ytRes.data)
      setYtStats({
        subscriptions: subsRes.data.subscriptions?.length ?? 0,
        subscriptionItems: subsRes.data.subscriptions ?? [],
        categories: subsRes.data.categories?.length ?? 0,
        playlists: plRes.data?.length ?? 0,
      })
      setLoadingSummary(false)
    })
  }, [])

  const loadChannelStats = useCallback((force = false) => {
    if (!force && channelData) return

    abortRef.current?.abort()
    abortRef.current = new AbortController()

    setLoadingChannels(true)
    setLoadProgress(0)
    setLoadMessage('Iniciando...')

    ;(async () => {
      try {
        for await (const payload of streamSSE('/channel-stats', force ? { refresh: '1' } : {}, abortRef.current.signal)) {
          setLoadProgress(payload.progress)
          setLoadMessage(payload.message)
          if (payload.progress === 100 && payload.result) {
            setChannelData(payload.result)
            setLoadingChannels(false)
          }
          if (payload.progress === -1) {
            setLoadingChannels(false)
          }
        }
      } catch (e) {
        if (e.name !== 'AbortError') {
          setLoadingChannels(false)
          setLoadMessage('Error de conexión')
        }
      }
    })()
  }, [channelData])

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    if (tab === 'suscripciones') loadChannelStats()
  }

  const handleRefresh = () => loadChannelStats(true)

  return (
    <div className="p-6">
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-5">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="suscripciones">Suscripciones</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen">
          <TabResumen stats={summary} ytStats={ytStats} ytApiStats={ytApiStats} loading={loadingSummary} theme={theme} />
        </TabsContent>

        <TabsContent value="suscripciones">
          <TabSuscripciones
            data={channelData}
            loading={loadingChannels}
            progress={loadProgress}
            message={loadMessage}
            onRefresh={handleRefresh}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
