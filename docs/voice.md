# 음성 입력·출력 설계

## 경계 원칙

**브라우저는 오디오 장치·VAD·재생·립싱크를 맡고, 서버는 키와 제공자 API를 맡는다.** 두 영역 사이에는 제공자 중립 타입인 `Transcript`와 `SpeechRequest`만 오간다(`shared/contracts.ts`). Deepgram과 ElevenLabs의 SDK 타입과 키는 브라우저에 노출하지 않는다.

```
브라우저                                                   서버 (Vercel api/)
Mic ─> PTT(단축키·버튼, 기본) | VAD(Silero, 선택) ─> 16 kHz WAV ──POST /api/stt?lang──> Deepgram nova-3
                                                         <── Transcript ────────
Transcript ─> 눈치 엔진(발화 입력, 모드 해제 판정) ─> Haiku ─> react / delegate_task
SpeechRequest ─────────────────────────────────────────POST /api/tts─────────> ElevenLabs
Player <─ audio/mpeg ─────────────────────────────────────────────────────────
Player <─ 내장 대사 클립(public/voice/<character>/<lang>/<id>.mp3, 미리 생성)
Player ─> LipSync(wlipsync) ─> ParamMouthOpenY,  재생 중 발화 감지 ─> barge-in
```

## 단계별 배치

| 단계 | 위치 | 구현 |
|---|---|---|
| 마이크 | 브라우저 | `getUserMedia({ echoCancellation, noiseSuppression })`. PTT와 VAD가 같은 마이크 스트림을 공유한다 |
| VAD | 브라우저 | Silero VAD(`@ricky0123/vad-web`, `onnxruntime-web`). **기본값은 꺼짐**이며 Settings > Voice, 트레이 메뉴, 컨트롤 필의 VAD 스위치로 켠다. 켜져 있어도 push-to-talk는 계속 동작하고, 누르고 있는 동안에는 VAD 판정을 무시한다. TTS 재생 중에는 판정 임계값을 올린다(0.6 → 0.85) |
| push-to-talk | 브라우저 | 단축키(기본 Space, Settings > Voice에서 변경) 또는 컨트롤 필의 말하기 버튼을 누르는 동안 녹음한다. 입력 칸에 포커스가 있을 때는 단축키를 무시한다 |
| 인코딩 | 브라우저 | 16 kHz mono WAV |
| STT | 서버 `POST /api/stt?lang=<Lang>` | WAV 본문을 받아 Deepgram nova-3 pre-recorded API를 호출한다. `language` 값은 `shared/languages.ts`에서 정한다 |
| STT 결과 | 경계 타입 | `Transcript { text, confidence, lang }` → `voice:transcript` 이벤트 → 눈치 엔진 |
| TTS 요청 | 경계 타입 | `SpeechRequest { text, lang, emotion?, character?, preset?, sessionId }`. 소리가 꺼져 있으면 요청하지 않는다. 대사가 내장 대사와 같으면 요청하지 않고 클립을 재생한다 |
| TTS | 서버 `POST /api/tts` | ElevenLabs를 호출해 `audio/mpeg` 본문을 반환한다. 보이스는 캐릭터별 환경변수(`ELEVENLABS_VOICE_TT2`, `ELEVENLABS_VOICE_YUI`)를 먼저 쓰고, 없으면 언어별 환경변수(`ELEVENLABS_VOICE_*`)를 쓴다. 모델과 보이스 설정은 음성 스타일 프리셋(`lively` 기본, `conversational`, `fast`)이 정하며, `ELEVENLABS_MODEL`은 `lively`의 모델을 바꾼다 |
| 재생 | 브라우저 | WebAudio로 재생하고 `tts:start`·`tts:end` 이벤트를 발행한다 |
| 립싱크 | 브라우저 | `wlipsync`로 재생 오디오를 분석해 `character:mouth`를 발행하고, 캐릭터가 `ParamMouthOpenY`에 기록한다 |
| 끼어들기 | 브라우저 | 재생 중 발화가 감지되면 짧은 페이드 후 재생을 멈추고 진행 중인 TTS 요청을 취소한다. `tts:end { interrupted: true }`를 발행한다 |

## 입력 규칙

- **기본 입력은 push-to-talk다.** 현장은 소음이 많아 VAD가 오작동하기 쉬우므로 VAD는 별도 스위치로 둔다.
- 웹에서는 단축키가 페이지 포커스 상태에서만 동작한다. macOS 데스크톱 앱은 Ctrl·Option·Cmd 중 하나가 포함된 단축키를 전역 단축키로 등록한다(`docs/desktop-app.md`).
- 컨트롤 필의 채팅 입력으로 보낸 문장도 같은 `voice:transcript` 경로(`source: 'chat'`)로 눈치 엔진에 들어간다.
- 발화가 시작되면 `voice:speech-start`, 끝나면 `voice:speech-end`를 발행한다. 눈치 게이트는 두 입력 방식 모두에서 **사용자가 말하는 중이면 끼어들지 않는다**.
- "조용히"·"관상용" 모드에서는 화면 캡처를 하지 않는다. 이때 push-to-talk로 들어온 발화를 STT가 한 글자 이상 인식하면 모드가 해제되고, 인식 결과가 비면 모드를 유지한다(`docs/spec.md` 눈치 엔진 참조).
- 스트리밍 STT(Deepgram 임시 토큰 방식)는 이후 같은 서버 인터페이스 뒤에 추가할 수 있다. 언어별 스트리밍 지원이 확인되기 전까지는 녹음 파일 방식(pre-recorded)으로 전송한다.

## 언어

대응 언어는 영어, 중국어(간체), 중국어(번체·대만), 일본어, 한국어 다섯 가지로 한정한다. 언어 설정은 두 가지다. **표시 언어**(Settings > General, 트레이 메뉴)는 UI 문구를 정하고, **음성 언어**(Settings > Voice)는 STT 입력 언어, 캐릭터의 응답 언어, TTS 출력 언어, 내장 대사 언어를 함께 정한다. 음성 언어를 지정하지 않으면 표시 언어를 따른다(`speechLang`, `src/stores/settings.ts`). 첫 방문에는 브라우저 언어를 미리 선택한 상태로 캐릭터가 말풍선에서 표시 언어를 묻는다. 단일 표는 `shared/languages.ts`이다.

| 설정 | 코드 | Deepgram `language` (Nova-3) | ElevenLabs 보이스 환경변수 |
|---|---|---|---|
| English | `en` | `en` | `ELEVENLABS_VOICE_EN` |
| 简体中文 | `zh-Hans` | `zh-CN` | `ELEVENLABS_VOICE_ZH_HANS` |
| 繁體中文(台灣) | `zh-Hant` | `zh-TW` | `ELEVENLABS_VOICE_ZH_HANT` |
| 日本語 | `ja` | `ja` | `ELEVENLABS_VOICE_JA` |
| 한국어 | `ko` | `ko` | `ELEVENLABS_VOICE_KO` |

- 대만어는 번체 중국어(`zh-TW`)로 해석했다. 대만 민난어(台語)는 Deepgram 언어 목록에 없어 대응하지 않는다.
- 광둥어(`zh-HK`)와 그 외 언어는 범위 밖이다.
- 다섯 언어의 보이스 품질은 모델과 보이스마다 다르므로 실제 문장으로 들어보고 언어별 보이스를 선택한다. 모델명과 지원 언어는 현재 문서에서 확인한다.

## 내장 대사

- 접수(`ack`), 완료(`done`), 확인 요청(`confirm`, `confirmSend`), 알림(`reminder`), 인사(시간대별), 쓰다듬기·찌르기 반응, 캐릭터 전환·이동, 대기 추임새(`filler`), 오프라인 안내 같은 짧은 대사는 캐릭터·언어·종류별로 미리 준비한다(`src/voice/builtin-lines.ts`). 같은 종류에서 직전 변형을 피해 고른다.
- 클립은 `pnpm voices`가 ElevenLabs로 미리 생성해 `public/voice/<character>/<lang>/<id>.mp3`와 `manifest.json`에 둔다. 실행 시에는 manifest에 같은 문구로 등록된 클립만 재생하므로 지연 없이 들리고, 실시간 TTS가 실패해도 동작한다. 클립이 없거나 문구가 다르면 실시간 TTS로 재생하고, 말이 없는 소리 대사는 건너뛴다.
- 사용자의 업무 요청은 내장 `ack` 대사로 바로 접수를 알려 작업 모델의 지연을 가리고, 결과 대사 앞에 짧은 `done` 클립을 재생한다.

## 출력 규칙

- 텍스트 말풍선은 항상 표시하고, 소리는 그 위에 더하는 선택 기능이다. 소리가 꺼져 있으면 `/api/tts`를 호출하지 않는다.
- 키는 `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`로 서버 환경변수에만 둔다.
- ElevenLabs와 Deepgram은 Anthropic 크레딧으로 결제되지 않는다. 비용을 별도로 확인한다.
- `templates/`의 ElevenLabs·Deepgram 스타터는 Next.js 기반이며, 서버 측 제공자 호출 구조의 참고 자료로만 쓴다. 사용자 입력 키를 세션에 저장하는 구조는 가져오지 않는다.

## 끼어들기와 에코

- TTS 재생 중 사용자 발화가 감지되면 재생을 즉시 중단한다(barge-in).
- 스피커 소리가 마이크로 들어오면 VAD가 오작동한다. 재생 중에는 VAD 임계값을 올리거나 헤드폰을 전제로 한다. push-to-talk는 명시적 입력이므로 이 영향을 받지 않는다.

## 폴백

STT나 TTS 호출이 실패하면 텍스트 말풍선만 표시하고 멈추지 않는다(AC-8). 자동재생이 차단되어 재생에 실패해도 같은 방식으로 처리한다. 관찰자 호출이 실패하거나 예산 상한에 닿으면 사용자 발화에 내장 `offline` 대사로 답한다(30초에 한 번).

## 남용 방지

공개 링크이므로 서버에 세션당 호출 상한과 일일 상한을 둔다. STT·TTS·Claude 호출은 모두 서버 함수를 거친다.
