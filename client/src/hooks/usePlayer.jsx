import { createContext, useContext, useRef, useState } from 'react'

const PlayerContext = createContext(null)

export function PlayerProvider({ children }) {
  const [video, setVideo] = useState(null)
  const [queue, setQueue] = useState([])
  const [mini, setMini] = useState(false)

  // VideoPlayerModal registers its openDocPiP fn here so RouteWatcher can call it
  const pipRequestRef = useRef(null)

  function open(v, q = []) {
    setVideo(v)
    setQueue(q)
    setMini(false)
  }

  function close() {
    setVideo(null)
  }

  return (
    <PlayerContext.Provider value={{
      video, queue, mini,
      open, close,
      minimize: () => setMini(true),
      expand: () => setMini(false),
      pipRequestRef,
    }}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  return useContext(PlayerContext)
}
