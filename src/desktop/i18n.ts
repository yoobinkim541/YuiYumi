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
  }
  calendar: {
    today: string, day: string, week: string, month: string, year: string, allDay: string
    conflict: string, overlapAt: (hm: string) => string
  }
  now: string
}

const EN: DesktopStrings = {
  finder: 'Finder',
  trash: 'Trash',
  menus: ['File', 'Edit', 'View', 'Go', 'Window', 'Help'],
  apps: { mail: 'Mail', calendar: 'Calendar', slack: 'Slack', discord: 'Discord', drive: 'Drive' },
  mail: {
    favorites: 'Favorites', mailboxes: 'Mailboxes', inbox: 'Inbox', drafts: 'Drafts', junk: 'Junk', sent: 'Sent',
    messages: (n, u) => `${n} messages${u ? `, ${u} unread` : ''}`,
    noMessages: 'No Messages', selectMessage: 'No Message Selected', draft: 'Draft', to: 'To', reply: 'Reply',
    newMessage: 'New Message',
    draftBanner: 'Draft saved — not sent. Review and send it yourself.',
    junkBanner: 'Mail thinks this message is junk. Links and requests in it may be unsafe.',
    replyTo: n => `Reply to ${n}`, placeholder: 'Write your reply…',
    composerHint: 'Drafts are saved automatically. Sending is up to you.', discard: 'Discard', search: 'Search',
  },
  calendar: {
    today: 'Today', day: 'Day', week: 'Week', month: 'Month', year: 'Year', allDay: 'all-day',
    conflict: 'Conflict', overlapAt: t => `Overlap at ${t}`,
  },
  now: 'now',
}

const STRINGS: Record<Lang, DesktopStrings> = {
  'en': EN,
  'ja': {
    finder: 'Finder',
    trash: 'ゴミ箱',
    menus: ['ファイル', '編集', '表示', '移動', 'ウインドウ', 'ヘルプ'],
    apps: { mail: 'メール', calendar: 'カレンダー', slack: 'Slack', discord: 'Discord', drive: 'Drive' },
    mail: {
      favorites: 'よく使う項目', mailboxes: 'メールボックス', inbox: '受信', drafts: '下書き', junk: '迷惑メール', sent: '送信済み',
      messages: (n, u) => `${n}件のメッセージ${u ? `、未開封${u}件` : ''}`,
      noMessages: 'メッセージなし', selectMessage: 'メッセージが選択されていません', draft: '下書き', to: '宛先', reply: '返信',
      newMessage: '新規メッセージ',
      draftBanner: '下書きを保存しました(未送信)。内容を確認してからご自身で送信してください。',
      junkBanner: 'このメッセージは迷惑メールの可能性があります。リンクや依頼内容に注意してください。',
      replyTo: n => `${n} さんへの返信`, placeholder: '返信を入力…',
      composerHint: '下書きは自動保存されます。送信はご自身で行ってください。', discard: '破棄', search: '検索',
    },
    calendar: {
      today: '今日', day: '日', week: '週', month: '月', year: '年', allDay: '終日',
      conflict: '重複', overlapAt: t => `${t} に予定が重複`,
    },
    now: '今',
  },
  'ko': {
    finder: 'Finder',
    trash: '휴지통',
    menus: ['파일', '편집', '보기', '이동', '윈도우', '도움말'],
    apps: { mail: 'Mail', calendar: '캘린더', slack: 'Slack', discord: 'Discord', drive: 'Drive' },
    mail: {
      favorites: '즐겨찾기', mailboxes: '메일상자', inbox: '받은 편지함', drafts: '임시 보관함', junk: '정크 메일', sent: '보낸 편지함',
      messages: (n, u) => `메시지 ${n}개${u ? `, 읽지 않음 ${u}개` : ''}`,
      noMessages: '메시지 없음', selectMessage: '선택된 메시지 없음', draft: '임시 저장', to: '받는 사람', reply: '답장',
      newMessage: '새로운 메시지',
      draftBanner: '임시 저장됨 — 아직 보내지 않았어요. 확인 후 직접 보내 주세요.',
      junkBanner: '정크 메일로 보이는 메시지입니다. 링크와 요청 내용에 주의하세요.',
      replyTo: n => `${n}님에게 답장`, placeholder: '답장을 입력하세요…',
      composerHint: '임시 저장은 자동으로 됩니다. 전송은 직접 해 주세요.', discard: '삭제', search: '검색',
    },
    calendar: {
      today: '오늘', day: '일', week: '주', month: '월', year: '년', allDay: '하루 종일',
      conflict: '겹침', overlapAt: t => `${t} 일정 겹침`,
    },
    now: '지금',
  },
  'zh-Hans': {
    finder: '访达',
    trash: '废纸篓',
    menus: ['文件', '编辑', '显示', '前往', '窗口', '帮助'],
    apps: { mail: '邮件', calendar: '日历', slack: 'Slack', discord: 'Discord', drive: 'Drive' },
    mail: {
      favorites: '个人收藏', mailboxes: '邮箱', inbox: '收件箱', drafts: '草稿', junk: '垃圾邮件', sent: '已发送',
      messages: (n, u) => `${n} 封邮件${u ? `，${u} 封未读` : ''}`,
      noMessages: '没有邮件', selectMessage: '未选择邮件', draft: '草稿', to: '收件人', reply: '回复',
      newMessage: '新邮件',
      draftBanner: '草稿已保存，尚未发送。请确认后自行发送。',
      junkBanner: '这封邮件可能是垃圾邮件，其中的链接和请求可能不安全。',
      replyTo: n => `回复 ${n}`, placeholder: '输入回复…',
      composerHint: '草稿会自动保存，是否发送由你决定。', discard: '丢弃', search: '搜索',
    },
    calendar: {
      today: '今天', day: '日', week: '周', month: '月', year: '年', allDay: '全天',
      conflict: '冲突', overlapAt: t => `${t} 日程冲突`,
    },
    now: '现在',
  },
  'zh-Hant': {
    finder: 'Finder',
    trash: '垃圾桶',
    menus: ['檔案', '編輯', '顯示方式', '前往', '視窗', '輔助說明'],
    apps: { mail: '郵件', calendar: '行事曆', slack: 'Slack', discord: 'Discord', drive: 'Drive' },
    mail: {
      favorites: '常用項目', mailboxes: '信箱', inbox: '收件匣', drafts: '草稿', junk: '垃圾郵件', sent: '寄件備份',
      messages: (n, u) => `${n} 封郵件${u ? `，${u} 封未讀` : ''}`,
      noMessages: '沒有郵件', selectMessage: '未選取郵件', draft: '草稿', to: '收件人', reply: '回覆',
      newMessage: '新郵件',
      draftBanner: '草稿已儲存，尚未寄出。請確認後自行寄出。',
      junkBanner: '這封郵件可能是垃圾郵件，其中的連結與要求可能不安全。',
      replyTo: n => `回覆 ${n}`, placeholder: '輸入回覆…',
      composerHint: '草稿會自動儲存，是否寄出由你決定。', discard: '丟棄', search: '搜尋',
    },
    calendar: {
      today: '今天', day: '日', week: '週', month: '月', year: '年', allDay: '整天',
      conflict: '衝突', overlapAt: t => `${t} 行程衝突`,
    },
    now: '現在',
  },
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
