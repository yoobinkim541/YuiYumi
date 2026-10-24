# 외부 템플릿 원본 (참고용)

음성 입출력 구현의 출발점으로 가져온 공식 스타터의 소스 사본이다. 앱 빌드에 포함되지 않으며, 필요한 부분만 앱 코드로 옮겨 쓴다. 수정하지 않고 원본 상태로 둔다.

앱은 Vue 3 + Vite SPA로 구성하며(`docs/spec.md` v0.5), 아래 Next.js 스타터는 서버 측 제공자 호출 구조의 참고 자료로만 쓴다. 이 문서의 "프레임워크 버전" 항목에 있는 Next.js 기준 서술은 v0.4 시점의 내용이다.

| 디렉터리 | 용도 | 원본 | 기준 커밋 | 라이선스 |
|---|---|---|---|---|
| `elevenlabs-nextjs-starter/` | TTS (ElevenLabs) | https://github.com/elevenlabs/elevenlabs-nextjs-starter | `86cf28f` (2025-12-12) | MIT |
| `deepgram-nextjs-live-transcription/` | STT (Deepgram) | https://github.com/deepgram-starters/nextjs-live-transcription | `042a368` (2026-10-22) | MIT |
| `airi/` | Live2D, 오디오 파이프라인, 에이전트 구조 (발췌, `airi/README.md` 참조) | https://github.com/moeru-ai/airi | `d759427` (2026-10-24) | MIT |

## 제외한 파일

- `.git`, 잠금 파일(`pnpm-lock.yaml`, `package-lock.json`), `public/`, 폰트, `favicon.ico`
- 루트 `.gitattributes`가 이미지 확장자를 Git LFS로 추적하므로 바이너리 에셋은 가져오지 않았다.

## 가져올 때 확인할 점

- **API 키 처리**: ElevenLabs 스타터는 사용자가 입력한 키를 `iron-session`에 저장하는 `key-manager`와 `app/actions/manage-api-key.ts`를 쓴다. 우리는 키를 서버 환경변수에만 두는 구조(`docs/voice.md`)이므로 이 부분은 가져오지 않는다. 호출부는 `app/actions/create-speech.ts`와 `app/actions/utils.ts`(`textToSpeech.convert` 후 base64 변환)를 참고한다.
- **프레임워크 버전**: ElevenLabs 스타터는 Next 15 / React 19, Deepgram 스타터는 Next 14 / React 18 / `@deepgram/sdk` ^4.5.1이다. 앱은 Next 15 / React 19 기준으로 맞추고 Deepgram 쪽 코드를 이식한다.
- **Deepgram 스타터 구성**: 브라우저가 `app/api/authenticate/route.ts`에서 임시 토큰을 받아 Deepgram에 직접 스트리밍한다. `app/context/MicrophoneContextProvider.tsx`와 `DeepgramContextProvider.tsx`가 마이크와 연결을 맡는다. 우리 push-to-talk(녹음 후 전송)에 맞게 바꿀지, 스트리밍을 쓸지는 언어별 스트리밍 지원 확인 후 정한다.
- **ElevenLabs 스타터의 STT**: `app/(examples)/speech-to-text/`는 ElevenLabs Scribe용이다. 우리 STT는 Deepgram이므로 사용하지 않는다.
