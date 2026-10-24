# 외부 서비스 연동: 커넥터 구조

각 서비스의 연산을 하나의 레지스트리(`CONNECTOR_OPS`, `shared/contracts.ts`)에 같은 형식으로 등록하고, 연산마다 위험 등급을 둔다. 레지스트리의 연산은 Sonnet의 도구로 그대로 노출된다.

| 서비스 | 읽기 (자동 실행) | 쓰기 (확인 카드 필수) |
|---|---|---|
| Gmail | 메일 목록·본문 | **초안 생성만** |
| Google Calendar | 일정 조회·충돌 검사 | 일정 생성 |
| Google Drive | 파일 검색·내용 읽기 | 없음 |
| Slack | 채널 목록·최근 메시지 | **답장 초안을 입력창에 넣기만** (게시하지 않음) |
| Discord | 채널 목록·최근 메시지 | 없음 |

- 등급은 `read`와 `write` 두 가지다. `send`, `delete` 등급과 연산은 만들지 않는다(AC-6).
- `read` 연산은 Sonnet이 요청하면 브라우저가 바로 실행한다. `write` 연산은 출처와 무관하게 항상 확인 카드를 거치며, 수락할 때만 실행한다.

## 연산 목록

| 연산 | 서비스 | 등급 | 입력 | 설명 |
|---|---|---|---|---|
| `mail_list` | mail | read | `{ limit? }` | 받은편지함 목록(최신순) |
| `mail_read` | mail | read | `{ id }` | 메일 한 통 읽기 |
| `mail_create_draft` | mail | write | `{ replyToId?, to, subject, body }` | 답장 초안 저장. 발송하지 않는다 |
| `calendar_list` | calendar | read | `{ from, to }` | 기간 내 일정 조회(ISO 날짜) |
| `calendar_conflicts` | calendar | read | `{ from, to }` | 기간 내 겹치는 일정 검사 |
| `calendar_create_event` | calendar | write | `{ title, start, end }` | 일정 생성 |
| `slack_channels` | slack | read | `{}` | 연결된 채널 목록 |
| `slack_read` | slack | read | `{ channelId, limit? }` | 채널 최근 메시지 |
| `slack_draft_reply` | slack | write | `{ channelId, text }` | 답장을 입력창에 초안으로 넣는다. 게시하지 않는다 |
| `discord_channels` | discord | read | `{}` | 연결된 채널 목록 |
| `discord_read` | discord | read | `{ channelId, limit? }` | 채널 최근 메시지 |
| `drive_search` | drive | read | `{ query }` | 키워드로 파일 검색 |
| `drive_read` | drive | read | `{ id }` | 파일 내용 읽기 |

입력 스키마의 원본은 `shared/contracts.ts`의 zod 정의이며, 이 표와 다르면 코드를 따른다.

## 구현 방식

### mock 커넥터 (데모 기본)

- 가상 데스크톱이 렌더링하는 세션 데이터(Pinia demo store, `data/demo/`의 가공 데이터)를 직접 읽고 쓴다.
- 따라서 Sonnet이 도구로 읽는 데이터와 화면에 보이는 데이터가 항상 같다. 쓰기 연산의 결과(메일 초안, 일정, Slack 입력창 초안)는 가상 데스크톱 창에 즉시 반영된다.
- 외부 의존이 없으므로 네트워크나 제공자 장애와 무관하게 데모가 재현된다.

### live 커넥터 (시간이 남을 때)

- 브라우저가 `POST /api/connectors/[service]`에 `{ op, input, sessionId }`를 보내고, 서버는 레지스트리에 있는 허용 연산만 실행한다. 토큰은 서버 환경변수에만 둔다.
- **Slack**: 봇 토큰(`SLACK_BOT_TOKEN`)으로 데모 워크스페이스의 채널 목록과 `conversations.history`를 읽는다. 읽기 전용이며 메시지를 게시하지 않는다. `slack_draft_reply`는 live 모드에서도 가상 Slack 입력창에만 저장한다.
- **Discord**: 봇 토큰(`DISCORD_BOT_TOKEN`)으로 데모 서버의 채널 메시지를 읽는다. 메시지 본문을 읽으려면 Message Content intent가 필요하다. 읽기 전용이다.
- **Google(Gmail·Calendar·Drive)**: `docs/demo-account.md`의 Tier 1(데모 계정 서버 연동)을 따른다.
- 실연동이 실패하면 mock 커넥터로 즉시 전환해 데모를 멈추지 않는다(AC-8).

## 오늘의 범위

1. **필수**: 커넥터 레지스트리, 확인 카드, 다섯 서비스의 mock 커넥터
2. **시간이 남으면**: Slack·Discord 읽기 전용 봇 토큰 연동, Google Calendar 읽기 실연동
3. **오늘 안 함**: Notion 등 레지스트리에 없는 서비스

무엇이 목업인지는 제출물에 명시한다.

## 안전 규칙

- **Gmail 초안 권한(`gmail.compose`)은 발송 권한도 포함한다.** "발송 기능이 없다"는 권한이 아니라 **코드 수준의 보장**이며 제출물에도 그렇게 서술한다. Slack·Discord도 같은 원칙으로 게시 연산을 두지 않는다.
- 서버는 레지스트리에 없는 연산 이름을 거부한다.
- 메일·문서·메시지의 내용은 **신뢰할 수 없는 입력**이다. 본문에 지시문이 있어도 따르지 않고, 도구 결과는 데이터로만 다룬다는 규칙을 시스템 프롬프트에 명시한다.
- 쓰기 작업은 항상 확인 카드를 거치며, 거절하면 아무것도 저장하지 않는다(AC-4, AC-5).
- 토큰은 서버 환경변수에만 두고 레포에 넣지 않는다.
