import { useEffect, useState } from 'react'

/** Small raster previews dissolve into the same final image, without moving it. */
export default function W3SceneDevelop({ src }: { src: string }) {
  const [layers, setLayers] = useState<string[]>([])
  useEffect(() => {
    let live = true
    const im = new Image(); im.src = src
    void im.decode().then(() => {
      if (!live) return
      const previews = [28, 14, 6].map(block => {
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.width / block)); c.height = Math.max(1, Math.round(im.height / block))
        c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height)
        return c.toDataURL('image/webp', .9)
      })
      setLayers(previews)
    }).catch(() => { /* Full image remains visible if raster previews are unavailable. */ })
    return () => { live = false }
  }, [src])
  return <div className="w3-scene-develop" aria-hidden>{layers.length === 0 && <img src={src} alt="" style={{filter:"blur(18px)",animation:"none"}} />}{[...layers].reverse().map((layer, i) => <img key={i} src={layer} alt="" style={{ animationDelay: `${(2 - i) * 650}ms` }} />)}</div>
}
