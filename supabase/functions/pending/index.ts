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
    // segments: [] | [id] | [id, 'watched'] | [id, 'notes']
    const svc = serviceClient()

    // PATCH /pending/:id/watched
    if (req.method === 'PATCH' && segments[1] === 'watched') {
      const { data } = await supabase
        .from('pending_videos')
        .update({ watched_at: new Date().toISOString() })
        .eq('id', segments[0])
        .select('video_id')
        .single()

      if (data?.video_id) {
        await svc.from('user_events').insert({
          user_id: user.id,
          event_type: 'video_watched',
          video_id: data.video_id,
        })
      }
      return json({ ok: true })
    }

    // PATCH /pending/:id/notes
    if (req.method === 'PATCH' && segments[1] === 'notes') {
      const { notes } = await req.json()
      await supabase.from('pending_videos').update({ notes }).eq('id', segments[0])
      return json({ ok: true })
    }

    // DELETE /pending/:id
    if (req.method === 'DELETE' && segments[0]) {
      const { data } = await supabase
        .from('pending_videos')
        .delete()
        .eq('id', segments[0])
        .select('video_id')
        .single()

      if (data?.video_id) {
        await svc.from('user_events').insert({
          user_id: user.id,
          event_type: 'video_unsaved',
          video_id: data.video_id,
        })
      }
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

      if (error) return err('Video already in pending list', 409)

      await svc.from('user_events').insert({
        user_id: user.id,
        event_type: 'video_saved',
        video_id,
      })
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
