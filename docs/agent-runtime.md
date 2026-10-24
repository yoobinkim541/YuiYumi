# 로컬 에이전트 런타임

이 문서는 데스크톱 앱에서 캐릭터 뒤에 붙는 범용 에이전트 백엔드(`agent-runtime/`)의 구조, 요청 라우팅 계약, 권한·모델·키 처리, 데스크톱 앱 연동 절차를 설명한다. 계약의 원본은 코드(`agent-runtime/src/protocol.ts`, `agent-runtime/src/tools.ts`, `src/desktop-app/agent-bridge.ts`, `api/anthropic/_proxy.ts`)이며, 이 문서와 코드가 다르면 코드를 따른다.

## 1. 개요

런타임은 Anthropic의 **Claude Agent SDK**(`@anthropic-ai/claude-agent-sdk`, Claude Code 에이전트 루프의 라이브러리판)를 감싼 작은 Node 서버다. 파일 읽기·쓰기·편집, 셸, glob/grep, 웹 검색·가져오기, 서브에이전트를 SDK가 제공하고, 런타임은 세션 관리, 권한 정책, 음성용 요약 추출, 이벤트 스트림만 담당한다. 모델은 Anthropic Claude만 사용한다.

```
데스크톱 앱 (Tauri webview)                     agent-runtime (Node, 127.0.0.1:<port>)          Vercel
+-------------------------------+   HTTP+SSE   +--------------------------------------+
| 음성/채팅 요청                 |  x-yuiyumi-  | server.ts  세션·라우트·CORS·토큰       |
|  └ agent-bridge.ts controller |  agent-token | session.ts query() 스트리밍 입력 모드   |
|     ├ AgentPanel.vue 전사 패널 |------------->|   canUseTool -> tools.ts 권한 정책      |
|     └ bus: agent:busy,        |<-------------|   SDK 메시지 -> AgentEvent             |
|        thinking,              |  SSE 이벤트   | Claude Code 프로세스(SDK 내장 바이너리)  |
|        character:react        |              |   ANTHROPIC_BASE_URL ------------------+--> /api/anthropic/v1/messages
+-------------------------------+              +--------------------------------------+      (설치 토큰 -> 서버 키 교체,
                                                                                               모델 허용 목록, 예산 상한)
```

- 세션 하나는 SDK `query()` 하나다. 입력을 비동기 큐로 넣는 스트리밍 입력 모드로 열어 두므로 후속 요청이 같은 대화로 이어지고, 실행 중인 턴을 `interrupt()`로 멈출 수 있다.
- 세션 ID는 런타임이 만든 UUID를 SDK `sessionId`로 넘긴 값과 같다. 런타임을 다시 띄운 뒤에도 `resume`에 이 ID를 주면 대화를 이어 간다(전사는 상태 폴더의 `claude/` 아래에 저장된다).
- 작업 폴더는 설정에서 고른 프로젝트 폴더다. 지정하지 않으면 작업을 거부하며(`no_project`), 홈 디렉터리 자체나 디스크 루트는 받지 않는다.
- Claude Code 프로세스는 파일 설정을 읽지 않는다(`settingSources: []`). 프로젝트의 `.claude/settings.json`이 도구를 미리 허용하거나 훅을 실행하지 못하게 하기 위해서다. 대신 시스템 프롬프트 부록이 루트의 `CLAUDE.md`·`AGENTS.md`를 먼저 읽으라고 지시한다.
- 프로세스 환경 변수는 상속하지 않고 새로 구성한다(`PATH`, `HOME`, 로캘 등과 모델 설정만). `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`로 에이전트의 셸 명령에서 자격 증명 변수를 지운다. 스모크 테스트에서 셸이 `ANTHROPIC_API_KEY`를 보지 못하는 것을 확인했다.

## 2. 요청 라우팅 계약

| 요청 종류 | 처리 위치 | 비고 |
|---|---|---|
| 메일·캘린더·Slack·Discord·Drive 등 커넥터 업무 | 기존 브라우저 루프(`src/agent/`, `/api/agent`) | 확인 카드, 커넥터 등급, 가상 데스크톱 연출을 그대로 쓴다 |
| 코딩, 파일, 셸 명령, 웹 조사, "내 컴퓨터에서 해 줘" | 데스크톱 앱의 런타임(`agent-bridge.ts` → `agent-runtime`) | 결과는 에이전트 패널과 캐릭터 음성으로 전달한다 |
| 관찰자(Haiku)의 `delegate_task` 제안 | 기존 브라우저 루프 | 화면 기반 제안은 커넥터 업무에 한정한다 |

판단 주체는 브라우저 루프의 작업 모델이다. 브라우저 루프에 `computer_task`(입력: `{ request: string }`) 도구를 하나 추가하고 설명에 위 표의 두 번째 행을 적는다. 도구 처리기는 실행 환경에 따라 다르게 동작한다.

- **데스크톱 앱**: `agentController.ask(request)`를 호출하고 "에이전트 패널에서 작업을 시작했다"는 결과를 돌려준다. 이후 진행·완료 음성은 런타임 이벤트가 맡으므로 브라우저 루프는 짧게 수락만 말한다.
- **웹 데모**: 런타임이 없다. 처리기는 `{ ok: false, error: 'This needs the YuiYumi desktop app, which can work on files and run commands on your computer.' }`를 돌려주고, 브라우저 루프는 이를 받아 사용자 언어로 "그 작업은 데스크톱 앱에서 할 수 있다"고 답한다. 이 경로는 키·프록시를 전혀 쓰지 않는다.

키워드 규칙으로 미리 가르지 않는 이유는 "이 메일 내용을 정리해서 파일로 저장해 줘"처럼 두 영역이 섞인 요청이 흔하기 때문이다. 섞인 요청은 커넥터 쪽에서 내용을 가져온 뒤 `computer_task`에 구체적인 지시로 넘긴다.

## 3. HTTP·이벤트 프로토콜

모든 경로는 `127.0.0.1`에서만 열리며 `/health`를 제외하고 `x-yuiyumi-agent-token` 헤더가 필요하다. `Host`가 `127.0.0.1:<port>`·`localhost:<port>`가 아니거나 허용되지 않은 `Origin`이면 403을 돌려준다(DNS 리바인딩과 다른 웹 페이지의 접근 차단). 허용 Origin은 Tauri 출처(`tauri://localhost`, `http(s)://tauri.localhost`)와 `YUIYUMI_AGENT_ORIGINS`다.

| 메서드·경로 | 본문 | 설명 |
|---|---|---|
| `GET /health` | - | `{ ok, version }` |
| `POST /sessions` | `{ text, cwd?, lang?, persona?: { name, speakingStyle? }, permission?, model?: 'sonnet'\|'opus', resume? }` | 세션 시작 → `{ sessionId, cwd, model }` |
| `GET /sessions/:id/events?after=N` | - | SSE. `id:`가 순번이며 `after`(또는 `Last-Event-ID`) 이후를 버퍼에서 재생한다 |
| `POST /sessions/:id/messages` | `{ text }` | 같은 세션에 후속 요청 |
| `POST /sessions/:id/permissions/:requestId` | `{ allow }` | 권한 요청 응답 |
| `POST /sessions/:id/cancel` | - | 실행 중인 턴 중단(세션은 유지) |
| `POST /sessions/:id/settings` | `{ permission?, model? }` | 다음 도구 호출·모델 호출부터 적용 |
| `DELETE /sessions/:id` | - | 세션 종료(Claude Code 프로세스 종료) |

이벤트(`AgentEvent`)는 `session`, `status`(running/idle/closed), `user`, `text`(전사용, SAY 줄 제거 후 `say` 배열 별도), `speak`(`start`/`end`), `tool_start`(이름·등급·한 줄 요약), `tool_end`(성공 여부·출력 발췌), `permission`, `permission_resolved`(`user`/`timeout`/`cancel`), `notice`, `result`(성공 여부·비용·소요 시간·토큰), `error`다. 한 시간 동안 활동이 없는 세션은 닫는다.

## 4. 권한

SDK는 `permissionMode: 'default'`로 열고, SDK가 사용자 확인이 필요하다고 판단한 호출마다 `canUseTool`이 `tools.ts`의 정책을 적용한다. 확인이 필요하면 `permission` 이벤트를 내보내고 UI 응답을 기다린다. 제한 시간(기본 120초, `YUIYUMI_AGENT_PERMISSION_TIMEOUT_MS`) 안에 답이 없거나 작업이 중단되면 거부한다.

| 등급 | 도구 | manual | auto | bypass |
|---|---|---|---|---|
| read | Read, Glob, Grep, WebSearch, TodoWrite, Agent(서브에이전트) 등 | 허용 | 허용 | 허용 |
| read (프로젝트 폴더 밖) | 위와 같음 | 확인 | 확인 | 허용 |
| write | Write, Edit, NotebookEdit | 확인 | 허용(폴더 밖은 확인) | 허용 |
| network | WebFetch | 확인 | 허용 | 허용 |
| shell | Bash | 확인 | 확인 | 허용 |
| outbound | MCP 도구, 목록에 없는 도구 | 확인 | 확인 | 허용 |

- 서브에이전트 자체는 읽기 등급이지만 서브에이전트가 부르는 도구는 같은 정책을 하나씩 다시 거친다.
- WebFetch는 GET 요청이라 부작용이 없다고 보고 auto에서 허용한다. 외부로 무언가를 보내는 MCP 도구는 outbound로 분류한다.
- 프로젝트 폴더 밖 읽기를 확인하는 것은 "읽기 도구는 묻지 않는다"는 원칙보다 엄격하게 정한 부분이다. 홈 디렉터리의 비밀 파일을 묻지 않고 읽지 않게 하기 위해서다.
- `AskUserQuestion` 도구는 끈다. 질문은 마지막 SAY 줄로 말하고 턴을 끝내도록 지시한다.
- 설정 화면에서 권한 단계를 바꾸면 컨트롤러가 다음 요청 때 `settings`로 반영한다.

## 5. 모델과 키

- 작업 모델은 설정 > 일반의 `settings.agentModel`(`sonnet` 기본, `opus`)을 요청마다 넘기며, 런타임이 `claude-sonnet-5-5`/`claude-opus-5-5`로 바꾼다(`MODEL_AGENT`, `MODEL_AGENT_OPUS`로 덮어쓸 수 있으며 `server/anthropic.ts`와 같다). 서브에이전트도 작업 모델을 쓰고, Claude Code가 제목·요약 같은 내부 호출에 쓰는 작은 모델은 Haiku(`claude-haiku-5-5`, `MODEL_OBSERVER`)로 고정한다. 모든 모델 별칭(sonnet/opus/fable/haiku)을 허용된 ID로 고정해 다른 모델이 호출되지 않게 한다.
- effort 기본값은 `medium`(`YUIYUMI_AGENT_EFFORT`)이고, 세션당 SDK 비용 상한은 5달러(`YUIYUMI_AGENT_MAX_BUDGET_USD`)다.
- **개발**: `YUIYUMI_AGENT_PROXY_URL`이 없고 환경에 `ANTHROPIC_API_KEY`가 있으면 그 키를 Claude Code 프로세스에 직접 넘긴다.
- **배포(데스크톱 앱)**: 키를 앱에 넣지 않는다. `YUIYUMI_AGENT_PROXY_URL=https://<배포 도메인>/api/anthropic`을 주면 런타임이 `POST <proxy>/install`로 설치별 토큰을 받아 상태 폴더의 `install-token`(권한 0600)에 저장하고, 이를 API 키 자리에 넣어 `ANTHROPIC_BASE_URL`과 함께 넘긴다. 프록시가 토큰을 거부하면 저장한 토큰을 지우고 다음 작업에서 새로 받는다.

### 5.1 프록시 (`api/anthropic/[...path].ts`, `_proxy.ts`)

| 항목 | 동작 |
|---|---|
| 경로 | `POST /api/anthropic/v1/messages`, `/v1/messages/count_tokens`만 전달한다. 쿼리는 `beta`만 허용한다. 그 외는 404 |
| 인증 | `x-api-key` 또는 `Authorization: Bearer`의 설치 토큰. `server/seal.ts`로 봉인한 `{ i: <설치 ID> }`이며 90일 동안 유효하다(`AUTH_SECRET` 필요) |
| 토큰 발급 | `POST /api/anthropic/install`. IP당 하루 10개(`AGENT_INSTALLS_PER_IP_DAILY`) |
| 모델 | 작업 모델 두 개와 Haiku만 허용한다(`MODELS.agent('sonnet')`, `MODELS.agent('opus')`, `MODELS.observer()`). `max_tokens`는 64,000(`AGENT_PROXY_MAX_TOKENS`)으로 자른다 |
| 예산 | 설치당 하루 5달러(`BUDGET_INSTALL_DAILY_USD`)와 배포 전체 하루 상한(`BUDGET_DAILY_USD`)을 `server/budget.ts`의 `admitInstall`·`recordInstall`로 적용한다. 스트림의 `message_start`·`message_delta` 사용량(캐시 쓰기 1.25배, 읽기 0.1배 포함)을 응답이 끝날 때 기록한다. 상한에 걸리면 `429`와 `x-should-retry: false`를 돌려 SDK가 재시도하지 않게 한다 |
| 헤더 | 위로는 `anthropic-version`, `anthropic-beta`만, 아래로는 `content-type`, `request-id`, `retry-after`, `x-should-retry`만 전달한다. 쿠키와 클라이언트 인증 헤더는 버린다 |
| 로그 | 키·토큰·본문을 기록하지 않는다. 업스트림 상태 코드와 오류 이름만 남긴다 |

한계: 예산은 함수 인스턴스 메모리에 있는 소프트 상한이라 인스턴스가 여러 개면 합산되지 않는다. 설치 토큰은 사용자 인증 없이 발급되므로 남용을 막는 장치는 IP별 발급 제한과 설치별·전체 예산뿐이다. Vercel 요청 본문 한도(약 4.5MB)를 넘는 아주 긴 대화는 프록시를 통과하지 못한다. `vercel.json`의 `api/**/*.ts` `maxDuration`이 60초라 긴 출력 스트림은 잘릴 수 있으므로 `api/anthropic/**`에는 더 긴 값을 주는 것이 좋다(아래 미해결 항목).

## 6. 음성 우선 동작

SDK의 `claude_code` 시스템 프롬프트 프리셋을 그대로 두고 `append`로 부록(`prompt.ts`)을 붙인다. 부록은 사용자가 음성 캐릭터(페르소나 이름)를 통해 말하고 있다는 점, 작업을 시작할 때와 끝낼 때 `SAY: <한 문장>` 줄을 쓰라는 점, SAY 줄은 TTS로 읽히므로 코드·경로·URL·마크다운 없이 지정 언어로 쓰라는 점, 나머지 자세한 내용은 전사 패널에 쓰라는 점을 지시한다.

런타임은 SAY 줄을 전사 텍스트에서 떼어 `speak` 이벤트로 보낸다. SAY 줄은 그 턴에서 도구를 처음 쓸 때 `start`로, 도구 없이 끝나면 `end`로 내보내므로 한 번에 끝나는 답이 시작 알림으로 잘못 읽히지 않는다. 결과에 SAY 줄이 없으면 결과 첫 문장을 `end`로 쓴다. 컨트롤러는 `start`에서 `character:react { emotion: 'focused', line }`을, 권한 요청에서 `curious`와 현지화된 질문 문장을, 결과에서 `happy`/`sorry`/`neutral`과 `end` 문장을 내보낸다. 실행 중에는 `agent:busy`, `thinking`, `character:node: working`을 켠다.

## 7. 데스크톱 앱 연동 (Track T 또는 메인 세션)

1. **런타임 실행**: Tauri에서 자식 프로세스로 띄운다. 개발 중에는 `pnpm --filter @yuiyumi/agent-runtime start -- --exit-on-stdin-close`를 실행한다. 환경 변수로 `YUIYUMI_AGENT_TOKEN`(Rust가 만든 32바이트 이상 난수), `YUIYUMI_AGENT_STATE_DIR`(앱 데이터 폴더), `YUIYUMI_AGENT_PROJECT_DIR`(설정의 프로젝트 폴더, 없으면 생략), 배포에서는 `YUIYUMI_AGENT_PROXY_URL`, 개발 서버에서는 `YUIYUMI_AGENT_ORIGINS=<개발 서버 origin>`을 넘긴다. stdout 첫 줄 `{"type":"ready","port":N}`에서 포트를 읽고 `{ port, token }`을 webview에 Tauri 명령으로 넘긴다. stdin을 열어 두면 앱이 종료될 때 런타임도 종료된다.
2. **컨트롤러 생성(오버레이 창)**: 음성과 캐릭터가 있는 오버레이에서 만든다.
   ```ts
   const agent = createAgentController({ bridge: new AgentBridge(await invoke('agent_runtime_endpoint')), lang: () => settings.speechLang, permission: () => settings.permission, model: () => settings.agentModel, projectDir: () => settings.agentProjectDir, persona: () => ({ name: persona.activePersona.name, speakingStyle: persona.activePersona.speakingStyle }), onSession: id => broadcastAgentSession(id) })
   ```
   `settings.agentProjectDir`(폴더 선택 설정)은 아직 없으므로 Track G가 설정 화면에 추가해야 한다.
3. **패널 표시**: `<AgentPanel :controller="agent" :lang="settings.lang" />`를 마운트한다. 패널을 별도 창(`#agent`)에 띄우면 그 창에서 `emit: () => {}`로 컨트롤러를 하나 더 만들고, 오버레이가 `onSession`으로 알린 세션 ID를 `agent.attach(id)`로 따라가게 한다. 두 창 모두 같은 SSE를 구독하므로 전사와 캐릭터 반응이 함께 움직인다.
4. **라우팅**: 2절의 `computer_task` 도구를 브라우저 루프(Track V)에 추가하고, 데스크톱 앱에서는 처리기가 `agent.ask(request)`를 부르게 한다.
5. **종료**: 앱 종료 시 자식 프로세스에 SIGTERM을 보낸다(런타임이 열린 세션을 모두 닫는다).

## 8. 개발·테스트

| 명령 | 내용 |
|---|---|
| `pnpm agent:runtime` | 런타임 실행(`tsx src/main.ts`). 로그는 stderr, ready 줄은 stdout |
| `pnpm agent:smoke` | 임시 폴더에서 런타임을 띄우고 실제 키로 `hello.txt` 생성 작업을 실행한다. 권한 요청은 모두 허용하고, 파일 내용과 셸에서 키가 보이지 않는지 확인한다 |
| `pnpm agent:smoke --proxy` | 같은 테스트를 `api/anthropic` 프록시 처리기(127.0.0.1에서 실행)와 설치 토큰으로 수행한다. `--opus`를 더하면 opus로 실행한다 |
| `npx vitest run agent-runtime api/anthropic` | 권한 정책, SSE 파서, SAY 추출, 세션 이벤트 변환(가짜 SDK), 브리지 컨트롤러, 프록시 단위 테스트 |
| `pnpm --filter @yuiyumi/agent-runtime typecheck` | 런타임 타입 검사 |

2026-10-24 스모크 결과(Sonnet 5.5, 2턴: 파일 생성 + 셸 확인): 직접 키 경로 첫 작업 7.9초, 세션 11.4초, SDK 추정 비용 0.053달러. 프록시 경로 첫 작업 5.2초, 세션 9.2초, 0.054달러(입력 캐시 읽기 약 3.5만 토큰, 출력 258토큰). Opus 5.5 프록시 경로 세션 10.6초, 0.109달러. 세 경우 모두 셸에서 키가 보이지 않았다.

## 9. 미해결 항목

- **패키징**: SDK는 플랫폼별 Claude Code 바이너리(darwin-arm64 약 270MB)를 선택 의존성으로 받아 실행한다. 데스크톱 배포에는 Node 런타임, `agent-runtime`과 그 `node_modules`(SDK와 해당 플랫폼 바이너리)를 함께 넣거나 SDK 문서의 `pathToClaudeCodeExecutable` 방식으로 바이너리를 따로 두어야 한다. 앱 크기와 코드 서명·공증 영향을 Track T가 확인해야 한다.
- **라이선스**: Claude Agent SDK와 바이너리는 오픈소스가 아니라 Anthropic 상용 약관(`LICENSE.md`: "© Anthropic PBC. All rights reserved", Legal Agreements 적용)을 따른다. 소유자가 말한 "오픈소스 에이전트 백엔드"와 다르므로 확인이 필요하며, 앱에 바이너리를 넣어 재배포하는 조건도 약관을 확인해야 한다.
- **`vercel.json`**: `api/anthropic/**/*.ts`에 `maxDuration` 300초 정도를 추가하는 것이 좋다. 이 파일은 이 트랙 소유가 아니라서 바꾸지 않았다. catch-all 파일명(`[...path].ts`)이 Next.js가 아닌 Vercel 함수에서 그대로 동작하는지 배포에서 확인해야 하며, 동작하지 않으면 `/api/anthropic/(.*)`를 이 함수로 보내는 rewrite를 추가한다.
- **프로젝트 폴더 설정**: `settings.agentProjectDir`와 폴더 선택 UI(Tauri dialog)가 필요하다.
- **브리지 테스트 타입 검사**: `agent-runtime/test/bridge.test.ts`는 앱 코드(`@/` 별칭)를 불러오므로 런타임 tsconfig에서 제외했다. vitest에서는 실행된다.
