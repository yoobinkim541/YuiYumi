export function timeLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function hm(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** "Name <addr>" -> "Name" */
export function displayName(from: string): string {
  const m = from.match(/^\s*([^<]+?)\s*</)
  return m?.[1] ?? from
}

export function initials(name: string): string {
  const clean = displayName(name).trim()
  const parts = clean.split(/\s+/)
  if (parts.length >= 2 && /^[A-Za-z]/.test(clean)) return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  return clean.slice(0, 1).toUpperCase()
}

const PALETTE = ['#f97316', '#8b5cf6', '#0ea5e9', '#10b981', '#ef4444', '#eab308', '#ec4899', '#6366f1']
export function colorFor(key: string): string {
  let h = 0
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]!
}
