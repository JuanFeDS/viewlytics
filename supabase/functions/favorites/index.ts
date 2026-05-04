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
    const svc = serviceClient()

    // DELETE /favorites/:video_id
    if (req.method === 'DELETE' && segments[0]) {
      const { error } = await svc
        .from('favorite_videos')
        .delete()
        .eq('video_id', segments[0])
        .eq('user_id', user.id)

      if (error) return err(error.message, 500)

      await svc.from('user_events').insert({
        user_id: user.id,
        event_type: 'video_unfavorited',
        video_id: segments[0],
      }).then(undefined, () => {})
      return json({ ok: true })
    }

    // POST /favorites
    if (req.method === 'POST') {
      const body = await req.json()
      const { video_id, title, channel_id, channel_title, thumbnail_url } = body
      if (!video_id || !title) return err('video_id and title required', 400)

      await upsertChannelAndVideo(svc, { video_id, title, channel_id, channel_title, thumbnail_url })

      const { data, error } = await supabase
        .from('favorite_videos')
        .insert({ user_id: user.id, video_id })
        .select()
        .single()

      if (error?.code === '23505') return err('Already in favorites', 409)
      if (error) return err(error.message, 500)

      await svc.from('user_events').insert({
        user_id: user.id,
        event_type: 'video_favorited',
        video_id,
      }).then(undefined, () => {})
      return json(data)
    }

    // GET /favorites
    const { data } = await supabase
      .from('favorite_videos')
      .select('*, videos(*)')
      .order('saved_at', { ascending: false })

    const flat = (data ?? []).map(({ videos, ...row }: any) => ({
      ...row,
      title: videos?.title,
      channel_id: videos?.channel_id,
      channel_title: videos?.channel_title,
      thumbnail_url: videos?.thumbnail_url,
    }))

    return json(flat)
  } catch (e) {
    return err(e.message)
  }
})
