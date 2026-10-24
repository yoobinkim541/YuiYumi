// Localized chrome labels for the virtual desktop (menu bar, Dock, Mail, Calendar,
// notification banners). Demo content itself lives in data/demo/<lang>/.

import { computed } from 'vue'
import { LANG_INFO, type Lang } from '@shared/languages'
import { useSettings } from '@/stores/settings'
import type { UserAppId } from './windows'

export interface DesktopStrings {
  finder: string
  trash: string
  menus: string[]
  apps: Record<UserAppId, string>
  mail: {
    favorites: string, mailboxes: string, inbox: string, drafts: string, junk: string, sent: string
    messages: (n: number, unread: number) => string
    noMessages: string, selectMessage: string, draft: string, to: string, reply: string, newMessage: string
    draftBanner: string, junkBanner: string, replyTo: (name: string) => string, placeholder: string
    composerHint: string, discard: string, search: string
    send: string, saveDraft: string, wrote: (date: string, name: string) => string, sentToast: string
  }
  calendar: {
    today: string, day: string, week: string, month: string, year: string, allDay: string
    conflict: string, overlapAt: (hm: string) => string
  }
  now: string
  mb: MenuBarStrings
}

/** Menu bar, menus, status panels and system dialogs. */
export interface MenuBarStrings {
  // System menu
  aboutPC: string, systemSettings: string, sleep: string, restart: string, shutDown: string
  lockScreen: string, logOut: (user: string) => string
  // App menu
  about: (app: string) => string, settings: string, hide: (app: string) => string
  hideOthers: string, showAll: string, quit: (app: string) => string
  // Menu titles
  file: string, edit: string, view: string, go: string, window: string, help: string
  mailbox: string, message: string, format: string
  // File
  newMessage: string, newWindow: string, newFolder: string, newEvent: string, open: string
  closeWindow: string, save: string, print: string
  // Edit
  undo: string, redo: string, cut: string, copy: string, paste: string, selectAll: string, find: string
  // View
  showSidebar: string, hideSidebar: string, enterFullScreen: string, asIcons: string, asList: string
  // Go
  back: string, forward: string, documents: string, desktop: string, downloads: string
  // Mailbox / Message
  getNewMail: string, reply: string, replyAll: string, forwardMsg: string
  // Window
  minimize: string, zoom: string, bringAllToFront: string
  // Help
  search: string, appHelp: (app: string) => string
  // Calendar
  goToday: string
  // Wi-Fi panel
  wifi: string, knownNetwork: string, otherNetworks: string, wifiSettings: string
  // Battery panel
  battery: string, powerSource: string, powerBattery: string, batterySettings: string
  // Control Center
  bluetooth: string, airdrop: string, contactsOnly: string, on: string, off: string
  display: string, sound: string, focus: string, screenMirroring: string, assistantVoice: string
  // Clock widget
  today: string, noEvents: string, upNext: string
  // Dialogs and overlays
  chip: string, memory: string, startupDisk: string, serial: string, version: string, moreInfo: string
  clickToUnlock: string, general: string, network: string, displays: string
  /** Mail composer field label. */
  subject: string
}

const MB_EN: MenuBarStrings = {
  aboutPC: 'About This PC', systemSettings: 'System Settings…', sleep: 'Sleep', restart: 'Restart…', shutDown: 'Shut Down…',
  lockScreen: 'Lock Screen', logOut: u => `Log Out ${u}…`,
  about: a => `About ${a}`, settings: 'Settings…', hide: a => `Hide ${a}`, hideOthers: 'Hide Others', showAll: 'Show All', quit: a => `Quit ${a}`,
  file: 'File', edit: 'Edit', view: 'View', go: 'Go', window: 'Window', help: 'Help', mailbox: 'Mailbox', message: 'Message', format: 'Format',
  newMessage: 'New Message', newWindow: 'New Window', newFolder: 'New Folder', newEvent: 'New Event', open: 'Open…',
  closeWindow: 'Close Window', save: 'Save', print: 'Print…',
  undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'Select All', find: 'Find…',
  showSidebar: 'Show Sidebar', hideSidebar: 'Hide Sidebar', enterFullScreen: 'Enter Full Screen', asIcons: 'as Icons', asList: 'as List',
  back: 'Back', forward: 'Forward', documents: 'Documents', desktop: 'Desktop', downloads: 'Downloads',
  getNewMail: 'Get New Mail', reply: 'Reply', replyAll: 'Reply All', forwardMsg: 'Forward',
  minimize: 'Minimize', zoom: 'Zoom', bringAllToFront: 'Bring All to Front',
  search: 'Search', appHelp: a => `${a} Help`,
  goToday: 'Go to Today',
  wifi: 'Wi‑Fi', knownNetwork: 'Known Network', otherNetworks: 'Other Networks', wifiSettings: 'Wi‑Fi Settings…',
  battery: 'Battery', powerSource: 'Power Source:', powerBattery: 'Battery', batterySettings: 'Battery Settings…',
  bluetooth: 'Bluetooth', airdrop: 'AirDrop', contactsOnly: 'Contacts Only', on: 'On', off: 'Off',
  display: 'Display', sound: 'Sound', focus: 'Focus', screenMirroring: 'Screen Mirroring', assistantVoice: 'Mute',
  today: 'Today', noEvents: 'No events today', upNext: 'Up Next',
  chip: 'Chip', memory: 'Memory', startupDisk: 'Startup disk', serial: 'Serial number', version: 'Version', moreInfo: 'More Info…',
  clickToUnlock: 'Click to unlock', general: 'General', network: 'Network', displays: 'Displays', subject: 'Subject',
}

const MB_JA: MenuBarStrings = {
  aboutPC: 'このPCについて', systemSettings: 'システム設定…', sleep: 'スリープ', restart: '再起動…', shutDown: 'システム終了…',
  lockScreen: '画面をロック', logOut: u => `${u}をログアウト…`,
  about: a => `${a}について`, settings: '設定…', hide: a => `${a}を非表示`, hideOthers: 'ほかを非表示', showAll: 'すべてを表示', quit: a => `${a}を終了`,
  file: 'ファイル', edit: '編集', view: '表示', go: '移動', window: 'ウインドウ', help: 'ヘルプ', mailbox: 'メールボックス', message: 'メッセージ', format: 'フォーマット',
  newMessage: '新規メッセージ', newWindow: '新規ウインドウ', newFolder: '新規フォルダ', newEvent: '新規イベント', open: '開く…',
  closeWindow: 'ウインドウを閉じる', save: '保存', print: 'プリント…',
  undo: '取り消す', redo: 'やり直す', cut: 'カット', copy: 'コピー', paste: 'ペースト', selectAll: 'すべてを選択', find: '検索…',
  showSidebar: 'サイドバーを表示', hideSidebar: 'サイドバーを非表示', enterFullScreen: 'フルスクリーンにする', asIcons: 'アイコン', asList: 'リスト',
  back: '戻る', forward: '進む', documents: '書類', desktop: 'デスクトップ', downloads: 'ダウンロード',
  getNewMail: '新規メールを受信', reply: '返信', replyAll: '全員に返信', forwardMsg: '転送',
  minimize: 'しまう', zoom: '拡大/縮小', bringAllToFront: 'すべてを手前に移動',
  search: '検索', appHelp: a => `${a} ヘルプ`,
  goToday: '今日へ移動',
  wifi: 'Wi‑Fi', knownNetwork: '既知のネットワーク', otherNetworks: 'その他のネットワーク', wifiSettings: 'Wi‑Fi設定…',
  battery: 'バッテリー', powerSource: '電源:', powerBattery: 'バッテリー', batterySettings: 'バッテリー設定…',
  bluetooth: 'Bluetooth', airdrop: 'AirDrop', contactsOnly: '連絡先のみ', on: 'オン', off: 'オフ',
  display: 'ディスプレイ', sound: 'サウンド', focus: '集中モード', screenMirroring: '画面ミラーリング', assistantVoice: '消音',
  today: '今日', noEvents: '今日の予定はありません', upNext: '次の予定',
  chip: 'チップ', memory: 'メモリ', startupDisk: '起動ディスク', serial: 'シリアル番号', version: 'バージョン', moreInfo: '詳細情報…',
  clickToUnlock: 'クリックしてロック解除', general: '一般', network: 'ネットワーク', displays: 'ディスプレイ', subject: '件名',
}

const MB_KO: MenuBarStrings = {
  aboutPC: '이 PC에 관하여', systemSettings: '시스템 설정…', sleep: '잠자기', restart: '재시동…', shutDown: '시스템 종료…',
  lockScreen: '화면 잠금', logOut: u => `${u} 로그아웃…`,
  about: a => `${a}에 관하여`, settings: '설정…', hide: a => `${a} 가리기`, hideOthers: '기타 가리기', showAll: '모두 보기', quit: a => `${a} 종료`,
  file: '파일', edit: '편집', view: '보기', go: '이동', window: '윈도우', help: '도움말', mailbox: '메일상자', message: '메시지', format: '포맷',
  newMessage: '새로운 메시지', newWindow: '새로운 윈도우', newFolder: '새로운 폴더', newEvent: '새로운 이벤트', open: '열기…',
  closeWindow: '윈도우 닫기', save: '저장', print: '프린트…',
  undo: '실행 취소', redo: '실행 복귀', cut: '오려두기', copy: '복사하기', paste: '붙여넣기', selectAll: '전체 선택', find: '찾기…',
  showSidebar: '사이드바 보기', hideSidebar: '사이드바 가리기', enterFullScreen: '전체 화면 시작', asIcons: '아이콘으로', asList: '목록으로',
  back: '뒤로', forward: '앞으로', documents: '도큐멘트', desktop: '데스크탑', downloads: '다운로드',
  getNewMail: '새로운 메일 받기', reply: '답장', replyAll: '전체 답장', forwardMsg: '전달',
  minimize: '최소화', zoom: '확대/축소', bringAllToFront: '모두 앞으로 가져오기',
  search: '검색', appHelp: a => `${a} 도움말`,
  goToday: '오늘로 이동',
  wifi: 'Wi‑Fi', knownNetwork: '알려진 네트워크', otherNetworks: '기타 네트워크', wifiSettings: 'Wi‑Fi 설정…',
  battery: '배터리', powerSource: '전원:', powerBattery: '배터리', batterySettings: '배터리 설정…',
  bluetooth: 'Bluetooth', airdrop: 'AirDrop', contactsOnly: '연락처만', on: '켬', off: '끔',
  display: '디스플레이', sound: '사운드', focus: '집중 모드', screenMirroring: '화면 미러링', assistantVoice: '음소거',
  today: '오늘', noEvents: '오늘 일정 없음', upNext: '다음 일정',
  chip: '칩', memory: '메모리', startupDisk: '시동 디스크', serial: '일련 번호', version: '버전', moreInfo: '추가 정보…',
  clickToUnlock: '클릭하여 잠금 해제', general: '일반', network: '네트워크', displays: '디스플레이', subject: '제목',
}

const MB_ZH_HANS: MenuBarStrings = {
  aboutPC: '关于这台电脑', systemSettings: '系统设置…', sleep: '睡眠', restart: '重新启动…', shutDown: '关机…',
  lockScreen: '锁定屏幕', logOut: u => `退出登录“${u}”…`,
  about: a => `关于${a}`, settings: '设置…', hide: a => `隐藏${a}`, hideOthers: '隐藏其他', showAll: '全部显示', quit: a => `退出${a}`,
  file: '文件', edit: '编辑', view: '显示', go: '前往', window: '窗口', help: '帮助', mailbox: '邮箱', message: '邮件', format: '格式',
  newMessage: '新邮件', newWindow: '新建窗口', newFolder: '新建文件夹', newEvent: '新建日程', open: '打开…',
  closeWindow: '关闭窗口', save: '存储', print: '打印…',
  undo: '撤销', redo: '重做', cut: '剪切', copy: '拷贝', paste: '粘贴', selectAll: '全选', find: '查找…',
  showSidebar: '显示边栏', hideSidebar: '隐藏边栏', enterFullScreen: '进入全屏幕', asIcons: '图标', asList: '列表',
  back: '返回', forward: '前进', documents: '文稿', desktop: '桌面', downloads: '下载',
  getNewMail: '收取新邮件', reply: '回复', replyAll: '全部回复', forwardMsg: '转发',
  minimize: '最小化', zoom: '缩放', bringAllToFront: '前置全部窗口',
  search: '搜索', appHelp: a => `${a}帮助`,
  goToday: '前往今天',
  wifi: '无线局域网', knownNetwork: '已知网络', otherNetworks: '其他网络', wifiSettings: '无线局域网设置…',
  battery: '电池', powerSource: '电源：', powerBattery: '电池', batterySettings: '电池设置…',
  bluetooth: '蓝牙', airdrop: '隔空投送', contactsOnly: '仅限联系人', on: '开', off: '关',
  display: '显示器', sound: '声音', focus: '专注模式', screenMirroring: '屏幕镜像', assistantVoice: '静音',
  today: '今天', noEvents: '今天没有日程', upNext: '即将开始',
  chip: '芯片', memory: '内存', startupDisk: '启动磁盘', serial: '序列号', version: '版本', moreInfo: '更多信息…',
  clickToUnlock: '点按以解锁', general: '通用', network: '网络', displays: '显示器', subject: '主题',
}

const MB_ZH_HANT: MenuBarStrings = {
  aboutPC: '關於這台電腦', systemSettings: '系統設定⋯', sleep: '睡眠', restart: '重新開機⋯', shutDown: '關機⋯',
  lockScreen: '鎖定螢幕', logOut: u => `登出「${u}」⋯`,
  about: a => `關於${a}`, settings: '設定⋯', hide: a => `隱藏${a}`, hideOthers: '隱藏其他', showAll: '顯示全部', quit: a => `結束${a}`,
  file: '檔案', edit: '編輯', view: '顯示方式', go: '前往', window: '視窗', help: '輔助說明', mailbox: '信箱', message: '郵件', format: '格式',
  newMessage: '新郵件', newWindow: '新增視窗', newFolder: '新增檔案夾', newEvent: '新增行程', open: '打開⋯',
  closeWindow: '關閉視窗', save: '儲存', print: '列印⋯',
  undo: '還原', redo: '重做', cut: '剪下', copy: '拷貝', paste: '貼上', selectAll: '全選', find: '尋找⋯',
  showSidebar: '顯示側邊欄', hideSidebar: '隱藏側邊欄', enterFullScreen: '進入全螢幕', asIcons: '圖像', asList: '列表',
  back: '上一頁', forward: '下一頁', documents: '文件', desktop: '桌面', downloads: '下載項目',
  getNewMail: '收取新郵件', reply: '回覆', replyAll: '全部回覆', forwardMsg: '轉寄',
  minimize: '縮到最小', zoom: '縮放', bringAllToFront: '將全部移至最前',
  search: '搜尋', appHelp: a => `${a}輔助說明`,
  goToday: '前往今天',
  wifi: 'Wi‑Fi', knownNetwork: '已知網路', otherNetworks: '其他網路', wifiSettings: 'Wi‑Fi 設定⋯',
  battery: '電池', powerSource: '電源：', powerBattery: '電池', batterySettings: '電池設定⋯',
  bluetooth: '藍牙', airdrop: 'AirDrop', contactsOnly: '僅限聯絡人', on: '開啟', off: '關閉',
  display: '顯示器', sound: '聲音', focus: '專注模式', screenMirroring: '螢幕鏡像輸出', assistantVoice: '靜音',
  today: '今天', noEvents: '今天沒有行程', upNext: '即將開始',
  chip: '晶片', memory: '記憶體', startupDisk: '啟動磁碟', serial: '序號', version: '版本', moreInfo: '更多資訊⋯',
  clickToUnlock: '按一下以解鎖', general: '一般', network: '網路', displays: '顯示器', subject: '主旨',
}

const EN: DesktopStrings = {
  finder: 'Finder',
  trash: 'Trash',
  menus: ['File', 'Edit', 'View', 'Go', 'Window', 'Help'],
  apps: { mail: 'Mail', calendar: 'Calendar', slack: 'Slack', discord: 'Discord', drive: 'Drive', code: 'Code', browser: 'Browser' },
  mail: {
    favorites: 'Favorites', mailboxes: 'Mailboxes', inbox: 'Inbox', drafts: 'Drafts', junk: 'Junk', sent: 'Sent',
    messages: (n, u) => `${n} messages${u ? `, ${u} unread` : ''}`,
    noMessages: 'No Messages', selectMessage: 'No Message Selected', draft: 'Draft', to: 'To', reply: 'Reply',
    newMessage: 'New Message',
    draftBanner: 'Draft saved — not sent. Review and send it yourself.',
    junkBanner: 'Mail thinks this message is junk. Links and requests in it may be unsafe.',
    replyTo: n => `Reply to ${n}`, placeholder: 'Write your reply…',
    composerHint: 'Write your message, then Send or save it as a draft.', discard: 'Discard', search: 'Search',
    send: 'Send', saveDraft: 'Save as Draft', wrote: (d, n) => `On ${d}, ${n} wrote:`, sentToast: 'Message sent',
  },
  calendar: {
    today: 'Today', day: 'Day', week: 'Week', month: 'Month', year: 'Year', allDay: 'all-day',
    conflict: 'Conflict', overlapAt: t => `Overlap at ${t}`,
  },
  now: 'now',
  mb: MB_EN,
}

const STRINGS: Record<Lang, DesktopStrings> = {
  'en': EN,
  'ja': {
    finder: 'Finder',
    trash: 'ゴミ箱',
    menus: ['ファイル', '編集', '表示', '移動', 'ウインドウ', 'ヘルプ'],
    apps: { mail: 'メール', calendar: 'カレンダー', slack: 'Slack', discord: 'Discord', drive: 'Drive', code: 'Code', browser: 'ブラウザ' },
    mail: {
      favorites: 'よく使う項目', mailboxes: 'メールボックス', inbox: '受信', drafts: '下書き', junk: '迷惑メール', sent: '送信済み',
      messages: (n, u) => `${n}件のメッセージ${u ? `、未開封${u}件` : ''}`,
      noMessages: 'メッセージなし', selectMessage: 'メッセージが選択されていません', draft: '下書き', to: '宛先', reply: '返信',
      newMessage: '新規メッセージ',
      draftBanner: '下書きを保存しました(未送信)。内容を確認してからご自身で送信してください。',
      junkBanner: 'このメッセージは迷惑メールの可能性があります。リンクや依頼内容に注意してください。',
      replyTo: n => `${n} さんへの返信`, placeholder: '返信を入力…',
      composerHint: 'メッセージを書いて、送信するか下書きとして保存します。', discard: '破棄', search: '検索',
      send: '送信', saveDraft: '下書きとして保存', wrote: (d, n) => `${d}、${n} さんは書きました:`, sentToast: '送信しました',
    },
    calendar: {
      today: '今日', day: '日', week: '週', month: '月', year: '年', allDay: '終日',
      conflict: '重複', overlapAt: t => `${t} に予定が重複`,
    },
    now: '今',
    mb: MB_JA,
  },
  'ko': {
    finder: 'Finder',
    trash: '휴지통',
    menus: ['파일', '편집', '보기', '이동', '윈도우', '도움말'],
    apps: { mail: 'Mail', calendar: '캘린더', slack: 'Slack', discord: 'Discord', drive: 'Drive', code: 'Code', browser: '브라우저' },
    mail: {
      favorites: '즐겨찾기', mailboxes: '메일상자', inbox: '받은 편지함', drafts: '임시 보관함', junk: '정크 메일', sent: '보낸 편지함',
      messages: (n, u) => `메시지 ${n}개${u ? `, 읽지 않음 ${u}개` : ''}`,
      noMessages: '메시지 없음', selectMessage: '선택된 메시지 없음', draft: '임시 저장', to: '받는 사람', reply: '답장',
      newMessage: '새로운 메시지',
      draftBanner: '임시 저장됨 — 아직 보내지 않았어요. 확인 후 직접 보내 주세요.',
      junkBanner: '정크 메일로 보이는 메시지입니다. 링크와 요청 내용에 주의하세요.',
      replyTo: n => `${n}님에게 답장`, placeholder: '답장을 입력하세요…',
      composerHint: '메일을 작성한 뒤 보내거나 임시 저장하세요.', discard: '삭제', search: '검색',
      send: '보내기', saveDraft: '임시 저장', wrote: (d, n) => `${d}, ${n} 님이 작성:`, sentToast: '메일을 보냈어요',
    },
    calendar: {
      today: '오늘', day: '일', week: '주', month: '월', year: '년', allDay: '하루 종일',
      conflict: '겹침', overlapAt: t => `${t} 일정 겹침`,
    },
    now: '지금',
    mb: MB_KO,
  },
  'zh-Hans': {
    finder: '访达',
    trash: '废纸篓',
    menus: ['文件', '编辑', '显示', '前往', '窗口', '帮助'],
    apps: { mail: '邮件', calendar: '日历', slack: 'Slack', discord: 'Discord', drive: 'Drive', code: 'Code', browser: '浏览器' },
    mail: {
      favorites: '个人收藏', mailboxes: '邮箱', inbox: '收件箱', drafts: '草稿', junk: '垃圾邮件', sent: '已发送',
      messages: (n, u) => `${n} 封邮件${u ? `，${u} 封未读` : ''}`,
      noMessages: '没有邮件', selectMessage: '未选择邮件', draft: '草稿', to: '收件人', reply: '回复',
      newMessage: '新邮件',
      draftBanner: '草稿已保存，尚未发送。请确认后自行发送。',
      junkBanner: '这封邮件可能是垃圾邮件，其中的链接和请求可能不安全。',
      replyTo: n => `回复 ${n}`, placeholder: '输入回复…',
      composerHint: '写好邮件后，可以发送或存为草稿。', discard: '丢弃', search: '搜索',
      send: '发送', saveDraft: '存为草稿', wrote: (d, n) => `${n} 于 ${d} 写道：`, sentToast: '邮件已发送',
    },
    calendar: {
      today: '今天', day: '日', week: '周', month: '月', year: '年', allDay: '全天',
      conflict: '冲突', overlapAt: t => `${t} 日程冲突`,
    },
    now: '现在',
    mb: MB_ZH_HANS,
  },
  'zh-Hant': {
    finder: 'Finder',
    trash: '垃圾桶',
    menus: ['檔案', '編輯', '顯示方式', '前往', '視窗', '輔助說明'],
    apps: { mail: '郵件', calendar: '行事曆', slack: 'Slack', discord: 'Discord', drive: 'Drive', code: 'Code', browser: '瀏覽器' },
    mail: {
      favorites: '常用項目', mailboxes: '信箱', inbox: '收件匣', drafts: '草稿', junk: '垃圾郵件', sent: '寄件備份',
      messages: (n, u) => `${n} 封郵件${u ? `，${u} 封未讀` : ''}`,
      noMessages: '沒有郵件', selectMessage: '未選取郵件', draft: '草稿', to: '收件人', reply: '回覆',
      newMessage: '新郵件',
      draftBanner: '草稿已儲存，尚未寄出。請確認後自行寄出。',
      junkBanner: '這封郵件可能是垃圾郵件，其中的連結與要求可能不安全。',
      replyTo: n => `回覆 ${n}`, placeholder: '輸入回覆…',
      composerHint: '寫好郵件後，可以寄出或存成草稿。', discard: '丟棄', search: '搜尋',
      send: '寄出', saveDraft: '存成草稿', wrote: (d, n) => `${n} 於 ${d} 寫道：`, sentToast: '郵件已寄出',
    },
    calendar: {
      today: '今天', day: '日', week: '週', month: '月', year: '年', allDay: '整天',
      conflict: '衝突', overlapAt: t => `${t} 行程衝突`,
    },
    now: '現在',
    mb: MB_ZH_HANT,
  },
}

/** Strings for a language without the settings store (tests, non-component code). */
export function desktopStrings(lang: Lang): DesktopStrings {
  return STRINGS[lang] ?? EN
}

export function useDesktopStrings() {
  const settings = useSettings()
  const t = computed(() => STRINGS[settings.lang] ?? EN)
  const locale = computed(() => LANG_INFO[settings.lang]?.bcp47 ?? 'en')
  return { t, locale }
}

/** macOS menu bar clock, e.g. "Sat Oct 24  1:47 PM" / "10월 24일 (토) 오후 1:47". */
export function menuBarClock(d: Date, locale: string): string {
  const date = d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
  return locale === 'en' ? `${date.replace(',', '')} ${time}` : `${date} ${time}`
}
