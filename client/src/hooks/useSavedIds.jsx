import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { toast } from 'sonner'
import api from '@/lib/api'

const SavedIdsContext = createContext(null)

export function SavedIdsProvider({ children }) {
  const [pendingIds, setPendingIds] = useState(new Set())
  const [favIds, setFavIds] = useState(new Set())

  useEffect(() => {
    Promise.all([
      api.get('/pending').then(r => (r.data ?? []).map(v => v.video_id)).catch(() => []),
      api.get('/favorites').then(r => (r.data ?? []).map(v => v.video_id)).catch(() => []),
    ]).then(([p, f]) => {
      setPendingIds(new Set(p))
      setFavIds(new Set(f))
    })
  }, [])

  // video must be { video_id, title, channel_id?, channel_title?, thumbnail_url? }
  const addToPending = useCallback(async (video) => {
    try {
      await api.post('/pending', {
        video_id: video.video_id,
        title: video.title,
        channel_id: video.channel_id ?? null,
        channel_title: video.channel_title ?? null,
        thumbnail_url: video.thumbnail_url ?? null,
      })
      setPendingIds(prev => new Set([...prev, video.video_id]))
      toast.success('Agregado a pendientes')
    } catch (e) {
      if (e.response?.status === 409) {
        setPendingIds(prev => new Set([...prev, video.video_id]))
      } else {
        toast.error('No se pudo agregar a pendientes')
      }
    }
  }, [])

  const removeFromPending = useCallback(async (videoId) => {
    try {
      await api.delete(`/pending/${videoId}`)
      setPendingIds(prev => { const s = new Set(prev); s.delete(videoId); return s })
      toast.success('Quitado de pendientes')
    } catch (e) {
      toast.error('No se pudo quitar', { description: e.response?.data?.error ?? e.message })
    }
  }, [])

  const addToFavorites = useCallback(async (video) => {
    try {
      await api.post('/favorites', {
        video_id: video.video_id,
        title: video.title,
        channel_id: video.channel_id ?? null,
        channel_title: video.channel_title ?? null,
        thumbnail_url: video.thumbnail_url ?? null,
      })
      setFavIds(prev => new Set([...prev, video.video_id]))
      toast.success('Guardado en favoritos')
    } catch (e) {
      if (e.response?.status === 409) {
        setFavIds(prev => new Set([...prev, video.video_id]))
      } else {
        toast.error('No se pudo guardar en favoritos')
      }
    }
  }, [])

  const removeFromFavorites = useCallback(async (videoId) => {
    try {
      await api.delete(`/favorites/${videoId}`)
      setFavIds(prev => { const s = new Set(prev); s.delete(videoId); return s })
      toast.success('Quitado de favoritos')
    } catch (e) {
      toast.error('No se pudo quitar', { description: e.response?.data?.error ?? e.message })
    }
  }, [])

  return (
    <SavedIdsContext.Provider value={{ pendingIds, favIds, addToPending, removeFromPending, addToFavorites, removeFromFavorites }}>
      {children}
    </SavedIdsContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSavedIds = () => useContext(SavedIdsContext)
