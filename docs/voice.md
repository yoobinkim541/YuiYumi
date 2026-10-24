# 음성 입력·출력 설계

## 입력: 두 방식, 하나의 이벤트

```
InputSource
 ├─ PushToTalk : 스페이스바를 누르는 동안 녹음, 떼면 종료
 └─ VadListener: Silero VAD가 발화 시작/종료를 판정
        ↓ Utterance(audio)
   STT → 눈치 게이트 → Claude(tool use) → TTS
```

- **데모 기본값은 스페이스바 말하기.** 현장은 소음이 많아 VAD가 오작동하기 쉽다. VAD는 토글 옵션.
- 웹: 브라우저 키 이벤트 + `MediaRecorder`. VAD는 `@ricky0123/vad-web`(Silero 기반) 사용 가능.
- Tauri: 전역 단축키 플러그인으로 앱이 비활성일 때도 수신.
- VAD 파라미터(초안): 발화 시작 전 300ms pre-roll, 침묵 600ms 지속 시 발화 종료.
- 눈치 게이트는 두 모드 모두에서 **사용자가 말하는 중이면 끼어들지 않는다**.
- "조용히"·"관상용" 모드에서는 화면 캡처를 하지 않는다. 이때 말하기 버튼으로 들어온 발화를 STT가 한 글자 이상 인식하면 모드가 해제되고, 인식 결과가 비면 모드를 유지한다(`docs/spec.md` 눈치 엔진 참조).

## 언어

대응 언어는 영어, 중국어(간체), 중국어(번체·대만), 일본어, 한국어 다섯 가지로 한정한다. 사용자가 설정에서 고른 언어 하나가 STT 입력 언어와 TTS 출력 언어, 캐릭터 대사 언어를 함께 정한다.

| 설정 | Deepgram `language` (Nova-3) |
|---|---|
| English | `en` |
| 简体中文 | `zh-CN` |
| 繁體中文(台灣) | `zh-TW` |
| 日本語 | `ja` |
| 한국어 | `ko` |

- 대만어는 번체 중국어(`zh-TW`)로 해석했다. 대만 민난어(台語)는 Deepgram 언어 목록에 없어 대응하지 않는다.
- 언어별 스트리밍 지원 여부는 문서에서 확인되지 않았다. 확인 전까지 PushToTalk는 녹음 파일 방식(pre-recorded)으로 전송한다.
- 광둥어(`zh-HK`)와 그 외 언어는 범위 밖이다.

## 출력

- **ElevenLabs**를 TTS로 사용한다. STT는 **Deepgram**(Nova-3)을 사용한다. 저지연 모델 우선.
- 템플릿 후보는 `elevenlabs/elevenlabs-nextjs-starter`와 `elevenlabs/examples`의 `text-to-speech/nextjs/quickstart/example`이다.
- 다섯 언어의 보이스 품질은 모델과 보이스마다 다르므로 키 확보 후 실제 문장으로 들어보고 언어별 보이스를 선택한다. 모델명·지원 언어는 현재 문서에서 확인한다.
- 키는 `ELEVENLABS_API_KEY`로 서버 환경변수에만 둔다. 브라우저·Tauri 앱에는 넣지 않는다.
- ElevenLabs는 Anthropic 크레딧으로 결제되지 않는다. 비용을 별도로 확인한다.

## 끼어들기와 에코

- TTS 재생 중 사용자 발화가 감지되면 재생을 즉시 중단한다(barge-in).
- 스피커 소리가 마이크로 들어오면 VAD가 오작동한다. 재생 중에는 VAD 임계값을 올리거나 헤드폰을 전제로 한다.

## 폴백

STT나 TTS 호출이 실패하면 텍스트 말풍선만 표시하고 멈추지 않는다(AC-8).

## 남용 방지

공개 링크이므로 `/api`에 호출 횟수 제한과 일일 상한을 둔다. STT/TTS/Claude 호출은 모두 서버 라우트를 거친다.
