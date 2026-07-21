import {
  Check,
  Copy,
  ExternalLink,
  Highlighter,
  Loader2,
  Pause,
  Play,
  Volume2,
  VolumeX,
  X,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button, buttonVariants } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import * as api from "@/lib/api"
import { audioUrl } from "@/lib/api"
import { formatDuration } from "@/lib/format"
import type { Highlight, QueueItem, TranscriptSegment } from "@/types"

const SPEED_OPTIONS = [0.5, 1, 1.25, 1.5, 2]
const LANGUAGE_OPTIONS = [
  { code: "original", label: "Original" },
  { code: "pt", label: "Português" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
]
const POSITION_SAVE_INTERVAL_SECONDS = 5
const ARCHIVE_THRESHOLD = 0.95
const SKIP_SECONDS = 15
const VOLUME_STEP = 0.1
const VOLUME_STORAGE_KEY = "player.volume"

function readStoredVolume(): number {
  if (typeof window === "undefined") return 1
  const raw = window.localStorage.getItem(VOLUME_STORAGE_KEY)
  const value = raw != null ? Number(raw) : NaN
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1
}

interface SelectionInfo {
  text: string
  startTime: number
  rect: DOMRect
}

interface PlayerProps {
  item: QueueItem
  onClose: () => void
  onUpdate: (item: QueueItem) => void
  onArchive: (id: string) => void
  initialSeekSeconds: number | null
  onSeekConsumed: () => void
}

export function Player({
  item,
  onClose,
  onUpdate,
  onArchive,
  initialSeekSeconds,
  onSeekConsumed,
}: PlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [selectedSegments, setSelectedSegments] = useState<Set<number>>(
    new Set(),
  )
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [selectionCopied, setSelectionCopied] = useState(false)
  const [selectedLang, setSelectedLang] = useState("original")
  const [translations, setTranslations] = useState<
    Record<string, TranscriptSegment[]>
  >({})
  const [translating, setTranslating] = useState(false)
  const [translateError, setTranslateError] = useState<string | null>(null)
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null)
  const [highlightSaving, setHighlightSaving] = useState(false)
  const [volume, setVolume] = useState<number>(() => readStoredVolume())
  const [muted, setMuted] = useState(false)
  const lastSavedPositionRef = useRef(0)
  const archiveTriggeredRef = useRef(false)

  useEffect(() => {
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setSelectedSegments(new Set())
    setSelectedLang("original")
    setTranslations({})
    setSelectionInfo(null)
    lastSavedPositionRef.current = item.last_position_seconds
    archiveTriggeredRef.current = item.status === "archived"
  }, [item.id])

  // Reopening the same episode from Highlights: seek without remounting audio.
  useEffect(() => {
    if (initialSeekSeconds == null) return
    const audio = audioRef.current
    if (!audio || !audio.duration || initialSeekSeconds >= audio.duration) return
    audio.currentTime = initialSeekSeconds
    setCurrentTime(initialSeekSeconds)
    onSeekConsumed()
  }, [initialSeekSeconds])

  useEffect(() => {
    api
      .fetchHighlights(item.id)
      .then(setHighlights)
      .catch(() => {})
  }, [item.id])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed
  }, [speed])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume
    if (!muted) window.localStorage.setItem(VOLUME_STORAGE_KEY, String(volume))
  }, [volume, muted])

  useEffect(() => {
    setTranslateError(null)
    if (selectedLang === "original") return
    if (translations[selectedLang]) return
    setTranslating(true)
    api
      .translate(item.id, selectedLang)
      .then((res) =>
        setTranslations((prev) => ({ ...prev, [selectedLang]: res.segments })),
      )
      .catch((err) =>
        setTranslateError(
          err instanceof Error
            ? err.message
            : "Não foi possível traduzir a transcrição.",
        ),
      )
      .finally(() => setTranslating(false))
  }, [selectedLang, item.id])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      audio.play()
      setIsPlaying(true)
      navigator.mediaSession &&
        (navigator.mediaSession.playbackState = "playing")
    } else {
      audio.pause()
      setIsPlaying(false)
      navigator.mediaSession &&
        (navigator.mediaSession.playbackState = "paused")
    }
  }

  function seekTo(time: number) {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = time
    setCurrentTime(time)
  }

  function seekBy(delta: number) {
    const audio = audioRef.current
    if (!audio) return
    seekTo(
      Math.min(
        Math.max(audio.currentTime + delta, 0),
        audio.duration || Infinity,
      ),
    )
  }

  function changeVolume(delta: number) {
    setMuted(false)
    setVolume((prev) => Math.min(1, Math.max(0, prev + delta)))
  }

  function handleSeekInput(event: React.ChangeEvent<HTMLInputElement>) {
    seekTo(Number(event.target.value))
  }

  function toggleSegmentSelection(index: number) {
    setSelectedSegments((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  async function copySegmentText(index: number, text: string) {
    await navigator.clipboard.writeText(text)
    setCopiedIndex(index)
    setTimeout(
      () => setCopiedIndex((current) => (current === index ? null : current)),
      1500,
    )
  }

  async function copySelectedSegments() {
    const text = displaySegments
      .filter((_, index) => selectedSegments.has(index))
      .map((segment) => segment.text)
      .join(" ")
    await navigator.clipboard.writeText(text)
    setSelectionCopied(true)
    setTimeout(() => setSelectionCopied(false), 1500)
  }

  function handleTranscriptMouseUp() {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      setSelectionInfo(null)
      return
    }
    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const anchorNode = selection.anchorNode
    const anchorElement =
      anchorNode instanceof Element
        ? anchorNode
        : (anchorNode?.parentElement ?? null)
    const segmentElement = anchorElement?.closest<HTMLElement>(
      "[data-segment-start]",
    )
    const startTime = segmentElement
      ? Number(segmentElement.dataset.segmentStart)
      : 0
    setSelectionInfo({ text: selection.toString().trim(), startTime, rect })
  }

  async function saveHighlight(text: string, startTime: number) {
    setHighlightSaving(true)
    try {
      await api.createHighlight({
        queue_item_id: item.id,
        text,
        start_time: startTime,
      })
      const updated = await api.fetchHighlights(item.id)
      setHighlights(updated)
    } catch {
      // ignore, selection just clears without saving
    } finally {
      setHighlightSaving(false)
    }
  }

  async function confirmHighlight() {
    if (!selectionInfo) return
    await saveHighlight(selectionInfo.text, selectionInfo.startTime)
    setSelectionInfo(null)
    window.getSelection()?.removeAllRanges()
  }

  async function highlightSegment(segment: TranscriptSegment) {
    await saveHighlight(segment.text, segment.start)
  }

  function handleLoadedMetadata(event: React.SyntheticEvent<HTMLAudioElement>) {
    const audio = event.currentTarget
    setDuration(audio.duration)
    audio.playbackRate = speed
    audio.volume = muted ? 0 : volume
    if (initialSeekSeconds != null && initialSeekSeconds < audio.duration) {
      audio.currentTime = initialSeekSeconds
      setCurrentTime(initialSeekSeconds)
      onSeekConsumed()
    } else if (
      item.last_position_seconds > 0 &&
      item.last_position_seconds < audio.duration
    ) {
      audio.currentTime = item.last_position_seconds
      setCurrentTime(item.last_position_seconds)
    }
  }

  function handleTimeUpdate(event: React.SyntheticEvent<HTMLAudioElement>) {
    const audio = event.currentTarget
    setCurrentTime(audio.currentTime)

    if (
      audio.currentTime - lastSavedPositionRef.current >=
      POSITION_SAVE_INTERVAL_SECONDS
    ) {
      lastSavedPositionRef.current = audio.currentTime
      api
        .patchQueueItem(item.id, { last_position_seconds: audio.currentTime })
        .then(onUpdate)
        .catch(() => {})
    }

    if (
      !archiveTriggeredRef.current &&
      audio.duration &&
      audio.currentTime / audio.duration >= ARCHIVE_THRESHOLD
    ) {
      archiveTriggeredRef.current = true
      onArchive(item.id)
    }
  }

  // Media Session: lock screen / hardware media key controls.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return

    navigator.mediaSession.metadata = new MediaMetadata({
      title: item.title ?? "",
      artist: item.channel ?? "",
      artwork: item.thumbnail ? [{ src: item.thumbnail }] : [],
    })

    navigator.mediaSession.setActionHandler("play", () =>
      audioRef.current?.play(),
    )
    navigator.mediaSession.setActionHandler("pause", () =>
      audioRef.current?.pause(),
    )
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime != null) seekTo(details.seekTime)
    })
    navigator.mediaSession.setActionHandler("previoustrack", () =>
      seekBy(-SKIP_SECONDS),
    )
    navigator.mediaSession.setActionHandler("nexttrack", () =>
      seekBy(SKIP_SECONDS),
    )

    return () => {
      navigator.mediaSession.setActionHandler("play", null)
      navigator.mediaSession.setActionHandler("pause", null)
      navigator.mediaSession.setActionHandler("seekto", null)
      navigator.mediaSession.setActionHandler("previoustrack", null)
      navigator.mediaSession.setActionHandler("nexttrack", null)
    }
  }, [item.id, item.title, item.channel, item.thumbnail])

  // Keyboard shortcuts, disabled while a text input has focus.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return
      }

      switch (event.key) {
        case " ":
          event.preventDefault()
          togglePlay()
          break
        case "ArrowRight":
          seekBy(SKIP_SECONDS)
          break
        case "ArrowLeft":
          seekBy(-SKIP_SECONDS)
          break
        case "ArrowUp":
          event.preventDefault()
          changeVolume(VOLUME_STEP)
          break
        case "ArrowDown":
          event.preventDefault()
          changeVolume(-VOLUME_STEP)
          break
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const displaySegments =
    selectedLang === "original"
      ? item.transcript_segments
      : (translations[selectedLang] ?? item.transcript_segments)

  return (
    <div className="border-border bg-card/95 fixed inset-x-0 bottom-0 border-t backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 text-left">
            <p className="text-foreground truncate font-medium">{item.title}</p>
            <p className="text-muted-foreground truncate text-sm">
              {item.channel}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "ghost", size: "icon" })}
              aria-label="Assistir no YouTube"
            >
              <ExternalLink className="size-4" />
            </a>
            <Button
              size="icon"
              variant="ghost"
              onClick={onClose}
              aria-label="Fechar player"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <audio
          ref={audioRef}
          src={audioUrl(item.id)}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => setIsPlaying(false)}
        />

        <div className="flex items-center gap-3">
          <Button
            size="icon"
            onClick={togglePlay}
            aria-label={isPlaying ? "Pausar" : "Reproduzir"}
          >
            {isPlaying ? (
              <Pause className="size-4" />
            ) : (
              <Play className="size-4" />
            )}
          </Button>
          <span className="text-muted-foreground w-10 shrink-0 text-xs tabular-nums">
            {formatDuration(currentTime)}
          </span>
          <div className="relative flex-1">
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={currentTime}
              onChange={handleSeekInput}
              className="bg-muted accent-primary h-1.5 w-full cursor-pointer appearance-none rounded-full"
            />
            {duration > 0 &&
              item.chapters.map((chapter) => (
                <div
                  key={chapter.start_time}
                  className="bg-foreground/40 pointer-events-none absolute top-1/2 h-2 w-0.5 -translate-y-1/2"
                  style={{
                    left: `${(chapter.start_time / duration) * 100}%`,
                  }}
                />
              ))}
          </div>
          <span className="text-muted-foreground w-10 shrink-0 text-xs tabular-nums">
            {formatDuration(duration)}
          </span>
          <Select
            value={String(speed)}
            onValueChange={(v) => setSpeed(Number(v))}
          >
            <SelectTrigger size="sm" className="w-[4.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SPEED_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}x
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? "Ativar som" : "Silenciar"}
            >
              {muted || volume === 0 ? (
                <VolumeX className="size-4" />
              ) : (
                <Volume2 className="size-4" />
              )}
            </Button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                setMuted(false)
                setVolume(Number(e.target.value))
              }}
              className="bg-muted accent-primary h-1.5 w-20 cursor-pointer appearance-none rounded-full"
              aria-label="Volume"
            />
          </div>
        </div>

        <Tabs defaultValue="audio">
          <TabsList>
            <TabsTrigger value="audio">Capítulos</TabsTrigger>
            <TabsTrigger value="transcription">Transcrição</TabsTrigger>
          </TabsList>

          <TabsContent value="audio" className="flex flex-col gap-3">
            {item.chapters.length > 0 ? (
              <ScrollArea className="border-border bg-muted/50 h-32 rounded-xl border">
                <div className="flex flex-col p-1">
                  {item.chapters.map((chapter) => (
                    <button
                      key={chapter.start_time}
                      type="button"
                      onClick={() => seekTo(chapter.start_time)}
                      className="hover:bg-muted flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors"
                    >
                      <span className="text-foreground truncate">
                        {chapter.title}
                      </span>
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {formatDuration(chapter.start_time)}
                      </span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-muted-foreground py-6 text-center text-sm">
                Sem capítulos para este vídeo.
              </p>
            )}
          </TabsContent>

          <TabsContent value="transcription" className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Select
                value={selectedLang}
                onValueChange={(v) => setSelectedLang(v ?? "original")}
              >
                <SelectTrigger size="sm" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((option) => (
                    <SelectItem key={option.code} value={option.code}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {translating && (
                <Loader2 className="text-muted-foreground size-4 animate-spin" />
              )}
            </div>
            {translateError && (
              <p className="text-destructive text-left text-xs">
                {translateError}
              </p>
            )}

            {displaySegments.length > 0 ? (
              <>
                <p className="text-muted-foreground text-left text-xs">
                  Selecione trecho com o mouse para destacar, ou use o ícone{" "}
                  <Highlighter className="inline size-3" /> para destacar uma
                  frase inteira.
                </p>
                {selectedSegments.size > 0 && (
                  <div className="bg-muted flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm">
                    <span className="text-muted-foreground">
                      {selectedSegments.size} selecionada(s)
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={copySelectedSegments}
                      >
                        {selectionCopied ? (
                          <Check className="size-4" />
                        ) : (
                          <Copy className="size-4" />
                        )}
                        Copiar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSelectedSegments(new Set())}
                      >
                        Limpar
                      </Button>
                    </div>
                  </div>
                )}
                <ScrollArea className="border-border bg-muted/50 h-40 rounded-xl border">
                  <div
                    className="flex flex-col p-1"
                    onMouseUp={handleTranscriptMouseUp}
                  >
                    {displaySegments.map((segment, index) => {
                      const isActive =
                        currentTime >= segment.start &&
                        currentTime < segment.end
                      const isSelected = selectedSegments.has(index)
                      const isHighlighted = highlights.some(
                        (h) => h.start_time === segment.start,
                      )
                      return (
                        <div
                          key={index}
                          data-segment-start={segment.start}
                          className={`flex items-center gap-2 rounded-lg px-1 py-1 transition-colors ${
                            isActive
                              ? "bg-primary/20"
                              : isSelected
                                ? "bg-muted"
                                : isHighlighted
                                  ? "bg-yellow-100 dark:bg-yellow-900/40"
                                  : ""
                          }`}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() =>
                              toggleSegmentSelection(index)
                            }
                            aria-label="Selecionar frase"
                          />
                          <button
                            type="button"
                            onClick={() => seekTo(segment.start)}
                            className={`flex-1 rounded-md px-1 py-0.5 text-left text-sm leading-relaxed transition-colors ${
                              isActive
                                ? "text-foreground"
                                : "text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            {segment.text}
                          </button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-6 shrink-0"
                            onClick={() => copySegmentText(index, segment.text)}
                            aria-label="Copiar frase"
                          >
                            {copiedIndex === index ? (
                              <Check className="size-3.5" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                          </Button>
                          {!isHighlighted && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-6 shrink-0"
                              disabled={highlightSaving}
                              onClick={() => highlightSegment(segment)}
                              aria-label="Destacar frase"
                            >
                              <Highlighter className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <ScrollArea className="border-border bg-muted/50 h-40 rounded-xl border">
                <p className="text-foreground p-3 text-left text-sm leading-relaxed">
                  {item.transcript ??
                    "Sem transcrição ainda. Clique em “Transcrever” no card da fila."}
                </p>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {selectionInfo && (
        <div
          className="fixed z-50"
          style={{
            top: Math.max(selectionInfo.rect.top - 44, 8),
            left: selectionInfo.rect.left,
          }}
        >
          <Button
            size="sm"
            onClick={confirmHighlight}
            disabled={highlightSaving}
          >
            <Highlighter className="size-4" />
            Destacar
          </Button>
        </div>
      )}
    </div>
  )
}
