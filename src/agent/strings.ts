// UI strings and prepared fallback lines for the agent track, per supported language.

import type { Lang } from '@shared/languages'

export interface AgentStrings {
  suggestionTitle: string
  writeTitle: string
  accept: string
  decline: string
  acceptWrite: string
  draftOnlyNote: string
  ops: Record<'mail_create_draft' | 'calendar_create_event' | 'slack_draft_reply', string>
  fields: Record<'to' | 'subject' | 'body' | 'title' | 'start' | 'end' | 'channel' | 'text', string>
  /** Spoken when the agent backend is unreachable, unconfigured or over budget. */
  fallbackLine: string
  /** Spoken when the task ran out of steps or produced nothing usable. */
  incompleteLine: string
  /** Spoken when the task finished but the model returned no text. */
  doneLine: string
}

export const AGENT_STRINGS: Record<Lang, AgentStrings> = {
  'en': {
    suggestionTitle: 'Shall I take care of this?',
    writeTitle: 'Please confirm before I save this',
    accept: 'Yes, please',
    decline: 'No thanks',
    acceptWrite: 'Save',
    draftOnlyNote: 'Saved as a draft only. Nothing is sent.',
    ops: { mail_create_draft: 'Mail reply draft', calendar_create_event: 'New calendar event', slack_draft_reply: 'Slack reply draft' },
    fields: { to: 'To', subject: 'Subject', body: 'Body', title: 'Title', start: 'Start', end: 'End', channel: 'Channel', text: 'Message' },
    fallbackLine: "Sorry, I can't reach my work tools right now. Could you try again in a moment?",
    incompleteLine: "Sorry, I couldn't finish that one.",
    doneLine: 'All done!',
  },
  'ja': {
    suggestionTitle: 'これ、やっておきましょうか？',
    writeTitle: '保存する前に確認してください',
    accept: 'お願い',
    decline: 'いいえ',
    acceptWrite: '保存する',
    draftOnlyNote: '下書きとして保存するだけです。送信はしません。',
    ops: { mail_create_draft: 'メールの返信下書き', calendar_create_event: '新しい予定', slack_draft_reply: 'Slackの返信下書き' },
    fields: { to: '宛先', subject: '件名', body: '本文', title: 'タイトル', start: '開始', end: '終了', channel: 'チャンネル', text: 'メッセージ' },
    fallbackLine: 'ごめんなさい、今は作業ツールにつながりません。少ししてからもう一度お願いします。',
    incompleteLine: 'ごめんなさい、最後までできませんでした。',
    doneLine: 'できました！',
  },
  'ko': {
    suggestionTitle: '이거 제가 해 둘까요?',
    writeTitle: '저장하기 전에 확인해 주세요',
    accept: '부탁해',
    decline: '괜찮아',
    acceptWrite: '저장',
    draftOnlyNote: '초안으로만 저장해요. 발송하지 않아요.',
    ops: { mail_create_draft: '메일 답장 초안', calendar_create_event: '새 일정', slack_draft_reply: 'Slack 답장 초안' },
    fields: { to: '받는 사람', subject: '제목', body: '본문', title: '제목', start: '시작', end: '종료', channel: '채널', text: '메시지' },
    fallbackLine: '미안해요, 지금은 작업 도구에 연결할 수 없어요. 잠시 후에 다시 부탁해요.',
    incompleteLine: '미안해요, 끝까지 하지 못했어요.',
    doneLine: '다 했어요!',
  },
  'zh-Hans': {
    suggestionTitle: '要我来处理这个吗？',
    writeTitle: '保存前请确认',
    accept: '好的',
    decline: '不用了',
    acceptWrite: '保存',
    draftOnlyNote: '只保存为草稿，不会发送。',
    ops: { mail_create_draft: '邮件回复草稿', calendar_create_event: '新日程', slack_draft_reply: 'Slack 回复草稿' },
    fields: { to: '收件人', subject: '主题', body: '正文', title: '标题', start: '开始', end: '结束', channel: '频道', text: '消息' },
    fallbackLine: '抱歉，现在连不上工作工具。请稍后再试一次。',
    incompleteLine: '抱歉，这件事我没能做完。',
    doneLine: '完成啦！',
  },
  'zh-Hant': {
    suggestionTitle: '要我來處理這個嗎？',
    writeTitle: '儲存前請確認',
    accept: '好啊',
    decline: '不用了',
    acceptWrite: '儲存',
    draftOnlyNote: '只會儲存為草稿，不會寄出。',
    ops: { mail_create_draft: '郵件回覆草稿', calendar_create_event: '新行程', slack_draft_reply: 'Slack 回覆草稿' },
    fields: { to: '收件人', subject: '主旨', body: '內文', title: '標題', start: '開始', end: '結束', channel: '頻道', text: '訊息' },
    fallbackLine: '抱歉，現在連不上工作工具。請稍後再試一次。',
    incompleteLine: '抱歉，這件事我沒能完成。',
    doneLine: '完成了！',
  },
}
