// Localized strings for the connector UI (ConnectorsPanel, ConnectPrompt).

import { computed } from 'vue'
import type { LiveProvider, LiveService } from '@shared/contracts'
import type { Lang } from '@shared/languages'
import { useSettings } from '@/stores/settings'

export interface ConnectorStrings {
  intro: string
  providers: Record<LiveProvider, { title: string, access: string, note: string }>
  connect: string
  disconnect: string
  connectedAs: (account: string) => string
  unavailable: string
  status: { live: string, mock: string, loading: string, error: string }
  /** Virtual apps: loading the connected account, and a failed action on it. */
  app: { syncing: string, failed: (detail: string) => string }
  services: Record<LiveService, string>
  googleWarning: string
  redirect: {
    connected: (provider: string) => string
    accessDenied: string
    unavailable: string
    failed: (provider: string) => string
  }
  samples: {
    title: string, desc: string, add: string, remove: string, busy: string
    added: (n: number) => string, removed: (n: number) => string, failed: string
  }
  prompt: {
    needed: (provider: string, service: string) => string
    expired: (provider: string) => string
    connect: string, later: string
  }
}

const TITLES: Record<LiveProvider, string> = { google: 'Google', slack: 'Slack', discord: 'Discord' }

const en: ConnectorStrings = {
  intro: 'Connect your own accounts to let the assistant work on your real mail, calendar and chats. Without a connection, the virtual PC uses sample data. Sign-in tokens stay on the server in an encrypted cookie; this page never sees them.',
  providers: {
    google: { title: 'Google (Gmail, Calendar)', access: 'Reads, drafts, sends and trashes mail; reads, creates and deletes events on your primary calendar.', note: 'Mail is only sent when you ask for it, and the permission level decides when a confirm card appears.' },
    slack: { title: 'Slack', access: 'Reads your channels and posts messages as you.', note: 'Posts appear under your own name.' },
    discord: { title: 'Discord', access: 'Adds the YuiYumi bot to a server you manage; it reads and posts in that server\'s text channels.', note: 'Discord does not allow apps to post as you, so messages appear from the YuiYumi bot.' },
  },
  connect: 'Connect',
  disconnect: 'Disconnect',
  connectedAs: a => `Connected: ${a}`,
  unavailable: 'Not set up on this server',
  status: { live: 'Live', mock: 'Sample data', loading: 'Loading…', error: 'Unavailable, using sample data' },
  app: { syncing: 'Loading your account…', failed: d => `Could not do this on your account: ${d}` },
  services: { mail: 'Mail', calendar: 'Calendar', slack: 'Slack', discord: 'Discord' },
  googleWarning: 'This app is in Google\'s testing mode: only Google accounts registered as test users can sign in, Google shows an "unverified app" notice, and the sign-in expires after about 7 days.',
  redirect: {
    connected: p => `${p} is connected.`,
    accessDenied: 'Google did not allow the sign-in. If you did not cancel it, this Google account has to be registered as a test user of the app first. Ask the YuiYumi team to add your address, then try again.',
    unavailable: 'This connection is not set up on the server yet.',
    failed: p => `Could not connect ${p}. Please try again.`,
  },
  samples: {
    title: 'Sample mails and events',
    desc: 'Optional: adds the demo story (a few fictional mails, one of them spam, and today\'s overlapping meetings) to your own Gmail and Calendar. Replies to these mails go back to your own address. Remove them any time.',
    add: 'Add samples to my account', remove: 'Remove samples', busy: 'Working…',
    added: n => `Added ${n} items.`, removed: n => `Removed ${n} items.`, failed: 'Could not change the sample data.',
  },
  prompt: {
    needed: (p, s) => `I'm using sample ${s.toLowerCase()} right now. Connect ${p} to use your own?`,
    expired: p => `The ${p} connection has expired. Connect again?`,
    connect: 'Connect', later: 'Not now',
  },
}

const ja: ConnectorStrings = {
  intro: '自分のアカウントを接続すると、アシスタントが実際のメール・カレンダー・チャットで作業できます。接続しない場合、仮想PCはサンプルデータを使います。サインイン情報は暗号化されたCookieとしてサーバー側でのみ扱われ、このページからは読めません。',
  providers: {
    google: { title: 'Google（Gmail・カレンダー）', access: 'メールの閲覧・下書き・送信・ゴミ箱への移動と、メインカレンダーの予定の閲覧・作成・削除を行います。', note: 'メールはあなたが頼んだときだけ送信され、確認カードの表示は権限レベルに従います。' },
    slack: { title: 'Slack', access: 'あなたのチャンネルを読み、あなたとしてメッセージを投稿します。', note: '投稿はあなたの名前で表示されます。' },
    discord: { title: 'Discord', access: 'あなたが管理するサーバーにYuiYumiボットを追加し、そのサーバーのテキストチャンネルを読み書きします。', note: 'Discordではアプリがあなた本人として投稿できないため、メッセージはYuiYumiボットから送られます。' },
  },
  connect: '接続',
  disconnect: '接続解除',
  connectedAs: a => `接続中：${a}`,
  unavailable: 'このサーバーでは未設定です',
  status: { live: '接続中', mock: 'サンプルデータ', loading: '読み込み中…', error: '利用できないためサンプルデータを使用中' },
  app: { syncing: 'アカウントを読み込み中…', failed: d => `アカウントで実行できませんでした：${d}` },
  services: { mail: 'メール', calendar: 'カレンダー', slack: 'Slack', discord: 'Discord' },
  googleWarning: 'このアプリはGoogleのテストモードです。テストユーザーとして登録されたGoogleアカウントだけがサインインでき、「未確認のアプリ」の案内が表示され、約7日でサインインの有効期限が切れます。',
  redirect: {
    connected: p => `${p}を接続しました。`,
    accessDenied: 'Googleがサインインを許可しませんでした。キャンセルしていない場合は、このGoogleアカウントを先にアプリのテストユーザーとして登録する必要があります。YuiYumiチームにアドレスの追加を依頼してから、もう一度お試しください。',
    unavailable: 'この接続はまだサーバーで設定されていません。',
    failed: p => `${p}に接続できませんでした。もう一度お試しください。`,
  },
  samples: {
    title: 'サンプルのメールと予定',
    desc: '任意：デモ用のストーリー（架空のメール数通とスパム1通、今日の重なった会議）をあなたのGmailとカレンダーに追加します。これらのメールへの返信は自分のアドレスに届きます。いつでも削除できます。',
    add: 'サンプルを自分のアカウントに追加', remove: 'サンプルを削除', busy: '処理中…',
    added: n => `${n}件追加しました。`, removed: n => `${n}件削除しました。`, failed: 'サンプルデータを変更できませんでした。',
  },
  prompt: {
    needed: (p, s) => `今は${s}のサンプルデータを使っています。${p}を接続して、あなたのデータを使いますか？`,
    expired: p => `${p}の接続の有効期限が切れました。もう一度接続しますか？`,
    connect: '接続', later: 'あとで',
  },
}

const ko: ConnectorStrings = {
  intro: '내 계정을 연결하면 어시스턴트가 실제 메일·캘린더·채팅으로 작업합니다. 연결하지 않으면 가상 PC는 샘플 데이터를 사용합니다. 로그인 토큰은 암호화된 쿠키로 서버에서만 다루며 이 화면에서는 읽을 수 없습니다.',
  providers: {
    google: { title: 'Google(Gmail·캘린더)', access: '메일을 읽고, 초안을 저장하고, 보내고, 휴지통으로 옮깁니다. 기본 캘린더의 일정을 읽고 만들고 삭제합니다.', note: '메일은 사용자가 요청할 때만 보내며, 확인 카드 표시는 권한 단계를 따릅니다.' },
    slack: { title: 'Slack', access: '내 채널을 읽고 내 이름으로 메시지를 게시합니다.', note: '게시물은 내 이름으로 표시됩니다.' },
    discord: { title: 'Discord', access: '내가 관리하는 서버에 YuiYumi 봇을 추가하고, 그 서버의 텍스트 채널을 읽고 게시합니다.', note: 'Discord는 앱이 사용자 본인으로 게시하는 것을 허용하지 않으므로 메시지는 YuiYumi 봇 이름으로 올라갑니다.' },
  },
  connect: '연결',
  disconnect: '연결 해제',
  connectedAs: a => `연결됨: ${a}`,
  unavailable: '이 서버에 설정되지 않음',
  status: { live: '연결됨', mock: '샘플 데이터', loading: '불러오는 중…', error: '사용할 수 없어 샘플 데이터 사용 중' },
  app: { syncing: '계정을 불러오는 중…', failed: d => `계정에서 실행하지 못했습니다: ${d}` },
  services: { mail: '메일', calendar: '캘린더', slack: 'Slack', discord: 'Discord' },
  googleWarning: '이 앱은 Google 테스트 모드입니다. 테스트 사용자로 등록된 Google 계정만 로그인할 수 있고, "확인되지 않은 앱" 안내가 표시되며, 로그인은 약 7일 후 만료됩니다.',
  redirect: {
    connected: p => `${p} 연결이 완료되었습니다.`,
    accessDenied: 'Google이 로그인을 허용하지 않았습니다. 직접 취소한 것이 아니라면 이 Google 계정을 먼저 앱의 테스트 사용자로 등록해야 합니다. YuiYumi 팀에 주소 등록을 요청한 뒤 다시 시도해 주세요.',
    unavailable: '이 연결은 아직 서버에 설정되지 않았습니다.',
    failed: p => `${p}에 연결하지 못했습니다. 다시 시도해 주세요.`,
  },
  samples: {
    title: '샘플 메일과 일정',
    desc: '선택 사항: 데모 줄거리(가상의 메일 몇 통과 스팸 1통, 오늘 겹치는 회의)를 내 Gmail과 캘린더에 추가합니다. 이 메일에 보낸 답장은 내 주소로 돌아옵니다. 언제든 삭제할 수 있습니다.',
    add: '내 계정에 샘플 추가', remove: '샘플 삭제', busy: '처리 중…',
    added: n => `${n}개를 추가했습니다.`, removed: n => `${n}개를 삭제했습니다.`, failed: '샘플 데이터를 변경하지 못했습니다.',
  },
  prompt: {
    needed: (p, s) => `지금은 ${s} 샘플 데이터를 쓰고 있어요. ${p} 계정을 연결해서 내 데이터를 쓸까요?`,
    expired: p => `${p} 연결이 만료되었어요. 다시 연결할까요?`,
    connect: '연결', later: '나중에',
  },
}

const zhHans: ConnectorStrings = {
  intro: '连接你自己的账号后，助手就能处理你真实的邮件、日历和聊天。未连接时，虚拟电脑使用示例数据。登录令牌以加密 Cookie 的形式只在服务器端使用，此页面无法读取。',
  providers: {
    google: { title: 'Google（Gmail、日历）', access: '读取、起草、发送邮件并移至废纸篓；读取、创建和删除主日历中的日程。', note: '只有在你要求时才会发送邮件，是否显示确认卡片由权限级别决定。' },
    slack: { title: 'Slack', access: '读取你的频道，并以你的身份发布消息。', note: '消息以你的名字显示。' },
    discord: { title: 'Discord', access: '将 YuiYumi 机器人添加到你管理的服务器，读取并在该服务器的文字频道中发言。', note: 'Discord 不允许应用以你本人的身份发言，因此消息由 YuiYumi 机器人发出。' },
  },
  connect: '连接',
  disconnect: '断开连接',
  connectedAs: a => `已连接：${a}`,
  unavailable: '此服务器尚未配置',
  status: { live: '已连接', mock: '示例数据', loading: '加载中…', error: '暂不可用，正在使用示例数据' },
  app: { syncing: '正在加载你的账号…', failed: d => `无法在你的账号上完成：${d}` },
  services: { mail: '邮件', calendar: '日历', slack: 'Slack', discord: 'Discord' },
  googleWarning: '此应用处于 Google 测试模式：只有登记为测试用户的 Google 账号才能登录，Google 会显示“未经验证的应用”提示，登录约 7 天后失效。',
  redirect: {
    connected: p => `已连接 ${p}。`,
    accessDenied: 'Google 未允许此次登录。如果你没有取消，说明这个 Google 账号需要先登记为该应用的测试用户。请联系 YuiYumi 团队添加你的地址后再试。',
    unavailable: '服务器尚未配置此连接。',
    failed: p => `无法连接 ${p}，请重试。`,
  },
  samples: {
    title: '示例邮件和日程',
    desc: '可选：把演示剧情（几封虚构邮件、其中一封垃圾邮件，以及今天时间重叠的会议）添加到你自己的 Gmail 和日历。回复这些邮件会发回你自己的地址。可随时删除。',
    add: '把示例添加到我的账号', remove: '删除示例', busy: '处理中…',
    added: n => `已添加 ${n} 项。`, removed: n => `已删除 ${n} 项。`, failed: '无法更改示例数据。',
  },
  prompt: {
    needed: (p, s) => `现在用的是${s}示例数据。要连接 ${p}，改用你自己的数据吗？`,
    expired: p => `${p} 的连接已过期。要重新连接吗？`,
    connect: '连接', later: '以后再说',
  },
}

const zhHant: ConnectorStrings = {
  intro: '連結你自己的帳號後，助理就能處理你真實的郵件、行事曆和聊天。未連結時，虛擬電腦使用範例資料。登入權杖以加密 Cookie 的形式只在伺服器端使用，此頁面無法讀取。',
  providers: {
    google: { title: 'Google（Gmail、日曆）', access: '讀取、草擬、寄送郵件並移至垃圾桶；讀取、建立和刪除主要日曆中的行程。', note: '只有在你要求時才會寄出郵件，是否顯示確認卡片由權限等級決定。' },
    slack: { title: 'Slack', access: '讀取你的頻道，並以你的身分發布訊息。', note: '訊息會以你的名字顯示。' },
    discord: { title: 'Discord', access: '將 YuiYumi 機器人加入你管理的伺服器，讀取並在該伺服器的文字頻道中發言。', note: 'Discord 不允許應用程式以你本人的身分發言，因此訊息由 YuiYumi 機器人送出。' },
  },
  connect: '連結',
  disconnect: '中斷連結',
  connectedAs: a => `已連結：${a}`,
  unavailable: '此伺服器尚未設定',
  status: { live: '已連結', mock: '範例資料', loading: '載入中…', error: '暫時無法使用，正在使用範例資料' },
  app: { syncing: '正在載入你的帳號…', failed: d => `無法在你的帳號上完成：${d}` },
  services: { mail: '郵件', calendar: '日曆', slack: 'Slack', discord: 'Discord' },
  googleWarning: '此應用程式處於 Google 測試模式：只有登記為測試使用者的 Google 帳號才能登入，Google 會顯示「未經驗證的應用程式」提示，登入約 7 天後失效。',
  redirect: {
    connected: p => `已連結 ${p}。`,
    accessDenied: 'Google 未允許這次登入。如果你沒有取消，代表這個 Google 帳號需要先登記為此應用程式的測試使用者。請聯絡 YuiYumi 團隊新增你的地址後再試一次。',
    unavailable: '伺服器尚未設定此連結。',
    failed: p => `無法連結 ${p}，請再試一次。`,
  },
  samples: {
    title: '範例郵件和行程',
    desc: '選用：把示範劇情（幾封虛構郵件、其中一封垃圾郵件，以及今天時間重疊的會議）加入你自己的 Gmail 和日曆。回覆這些郵件會寄回你自己的地址。可隨時刪除。',
    add: '把範例加入我的帳號', remove: '刪除範例', busy: '處理中…',
    added: n => `已新增 ${n} 項。`, removed: n => `已刪除 ${n} 項。`, failed: '無法變更範例資料。',
  },
  prompt: {
    needed: (p, s) => `現在用的是${s}範例資料。要連結 ${p}，改用你自己的資料嗎？`,
    expired: p => `${p} 的連結已過期。要重新連結嗎？`,
    connect: '連結', later: '稍後再說',
  },
}

export const CONNECTOR_STRINGS: Record<Lang, ConnectorStrings> = { 'en': en, 'ja': ja, 'ko': ko, 'zh-Hans': zhHans, 'zh-Hant': zhHant }

export const providerTitle = (p: LiveProvider) => TITLES[p]

export function useConnectorStrings() {
  const settings = useSettings()
  return computed(() => CONNECTOR_STRINGS[settings.lang] ?? en)
}
