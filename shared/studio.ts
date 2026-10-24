// Virtual coding studio (web demo): request shape of /api/studio and the tools the studio
// model may call. The browser runs the tools against an in-memory file system and loops.
// Shared by the server (tool definitions, request validation) and the browser (tool input
// validation, limits).

import { z } from 'zod'
import { AGENT_MODELS, LangSchema } from './contracts.js'

export const STUDIO_LIMITS = {
  /** Files per project. */
  maxFiles: 20,
  /** UTF-8 bytes of all files of a project together. */
  maxTotalBytes: 200_000,
  /** UTF-8 bytes of one file. */
  maxFileBytes: 100_000,
  maxPathLength: 80,
  maxNameLength: 40,
  maxSummaryLength: 600,
  /** Model calls per task. */
  maxSteps: 12,
} as const

/** File types the studio accepts. Everything is served from memory into a sandboxed frame. */
export const STUDIO_EXTENSIONS = ['html', 'css', 'js', 'json', 'svg', 'txt', 'md'] as const

const SEGMENT = '[A-Za-z0-9_-][A-Za-z0-9._-]*'
const PATH_RE = new RegExp(`^${SEGMENT}(?:/${SEGMENT})*$`)

export function extensionOf(path: string): string {
  const i = path.lastIndexOf('.')
  return i < 0 ? '' : path.slice(i + 1).toLowerCase()
}

/** Relative path inside a project: no leading slash, no "..", known extension. */
export const StudioPathSchema = z.string()
  .min(1)
  .max(STUDIO_LIMITS.maxPathLength)
  .regex(PATH_RE, 'use a relative path like "index.html" or "js/app.js" (letters, digits, . _ - and /)')
  .refine(p => !p.split('/').some(s => s === '.' || s === '..'), 'path must not contain "." or ".." segments')
  .refine(p => (STUDIO_EXTENSIONS as readonly string[]).includes(extensionOf(p)), `allowed file types: ${STUDIO_EXTENSIONS.join(', ')}`)

export const StartProjectInputSchema = z.object({
  name: z.string().trim().min(1).max(STUDIO_LIMITS.maxNameLength).describe('Short app name in the user\'s language, e.g. "Todo" or "할 일".'),
})
export const WriteFileInputSchema = z.object({
  path: StudioPathSchema.describe('Relative path, e.g. "index.html", "style.css", "app.js".'),
  content: z.string().max(STUDIO_LIMITS.maxFileBytes).describe('Complete file content (the file is replaced).'),
})
export const ReadFileInputSchema = z.object({ path: StudioPathSchema })
export const ListFilesInputSchema = z.object({})
export const DeleteFileInputSchema = z.object({ path: StudioPathSchema })
export const OpenPreviewInputSchema = z.object({
  entry: StudioPathSchema.refine(p => extensionOf(p) === 'html', 'entry must be an .html file').default('index.html')
    .describe('HTML file to open in the browser window, usually "index.html".'),
})
export const FinishInputSchema = z.object({
  summary: z.string().trim().min(1).max(STUDIO_LIMITS.maxSummaryLength)
    .describe('One or two short spoken-style sentences in the user\'s language: what you built and how to use it.'),
})

export interface StudioToolSpec<I extends z.ZodType = z.ZodType> {
  name: string
  description: string
  input: I
}

export const STUDIO_TOOLS = [
  { name: 'start_project', input: StartProjectInputSchema, description: 'Start a new, empty project for the app you are about to build and give it a short name. Call it once, first, when building a new app. Skip it only when the request changes the current project named in <context>.' },
  { name: 'write_file', input: WriteFileInputSchema, description: 'Create or replace a file in the current project with its complete content. The user watches it being typed in the code editor.' },
  { name: 'read_file', input: ReadFileInputSchema, description: 'Read a file of the current project.' },
  { name: 'list_files', input: ListFilesInputSchema, description: 'List the files of the current project with their sizes.' },
  { name: 'delete_file', input: DeleteFileInputSchema, description: 'Delete a file from the current project.' },
  { name: 'open_preview', input: OpenPreviewInputSchema, description: 'Open the project in the browser window so the user can try it. Local style sheets and scripts referenced by relative path are bundled in; the page runs sandboxed with no network.' },
  { name: 'finish', input: FinishInputSchema, description: 'End the task with a short summary for the user. Call it last, after open_preview.' },
] as const satisfies readonly StudioToolSpec[]

export type StudioToolName = (typeof STUDIO_TOOLS)[number]['name']
export const STUDIO_TOOL_NAMES = STUDIO_TOOLS.map(t => t.name) as StudioToolName[]
export const getStudioTool = (name: string) => STUDIO_TOOLS.find(t => t.name === name)

export const StudioStepRequestSchema = z.object({
  lang: LangSchema,
  /** Anthropic-shaped message params, passed through after sanitizing. */
  messages: z.array(z.unknown()).min(1),
  sessionId: z.string().min(1).max(100),
  model: z.enum(AGENT_MODELS).optional(),
})
export type StudioStepRequest = z.infer<typeof StudioStepRequestSchema>

export interface StudioStepResponse {
  /** Anthropic-shaped content blocks of the assistant turn. */
  content: unknown[]
  stopReason: string | null
}

/** UTF-8 byte length (TextEncoder exists in browsers and Node). */
export function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length
}
