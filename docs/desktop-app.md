# YuiYumi 데스크톱 앱 (macOS)

웹앱과 같은 프런트엔드를 Tauri v2 웹뷰로 감싼 데스크톱 오버레이다. 투명하고 항상 위에 있는 창에 캐릭터 상반신, 말풍선, 컨트롤 필만 그리고, 실제 화면을 캡처해 Haiku가 사용자의 실제 작업을 보게 한다. API 키는 계속 서버(Vercel `api/`)에만 있고 앱은 서버를 호출한다.

## 1. 구조

```
YuiYumi.app (Tauri v2, Rust)                         서버 (Vercel api/, 키 보관)
+-------------------------------------------+
| overlay 창 (투명, 테두리 없음, 항상 위)      |  fetch  /api/observe, /api/agent,
|   desktop.html -> src/desktop-app/overlay |-------> /api/stt, /api/tts, /api/model-key,
|   CharacterLayer + ConfirmCard            |         /api/connectors/*, /api/auth/*
|   initCharacter/Voice/Nunchi/Agent        |         (CORS: tauri://localhost 등만 허용)
| settings / dashboard 창 (일반 창)          |
|   desktop.html#settings|#dashboard        |
| Rust: ScreenCaptureKit 캡처, 활성 앱,       |
|   트레이, 클릭 투과용 커서 좌표, 창 드래그,  |
|   전역 단축키, 루프백 로그인, 키체인         |
+-------------------------------------------+
```

| 파일 | 역할 |
|---|---|
| `src-tauri/src/lib.rs` | 창(overlay, 패널), 메뉴 막대 트레이(보이기/숨기기, 설정, 대시보드, 종료), 명령 등록 |
| `src-tauri/src/macos.rs` | ScreenCaptureKit 캡처(자기 앱 창 제외), 화면 기록 권한, 최전면 앱과 창 제목, 마지막 키 입력 이후 시간, 오버레이의 메뉴 막대 위 이동 허용 |
| `src-tauri/src/drag.rs` | 아바타 드래그: 전역 커서를 따라 네이티브 창을 옮기고 소프트 클램프 적용 |
| `src-tauri/src/auth.rs` | 커넥터 로그인: 시스템 브라우저와 127.0.0.1 루프백, 공급자별 키체인 저장 |
| `src-tauri/src/system.rs` | 웹사이트 열기, 설치된 앱 실행, 앱 목록 |
| `src-tauri/src/runtime.rs` | 에이전트 런타임 자식 프로세스(시작, 포트·토큰, 재시작, 종료). `docs/agent-runtime.md` 7절 |
| `src/desktop-app/agent-host.ts` | 브라우저 루프의 `computer_task`/`open_url`/`open_app` 데스크톱 구현, 컨트롤러 생성 |
| `src/desktop-app/main.ts` | 진입점. 해시가 없으면 오버레이, `#settings`/`#dashboard`면 패널 |
| `src/desktop-app/overlay.ts` | 오버레이 초기화, 클릭 투과, 몸통 드래그, 전역 PTT, 트레이 문구, 상태 방송 |
| `src/desktop-app/panel.ts` | SettingsApp/DashboardApp를 별도 창에 마운트하고 오버레이 상태를 미러링 |
| `src/desktop-app/sync.ts` | 창 사이 Pinia 스토어 동기화(Tauri 이벤트)와 런타임 상태 방송 |
| `src/desktop-app/auth.ts` | 키체인 blob을 `setLiveAuthHeader`로 Bearer 헤더에 연결, 로그아웃 시 삭제 |
| `src/desktop-app/system.ts` | `openUrl`, `openApp`, `listApps` 래퍼(웹에서는 `unsupported`) |
| `src/host/tauri-screen-source.ts` | `ScreenSource` 구현: 네이티브 캡처, 해시, 변화 영역(lookTarget), 활동 |
| `src/desktop-app/shims/actuator.ts` | 데스크톱 빌드에서 `@/desktop/actuator` 대체(가상 데스크톱 연출 없음) |
| `src/desktop-app/panel/{voice,nunchi}.ts` | 패널 창에서 `@/voice`, `@/nunchi` 대체(VAD 토글은 오버레이로 전달, 대화 기록은 미러) |

### 1.1 웹 빌드와의 분리

`vite.config.ts`는 모드별로 페이지를 고른다. 기본 모드는 `index.html`을 `dist/`로, `--mode desktop`은 `desktop.html`을 `dist-desktop/`로 빌드한다. 데스크톱 모드에서만 `desktopShims` 플러그인이 위 대체 모듈을 연결하므로 웹 빌드와 웹 모듈은 바뀌지 않는다. 가상 데스크톱(`initDesktop`)은 로드하지 않고, 목업 커넥터용 데모 데이터 시드와 라이브 커넥터 시작만 오버레이가 직접 호출한다. 컨트롤 필의 설정 버튼은 가상 데스크톱 창 상태(`desktop.focused`)를 바꾸므로, 오버레이가 이를 감지해 Tauri 설정 창을 연다.

### 1.2 API 주소

`src/core/api.ts`의 `API_BASE`를 모든 `/api/*` 호출이 쓴다. 데스크톱 빌드는 `DESKTOP_API_BASE` 환경 변수를 `VITE_API_BASE`로 주입한다. 값이 없으면 빌드는 배포 주소 `https://yuiyumi-seven.vercel.app`, 개발 모드(`desktop:dev`)는 빈 값(데스크톱 개발 서버 자체의 `/api` 미들웨어)이다. 서버의 `server/http.ts`는 `tauri://localhost`, `http://tauri.localhost`, `https://tauri.localhost` 출처에만 CORS 헤더를 붙이고, `api/*.ts`는 `withCors`와 `OPTIONS = preflight`를 내보낸다. 로컬 Vite 서버는 `server.cors: false`로 이 처리를 핸들러에 맡긴다.

모델 팩(`public/models/*.bin`, 암호화)은 `dist-desktop`에 복사되어 앱 번들에 포함되고, 복호화 키는 여전히 `/api/model-key`에서 받는다. API 키는 번들에 들어가지 않는다.

## 2. 동작

### 2.1 화면 캡처

`capture_screen` 명령이 ScreenCaptureKit(`SCScreenshotManager`, macOS 14 이상)으로 메인 디스플레이를 캡처한다. 콘텐츠 필터가 이 앱의 모든 창을 제외하므로 캐릭터, 말풍선, 패널은 캡처에 들어가지 않는다(메뉴 막대와 Dock은 포함). 1920×1080 안으로 비율을 유지해 줄이고 품질 70 JPEG base64로 돌려준다. `TauriScreenSource`가 이를 받아 평균 해시(체류 판정)와 32×18 변화 격자(시선 대상)를 계산한다. 활동 정보는 1초마다 `activity` 명령으로 갱신한다. 최전면 앱 이름(이 앱이 앞에 오면 직전 앱 유지), 그 앱의 최상단 일반 창 제목, 마지막 키 입력 이후 시간(1.5초 미만이면 typing)을 보낸다.

화면 기록 권한이 없으면 캡처가 `permission`으로 실패한다. 첫 실패에서 시스템 권한 요청을 띄우고(설치 후 한 번), 이후 실행에서는 시스템 설정의 화면 기록 항목을 연다. 캐릭터는 10분에 한 번 현지화된 말풍선으로 허용 후 재시작을 안내한다.

### 2.2 클릭 투과

오버레이는 50 ms마다 `cursor_local` 명령으로 창 기준 커서 좌표를 받아 `document.elementFromPoint`로 판정한다. 캔버스 위면 `characterHitTest`가 아바타 픽셀(head/body)일 때만, 그 밖에는 필·말풍선 입력·확인 카드 같은 실제 요소 위일 때만 마우스를 받고, 나머지는 `setIgnoreCursorEvents(true)`로 뒤의 앱에 클릭을 넘긴다. 포인터를 누르고 있는 동안(드래그, 누르고 말하기, 머리 쓰다듬기)은 계속 받는다.

### 2.3 드래그와 위치 기억

몸통(body)을 누르고 4px 이상 움직이면 드래그가 시작된다(머리는 쓰다듬기로 남는다). Rust 스레드가 8 ms 간격으로 전역 커서를 따라 네이티브 창을 옮기고, 왼쪽 버튼을 놓으면 끝난다. 웹뷰 이벤트가 아니라 전역 좌표를 쓰므로 창 밖으로 커서가 나가도 계속 따라간다. 소프트 클램프는 커서가 있는 디스플레이에 캐릭터 영역이 가로·세로로 최소 120pt 남도록만 제한한다. 다중 모니터에서는 커서가 옮겨 간 디스플레이 기준으로 바뀐다. macOS는 창을 메뉴 막대 아래로 제한하는데, 오버레이(플로팅 레벨) 창에 한해 `constrainFrameRect:toScreen:`을 우회해 머리가 화면 위 끝까지 갈 수 있게 했다. 위치는 `tauri-plugin-window-state`가 저장하고 다음 실행에서 복원한다(저장된 디스플레이가 없으면 메인 화면 오른쪽 아래).

### 2.4 누르고 말하기

창 안의 키 처리(`installPtt`)는 웹과 같다. 여기에 `tauri-plugin-global-shortcut`이 `settings.pttKey`를 따라 전역 단축키를 등록한다(누름 = `pttDown`, 뗌 = `pttUp`). Ctrl, Option, Cmd 중 하나가 있는 단축키만 전역으로 등록한다. 기본값 Space 같은 단독 키를 전역 등록하면 모든 앱에서 그 키가 막히기 때문이다. 이 경우 오버레이에 포커스가 있을 때와 필의 마이크 버튼으로만 동작하므로, 설정에서 예를 들어 ⌥Space로 바꾸면 어디서나 쓸 수 있다.

### 2.5 설정·대시보드 창

트레이 메뉴나 필의 설정 버튼이 `desktop.html#settings`/`#dashboard` 일반 창을 연다. 창마다 JS 영역이 따로이므로 settings, character, persona, demo 스토어는 Tauri 이벤트로 양방향 동기화된다(마지막 쓰기 우선). 음성·눈치 상태, 활동 카운터, 최근 대화는 오버레이가 방송하고 패널은 표시만 한다. 패널의 VAD 토글은 오버레이로 전달되어 거기서 마이크를 연다.

### 2.6 커넥터 로그인

연결 버튼이 `/api/auth/<provider>/start`로 이동하면 셸이 웹뷰 이동을 막고, 127.0.0.1의 임의 포트에 일회용 리스너를 연 뒤 시스템 브라우저로 `<API>/api/auth/<provider>/start?client=desktop&port=N&nonce=X`를 연다(provider는 google, slack, discord). 서버는 `http://127.0.0.1:N/yuiyumi-auth?provider=..&nonce=..&blob=..&account=..`로 끝낸다. 리스너는 nonce와 provider를 확인하고 blob을 키체인(`app.yuiyumi.desktop` 서비스, `connector-<provider>` 계정)에 저장한다. 프런트엔드는 `setLiveAuthHeader(() => 'Bearer ' + blobs.join(','))`로 라이브 커넥터 호출에 붙이고, 로그인 이벤트 뒤 오버레이는 `refreshLive()`, 패널은 `refreshStatus()`를 부른다. 로그아웃은 `POST /api/auth/<provider>/logout`(같은 Bearer)이 성공하면 해당 blob을 키체인에서 지운다. 대기 시간은 5분이다.

### 2.7 웹사이트 열기와 앱 실행

`src/desktop-app/system.ts`가 에이전트 도구용 래퍼를 제공하고, 브라우저 루프의 `open_url`/`open_app` 도구가 이를 쓴다(`agent-host.ts`).

| 함수 | 동작 | 결과 |
|---|---|---|
| `openUrl(url)` | http/https만 기본 브라우저로 연다 | `{ ok: true, value: 정규화된 URL }` |
| `openApp(name)` | `/Applications`, `/Applications/Utilities`, `/System/Applications`(및 Utilities), `~/Applications`의 `.app`을 표시 이름(현지화 이름 포함), 파일 이름, 번들 ID로 찾는다. 대소문자·공백·기호는 무시하고 정확히 일치, 접두, 포함(3자 이상) 순으로 고른다 | `{ ok: true, value: 실행한 앱 이름 }`, 설치되지 않은 이름은 `{ ok: false, error }` |
| `listApps()` | 설치된 앱 목록 | `{ ok: true, value: [{ name, bundleId }] }` |

데스크톱 앱 밖에서는 모두 `{ ok: false, error: 'unsupported' }`를 돌려준다.

## 3. 빌드와 실행

사전 조건: Rust(stable), Xcode Command Line Tools, pnpm, 그리고 `public/models`, `public/vad`, `public/voice` 자산(웹과 같다).

```bash
pnpm install
pnpm desktop:dev                                   # 개발: Vite(5181, desktop 모드) + tauri dev
DESKTOP_API_BASE=https://<배포 주소> pnpm desktop:build   # 배포용 .app과 .dmg
DESKTOP_API_BASE=http://localhost:5180 pnpm desktop:build # 로컬 웹 개발 서버를 API로 쓰는 시험 빌드
```

결과물은 `src-tauri/target/release/bundle/macos/YuiYumi.app`과 `src-tauri/target/release/bundle/dmg/YuiYumi_<버전>_aarch64.dmg`이다. `desktop:build`는 `public/models/tt2-icon.png`(웹에 이미 배포되는 아이콘)가 있으면 그것으로 앱 아이콘을 만들어 `src-tauri/icons/app/`(git 제외)에 두고 번들에 쓴다. 없으면 저장소에 커밋된 중립 자리표시자 아이콘을 쓴다. 자리표시자와 트레이 아이콘은 `node src-tauri/scripts/icons.mjs --placeholder`로 다시 만든다. `src-tauri/target`, `dist-desktop`, 생성 아이콘은 git에 넣지 않는다.

## 4. 권한

| 권한 | 용도 | 처리 |
|---|---|---|
| 화면 기록 | 화면 캡처, 다른 앱 창 제목 | `NSScreenCaptureUsageDescription`. 첫 캡처 때 시스템 요청, 허용 후 앱 재시작 필요 |
| 마이크 | 누르고 말하기, VAD | `NSMicrophoneUsageDescription`, `com.apple.security.device.audio-input` 엔타이틀먼트 |
| 키체인 | 커넥터 blob 저장 | 서명 없는 빌드는 처음 접근할 때 키체인 허용을 물을 수 있다 |
| 네트워크 | API 호출, 루프백 리스너 | `network.client`, `network.server` 엔타이틀먼트 |

손쉬운 사용(Accessibility)과 입력 모니터링 권한은 쓰지 않는다. 타이핑 여부는 권한이 필요 없는 `CGEventSourceSecondsSinceLastEventType`으로 판단한다. 앱은 메뉴 막대 앱(`LSUIElement`, Dock 아이콘 없음)이며, App Nap은 `NSAppSleepDisabled`로 끈다.

## 5. 알려진 한계

- **서명·공증 없음.** ad-hoc 서명(`-`)만 한다. 처음 열 때 Gatekeeper 경고가 나오므로 Finder에서 앱을 오른쪽 클릭 후 열기(또는 시스템 설정 > 개인정보 보호 및 보안 > 그래도 열기)로 실행한다. Developer ID 서명과 공증은 이후 작업이다. 서명이 바뀌면 화면 기록 권한을 다시 허용해야 한다.
- **배포 API 주소.** `DESKTOP_API_BASE`가 없으면 `https://yuiyumi-seven.vercel.app`을 쓴다. 다른 배포를 쓰려면 이 값을 주고 다시 빌드한다(에이전트 런타임의 프록시 주소도 이 값에서 나온다).
- **캡처는 메인 디스플레이만**, macOS 14 이상. 캐릭터가 보조 모니터에 있어도 메인 화면을 본다.
- **화면 상단 근처의 말풍선.** 캐릭터를 화면 위 끝으로 올리면 머리 위 말풍선은 화면 밖으로 나갈 수 있다.
- **2D 대체 모드**(Live2D 실패 시)에서는 아바타 픽셀 판정이 없어 클릭 투과는 되지만 몸통 드래그가 되지 않는다.
- **Apple Silicon 빌드만** 만들었다(`aarch64`). Intel용은 `--target x86_64-apple-darwin` 또는 universal 빌드가 필요하다.
- 패널 창의 상태는 오버레이 방송(변경 시 150 ms, 최소 1.5초 주기)을 따르므로 약간 늦을 수 있다.
