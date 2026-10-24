// Desktop app client for the local agent runtime (agent-runtime/): start a task, stream
// its events, answer permission prompts, cancel. The controller below keeps the transcript
// for AgentPanel.vue and drives the character through the bus (busy, thinking, spoken
// start/end lines). Coding, files, shell and web tasks go here; connector work stays on the
// browser loop in src/agent/ (see docs/agent-runtime.md).

import { reactive } from 'vue'
import type { AgentModel, PermissionLevel } from '@shared/contracts'
import type { Lang } from '@shared/languages'
import { bus, type BusEvents } from '@/core/bus'
import {
  SseParser,
  TOKEN_HEADER,
  type AgentErrorCode,
  type AgentEvent,
  type AgentPersona,
  type StartTaskRequest,
  type StartTaskResponse,
  type ToolGrade,
} from '../../agent-runtime/src/protocol'

export type { AgentEvent, ToolGrade } from '../../agent-runtime/src/protocol'

// ---------------------------------------------------------------------------
// HTTP client

export interface AgentRuntimeEndpoint {
  /** Port from the runtime's ready line. The runtime only listens on 127.0.0.1. */
  port: number
  token: string
}

export class AgentRuntimeError extends Error {
  readonly status: number
  readonly code: AgentErrorCode | 'offline'
  constructor(status: number, code: AgentErrorCode | 'offline', message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export class AgentBridge {
  private base = ''
  private token = ''
  private readonly fetchImpl: typeof fetch

  constructor(endpoint: AgentRuntimeEndpoint, fetchImpl: typeof fetch = (...a) => fetch(...a)) {
    this.retarget(endpoint)
    this.fetchImpl = fetchImpl
  }

  /** Points at a restarted runtime (new port and token). */
  retarget(endpoint: AgentRuntimeEndpoint): void {
    this.base = `http://127.0.0.1:${endpoint.port}`
    this.token = endpoint.token
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response
    try {
      res = await this.fetchImpl(`${this.base}${path}`, {
        method,
        headers: { 'content-type': 'application/json', [TOKEN_HEADER]: this.token },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    } catch (e) {
      throw new AgentRuntimeError(0, 'offline', (e as Error).message)
    }
    const data = await res.json().catch(() => ({})) as T & { error?: string, code?: AgentErrorCode }
    if (!res.ok) throw new AgentRuntimeError(res.status, data.code ?? 'internal', data.error ?? `HTTP ${res.status}`)
    return data
  }

  async health(): Promise<boolean> {
    try { return (await this.fetchImpl(`${this.base}/health`)).ok } catch { return false }
  }

  start(req: StartTaskRequest): Promise<StartTaskResponse> { return this.call('POST', '/sessions', req) }
  send(sessionId: string, text: string): Promise<unknown> { return this.call('POST', `/sessions/${sessionId}/messages`, { text }) }
  answer(sessionId: string, requestId: string, allow: boolean): Promise<unknown> { return this.call('POST', `/sessions/${sessionId}/permissions/${requestId}`, { allow }) }
  cancel(sessionId: string): Promise<unknown> { return this.call('POST', `/sessions/${sessionId}/cancel`) }
  close(sessionId: string): Promise<unknown> { return this.call('DELETE', `/sessions/${sessionId}`) }
  settings(sessionId: string, s: { permission?: PermissionLevel, model?: AgentModel }): Promise<unknown> { return this.call('POST', `/sessions/${sessionId}/settings`, s) }

  /**
   * Streams a session's events until it closes or `signal` aborts. Reconnects after a
   * dropped connection and resumes after the last event seen, so nothing is lost or doubled.
   */
  async stream(sessionId: string, onEvent: (e: AgentEvent, seq: number) => void, opts: { signal: AbortSignal, after?: number, onConnection?: (up: boolean) => void }): Promise<void> {
    let after = opts.after ?? 0
    let closed = false
    let backoff = 500
    while (!closed && !opts.signal.aborted) {
      try {
        const res = await this.fetchImpl(`${this.base}/sessions/${sessionId}/events?after=${after}`, { headers: { [TOKEN_HEADER]: this.token }, signal: opts.signal })
        if (res.status === 404) return
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
        opts.onConnection?.(true)
        backoff = 500
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        const parser = new SseParser()
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          for (const { seq, event } of parser.feed(decoder.decode(value, { stream: true }))) {
            if (seq > 0) after = seq
            onEvent(event, seq)
            if (event.type === 'status' && event.state === 'closed') closed = true
          }
        }
      } catch {
        if (opts.signal.aborted) return
      }
      if (closed || opts.signal.aborted) break
      opts.onConnection?.(false)
      await new Promise(r => setTimeout(r, backoff))
      backoff = Math.min(backoff * 2, 8000)
    }
  }
}

// ---------------------------------------------------------------------------
// Localized strings (panel UI and the character's spoken lines)

export interface RuntimeStrings {
  title: string
  placeholder: string
  send: string
  stop: string
  newTask: string
  allow: string
  deny: string
  working: string
  waiting: string
  offline: string
  empty: string
  grade: Record<ToolGrade, string>
  /** Permission card heading per grade. */
  ask: Record<ToolGrade, string>
  allowed: string
  denied: string
  expired: string
  secondsLeft: (s: number) => string
  done: (sec: number, usd: number) => string
  cancelled: string
  failed: string
  errors: Partial<Record<AgentErrorCode | 'offline', string>>
  /** Spoken when a prompt opens: the user may not be looking at the panel. */
  sayAsk: Record<ToolGrade, string>
  sayFailed: string
}

const EN: RuntimeStrings = {
  title: 'Agent',
  placeholder: 'Ask me to code, edit files, run commands or research…',
  send: 'Send',
  stop: 'Stop',
  newTask: 'New task',
  allow: 'Allow',
  deny: 'Deny',
  working: 'Working…',
  waiting: 'Waiting for your answer',
  offline: 'Agent runtime is not running',
  empty: 'Tasks that touch your computer (code, files, shell, the web) run here.',
  grade: { read: 'Read', write: 'Edit', shell: 'Command', network: 'Web', outbound: 'External' },
  ask: { read: 'Read outside the project?', write: 'Allow this edit?', shell: 'Run this command?', network: 'Open this web page?', outbound: 'Allow this external action?' },
  allowed: 'Allowed',
  denied: 'Denied',
  expired: 'No answer, skipped',
  secondsLeft: s => `${s}s`,
  done: (sec, usd) => `Done in ${sec}s · $${usd.toFixed(3)}`,
  cancelled: 'Stopped',
  failed: 'The task did not finish',
  errors: {
    no_project: 'Choose a project folder in settings first.',
    unconfigured: 'The agent has no model access right now.',
    budget: 'Today\'s agent budget is used up.',
    offline: 'The agent runtime is not running.',
  },
  sayAsk: { read: 'May I look at a file outside the project?', write: 'May I change this file?', shell: 'May I run this command?', network: 'May I open this web page?', outbound: 'May I do this outside the app?' },
  sayFailed: 'Sorry, that didn\'t work out.',
}

export const RUNTIME_STRINGS: Record<Lang, RuntimeStrings> = {
  'en': EN,
  'ja': {
    title: 'エージェント',
    placeholder: 'コーディング、ファイル編集、コマンド実行、調べものを頼んでね…',
    send: '送信',
    stop: '停止',
    newTask: '新しいタスク',
    allow: '許可',
    deny: '拒否',
    working: '作業中…',
    waiting: '返事を待っています',
    offline: 'エージェントが起動していません',
    empty: 'コード・ファイル・シェル・Web など、パソコン上の作業はここで動きます。',
    grade: { read: '読み取り', write: '編集', shell: 'コマンド', network: 'Web', outbound: '外部' },
    ask: { read: 'プロジェクト外を読みますか？', write: 'この編集を許可しますか？', shell: 'このコマンドを実行しますか？', network: 'このページを開きますか？', outbound: 'この外部操作を許可しますか？' },
    allowed: '許可しました',
    denied: '拒否しました',
    expired: '返事がなかったので見送りました',
    secondsLeft: s => `${s}秒`,
    done: (sec, usd) => `${sec}秒で完了 · $${usd.toFixed(3)}`,
    cancelled: '停止しました',
    failed: 'タスクは完了しませんでした',
    errors: {
      no_project: '先に設定でプロジェクトフォルダを選んでね。',
      unconfigured: '今はモデルに接続できません。',
      budget: '今日のエージェント予算を使い切りました。',
      offline: 'エージェントが起動していません。',
    },
    sayAsk: { read: 'プロジェクトの外のファイルを見てもいい？', write: 'このファイル、変更してもいい？', shell: 'このコマンド、実行してもいい？', network: 'このページを開いてもいい？', outbound: 'アプリの外でこれをしてもいい？' },
    sayFailed: 'ごめんね、うまくいかなかった。',
  },
  'ko': {
    title: '에이전트',
    placeholder: '코딩, 파일 편집, 명령 실행, 자료 조사를 부탁해 주세요…',
    send: '보내기',
    stop: '중지',
    newTask: '새 작업',
    allow: '허용',
    deny: '거부',
    working: '작업 중…',
    waiting: '답을 기다리고 있어요',
    offline: '에이전트가 실행 중이 아니에요',
    empty: '코드, 파일, 셸, 웹처럼 컴퓨터에서 하는 작업은 여기서 실행돼요.',
    grade: { read: '읽기', write: '편집', shell: '명령', network: '웹', outbound: '외부' },
    ask: { read: '프로젝트 밖을 읽을까요?', write: '이 편집을 허용할까요?', shell: '이 명령을 실행할까요?', network: '이 웹 페이지를 열까요?', outbound: '이 외부 작업을 허용할까요?' },
    allowed: '허용함',
    denied: '거부함',
    expired: '답이 없어 건너뜀',
    secondsLeft: s => `${s}초`,
    done: (sec, usd) => `${sec}초 만에 완료 · $${usd.toFixed(3)}`,
    cancelled: '중지함',
    failed: '작업을 끝내지 못했어요',
    errors: {
      no_project: '먼저 설정에서 프로젝트 폴더를 골라 주세요.',
      unconfigured: '지금은 모델에 연결할 수 없어요.',
      budget: '오늘의 에이전트 예산을 다 썼어요.',
      offline: '에이전트가 실행 중이 아니에요.',
    },
    sayAsk: { read: '프로젝트 밖의 파일을 봐도 될까요?', write: '이 파일을 바꿔도 될까요?', shell: '이 명령을 실행해도 될까요?', network: '이 웹 페이지를 열어도 될까요?', outbound: '앱 밖에서 이 작업을 해도 될까요?' },
    sayFailed: '미안해요, 잘 안 됐어요.',
  },
  'zh-Hans': {
    title: '智能体',
    placeholder: '让我写代码、改文件、运行命令或查资料…',
    send: '发送',
    stop: '停止',
    newTask: '新任务',
    allow: '允许',
    deny: '拒绝',
    working: '工作中…',
    waiting: '等待你的回答',
    offline: '智能体未运行',
    empty: '涉及电脑的任务（代码、文件、命令行、网页）在这里运行。',
    grade: { read: '读取', write: '编辑', shell: '命令', network: '网页', outbound: '外部' },
    ask: { read: '读取项目以外的内容？', write: '允许这次编辑？', shell: '运行这条命令？', network: '打开这个网页？', outbound: '允许这个外部操作？' },
    allowed: '已允许',
    denied: '已拒绝',
    expired: '未回答，已跳过',
    secondsLeft: s => `${s}秒`,
    done: (sec, usd) => `${sec}秒完成 · $${usd.toFixed(3)}`,
    cancelled: '已停止',
    failed: '任务未完成',
    errors: {
      no_project: '请先在设置中选择项目文件夹。',
      unconfigured: '现在无法连接模型。',
      budget: '今天的智能体预算已用完。',
      offline: '智能体未运行。',
    },
    sayAsk: { read: '我可以看看项目外的文件吗？', write: '我可以修改这个文件吗？', shell: '我可以运行这条命令吗？', network: '我可以打开这个网页吗？', outbound: '我可以在应用外做这件事吗？' },
    sayFailed: '抱歉，没有成功。',
  },
  'zh-Hant': {
    title: '智慧代理',
    placeholder: '讓我寫程式、改檔案、執行指令或查資料…',
    send: '傳送',
    stop: '停止',
    newTask: '新任務',
    allow: '允許',
    deny: '拒絕',
    working: '工作中…',
    waiting: '等待你的回答',
    offline: '智慧代理未執行',
    empty: '涉及電腦的任務（程式碼、檔案、命令列、網頁）在這裡執行。',
    grade: { read: '讀取', write: '編輯', shell: '指令', network: '網頁', outbound: '外部' },
    ask: { read: '讀取專案以外的內容？', write: '允許這次編輯？', shell: '執行這條指令？', network: '開啟這個網頁？', outbound: '允許這個外部操作？' },
    allowed: '已允許',
    denied: '已拒絕',
    expired: '未回答，已略過',
    secondsLeft: s => `${s}秒`,
    done: (sec, usd) => `${sec}秒完成 · $${usd.toFixed(3)}`,
    cancelled: '已停止',
    failed: '任務未完成',
    errors: {
      no_project: '請先在設定中選擇專案資料夾。',
      unconfigured: '現在無法連線到模型。',
      budget: '今天的智慧代理預算已用完。',
      offline: '智慧代理未執行。',
    },
    sayAsk: { read: '我可以看看專案外的檔案嗎？', write: '我可以修改這個檔案嗎？', shell: '我可以執行這條指令嗎？', network: '我可以開啟這個網頁嗎？', outbound: '我可以在應用程式外做這件事嗎？' },
    sayFailed: '抱歉，沒有成功。',
  },
}

// ---------------------------------------------------------------------------
// Controller: transcript state + character reactions

export type TranscriptItem =
  | { kind: 'user', id: string, text: string }
  | { kind: 'text', id: string, text: string, say: string[], parentId?: string }
  | { kind: 'tool', id: string, name: string, grade: ToolGrade, summary: string, status: 'running' | 'ok' | 'error', output?: string, parentId?: string }
  | { kind: 'permission', id: string, tool: string, grade: ToolGrade, summary: string, title?: string, expiresAt: number, status: 'pending' | 'allowed' | 'denied' | 'expired' }
  | { kind: 'result', id: string, ok: boolean, subtype: string, costUsd: number, durationMs: number }
  | { kind: 'error', id: string, code: string, text: string }

export interface AgentControllerDeps {
  bridge: AgentBridge
  lang: () => Lang
  permission: () => PermissionLevel
  model: () => AgentModel
  /** The project folder chosen in settings (absolute path). */
  projectDir: () => string | undefined
  persona: () => AgentPersona | undefined
  /** Defaults to the bus. A panel window that mirrors the overlay's session passes a no-op. */
  emit?: <K extends keyof BusEvents>(type: K, payload: BusEvents[K]) => void
  /** Session started, attached or closed: lets another window attach to the same one. */
  onSession?: (sessionId: string | null) => void
}

export interface AgentControllerState {
  items: TranscriptItem[]
  sessionId: string | null
  busy: boolean
  connected: boolean
  model: string | null
  cwd: string | null
}

export type AgentController = ReturnType<typeof createAgentController>

/** How a request started with run() ended. */
export type RunOutcome =
  | { ok: true, text: string, say: string, durationMs: number, costUsd: number }
  | { ok: false, code: string, text: string, say?: string }

export function createAgentController(deps: AgentControllerDeps) {
  const emit = deps.emit ?? ((type, payload) => bus.emit(type, payload))
  const state = reactive<AgentControllerState>({ items: [], sessionId: null, busy: false, connected: false, model: null, cwd: null })
  const S = () => RUNTIME_STRINGS[deps.lang()] ?? EN
  let streamAbort: AbortController | null = null
  let endLine = ''
  /** A run() caller waiting for the end of its turn; quiet: it speaks the outcome itself. */
  let waiter: { resolve: (o: RunOutcome) => void, quiet: boolean } | null = null
  let n = 0
  const uid = (p: string) => `${p}${++n}`

  const find = <K extends TranscriptItem['kind']>(kind: K, id: string) =>
    state.items.find((i): i is Extract<TranscriptItem, { kind: K }> => i.kind === kind && i.id === id)

  function setBusy(busy: boolean) {
    if (state.busy === busy) return
    state.busy = busy
    emit('agent:busy', { busy })
    emit('thinking', { on: busy })
    emit('character:node', { node: busy ? 'working' : 'idle' })
  }

  function settle(o: RunOutcome): boolean {
    const w = waiter
    waiter = null
    w?.resolve(o)
    return w?.quiet ?? false
  }

  function fail(code: string, text: string) {
    state.items.push({ kind: 'error', id: uid('e'), code, text })
    setBusy(false)
    if (!settle({ ok: false, code, text })) emit('character:react', { emotion: 'sorry', line: text, source: 'agent' })
  }

  function onEvent(e: AgentEvent) {
    switch (e.type) {
      case 'session': state.model = e.model; state.cwd = e.cwd; break
      case 'status':
        if (e.state === 'running') setBusy(true)
        else setBusy(false)
        if (e.state === 'closed') {
          state.sessionId = null
          deps.onSession?.(null)
          settle({ ok: false, code: 'closed', text: 'The agent session ended before the task finished.' })
        }
        break
      case 'user': state.items.push({ kind: 'user', id: uid('u'), text: e.text }); endLine = ''; break
      case 'text': state.items.push({ kind: 'text', id: uid('t'), text: e.text, say: e.say ?? [], ...(e.parentId ? { parentId: e.parentId } : {}) }); break
      case 'speak':
        if (e.phase === 'start') emit('character:react', { emotion: 'focused', line: e.text, source: 'agent' })
        else endLine = e.text
        break
      case 'tool_start':
        state.items.push({ kind: 'tool', id: e.id, name: e.name, grade: e.grade, summary: e.summary, status: 'running', ...(e.parentId ? { parentId: e.parentId } : {}) })
        break
      case 'tool_end': {
        const t = find('tool', e.id)
        if (t) { t.status = e.ok ? 'ok' : 'error'; if (e.output) t.output = e.output }
        break
      }
      case 'permission':
        state.items.push({ kind: 'permission', id: e.requestId, tool: e.tool, grade: e.grade, summary: e.summary, ...(e.title ? { title: e.title } : {}), expiresAt: e.expiresAt, status: 'pending' })
        emit('thinking', { on: false })
        emit('character:react', { emotion: 'curious', line: S().sayAsk[e.grade], source: 'agent' })
        break
      case 'permission_resolved': {
        const p = find('permission', e.requestId)
        if (p) p.status = e.allow ? 'allowed' : e.reason === 'timeout' ? 'expired' : 'denied'
        if (state.busy) emit('thinking', { on: true })
        break
      }
      case 'result': {
        state.items.push({ kind: 'result', id: uid('r'), ok: e.ok, subtype: e.subtype, costUsd: e.costUsd, durationMs: e.durationMs })
        const cancelled = e.subtype === 'cancelled'
        emit('thinking', { on: false })
        const quiet = settle(e.ok
          ? { ok: true, text: e.text, say: endLine, durationMs: e.durationMs, costUsd: e.costUsd }
          : { ok: false, code: cancelled ? 'cancelled' : e.subtype, text: e.text || (cancelled ? 'The user stopped the task.' : 'The task did not finish.'), say: endLine })
        if (!quiet) {
          emit('character:react', {
            emotion: e.ok ? 'happy' : cancelled ? 'neutral' : 'sorry',
            ...(endLine || (!e.ok && !cancelled) ? { line: endLine || S().sayFailed } : {}),
            source: 'agent',
          })
        }
        endLine = ''
        break
      }
      case 'error': fail(e.code, S().errors[e.code] ?? e.message); break
      default:
    }
  }

  function follow(sessionId: string) {
    streamAbort?.abort()
    const ctl = new AbortController()
    streamAbort = ctl
    void deps.bridge.stream(sessionId, onEvent, { signal: ctl.signal, onConnection: (up) => { state.connected = up } })
      .finally(() => { if (streamAbort === ctl) state.connected = false })
  }

  function errorText(e: unknown): { code: string, text: string } {
    const code = e instanceof AgentRuntimeError ? e.code : 'internal'
    const text = (S().errors as Record<string, string | undefined>)[code] ?? (e as Error).message
    return { code, text }
  }

  /** A spoken or typed request. Starts a session, or continues the open one. */
  async function ask(text: string): Promise<void> {
    const t = text.trim()
    if (!t) return
    setBusy(true)
    try {
      if (state.sessionId) {
        await deps.bridge.settings(state.sessionId, { permission: deps.permission(), model: deps.model() })
        await deps.bridge.send(state.sessionId, t)
        return
      }
      const persona = deps.persona()
      const res = await deps.bridge.start({
        text: t,
        cwd: deps.projectDir(),
        lang: deps.lang(),
        permission: deps.permission(),
        model: deps.model(),
        ...(persona ? { persona } : {}),
      })
      state.sessionId = res.sessionId
      state.model = res.model
      state.cwd = res.cwd
      follow(res.sessionId)
      deps.onSession?.(res.sessionId)
    } catch (e) {
      const { code, text } = errorText(e)
      fail(code, text)
    }
  }

  /**
   * Like ask(), but resolves when the turn ends (result, error or closed session). With
   * quiet, the end line and errors are not spoken: the caller (the browser loop's
   * computer_task) reports the outcome. The start line and permission questions still are.
   */
  function run(text: string, opts: { quiet?: boolean } = {}): Promise<RunOutcome> {
    settle({ ok: false, code: 'superseded', text: 'A newer request replaced this one.' })
    return new Promise((resolve) => {
      waiter = { resolve, quiet: opts.quiet ?? false }
      void ask(text)
    })
  }

  async function answer(requestId: string, allow: boolean): Promise<void> {
    if (!state.sessionId) return
    try { await deps.bridge.answer(state.sessionId, requestId, allow) } catch { /* already resolved */ }
  }

  async function cancel(): Promise<void> {
    if (!state.sessionId) return
    try { await deps.bridge.cancel(state.sessionId) } catch (e) { fail(errorText(e).code, errorText(e).text) }
  }

  /** Closes the session; the next request starts a fresh conversation. */
  async function reset(): Promise<void> {
    const id = state.sessionId
    streamAbort?.abort()
    streamAbort = null
    state.sessionId = null
    state.items = []
    state.model = null
    setBusy(false)
    settle({ ok: false, code: 'cancelled', text: 'The user closed the task.' })
    deps.onSession?.(null)
    if (id) await deps.bridge.close(id).catch(() => {})
  }

  /**
   * Follows a session another window started (the overlay runs voice and the character;
   * a panel window shows the same transcript). Replays its events from the beginning.
   */
  function attach(sessionId: string | null): void {
    if (sessionId === state.sessionId) return
    streamAbort?.abort()
    streamAbort = null
    state.items = []
    state.sessionId = sessionId
    state.busy = false
    if (sessionId) follow(sessionId)
  }

  function dispose(): void {
    streamAbort?.abort()
    streamAbort = null
  }

  return { state, ask, run, answer, cancel, reset, attach, dispose, strings: S }
}
