// UI strings and prepared fallback lines for the agent track, per supported language.

import type { Lang } from '@shared/languages'

export type ConfirmOp =
  | 'mail_create_draft' | 'mail_send' | 'mail_reply' | 'mail_send_draft' | 'mail_trash' | 'mail_restore'
  | 'calendar_create_event' | 'calendar_delete_event' | 'reminder_create' | 'reminder_cancel'
  | 'slack_draft_reply' | 'slack_post' | 'discord_post'

export type PreviewFieldKey = 'to' | 'subject' | 'body' | 'title' | 'start' | 'end' | 'channel' | 'text' | 'at' | 'mail' | 'event'

export interface AgentStrings {
  suggestionTitle: string
  /** Card title for local, reversible changes. */
  writeTitle: string
  /** Card title for things that leave the user (send/post). */
  outboundTitle: string
  accept: string
  decline: string
  acceptWrite: string
  acceptOutbound: string
  /** Note under a write card. */
  writeNote: string
  /** Note under an outbound card. */
  outboundNote: string
  ops: Record<ConfirmOp, string>
  fields: Record<PreviewFieldKey, string>
  /** Spoken when the agent backend is unreachable, unconfigured or over budget. */
  fallbackLine: string
  /** Spoken when the task ran out of steps or produced nothing usable. */
  incompleteLine: string
  /** Spoken when the task finished but the model returned no text. */
  doneLine: string
  /** Card when the browser blocked a new tab the assistant wanted to open (web demo). */
  openTab: (host: string) => string
}

export const AGENT_STRINGS: Record<Lang, AgentStrings> = {
  'en': {
    suggestionTitle: 'Shall I take care of this?',
    writeTitle: 'Okay to do this?',
    outboundTitle: 'Okay to send this?',
    accept: 'Yes, please',
    decline: 'No thanks',
    acceptWrite: 'Do it',
    acceptOutbound: 'Send',
    writeNote: 'Stays on this computer and can be undone.',
    outboundNote: 'This will be sent as you right away.',
    ops: {
      mail_create_draft: 'Mail draft', mail_send: 'Send mail', mail_reply: 'Reply to mail', mail_send_draft: 'Send draft',
      mail_trash: 'Move mail to Trash', mail_restore: 'Restore mail', calendar_create_event: 'New calendar event',
      calendar_delete_event: 'Delete calendar event', reminder_create: 'New reminder', reminder_cancel: 'Cancel reminder',
      slack_draft_reply: 'Slack draft', slack_post: 'Post to Slack', discord_post: 'Post to Discord',
    },
    fields: { to: 'To', subject: 'Subject', body: 'Body', title: 'Title', start: 'Start', end: 'End', channel: 'Channel', text: 'Message', at: 'When', mail: 'Mail', event: 'Event' },
    fallbackLine: "Sorry, I can't reach my work tools right now. Could you try again in a moment?",
    incompleteLine: "Sorry, I couldn't finish that one.",
    doneLine: 'All done!',
    openTab: host => `Open ${host} in a new tab?`,
  },
  'ja': {
    suggestionTitle: 'これ、やっておこうか？',
    writeTitle: 'これ、やっていい？',
    outboundTitle: 'これ、送っていい？',
    accept: 'お願い',
    decline: 'いいえ',
    acceptWrite: 'やる',
    acceptOutbound: '送信',
    writeNote: 'このパソコンの中だけの変更で、元に戻せるよ。',
    outboundNote: 'あなたの名前ですぐに送られるよ。',
    ops: {
      mail_create_draft: 'メールの下書き', mail_send: 'メール送信', mail_reply: 'メールに返信', mail_send_draft: '下書きを送信',
      mail_trash: 'メールをゴミ箱へ', mail_restore: 'メールを元に戻す', calendar_create_event: '新しい予定',
      calendar_delete_event: '予定を削除', reminder_create: '新しいリマインダー', reminder_cancel: 'リマインダーを取り消す',
      slack_draft_reply: 'Slackの下書き', slack_post: 'Slackに投稿', discord_post: 'Discordに投稿',
    },
    fields: { to: '宛先', subject: '件名', body: '本文', title: 'タイトル', start: '開始', end: '終了', channel: 'チャンネル', text: 'メッセージ', at: '日時', mail: 'メール', event: '予定' },
    fallbackLine: 'ごめんね、今は作業ツールにつながらないみたい。少ししてからもう一回お願い！',
    incompleteLine: 'ごめんね、最後までできなかった。',
    doneLine: 'できたよ！',
    openTab: host => `${host} を新しいタブで開く？`,
  },
  'ko': {
    suggestionTitle: '이거 내가 해 둘까?',
    writeTitle: '이렇게 해도 될까?',
    outboundTitle: '이대로 보내도 될까?',
    accept: '부탁해',
    decline: '괜찮아',
    acceptWrite: '진행',
    acceptOutbound: '보내기',
    writeNote: '이 컴퓨터 안에서만 바뀌고, 되돌릴 수 있어.',
    outboundNote: '확인하면 네 이름으로 바로 보내져.',
    ops: {
      mail_create_draft: '메일 초안', mail_send: '메일 보내기', mail_reply: '메일 답장', mail_send_draft: '초안 보내기',
      mail_trash: '메일 휴지통으로', mail_restore: '메일 복원', calendar_create_event: '새 일정',
      calendar_delete_event: '일정 삭제', reminder_create: '새 알림', reminder_cancel: '알림 취소',
      slack_draft_reply: 'Slack 초안', slack_post: 'Slack에 올리기', discord_post: 'Discord에 올리기',
    },
    fields: { to: '받는 사람', subject: '제목', body: '본문', title: '제목', start: '시작', end: '종료', channel: '채널', text: '메시지', at: '시간', mail: '메일', event: '일정' },
    fallbackLine: '미안, 지금은 작업 도구에 연결이 안 돼. 조금 있다가 다시 부탁해!',
    incompleteLine: '미안, 끝까지 못 했어.',
    doneLine: '다 했어!',
    openTab: host => `${host} 새 탭에서 열까?`,
  },
  'zh-Hans': {
    suggestionTitle: '要我来处理这个吗？',
    writeTitle: '可以这样做吗？',
    outboundTitle: '可以发送吗？',
    accept: '好的',
    decline: '不用了',
    acceptWrite: '执行',
    acceptOutbound: '发送',
    writeNote: '只在这台电脑上更改，可以撤销。',
    outboundNote: '确认后会以你的名义立即发送。',
    ops: {
      mail_create_draft: '邮件草稿', mail_send: '发送邮件', mail_reply: '回复邮件', mail_send_draft: '发送草稿',
      mail_trash: '邮件移到废纸篓', mail_restore: '恢复邮件', calendar_create_event: '新日程',
      calendar_delete_event: '删除日程', reminder_create: '新提醒', reminder_cancel: '取消提醒',
      slack_draft_reply: 'Slack 草稿', slack_post: '发到 Slack', discord_post: '发到 Discord',
    },
    fields: { to: '收件人', subject: '主题', body: '正文', title: '标题', start: '开始', end: '结束', channel: '频道', text: '消息', at: '时间', mail: '邮件', event: '日程' },
    fallbackLine: '抱歉，现在连不上工作工具。请稍后再试一次。',
    incompleteLine: '抱歉，这件事我没能做完。',
    doneLine: '完成啦！',
    openTab: host => `在新标签页中打开 ${host}？`,
  },
  'zh-Hant': {
    suggestionTitle: '要我來處理這個嗎？',
    writeTitle: '可以這樣做嗎？',
    outboundTitle: '可以寄出嗎？',
    accept: '好啊',
    decline: '不用了',
    acceptWrite: '執行',
    acceptOutbound: '寄出',
    writeNote: '只在這台電腦上變更，可以復原。',
    outboundNote: '確認後會以你的名義立即送出。',
    ops: {
      mail_create_draft: '郵件草稿', mail_send: '寄送郵件', mail_reply: '回覆郵件', mail_send_draft: '寄出草稿',
      mail_trash: '郵件移到垃圾桶', mail_restore: '復原郵件', calendar_create_event: '新行程',
      calendar_delete_event: '刪除行程', reminder_create: '新提醒', reminder_cancel: '取消提醒',
      slack_draft_reply: 'Slack 草稿', slack_post: '發到 Slack', discord_post: '發到 Discord',
    },
    fields: { to: '收件人', subject: '主旨', body: '內文', title: '標題', start: '開始', end: '結束', channel: '頻道', text: '訊息', at: '時間', mail: '郵件', event: '行程' },
    fallbackLine: '抱歉，現在連不上工作工具。請稍後再試一次。',
    incompleteLine: '抱歉，這件事我沒能完成。',
    doneLine: '完成了！',
    openTab: host => `要在新分頁開啟 ${host} 嗎？`,
  },
}
