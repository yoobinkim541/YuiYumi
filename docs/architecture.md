# YuiYumi 웹앱 아키텍처

이 문서는 해커톤 제출용 웹앱(spec v0.5)의 구조를 설명한다. 제품 결정과 합격 기준은 `docs/spec.md`, 음성 경계는 `docs/voice.md`, 커넥터 연산은 `docs/connectors.md`, 실계정 연동 설정은 `docs/integrations-setup.md`, macOS 데스크톱 앱은 `docs/desktop-app.md`, 로컬 에이전트 런타임은 `docs/agent-runtime.md`를 기준으로 한다. 계약의 원본은 코드(`shared/contracts.ts`, `shared/languages.ts`, `src/core/types.ts`, `src/core/bus.ts`)이며, 이 문서와 코드가 다르면 코드를 따른다.

## 1. 개요

앱은 **Vue 3 + Vite** 단일 페이지 앱(SPA)과 Vercel `api/` 디렉터리의 Web 표준 함수(`Request` → `Response`)로 구성된다. 웹 데모는 페이지 안에 그린 **가상 데스크톱**(1920×1080 논리 캔버스, Mail·Calendar·Slack·Discord·Drive 창) 위에서 진행한다. 브라우저는 3초마다 가상 데스크톱 요소를 캡처해 Haiku에 보내고, Haiku의 판단에 따라 캐릭터가 반응하거나 작업 모델(기본 Sonnet, 설정에서 Opus 선택 가능)이 커넥터 도구로 업무를 수행한다. 같은 프런트엔드를 Tauri로 감싼 **macOS 데스크톱 앱**은 실제 화면을 캡처하며, 데스크톱 앱에는 파일·셸 작업을 맡는 **로컬 에이전트 런타임**이 붙는다(9절).

```
브라우저 (Vue SPA)                                                Vercel api/ (상태 없음, 키 보관)
+------------------------------------------------+
| VirtualDesktop (1920x1080 논리 캔버스)           |
|   Mail / Calendar / Slack / Discord / Drive    |<--- demo store (Pinia, data/demo/*)
|   활동 신호: 활성 창, 창 제목, 타이핑             |
+-----------------------+------------------------+
                        | 3초마다 JPEG 캡처 (캐릭터·말풍선·카드 레이어 제외)
                        v
                  ScreenSource --> Nunchi (스케줄러·모드·체류·게이트) --> POST /api/observe --> Haiku
                                        |                       (react / delegate_task / move_self)
        react ----------> CharacterDirector --> CharacterRuntime + 말풍선 + TTS (+ character:look 시선)
        delegate_task --> AgentLoop (브라우저 조율) --> POST /api/agent --> Sonnet 또는 Opus (커넥터 도구)
                              | tool_use 실행: 연결된 서비스는 live --> /api/connectors/[service] (사용자 계정)
                              |                연결하지 않은 서비스는 mock 커넥터(demo store)
                              | 권한 단계상 확인 대상 도구 --> ConfirmCard (수락 시에만 실행)

Voice: Mic --> PTT(기본) | VAD(선택) --> 16 kHz WAV --> POST /api/stt --> Deepgram --> Transcript --> Nunchi
       내장 대사 클립(public/voice) | SpeechRequest --> POST /api/tts --> ElevenLabs --> Player --> LipSync --> ParamMouthOpenY
```

### 설계 원칙

- **서버는 상태를 갖지 않는다.** 서버의 역할은 API 키 보관, 제공자 API 호출, 인스턴스 메모리 기준 예산 가드로 한정한다. 사용자별 OAuth 토큰도 서버에 저장하지 않고 봉인된 httpOnly 쿠키(데스크톱 앱은 Bearer 헤더)로 요청마다 받는다.
- **업무 상태는 브라우저가 갖는다.** 에이전트 도구 루프, 확인 카드, 목업 데이터는 브라우저에 있다. 따라서 가상 데스크톱이 그리는 데이터와 Sonnet이 도구로 읽는 데이터가 같은 store에서 나온다.
- **경계에는 제공자 중립 타입만 오간다.** Anthropic, Deepgram, ElevenLabs의 SDK 타입은 브라우저 코드에 노출하지 않는다. 예외적으로 `/api/agent`의 메시지 배열은 Anthropic 메시지 형식을 그대로 전달하며, 그 내용은 서버에서 허용 도구 목록으로 제한한다.
- **모듈 간 통신은 이벤트 버스로 한다.** 각 모듈(트랙)은 `src/core/bus.ts`의 타입이 지정된 이벤트로만 서로를 호출한다.

## 2. 모듈 경계

### 2.1 Host / ScreenSource

데모와 프로덕션의 교체 지점이다. 상위 모듈은 아래 인터페이스만 사용한다(`src/core/types.ts`).

```ts
interface ScreenSource {
  capture(): Promise<Frame>       // Frame = { jpegBase64, width, height, hash }
  activity(): ActivitySnapshot    // { activeApp, windowTitle, typing }
}
```

- **데모 구현(`VirtualDesktopSource`)**: 1920×1080 고정 논리 크기의 가상 데스크톱 요소를 `modern-screenshot`으로 JPEG 캡처한다. 캐릭터, 말풍선, 확인 카드는 이 요소 밖의 레이어에 있으므로 캡처되지 않으며, Haiku가 캐릭터 자신을 관찰하는 문제가 발생하지 않는다. 가상 데스크톱이 직접 창을 관리하므로 활성 창과 창 제목, 타이핑 여부(마지막 키 입력 후 1.5초 이내)를 정확히 알 수 있다.
- **데스크톱 구현(`TauriScreenSource`)**: macOS 데스크톱 앱에서 ScreenCaptureKit 네이티브 캡처(자기 앱 창 제외), 최전면 앱과 창 제목, 타이핑 여부, 화면 변화 영역을 제공한다. 인터페이스가 같으므로 상위 모듈은 수정하지 않는다(`docs/desktop-app.md`).
- `getDisplayMedia` 기반 화면 공유 어댑터와 공유 동의 흐름은 두지 않는다.

### 2.2 Nunchi (눈치 엔진)

결정적 로직이며 순수 함수와 작은 상태로 구성한다.

- **스케줄러**: 3초마다 `capture()` 후 `/api/observe`를 호출한다. 도구 호출로 끝나는 응답은 3초보다 오래 걸리는 경우가 많으므로, 진행 중인 호출은 15초(`POLL_STALE_MS`)가 지나기 전에는 취소하지 않고 그 틱을 건너뛴다. 에이전트가 작업 중이거나 게이트가 막고 있는 동안에도 호출하지 않는다. 사용자 발화가 들어오면 진행 중인 화면 호출을 취소한다. 모드가 `quiet` 또는 `ornamental`이거나 페이지가 보이지 않으면 캡처와 호출을 모두 멈춘다.
- **모드**: `active`, `quiet`, `ornamental` 세 가지다(`src/stores/settings.ts`). `quiet`·`ornamental`에서 push-to-talk 발화의 STT 결과가 한 글자 이상이면 `active`로 전환하고, 결과가 비면 모드를 유지한다.
- **체류**: 직전 프레임과의 해시 비교로 같은 화면의 유지 시간을 세어 `ObserveState.dwellSec`로 Haiku에 전달한다. 게이트 조건으로는 쓰지 않는다.
- **게이트(`src/nunchi/gate.ts`)**: 먼저 말을 거는 경우에만 적용한다. 하루 횟수 상한, 긴 쿨다운, 체류 요건은 없으며, 말할 만한 순간인지는 Haiku가 판단한다. 게이트는 사용자가 말하는 중(`speaking`), 캐릭터의 TTS가 재생 중(`talking`), 에이전트가 작업 중(`busy`)이면 막고, 캐릭터가 마지막으로 말한 대사(출처 무관)가 끝난 뒤 20초(`PROACTIVE_GAP_MS`)가 지나지 않았으면(`gap`) 막는다. 응답이 도착한 시점에 같은 조건을 다시 확인하고, 막히면 결과를 버린다. 사용자가 직접 말한 요청은 게이트를 거치지 않는다.
- **시선(glance)**: 먼저 말을 걸 때 캐릭터는 사용자가 작업 중인 위치(`lookTarget`, 논리 1920×1080 좌표)를 4초 동안 바라본다(`character:look`). 발화에 대사로 답할 때는 최근 입력이나 화면 변화로 얻은 위치가 있을 때만 그쪽을 본다. 커서를 계속 따라가지는 않는다.

### 2.3 Agent

- **관찰자(`/api/observe`, Haiku)**: 화면 프레임, 상태, 선택적 발화, 언어, 최근 대화, 캐릭터 카드를 받아 `react`, `delegate_task`, `move_self` 도구 호출을 반환한다. `tool_choice`는 `auto`이며, 도구 대신 일반 텍스트가 오면 버린다. `move_self`(캐릭터 창 이동)는 사용자 발화에 대한 응답일 때만 따른다. 비전 모델은 작업 모델 설정과 무관하게 항상 Haiku다.
- **실행자(`/api/agent`)**: 작업 모델은 Settings > General에서 고르며 기본은 Sonnet, 선택지는 Opus다(`AGENT_MODELS`). 한 번의 호출이 한 스텝이다. 브라우저의 `AgentLoop`가 응답의 `tool_use`를 실행하고 `tool_result`를 붙여 다시 호출한다. 서버는 `CONNECTOR_OPS`에 정의된 허용 도구만 모델에 전달한다.
- **위임 출처 판정(브라우저 코드)**: `delegate_task`의 출처가 사용자 발화(`utterance`)이면 바로 실행하고, 화면(`screen`)이면 제안 카드로 제안한 뒤 사용자가 수락할 때만 실행한다. 실행 중의 각 도구 호출은 등급과 권한 단계(`requiresConfirmation`)에 따라 확인 카드를 거친다(2.4).
- **캐릭터 카드**: 사용자가 편집한 이름·성격·말투(`Persona`)는 관찰자와 실행자 시스템 프롬프트의 고정 규칙 뒤에 붙는다(`server/prompts/persona.ts`). 카드는 말투와 정체성만 바꾸며, 도구와 확인 흐름을 통해서만 행동한다는 규칙, 도구 결과가 확인해 주지 않은 행동을 했다고 말하지 않는다는 규칙, 외부 내용을 신뢰하지 않는다는 규칙 등을 덮어쓸 수 없다.

### 2.4 Connectors

- 모든 서비스의 연산을 하나의 레지스트리(`CONNECTOR_OPS`, `shared/contracts.ts`)로 정의하고 작업 모델의 도구로 그대로 노출한다. 각 연산은 `name`, `service`, `grade`(`read` | `write` | `outbound`), `description`, `input`(zod 스키마)을 갖는다.
- **mock 커넥터**: 가상 데스크톱이 렌더링하는 세션 데이터(demo store)를 직접 읽고 쓴다. 초안 저장 결과는 가상 데스크톱 창에 즉시 반영된다.
- **live 커넥터**: 각 사용자가 Settings > Connectors에서 자기 Google(Gmail·Calendar), Slack, Discord 계정을 OAuth로 연결한다(`server/auth.ts`, `api/auth/<provider>/[service].ts`). 연결된 서비스의 연산은 `/api/connectors/[service]`가 그 사용자의 실제 계정에서 실행하고, 결과는 demo store에 반영되어 가상 앱에도 보인다(`src/connectors/live.ts`). 연결하지 않았거나 불러오기에 실패한 서비스는 mock 커넥터로 동작한다. 발송·게시는 세션당·계정당 하루 상한(`OUTBOUND_SESSION_CAP`, `OUTBOUND_ACCOUNT_DAILY_CAP`)을 둔다. 설정 절차는 `docs/integrations-setup.md`.
- 연산은 `read`·`write`·`outbound` 등급으로 나뉘고, 확인 카드 여부는 설정의 권한 단계(`manual`·`auto`·`bypass`)가 정한다(AC-4). `manual`(기본값)은 `write`와 `outbound`, `auto`는 `outbound`만 확인하며, `bypass`는 확인하지 않는다. 상세 목록은 `docs/connectors.md`.

### 2.5 Voice

브라우저는 오디오 장치, VAD, push-to-talk, 인코딩, 재생, 립싱크, 끼어들기(barge-in)를 담당하고, 서버는 키와 제공자 API(Deepgram STT, ElevenLabs TTS)를 담당한다. 경계를 넘는 타입은 `Transcript`와 `SpeechRequest`뿐이다. 입력 기본값은 push-to-talk이며 VAD는 설정에서 켠다. 음성 언어는 표시 언어와 별도로 고를 수 있다(`speechLang`). 접수·완료·확인·인사·쓰다듬기 반응 같은 짧은 대사는 미리 생성한 **내장 대사 클립**(`src/voice/builtin-lines.ts`, `public/voice/`)으로 즉시 재생한다. 단계별 배치는 `docs/voice.md`의 경계 표를 따른다.

### 2.6 Character

```ts
interface CharacterRuntime {
  mount(container: HTMLElement): Promise<void>
  setEmotion(emotion: Emotion): void
  playMotion(name: string): void
  setNode(node: CharacterNode): void
  setMouth(pose: MouthPose | null): void
  destroy(): void
}
```

- **코어**: 목표는 Ayagami(Rust, MIT OR Apache-2.0)이다. 오늘 일정에서는 공식 Live2D Cubism Core를 폴백으로 허용한다. Cubism Core는 저장소에 포함하지 않고 빌드 시점에 배치한다.
- **렌더러**: 공개 패키지 `FMsongX2/cubism-web-batched-renderer`를 `pixi-live2d-display` 0.4와 PixiJS 6 위에서 사용한다.
- **Live2D 연동 코드**: AIRI(MIT)의 `stage-ui-live2d`를 기반으로 한 코드와 자체 구현으로 구성한다. AIRI에서 가져온 부분은 MIT 고지를 유지한다.
- **CharacterDirector**: 앱 이벤트를 애니메이션 그래프 상태(`idle`, `listening`, `working`, `waiting`, `speaking`, `attention`, `praised`, `failed`, 그리고 `sleeping`)로 바꾼다. 범용 엣지 조건 엔진 대신 이벤트 → 상태 표로 구현한다.
- **감정 → 표정**: 감정 7종(`neutral`, `happy`, `thinking`, `surprised`, `sorry`, `focused`, `curious`)은 모델 프로필(`profile.json`)의 매핑을 통해 표정과 모션으로 연결한다. 입을 가리는 표정은 말하는 동안 립싱크를 우선한다.
- **에셋**: 모델·모션 파일은 저장소에 커밋하지 않는다. 빌드 스크립트가 로컬 모델 디렉터리에서 웹에 필요한 파일만 `public/models/`로 복사하고 텍스처를 웹용으로 축소하며 프로필을 생성한다.

## 3. 이벤트 버스

`src/core/bus.ts`의 `BusEvents`가 모듈 간 계약이다. 처리기에서 발생한 예외는 버스가 잡아 기록하며 다른 처리기의 실행을 막지 않는다.

| 이벤트 | 페이로드 | 발행 | 구독 |
|---|---|---|---|
| `character:react` | `{ emotion, line?, motion?, source: 'observer' \| 'agent' \| 'fallback' }` | Nunchi, Agent, 폴백 | Character, 말풍선, TTS |
| `character:node` | `{ node: CharacterNode }` | Voice, Agent | CharacterDirector |
| `character:mouth` | `MouthPose \| null` | LipSync | CharacterRuntime |
| `character:look` | `{ x, y, holdMs? }` (논리 1920×1080 좌표) | Nunchi | Character(눈·머리·몸 시선) |
| `character:touch` | `{ kind: 'pet', holding, petting } \| { kind: 'poke' }` | Character | Voice(내장 대사) |
| `thinking` | `{ on }` | 채팅 입력, Nunchi | 말풍선(입력 중 점 표시), Voice(대기 추임새) |
| `bubble` | `{ text, ttlMs? } \| null` | Agent, Character | 말풍선 UI |
| `voice:speech-start` | `{ source: 'vad' \| 'ptt' }` | Voice | Nunchi(발화 중 침묵), barge-in |
| `voice:speech-end` | `{ source: 'vad' \| 'ptt' }` | Voice | Nunchi |
| `voice:transcript` | `Transcript & { source: 'vad' \| 'ptt' \| 'chat' }` | Voice, 채팅 입력 | Nunchi(발화 입력, 모드 해제 판정) |
| `tts:start` | `{ text }` | Voice | Character(`speaking`), Nunchi(게이트) |
| `tts:end` | `{ interrupted }` | Voice | Character, Nunchi(게이트 간격 시작) |
| `agent:delegate` | `{ request, origin: 'utterance' \| 'screen', summary? }` | Nunchi | Agent(즉시 실행 또는 제안 카드) |
| `agent:busy` | `{ busy }` | Agent | Character(`working`), Nunchi(게이트), UI |
| `assistant:move` | `{ where: 'left' \| 'right' \| 'center' \| 'corner' }` | Nunchi(발화 응답만) | 캐릭터 창 이동 |
| `nunchi:interjected` | `{ at }` | Nunchi | 대시보드 집계 |

## 4. API 엔드포인트와 계약

모든 엔드포인트는 Vercel `api/` 디렉터리의 Web 표준 함수이며, 요청 본문은 `shared/contracts.ts`의 zod 스키마로 검증한다. 오류 응답은 `ApiError { error, code? }`이며, `code`가 `budget`이면 브라우저는 준비된 대사로 폴백한다(AC-8).

| 엔드포인트 | 요청 | 응답 | 제공자 |
|---|---|---|---|
| `POST /api/observe` | `ObserveRequest { frame, state, utterance?, lang, recent, sessionId, persona? }` | `ObserveResponse { actions: (react \| delegate_task \| move_self)[] }` | Anthropic (Haiku, `MODEL_OBSERVER`) |
| `POST /api/agent` | `AgentStepRequest { lang, origin, messages, sessionId, persona?, model? }` | `AgentStepResponse { content, stopReason }` | Anthropic (Sonnet `MODEL_AGENT`, Opus `MODEL_AGENT_OPUS`) |
| `POST /api/stt?lang=<Lang>` | 16 kHz mono WAV 본문 | `Transcript { text, confidence, lang }` | Deepgram nova-3 (pre-recorded) |
| `POST /api/tts` | `SpeechRequest { text, lang, emotion?, character?, preset?, sessionId }` | `audio/mpeg` 본문 | ElevenLabs |
| `POST /api/connectors/[service]` | `LiveConnectorRequest { op, input, sessionId }` | `LiveConnectorResponse { result, patch? }` | 사용자가 연결한 Google, Slack, Discord 계정 |
| `GET /api/auth/status`, `/api/auth/<provider>/start·callback·logout` | 쿠키 또는 Bearer | `AuthStatus`(연결 여부, 계정 이름, 서비스, 발송 상한) / 리디렉션 | Google, Slack, Discord OAuth |
| `GET /api/model-key` | 없음 | `{ key }`(암호화 모델 팩 복호화 키) | 없음 |
| `/api/anthropic/*` | Anthropic Messages 형식 | 그대로 전달 | 로컬 에이전트 런타임용 프록시(`docs/agent-runtime.md`) |

- `ObserveState`는 `activeApp`, `windowTitle`, `dwellSec`, `secondsSinceLastLine`(캐릭터가 마지막으로 대사를 한 뒤 지난 초, 아직 없으면 `null`), `typing`, `userSpeaking`으로 구성한다.
- 언어는 `shared/languages.ts`의 단일 표(`en`, `ja`, `ko`, `zh-Hans`, `zh-Hant`)에서 UI 언어, Deepgram `language` 값, ElevenLabs 보이스 환경변수를 함께 결정한다.
- 서버 환경변수는 `.env.example`에 목록이 있다. 키 값은 Vercel 환경변수와 커밋되지 않는 로컬 `.env.local`에만 둔다.

## 5. 디렉터리 구조

저장소 루트가 Vite 앱이며 단일 패키지로 구성한다.

```
src/
  core/        bus.ts(이벤트 버스), types.ts(ScreenSource, CharacterRuntime 등 모듈 경계)
  host/        ScreenSource 구현: 가상 데스크톱(modern-screenshot), Tauri(네이티브 캡처), 변화 영역
  desktop/     VirtualDesktop.vue, 창 프레임, apps/(Mail, Calendar, Slack, Discord, Drive), 메뉴 막대 트레이, 시나리오, 활동 신호
  desktop-app/ macOS 데스크톱 앱 진입점(오버레이, 설정·대시보드 창, 키체인 연동, 에이전트 런타임 브리지)
  nunchi/      스케줄러, 모드, 체류, 게이트, 폴백 대사
  agent/       에이전트 루프, 확인 대기열, 확인 카드 미리보기
  connectors/  레지스트리, mock/(demo store 기반), live 상태·클라이언트, 연결 제안 카드
  voice/       마이크, VAD, PTT, STT·TTS 클라이언트, 내장 대사, 재생, 립싱크, 끼어들기
  character/   CharacterRuntime 구현, CharacterDirector, Live2D 연동, CharacterLayer.vue, ControlPill
  settings/    설정(카드·일반·음성·권한·커넥터·정보)과 대시보드 창
  stores/      settings(표시·음성 언어, 소리, 모드, PTT 단축키, 권한, 작업 모델, 이름), persona, demo
  ui/          ConfirmCard, 말풍선, WelcomeName(첫 방문 환영)
  i18n/        en, ja, ko, zh-Hans, zh-Hant
shared/        contracts.ts(zod 계약, CONNECTOR_OPS), languages.ts(언어 단일 표)
api/           observe, agent, stt, tts, connectors/[service], auth/<provider>, model-key, anthropic/(런타임 프록시)
server/        제공자 호출(anthropic, deepgram, elevenlabs, gmail, gcal, slack, discord), auth.ts, seal.ts, budget.ts, http.ts, prompts/
src-tauri/     데스크톱 앱 Rust 셸(Tauri v2)
agent-runtime/ 로컬 에이전트 런타임(Claude Agent SDK, Node)
scripts/       웹용 모델 빌드, Cubism Core 배치, 내장 음성 생성
data/demo/<lang>/  언어별(en·ja·ko·zh-Hans·zh-Hant) 메일·일정·Slack·Discord·Drive·시나리오 가공 데이터 (같은 id, 같은 줄거리)
templates/     외부 스타터와 AIRI 발췌본(참고용, 빌드 제외)
docs/          spec, architecture, voice, connectors, demo-account 등
```

`templates/`는 TypeScript 설정과 빌드에서 제외한다. `public/vendor/`(Cubism Core)와 `public/models/`(모델 에셋)는 `.gitignore`에 포함되어 있으며 빌드 시점에 채운다.

## 6. 데이터 흐름

### 6.1 먼저 말 걸기 (화면 관찰)

1. Nunchi 스케줄러가 3초마다 깨어난다. 에이전트가 작업 중이거나, 게이트가 막고 있거나(사용자 발화, TTS 재생, 20초 간격), 진행 중인 호출이 15초 미만이면 이번 틱을 건너뛴다.
2. `ScreenSource.capture()`와 `activity()`를 호출하고 체류 시간을 갱신한 뒤 `ObserveRequest`를 구성해 `POST /api/observe`로 보낸다.
3. 서버는 예산 가드를 통과하면 Haiku를 호출하고, 도구 호출만 `actions`로 변환해 반환한다. 프레임은 저장하지 않고 요청 처리 후 폐기한다.
4. 브라우저는 응답 시점의 상태로 게이트를 다시 적용한다. 조건을 만족하지 않으면 결과를 버린다.
5. 캐릭터가 사용자의 작업 위치를 바라보고(`character:look`), `react`이면 `character:react`를 발행한다. 캐릭터는 표정·모션을 적용하고 말풍선을 표시하며, 소리가 켜져 있으면 TTS를 재생한다. 표시한 경우 `nunchi:interjected`를 발행해 대시보드 집계에 반영한다. 화면 출처의 `move_self`는 따르지 않는다.
6. `delegate_task`이면 `agent:delegate { origin: 'screen', summary }`를 발행한다. Agent는 작업 모델을 호출하지 않고 제안 카드로 제안하며, 사용자가 수락할 때만 6.3의 루프를 시작한다. 작업 중이거나 이미 열린 제안이 있으면 새 제안은 버린다.

### 6.2 음성 요청

1. 사용자가 push-to-talk 단축키(기본 Space, Settings > Voice에서 변경) 또는 버튼으로 녹음을 시작한다(VAD를 켠 경우 Silero가 발화 구간을 판정한다). `voice:speech-start`가 발행되고 Nunchi는 먼저 말 걸기를 멈춘다. 채팅 입력으로 보낸 문장도 같은 `voice:transcript` 경로로 처리한다.
2. 녹음이 끝나면 브라우저가 16 kHz mono WAV로 인코딩해 음성 언어(`speechLang`)로 `POST /api/stt?lang=<Lang>`에 보낸다.
3. 서버가 Deepgram nova-3 pre-recorded API를 호출해 `Transcript`를 반환하고, 브라우저는 `voice:transcript`를 발행한다.
4. Nunchi는 `quiet`·`ornamental` 모드라면 해제 여부를 판정하고, 발화를 `utterance`로 포함해 즉시 `/api/observe`를 호출한다. 이 응답은 게이트를 거치지 않는다. 관찰자 호출이 실패하면 내장 `offline` 대사로 답한다(30초에 한 번).
5. 잡담이면 Haiku가 `react`로 응답하며 작업 모델은 호출하지 않는다(AC-11). 업무 요청이면 `agent:delegate { origin: 'utterance' }`가 발행되고, 내장 `ack` 대사로 바로 접수를 알린 뒤 Agent가 루프를 시작한다. 열려 있던 화면 출처 제안은 닫힌다.
6. 응답 대사가 내장 대사와 같으면 미리 생성한 클립을 재생하고, 아니면 `SpeechRequest`로 `POST /api/tts`에 보낸다. 반환된 오디오를 재생하며 립싱크로 `ParamMouthOpenY`를 구동한다. 재생 중 사용자가 말하면 재생을 멈춘다(barge-in).

### 6.3 도구 실행과 확인 카드

1. `AgentLoop`가 `POST /api/agent`를 호출한다. 서버는 `CONNECTOR_OPS`를 도구 정의로 변환해 선택된 작업 모델(Sonnet 또는 Opus)에 전달한다.
2. 응답의 각 `tool_use`에 대해 브라우저는 `requiresConfirmation(grade, permission)`으로 확인 여부를 정한다. `read`는 확인하지 않는다. `manual`(기본값)은 `write`와 `outbound`를, `auto`는 `outbound`만 확인 카드에 올리며, `bypass`는 확인하지 않는다.
3. 확인 카드에는 검증된 입력값(받는 사람, 제목, 본문, 채널, 일시 등)을 그대로 보여 주므로 사용자는 실행될 내용 그대로를 승인한다. 발송·게시 카드는 `confirmSend`, 그 외 쓰기 카드는 `confirm` 내장 대사와 함께 뜬다.
4. 확인이 필요 없거나 사용자가 수락하면 커넥터를 실행한다. 연결된 서비스는 사용자의 실제 계정에서, 그 외는 demo store에서 실행되며, 결과는 가상 데스크톱의 메일함, 캘린더, Slack·Discord 창에 반영된다(AC-4).
5. 사용자가 거절하면 아무것도 실행하지 않고, 거절 사실을 `tool_result`로 모델에 알린다. 모델은 다시 시도하지 않고 아무것도 하지 않았다고 답한다(AC-5).
6. `stopReason`이 도구 사용이 아니면 루프를 종료하고 결과를 말풍선과 TTS로 전달한다.

## 7. 보안 규칙

- **키는 서버에만 둔다.** Anthropic, Deepgram, ElevenLabs 키와 OAuth client secret, Discord 봇 토큰은 Vercel 환경변수에만 둔다. 브라우저 번들에는 키가 포함되지 않으며, 모든 제공자 호출은 `api/`를 경유한다(AC-10). 빌드 산출물에서 키 문자열을 검색해 검증한다.
- **사용자 토큰은 봉인해 사용자에게 둔다.** 각 사용자의 OAuth 토큰은 `AUTH_SECRET`에서 유도한 키로 봉인해 제공자별 httpOnly 쿠키에 담고, 데스크톱 앱은 같은 봉인 값을 키체인에 두고 Bearer 헤더로 보낸다. 브라우저 JavaScript는 토큰을 읽을 수 없고 `/api/auth/status`는 연결 여부와 계정 이름만 돌려준다.
- **외부 내용은 신뢰할 수 없는 입력이다.** 화면 텍스트, 메일·문서·메시지 본문, 도구 결과, `delegate_task`의 `request`에 포함된 지시문은 따르지 않는다. 이 규칙을 시스템 프롬프트에 명시하고, 화면 출처 위임은 제안 카드를 거치게 해 화면 속 지시문이 곧바로 실행으로 이어지는 경로를 차단한다.
- **발송·게시·삭제는 사용자 요청과 권한 단계를 따른다.** 프롬프트는 발송·답장·게시·휴지통 이동·삭제를 사용자가 이 대화에서 직접 요청한 경우에만 하게 하고, 화면 출처 제안에는 포함하지 않게 한다. 실행은 도구와 확인 흐름을 통해서만 일어나며, 도구 결과가 확인해 주지 않은 행동을 했다고 말하지 않는다. `write`와 `outbound`의 확인 여부는 권한 단계가 정하고(2.4), 화면 출처 제안은 권한 단계와 무관하게 항상 제안 카드를 거친다. 메일·채팅·화면 속 지시문은 작업을 승인하지 않는다(AC-5, AC-6). 연결된 서비스에서는 쓰기·전송이 사용자의 실제 계정에 반영되므로 발송·게시에 세션당·계정당 하루 상한을 둔다. 서버는 레지스트리에 없는 도구 이름을 거부한다.
- **캡처는 저장하지 않는다.** 프레임은 브라우저 메모리와 요청 처리 중에만 존재한다.
- **남용 방지**: 서버 예산 가드(`server/budget.ts`)가 일일 비용 상한(`BUDGET_DAILY_USD`, 기본 150)과 세션당 호출 상한(`BUDGET_SESSION_CALLS`)을 적용한다. 인스턴스 메모리 기준이므로 정확한 원장이 아닌 상한 장치이며, 초과 시 `budget` 오류를 반환하고 브라우저는 준비된 대사로 폴백한다.

## 8. 배포

- Vercel이 SPA(`dist/`)와 `api/**/*.ts` 함수를 함께 배포한다(`vercel.json`).
- Cubism Core와 모델 에셋은 저장소에 없으므로 원격 빌드에서 사용할 수 없다. 로컬에서 에셋을 배치한 뒤 `vercel build`로 빌드하고 `vercel deploy --prebuilt`로 산출물을 올린다.
- 내장 음성 대사(`src/voice/builtin-lines.ts`)의 클립도 저장소에 없다(`public/voice/`는 `.gitignore`에 포함). 배포 전에 `pnpm voices`로 `public/voice/<character>/<lang>/<id>.mp3`와 `manifest.json`을 생성한다. 이미 있는 클립은 건너뛰고 문구가 바뀐 클립만 다시 만들며, `--force`는 전체를 다시 생성한다. 키와 보이스 ID는 `.env.local`의 `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_TT2`, `ELEVENLABS_VOICE_YUI`를 사용한다. 생성된 파일은 `vercel build` 산출물에 포함되어 배포된다. 클립이 없거나 문구가 다르면 앱은 해당 대사를 실시간 TTS로 재생한다.

## 9. 데스크톱 앱과 로컬 에이전트 런타임

### 9.1 macOS 데스크톱 앱 (Tauri)

같은 프런트엔드를 Tauri v2 웹뷰로 감싼 macOS 메뉴 막대 앱이다. 투명하고 항상 위에 있는 오버레이 창에 캐릭터, 말풍선, 확인 카드만 그리고, 실제 화면을 캡처해 Haiku가 사용자의 실제 작업을 보게 한다. API 키는 계속 서버에만 있고 앱은 배포된 `api/`를 호출한다. 구조, 권한, 빌드, 알려진 한계는 `docs/desktop-app.md`에 정리했다.

| 항목 | 웹 데모 | 데스크톱 앱 (Tauri) |
|---|---|---|
| 화면 입력 | `VirtualDesktopSource`(가상 데스크톱 캡처) | `TauriScreenSource`(ScreenCaptureKit 캡처, 자기 앱 창 제외, 메인 디스플레이) |
| 활동 신호 | 가상 데스크톱의 활성 창·타이핑 | 최전면 앱과 창 제목, 마지막 키 입력 이후 시간 |
| 캐릭터 표시 | 페이지 안 레이어 | 투명 오버레이 창(클릭 투과, 드래그) |
| push-to-talk | 페이지 포커스 상태의 단축키 | 전역 단축키 |
| 설정·대시보드 | 가상 데스크톱 안의 창 | 별도 네이티브 창(스토어 동기화) |
| 커넥터 로그인 | httpOnly 쿠키 | 시스템 브라우저 + 127.0.0.1 루프백, 키체인 저장 |
| 서버 | Vercel `api/` | 동일 |

`ScreenSource` 인터페이스와 이벤트 버스 계약이 유지되므로 Nunchi, Agent, Connectors, Voice, Character 모듈은 그대로 재사용한다.

### 9.2 로컬 에이전트 런타임

데스크톱 앱 전용의 범용 에이전트 백엔드(`agent-runtime/`)다. Claude Agent SDK를 감싼 작은 Node 서버로 `127.0.0.1`에서 실행되며, 파일 읽기·쓰기, 셸 명령, 웹 조사처럼 커넥터 밖의 작업을 사용자의 컴퓨터에서 수행한다. 메일·캘린더·Slack·Discord 같은 커넥터 업무는 계속 브라우저 루프와 확인 카드가 맡고, 컴퓨터 작업만 런타임으로 넘긴다. 런타임은 동작마다 자체 권한 요청을 띄우며, 모델 호출은 서버의 `/api/anthropic/*` 프록시를 거치므로 키가 앱에 들어가지 않는다. 웹 데모에는 런타임이 없으므로 이런 요청에는 데스크톱 앱이 필요하다고 답한다. 라우팅 계약, 프로토콜, 권한, 데스크톱 연동 절차는 `docs/agent-runtime.md`에 정리했다.
