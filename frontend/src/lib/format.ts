export function formatDuration(
  totalSeconds: number | null | undefined,
): string {
  if (!totalSeconds || totalSeconds <= 0) return "0:00"
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const paddedSeconds = seconds.toString().padStart(2, "0")
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${paddedSeconds}`
  }
  return `${minutes}:${paddedSeconds}`
}
