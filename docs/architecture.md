# YuiYumi 웹앱 아키텍처

이 문서는 해커톤 제출용 웹앱(spec v0.5)의 구조를 설명한다. 제품 결정과 합격 기준은 `docs/spec.md`, 음성 경계는 `docs/voice.md`, 커넥터 연산은 `docs/connectors.md`를 기준으로 한다. 계약의 원본은 코드(`shared/contracts.ts`, `shared/languages.ts`, `src/core/types.ts`, `src/core/bus.ts`)이며, 이 문서와 코드가 다르면 코드를 따른다.

## 1. 개요

앱은 **Vue 3 + Vite** 단일 페이지 앱(SPA)과 Vercel `api/` 디렉터리의 Web 표준 함수(`Request` → `Response`)로 구성된다. 심사용 데모는 페이지 안에 그린 **가상 데스크톱**(1920×1080 논리 캔버스, Mail·Calendar·Slack·Discord·Drive 창) 위에서 진행한다. 브라우저는 3초마다 가상 데스크톱 요소를 캡처해 Haiku에 보내고, Haiku의 판단에 따라 캐릭터가 반응하거나 Sonnet이 커넥터 도구로 업무를 수행한다.

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
                                        |                                  (react / delegate_task)
        react ----------> CharacterDirector --> CharacterRuntime + 말풍선 + TTS
        delegate_task --> AgentLoop (브라우저 조율) --> POST /api/agent --> Sonnet (커넥터 도구)
                              | tool_use 실행: mock 커넥터(demo store) | live --> /api/connectors/[service]
                              | write 도구 --> ConfirmCard (수락 시에만 실행)

Voice: Mic --> VAD | PTT --> 16 kHz WAV --> POST /api/stt --> Deepgram --> Transcript --> Nunchi
       SpeechRequest --> POST /api/tts --> ElevenLabs --> Player --> LipSync --> ParamMouthOpenY
```

### 설계 원칙

- **서버는 상태를 갖지 않는다.** 서버의 역할은 API 키 보관, 제공자 API 호출, 인스턴스 메모리 기준 예산 가드로 한정한다.
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
- **선택 어댑터(`DisplayMediaSource`)**: `getDisplayMedia` 기반 화면 공유 구현이다. 심사 데모의 주 경로에서는 사용하지 않으며, 이후 실제 브라우저 탭을 관찰하는 옵션으로 둔다.
- **프로덕션 구현(`TauriScreenSource`, 이후)**: 네이티브 화면 캡처(자기 창 제외)와 OS 활동 신호를 제공한다. 인터페이스가 같으므로 상위 모듈은 수정하지 않는다.

### 2.2 Nunchi (눈치 엔진)

결정적 로직이며 순수 함수와 작은 상태로 구성한다.

- **스케줄러**: 3초마다 `capture()` 후 `/api/observe`를 호출한다. 새 호출이 시작되면 응답을 받지 못한 이전 호출은 취소한다. 모드가 `quiet` 또는 `ornamental`이면 캡처와 호출을 모두 멈춘다.
- **모드**: `active`, `quiet`, `ornamental` 세 가지다(`src/stores/settings.ts`). `quiet`·`ornamental`에서 push-to-talk 발화의 STT 결과가 한 글자 이상이면 `active`로 전환하고, 결과가 비면 모드를 유지한다.
- **체류**: 직전 프레임과의 해시 비교로 같은 화면의 유지 시간을 센다.
- **게이트**: 먼저 말을 거는 경우에만 적용한다. 하루 3회 초과, 마지막 끼어들기 후 10분 이내, 체류 20초 미만, 타이핑·발화 중이면 Haiku의 도구 호출을 버린다. 횟수는 `localStorage`에 기록한다. 사용자가 직접 말한 요청은 게이트와 집계에서 제외한다.

### 2.3 Agent

- **관찰자(`/api/observe`, Haiku)**: 화면 프레임, 상태, 선택적 발화, 언어, 최근 대화를 받아 `react` 또는 `delegate_task` 도구 호출을 반환한다. `tool_choice`는 `auto`이며, 도구 대신 일반 텍스트가 오면 버린다.
- **실행자(`/api/agent`, Sonnet)**: 한 번의 호출이 한 스텝이다. 브라우저의 `AgentLoop`가 응답의 `tool_use`를 실행하고 `tool_result`를 붙여 다시 호출한다. 서버는 `CONNECTOR_OPS`에 정의된 허용 도구만 모델에 전달한다.
- **위임 출처 판정(브라우저 코드)**: `delegate_task`의 출처가 사용자 발화(`utterance`)이면 바로 실행하고, 화면(`screen`)이면 확인 카드로 제안한 뒤 사용자가 수락할 때만 실행한다. `write` 등급 도구는 출처와 무관하게 항상 확인 카드를 거친다.

### 2.4 Connectors

- 모든 서비스의 연산을 하나의 레지스트리(`CONNECTOR_OPS`, `shared/contracts.ts`)로 정의하고 Sonnet의 도구로 그대로 노출한다. 각 연산은 `name`, `service`, `grade`(`read` | `write`), `description`, `input`(zod 스키마)을 갖는다.
- **mock 커넥터**: 가상 데스크톱이 렌더링하는 세션 데이터(demo store)를 직접 읽고 쓴다. 초안 저장 결과는 가상 데스크톱 창에 즉시 반영된다.
- **live 커넥터(시간이 남을 때)**: `/api/connectors/[service]`가 허용 연산만 실행한다. Slack과 Discord는 봇 토큰을 이용한 읽기 전용 연동이며, Google 서비스는 `docs/demo-account.md`의 Tier 1을 따른다.
- 연산은 `read`·`write`·`outbound` 등급으로 나뉘고, 확인 카드 여부는 설정의 권한 단계(`manual`·`auto`·`bypass`)가 정한다(AC-4). 쓰기·전송은 가상 PC에만 반영된다. 상세 목록은 `docs/connectors.md`.

### 2.5 Voice

브라우저는 오디오 장치, VAD, push-to-talk, 인코딩, 재생, 립싱크, 끼어들기(barge-in)를 담당하고, 서버는 키와 제공자 API(Deepgram STT, ElevenLabs TTS)를 담당한다. 경계를 넘는 타입은 `Transcript`와 `SpeechRequest`뿐이다. 단계별 배치는 `docs/voice.md`의 경계 표를 따른다.

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
- **감정 → 표정**: 감정 6종(`neutral`, `happy`, `thinking`, `surprised`, `sorry`, `focused`)은 모델 프로필(`profile.json`)의 매핑을 통해 표정과 모션으로 연결한다. 입을 가리는 표정은 말하는 동안 립싱크를 우선한다.
- **에셋**: 모델·모션 파일은 저장소에 커밋하지 않는다. 빌드 스크립트가 로컬 모델 디렉터리에서 웹에 필요한 파일만 `public/models/`로 복사하고 텍스처를 웹용으로 축소하며 프로필을 생성한다.

## 3. 이벤트 버스

`src/core/bus.ts`의 `BusEvents`가 모듈 간 계약이다. 처리기에서 발생한 예외는 버스가 잡아 기록하며 다른 처리기의 실행을 막지 않는다.

| 이벤트 | 페이로드 | 발행 | 구독 |
|---|---|---|---|
| `character:react` | `{ emotion, line?, motion?, source: 'observer' \| 'agent' \| 'fallback' }` | Nunchi, Agent, 폴백 | Character, 말풍선, TTS |
| `character:node` | `{ node: CharacterNode }` | Voice, Agent | CharacterDirector |
| `character:mouth` | `MouthPose \| null` | LipSync | CharacterRuntime |
| `bubble` | `{ text, ttlMs? } \| null` | Agent, Character | 말풍선 UI |
| `voice:speech-start` | `{ source: 'vad' \| 'ptt' }` | Voice | Nunchi(발화 중 침묵), barge-in |
| `voice:speech-end` | `{ source: 'vad' \| 'ptt' }` | Voice | Nunchi |
| `voice:transcript` | `Transcript & { source }` | Voice | Nunchi(발화 입력, 모드 해제 판정) |
| `character:touch` | `{ kind: 'pet', holding, petting } \| { kind: 'poke' }` | Character | Voice(내장 대사) |
| `tts:start` | `{ text }` | Voice | Character(`speaking`) |
| `tts:end` | `{ interrupted }` | Voice | Character |
| `agent:delegate` | `{ request, origin: 'utterance' \| 'screen' }` | Nunchi | Agent(즉시 실행 또는 확인 카드) |
| `agent:busy` | `{ busy }` | Agent | Character(`working`), UI |
| `nunchi:interjected` | `{ at }` | Nunchi | 일일 횟수 집계 |

## 4. API 엔드포인트와 계약

모든 엔드포인트는 Vercel `api/` 디렉터리의 Web 표준 함수이며, 요청 본문은 `shared/contracts.ts`의 zod 스키마로 검증한다. 오류 응답은 `ApiError { error, code? }`이며, `code`가 `budget`이면 브라우저는 준비된 대사로 폴백한다(AC-8).

| 엔드포인트 | 요청 | 응답 | 제공자 |
|---|---|---|---|
| `POST /api/observe` | `ObserveRequest { frame, state, utterance?, lang, recent, sessionId }` | `ObserveResponse { actions: (react \| delegate_task)[] }` | Anthropic (Haiku, `MODEL_OBSERVER`) |
| `POST /api/agent` | `AgentStepRequest { lang, origin, messages, sessionId }` | `AgentStepResponse { content, stopReason }` | Anthropic (Sonnet, `MODEL_AGENT`) |
| `POST /api/stt?lang=<Lang>` | 16 kHz mono WAV 본문 | `Transcript { text, confidence, lang }` | Deepgram nova-3 (pre-recorded) |
| `POST /api/tts` | `SpeechRequest { text, lang, emotion?, sessionId }` | `audio/mpeg` 본문 | ElevenLabs |
| `POST /api/connectors/[service]` | `LiveConnectorRequest { op, input, sessionId }` | 연산 결과 JSON | Slack, Discord, Google (선택) |

- `ObserveState`는 `activeApp`, `windowTitle`, `dwellSec`, `minutesSinceLastInterjection`, `interjectionsToday`, `typing`, `userSpeaking`으로 구성한다.
- 언어는 `shared/languages.ts`의 단일 표(`en`, `ja`, `ko`, `zh-Hans`, `zh-Hant`)에서 UI 언어, Deepgram `language` 값, ElevenLabs 보이스 환경변수를 함께 결정한다.
- 서버 환경변수는 `.env.example`에 목록이 있다. 키 값은 Vercel 환경변수와 커밋되지 않는 로컬 `.env.local`에만 둔다.

## 5. 디렉터리 구조

저장소 루트가 Vite 앱이며 단일 패키지로 구성한다.

```
src/
  core/        bus.ts(이벤트 버스), types.ts(ScreenSource, CharacterRuntime 등 모듈 경계)
  host/        ScreenSource 구현: 가상 데스크톱(modern-screenshot), 화면 공유(선택), Tauri(스텁)
  desktop/     VirtualDesktop.vue, 창 프레임, apps/(Mail, Calendar, Slack, Discord, Drive), 시나리오, 활동 신호
  nunchi/      스케줄러, 모드, 체류, 게이트
  agent/       관찰자 클라이언트, 에이전트 루프, 확인 대기열
  connectors/  레지스트리, mock/(demo store 기반), live 클라이언트
  voice/       마이크, VAD, PTT, STT·TTS 클라이언트, 재생, 립싱크, 끼어들기
  character/   CharacterRuntime 구현, CharacterDirector, Live2D 연동, CharacterLayer.vue
  stores/      settings(언어·소리·모드), demo(가상 데스크톱 세션 데이터)
  ui/          ConfirmCard, ObservingIndicator, ControlBar, 말풍선
  i18n/        en, ja, ko, zh-Hans, zh-Hant
shared/        contracts.ts(zod 계약, CONNECTOR_OPS), languages.ts(언어 단일 표)
api/           observe, agent, stt, tts, connectors/[service]
server/        제공자 호출(anthropic, deepgram, elevenlabs, slack, discord), budget.ts, http.ts, prompts/
scripts/       웹용 모델 빌드, Cubism Core 배치
data/demo/<lang>/  언어별(en·ja·ko·zh-Hans·zh-Hant) 메일·일정·Slack·Discord·Drive·시나리오 가공 데이터 (같은 id, 같은 줄거리)
templates/     외부 스타터와 AIRI 발췌본(참고용, 빌드 제외)
docs/          spec, architecture, voice, connectors, demo-account 등
```

`templates/`는 TypeScript 설정과 빌드에서 제외한다. `public/vendor/`(Cubism Core)와 `public/models/`(모델 에셋)는 `.gitignore`에 포함되어 있으며 빌드 시점에 채운다.

## 6. 데이터 흐름

### 6.1 먼저 말 걸기 (화면 관찰)

1. Nunchi 스케줄러가 3초마다 `ScreenSource.capture()`와 `activity()`를 호출한다.
2. 체류 시간을 갱신하고 `ObserveRequest`를 구성해 `POST /api/observe`로 보낸다. 게이트 상태와 무관하게 호출은 항상 수행한다.
3. 서버는 예산 가드를 통과하면 Haiku를 호출하고, 도구 호출만 `actions`로 변환해 반환한다. 프레임은 저장하지 않고 요청 처리 후 폐기한다.
4. 브라우저는 게이트를 적용한다. 조건을 만족하지 않으면 결과를 버린다.
5. `react`이면 `character:react`를 발행한다. 캐릭터는 표정·모션을 적용하고 말풍선을 표시하며, 소리가 켜져 있으면 TTS를 재생한다. 실제로 표시된 경우 `nunchi:interjected`를 발행해 일일 횟수에 반영한다.
6. `delegate_task`이면 `agent:delegate { origin: 'screen' }`을 발행한다. Agent는 Sonnet을 호출하지 않고 확인 카드로 제안하며, 사용자가 수락할 때만 6.3의 루프를 시작한다.

### 6.2 음성 요청

1. 사용자가 Space 키 또는 버튼으로 push-to-talk를 시작한다(VAD를 켠 경우 Silero가 발화 구간을 판정한다). `voice:speech-start`가 발행되고 Nunchi는 먼저 말 걸기를 멈춘다.
2. 녹음이 끝나면 브라우저가 16 kHz mono WAV로 인코딩해 `POST /api/stt?lang=<Lang>`로 보낸다.
3. 서버가 Deepgram nova-3 pre-recorded API를 호출해 `Transcript`를 반환하고, 브라우저는 `voice:transcript`를 발행한다.
4. Nunchi는 `quiet`·`ornamental` 모드라면 해제 여부를 판정하고, 발화를 `utterance`로 포함해 즉시 `/api/observe`를 호출한다. 이 응답은 게이트와 횟수 집계에서 제외한다.
5. 잡담이면 Haiku가 `react`로 응답하며 Sonnet은 호출하지 않는다(AC-11). 업무 요청이면 `agent:delegate { origin: 'utterance' }`가 발행되고 Agent가 바로 루프를 시작한다.
6. 응답 대사는 `SpeechRequest`로 `POST /api/tts`에 보내고, 반환된 오디오를 재생하며 립싱크로 `ParamMouthOpenY`를 구동한다. 재생 중 사용자가 말하면 재생을 멈춘다(barge-in).

### 6.3 쓰기 작업과 확인 카드

1. `AgentLoop`가 `POST /api/agent`를 호출한다. 서버는 `CONNECTOR_OPS`를 도구 정의로 변환해 Sonnet에 전달한다.
2. 응답에 `read` 등급 `tool_use`가 있으면 브라우저가 해당 커넥터(mock 또는 live)를 실행하고 `tool_result`를 메시지에 추가해 다시 호출한다.
3. `write` 등급 `tool_use`(`mail_create_draft`, `calendar_create_event`, `slack_draft_reply`)가 있으면 실행하지 않고 확인 카드에 내용을 표시한다.
4. 사용자가 수락하면 커넥터를 실행해 demo store를 갱신한다. 가상 데스크톱의 임시보관함, 캘린더, Slack 입력창에 결과가 즉시 나타난다(AC-4).
5. 사용자가 거절하면 아무것도 저장하지 않고, 거절 사실을 `tool_result`로 모델에 알린다(AC-5).
6. `stopReason`이 도구 사용이 아니면 루프를 종료하고 결과를 말풍선과 TTS로 전달한다.

## 7. 보안 규칙

- **키는 서버에만 둔다.** Anthropic, Deepgram, ElevenLabs, Slack, Discord 키와 토큰은 Vercel 환경변수에만 둔다. 브라우저 번들에는 키가 포함되지 않으며, 모든 제공자 호출은 `api/`를 경유한다(AC-10). 빌드 산출물에서 키 문자열을 검색해 검증한다.
- **외부 내용은 신뢰할 수 없는 입력이다.** 화면 텍스트, 메일·문서·메시지 본문, 도구 결과, `delegate_task`의 `request`에 포함된 지시문은 따르지 않는다. 이 규칙을 시스템 프롬프트에 명시하고, 화면 출처 위임은 확인 카드를 거치게 해 화면 속 지시문이 곧바로 실행으로 이어지는 경로를 차단한다.
- **발송·게시·삭제는 사용자 요청과 권한 단계를 따른다.** `outbound`(발송·게시)는 `bypass`가 아니면 확인 카드를 거치고, 화면 출처 제안은 항상 제안 카드를 거친다. 메일·채팅·화면 속 지시문은 작업을 승인하지 않는다(AC-5, AC-6). 모든 쓰기·전송은 가상 PC(목업 커넥터)에만 반영되며, 실제 외부 서비스로 쓰는 코드 경로는 없다. 서버는 레지스트리에 없는 도구 이름을 거부한다.
- **쓰기는 항상 확인 카드를 거친다.** `write` 등급 연산은 사용자 수락 없이 실행되지 않는다.
- **캡처는 저장하지 않는다.** 프레임은 브라우저 메모리와 요청 처리 중에만 존재한다.
- **남용 방지**: 서버 예산 가드(`server/budget.ts`)가 일일 비용 상한(`BUDGET_DAILY_USD`, 기본 150)과 세션당 호출 상한(`BUDGET_SESSION_CALLS`)을 적용한다. 인스턴스 메모리 기준이므로 정확한 원장이 아닌 상한 장치이며, 초과 시 `budget` 오류를 반환하고 브라우저는 준비된 대사로 폴백한다.

## 8. 배포

- Vercel이 SPA(`dist/`)와 `api/**/*.ts` 함수를 함께 배포한다(`vercel.json`).
- Cubism Core와 모델 에셋은 저장소에 없으므로 원격 빌드에서 사용할 수 없다. 로컬에서 에셋을 배치한 뒤 `vercel build`로 빌드하고 `vercel deploy --prebuilt`로 산출물을 올린다.
- 내장 음성 대사(`src/voice/builtin-lines.ts`)의 클립도 저장소에 없다(`public/voice/`는 `.gitignore`에 포함). 배포 전에 `pnpm voices`로 `public/voice/<character>/<lang>/<id>.mp3`와 `manifest.json`을 생성한다. 이미 있는 클립은 건너뛰고 문구가 바뀐 클립만 다시 만들며, `--force`는 전체를 다시 생성한다. 키와 보이스 ID는 `.env.local`의 `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_TT2`, `ELEVENLABS_VOICE_YUI`를 사용한다. 생성된 파일은 `vercel build` 산출물에 포함되어 배포된다. 클립이 없거나 문구가 다르면 앱은 해당 대사를 실시간 TTS로 재생한다.

## 9. 프로덕션 경로 (Tauri)

프로덕션은 같은 웹앱을 웹뷰 데스크톱 앱(Tauri)으로 감싼다. 오늘은 데스크톱 셸을 만들지 않고 교체 지점만 둔다.

| 항목 | 웹 데모 | 프로덕션 (Tauri) |
|---|---|---|
| 화면 입력 | `VirtualDesktopSource`(가상 데스크톱 캡처) | `TauriScreenSource`(네이티브 캡처, 자기 창 제외) |
| 활동 신호 | 가상 데스크톱의 활성 창·타이핑 | OS 활성 창 제목, 입력 활동 |
| 캐릭터 표시 | 페이지 안 레이어 | 투명 오버레이 창(바탕화면 위 상주) |
| push-to-talk | 페이지 포커스 상태의 Space 키 | 전역 단축키 |
| 서버 | Vercel `api/` | 동일 |

`ScreenSource` 인터페이스와 이벤트 버스 계약이 유지되므로 Nunchi, Agent, Connectors, Voice, Character 모듈은 수정 없이 재사용한다.
