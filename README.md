# YuiYumi

화면 위에 상주하며 사용자가 하는 일을 보고 먼저 말을 걸고, 메일·일정 같은 업무를 대신 처리하는 Live2D 캐릭터 AI 비서.

**웹 데모: https://yuiyumi-seven.vercel.app**

데스크톱 Chrome에서 여는 것을 권장한다. 첫 화면에서 캐릭터의 말풍선으로 언어와 부를 이름을 정하면 데모가 시작된다. 데모의 메일·일정·메시지는 모두 가공 데이터다.

## 주요 기능

- 화면 관찰: 3초마다 화면을 캡처해 Claude Haiku가 상황을 판단하고, 필요할 때 먼저 말을 건다.
- 업무 대행: Claude Sonnet 에이전트가 메일 답장·발송, 일정 추가·삭제, 알림, Slack·Discord 게시를 처리한다. 권한 단계(수동·자동·권한 무시)에 따라 실행 전 확인을 받는다.
- 음성: 누르고 말하기(기본)와 VAD 입력, Deepgram STT, ElevenLabs TTS와 립싱크.
- 캐릭터: 유미(Yumi, TT2.0)와 유이(Yui) 두 캐릭터, 쓰다듬기·찌르기 반응, 편집 가능한 캐릭터 카드.
- 다국어: English, 日本語, 한국어, 简体中文, 繁體中文(台灣).

## 구성

| 경로 | 내용 |
|---|---|
| `src/` | Vue 3 + Vite 프런트엔드(가상 데스크톱, 캐릭터, 음성, 에이전트 루프, 설정) |
| `api/`, `server/` | Vercel 서버 함수(observe, agent, stt, tts, 커넥터)와 공용 서버 코드 |
| `shared/` | 브라우저와 서버가 공유하는 계약 스키마와 언어 표 |
| `docs/` | 기획(spec), 아키텍처, 커넥터, 음성 문서 |
| `landing/` | 랜딩 페이지(정적 사이트) |

자세한 구조는 `docs/architecture.md`를 참조한다.

## 로컬 실행

```bash
pnpm install
pnpm assets      # Ayagami 코어 빌드, 캐릭터 모델 팩 생성, VAD 자산 복사
pnpm voices      # 캐릭터별 내장 음성 생성(선택)
pnpm dev         # http://localhost:5173
```

`.env.local`에 `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`, 캐릭터 음성 ID(`ELEVENLABS_VOICE_*`), `MODEL_ASSET_KEY`를 둔다. 목록은 `.env.example`에 있다. 키는 서버 함수에서만 읽고 브라우저로 내려보내지 않는다.

캐릭터 모델, 모델 팩, 생성한 음성은 저장소에 포함하지 않는다(`public/models/`, `public/voice/`는 `.gitignore` 대상).

## 배포

로컬에서 자산을 만든 뒤 빌드 산출물을 그대로 올린다.

```bash
vercel build --prod
vercel deploy --prebuilt --prod
```

환경변수는 Vercel 프로젝트의 Production 환경에 등록한다.

## 오픈소스

사용한 오픈소스와 라이선스는 `THIRD_PARTY_NOTICES.md`에 정리했다.
