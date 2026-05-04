import { handleCors, json, err } from '../_shared/cors.ts'
import { requireAuth, serviceClient } from '../_shared/auth.ts'
import { upsertChannelAndVideo } from '../_shared/youtube.ts'

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  try {
    const { user, supabase } = await requireAuth(req)
    const url = new URL(req.url)
    const segments = url.pathname.split('/').filter(Boolean).slice(3)
    // segments: [] | [video_id] | [video_id, 'watched']
    const svc = serviceClient()

    // PATCH /pending/:video_id/watched
    if (req.method === 'PATCH' && segments[1] === 'watched') {
      const { error } = await svc
        .from('pending_videos')
        .update({ watched_at: new Date().toISOString() })
        .eq('video_id', segments[0])
        .eq('user_id', user.id)

      if (error) return err(error.message, 500)

      await svc.from('user_events').insert({
        user_id: user.id,
        event_type: 'video_watched',
        video_id: segments[0],
      }).then(undefined, () => {})
      return json({ ok: true })
    }

    // DELETE /pending/:video_id
    if (req.method === 'DELETE' && segments[0]) {
      // svc bypasses RLS entirely — filter only by video_id to rule out user_id mismatch
      const { error } = await svc
        .from('pending_videos')
        .delete()
        .eq('video_id', segments[0])

      if (error) return err(error.message, 500)

      await svc.from('user_events').insert({
        user_id: user.id,
        event_type: 'video_unsaved',
        video_id: segments[0],
      }).then(undefined, () => {})
      return json({ ok: true })
    }

    // POST /pending
    if (req.method === 'POST') {
      const body = await req.json()
      const { video_id, title, channel_id, channel_title, thumbnail_url, duration } = body
      if (!video_id || !title) return err('video_id and title required', 400)

      await upsertChannelAndVideo(svc, { video_id, title, channel_id, channel_title, thumbnail_url, duration })

      const { data, error } = await supabase
        .from('pending_videos')
        .insert({ user_id: user.id, video_id })
        .select()
        .single()

      if (error?.code === '23505') return err('Video already in pending list', 409)
      if (error) return err(error.message, 500)

      await svc.from('user_events').insert({
        user_id: user.id,
        event_type: 'video_saved',
        video_id,
      }).then(undefined, () => {})
      return json({ ...data, video_id, title, channel_id, channel_title, thumbnail_url, duration })
    }

    // GET /pending
    const { data } = await supabase
      .from('pending_videos')
      .select('*, videos(*)')
      .order('added_at', { ascending: false })

    const flat = (data ?? []).map(({ videos, ...row }: any) => ({
      ...row,
      title: videos?.title,
      channel_id: videos?.channel_id,
      channel_title: videos?.channel_title,
      thumbnail_url: videos?.thumbnail_url,
      duration: videos?.duration,
    }))

    return json(flat)
  } catch (e) {
    return err(e.message)
  }
})
