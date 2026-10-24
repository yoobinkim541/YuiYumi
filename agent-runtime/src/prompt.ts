// Voice-first appendix to the Claude Code system prompt, and extraction of the spoken
// summary lines ("SAY: ...") the appendix asks for.

import type { AgentLang, AgentPersona } from './protocol.ts'

const LANGUAGE: Record<AgentLang, string> = {
  'en': 'English',
  'ja': 'Japanese',
  'ko': 'Korean',
  'zh-Hans': 'Simplified Chinese',
  'zh-Hant': 'Traditional Chinese',
}

export function languageName(lang: AgentLang): string {
  return LANGUAGE[lang] ?? 'English'
}

/** Appended to the claude_code preset; the preset's own prompt stays in front. */
export function voiceAppendix(o: { lang: AgentLang, persona?: AgentPersona }): string {
  const name = o.persona?.name?.trim() || 'the assistant'
  const style = o.persona?.speakingStyle?.trim()
  return [
    '# Voice interface',
    `The user talks to you through ${name}, an animated desktop character with a voice. Requests usually arrive as transcribed speech, so expect informal wording and transcription mistakes; infer the intent. The user may not be looking at the screen while you work.`,
    '',
    'Spoken summaries:',
    '- When you start working on a request, begin your first message with one line of the form `SAY: <one short sentence>` saying what you are about to do.',
    '- When you finish, end your final message with one line `SAY: <one short sentence>` with the outcome, or the one question you need answered.',
    '- SAY lines are read aloud by text-to-speech. Keep each under about 20 words, natural speech only: no code, file paths, URLs, numbers lists or markdown.',
    `- Write SAY lines in ${languageName(o.lang)}${o.persona?.name ? `, in the voice of ${name}` : ''}.${style ? ` Speaking style: ${style.slice(0, 400)}` : ''}`,
    '',
    'Transcript:',
    `- Everything except SAY lines is shown in a transcript panel. Write it in ${languageName(o.lang)} unless the user writes in another language; code and identifiers stay as they are. Be concise; details belong there, not in SAY lines.`,
    '- If you need a decision from the user, ask it in the final SAY line and stop instead of guessing on anything destructive.',
    '',
    'Working rules:',
    '- Work inside the current project folder unless the user explicitly names another location.',
    '- If the project has a CLAUDE.md or AGENTS.md at its root, read it before changing code.',
    '- Never print, echo or write out API keys, tokens, passwords or environment variable values.',
  ].join('\n')
}

const SAY_LINE = /^[ \t]*(?:\*\*)?SAY:(?:\*\*)?[ \t]*(.+?)[ \t]*$/gm

/** Splits assistant text into transcript text and its spoken lines. */
export function extractSay(text: string): { text: string, say: string[] } {
  const say: string[] = []
  const rest = text.replace(SAY_LINE, (_m, line: string) => {
    const clean = line.replace(/`|\*\*/g, '').trim()
    if (clean) say.push(clean)
    return ''
  })
  return { text: rest.replace(/\n{3,}/g, '\n\n').trim(), say }
}

/** Fallback spoken line when the agent wrote no SAY line: its first sentence, shortened. */
export function firstSentence(text: string, max = 140): string {
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  // Latin full stops end a sentence only before a space; CJK ones always do.
  const m = /^(.+?(?:[.!?](?=\s|$)|[。！？]))/.exec(plain)
  const s = m?.[1] ?? plain
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}
