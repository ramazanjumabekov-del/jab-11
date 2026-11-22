import { useCallback, useEffect, useRef, useState } from 'react'

function describeError(error) {
  if (error.name === 'NotAllowedError') return 'Разреши доступ к камере и микрофону в браузере'
  if (error.name === 'NotFoundError') return 'Камера или микрофон не найдены'
  return error.message
}

/** Управляет локальным медиапотоком (камера + микрофон). */
export function useCamera(setStatus) {
  const streamRef = useRef(null)
  const requestRef = useRef(null)
  const [stream, setStream] = useState(null)
  const [cameraState, setCameraState] = useState('off') // off | loading | on

  const stop = useCallback(() => {
    requestRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setStream(null)
    setCameraState('off')
  }, [])

  const start = useCallback(async () => {
    if (streamRef.current || requestRef.current) return

    const request = {}
    requestRef.current = request
    setCameraState('loading')

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Камера доступна только через HTTPS или localhost')
      }

      const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })

      if (requestRef.current !== request) {
        media.getTracks().forEach((track) => track.stop())
        return
      }

      streamRef.current = media
      setStream(media)
      setCameraState('on')
      setStatus('Камера и микрофон включены')
    } catch (error) {
      if (requestRef.current === request) {
        setCameraState('off')
        setStatus(`Не удалось включить камеру или микрофон. ${describeError(error)}`)
      }
    } finally {
      if (requestRef.current === request) requestRef.current = null
    }
  }, [setStatus])

  useEffect(() => () => {
    requestRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  return { stream, streamRef, cameraState, start, stop }
}
