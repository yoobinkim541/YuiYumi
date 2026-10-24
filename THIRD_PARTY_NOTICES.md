# Third-Party Notices

이 문서는 YuiYumi 웹앱이 사용하는 오픈소스 소프트웨어와 외부 구성 요소의 라이선스 및 사용 방식을 정리한다. 각 구성 요소의 저작권은 해당 저작권자에게 있으며, 상세 조건은 각 프로젝트의 라이선스 원문을 따른다.

## 1. 코드를 발췌·이식하거나 참고한 프로젝트

| 프로젝트 | 라이선스 | 사용 방식 |
|---|---|---|
| [moeru-ai/airi](https://github.com/moeru-ai/airi) | MIT | `templates/airi/`에 일부 패키지를 발췌해 원본 상태로 보관한다(`LICENSE` 동봉). Live2D 연동, 오디오 파이프라인, 립싱크 구조를 참고하고 일부 코드를 수정해 앱 코드로 이식했다. 이식한 코드에는 MIT 고지를 유지한다 |
| [elevenlabs/elevenlabs-nextjs-starter](https://github.com/elevenlabs/elevenlabs-nextjs-starter) | MIT | `templates/elevenlabs-nextjs-starter/`에 참고용으로 보관한다. 서버 측 TTS 호출 구조를 참고했으며 앱 빌드에는 포함하지 않는다 |
| [deepgram-starters/nextjs-live-transcription](https://github.com/deepgram-starters/nextjs-live-transcription) | MIT | `templates/deepgram-nextjs-live-transcription/`에 참고용으로 보관한다. 서버 측 STT 호출 구조를 참고했으며 앱 빌드에는 포함하지 않는다 |

## 2. 캐릭터 렌더링

| 프로젝트 | 라이선스 | 사용 방식 |
|---|---|---|
| [FMsongX2/cubism-web-batched-renderer](https://github.com/FMsongX2/cubism-web-batched-renderer) | Live2D Open Software License (저장소의 `LICENSE.md` 참조) | Live2D 모델의 배치 렌더러로 의존성에 포함한다. Cubism Core는 이 패키지에 포함되어 있지 않다 |
| [AyagamiDev/ayagami](https://github.com/AyagamiDev/ayagami) | MIT OR Apache-2.0 | 목표 캐릭터 코어(moc3 로딩·변형 계산)이다. 웹 래퍼를 검증하는 spike 단계에서 사용한다 |
| [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display) | MIT | Live2D 모델 로딩과 PixiJS 연동에 사용한다 |
| [pixi.js](https://github.com/pixijs/pixijs) | MIT | 캐릭터 레이어의 WebGL 렌더링에 사용한다 |

## 3. 앱 프레임워크와 런타임 라이브러리

| 프로젝트 | 라이선스 | 사용 방식 |
|---|---|---|
| [vue](https://github.com/vuejs/core) | MIT | UI 프레임워크 |
| [vite](https://github.com/vitejs/vite) | MIT | 개발 서버와 번들러 |
| [pinia](https://github.com/vuejs/pinia) | MIT | 설정과 데모 세션 데이터의 상태 관리 |
| [zod](https://github.com/colinhacks/zod) | MIT | 브라우저와 서버 사이의 계약 스키마와 요청 검증 |
| [modern-screenshot](https://github.com/qq15725/modern-screenshot) | MIT | 가상 데스크톱 요소의 3초 주기 JPEG 캡처 |
| [@vercel/node](https://github.com/vercel/vercel) | Apache-2.0 | Vercel 서버 함수 타입과 런타임 |

## 4. 음성

| 프로젝트 | 라이선스 | 사용 방식 |
|---|---|---|
| [@ricky0123/vad-web](https://github.com/ricky0123/vad) | ISC | 브라우저 음성 구간 검출(VAD). 기본값은 꺼짐 |
| [Silero VAD](https://github.com/snakers4/silero-vad) 모델 | MIT | `@ricky0123/vad-web`이 사용하는 음성 구간 검출 모델 |
| [onnxruntime-web](https://github.com/microsoft/onnxruntime) | MIT | 브라우저에서 Silero VAD 모델 추론 |
| [wlipsync](https://github.com/mrxz/wLipSync) | MIT | TTS 재생 오디오 기반 립싱크 |

## 5. 제공자 SDK

| 프로젝트 | 라이선스 | 사용 방식 |
|---|---|---|
| [@anthropic-ai/sdk](https://github.com/anthropics/anthropic-sdk-typescript) | Apache-2.0 | 서버에서 Claude(Haiku, Sonnet) API 호출 |
| [@deepgram/sdk](https://github.com/deepgram/deepgram-js-sdk) | MIT | 서버에서 Deepgram STT 호출 |
| [@elevenlabs/elevenlabs-js](https://github.com/elevenlabs/elevenlabs-js) | MIT | 서버에서 ElevenLabs TTS 호출 |

## 6. 이 저장소에서 재배포하지 않는 구성 요소

| 구성 요소 | 라이선스 | 취급 |
|---|---|---|
| Live2D Cubism Core | Live2D Proprietary Software License | 독점 소프트웨어이며 저장소에 포함하지 않는다. 공식 배포처에서 받아 빌드·배포 시점에 `public/vendor/`에 배치한다. Ayagami 코어로 전환하기 전까지의 폴백 경로에서만 사용한다 |
| Live2D 캐릭터 모델·모션·텍스처 | 별도 권리 | 저장소에 포함하지 않는다. 빌드 시점에 `public/models/`로 복사해 배포 산출물에만 포함한다 |

`public/vendor/`와 `public/models/`는 `.gitignore`에 포함되어 있다.

## 7. 자체 구현 범위

눈치 엔진(스케줄러·모드·체류·게이트), 가상 데스크톱, 커넥터 레지스트리와 목업 데이터, 에이전트 도구 루프와 확인 카드, 화면 인식 흐름, 음성 경계 설계, 서버 함수와 예산 가드, Live2D 연동 중 AIRI에서 가져오지 않은 부분은 이 프로젝트에서 자체 구현했다.
