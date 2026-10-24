import Anthropic from '@anthropic-ai/sdk'
import { env } from './http'

let client: Anthropic | undefined

export function anthropic(): Anthropic {
  client ??= new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') })
  return client
}

export const MODELS = {
  observer: () => env('MODEL_OBSERVER') ?? 'claude-haiku-5-5',
  agent: () => env('MODEL_AGENT') ?? 'claude-sonnet-5-5',
}

export const anthropicConfigured = () => Boolean(env('ANTHROPIC_API_KEY'))
