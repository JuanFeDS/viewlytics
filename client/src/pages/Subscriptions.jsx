import { useEffect, useState } from 'react'
import { Plus, Tag, X, Users, Loader2, RefreshCw } from 'lucide-react'
import api from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import ChannelDrawer from '@/components/ChannelDrawer'

function SubscriptionSkeleton() {
  return (
    <Card>
      <CardContent className="p-3 flex gap-3">
        <Skeleton className="size-12 rounded-full shrink-0" />
        <div className="flex-1 space-y-2 py-1">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </CardContent>
    </Card>
  )
}

export default function Subscriptions() {
  const { logout } = useAuth()
  const [subscriptions, setSubscriptions] = useState([])
  const [categories, setCategories] = useState([])
  const [mappings, setMappings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [newCatName, setNewCatName] = useState('')
  const [filterCat, setFilterCat] = useState(null)
  const [search, setSearch] = useState('')
  const [selectedChannel, setSelectedChannel] = useState(null)
  const [sortOrder, setSortOrder] = useState('youtube')
  const [reviews, setReviews] = useState({}) // { channelId: last_reviewed_at }

  useEffect(() => {
    const loadData = async () => {
      try {
        const [subsRes, reviewsRes] = await Promise.all([
          api.get('/subscriptions'),
          supabase.from('channel_reviews').select('channel_id, last_reviewed_at'),
        ])
        setSubscriptions(subsRes.data.subscriptions ?? [])
        setCategories(subsRes.data.categories ?? [])
        setMappings(subsRes.data.mappings ?? [])
        const reviewMap = {}
        for (const r of reviewsRes.data ?? []) reviewMap[r.channel_id] = r.last_reviewed_at
        setReviews(reviewMap)
      } catch (e) {
        setError(e.response?.data?.error ?? e.message)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const [savingCat, setSavingCat] = useState(false)
  const [assigningId, setAssigningId] = useState(null) // `${subId}-${catId}`

  const createCategory = async () => {
    if (!newCatName.trim() || savingCat) return
    setSavingCat(true)
    try {
      const { data } = await api.post('/subscriptions/categories', { name: newCatName.trim() })
      setCategories(prev => [...prev, data])
      setNewCatName('')
      toast.success('Categoría creada')
    } catch (e) {
      toast.error('No se pudo crear la categoría', { description: e.response?.data?.error ?? e.message })
    } finally {
      setSavingCat(false)
    }
  }

  const deleteCategory = async (id) => {
    try {
      await api.delete(`/subscriptions/categories/${id}`)
      setCategories(prev => prev.filter(c => c.id !== id))
      setMappings(prev => prev.filter(m => m.category_id !== id))
      if (filterCat === id) setFilterCat(null)
      toast.success('Categoría eliminada')
    } catch (e) {
      toast.error('No se pudo eliminar', { description: e.response?.data?.error ?? e.message })
    }
  }

  const toggleAssign = async (subscriptionId, categoryId) => {
    const key = `${subscriptionId}-${categoryId}`
    if (assigningId === key) return
    setAssigningId(key)
    const exists = mappings.find(m => m.subscription_id === subscriptionId && m.category_id === categoryId)
    try {
      if (exists) {
        await api.delete(`/subscriptions/categories/${categoryId}/assign/${subscriptionId}`)
        setMappings(prev => prev.filter(m => !(m.subscription_id === subscriptionId && m.category_id === categoryId)))
      } else {
        await api.post(`/subscriptions/categories/${categoryId}/assign/${subscriptionId}`)
        setMappings(prev => [...prev, { subscription_id: subscriptionId, category_id: categoryId }])
      }
    } catch (e) {
      toast.error('No se pudo actualizar la categoría', { description: e.response?.data?.error ?? e.message })
    } finally {
      setAssigningId(null)
    }
  }

  const getCategoriesForSub = (subId) =>
    mappings.filter(m => m.subscription_id === subId).map(m => categories.find(c => c.id === m.category_id)).filter(Boolean)

  const openChannel = async (channel) => {
    setSelectedChannel(channel)
    const { channelId } = channel
    const now = new Date().toISOString()
    setReviews(prev => ({ ...prev, [channelId]: now }))
    await supabase.from('channel_reviews').upsert(
      { channel_id: channelId, last_reviewed_at: now },
      { onConflict: 'user_id,channel_id' }
    )
  }

  const baseFiltered = subscriptions
    .filter(s => !filterCat || mappings.some(m => m.subscription_id === s.id && m.category_id === filterCat))
    .filter(s => !search || s.snippet.title.toLowerCase().includes(search.toLowerCase()))

  const filtered = sortOrder === 'youtube' ? baseFiltered : [...baseFiltered].sort((a, b) => {
    const aAt = reviews[a.snippet.resourceId.channelId]
    const bAt = reviews[b.snippet.resourceId.channelId]
    if (!aAt && !bAt) return 0
    if (!aAt) return sortOrder === 'least-reviewed' ? -1 : 1
    if (!bAt) return sortOrder === 'least-reviewed' ? 1 : -1
    const diff = new Date(aAt) - new Date(bAt)
    return sortOrder === 'least-reviewed' ? diff : -diff
  })

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? 'Cargando...' : `${subscriptions.length} canales`}
        </p>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm"><Plus className="size-4 mr-1" /> Categoría</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Gestionar categorías</DialogTitle>
            </DialogHeader>
            <div className="flex gap-2">
              <Input
                placeholder="Nombre de categoría"
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createCategory()}
                disabled={savingCat}
              />
              <Button onClick={createCategory} disabled={savingCat}>
                {savingCat ? <Loader2 className="size-4 animate-spin" /> : 'Crear'}
              </Button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1 mt-2">
              {categories.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Sin categorías aún</p>
              )}
              {categories.map(cat => (
                <div key={cat.id} className="flex justify-between items-center rounded-md px-2 py-1.5 hover:bg-muted">
                  <span className="text-sm">{cat.name}</span>
                  <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => deleteCategory(cat.id)}>
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <Input
          placeholder="Buscar canal..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs h-8 text-sm"
        />
        {[
          { value: 'youtube', label: 'Orden YouTube' },
          { value: 'least-reviewed', label: 'Menos revisados' },
          { value: 'most-reviewed', label: 'Recién revisados' },
        ].map(opt => (
          <Button
            key={opt.value}
            variant={sortOrder === opt.value ? 'default' : 'outline'}
            size="sm"
            className="h-8"
            onClick={() => setSortOrder(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
        <Button
          variant={filterCat === null ? 'default' : 'outline'}
          size="sm"
          className="h-8"
          onClick={() => setFilterCat(null)}
        >
          Todos
        </Button>
        {categories.map(cat => (
          <Button
            key={cat.id}
            variant={filterCat === cat.id ? 'default' : 'outline'}
            size="sm"
            className="h-8"
            onClick={() => setFilterCat(filterCat === cat.id ? null : cat.id)}
          >
            {cat.name}
          </Button>
        ))}
      </div>

      {error && (
        error === 'YouTube not connected' ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Tu sesión con YouTube expiró. Vuelve a iniciar sesión para reconectarla.
            </p>
            <Button variant="outline" size="sm" onClick={logout}>
              <RefreshCw className="size-4 mr-2" />
              Volver a iniciar sesión
            </Button>
          </div>
        ) : (
          <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>
        )
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 12 }).map((_, i) => <SubscriptionSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No hay canales"
          description={search ? 'Prueba con otro término de búsqueda' : 'No tienes suscripciones aún'}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map(sub => {
            const subCats = getCategoriesForSub(sub.id)
            return (
              <Card
                key={sub.id}
                className="hover:shadow-md hover:border-primary/40 transition-all cursor-pointer"
                onClick={() => openChannel({
                  channelId: sub.snippet.resourceId.channelId,
                  title: sub.snippet.title,
                  thumbnail: sub.snippet.thumbnails?.default?.url,
                  categories: subCats,
                })}
              >
                <CardContent className="p-3 flex gap-3">
                  <img
                    src={sub.snippet.thumbnails?.default?.url}
                    alt={sub.snippet.title}
                    className="size-12 rounded-full object-cover shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{sub.snippet.title}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {subCats.map(cat => (
                        <Badge key={cat.id} variant="secondary" className="text-xs">{cat.name}</Badge>
                      ))}
                    </div>
                    {categories.length > 0 && (
                      <div onClick={e => e.stopPropagation()}>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 text-xs p-1 mt-1">
                              <Tag className="size-3 mr-1" /> Categorizar
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>{sub.snippet.title}</DialogTitle>
                            </DialogHeader>
                            <div className="flex flex-wrap gap-2">
                              {categories.map(cat => {
                                const assigned = mappings.some(m => m.subscription_id === sub.id && m.category_id === cat.id)
                                const busy = assigningId === `${sub.id}-${cat.id}`
                                return (
                                  <Badge
                                    key={cat.id}
                                    variant={assigned ? 'default' : 'outline'}
                                    className={`cursor-pointer transition-opacity ${busy ? 'opacity-50 pointer-events-none' : ''}`}
                                    onClick={() => toggleAssign(sub.id, cat.id)}
                                  >
                                    {busy && <Loader2 className="size-2.5 mr-1 animate-spin" />}
                                    {cat.name}
                                  </Badge>
                                )
                              })}
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <ChannelDrawer
        channel={selectedChannel}
        open={!!selectedChannel}
        onClose={() => setSelectedChannel(null)}
      />
    </div>
  )
}
