import Anthropic from '@anthropic-ai/sdk'
import type { AgentModel } from '../shared/contracts'
import { env } from './http'

let client: Anthropic | undefined

export function anthropic(): Anthropic {
  client ??= new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') })
  return client
}

export const MODELS = {
  observer: () => env('MODEL_OBSERVER') ?? 'claude-haiku-5-5',
  /** Task model chosen by the user; only these two ids can be reached. */
  agent: (choice: AgentModel = 'sonnet') => choice === 'opus'
    ? env('MODEL_AGENT_OPUS') ?? 'claude-opus-5-5'
    : env('MODEL_AGENT') ?? 'claude-sonnet-5-5',
}

export const anthropicConfigured = () => Boolean(env('ANTHROPIC_API_KEY'))
