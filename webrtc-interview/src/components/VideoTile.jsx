import { useEffect, useRef } from 'react'

export default function VideoTile({ title, stream, muted = false, placeholder, badge }) {
  const videoRef = useRef(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
  }, [stream])

  return (
    <section className="tile" aria-label={title}>
      <video ref={videoRef} autoPlay playsInline muted={muted} className={stream ? 'is-live' : ''} />
      {!stream && <div className="tile__placeholder">{placeholder}</div>}
      <div className="tile__label">
        <span>{title}</span>
        {badge && <span className="tile__badge">{badge}</span>}
      </div>
    </section>
  )
}
