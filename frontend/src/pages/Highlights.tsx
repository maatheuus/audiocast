import { Check, Play, Share2, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import * as api from "@/lib/api"
import { formatDuration } from "@/lib/format"
import type { Highlight, QueueItem } from "@/types"

export function Highlights() {
  const navigate = useNavigate()
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [items, setItems] = useState<QueueItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [sharedId, setSharedId] = useState<number | null>(null)

  useEffect(() => {
    Promise.allSettled([
      api.fetchHighlights().then(setHighlights),
      api.fetchQueue().then(setItems),
    ]).finally(() => setIsLoading(false))
  }, [])

  async function handleDelete(id: number) {
    await api.deleteHighlight(id).catch(() => {})
    setHighlights((prev) => prev.filter((h) => h.id !== id))
  }

  function openAt(queueItemId: string, seekTo: number) {
    navigate("/", { state: { openItemId: queueItemId, seekTo } })
  }

  async function shareQuote(highlight: Highlight, item?: QueueItem) {
    const parts = [`"${highlight.text}"`]
    if (item?.title) {
      parts.push(`— ${item.title}${item.channel ? ` (${item.channel})` : ""}`)
    }
    if (item?.url) parts.push(item.url)
    const text = parts.join("\n")
    try {
      if (navigator.share) {
        await navigator.share({ text, title: item?.title ?? "Destaque" })
      } else {
        await navigator.clipboard.writeText(text)
        setSharedId(highlight.id)
        setTimeout(
          () =>
            setSharedId((current) =>
              current === highlight.id ? null : current,
            ),
          1500,
        )
      }
    } catch {
      // user cancelled share sheet
    }
  }

  const itemsById = new Map(items.map((i) => [i.id, i]))
  const grouped = new Map<string, Highlight[]>()
  for (const highlight of highlights) {
    const list = grouped.get(highlight.queue_item_id) ?? []
    list.push(highlight)
    grouped.set(highlight.queue_item_id, list)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-10">
      {isLoading && (
        <div className="flex flex-col gap-6">
          {Array.from({ length: 2 }).map((_, groupIdx) => (
            <div key={`highlight-skeleton-${groupIdx}`}>
              <div className="mb-2 flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <Skeleton className="h-4 w-48" />
              </div>
              <div className="flex flex-col gap-2">
                <Skeleton className="h-14 w-full rounded-xl" />
                <Skeleton className="h-14 w-full rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      )}
      {!isLoading && grouped.size === 0 && (
        <p className="text-muted-foreground py-12 text-center text-sm">
          Nenhum destaque ainda. Selecione um trecho da transcrição no player
          para destacar.
        </p>
      )}
      <div className="flex flex-col gap-6">
        {[...grouped.entries()].map(([queueItemId, list]) => {
          const item = itemsById.get(queueItemId)
          return (
            <div key={queueItemId}>
              <div className="mb-2 flex items-center gap-3">
                {item?.thumbnail && (
                  <img
                    src={item.thumbnail}
                    alt={item.title ?? ""}
                    className="h-10 w-10 rounded-lg object-cover"
                  />
                )}
                <p className="text-foreground truncate font-medium">
                  {item?.title ?? queueItemId}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {list.map((highlight) => (
                  <Card
                    key={highlight.id}
                    className="flex flex-row items-center gap-3 p-3"
                  >
                    <p className="text-foreground min-w-0 flex-1 text-left text-sm">
                      {highlight.text}
                    </p>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {formatDuration(highlight.start_time)}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openAt(queueItemId, highlight.start_time)}
                      aria-label="Reproduzir a partir daqui"
                    >
                      <Play className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => shareQuote(highlight, item)}
                      aria-label="Compartilhar destaque"
                    >
                      {sharedId === highlight.id ? (
                        <Check className="size-4" />
                      ) : (
                        <Share2 className="size-4" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(highlight.id)}
                      aria-label="Remover destaque"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </Card>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
