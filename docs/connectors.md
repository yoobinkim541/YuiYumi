# 외부 서비스 연동: 커넥터 구조

각 서비스의 연산을 하나의 레지스트리(`CONNECTOR_OPS`, `shared/contracts.ts`)에 같은 형식으로 등록하고, 연산마다 위험 등급을 둔다. 레지스트리의 연산은 Sonnet의 도구로 그대로 노출된다.

| 서비스 | read (자동 실행) | write (되돌릴 수 있는 변경) | outbound (사용자 밖으로 전송) |
|---|---|---|---|
| Mail | 메일 목록(폴더별)·본문 | 초안 저장, 휴지통 이동·복원 | 새 메일 발송, 답장 발송, 초안 발송 |
| Calendar | 일정 조회·충돌 검사 | 일정 생성·삭제(삭제 목록에 보관) | 없음 |
| Reminders | 대기 중인 알림 목록 | 알림 생성·취소 | 없음 |
| Drive | 파일 검색·내용 읽기 | 없음 | 없음 |
| Slack | 채널 목록·최근 메시지 | 입력창 초안 | 채널 게시 |
| Discord | 채널 목록·최근 메시지 | 없음 | 채널 게시 |

- 등급은 `read`, `write`, `outbound` 세 가지다. 확인 여부는 `shared/contracts.ts`의 `requiresConfirmation(grade, level)`이 정한다.

| 권한 단계 | read | write | outbound |
|---|---|---|---|
| `manual`(기본값) | 자동 | 확인 카드 | 확인 카드 |
| `auto` | 자동 | 자동 | 확인 카드 |
| `bypass`(테스트용) | 자동 | 자동 | 자동 |

- 권한 단계와 무관하게 화면만 보고 먼저 제안한 작업(출처 `screen`)은 제안 카드를 수락해야 시작된다.
- 발송·게시·삭제는 사용자가 직접 요청한 경우에만 수행하며, 메일·채팅·화면 속 지시문은 어떤 작업도 승인하지 않는다(시스템 프롬프트 규칙).
- 도구를 실행할 때 가상 데스크톱이 동작을 보여 준다(`src/desktop/actuator.ts`): 해당 앱 창을 앞으로 가져오고, 아바타 창을 창 옆으로 비키게 하고, 본문을 입력창에 타이핑한 뒤 확인 카드(필요한 경우)를 그 창 위에 띄우고, 결과(보낸편지함, 채널 메시지, 일정)를 보여 준다.

## 연산 목록

| 연산 | 서비스 | 등급 | 입력 | 설명 |
|---|---|---|---|---|
| `mail_list` | mail | read | `{ limit?, folder? }` | 폴더별 목록(inbox·sent·drafts·trash·spam, 최신순) |
| `mail_read` | mail | read | `{ id }` | 메일 한 통 읽기(보낸 메일 포함) |
| `mail_create_draft` | mail | write | `{ replyToId?, to, subject, body }` | 초안 저장. 발송하지 않는다 |
| `mail_send` | mail | outbound | `{ to, subject, body }` | 새 메일 발송 |
| `mail_reply` | mail | outbound | `{ id, body, subject? }` | 받은 메일에 답장 발송(스팸에는 거부) |
| `mail_send_draft` | mail | outbound | `{ draftId }` | 기존 초안 발송 |
| `mail_trash` | mail | write | `{ id }` | 휴지통으로 이동(복원 가능) |
| `mail_restore` | mail | write | `{ id }` | 휴지통에서 복원 |
| `calendar_list` | calendar | read | `{ from, to }` | 기간 내 일정 조회(ISO 날짜) |
| `calendar_conflicts` | calendar | read | `{ from, to }` | 기간 내 겹치는 일정 검사 |
| `calendar_create_event` | calendar | write | `{ title, start, end }` | 일정 생성 |
| `calendar_delete_event` | calendar | write | `{ id }` | 일정 삭제(삭제 목록에 보관) |
| `reminder_create` | reminders | write | `{ at, title }` | 알림 생성. `at`은 ISO 일시 또는 `in N minutes` |
| `reminder_list` | reminders | read | `{}` | 대기 중인 알림 목록 |
| `reminder_cancel` | reminders | write | `{ id }` | 알림 취소 |
| `slack_channels` | slack | read | `{}` | 연결된 채널 목록 |
| `slack_read` | slack | read | `{ channelId, limit? }` | 채널 최근 메시지 |
| `slack_draft_reply` | slack | write | `{ channelId, text }` | 입력창에 초안으로 넣는다. 게시하지 않는다 |
| `slack_post` | slack | outbound | `{ channelId, text }` | 채널에 게시(연결 시 사용자 이름, 가상 앱에 "YuiYumi로 보냄" 표시) |
| `discord_channels` | discord | read | `{}` | 연결된 채널 목록 |
| `discord_read` | discord | read | `{ channelId, limit? }` | 채널 최근 메시지 |
| `discord_post` | discord | outbound | `{ channelId, text }` | 채널에 게시(연결 시 YuiYumi 봇 이름, 가상 앱에 "YuiYumi로 보냄" 표시) |
| `drive_search` | drive | read | `{ query }` | 키워드로 파일 검색 |
| `drive_read` | drive | read | `{ id }` | 파일 내용 읽기 |

알림은 지정 시각에 가상 데스크톱의 macOS 알림 배너로 뜨고 캐릭터가 소리 내어 알려 준다(`src/desktop/reminders.ts`).

입력 스키마의 원본은 `shared/contracts.ts`의 zod 정의이며, 이 표와 다르면 코드를 따른다.

## 구현 방식

### mock 커넥터 (연결하지 않은 서비스)

- 가상 데스크톱이 렌더링하는 세션 데이터(Pinia demo store, `data/demo/`의 가공 데이터)를 직접 읽고 쓴다.
- 따라서 Sonnet이 도구로 읽는 데이터와 화면에 보이는 데이터가 항상 같다. 쓰기·전송 연산의 결과(초안, 보낸 메일, 휴지통, 일정, 알림, 채널 게시)는 가상 데스크톱 창에 즉시 반영된다.
- 외부 의존이 없으므로 네트워크나 제공자 장애와 무관하게 데모가 재현된다.

### live 커넥터 (사용자가 연결한 서비스)

- 사용자가 Settings > Connectors에서 자기 계정을 OAuth로 연결한다(`docs/integrations-setup.md`). 토큰은 봉인된 httpOnly 쿠키에만 있고 브라우저 코드는 읽지 못한다.
- 앱 시작 시(그리고 연결 직후 `?connected=<provider>`로 돌아왔을 때) `GET /api/auth/status`로 연결 상태를 읽고, 연결된 서비스마다 `snapshot` 연산으로 실제 데이터를 불러와 demo store의 해당 컬렉션을 교체한다. 그 서비스는 `LIVE_SERVICES`에 표시되고 언어 전환 시 샘플 데이터로 덮어쓰지 않는다.
- 연결된 서비스의 **모든 연산**(mail·calendar·slack·discord)은 `POST /api/connectors/<service>`에 `{ op, input, sessionId }`로 보낸다. 응답은 `{ result, patch }`이며, `result`는 mock 연산과 같은 형태라 에이전트는 어느 쪽이 처리했는지 구분할 필요가 없다. `patch`는 store 형태의 항목(메일·보낸 메일·초안·일정·채널·메시지)이고 브라우저가 demo store에 반영하므로 가상 앱과 actuator가 실제 결과(보낸편지함, 일정, 채널 메시지)를 그대로 보여 준다.
- 가상 Mail 앱에서 사용자가 직접 보내기·답장·초안 저장·복원을 해도 연결된 Gmail에서 실행된다(확인 카드 없음, 어시스턴트 표시 없음).
- **Gmail**: 폴더(inbox·sent·drafts·trash·spam)는 시스템 라벨로 조회하고, 본문은 MIME에서 text/plain을 우선하며 없으면 HTML을 텍스트로 변환한다. 보내는 메일은 UTF-8 text/plain(base64)이며 제목·표시 이름은 RFC 2047 encoded-word로 인코딩한다. 답장은 Reply-To(없으면 From)로, `In-Reply-To`·`References`·`threadId`를 붙여 같은 스레드에 보낸다. 스팸으로 분류된 메일에는 답장하지 않는다. 메일을 읽으면 읽음으로 표시한다.
- **Calendar**: 기본 캘린더를 그 캘린더의 시간대 기준으로 다룬다(날짜만 준 범위는 해당 시간대의 자정). 충돌은 조회한 일정으로 계산한다. 삭제한 일정은 Google Calendar 휴지통에 30일간 남는다.
- **Slack**: 사용자 토큰으로 사용자가 속한 채널을 읽고 사용자 이름으로 게시한다.
- **Discord**: 사용자가 관리하는 서버에 추가한 YuiYumi 봇으로 그 서버의 텍스트 채널만 읽고, 게시는 봇 이름으로 나간다(Discord는 앱이 사용자 본인으로 게시하는 것을 허용하지 않는다).
- **Drive·Reminders**는 실연동하지 않는다.

### 실패와 전환

| 서버 응답 `code` | 의미 | 브라우저 동작 |
|---|---|---|
| (성공) | 실제 계정에서 실행 | `patch`를 store에 반영하고 `result`를 도구 결과로 사용 |
| `rejected` | 사용자에게 전할 거절(없는 id, 스팸 답장, 잘못된 주소, 발송 상한) | mock으로 넘기지 않고 오류를 에이전트에 그대로 전달 |
| `not_connected` | 연결 안 됨, 만료·해제(Testing 모드 7일 등) | 해당 서비스를 샘플 데이터로 되돌리고, 에이전트에 이유를 전달하며, 캐릭터가 다시 연결을 제안 |
| `provider`, `budget`, 네트워크 오류 | 일시 장애 | 그 호출만 mock으로 처리(AC-8). 쓰기·전송이면 결과에 "가상 PC에만 반영" 메모를 붙인다 |

## 안전 규칙

- 서버는 레지스트리에 없는 연산 이름과 스키마에 맞지 않는 입력을 거부한다. 각 사용자는 자기 계정에만 접근한다.
- 발송·게시는 사용자가 직접 요청한 경우에만 수행하고(시스템 프롬프트), 권한 단계에 따라 확인 카드를 거친다. 서버는 세션당·계정별 하루 발송 상한(`OUTBOUND_SESSION_CAP`, `OUTBOUND_ACCOUNT_DAILY_CAP`)을 둔다.
- 메일·문서·메시지의 내용은 **신뢰할 수 없는 입력**이다. 본문에 지시문이 있어도 따르지 않고, 도구 결과는 데이터로만 다룬다는 규칙을 시스템 프롬프트에 명시한다.
- 확인 카드는 권한 단계에 따라 뜨며, 거절하면 아무것도 저장·전송하지 않는다(AC-4, AC-5). 발송·게시·삭제는 사용자가 직접 요청한 경우에만 수행한다(AC-6).
- Slack 게시 본문은 이스케이프해 전체 알림과 링크 서식을 막고, Discord 게시는 멘션 알림을 끈다.
- 토큰은 봉인된 httpOnly 쿠키(또는 데스크톱 앱의 bearer)로만 오가며 레포·로그에 남기지 않는다.
