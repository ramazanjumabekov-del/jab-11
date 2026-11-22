import { useEffect, useRef, useState } from 'react'
import { CALL_TIMEOUT_MS, ICE_SERVERS, SIGNALING_URL } from '../config.js'

/**
 * Сигналинг через WebSocket + WebRTC-соединение 1 на 1.
 * Логика звонка не менялась — только вынесена из App.
 */
export function useVideoCall({ streamRef, setStatus }) {
  const socketRef = useRef(null)
  const peerRef = useRef(null)
  const pendingIceRef = useRef([])
  const callIdRef = useRef(null)
  const callTimerRef = useRef(null)
  const localIceRef = useRef([])

  const [remoteStream, setRemoteStream] = useState(null)
  const [socketState, setSocketState] = useState('closed') // closed | connecting | open
  const [callActive, setCallActive] = useState(false)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    return () => {
      clearTimeout(callTimerRef.current)
      const socket = socketRef.current
      socketRef.current = null
      socket?.close()
      peerRef.current?.close()
      peerRef.current = null
      pendingIceRef.current = []
    }
  }, [])

  function closeCall() {
    const peer = peerRef.current
    peerRef.current = null
    callIdRef.current = null
    clearTimeout(callTimerRef.current)
    callTimerRef.current = null
    localIceRef.current = []
    pendingIceRef.current = []
    setCallActive(false)
    setConnected(false)
    peer?.close()
    setRemoteStream(null)
  }

  function send(socket, message) {
    if (socketRef.current === socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message))
    }
  }

  function createPeer(socket, stream, callId) {
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    peerRef.current = peer
    callIdRef.current = callId
    setCallActive(true)

    // Если второго клиента нет, разрешаем повторить вызов, а не зависаем навсегда.
    callTimerRef.current = setTimeout(() => {
      if (peerRef.current !== peer) return
      send(socket, { type: 'hangup', callId })
      closeCall()
      setStatus('Собеседник не ответил. Проверь второе окно и позвони снова')
    }, CALL_TIMEOUT_MS)

    for (const track of stream.getTracks()) {
      peer.addTrack(track, stream)
    }

    peer.onicecandidate = ({ candidate }) => {
      if (!candidate || peerRef.current !== peer) return

      const ice = candidate.toJSON()
      localIceRef.current.push(ice)
      send(socket, { type: 'ice', callId, candidate: ice })
    }

    peer.ontrack = ({ streams }) => {
      if (peerRef.current === peer && streams[0]) {
        setRemoteStream(streams[0])
      }
    }

    peer.onconnectionstatechange = () => {
      if (peerRef.current !== peer) return

      console.log('WebRTC:', peer.connectionState)

      if (peer.connectionState === 'connected') {
        clearTimeout(callTimerRef.current)
        setConnected(true)
        setStatus('Звонок подключён')
      }

      if (peer.connectionState === 'disconnected') {
        setConnected(false)
        setStatus('Видеосвязь прервалась. Ожидаем восстановления…')
      }

      if (peer.connectionState === 'failed') {
        send(socket, { type: 'hangup', callId })
        closeCall()
        setStatus('Не удалось установить видеосвязь. Попробуй позвонить снова')
      }
    }

    return peer
  }

  async function applyRemoteDescription(peer, description) {
    await peer.setRemoteDescription(description)
    if (peerRef.current !== peer) return

    // Применяем кандидатов, которые пришли раньше offer или answer.
    for (const message of pendingIceRef.current.splice(0)) {
      if (message.callId !== callIdRef.current) continue
      await peer.addIceCandidate(message.candidate)
      if (peerRef.current !== peer) return
    }
  }

  async function handleMessage(socket, data) {
    let message
    try {
      message = JSON.parse(data)
    } catch {
      return // Чужое некорректное сообщение не должно завершать текущий звонок.
    }
    if (!message || typeof message !== 'object') return

    if (message.type === 'peer-left') {
      closeCall()
      setStatus('Собеседник вышел')
      return
    }

    if (message.type === 'ready') {
      const peer = peerRef.current
      // Offer мог уйти, пока второго клиента ещё не было на сервере.
      if (peer?.signalingState === 'have-local-offer') {
        send(socket, { type: 'offer', callId: callIdRef.current, description: peer.localDescription })
        for (const candidate of localIceRef.current) {
          send(socket, { type: 'ice', callId: callIdRef.current, candidate })
        }
      }
      return
    }

    if (message.type === 'hangup' || message.type === 'not-ready') {
      if (message.callId !== callIdRef.current) return
      closeCall()
      setStatus(message.type === 'not-ready'
        ? 'Собеседник ещё не включил камеру. Позвони, когда он будет готов'
        : 'Собеседник завершил звонок. Можно позвонить снова')
      return
    }

    if (typeof message.callId !== 'string') return

    if (message.type === 'ice' && message.candidate) {
      const peer = peerRef.current
      if (peer && message.callId !== callIdRef.current) return

      if (peer?.remoteDescription) {
        await peer.addIceCandidate(message.candidate)
      } else {
        pendingIceRef.current.push(message)
      }
      return
    }

    if (message.type === 'offer') {
      if (message.description?.type !== 'offer' || typeof message.description.sdp !== 'string') return
      const stream = streamRef.current

      if (!stream) {
        pendingIceRef.current = []
        send(socket, { type: 'not-ready', callId: message.callId })
        setStatus('Включи камеру и попроси собеседника позвонить снова')
        return
      }

      if (peerRef.current) {
        // При одновременном вызове обе стороны выбирают один и тот же offer.
        // Второе соединение закрываем до применения нового SDP.
        if (peerRef.current.connectionState === 'connected' || callIdRef.current <= message.callId) return
        closeCall()
      }

      setStatus('Принимаем звонок…')
      const peer = createPeer(socket, stream, message.callId)
      await applyRemoteDescription(peer, message.description)
      if (peerRef.current !== peer) return

      const answer = await peer.createAnswer()
      if (peerRef.current !== peer) return
      await peer.setLocalDescription(answer)

      if (peerRef.current === peer) {
        send(socket, { type: 'answer', callId: message.callId, description: peer.localDescription })
      }
      return
    }

    if (message.type === 'answer') {
      const peer = peerRef.current
      if (message.callId !== callIdRef.current || message.description?.type !== 'answer') return
      if (peer?.signalingState !== 'have-local-offer') return

      await applyRemoteDescription(peer, message.description)

      if (peerRef.current === peer) {
        console.log('Ответ принят')
      }
    }
  }

  function connectSocket() {
    if (socketRef.current || !streamRef.current) return

    const socket = new WebSocket(SIGNALING_URL)
    socketRef.current = socket
    setSocketState('connecting')
    setStatus('Подключаемся к серверу…')

    socket.onopen = () => {
      if (socketRef.current !== socket) return
      setSocketState('open')
      setStatus('Подключились к серверу. Нажми «Позвонить» в одном из двух окон')
      send(socket, { type: 'ready' })
    }

    // Обрабатываем сообщения по очереди, даже если внутри есть await.
    let messageQueue = Promise.resolve()

    socket.onmessage = (event) => {
      messageQueue = messageQueue
        .then(() => {
          if (socketRef.current === socket) {
            return handleMessage(socket, event.data)
          }
        })
        .catch((error) => {
          if (socketRef.current !== socket) return
          console.error('Ошибка обработки сообщения:', error)
          closeCall()
          setStatus('Ошибка настройки звонка. Подробности в консоли')
        })
    }

    socket.onerror = () => {
      if (socketRef.current === socket) setStatus('Ошибка соединения с сервером')
    }

    socket.onclose = () => {
      if (socketRef.current !== socket) return

      socketRef.current = null
      setSocketState('closed')
      closeCall()
      setStatus('Связь с сервером закрыта. Возможно, подключился третий участник. Подключись снова')
    }
  }

  async function startCall() {
    const socket = socketRef.current
    const stream = streamRef.current

    if (socket?.readyState !== WebSocket.OPEN) {
      setStatus('Сначала подключись к серверу')
      return
    }

    if (!stream) {
      setStatus('Сначала включи камеру')
      return
    }

    if (peerRef.current) return

    closeCall()
    setStatus('Вызываем собеседника…')

    let peer
    try {
      const callId = crypto.randomUUID()
      peer = createPeer(socket, stream, callId)
      const offer = await peer.createOffer()
      if (peerRef.current !== peer) return
      await peer.setLocalDescription(offer)

      if (peerRef.current === peer) {
        send(socket, { type: 'offer', callId, description: peer.localDescription })
        console.log('Передали offer в send(), WebSocket:', socket.readyState)
      }
    } catch (error) {
      if (socketRef.current !== socket || peerRef.current !== peer) return
      console.error('Не удалось начать звонок:', error)
      closeCall()
      setStatus('Не удалось начать звонок. Подробности в консоли')
    }
  }

  /** Завершить текущий звонок, оставаясь на сервере. */
  function hangup() {
    const socket = socketRef.current
    const callId = callIdRef.current
    if (socket && callId) send(socket, { type: 'hangup', callId })
    closeCall()
    setStatus('Звонок завершён. Можно позвонить снова')
  }

  /** Закрыть сокет и звонок (камера останавливается отдельно). */
  function disconnect() {
    const socket = socketRef.current
    socketRef.current = null
    setSocketState('closed')
    socket?.close()
    closeCall()
  }

  return { remoteStream, socketState, callActive, connected, connect: connectSocket, call: startCall, hangup, disconnect }
}
