import { useState } from 'react'
import Controls from './components/Controls.jsx'
import StatusBar from './components/StatusBar.jsx'
import VideoTile from './components/VideoTile.jsx'
import { useCamera } from './hooks/useCamera.js'
import { useVideoCall } from './hooks/useVideoCall.js'
import './styles/index.css'

export default function App() {
  const [status, setStatus] = useState('Включи камеру и подключись к серверу')
  const camera = useCamera(setStatus)
  const call = useVideoCall({ streamRef: camera.streamRef, setStatus })

  // Текущий этап: 0 — камера, 1 — сервер, 2 — звонок
  const step = camera.cameraState !== 'on' ? 0 : call.socketState !== 'open' ? 1 : 2

  function exitRoom() {
    call.disconnect()
    camera.stop()
    setStatus('Ты вышел из собеседования')
  }

  return (
    <main className="app">
      <header>
        <h1>Видеособеседование 1 на 1</h1>
        <StatusBar status={status} step={call.connected ? 3 : step} />
      </header>

      <div className="grid">
        <VideoTile
          title="Вы"
          stream={camera.stream}
          muted
          placeholder="Камера выключена"
          badge={camera.stream ? 'в эфире' : null}
        />
        <VideoTile
          title="Собеседник"
          stream={call.remoteStream}
          placeholder={call.callActive ? 'Соединяемся…' : 'Ожидание звонка'}
          badge={call.connected ? 'на связи' : null}
        />
      </div>

      <Controls
        cameraState={camera.cameraState}
        socketState={call.socketState}
        callActive={call.callActive}
        onCamera={camera.start}
        onConnect={call.connect}
        onCall={call.call}
        onHangup={call.hangup}
        onExit={exitRoom}
      />
    </main>
  )
}
