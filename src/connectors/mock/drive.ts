import { ConnectorError, type MockOp } from '../types'

export const driveSearch: MockOp<'drive_search'> = (demo, input) => {
  const terms = input.query.toLowerCase().split(/\s+/).filter(Boolean)
  const scored = demo.files
    .map(f => {
      const name = f.name.toLowerCase()
      const content = f.content.toLowerCase()
      const score = terms.reduce((s, t) => s + (name.includes(t) ? 3 : 0) + (content.includes(t) ? 1 : 0), 0)
      return { f, score }
    })
    .filter(x => terms.length === 0 || x.score > 0)
    .sort((a, b) => b.score - a.score || Date.parse(b.f.modifiedAt) - Date.parse(a.f.modifiedAt))
    .slice(0, 10)
  return {
    files: scored.map(({ f }) => ({
      id: f.id, name: f.name, mimeType: f.mimeType, modifiedAt: f.modifiedAt,
      snippet: f.content.slice(0, 160).replace(/\s+/g, ' '),
    })),
  }
}

export const driveRead: MockOp<'drive_read'> = (demo, input) => {
  const f = demo.files.find(x => x.id === input.id)
  if (!f) throw new ConnectorError(`No file with id "${input.id}".`)
  return { id: f.id, name: f.name, mimeType: f.mimeType, modifiedAt: f.modifiedAt, content: f.content }
}
