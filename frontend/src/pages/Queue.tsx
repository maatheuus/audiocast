import { Loader2, Plus } from "lucide-react"
import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"

import { Player } from "@/components/Player"
import { QueueCard } from "@/components/QueueCard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import * as api from "@/lib/api"
import type { QueueItem } from "@/types"

interface QueueNavigationState {
  openItemId?: string
  seekTo?: number
}

export function Queue() {
  const location = useLocation()
  const navigate = useNavigate()
  const [items, setItems] = useState<QueueItem[]>([])
  const [url, setUrl] = useState("")
  const [isAdding, setIsAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingSeek, setPendingSeek] = useState<number | null>(null)
  const [transcribingIds, setTranscribingIds] = useState<Set<string>>(new Set())
  const [reconvertingIds, setReconvertingIds] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<"queue" | "listened">("queue")
  const [search, setSearch] = useState("")

  useEffect(() => {
    api
      .fetchQueue()
      .then(setItems)
      .catch(() => {})
  }, [])

  // Opened from the Highlights page: jump straight to the episode and seek.
  useEffect(() => {
    const state = location.state as QueueNavigationState | null
    if (state?.openItemId) {
      setSelectedId(state.openItemId)
      setPendingSeek(state.seekTo ?? null)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.state])

  function updateItem(updated: QueueItem) {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
  }

  function selectItem(item: QueueItem) {
    setSelectedId(item.id)
    setPendingSeek(null)
  }

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
      setUrl("")

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

  async function handleTranscribe(id: string) {
    setTranscribingIds((prev) => new Set(prev).add(id))
    try {
      const updated = await api.transcribe(id)
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
    if (selectedId === id) setSelectedId(null)
  }

  async function handleArchive(id: string) {
    try {
      const updated = await api.patchQueueItem(id, { status: "archived" })
      updateItem(updated)
    } catch {
      // ignore, item stays as-is
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
        <div className="mb-6 flex gap-2">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
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

        {addError && (
          <p className="text-destructive mb-4 text-left text-sm">{addError}</p>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "queue" | "listened")}
          >
            <TabsList>
              <TabsTrigger value="queue">Fila</TabsTrigger>
              <TabsTrigger value="listened">Ouvidos</TabsTrigger>
            </TabsList>
          </Tabs>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título, canal ou transcrição…"
            className="max-w-xs"
          />
        </div>

        <div className="flex flex-col gap-3">
          {isAdding && !items.some((i) => i.status === "downloading") && (
            <Skeleton className="h-[88px] w-full rounded-xl" />
          )}
          {visibleItems.length === 0 && !isAdding && (
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
              onReconvert={handleReconvert}
            />
          ))}
        </div>
      </div>

      {selectedItem && (
        <Player
          item={selectedItem}
          onClose={() => setSelectedId(null)}
          onUpdate={updateItem}
          onArchive={handleArchive}
          initialSeekSeconds={pendingSeek}
          onSeekConsumed={() => setPendingSeek(null)}
        />
      )}
    </>
  )
}
