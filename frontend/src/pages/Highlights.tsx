import { Play, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import * as api from "@/lib/api"
import { formatDuration } from "@/lib/format"
import type { Highlight, QueueItem } from "@/types"

export function Highlights() {
  const navigate = useNavigate()
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [items, setItems] = useState<QueueItem[]>([])

  useEffect(() => {
    api
      .fetchHighlights()
      .then(setHighlights)
      .catch(() => {})
    api
      .fetchQueue()
      .then(setItems)
      .catch(() => {})
  }, [])

  async function handleDelete(id: number) {
    await api.deleteHighlight(id).catch(() => {})
    setHighlights((prev) => prev.filter((h) => h.id !== id))
  }

  function openAt(queueItemId: string, seekTo: number) {
    navigate("/", { state: { openItemId: queueItemId, seekTo } })
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
      {grouped.size === 0 && (
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
