export type QueueItemStatus =
  | "queued"
  | "downloading"
  | "ready"
  | "transcribing"
  | "done"
  | "archived"
  | "error"

export interface Chapter {
  title: string
  start_time: number
}

export interface TranscriptSegment {
  start: number
  end: number
  text: string
}

export interface QueueItem {
  id: string
  url: string
  title: string | null
  channel: string | null
  thumbnail: string | null
  duration: number | null
  audio_path: string | null
  transcript: string | null
  transcript_segments: TranscriptSegment[]
  transcript_language: string | null
  chapters: Chapter[]
  status: QueueItemStatus
  last_position_seconds: number
}

export interface Highlight {
  id: number
  queue_item_id: string
  text: string
  start_time: number
  created_at: number
}

export interface VideoInfo {
  id: string
  title: string
  channel: string
  thumbnail: string
  duration: number
  chapters: Chapter[]
}
