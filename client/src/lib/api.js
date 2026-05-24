import axios from 'axios'
import { supabase } from './supabase'

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

const api = axios.create({ baseURL: FUNCTIONS_URL, timeout: 30000 })

let currentToken = null

// Resolves once — either from getSession or onAuthStateChange, whichever fires first.
// After resolving, await authReady is instant on every subsequent call.
let authResolve
const authReady = new Promise(resolve => { authResolve = resolve })

supabase.auth.getSession().then(({ data: { session } }) => {
  currentToken = session?.access_token ?? null
  authResolve()
})

supabase.auth.onAuthStateChange((_event, session) => {
  currentToken = session?.access_token ?? null
  authResolve()
})

api.interceptors.request.use(async (config) => {
  await authReady
  if (currentToken) {
    config.headers.Authorization = `Bearer ${currentToken}`
  }
  return config
})

export async function* streamSSE(path, params = {}, signal) {
  await authReady
  const url = new URL(`${FUNCTIONS_URL}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${currentToken ?? ''}` },
    signal,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try { yield JSON.parse(line.slice(6)) } catch { /* ignore malformed SSE frames */ }
        }
      }
    }
  } finally {
    reader.cancel()
  }
}

export default api
