import {
  Archive,
  ExternalLink,
  FileText,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDuration } from "@/lib/format"
import type { QueueItem } from "@/types"

const STATUS_LABELS: Record<QueueItem["status"], string> = {
  queued: "Na fila",
  downloading: "Baixando…",
  ready: "Pronto",
  transcribing: "Transcrevendo…",
  done: "Transcrito",
  archived: "Ouvido",
  error: "Erro",
}

const STATUS_VARIANTS: Record<
  QueueItem["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  queued: "outline",
  downloading: "secondary",
  ready: "default",
  transcribing: "secondary",
  done: "default",
  archived: "outline",
  error: "destructive",
}

interface QueueCardProps {
  item: QueueItem
  isSelected: boolean
  isTranscribing: boolean
  isReconverting: boolean
  onSelect: (item: QueueItem) => void
  onTranscribe: (id: string) => void
  onDelete: (id: string) => void
  onArchive: (id: string) => void
  onReconvert: (item: QueueItem) => void
}

export function QueueCard({
  item,
  isSelected,
  isTranscribing,
  isReconverting,
  onSelect,
  onTranscribe,
  onDelete,
  onArchive,
  onReconvert,
}: QueueCardProps) {
  const audioRemoved = item.status === "archived" && !item.audio_path
  const isPlayable =
    (item.status === "ready" ||
      item.status === "transcribing" ||
      item.status === "done" ||
      item.status === "archived") &&
    !!item.audio_path
  const canTranscribe = isPlayable && !item.transcript && !isTranscribing
  const canArchive = isPlayable && item.status !== "archived"

  return (
    <Card
      onClick={() => isPlayable && onSelect(item)}
      className={`flex flex-row items-center gap-4 p-3 transition-colors ${
        isPlayable ? "hover:bg-muted cursor-pointer" : ""
      } ${isSelected ? "ring-primary ring-2" : ""}`}
    >
      {item.thumbnail ? (
        <img
          src={item.thumbnail}
          alt={item.title ?? "thumbnail"}
          className="h-16 w-16 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <Skeleton className="h-16 w-16 shrink-0 rounded-xl" />
      )}

      <div className="min-w-0 flex-1 text-left">
        <p className="text-foreground truncate font-medium">
          {item.title ?? <Skeleton className="h-4 w-40" />}
        </p>
        <p className="text-muted-foreground truncate text-sm">{item.channel}</p>
        <div className="mt-1 flex items-center gap-2">
          <Badge variant={STATUS_VARIANTS[item.status]}>
            {STATUS_LABELS[item.status]}
          </Badge>
          {audioRemoved && <Badge variant="outline">Áudio removido</Badge>}
          <span className="text-muted-foreground text-xs">
            {formatDuration(item.duration)}
          </span>
        </div>
      </div>

      <div
        className="flex shrink-0 items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        {canTranscribe && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onTranscribe(item.id)}
          >
            <FileText className="size-4" />
            Transcrever
          </Button>
        )}
        {isTranscribing && (
          <Button size="sm" variant="secondary" disabled>
            <Loader2 className="size-4 animate-spin" />
            Transcrevendo
          </Button>
        )}
        {audioRemoved && (
          <Button
            size="sm"
            variant="secondary"
            disabled={isReconverting}
            onClick={() => onReconvert(item)}
          >
            {isReconverting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RotateCcw className="size-4" />
            )}
            Reconverter
          </Button>
        )}
        {canArchive && (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onArchive(item.id)}
            aria-label="Marcar como ouvido"
          >
            <Archive className="size-4" />
          </Button>
        )}
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
          onClick={() => onDelete(item.id)}
          aria-label="Remover"
        >
          <X className="size-4" />
        </Button>
      </div>
    </Card>
  )
}
