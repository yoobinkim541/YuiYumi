// Live connector dispatch for POST /api/connectors/<service>: runs a registry op (or the
// snapshot / sample-data extras) on the requesting user's connected account. Responses are
// { result, patch }: `result` has the mock op's shape, `patch` mirrors into the demo store.

import {
  getOpSpec, LIVE_SAMPLES_ADD_OP, LIVE_SAMPLES_REMOVE_OP, LIVE_SNAPSHOT_OP, LiveConnectorRequestSchema, LangSchema,
  PROVIDER_OF, type LiveConnectorResponse, type LiveService,
} from '../shared/contracts.js'
import { accountName, clearCredCookie, credCookie, readCreds, servicesOf, type Creds } from './auth.js'
import { admit, admitCount, admitOutbound } from './budget.js'
import { discordChannels, discordPost, discordRead, discordSnapshot, type DiscordCred } from './discord.js'
import { gcalConflicts, gcalCreate, gcalDelete, gcalList, gcalSnapshot } from './gcal.js'
import { gmailCreateDraft, gmailList, gmailRead, gmailReply, gmailRestore, gmailSend, gmailSendDraft, gmailSnapshot, gmailTrash } from './gmail.js'
import { GoogleSession } from './google.js'
import { fail, json, NotConnectedError, parseBody, RejectedError, UpstreamError } from './http.js'
import { addSamples, removeSamples } from './samples.js'
import { slackChannels, slackPost, slackRead, slackSnapshot, type SlackCred } from './slack.js'

type In = Record<string, unknown>
interface Ctx { google?: GoogleSession, slack?: SlackCred, discord?: DiscordCred }
type Handler = (input: In, ctx: Ctx) => Promise<LiveConnectorResponse>

const g = (ctx: Ctx) => ctx.google!
const asResponse = (patch: LiveConnectorResponse['patch']): LiveConnectorResponse => ({ result: { loaded: true }, patch })

/** Every live op by service. Inputs were validated against the contract schemas already. */
const SERVICES: Record<LiveService, Record<string, Handler>> = {
  mail: {
    mail_list: (i, c) => gmailList(g(c), i as never),
    mail_read: (i, c) => gmailRead(g(c), i as never),
    mail_create_draft: (i, c) => gmailCreateDraft(g(c), i as never),
    mail_send: (i, c) => gmailSend(g(c), i as never),
    mail_reply: (i, c) => gmailReply(g(c), i as never),
    mail_send_draft: (i, c) => gmailSendDraft(g(c), i as never),
    mail_trash: (i, c) => gmailTrash(g(c), i as never),
    mail_restore: (i, c) => gmailRestore(g(c), i as never),
    [LIVE_SNAPSHOT_OP]: async (_i, c) => asResponse(await gmailSnapshot(g(c))),
  },
  calendar: {
    calendar_list: (i, c) => gcalList(g(c), i as never),
    calendar_conflicts: (i, c) => gcalConflicts(g(c), i as never),
    calendar_create_event: (i, c) => gcalCreate(g(c), i as never),
    calendar_delete_event: (i, c) => gcalDelete(g(c), i as never),
    [LIVE_SNAPSHOT_OP]: async (i, c) => asResponse(await gcalSnapshot(g(c), i as { from?: string, to?: string })),
  },
  slack: {
    slack_channels: (_i, c) => slackChannels(c.slack!),
    slack_read: (i, c) => slackRead(c.slack!, i as never),
    slack_post: (i, c) => slackPost(c.slack!, i as never),
    [LIVE_SNAPSHOT_OP]: async (_i, c) => asResponse(await slackSnapshot(c.slack!)),
  },
  discord: {
    discord_channels: (_i, c) => discordChannels(c.discord!),
    discord_read: (i, c) => discordRead(c.discord!, i as never),
    discord_post: (i, c) => discordPost(c.discord!, i as never),
    [LIVE_SNAPSHOT_OP]: async (_i, c) => asResponse(await discordSnapshot(c.discord!)),
  },
}

const isService = (s: string): s is LiveService => Object.hasOwn(SERVICES, s)

/** Input check for the extra ops (registry ops use their contract schema). */
function extraInput(op: string, raw: unknown): In | null {
  const o = (raw && typeof raw === 'object' ? raw : {}) as In
  if (op === LIVE_SNAPSHOT_OP) {
    const str = (v: unknown) => (typeof v === 'string' && v.length <= 40 ? v : undefined)
    return { from: str(o.from), to: str(o.to) }
  }
  if (op === LIVE_SAMPLES_ADD_OP) {
    const lang = LangSchema.safeParse(o.lang)
    return lang.success ? { lang: lang.data } : null
  }
  if (op === LIVE_SAMPLES_REMOVE_OP) return {}
  return null
}

function context(service: LiveService, creds: Creds): Ctx | null {
  const p = PROVIDER_OF[service]
  const cred = creds[p]
  if (!cred || !servicesOf(cred).includes(service)) return null
  if (cred.p === 'google') return { google: new GoogleSession(cred) }
  if (cred.p === 'slack') return { slack: cred }
  return { discord: cred }
}

export async function handleConnectorRequest(request: Request): Promise<Response> {
  const service = new URL(request.url).pathname.split('/').filter(Boolean).at(-1) ?? ''
  if (!isService(service)) return fail(404, `unknown live service "${service}"`, 'bad_request')

  const body = await parseBody(request, LiveConnectorRequestSchema)
  if (body instanceof Response) return body

  const isSampleOp = service !== 'slack' && service !== 'discord' && (body.op === LIVE_SAMPLES_ADD_OP || body.op === LIVE_SAMPLES_REMOVE_OP)
  const handler = Object.hasOwn(SERVICES[service], body.op) ? SERVICES[service][body.op] : undefined
  const spec = getOpSpec(body.op)
  let input: In | null
  if (spec) {
    if (!handler || spec.service !== service) return fail(400, `op "${body.op}" is not available live`, 'bad_request')
    const parsed = spec.input.safeParse(body.input ?? {})
    if (!parsed.success) return fail(400, parsed.error.message, 'bad_request')
    input = parsed.data as In
  } else {
    if (!handler && !isSampleOp) return fail(400, `op "${body.op}" is not available live`, 'bad_request')
    input = extraInput(body.op, body.input)
    if (!input) return fail(400, 'invalid input', 'bad_request')
  }

  const { creds, fromCookie } = readCreds(request)
  const ctx = context(service, creds)
  const provider = PROVIDER_OF[service]
  if (!ctx) return fail(401, `${provider} is not connected`, 'not_connected')
  if (!admit(body.sessionId)) return fail(429, 'budget reached', 'budget')

  const cred = creds[provider]!
  if (spec?.grade === 'outbound') {
    const refusal = admitOutbound(body.sessionId, `${provider}:${accountName(cred)}`)
    if (refusal) return fail(429, refusal, 'rejected')
  }

  try {
    let out: LiveConnectorResponse
    if (isSampleOp) {
      if (!admitCount(`samples:${accountName(cred)}`, 6)) return fail(429, 'Sample data can be changed a few times a day only.', 'rejected')
      const s = ctx.google!
      out = { result: body.op === LIVE_SAMPLES_ADD_OP ? await addSamples(s, input.lang as never) : await removeSamples(s) }
    } else {
      out = await handler!(input, ctx)
    }
    const res = json(out)
    // Refreshed Google access token: re-seal it into the cookie it came from.
    if (ctx.google?.updated && fromCookie.has('google')) res.headers.append('set-cookie', credCookie(request, ctx.google.cred))
    return res
  } catch (e) {
    if (e instanceof RejectedError) return fail(e.status, e.message, 'rejected')
    if (e instanceof NotConnectedError) {
      const res = fail(401, e.message, 'not_connected')
      if (fromCookie.has(provider)) res.headers.append('set-cookie', clearCredCookie(request, provider))
      return res
    }
    if (e instanceof UpstreamError) {
      console.error(`[api/connectors/${service}]`, e.message)
      return fail(502, e.message, 'provider')
    }
    console.error(`[api/connectors/${service}]`, e)
    return fail(502, 'connector error', 'provider')
  }
}
