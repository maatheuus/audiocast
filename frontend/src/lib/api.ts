import type {
  Highlight,
  QueueItem,
  TranscriptSegment,
  VideoInfo,
} from "@/types"

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? `Request failed: ${res.status}`)
  }
  return res.json()
}

export function fetchInfo(url: string): Promise<VideoInfo> {
  return request("/api/info", { method: "POST", body: JSON.stringify({ url }) })
}

export function convert(url: string): Promise<QueueItem> {
  return request("/api/convert", {
    method: "POST",
    body: JSON.stringify({ url }),
  })
}

export function transcribe(
  id: string,
  language: string | null = null,
): Promise<QueueItem> {
  return request("/api/transcribe", {
    method: "POST",
    body: JSON.stringify({ id, language }),
  })
}

export function fetchQueue(): Promise<QueueItem[]> {
  return request("/api/queue")
}

export function deleteQueueItem(id: string): Promise<void> {
  return request(`/api/queue/${id}`, { method: "DELETE" })
}

export function patchQueueItem(
  id: string,
  body: { last_position_seconds?: number; status?: string },
): Promise<QueueItem> {
  return request(`/api/queue/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  })
}

export function deleteAudio(id: string): Promise<QueueItem> {
  return request(`/api/queue/${id}/audio`, { method: "DELETE" })
}

export function audioUrl(id: string): string {
  return `/api/audio/${id}`
}

export function translate(
  queueItemId: string,
  targetLang: string,
): Promise<{ lang: string; segments: TranscriptSegment[] }> {
  return request("/api/translate", {
    method: "POST",
    body: JSON.stringify({
      queue_item_id: queueItemId,
      target_lang: targetLang,
    }),
  })
}

export function createHighlight(body: {
  queue_item_id: string
  text: string
  start_time: number
}): Promise<Highlight> {
  return request("/api/highlights", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function fetchHighlights(queueItemId?: string): Promise<Highlight[]> {
  return request(
    queueItemId
      ? `/api/highlights?queue_item_id=${queueItemId}`
      : "/api/highlights",
  )
}

export function deleteHighlight(id: number): Promise<void> {
  return request(`/api/highlights/${id}`, { method: "DELETE" })
}
