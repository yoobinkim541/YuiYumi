// POST /api/connectors/<service>: allowlisted read-only live connector ops.
// Body: { op, input, sessionId }. Responses use the same shapes as the mock ops.

import { getOpSpec, LiveConnectorRequestSchema } from '../../shared/contracts'
import { admit } from '../../server/budget'
import { discordChannels, discordConfigured, discordRead } from '../../server/discord'
import { fail, json, parseBody } from '../../server/http'
import { slackChannels, slackConfigured, slackRead, UpstreamError } from '../../server/slack'

type Handler = (input: Record<string, unknown>) => Promise<unknown>

/** The only live operations. Read grade only: no posting, sending or deleting. */
const SERVICES: Record<string, { configured: () => boolean, ops: Record<string, Handler> }> = {
  slack: {
    configured: slackConfigured,
    ops: {
      slack_channels: () => slackChannels(),
      slack_read: i => slackRead(i.channelId as string, i.limit as number | undefined),
    },
  },
  discord: {
    configured: discordConfigured,
    ops: {
      discord_channels: () => discordChannels(),
      discord_read: i => discordRead(i.channelId as string, i.limit as number | undefined),
    },
  },
}

export async function POST(request: Request): Promise<Response> {
  const service = new URL(request.url).pathname.split('/').filter(Boolean).at(-1) ?? ''
  const svc = Object.hasOwn(SERVICES, service) ? SERVICES[service] : undefined
  if (!svc) return fail(404, `unknown live service "${service}"`, 'bad_request')

  const body = await parseBody(request, LiveConnectorRequestSchema)
  if (body instanceof Response) return body

  const handler = Object.hasOwn(svc.ops, body.op) ? svc.ops[body.op] : undefined
  const spec = getOpSpec(body.op)
  if (!handler || !spec || spec.grade !== 'read') return fail(400, `op "${body.op}" is not available live`, 'bad_request')

  const parsed = spec.input.safeParse(body.input ?? {})
  if (!parsed.success) return fail(400, parsed.error.message, 'bad_request')

  if (!svc.configured()) return fail(503, `${service} is not configured`, 'unconfigured')
  if (!admit(body.sessionId)) return fail(429, 'budget reached', 'budget')

  try {
    return json(await handler(parsed.data as Record<string, unknown>))
  } catch (e) {
    if (e instanceof UpstreamError) {
      console.error(`[api/connectors/${service}]`, e.message)
      return fail(e.status === 403 ? 403 : 502, e.message, 'provider')
    }
    console.error(`[api/connectors/${service}]`, e)
    return fail(502, 'connector error', 'provider')
  }
}
