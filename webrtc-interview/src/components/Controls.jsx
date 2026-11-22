export default function Controls({ cameraState, socketState, callActive, onCamera, onConnect, onCall, onHangup, onExit }) {
  return (
    <div className="controls">
      <button onClick={onCamera} disabled={cameraState !== 'off'}>
        {cameraState === 'loading' ? 'Запрашиваем доступ…' : '1. Включить камеру'}
      </button>
      <button onClick={onConnect} disabled={cameraState !== 'on' || socketState !== 'closed'}>
        {socketState === 'connecting' ? 'Подключаемся…' : '2. Подключиться'}
      </button>
      {callActive ? (
        <button className="danger" onClick={onHangup}>Завершить звонок</button>
      ) : (
        <button className="primary" onClick={onCall} disabled={cameraState !== 'on' || socketState !== 'open'}>
          3. Позвонить
        </button>
      )}
      <button className="ghost" onClick={onExit}>Выйти</button>
    </div>
  )
}
