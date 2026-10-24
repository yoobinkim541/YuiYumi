// Small labels for things the assistant does inside the desktop apps (sent marker, typing).

import { computed } from 'vue'
import type { Lang } from '@shared/languages'
import { useSettings } from '@/stores/settings'

export interface AssistantMarks {
  /** Marker on messages the assistant sent or posted for the user. */
  via: string
  /** Shown on the composer while the assistant types. */
  typing: string
  sentBanner: string
  trashBanner: string
  original: string
  restore: string
  today: string
}

const MARKS: Record<Lang, AssistantMarks> = {
  'en': { via: 'sent with YuiYumi', typing: 'YuiYumi is typing…', sentBanner: 'Sent with YuiYumi on your request.', trashBanner: 'In Trash. You can restore it.', original: 'Original message', restore: 'Restore', today: 'Today' },
  'ja': { via: 'YuiYumi で送信', typing: 'YuiYumi が入力中…', sentBanner: 'あなたの依頼で YuiYumi が送信しました。', trashBanner: 'ゴミ箱にあります。元に戻せます。', original: '元のメッセージ', restore: '元に戻す', today: '今日' },
  'ko': { via: 'YuiYumi로 보냄', typing: 'YuiYumi가 입력 중…', sentBanner: '요청에 따라 YuiYumi가 보낸 메일이에요.', trashBanner: '휴지통에 있어요. 복원할 수 있어요.', original: '원본 메일', restore: '복원', today: '오늘' },
  'zh-Hans': { via: '由 YuiYumi 发送', typing: 'YuiYumi 正在输入…', sentBanner: '应你的请求由 YuiYumi 发送。', trashBanner: '在废纸篓中，可以恢复。', original: '原始邮件', restore: '恢复', today: '今天' },
  'zh-Hant': { via: '由 YuiYumi 傳送', typing: 'YuiYumi 正在輸入…', sentBanner: '依你的要求由 YuiYumi 寄出。', trashBanner: '在垃圾桶中，可以復原。', original: '原始郵件', restore: '復原', today: '今天' },
}

export function useAssistantMarks() {
  const settings = useSettings()
  return computed(() => MARKS[settings.lang] ?? MARKS.en)
}
