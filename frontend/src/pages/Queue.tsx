import { Loader2, Plus } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"

import { Player } from "@/components/Player"
import { QueueCard } from "@/components/QueueCard"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import * as api from "@/lib/api"
import { formatDuration } from "@/lib/format"
import type { QueueItem, VideoInfo } from "@/types"

const YOUTUBE_URL_RE =
  /^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)[\w-]{6,}/i

interface QueueNavigationState {
  openItemId?: string
  seekTo?: number
}

export function Queue() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [items, setItems] = useState<QueueItem[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [pendingSeek, setPendingSeek] = useState<number | null>(null)
  const [transcribingIds, setTranscribingIds] = useState<Set<string>>(new Set())
  const [reconvertingIds, setReconvertingIds] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [preview, setPreview] = useState<VideoInfo | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const previewUrlRef = useRef<string>("")

  const activeTab: "queue" | "listened" =
    searchParams.get("tab") === "listened" ? "listened" : "queue"
  const search = searchParams.get("q") ?? ""
  const selectedId = searchParams.get("item")
  const url = searchParams.get("url") ?? ""

  function updateParam(key: string, value: string | null) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value == null || value === "") next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )
  }

  useEffect(() => {
    api
      .fetchQueue()
      .then(setItems)
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [])

  // Opened from the Highlights page: jump straight to the episode and seek.
  useEffect(() => {
    const state = location.state as QueueNavigationState | null
    if (state?.openItemId) {
      updateParam("item", state.openItemId)
      setPendingSeek(state.seekTo ?? null)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.state])

  function updateItem(updated: QueueItem) {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
  }

  function selectItem(item: QueueItem) {
    updateParam("item", item.id)
    setPendingSeek(null)
  }

  // Preview: fetch title/thumbnail when URL looks like a YouTube link.
  useEffect(() => {
    const trimmed = url.trim()
    if (!YOUTUBE_URL_RE.test(trimmed)) {
      setPreview(null)
      setPreviewLoading(false)
      previewUrlRef.current = ""
      return
    }
    if (trimmed === previewUrlRef.current) return
    const handle = window.setTimeout(() => {
      previewUrlRef.current = trimmed
      setPreviewLoading(true)
      api
        .fetchInfo(trimmed)
        .then((info) => {
          if (previewUrlRef.current === trimmed) setPreview(info)
        })
        .catch(() => {
          if (previewUrlRef.current === trimmed) setPreview(null)
        })
        .finally(() => {
          if (previewUrlRef.current === trimmed) setPreviewLoading(false)
        })
    }, 500)
    return () => window.clearTimeout(handle)
  }, [url])

  async function handleAdd() {
    if (!url.trim() || isAdding) return
    setIsAdding(true)
    setAddError(null)

    try {
      const info = await api.fetchInfo(url)
      const tempItem: QueueItem = {
        id: info.id,
        url,
        title: info.title,
        channel: info.channel,
        thumbnail: info.thumbnail,
        duration: info.duration,
        audio_path: null,
        transcript: null,
        transcript_segments: [],
        transcript_language: null,
        chapters: info.chapters,
        status: "downloading",
        last_position_seconds: 0,
      }
      setItems((prev) => [
        tempItem,
        ...prev.filter((i) => i.id !== tempItem.id),
      ])
      updateParam("url", null)
      setPreview(null)

      const converted = await api.convert(tempItem.url)
      updateItem(converted)
    } catch (err) {
      setAddError(
        err instanceof Error
          ? err.message
          : "Não foi possível adicionar o vídeo.",
      )
      setItems((prev) =>
        prev.filter((i) => i.status !== "downloading" || i.audio_path),
      )
    } finally {
      setIsAdding(false)
    }
  }

  async function handleTranscribe(id: string, language: string | null) {
    setTranscribingIds((prev) => new Set(prev).add(id))
    try {
      const updated = await api.transcribe(id, language)
      updateItem(updated)
    } catch {
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: "error" } : i)),
      )
    } finally {
      setTranscribingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  async function handleDelete(id: string) {
    await api.deleteQueueItem(id).catch(() => {})
    setItems((prev) => prev.filter((i) => i.id !== id))
    if (selectedId === id) updateParam("item", null)
  }

  async function handleArchive(id: string) {
    try {
      const updated = await api.patchQueueItem(id, { status: "archived" })
      updateItem(updated)
    } catch {
      // ignore, item stays as-is
    }
  }

  async function handleUnarchive(item: QueueItem) {
    const nextStatus = item.transcript ? "done" : "ready"
    try {
      const updated = await api.patchQueueItem(item.id, { status: nextStatus })
      updateItem(updated)
    } catch {
      // ignore, item stays archived
    }
  }

  async function handleReconvert(item: QueueItem) {
    setReconvertingIds((prev) => new Set(prev).add(item.id))
    try {
      const converted = await api.convert(item.url)
      updateItem(converted)
    } catch {
      // ignore, "Áudio removido" indicator stays visible for retry
    } finally {
      setReconvertingIds((prev) => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
    }
  }

  const selectedItem = items.find((i) => i.id === selectedId) ?? null

  const query = search.trim().toLowerCase()
  const visibleItems = items
    .filter((i) =>
      activeTab === "listened"
        ? i.status === "archived"
        : i.status !== "archived",
    )
    .filter(
      (i) =>
        !query ||
        i.title?.toLowerCase().includes(query) ||
        i.channel?.toLowerCase().includes(query) ||
        i.transcript?.toLowerCase().includes(query),
    )

  return (
    <>
      <div
        className={`mx-auto max-w-3xl px-4 ${selectedItem ? "pb-56" : "pb-10"}`}
      >
        <div className="mb-4 flex flex-col gap-2">
          <div className="flex gap-2">
            <Input
              value={url}
              onChange={(e) => updateParam("url", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="Cole o link do YouTube aqui…"
              disabled={isAdding}
            />
            <Button onClick={handleAdd} disabled={isAdding || !url.trim()}>
              {isAdding ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Adicionar
            </Button>
          </div>

          {(previewLoading || preview) && (
            <Card className="flex flex-row items-center gap-3 p-2">
              {previewLoading && !preview ? (
                <>
                  <Skeleton className="h-14 w-14 shrink-0 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </>
              ) : preview ? (
                <>
                  <img
                    src={preview.thumbnail}
                    alt={preview.title}
                    className="h-14 w-14 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-foreground truncate text-sm font-medium">
                      {preview.title}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {preview.channel} · {formatDuration(preview.duration)}
                    </p>
                  </div>
                  {previewLoading && (
                    <Loader2 className="text-muted-foreground size-4 shrink-0 animate-spin" />
                  )}
                </>
              ) : null}
            </Card>
          )}
        </div>

        {addError && (
          <p className="text-destructive mb-4 text-left text-sm">{addError}</p>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Tabs
            value={activeTab}
            onValueChange={(v) =>
              updateParam("tab", v === "listened" ? "listened" : null)
            }
          >
            <TabsList>
              <TabsTrigger value="queue">Fila</TabsTrigger>
              <TabsTrigger value="listened">Ouvidos</TabsTrigger>
            </TabsList>
          </Tabs>
          <Input
            value={search}
            onChange={(e) => updateParam("q", e.target.value)}
            placeholder="Buscar por título, canal ou transcrição…"
            className="max-w-xs"
          />
        </div>

        <div className="flex flex-col gap-3">
          {isAdding && !items.some((i) => i.status === "downloading") && (
            <Skeleton className="h-[88px] w-full rounded-xl" />
          )}
          {isLoading &&
            Array.from({ length: 3 }).map((_, idx) => (
              <Skeleton
                key={`queue-skeleton-${idx}`}
                className="h-[88px] w-full rounded-xl"
              />
            ))}
          {!isLoading && visibleItems.length === 0 && !isAdding && (
            <p className="text-muted-foreground py-12 text-center text-sm">
              {activeTab === "listened"
                ? "Nenhum episódio ouvido ainda."
                : "Sua fila está vazia. Cole um link para começar."}
            </p>
          )}
          {visibleItems.map((item) => (
            <QueueCard
              key={item.id}
              item={item}
              isSelected={item.id === selectedId}
              isTranscribing={transcribingIds.has(item.id)}
              isReconverting={reconvertingIds.has(item.id)}
              onSelect={selectItem}
              onTranscribe={handleTranscribe}
              onDelete={handleDelete}
              onArchive={handleArchive}
              onUnarchive={handleUnarchive}
              onReconvert={handleReconvert}
            />
          ))}
        </div>
      </div>

      {selectedItem && (
        <Player
          item={selectedItem}
          onClose={() => updateParam("item", null)}
          onUpdate={updateItem}
          onArchive={handleArchive}
          initialSeekSeconds={pendingSeek}
          onSeekConsumed={() => setPendingSeek(null)}
        />
      )}
    </>
  )
}
