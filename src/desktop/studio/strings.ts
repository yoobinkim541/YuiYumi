// Localized strings of the virtual coding studio (Code and Browser apps, confirm card, lines).

import type { Lang } from '@shared/languages'
import type { CharacterId } from '@/character/models'

export interface StudioStrings {
  explorer: string
  projects: string
  noProject: string
  /** Empty editor hint: what to ask for. */
  emptyHint: string
  emptyExamples: string[]
  run: string
  status: {
    idle: string
    thinking: (who: string) => string
    writing: (who: string, file: string) => string
    reading: (who: string, file: string) => string
    deleting: (who: string, file: string) => string
    previewing: (who: string) => string
    done: string
    error: string
  }
  lines: (n: number) => string
  readOnly: string
  browser: {
    back: string
    forward: string
    reload: string
    address: string
    empty: string
    emptyHint: string
    framed: string
    errors: (n: number) => string
  }
  /** Confirm card: operation label. */
  confirmOp: string
  /** Said when a build starts. */
  startLine: string
  /** Summary when the model finished without one. */
  doneSummary: string
  /** Summaries reported back to the agent when the build could not finish. */
  failed: {
    declined: string
    offline: string
    budget: string
    incomplete: string
    aborted: string
    busy: string
  }
}

const EN: StudioStrings = {
  explorer: 'Explorer',
  projects: 'Projects',
  noProject: 'No project yet',
  emptyHint: 'Ask me to build a small app, and I will write it here and open it in the browser.',
  emptyExamples: ['“Build me a todo app”', '“Make a pomodoro timer”', '“Make a landing page for a café”'],
  run: 'Run',
  status: {
    idle: 'Ready',
    thinking: w => `${w} is planning the app…`,
    writing: (w, f) => `${w} is writing ${f}…`,
    reading: (w, f) => `${w} is reading ${f}…`,
    deleting: (w, f) => `${w} is deleting ${f}…`,
    previewing: w => `${w} is opening the preview…`,
    done: 'Build finished',
    error: 'Build stopped',
  },
  lines: n => `${n} lines`,
  readOnly: 'Read-only',
  browser: {
    back: 'Back', forward: 'Forward', reload: 'Reload',
    address: 'Search or enter website name',
    empty: 'Nothing open yet',
    emptyHint: 'Apps built in Code open here.',
    framed: 'Many websites refuse to open inside another page.',
    errors: n => `${n} error${n === 1 ? '' : 's'}`,
  },
  confirmOp: 'Build an app on the virtual PC',
  startLine: 'Okay, I’ll build it right here on the virtual PC!',
  doneSummary: 'The app is ready in the browser window on the virtual PC.',
  failed: {
    declined: 'The user declined, so nothing was built.',
    offline: 'The coding studio could not reach its model, so the app was not built.',
    budget: 'The demo’s usage limit was reached, so the app was not built.',
    incomplete: 'The app was started but not finished within the step limit.',
    aborted: 'The build was stopped.',
      busy: 'Another app is being built right now; try again when it is done.',
  },
}

const STRINGS: Record<Lang, StudioStrings> = {
  'en': EN,
  'ja': {
    explorer: 'エクスプローラー',
    projects: 'プロジェクト',
    noProject: 'プロジェクトはまだありません',
    emptyHint: '小さなアプリを頼んでくれたら、ここで書いてブラウザで開くね。',
    emptyExamples: ['「ToDoアプリを作って」', '「ポモドーロタイマーを作って」', '「カフェのランディングページを作って」'],
    run: '実行',
    status: {
      idle: '準備完了',
      thinking: w => `${w}がアプリを設計中…`,
      writing: (w, f) => `${w}が ${f} を書いています…`,
      reading: (w, f) => `${w}が ${f} を読んでいます…`,
      deleting: (w, f) => `${w}が ${f} を削除しています…`,
      previewing: w => `${w}がプレビューを開いています…`,
      done: 'ビルド完了',
      error: 'ビルド中断',
    },
    lines: n => `${n} 行`,
    readOnly: '読み取り専用',
    browser: {
      back: '戻る', forward: '進む', reload: '再読み込み',
      address: '検索またはWebサイト名を入力',
      empty: 'まだ何も開いていません',
      emptyHint: 'Codeで作ったアプリがここで開きます。',
      framed: '多くのWebサイトは、ほかのページの中では開けません。',
      errors: n => `エラー ${n} 件`,
    },
    confirmOp: '仮想PCでアプリを作る',
    startLine: 'よし、仮想PCでさっそく作ってみるね！',
    doneSummary: '仮想PCのブラウザでアプリが開いています。',
    failed: {
      declined: 'ユーザーが断ったので、何も作っていません。',
      offline: 'コーディングスタジオがモデルにつながらず、アプリを作れませんでした。',
      budget: 'デモの利用上限に達したため、アプリを作れませんでした。',
      incomplete: 'アプリを作り始めましたが、手順の上限内に完成しませんでした。',
      aborted: 'ビルドを中止しました。',
      busy: 'いま別のアプリを作っている最中です。終わってからもう一度試してください。',
    },
  },
  'ko': {
    explorer: '탐색기',
    projects: '프로젝트',
    noProject: '아직 프로젝트가 없어요',
    emptyHint: '작은 앱을 부탁하면 여기서 코드를 쓰고 브라우저로 열어 줄게요.',
    emptyExamples: ['“할 일 앱 만들어줘”', '“뽀모도로 타이머 만들어줘”', '“카페 랜딩 페이지 만들어줘”'],
    run: '실행',
    status: {
      idle: '준비됨',
      thinking: w => `${w}가 앱을 구상하는 중…`,
      writing: (w, f) => `${w}가 ${f} 작성 중…`,
      reading: (w, f) => `${w}가 ${f} 읽는 중…`,
      deleting: (w, f) => `${w}가 ${f} 삭제 중…`,
      previewing: w => `${w}가 미리보기를 여는 중…`,
      done: '빌드 완료',
      error: '빌드 중단됨',
    },
    lines: n => `${n}줄`,
    readOnly: '읽기 전용',
    browser: {
      back: '뒤로', forward: '앞으로', reload: '새로고침',
      address: '검색 또는 웹 사이트 이름 입력',
      empty: '아직 열린 페이지가 없어요',
      emptyHint: 'Code에서 만든 앱이 여기서 열려요.',
      framed: '많은 웹 사이트는 다른 페이지 안에서 열리지 않아요.',
      errors: n => `오류 ${n}개`,
    },
    confirmOp: '가상 PC에서 앱 만들기',
    startLine: '좋아, 가상 PC에서 바로 만들어 볼게!',
    doneSummary: '가상 PC 브라우저에서 앱이 열려 있어요.',
    failed: {
      declined: '사용자가 거절해서 아무것도 만들지 않았어요.',
      offline: '코딩 스튜디오가 모델에 연결되지 않아 앱을 만들지 못했어요.',
      budget: '데모 사용 한도에 도달해서 앱을 만들지 못했어요.',
      incomplete: '앱을 만들기 시작했지만 단계 한도 안에 끝내지 못했어요.',
      aborted: '빌드를 중단했어요.',
      busy: '지금 다른 앱을 만들고 있어요. 끝나면 다시 시도해 주세요.',
    },
  },
  'zh-Hans': {
    explorer: '资源管理器',
    projects: '项目',
    noProject: '还没有项目',
    emptyHint: '让我做一个小应用，我会在这里写代码，然后在浏览器里打开。',
    emptyExamples: ['“帮我做一个待办应用”', '“做一个番茄钟”', '“做一个咖啡店落地页”'],
    run: '运行',
    status: {
      idle: '就绪',
      thinking: w => `${w}正在构思应用…`,
      writing: (w, f) => `${w}正在编写 ${f}…`,
      reading: (w, f) => `${w}正在读取 ${f}…`,
      deleting: (w, f) => `${w}正在删除 ${f}…`,
      previewing: w => `${w}正在打开预览…`,
      done: '构建完成',
      error: '构建已停止',
    },
    lines: n => `${n} 行`,
    readOnly: '只读',
    browser: {
      back: '后退', forward: '前进', reload: '重新载入',
      address: '搜索或输入网站名称',
      empty: '还没有打开任何页面',
      emptyHint: '在 Code 中做好的应用会在这里打开。',
      framed: '很多网站不允许在其他页面中打开。',
      errors: n => `${n} 个错误`,
    },
    confirmOp: '在虚拟电脑上做应用',
    startLine: '好，我这就在虚拟电脑上做出来！',
    doneSummary: '应用已经在虚拟电脑的浏览器里打开了。',
    failed: {
      declined: '用户拒绝了，所以什么都没做。',
      offline: '编程工作室连不上模型，应用没有做成。',
      budget: '已达到演示的使用上限，应用没有做成。',
      incomplete: '应用已经开始做了，但没能在步骤上限内完成。',
      aborted: '构建已停止。',
      busy: '正在做另一个应用，完成后再试一次吧。',
    },
  },
  'zh-Hant': {
    explorer: '檔案總管',
    projects: '專案',
    noProject: '還沒有專案',
    emptyHint: '請我做一個小 App，我會在這裡寫程式碼，再用瀏覽器打開。',
    emptyExamples: ['「幫我做一個待辦事項 App」', '「做一個番茄鐘」', '「做一個咖啡廳的到達頁面」'],
    run: '執行',
    status: {
      idle: '就緒',
      thinking: w => `${w}正在構思 App…`,
      writing: (w, f) => `${w}正在撰寫 ${f}…`,
      reading: (w, f) => `${w}正在讀取 ${f}…`,
      deleting: (w, f) => `${w}正在刪除 ${f}…`,
      previewing: w => `${w}正在打開預覽…`,
      done: '建置完成',
      error: '建置已停止',
    },
    lines: n => `${n} 行`,
    readOnly: '唯讀',
    browser: {
      back: '上一頁', forward: '下一頁', reload: '重新載入',
      address: '搜尋或輸入網站名稱',
      empty: '還沒有打開任何頁面',
      emptyHint: '在 Code 做好的 App 會在這裡打開。',
      framed: '很多網站不允許在其他頁面中打開。',
      errors: n => `${n} 個錯誤`,
    },
    confirmOp: '在虛擬電腦上做 App',
    startLine: '好，我馬上在虛擬電腦上做出來！',
    doneSummary: 'App 已經在虛擬電腦的瀏覽器裡打開了。',
    failed: {
      declined: '使用者拒絕了，所以什麼都沒做。',
      offline: '程式工作室連不上模型，App 沒有做成。',
      budget: '已達到展示的使用上限，App 沒有做成。',
      incomplete: 'App 已經開始做了，但沒能在步驟上限內完成。',
      aborted: '建置已停止。',
      busy: '正在做另一個 App，完成後再試一次吧。',
    },
  },
}

export function studioStrings(lang: Lang): StudioStrings {
  return STRINGS[lang] ?? EN
}

/** Localized character name for status lines. */
const NAMES: Record<string, Record<Lang, string>> = {
  tt2: { 'en': 'Yumi', 'ja': 'ユミ', 'ko': '유미', 'zh-Hans': '由美', 'zh-Hant': '由美' },
  yui: { 'en': 'Yui', 'ja': 'ユイ', 'ko': '유이', 'zh-Hans': '由依', 'zh-Hant': '由依' },
}

export function characterName(character: CharacterId | string, lang: Lang): string {
  return NAMES[character]?.[lang] ?? NAMES.tt2![lang]
}
