# Project AIRI 발췌본 (참고용)

- 원본: https://github.com/moeru-ai/airi (MIT, `LICENSE` 동봉)
- 기준 커밋: `d759427` (2026-10-24)
- 전체 저장소는 약 155MB의 pnpm 모노레포라서 기획과 겹치는 패키지만 `packages/` 아래에 발췌했다. 앱 빌드에 포함되지 않으며 수정하지 않는다.

## 발췌한 패키지

| 패키지 | 내용 | 우리 쪽 용도 |
|---|---|---|
| `stage-ui-live2d` | Live2D 렌더링 컴포넌트와 런타임 API. `pixi-live2d-display`와 PixiJS 6 기반 | 캐릭터 표시, 배치 렌더러가 붙는 지점 |
| `model-driver-lipsync` | 립싱크 구동 | TTS 입 모양 |
| `model-driver-magic-live2d`, `motion-driver-magic` | MAGIC 모션 생성과 Live2D 구동 | 감정 6종에 대응하는 모션 |
| `electron-screen-capture` | 화면 캡처 | 3초 polling 캡처 (Tauri로 옮길 때 참고) |
| `pipelines-audio`, `audio` | 오디오 캡처, VAD, 인코딩, 스트림 | push-to-talk와 VAD 입력 |
| `stream-kit` | 수명, 스케줄링, 스트림 유틸 | polling 스케줄링 |
| `core-character`, `core-agent`, `agents` | 캐릭터 계약, 에이전트 런타임 | Haiku 라우터와 Sonnet 위임 구조 |
| `i18n` | 다국어 문자열. `en`, `ja`, `ko`, `zh-Hans`, `zh-Hant` 다섯 로케일만 발췌 | 지원 언어 다섯 가지와 일치 |

## 제외한 것

- 바이너리 에셋과 `node_modules`, `dist`
- AIRI 저장소의 에이전트 지침 파일(`AGENTS.md`, `CLAUDE.md`). 이 저장소의 작업 지침과 섞이지 않도록 가져오지 않았다.
- 앱(`apps/`), 연동(`integrations/`), 플러그인, `services/computer-use-mcp` 등. 입력 자동 조작은 하지 않는다는 원칙(`docs/spec.md`)과 맞지 않는 항목은 쓰지 않는다.

## 가져다 쓸 때 확인할 점

- **프레임워크**: AIRI의 UI 패키지는 Vue 3(`.vue` 파일)이고 데스크톱은 Electron 계열 패키지 이름을 쓴다. 앱은 Vue 3 + Vite(`docs/spec.md` v0.5)이므로 Vue 기반 로직은 이식할 수 있으나, Pinia 스토어와 워크스페이스 의존성은 필요한 부분만 옮긴다.
- **의존성**: 패키지 간 의존이 `workspace:`와 `catalog:`로 되어 있어 단독으로 설치되지 않는다. `i18n/src/index.ts`는 발췌하지 않은 로케일도 참조한다.
- **Live2D 코어**: `stage-ui-live2d`는 `pixi-live2d-display`와 공식 Cubism Core 경로를 전제로 한다. 코어를 Ayagami로 쓰기로 한 결정(`docs/spec.md` 렌더링 스택)과는 별도로 어댑터가 필요하다.
