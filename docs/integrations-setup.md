# 실연동 설정 가이드 (Google · Slack · Discord)

이 문서는 사용자(심사자 포함)가 **자기 계정**을 앱에서 직접 연결하는 구조를 운영자가 준비하는 절차를 정리한다. 연결하지 않은 서비스는 지금처럼 가상 PC의 샘플 데이터(mock)로 동작하므로, 아래 설정이 하나도 없어도 데모는 그대로 진행된다.

## 1. 구조 요약

```
브라우저 ──(연결 버튼)──> GET /api/auth/<provider>/start
                          └─302─> 제공자 동의 화면 (Google · Slack · Discord)
                                   └─302─> GET /api/auth/<provider>/callback  (서버가 code 교환, client secret은 서버에만)
                                             └─302─> /?connected=<provider>   + Set-Cookie yy_<provider>=<봉인된 토큰>
브라우저 ──POST /api/connectors/<service> (쿠키 자동 첨부)──> 서버가 쿠키를 풀어 사용자 계정 API 호출
```

- **서버는 상태를 갖지 않는다.** 제공자 토큰은 `AUTH_SECRET`에서 유도한 키로 AES-256-GCM 봉인한 뒤 제공자별 httpOnly 쿠키(`yy_google`, `yy_slack`, `yy_discord`)에 담는다. `SameSite=Lax`, HTTPS에서는 `Secure`, 유효 기간 30일이다. 브라우저 JavaScript는 토큰을 읽을 수 없다.
- Google access token은 만료되면 서버가 refresh token으로 갱신하고 쿠키를 다시 설정한다.
- `GET /api/auth/status`는 제공자별 연결 여부, 계정 표시 이름(Google 이메일, Slack 워크스페이스, Discord 서버), 사용 가능한 서비스만 돌려준다. 토큰은 내려가지 않는다.
- `POST /api/auth/<provider>/logout`은 쿠키를 지우고 Google·Slack 토큰을 폐기(revoke)한다.
- OAuth `state`는 봉인된 1회용 쿠키(`yy_oauth_<provider>`, 콜백 경로 한정, 10분)에 묶여 있고, Google은 PKCE(S256)를 함께 쓴다. 돌아갈 경로는 같은 출처의 상대 경로만 허용한다.
- **데스크톱 앱(Tauri)**: `/api/auth/<provider>/start?client=desktop&port=<1024-65535>&nonce=<8-64자>`로 시작하면 콜백이 쿠키 대신 `http://127.0.0.1:<port>/yuiyumi-auth?provider=&nonce=&blob=&account=`로 리디렉션한다. 앱은 `nonce`를 확인하고 `blob`을 저장한 뒤 API 호출에 `Authorization: Bearer <blob>[,<blob>...]`(제공자별 blob을 쉼표로 연결)를 붙인다. 브라우저 코드에서는 `setLiveAuthHeader()`(`src/connectors/live-client.ts`)로 연결한다. 데스크톱 경로의 Google access token 갱신은 서버 인스턴스 메모리 캐시로만 처리한다.

## 2. 공통 환경변수

| 변수 | 필수 | 설명 |
|---|---|---|
| `AUTH_SECRET` | 연동 시 필수 | 쿠키 봉인 키의 원재료. 32자 이상 임의 문자열(`openssl rand -base64 48`). 바꾸면 모든 연결이 해제된다. 없으면 모든 연결 버튼이 비활성화된다 |
| `APP_ORIGIN` | 선택 | OAuth redirect URI의 기준 출처를 고정한다(예: `https://yuiyumi.vercel.app`). 비우면 요청의 `Host`·`X-Forwarded-*` 헤더로 계산한다. HTTPS 터널로 로컬을 테스트할 때 터널 주소를 넣는다 |
| `OUTBOUND_SESSION_CAP` | 선택 | 세션당 발송·게시 상한(기본 10) |
| `OUTBOUND_ACCOUNT_DAILY_CAP` | 선택 | 연결된 계정별 하루 발송·게시 상한(기본 30) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google 연동 시 | 3절 |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` | Slack 연동 시 | 4절 |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN` | Discord 연동 시 | 5절 |

- 로컬: `.env.local`에 넣는다(커밋하지 않는다). 개발 서버는 시작할 때 읽으므로 값을 바꾸면 dev 서버를 다시 시작한다.
- Vercel: Project > Settings > Environment Variables에 같은 이름으로 넣고(Production·Preview), 재배포한다.
- 예산 가드(`BUDGET_DAILY_USD`, `BUDGET_SESSION_CALLS`)는 커넥터 호출에도 그대로 적용된다.
- redirect URI는 아래 두 출처를 모두 등록한다: 로컬 `http://localhost:5180`, 배포 `https://<Vercel 도메인>`. 미리보기(Preview) 배포 도메인은 매번 바뀌므로 고정 도메인에서 테스트한다.

## 3. Google (Gmail · Calendar)

요청 권한은 `https://www.googleapis.com/auth/gmail.modify`(restricted 등급)와 `https://www.googleapis.com/auth/calendar.events`(sensitive 등급) 두 가지다. 앱은 **Testing 모드로 유지하고, 심사자의 Google 주소를 미리 테스트 사용자로 등록**한다.

### 3.1 프로젝트와 API

1. [Google Cloud Console](https://console.cloud.google.com/)에서 새 프로젝트를 만든다(예: `yuiyumi-demo`).
2. APIs & Services > Library에서 **Gmail API**와 **Google Calendar API**를 각각 Enable한다.

### 3.2 OAuth 동의 화면 (Google Auth Platform)

1. Google Auth Platform > Branding: 앱 이름 `YuiYumi`, 지원 이메일, 개발자 연락처를 입력한다.
2. Audience: User type **External**, Publishing status **Testing**을 유지한다(Publish app을 누르지 않는다).
3. Audience > **Test users > Add users**: 연결할 모든 Google 주소(팀원, 심사자)를 입력하고 저장한다.
   - 테스트 사용자는 최대 **100명**이며, 추가한 사용자마다 이 한도를 소모하므로 필요한 주소만 넣는다.
   - 등록되지 않은 계정으로 로그인하면 Google이 "앱이 Google 인증 절차를 완료하지 않았습니다"(Error 403: access_denied)로 막는다. 앱으로 돌아오면 Settings > Connectors에 "먼저 테스트 사용자로 등록해야 한다"는 안내가 뜬다(사용자가 동의를 취소한 경우에도 Google은 같은 `access_denied`를 돌려주므로 안내문에 두 경우를 함께 적었다).
   - Google Workspace 계정은 조직 관리자가 외부 앱을 막아 두었으면 테스트 사용자여도 로그인할 수 없다.
4. Data Access > Add or remove scopes: 위 두 scope를 추가한다(목록에 없으면 "Manually add scopes"에 URL을 붙여 넣는다).

### 3.3 OAuth 클라이언트

1. Google Auth Platform > Clients > Create client, Application type **Web application**.
2. Authorized redirect URIs에 두 개를 추가한다.
   - `http://localhost:5180/api/auth/google/callback`
   - `https://<Vercel 도메인>/api/auth/google/callback`
3. 생성된 Client ID와 Client secret을 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`에 넣는다.

### 3.4 Testing 모드에서 알아 둘 제약 (Google 문서 기준, 2026-10 확인)

- 동의 전에 테스트 사용자에게도 "확인되지 않은 앱" 경고가 표시된다. "고급 > YuiYumi(으)로 이동"을 눌러 진행하도록 심사자에게 미리 안내한다.
- Testing 모드에서 테스트 사용자의 승인은 **동의 시점부터 7일 뒤 만료**되고, 그 refresh token도 함께 만료된다. 만료되면 다음 호출에서 서버가 연결을 해제하고 가상 PC는 샘플 데이터로 돌아가며, 캐릭터가 "다시 연결" 버튼을 띄운다. 심사 일정이 7일을 넘기면 심사 직전에 다시 연결해 달라고 안내한다.
- 동의 화면에서 사용자가 Gmail 또는 Calendar 중 하나의 체크를 해제할 수 있다. 서버는 실제로 허용된 scope만 연결하고(`/api/auth/status`의 `services`), 나머지 서비스는 샘플 데이터로 둔다.
- 참고(이번 데모에서는 쓰지 않음): Production으로 게시하면 모든 Google 계정이 로그인할 수 있지만, 검증을 받지 않은 앱은 "확인되지 않은 앱" 경고가 계속 표시되고 sensitive·restricted scope를 요청하는 미검증 앱은 프로젝트 전체 기간 동안 **신규 사용자 100명**으로 제한된다(재설정 불가). `gmail.modify` 같은 restricted scope를 정식 공개하려면 앱 검증과 보안 평가가 필요하다.

출처: Google Cloud 도움말 [Manage App Audience](https://support.google.com/cloud/answer/15549945), [Unverified apps](https://support.google.com/cloud/answer/7454865).

## 4. Slack

메시지는 **사용자 본인 이름으로** 게시되도록 user token(user scope)만 요청한다.

1. [api.slack.com/apps](https://api.slack.com/apps) > Create New App > From scratch. 앱 이름 `YuiYumi`, 개발용 워크스페이스를 고른다.
2. OAuth & Permissions
   - **Redirect URLs**: `https://<Vercel 도메인>/api/auth/slack/callback`을 추가한다. Slack은 redirect URL에 **HTTPS만** 허용하므로 `http://localhost`는 등록할 수 없다. 로컬에서 Slack을 시험하려면 HTTPS 터널(예: `cloudflared tunnel --url http://localhost:5180`)을 띄우고, 그 주소의 `/api/auth/slack/callback`을 추가로 등록한 뒤 `.env.local`의 `APP_ORIGIN`에 터널 주소를 넣고 그 주소로 접속한다.
   - **User Token Scopes**: `channels:read`, `channels:history`, `groups:read`, `groups:history`, `chat:write`, `users:read`. Bot Token Scopes는 비워 둔다.
   - Token Rotation은 켜지 않는다(켜면 user token이 12시간마다 만료되며, 현재 구현은 refresh를 하지 않는다).
3. Basic Information > App Credentials의 Client ID와 Client Secret을 `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`에 넣는다.
4. **다른 워크스페이스에서 설치**: Manage Distribution > "Remove Hard Coded Information" 확인 항목을 모두 체크한 뒤 **Activate Public Distribution**을 누른다. 활성화하지 않으면 앱을 만든 워크스페이스에서만 연결된다. Slack Marketplace 등록은 필요 없다(등록하지 않은 공개 배포 앱은 설치 화면에 미검토 앱 표시가 나올 수 있다).
5. 사용자는 Settings > Connectors > Slack > 연결을 눌러 자기 워크스페이스에 설치한다. 워크스페이스 관리자가 앱 승인을 요구하면 관리자 승인이 필요하다.
6. 동작 범위: 사용자가 속한 공개·비공개 채널의 목록과 최근 메시지 읽기, 사용자 이름으로 게시. 게시 본문의 `&`, `<`, `>`는 이스케이프하므로 `<!channel>` 같은 전체 알림과 링크 서식은 동작하지 않는다.

## 5. Discord

Discord는 OAuth로 앱이 **사용자 본인으로 메시지를 보내는 것을 허용하지 않는다.** 그래서 "연결"은 사용자가 관리하는 서버에 YuiYumi 봇을 추가하는 흐름(봇 설치 OAuth)이며, 게시는 봇 이름으로 나간다. 이 사실은 연결 화면 문구에도 적혀 있다.

1. [Discord Developer Portal](https://discord.com/developers/applications) > New Application(`YuiYumi`).
2. OAuth2
   - Client ID, Client Secret을 `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`에 넣는다.
   - **Redirects**: `http://localhost:5180/api/auth/discord/callback`, `https://<Vercel 도메인>/api/auth/discord/callback`.
3. Bot
   - Reset Token으로 봇 토큰을 발급해 `DISCORD_BOT_TOKEN`에 넣는다(모든 사용자가 같은 봇을 쓰며, 사용자가 고른 서버 id만 봉인 쿠키에 저장된다).
   - **Public Bot**: 켠다(다른 사람이 자기 서버에 추가할 수 있게).
   - **Requires OAuth2 Code Grant**: 켠다(우리 콜백을 거치는 설치만 허용).
   - **Message Content Intent**: 켠다(채널 메시지 본문 읽기에 필요). 100개 미만 서버의 봇은 심사 없이 켤 수 있다.
4. 앱이 요청하는 값(코드에 고정): scope `bot identify guilds`, permissions `68608` = View Channels(1024) + Send Messages(2048) + Read Message History(65536).
5. 사용자는 Settings > Connectors > Discord > 연결에서 서버를 고르고 승인한다. "서버 관리" 권한이 있는 서버만 목록에 나온다. 이후 읽기·게시는 그 서버의 텍스트 채널로만 제한되고, 게시물은 `@everyone`·역할·사용자 멘션을 울리지 않는다. 봇이 서버에서 추방되면 다음 호출에서 연결이 해제된다.

## 6. 앱에서의 동작

- **Settings > Connectors**(`src/settings/ConnectorsPanel.vue`): 제공자별 연결·연결 해제 버튼, 연결된 계정 이름, 서비스별 상태(연결됨 / 샘플 데이터 / 불러오는 중 / 오류), 접근 범위 설명, Google 테스트 모드 안내, Discord 봇 게시 안내를 5개 언어로 표시한다.
- 연결 후 `/?connected=<provider>`로 돌아오면 앱이 쿼리를 지우고 해당 서비스의 메일함(받은편지함·스팸·휴지통·보낸편지함·초안), 어제부터 다음 주까지의 일정, 채널과 최근 메시지를 불러와 가상 앱에 보여 준다.
- 연결하지 않은 서비스나 불러오기에 실패한 서비스는 샘플 데이터로 동작한다. 에이전트가 샘플 데이터 서비스를 쓰면 캐릭터 옆에 "Gmail 연결" 같은 제안 카드(`src/connectors/ConnectPrompt.vue`)가 세션당 한 번 뜬다.
- **샘플 데이터 추가(선택, 기본 꺼짐)**: Google을 연결한 뒤 Settings > Connectors > "내 계정에 샘플 추가"를 누를 때만, 데모 줄거리의 가공 메일(스팸 1통 포함)을 사용자의 Gmail에, 오늘 일정(겹치는 회의 포함)을 기본 캘린더에 넣는다. 메일에는 `YuiYumi samples` 라벨과 `X-YuiYumi-Sample` 헤더, 일정에는 private extended property를 붙여 다시 눌러도 중복되지 않는다. 샘플 메일의 Reply-To는 사용자 자신의 `+태그` 주소라서 답장이 가공 주소로 반송되지 않고 자기 메일함으로 돌아온다. "샘플 삭제"는 샘플 메일을 휴지통으로 옮기고 샘플 일정을 삭제한다. 하루 6회로 제한한다.

## 7. 점검 체크리스트

- [ ] `AUTH_SECRET`(32자 이상)을 로컬과 Vercel에 넣었다
- [ ] Google: Gmail API·Calendar API 사용 설정, 동의 화면 External·Testing, scope 2개, 테스트 사용자에 심사자 주소 전원 등록
- [ ] Google: Web application 클라이언트에 redirect URI 2개 등록, `GOOGLE_CLIENT_ID`·`GOOGLE_CLIENT_SECRET` 설정
- [ ] Slack: User Token Scopes 6개, HTTPS redirect URL 등록, Public Distribution 활성화, `SLACK_CLIENT_ID`·`SLACK_CLIENT_SECRET` 설정
- [ ] Discord: redirect 2개, Public Bot·Requires OAuth2 Code Grant·Message Content Intent 켜기, `DISCORD_CLIENT_ID`·`DISCORD_CLIENT_SECRET`·`DISCORD_BOT_TOKEN` 설정
- [ ] dev 서버 재시작(또는 Vercel 재배포) 후 `GET /api/auth/status`에서 세 제공자의 `available`이 `true`인지 확인
- [ ] 테스트 사용자 계정으로 Google 연결 → 가상 Mail·Calendar에 실제 데이터가 보이는지, 등록되지 않은 계정으로 시도하면 테스트 사용자 안내가 뜨는지 확인
- [ ] 심사 7일 이내에 심사자에게 연결을 안내했다(Testing 모드 승인 만료)
