// Built-in voice lines: short prepared lines per character, language and category, spoken
// from pre-generated clips (public/voice/<character>/<lang>/<id>.mp3, built by
// `pnpm voices`) so they play instantly and still work when live TTS is down.
// Text may carry ElevenLabs audio tags ("[giggles]"); they shape the clip and are hidden in
// the bubble. A line may give separate spoken text ({ text, speak }): some Traditional
// Chinese lines are voiced from Simplified characters, which the TTS model never reads with
// Japanese readings. A clip id is "<category>-<n>" (1-based position), so reordering a list
// regenerates its clips. Pure data and helpers; scripts/build-voice-lines.mjs imports this
// file directly, so it must keep type-only imports.

import type { Emotion } from '@shared/contracts'
import type { Lang } from '@shared/languages'
import type { CharacterId } from '@/character/models'

export const BUILTIN_CATEGORIES = [
  'petFast', 'petSlow', 'poke',
  'ack', 'done', 'confirm', 'confirmSend', 'reminder',
  'offline', 'agentOffline', 'incomplete',
  'wake', 'filler',
  'greetMorning', 'greetAfternoon', 'greetEvening', 'greetNight',
  'switch', 'move',
] as const
export type BuiltinCategory = (typeof BUILTIN_CATEGORIES)[number]

export interface CategoryInfo {
  /** Reaction (face, motion) shown with the line; none leaves the face to its caller. */
  emotion?: Emotion
  /** Shown in the speech bubble. Fillers are not: the typing dots are already there. */
  bubble: boolean
  /** The next line waits for this clip to end instead of cutting it. */
  hold: boolean
}

export const CATEGORY_INFO: Record<BuiltinCategory, CategoryInfo> = {
  petFast: { bubble: true, hold: true },
  petSlow: { bubble: true, hold: true },
  poke: { bubble: true, hold: true },
  ack: { emotion: 'happy', bubble: true, hold: true },
  done: { emotion: 'happy', bubble: true, hold: true },
  confirm: { bubble: true, hold: true },
  confirmSend: { bubble: true, hold: true },
  reminder: { emotion: 'surprised', bubble: true, hold: true },
  offline: { emotion: 'sorry', bubble: true, hold: false },
  agentOffline: { emotion: 'sorry', bubble: true, hold: false },
  incomplete: { emotion: 'sorry', bubble: true, hold: false },
  wake: { emotion: 'happy', bubble: true, hold: true },
  filler: { bubble: false, hold: false },
  greetMorning: { emotion: 'happy', bubble: true, hold: false },
  greetAfternoon: { emotion: 'happy', bubble: true, hold: false },
  greetEvening: { emotion: 'happy', bubble: true, hold: false },
  greetNight: { emotion: 'happy', bubble: true, hold: false },
  switch: { emotion: 'happy', bubble: true, hold: false },
  move: { emotion: 'happy', bubble: true, hold: true },
}

/** A line, or shown text plus the text sent to TTS when they differ. */
type LineEntry = string | { text: string, speak: string }
type LineTable = Record<BuiltinCategory, readonly LineEntry[]>

export const BUILTIN_LINES: Record<CharacterId, Record<Lang, LineTable>> = {
  // Yumi: bright, bouncy, a little mischievous.
  tt2: {
    'ko': {
      petFast: [
        '[giggles] 아잇, 간지러워! 살살 해 줘~',
        '[laughs] 으앗, 머리 다 헝클어진다구!',
        '히익! 너무 세게 쓰다듬잖아! [giggles]',
        '[giggles] 그만그만, 어지러워어~',
        '야아, 나 강아지 아니거든? [laughs]',
        '[laughs] 아하하, 알았어 알았어! 항복!',
      ],
      petSlow: ['[happy] 헤헤, 기분 좋다아~', '으음~ 이거 좋아. 조금만 더 해 줘.', '[giggles] 쓰담쓰담 받으니까 힘이 난다!'],
      poke: ['앗, 왜 콕콕 찔러!', '[giggles] 간지러! 나 일하는 중이라구~', '뭐야뭐야, 나 불렀어?', '자꾸 찌르면 나도 찌를 거다?'],
      ack: ['알겠어! 바로 해 볼게!', '오케이, 맡겨 줘!', '좋아, 금방 처리해 줄게!', '접수 완료! 잠깐만 기다려 줘.'],
      done: ['짠! 다 했어!', '끝! 생각보다 금방이었지?', '다 됐어! 확인해 봐~'],
      confirm: ['이렇게 해도 될지 한 번 봐 줄래?', '여기 확인해 주면 바로 할게!'],
      confirmSend: ['보내기 전에 한 번만 확인해 줘!', '이대로 보내도 될까? 확인 눌러 주면 보낼게.'],
      reminder: ['띵동! 시간 됐어!', '앗, 알림 시간이야!', '잊지 마! 지금이야!'],
      offline: [
        '미안, 지금 잠깐 머리가 하얘졌어. 조금 있다가 다시 말해 줄래?',
        '연결이 좀 불안한가 봐. 금방 돌아올게!',
        '음, 제대로 못 들은 것 같아. 잠시 후에 다시 해 보자!',
      ],
      agentOffline: ['미안, 지금은 작업 도구에 연결이 안 돼. 조금 있다가 다시 부탁해!', '으앗, 도구가 말을 안 들어. 잠시 뒤에 다시 해 볼게!'],
      incomplete: ['미안, 끝까지 못 했어.', '으으, 이건 마무리를 못 했어. 미안해!'],
      wake: ['응? 나 불렀어?', '왔다! 다시 같이 보자!', '[excited] 기다렸지? 나 깼어!'],
      filler: ['음..', '어디 보자..', '잠깐만..'],
      greetMorning: ['좋은 아침! 오늘도 같이 힘내 보자!', '[excited] 굿모닝! 커피는 마셨어?'],
      greetAfternoon: ['왔구나! 오후도 신나게 가 보자!', '점심은 먹었어? 이제 슬슬 시작해 볼까?'],
      greetEvening: ['저녁이다! 오늘 하루 수고 많았어!', '왔어? 남은 일 후딱 끝내 버리자!'],
      greetNight: ['이 시간까지 일하는 거야? 무리하지 마!', '[whispers] 밤이니까 조용히 도와줄게.'],
      switch: ['유미 등장! 이제 내가 같이 할게!', '짜잔, 유미야! 잘 부탁해!'],
      move: ['알겠어, 옆으로 쏙 비켜 줄게!', '앗, 가렸어? 저쪽으로 갈게!'],
    },
    'ja': {
      petFast: [
        '[giggles] ひゃっ、くすぐったい！やさしくして～',
        '[laughs] わわっ、髪がぐちゃぐちゃになっちゃう！',
        'ひえっ、速すぎだってば！[giggles]',
        '[giggles] ストップストップ、目が回る～',
        'もう、わたし子犬じゃないよ？[laughs]',
        '[laughs] あはは、わかったわかった！降参！',
      ],
      petSlow: ['[happy] えへへ、気持ちいい～', 'んー、これ好き。もうちょっとだけ。', '[giggles] なでなでされると元気出る！'],
      poke: ['あっ、なんでつつくの！', '[giggles] くすぐったい！今お仕事中だよ～', 'なになに、呼んだ？', 'つつくなら、わたしもつつき返すよ？'],
      ack: ['わかった！すぐやるね！', 'オッケー、まかせて！', 'よーし、ぱぱっと片づけちゃうね！', '了解！ちょっと待っててね。'],
      done: ['じゃーん！できたよ！', 'おわり！思ったより早かったでしょ？', 'できた！見てみて～'],
      confirm: ['これでいいか、ちょっと見てくれる？', 'ここ確認してくれたら、すぐやるね！'],
      confirmSend: ['送る前に一回だけ確認してね！', 'このまま送っていい？確認したら送るよ。'],
      reminder: ['ピンポーン！時間だよ！', 'あっ、リマインダーの時間！', '忘れないでね、今だよ！'],
      offline: [
        'ごめんね、今ちょっと頭が真っ白になっちゃった。少ししてからもう一回言ってくれる？',
        '接続がちょっと不安定みたい。すぐ戻るね！',
        'うーん、うまく聞き取れなかったかも。少ししてからもう一回やってみよう！',
      ],
      agentOffline: ['ごめん、今は作業ツールにつながらないの。少ししてからもう一回お願い！', 'うう、ツールが言うこと聞かない。ちょっとしたらまたやってみるね！'],
      incomplete: ['ごめんね、最後までできなかった。', 'うう、これは仕上げられなかった。ごめん！'],
      wake: ['ん？わたし呼んだ？', 'おまたせ！また一緒に見よう！', '[excited] 待ってた？起きたよ！'],
      filler: ['えっと…', 'んー…', 'ちょっと待ってね…'],
      greetMorning: ['おはよう！今日も一緒にがんばろう！', '[excited] おはよ！コーヒーはもう飲んだ？'],
      greetAfternoon: ['来た来た！午後も元気にいこう！', 'お昼ごはん食べた？そろそろ始めよっか？'],
      greetEvening: ['もう夕方だね！今日もおつかれさま！', 'おかえり！残りの仕事、さっさと終わらせちゃお！'],
      greetNight: ['こんな時間までお仕事？無理しないでね！', '[whispers] 夜だから、こっそり手伝うね。'],
      switch: ['ユミ登場！ここからはわたしにまかせて！', 'じゃーん、ユミだよ！よろしくね！'],
      move: ['わかった、すっと横によけるね！', 'あっ、じゃまだった？あっちに行くね！'],
    },
    'en': {
      petFast: [
        '[giggles] Hey, that tickles! Gentle, gentle!',
        "[laughs] Whoa, you're messing up my hair!",
        "Eek! That's way too fast! [giggles]",
        "[giggles] Stop, stop, I'm getting dizzy!",
        "Hey, I'm not a puppy, you know! [laughs]",
        '[laughs] Okay, okay, I give up!',
      ],
      petSlow: ['[happy] Hehe, that feels nice.', 'Mmm, I like this. Just a little more?', '[giggles] Head pats give me energy!'],
      poke: ['Hey, why are you poking me?', "[giggles] That tickles! I'm working here!", 'What, what? Did you call me?', "Poke me again and I'll poke back!"],
      ack: ['Got it! On it!', 'Okay, leave it to me!', "Sure, I'll have it done in a sec!", 'Roger that! Give me a moment.'],
      done: ['Ta-da! All done!', 'Done! That was quick, right?', 'Finished! Take a look!'],
      confirm: ['Can you check if this looks right?', "Give it a check and I'll go ahead!"],
      confirmSend: ['Check it once before I send it!', 'Okay to send it like this? Just say the word.'],
      reminder: ["Ding dong! It's time!", "Oh! Your reminder's up!", "Don't forget, it's time now!"],
      offline: [
        'Sorry, my head went blank for a second. Could you say that again in a bit?',
        "My connection's a little shaky. I'll be right back!",
        "Hmm, I didn't quite catch that. Let's try again in a moment!",
      ],
      agentOffline: ["Sorry, I can't reach my work tools right now. Ask me again in a bit!", "Ugh, my tools aren't answering. I'll try again soon!"],
      incomplete: ["Sorry, I couldn't finish that one.", "Argh, I couldn't wrap that up. Sorry!"],
      wake: ['Hm? Did you call me?', "I'm back! Let's keep going!", "[excited] Missed me? I'm awake!"],
      filler: ['Hmm...', "Let's see...", 'Just a sec...'],
      greetMorning: ["Good morning! Let's do our best today!", '[excited] Morning! Had your coffee yet?'],
      greetAfternoon: ["There you are! Let's have a fun afternoon!", 'Had lunch? Shall we get going?'],
      greetEvening: ['Evening already! You worked hard today!', "Hey! Let's knock out the rest real quick!"],
      greetNight: ["Still working this late? Don't push yourself!", "[whispers] It's night, so I'll help quietly."],
      switch: ["Yumi's here! I'll take it from here!", "Ta-da, it's Yumi! Nice to see you!"],
      move: ["Sure, I'll scoot out of the way!", "Oops, was I in the way? I'll move over there!"],
    },
    'zh-Hans': {
      petFast: [
        '[giggles] 哎呀，好痒！轻一点嘛～',
        '[laughs] 哇，头发都要被你弄乱啦！',
        '咿！太快了啦！[giggles]',
        '[giggles] 停停停，我要晕啦～',
        '喂，我又不是小狗！[laughs]',
        '[laughs] 哈哈，好啦好啦，我投降！',
      ],
      petSlow: ['[happy] 嘿嘿，好舒服～', '嗯～我喜欢这样，再摸一下下嘛。', '[giggles] 被摸摸头就有精神啦！'],
      poke: ['啊，干嘛戳我！', '[giggles] 好痒！我在工作啦～', '什么什么，你叫我？', '再戳我，我也要戳回去哦？'],
      ack: ['好嘞！马上去办！', 'OK，交给我吧！', '好，一下子就搞定！', '收到！稍等我一下哦。'],
      done: ['锵锵！搞定啦！', '完成！比想象中快吧？', '好啦！快来看看～'],
      confirm: ['这样做可以吗？帮我看一眼嘛。', '你确认一下，我马上就做！'],
      confirmSend: ['发送之前，先帮我确认一下哦！', '就这样发出去可以吗？你确认我就发。'],
      reminder: ['叮咚！时间到啦！', '啊，提醒的时间到了！', '别忘了哦，就是现在！'],
      offline: ['抱歉，我脑袋刚刚一片空白。等一下再跟我说一次好吗？', '网络好像有点不稳定，我马上回来！', '嗯，我好像没听清楚。我们等一下再试试吧！'],
      agentOffline: ['抱歉，现在连不上工作工具。等一下再找我吧！', '呜，工具不听话了。我过一会儿再试试！'],
      incomplete: ['抱歉，我没能做完。', '呜，这个没收好尾，对不起！'],
      wake: ['嗯？你叫我吗？', '我回来啦！继续一起看吧！', '[excited] 等我很久了吧？我醒啦！'],
      filler: ['嗯…', '我看看…', '等一下哦…'],
      greetMorning: ['早安！今天也一起加油吧！', '[excited] 早呀！咖啡喝了没？'],
      greetAfternoon: ['你来啦！下午也元气满满吧！', '午饭吃了吗？差不多开始吧？'],
      greetEvening: ['到傍晚啦！今天辛苦了！', '你来啦！剩下的事情一口气做完吧！'],
      greetNight: ['这么晚还在工作吗？别太勉强哦！', '[whispers] 晚上了，我悄悄帮你。'],
      switch: ['由美登场！接下来交给我吧！', '锵锵，我是由美！请多关照！'],
      move: ['好，我马上让开！', '啊，挡到你了吗？我去那边！'],
    },
    'zh-Hant': {
      petFast: [
        '[giggles] 哎呀，好癢！輕一點嘛～',
        '[laughs] 哇，頭髮都要被你弄亂啦！',
        '咿！太快了啦！[giggles]',
        '[giggles] 停停停，我要暈啦～',
        '喂，我又不是小狗！[laughs]',
        '[laughs] 哈哈，好啦好啦，我投降！',
      ],
      petSlow: ['[happy] 嘿嘿，好舒服～', '嗯～我喜歡這樣，再摸一下下嘛。', '[giggles] 被摸摸頭就有精神啦！'],
      poke: [{ text: '啊，幹嘛戳我！', speak: '啊，干嘛戳我！' }, '[giggles] 好癢！我在工作啦～', '什麼什麼，你叫我？', '再戳我，我也要戳回去喔？'],
      ack: ['好喔！馬上去辦！', 'OK，交給我吧！', '好，一下子就搞定！', '收到！稍等我一下喔。'],
      done: [{ text: '鏘鏘！搞定啦！', speak: '锵锵！搞定啦！' }, '完成！比想像中快吧？', '好啦！快來看看～'],
      confirm: ['這樣做可以嗎？幫我看一眼嘛。', '你確認一下，我馬上就做！'],
      confirmSend: ['寄出之前，先幫我確認一下喔！', '就這樣送出去可以嗎？你確認我就送。'],
      reminder: [{ text: '叮咚！時間到囉！', speak: '叮咚！时间到啰！' }, '啊，提醒的時間到了！', '別忘了喔，就是現在！'],
      offline: ['抱歉，我腦袋剛剛一片空白。等一下再跟我說一次好嗎？', '網路好像有點不穩定，我馬上回來！', '嗯，我好像沒聽清楚。我們等一下再試試吧！'],
      agentOffline: ['抱歉，現在連不上工作工具。等一下再找我吧！', '嗚，工具不聽話了。我過一會兒再試試！'],
      incomplete: ['抱歉，我沒能做完。', { text: '嗚，這個沒收好尾，對不起！', speak: '呜，这个没收好尾，对不起！' }],
      wake: ['嗯？你叫我嗎？', '我回來囉！繼續一起看吧！', '[excited] 等我很久了吧？我醒囉！'],
      filler: ['嗯…', '我看看…', '等一下喔…'],
      greetMorning: ['早安！今天也一起加油吧！', '[excited] 早呀！咖啡喝了沒？'],
      greetAfternoon: ['你來啦！下午也元氣滿滿吧！', '午餐吃了嗎？差不多開始吧？'],
      greetEvening: ['到傍晚囉！今天辛苦了！', '你來啦！剩下的事情一口氣做完吧！'],
      greetNight: ['這麼晚還在工作嗎？別太勉強喔！', '[whispers] 晚上了，我偷偷幫你。'],
      switch: [{ text: '由美登場！接下來交給我吧！', speak: '由美登场！接下来交给我吧！' }, { text: '鏘鏘，我是由美！請多指教！', speak: '锵锵，我是由美！请多指教！' }],
      move: ['好，我馬上讓開！', '啊，擋到你了嗎？我去那邊！'],
    },
  },

  // Yui: gentle, calm, a little softer and slower.
  yui: {
    'ko': {
      petFast: [
        '[giggles] 앗, 간지러워… 조금만 살살 해 줘.',
        '[laughs softly] 머리 다 엉키겠다, 응?',
        '으앗, 너무 빨라… [giggles] 어지러워.',
        '[giggles] 후후, 장난꾸러기네.',
        '잠깐잠깐, 귀까지 눌렸어! [laughs]',
        '[laughs softly] 그렇게 하면 나 일을 못 하잖아.',
      ],
      petSlow: ['[happy] 후후, 기분 좋아.', '응… 따뜻하다. 고마워.', '이러니까 마음이 편해지네.'],
      poke: ['응? 왜 그래?', '[giggles] 콕콕 찌르면 간지러워.', '나 여기 있어. 무슨 일 있어?', '자꾸 그러면 나 삐진다?'],
      ack: ['응, 알겠어. 바로 해 줄게.', '좋아, 내가 챙겨 볼게.', '맡겨 줘. 금방 할게.', '알겠어, 잠깐만 기다려 줘.'],
      done: ['다 했어. 한번 확인해 줄래?', '끝났어. 수고했어.', '응, 정리해 뒀어.'],
      confirm: ['이렇게 해도 괜찮은지 봐 줄래?', '확인해 주면 그대로 할게.'],
      confirmSend: ['보내기 전에 한 번만 같이 확인하자.', '이대로 보내도 괜찮을까?'],
      reminder: ['시간 됐어. 잊지 않게 알려 줄게.', '있잖아, 지금 할 시간이야.', '알림 울렸어. 천천히 준비하자.'],
      offline: [
        '미안, 지금 생각이 잘 안 정리돼. 조금 있다가 다시 말해 줄래?',
        '연결이 조금 불안정한가 봐. 곧 돌아올게.',
        '음, 잘 못 알아들은 것 같아. 잠시 후에 다시 해 보자.',
      ],
      agentOffline: ['미안, 지금은 작업 도구에 연결이 안 돼. 조금 있다가 다시 부탁해.', '도구가 잠깐 응답이 없네. 조금 뒤에 다시 해 볼게.'],
      incomplete: ['미안, 끝까지 못 했어.', '여기까지밖에 못 했어. 미안해.'],
      wake: ['응, 나 여기 있어.', '다시 왔어. 같이 보자.', '불렀어? 이제 다시 볼게.'],
      filler: ['음…', '어디 보자…', '잠깐만…'],
      greetMorning: ['좋은 아침. 오늘도 천천히 같이 해 보자.', '잘 잤어? 오늘 일정부터 같이 볼까?'],
      greetAfternoon: ['왔구나. 오후도 무리하지 말고 하자.', '점심은 챙겨 먹었어? 이제 시작해 볼까?'],
      greetEvening: ['오늘 하루 수고 많았어. 남은 것만 같이 정리하자.', '저녁이네. 조금만 더 힘내자.'],
      greetNight: ['늦은 시간이네. 너무 무리하지 마.', '[softly] 밤이니까 조용히 옆에 있을게.'],
      switch: ['유이야. 이제 내가 옆에 있을게.', '안녕, 유이야. 천천히 같이 해 보자.'],
      move: ['응, 옆으로 비켜 줄게.', '가렸구나. 저쪽으로 갈게.'],
    },
    'ja': {
      petFast: [
        '[giggles] あっ、くすぐったい…もう少しやさしくね。',
        '[laughs softly] 髪がからまっちゃうよ？',
        'わっ、速すぎ…[giggles] 目が回っちゃう。',
        '[giggles] ふふ、いたずらっ子だね。',
        '待って待って、耳までつぶれちゃった！[laughs]',
        '[laughs softly] そんなにされたら、お仕事できないよ。',
      ],
      petSlow: ['[happy] ふふ、気持ちいい。', 'うん…あったかいね。ありがとう。', 'こうしてると、落ち着くね。'],
      poke: ['ん？どうしたの？', '[giggles] つつかれるとくすぐったいよ。', 'ここにいるよ。何かあった？', 'そんなにつつくと、すねちゃうよ？'],
      ack: ['うん、わかった。すぐやるね。', 'いいよ、わたしが見ておくね。', 'まかせて。すぐ終わるよ。', 'わかった、少し待っててね。'],
      done: ['できたよ。確認してくれる？', '終わったよ。おつかれさま。', 'うん、まとめておいたよ。'],
      confirm: ['これで大丈夫か、見てくれる？', '確認してくれたら、そのとおりにやるね。'],
      confirmSend: ['送る前に、一緒に一度確認しよう。', 'このまま送っても大丈夫？'],
      reminder: ['時間だよ。忘れないように知らせるね。', 'ねえ、今やる時間だよ。', 'リマインダーの時間だよ。ゆっくり準備してね。'],
      offline: [
        'ごめんね、今うまく考えがまとまらないの。少ししてからもう一度言ってくれる？',
        '接続が少し不安定みたい。すぐ戻るね。',
        'うーん、うまく聞き取れなかったみたい。少ししてからもう一度やってみよう。',
      ],
      agentOffline: ['ごめんね、今は作業ツールにつながらないの。少ししてからもう一度お願いね。', 'ツールが少し応答しないみたい。あとでもう一度やってみるね。'],
      incomplete: ['ごめんね、最後までできなかった。', 'ここまでしかできなかったの。ごめんね。'],
      wake: ['うん、ここにいるよ。', '戻ったよ。また一緒に見よう。', '呼んだ？また見ているね。'],
      filler: ['えっと…', 'うーん…', 'ちょっと待ってね…'],
      greetMorning: ['おはよう。今日もゆっくり一緒にがんばろう。', 'よく眠れた？まず今日の予定から見てみよっか。'],
      greetAfternoon: ['来てくれたね。午後も無理しないでいこう。', 'お昼はちゃんと食べた？そろそろ始めよっか。'],
      greetEvening: ['今日もおつかれさま。残りだけ一緒に片づけよう。', 'もう夕方だね。あと少しだけがんばろう。'],
      greetNight: ['もう遅い時間だね。無理しないでね。', '[softly] 夜だから、静かにそばにいるね。'],
      switch: ['ユイだよ。これからはわたしがそばにいるね。', 'こんにちは、ユイだよ。ゆっくり一緒にやろうね。'],
      move: ['うん、横によけるね。', 'じゃまだったね。あっちに行くね。'],
    },
    'en': {
      petFast: [
        '[giggles] Ah, that tickles... a little gentler, please.',
        "[laughs softly] My hair's going to get all tangled, you know.",
        "Oh, that's so fast... [giggles] I'm getting dizzy.",
        "[giggles] Hehe, you're such a troublemaker.",
        'Wait, wait, you squished my ears! [laughs]',
        "[laughs softly] I can't get any work done like this.",
      ],
      petSlow: ['[happy] Hehe, that feels nice.', "Mm... that's warm. Thank you.", 'This makes me feel so calm.'],
      poke: ['Hm? What is it?', '[giggles] Poking tickles, you know.', "I'm right here. Is something up?", "Keep that up and I'll sulk, okay?"],
      ack: ["Okay, I'll do it right away.", "Alright, I'll take care of it.", "Leave it to me. It won't take long.", 'Got it, just give me a moment.'],
      done: ['All done. Want to take a look?', 'Finished. Nice work.', "There, it's all sorted."],
      confirm: ['Could you check if this is okay?', "Once you confirm, I'll do it just like this."],
      confirmSend: ["Let's check it together before it goes out.", 'Is it okay to send it like this?'],
      reminder: ["It's time. I didn't want you to forget.", "Hey, it's time for this now.", "Your reminder's here. No rush, get ready."],
      offline: [
        "Sorry, I can't quite gather my thoughts right now. Could you tell me again in a bit?",
        "The connection seems a little unstable. I'll be back soon.",
        "Hmm, I don't think I caught that. Let's try again in a moment.",
      ],
      agentOffline: ["Sorry, I can't reach my work tools right now. Please ask me again in a bit.", "My tools aren't responding for now. I'll try again a little later."],
      incomplete: ["Sorry, I couldn't finish it.", "I only got this far. I'm sorry."],
      wake: ["Yes, I'm here.", "I'm back. Let's keep watching together.", "Did you call? I'll keep an eye out again."],
      filler: ['Hmm...', 'Let me see...', 'Just a moment...'],
      greetMorning: ["Good morning. Let's take today one step at a time.", "Sleep well? Shall we look at today's schedule first?"],
      greetAfternoon: ["There you are. Let's not overdo it this afternoon.", 'Did you have lunch? Shall we get started?'],
      greetEvening: ["You worked hard today. Let's tidy up what's left together.", "It's evening already. Just a little more."],
      greetNight: ["It's getting late. Please don't push yourself.", "[softly] It's night, so I'll stay quietly by your side."],
      switch: ["It's Yui. I'll be right here with you now.", "Hi, it's Yui. Let's take it easy together."],
      move: ["Sure, I'll move aside.", "Was I in the way? I'll go over there."],
    },
    'zh-Hans': {
      petFast: [
        '[giggles] 啊，好痒…轻一点好不好。',
        '[laughs softly] 头发都要打结了哦。',
        '哇，太快了…[giggles] 我要晕了。',
        '[giggles] 呵呵，你真调皮。',
        '等等等等，耳朵都被压扁了！[laughs]',
        '[laughs softly] 这样我可没办法工作啦。',
      ],
      petSlow: ['[happy] 呵呵，好舒服。', '嗯…好温暖，谢谢你。', '这样待着，心里好安稳。'],
      poke: ['嗯？怎么啦？', '[giggles] 被戳会痒的啦。', '我在这里哦，有什么事吗？', '再戳的话，我要闹别扭了哦？'],
      ack: ['嗯，知道了，我马上做。', '好，我来处理。', '交给我吧，很快就好。', '知道了，稍等我一下。'],
      done: ['做好了，你看一下好吗？', '完成了，辛苦啦。', '嗯，都整理好了。'],
      confirm: ['这样可以吗？帮我看一下好吗？', '你确认之后，我就照这样做。'],
      confirmSend: ['发送前，我们一起再确认一次吧。', '就这样发出去可以吗？'],
      reminder: ['时间到了，提醒你一下别忘了。', '嘿，现在该做这件事了。', '提醒的时间到了，慢慢准备就好。'],
      offline: ['抱歉，我现在有点理不清思路。等一下再跟我说一次好吗？', '网络好像不太稳定，我很快回来。', '嗯，我好像没听清楚。我们等一下再试试吧。'],
      agentOffline: ['抱歉，现在连不上工作工具。请稍后再交给我吧。', '工具暂时没有回应，我等一下再试试。'],
      incomplete: ['抱歉，我没能做完。', '只做到这里了，对不起。'],
      wake: ['嗯，我在这里。', '我回来了，一起看吧。', '你叫我吗？我会继续看着的。'],
      filler: ['嗯…', '我看看…', '稍等一下…'],
      greetMorning: ['早安。今天也慢慢一起努力吧。', '睡得好吗？先一起看看今天的日程吧？'],
      greetAfternoon: ['你来啦。下午也别太勉强哦。', '午饭有好好吃吗？我们开始吧？'],
      greetEvening: ['今天辛苦了。剩下的一起整理吧。', '已经傍晚了呢。再加把劲就好。'],
      greetNight: ['已经很晚了，别太勉强自己哦。', '[softly] 晚上了，我会静静陪在你身边。'],
      switch: ['我是由依。接下来我会陪在你身边。', '你好，我是由依。我们慢慢一起做吧。'],
      move: ['好，我让开一点。', '挡到你了吧，我去那边。'],
    },
    'zh-Hant': {
      petFast: [
        '[giggles] 啊，好癢…輕一點好不好。',
        '[laughs softly] 頭髮都要打結了喔。',
        '哇，太快了…[giggles] 我要暈了。',
        '[giggles] 呵呵，你真調皮。',
        '等等等等，耳朵都被壓扁了！[laughs]',
        '[laughs softly] 這樣我可沒辦法工作啦。',
      ],
      petSlow: ['[happy] 呵呵，好舒服。', '嗯…好溫暖，謝謝你。', '這樣待著，心裡好安穩。'],
      poke: ['嗯？怎麼啦？', '[giggles] 被戳會癢的啦。', '我在這裡喔，有什麼事嗎？', '再戳的話，我要鬧彆扭了喔？'],
      ack: ['嗯，知道了，我馬上做。', '好，我來處理。', '交給我吧，很快就好。', '知道了，稍等我一下。'],
      done: ['做好了，你看一下好嗎？', { text: '完成了，辛苦囉。', speak: '完成了，辛苦啰。' }, '嗯，都整理好了。'],
      confirm: ['這樣可以嗎？幫我看一下好嗎？', '你確認之後，我就照這樣做。'],
      confirmSend: ['寄出前，我們一起再確認一次吧。', '就這樣送出去可以嗎？'],
      reminder: ['時間到了，提醒你一下別忘了。', '嘿，現在該做這件事了。', '提醒的時間到了，慢慢準備就好。'],
      offline: ['抱歉，我現在有點理不清思緒。等一下再跟我說一次好嗎？', '網路好像不太穩定，我很快回來。', '嗯，我好像沒聽清楚。我們等一下再試試吧。'],
      agentOffline: ['抱歉，現在連不上工作工具。請稍後再交給我吧。', '工具暫時沒有回應，我等一下再試試。'],
      incomplete: ['抱歉，我沒能完成。', '只做到這裡了，對不起。'],
      wake: ['嗯，我在這裡。', '我回來了，一起看吧。', { text: '你叫我嗎？我會繼續看著的。', speak: '你叫我吗？我会继续看着的。' }],
      filler: ['嗯…', '我看看…', '稍等一下…'],
      greetMorning: ['早安。今天也慢慢一起努力吧。', '睡得好嗎？先一起看看今天的行程吧？'],
      greetAfternoon: ['你來啦。下午也別太勉強喔。', '午餐有好好吃嗎？我們開始吧？'],
      greetEvening: ['今天辛苦了。剩下的一起整理吧。', '已經傍晚了呢。再加把勁就好。'],
      greetNight: ['已經很晚了，別太勉強自己喔。', '[softly] 晚上了，我會靜靜陪在你身邊。'],
      switch: ['我是由依。接下來我會陪在你身邊。', '你好，我是由依。我們慢慢一起做吧。'],
      move: ['好，我讓開一點。', '擋到你了吧，我去那邊。'],
    },
  },
}

// ---------------------------------------------------------------------------
// Helpers

export interface BuiltinLine {
  character: CharacterId
  lang: Lang
  category: BuiltinCategory
  /** "<category>-<n>"; also the clip file name. */
  id: string
  /** Text sent to TTS, audio tags included (also what the manifest records). */
  text: string
  /** Text shown in the bubble (tags removed); empty for a pure noise. */
  display: string
}

const AUDIO_TAG = /\[[a-z][a-z ]*\]/gi

/** Removes audio tags and the spaces they leave. */
export function stripAudioTags(text: string): string {
  return text.replace(AUDIO_TAG, ' ').replace(/\s+/g, ' ').trim()
}

export function linesFor(character: CharacterId, lang: Lang, category: BuiltinCategory): BuiltinLine[] {
  const list = BUILTIN_LINES[character]?.[lang]?.[category] ?? []
  return list.map((e, i) => ({
    character, lang, category,
    id: `${category}-${i + 1}`,
    text: typeof e === 'string' ? e : e.speak,
    display: stripAudioTags(typeof e === 'string' ? e : e.text),
  }))
}

/** Every line in the table (the generator's work list). */
export function allBuiltinLines(): BuiltinLine[] {
  const out: BuiltinLine[] = []
  for (const character of Object.keys(BUILTIN_LINES) as CharacterId[]) {
    for (const lang of Object.keys(BUILTIN_LINES[character]) as Lang[]) {
      for (const category of BUILTIN_CATEGORIES) out.push(...linesFor(character, lang, category))
    }
  }
  return out
}

/** Clip path relative to the site root (no leading slash). */
export function clipPath(line: Pick<BuiltinLine, 'character' | 'lang' | 'id'>): string {
  return `voice/${line.character}/${line.lang}/${line.id}.mp3`
}

/**
 * A random index in [0, count), never `last` when there is another choice, so the same
 * variant does not play twice in a row.
 */
export function pickVariant(count: number, last: number | undefined, random: () => number = Math.random): number {
  if (count <= 1) return 0
  if (last === undefined || last < 0 || last >= count) return Math.floor(random() * count) % count
  const i = Math.floor(random() * (count - 1)) % (count - 1)
  return i >= last ? i + 1 : i
}

/** Comparison key for a spoken line: tags removed, whitespace collapsed. */
export function lineKey(text: string): string {
  return stripAudioTags(text).normalize('NFC')
}

const index = new Map<string, BuiltinLine>()

/** The built-in line whose shown text is exactly `text`, for this character and language. */
export function findBuiltin(character: CharacterId, lang: Lang, text: string): BuiltinLine | null {
  if (!index.size) {
    for (const l of allBuiltinLines()) {
      const k = `${l.character}|${l.lang}|${lineKey(l.display)}`
      if (l.display && !index.has(k)) index.set(k, l)
    }
  }
  return index.get(`${character}|${lang}|${lineKey(text)}`) ?? null
}

/** Greeting category for a local hour: morning 5-11, afternoon 11-17, evening 17-22, night. */
export function greetingCategory(hour: number): BuiltinCategory {
  if (hour >= 5 && hour < 11) return 'greetMorning'
  if (hour >= 11 && hour < 17) return 'greetAfternoon'
  if (hour >= 17 && hour < 22) return 'greetEvening'
  return 'greetNight'
}
