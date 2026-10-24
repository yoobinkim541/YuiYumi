// YouTube inside the virtual PC's Browser app. youtube.com refuses to be framed, but the embed
// player does not, so the page is drawn by us and plays curated, verified-embeddable videos.
// Without an API key there is no search: requests are matched to the list by keywords.

export interface TubeVideo {
  id: string
  title: string
  channel: string
  /** Lowercase match words in the five languages. */
  tags: string[]
}

export const TUBE_VIDEOS: TubeVideo[] = [
  { id: 'lTRiuFIWV54', title: '1 A.M Study Session - lofi hip hop', channel: 'Lofi Girl', tags: ['lofi', 'lo-fi', '로파이', '공부', 'study', '勉強', 'ローファイ', '学习', '學習', 'chill', '잔잔'] },
  { id: '7NOSDKb0HlU', title: 'Chillhop Radio - jazzy & lofi hip hop beats', channel: 'Chillhop Music', tags: ['chillhop', '칠합', 'beats', '비트', 'radio', '라디오'] },
  { id: '4xDzrJKXOOY', title: 'Synthwave Radio - beats to chill/game to', channel: 'Lofi Girl', tags: ['synthwave', '신스웨이브', 'retro', '레트로', 'game', '게임', 'ゲーム'] },
  { id: 'neV3EPgvZ3g', title: 'Relaxing Jazz Music - Cafe Music BGM', channel: 'Cafe Music BGM channel', tags: ['jazz', '재즈', 'ジャズ', '爵士', 'cafe', '카페', 'カフェ', '咖啡'] },
  { id: '4Tr0otuiQuU', title: 'Beethoven - Moonlight Sonata', channel: 'Classical', tags: ['classical', '클래식', 'クラシック', '古典', 'beethoven', '베토벤', 'piano', '피아노', 'ピアノ', '钢琴', '鋼琴'] },
  { id: 'gdZLi9oWNZg', title: 'BTS (방탄소년단) Dynamite', channel: 'HYBE LABELS', tags: ['bts', '방탄', 'dynamite', '다이너마이트', 'kpop', 'k-pop', '케이팝', '防弹'] },
  { id: '11cta61wi0g', title: 'NewJeans (뉴진스) Hype Boy', channel: 'HYBE LABELS', tags: ['newjeans', '뉴진스', 'hype boy', '하입보이'] },
  { id: 'phuiiNCxRMg', title: 'aespa 에스파 Supernova', channel: 'SMTOWN', tags: ['aespa', '에스파', 'supernova', '슈퍼노바'] },
  { id: 'IHNzOHi8sJs', title: 'BLACKPINK - DDU-DU DDU-DU', channel: 'BLACKPINK', tags: ['blackpink', '블랙핑크', '뚜두뚜두', 'ddu-du'] },
  { id: '9bZkp7q19f0', title: 'PSY - GANGNAM STYLE', channel: 'officialpsy', tags: ['psy', '싸이', 'gangnam', '강남스타일', '江南'] },
  { id: 'kJQP7kiw5Fk', title: 'Luis Fonsi - Despacito ft. Daddy Yankee', channel: 'Luis Fonsi', tags: ['despacito', '데스파시토', 'pop', '팝'] },
  { id: 'aircAruvnKk', title: 'But what is a neural network?', channel: '3Blue1Brown', tags: ['neural', '신경망', 'ai', '인공지능', 'deep learning', '딥러닝', 'ニューラル', '神经网络', '神經網路', 'math', '수학'] },
  { id: 'zjkBMFhNj_g', title: 'Intro to Large Language Models', channel: 'Andrej Karpathy', tags: ['llm', 'gpt', 'claude', '언어 모델', 'language model', 'karpathy', '카파시', '大模型'] },
  { id: 'nhBVL41-_Cw', title: 'Vue.js Explained in 100 Seconds', channel: 'Fireship', tags: ['vue', '뷰', 'javascript', '자바스크립트', 'coding', '코딩', 'プログラミング', '编程', '程式'] },
  { id: 'UF8uR6Z6KLc', title: "Steve Jobs' 2005 Stanford Commencement Address", channel: 'Stanford', tags: ['steve jobs', '스티브 잡스', 'jobs', '잡스', 'stanford', '스탠포드', 'speech', '연설', 'スピーチ', '演讲', '演講'] },
]

/** Best curated match for free text, or null when nothing fits. */
export function matchVideo(text: string): TubeVideo | null {
  const q = text.toLowerCase()
  let best: { v: TubeVideo, score: number } | null = null
  for (const v of TUBE_VIDEOS) {
    let score = 0
    for (const t of v.tags) if (q.includes(t)) score += t.length
    if (q.includes(v.title.toLowerCase())) score += 50
    if (score > 0 && (!best || score > best.score)) best = { v, score }
  }
  return best?.v ?? null
}

/** youtube.com / youtu.be URL → what to show: a known video, a search phrase, or the home grid. */
export function parseYoutubeUrl(raw: string): { videoId: string | null, query: string } | null {
  let u: URL
  try { u = new URL(raw) } catch { return null }
  const host = u.hostname.replace(/^www\.|^m\./, '')
  if (host === 'youtu.be') return { videoId: u.pathname.slice(1) || null, query: '' }
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com' && host !== 'music.youtube.com') return null
  const v = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{6,})/)?.[1] ?? null
  return { videoId: v, query: u.searchParams.get('search_query') ?? u.searchParams.get('q') ?? '' }
}

export const isYoutubeAppName = (name: string) => /youtube|유튜브|ユーチューブ|油管|优兔|優兔/i.test(name)

export const thumbUrl = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
export const embedUrl = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`
