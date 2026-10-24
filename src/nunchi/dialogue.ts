import type { DialogueTurn } from '@shared/contracts'

export const MAX_TURNS = 10

export class DialogueLog {
  private turns: DialogueTurn[] = []

  constructor(private readonly max = MAX_TURNS) {}

  push(role: DialogueTurn['role'], text: string): void {
    const t = text.trim()
    if (!t) return
    this.turns.push({ role, text: t.slice(0, 500) })
    if (this.turns.length > this.max) this.turns.splice(0, this.turns.length - this.max)
  }

  recent(): DialogueTurn[] {
    return this.turns.map(t => ({ ...t }))
  }
}
