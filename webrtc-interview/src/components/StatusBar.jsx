const STEPS = ['Камера', 'Сервер', 'Звонок']

export default function StatusBar({ status, step }) {
  return (
    <div className="status">
      <ol className="steps" aria-label="Этапы подключения">
        {STEPS.map((name, i) => (
          <li key={name} className={i < step ? 'done' : i === step ? 'current' : ''}>
            <span className="steps__dot">{i < step ? '✓' : i + 1}</span>
            {name}
          </li>
        ))}
      </ol>
      <p role="status" className="status__text">{status}</p>
    </div>
  )
}
