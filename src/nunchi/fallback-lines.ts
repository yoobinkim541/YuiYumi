// Prepared lines used when the observer API fails or the budget cap is reached (AC-8).
// Only used in reply to an utterance, and rate-limited by the caller.

import type { Emotion } from '@shared/contracts'
import type { Lang } from '@shared/languages'

export interface FallbackLine { emotion: Emotion, line: string }

export const FALLBACK_LINES: Record<Lang, FallbackLine[]> = {
  'en': [
    { emotion: 'sorry', line: "Sorry, I can't think clearly right now. Could you try again in a moment?" },
    { emotion: 'sorry', line: 'My connection is a bit shaky. I will be back soon!' },
    { emotion: 'thinking', line: "Hmm, I couldn't catch that properly. Let's try again shortly." },
  ],
  'ja': [
    { emotion: 'sorry', line: 'ごめんね、今ちょっと考えがまとまらないみたい。少ししてからもう一度お願いできる?' },
    { emotion: 'sorry', line: '接続が不安定みたい。すぐ戻るね!' },
    { emotion: 'thinking', line: 'うーん、うまく聞き取れなかったかも。もう少ししてから試してみよう。' },
  ],
  'ko': [
    { emotion: 'sorry', line: '미안해, 지금 잠깐 생각이 잘 안 돼. 조금 있다가 다시 말해 줄래?' },
    { emotion: 'sorry', line: '연결이 조금 불안정한가 봐. 금방 돌아올게!' },
    { emotion: 'thinking', line: '음, 제대로 못 알아들은 것 같아. 잠시 후에 다시 해 보자.' },
  ],
  'zh-Hans': [
    { emotion: 'sorry', line: '抱歉，我现在有点反应不过来。稍后再试一次好吗?' },
    { emotion: 'sorry', line: '网络好像不太稳定，我马上回来!' },
    { emotion: 'thinking', line: '嗯，我好像没听清楚。我们等一下再试试吧。' },
  ],
  'zh-Hant': [
    { emotion: 'sorry', line: '抱歉，我現在有點反應不過來。等一下再試一次好嗎?' },
    { emotion: 'sorry', line: '網路好像不太穩定，我馬上回來!' },
    { emotion: 'thinking', line: '嗯，我好像沒聽清楚。我們等一下再試試吧。' },
  ],
}

export const FALLBACK_MIN_INTERVAL_MS = 30_000

export function pickFallback(lang: Lang, seq: number): FallbackLine {
  const list = FALLBACK_LINES[lang] ?? FALLBACK_LINES.en
  return list[seq % list.length]!
}
