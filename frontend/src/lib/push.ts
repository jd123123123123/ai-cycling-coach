/**
 * Web-push subscription helper (roadmap P1.5).
 *
 * enableMorningBrief(): permission → SW registration → push subscription →
 * POST /push/subscribe. Throws with a human reason on any refusal so the
 * settings toggle can explain honestly. disableMorningBrief() unsubscribes
 * both locally and server-side.
 */
import { apiClient } from '../api/client'

function urlB64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function enableMorningBrief(): Promise<void> {
  if (!pushSupported()) throw new Error('unsupported')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('denied')

  const { data } = await apiClient.get<{ key: string }>('/push/vapid-key')
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlB64ToUint8Array(data.key) as BufferSource,
  })
  await apiClient.post('/push/subscribe', sub.toJSON())
}

export async function disableMorningBrief(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    const sub = await reg?.pushManager.getSubscription()
    await sub?.unsubscribe()
  } finally {
    await apiClient.post('/push/unsubscribe')
  }
}

export async function sendTestPush(): Promise<number> {
  const { data } = await apiClient.post<{ delivered_to: number }>('/push/test')
  return data.delivered_to
}
