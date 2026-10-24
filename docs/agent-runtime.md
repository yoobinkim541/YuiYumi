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

판단 주체는 브라우저 루프의 작업 모델이다. 브라우저 루프에는 커넥터 외에 호스트 도구 세 개가 있다(`shared/contracts.ts`의 `HOST_TOOLS`, 설명은 `server/prompts/agent.ts`가 실행 환경별로 쓴다). 클라이언트는 매 단계 `host: { kind: 'web' | 'desktop', apps? }`를 보내고, 서버는 그에 맞는 도구 설명과 시스템 프롬프트 줄을 붙인다.

| 도구 | 등급 | 데스크톱 앱 (`src/desktop-app/agent-host.ts`) | 웹 데모 (`src/agent/host-tools.ts`) |
|---|---|---|---|
| `computer_task({ request, project? })` | write, 확인 카드 없음 | 에이전트 패널 창을 열고 `controller.run(request, { quiet: true })`로 런타임에 맡긴 뒤, 턴이 끝나면 요약을 루프에 돌려준다. `project`는 프로젝트 폴더 안의 하위 폴더 이름 한 단계만 받는다 | `runStudioTask`(`src/desktop/studio`, 가상 코딩 스튜디오)를 부른다. 스튜디오가 없으면 "데스크톱 앱이 필요하다"는 오류를 돌려준다 |
| `open_url({ url })` | read | 기본 브라우저(`system.ts` `openUrl`) | 새 탭(`window.open`). 팝업이 막히면 제안 카드를 띄우고 그 클릭으로 연다 |
| `open_app({ name })` | read | 설치된 앱 실행(`openApp`). 설치된 앱 이름(최대 400개, 설명에서 약 3,000자)을 도구 설명에 넣는다 | 가상 데스크톱 앱(mail, calendar, slack, discord, drive, settings, dashboard)을 연다. 그 밖은 데스크톱 앱이 필요하다고 답한다 |

- `computer_task`에 확인 카드를 띄우지 않는 이유: 런타임이 도구 호출마다 4절의 정책으로 다시 묻기 때문에 카드까지 띄우면 두 번 묻게 된다(웹 스튜디오에는 권한 단계를 넘긴다). `open_url`은 http/https만 연다(`webUrl`). 화면 기반 제안(`origin: 'screen'`)에는 서버가 `computer_task`를 주지 않고, 클라이언트도 거부한다.
- 음성: 런타임의 `start` 문장과 권한 질문은 컨트롤러가 그대로 말하고, `quiet` 실행이라 `end` 문장과 오류는 말하지 않는다. 끝맺음은 루프의 마지막 답 하나뿐이라 결과를 두 번 말하지 않는다.
- 관찰자(Haiku)는 "유튜브 열어 줘", "Slack 켜줘", 코딩·파일·명령 요청도 `delegate_task`로 넘긴다. "이 폴더" 같은 표현은 그대로 두고 화면에 보이는 경로를 덧붙이지 않는다(실제로 화면의 저장소 경로를 넣은 사례가 있어 관찰자와 `computer_task` 설명에 모두 적었다).

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

한계: 예산은 함수 인스턴스 메모리에 있는 소프트 상한이라 인스턴스가 여러 개면 합산되지 않는다. 설치 토큰은 사용자 인증 없이 발급되므로 남용을 막는 장치는 IP별 발급 제한과 설치별·전체 예산뿐이다. Vercel 요청 본문 한도(약 4.5MB)를 넘는 아주 긴 대화는 프록시를 통과하지 못한다. `vercel.json`은 `api/anthropic/**/*.ts`에 Hobby 요금제 최대값인 `maxDuration` 300초를 준다(Fluid compute 기준, 나머지 `api/**`는 60초). 300초를 넘는 단일 모델 응답 스트림은 잘린다.

## 6. 음성 우선 동작

SDK의 `claude_code` 시스템 프롬프트 프리셋을 그대로 두고 `append`로 부록(`prompt.ts`)을 붙인다. 부록은 사용자가 음성 캐릭터(페르소나 이름)를 통해 말하고 있다는 점, 작업을 시작할 때와 끝낼 때 `SAY: <한 문장>` 줄을 쓰라는 점, SAY 줄은 TTS로 읽히므로 코드·경로·URL·마크다운 없이 지정 언어로 쓰라는 점, 나머지 자세한 내용은 전사 패널에 쓰라는 점을 지시한다.

런타임은 SAY 줄을 전사 텍스트에서 떼어 `speak` 이벤트로 보낸다. SAY 줄은 그 턴에서 도구를 처음 쓸 때 `start`로, 도구 없이 끝나면 `end`로 내보내므로 한 번에 끝나는 답이 시작 알림으로 잘못 읽히지 않는다. 결과에 SAY 줄이 없으면 결과 첫 문장을 `end`로 쓴다. 컨트롤러는 `start`에서 `character:react { emotion: 'focused', line }`을, 권한 요청에서 `curious`와 현지화된 질문 문장을, 결과에서 `happy`/`sorry`/`neutral`과 `end` 문장을 내보낸다. 실행 중에는 `agent:busy`, `thinking`, `character:node: working`을 켠다.

## 7. 데스크톱 앱 연동

1. **런타임 실행** (`src-tauri/src/runtime.rs`): 앱 시작 때 자식 프로세스로 띄운다. 환경은 비우고(`env_clear`) `PATH`(번들 node, Homebrew 등 도구 폴더 포함), `HOME` 등 기본 변수와 `YUIYUMI_AGENT_TOKEN`(32바이트 난수, 실행마다 새로), `YUIYUMI_AGENT_STATE_DIR`(앱 데이터 폴더 `agent-runtime/`)만 넘긴다. 릴리스는 `YUIYUMI_AGENT_PROXY_URL=<DESKTOP_API_BASE>/api/anthropic`(빌드 시 값, 키 없음)과 `YUIYUMI_AGENT_CLAUDE_PATH`(번들 바이너리), 디버그는 셸의 `ANTHROPIC_API_KEY`와 `YUIYUMI_AGENT_ORIGINS=http://localhost:5181`을 넘긴다. stdout 첫 줄에서 포트를 읽고 `agent_runtime_endpoint` 명령이 `{ port, token }`을 돌려준다. 프로세스가 죽었으면 이 명령이 다시 띄운다. stderr는 `~/Library/Logs/app.yuiyumi.desktop/agent-runtime.log`. 종료 시 stdin을 닫고 SIGTERM, 3초 뒤에도 살아 있으면 SIGKILL.
2. **프로젝트 폴더**: 프로젝트 폴더는 런타임 환경 변수가 아니라 요청마다 `cwd`로 넘긴다. `settings.agentProjectDir`는 설정 > 일반 > 에이전트 프로젝트 폴더에서 Tauri dialog 플러그인으로 고르며 웹에서는 숨긴다. 비어 있으면 `computer_task`가 런타임을 부르지 않고 설정을 안내하는 오류를 돌려준다.
3. **컨트롤러**: 오버레이가 `createDesktopAgent`(`agent-host.ts`)로 컨트롤러를 만들고 `setHostTools`로 루프에 연결한다. 세션 ID는 오버레이의 런타임 방송(`sync.ts`의 `agentSession`)으로 퍼진다.
4. **에이전트 패널 창** (`desktop.html#agent`, 440×640, 오버레이 옆): `computer_task`가 시작할 때와 트레이의 "에이전트…" 메뉴로 연다. 창 안의 컨트롤러는 `emit: () => {}`로 만들고 방송된 세션에 `attach`한다. 패널 입력창의 요청은 `sendCommand({ agentAsk })`로 오버레이 컨트롤러에 보내 캐릭터가 말하게 한다.

### 7.1 패키징 (`pnpm desktop:build`)

`src-tauri/scripts/agent-bundle.mjs`가 `src-tauri/target/agent-bundle/`(git 제외)에 다음을 만들고, `build.mjs`가 `bundle.resources`로 `YuiYumi.app/Contents/Resources/agent-runtime/`에 넣는다. 각 바이너리는 원래 서명(Anthropic, Node.js)을 유지한다.

| 파일 | 내용 | 크기 |
|---|---|---|
| `main.mjs` | `agent-runtime`을 esbuild로 묶은 ES 모듈(SDK, zod 포함) | 2.1MB |
| `claude` | SDK 플랫폼 패키지의 Claude Code 바이너리(darwin-arm64) | 274MB |
| `node` | 공식 Node.js 바이너리(기본 v24.22.1 LTS, `NODE_VERSION`로 변경). nodejs.org에서 받아 SHA-256을 확인하고 `~/.cache/yuiyumi/node`에 캐시한다. Homebrew node는 공유 라이브러리에 링크돼 있어 복사할 수 없다 | 123MB |

합계 약 380MB가 앱에 더해진다. `YUIYUMI_AGENT_BUNDLE=0`이면 런타임 없이 빌드하며, 그때 `computer_task`는 "코딩 에이전트가 이 빌드에 없다"는 오류를 돌려주고 캐릭터가 그렇게 말한다. 디버그 빌드(`desktop:dev`)는 번들 대신 저장소의 `agent-runtime/node_modules/.bin/tsx src/main.ts`와 시스템 node를 쓴다.

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

- **패키징**: 7.1절대로 node와 SDK 바이너리를 번들에 넣는다. Developer ID 서명·공증 시 Resources 안 실행 파일의 처리(재서명 여부, hardened runtime 엔타이틀먼트)를 확인해야 한다. Intel Mac은 `darwin-x64` 패키지와 x64 node로 따로 빌드해야 한다.
- **라이선스**: Claude Agent SDK와 바이너리는 오픈소스가 아니라 Anthropic 상용 약관(`LICENSE.md`: "© Anthropic PBC. All rights reserved", Legal Agreements 적용)을 따른다. 소유자가 말한 "오픈소스 에이전트 백엔드"와 다르므로 확인이 필요하며, 앱에 바이너리를 넣어 재배포하는 조건도 약관을 확인해야 한다.
- **`vercel.json` 라우팅**: 배포에서 `POST /api/anthropic/install`은 200이었지만 `POST /api/anthropic/v1/messages`는 Vercel `NOT_FOUND`였다(2026-10-24). Next.js가 아닌 함수에서 `[...path].ts`가 한 단계 경로만 받는 것으로 보여 `/api/anthropic/(.*)`를 `/api/anthropic/proxy`로 보내는 rewrite를 추가했다. 처리기는 `request.url`의 원래 경로로 분기하므로, 재배포 후 `v1/messages`가 404가 아니라 401(토큰 없음)을 돌려주는지 확인해야 한다.
- **브리지 테스트 타입 검사**: `agent-runtime/test/bridge.test.ts`는 앱 코드(`@/` 별칭)를 불러오므로 런타임 tsconfig에서 제외했다. vitest에서는 실행된다.
