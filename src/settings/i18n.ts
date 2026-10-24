// Localized labels for the Settings and Dashboard windows. Follows the UI language.

import { computed } from 'vue'
import type { PermissionLevel, VoicePreset } from '@shared/contracts'
import { LANG_INFO, type Lang } from '@shared/languages'
import type { AssistantMode } from '@/stores/settings'

export type SettingsPageId = 'card' | 'general' | 'voice' | 'permissions' | 'connectors' | 'about'
type CardFieldKey = 'description' | 'personality' | 'scenario' | 'systemPrompt' | 'speakingStyle'
type ServiceKey = 'mail' | 'calendar' | 'drive' | 'slack' | 'discord'

export interface SettingsStrings {
  settings: string
  back: string
  pages: Record<SettingsPageId, { title: string, desc: string }>
  card: {
    model: string, modelHint: string, inUse: string, switchTo: string
    cards: string, cardsHint: (model: string) => string, newCard: string, duplicate: string
    untitled: string, noDescription: string, defaultFor: (model: string) => string, custom: string
    edit: (name: string) => string, editHint: string, resetDefault: string, remove: string
    name: string, nameSub: string
    fields: Record<CardFieldKey, { label: string, sub: string }>
  }
  general: {
    userName: string, userNameHint: string, userNamePlaceholder: string
    language: string, languageHint: string, mode: string, modeHint: string
    modes: Record<AssistantMode, { title: string, desc: string }>
    sound: string, soundDesc: string
  }
  voice: {
    voiceLang: string, voiceLangHint: string, followUi: (label: string) => string
    ptt: string, pttHint: (mod: string) => string, pttDefault: string, pttRecording: string, pttIdle: string
    cancel: string, record: string, keyReject: (mod: string) => string
    style: string, styleHint: string, styles: Record<VoicePreset, { title: string, desc: string }>
    vad: string, vadHint: string, vadName: string, vadLoading: string, vadOn: string, off: string
  }
  permissions: {
    hint: string, levels: Record<PermissionLevel, { title: string, desc: string }>, bypassWarn: string
  }
  connectors: { hint: string, desc: Record<ServiceKey, string>, live: string, mock: string }
  about: { tagline: string, notices: string, noticesHint: string, items: string[], notRedistributed: string }
  tray: {
    watching: (s: number) => string, paused: string, pause: string, resume: string
    hideChar: string, showChar: string, quiet: string, mode: string, language: string
    sound: string, vad: string, settings: string, dashboard: string
  }
  dash: {
    title: string
    decisions: Record<string, string>
    ago: (s: number) => string
    proactive: string, proactiveLast: (ago: string) => string, proactiveNone: string, lastDecision: string, checking: string, noCheck: string, dwell: (s: number) => string
    tasksRun: string, fromScreen: (n: number) => string
    drafts: string, draftsBreakdown: (mail: number, slack: number) => string
    dialogue: string, emptyDialogue: (key: string) => string, you: string
    now: string, mode: string, model: string, character: string, voice: string
    speaking: string, listeningVad: string, ptt: (key: string) => string, sound: string, on: string, off: string
    services: string, counts: Record<ServiceKey, (n: number) => string>
  }
}

const EN: SettingsStrings = {
  settings: 'Settings',
  back: 'Back',
  pages: {
    card: { title: 'Character', desc: 'Model and character card' },
    general: { title: 'General', desc: 'Language, mode and sound' },
    voice: { title: 'Voice', desc: 'Voice language, push-to-talk, VAD' },
    permissions: { title: 'Permissions', desc: 'What the assistant may do without asking' },
    connectors: { title: 'Connectors', desc: 'Mock or live data per service' },
    about: { title: 'About', desc: 'Open source notices' },
  },
  card: {
    model: 'Model', modelHint: 'Each model remembers its own character card.', inUse: 'In use', switchTo: 'Switch to this model',
    cards: 'Cards', cardsHint: m => `Pick the card for ${m}.`, newCard: 'New', duplicate: 'Duplicate',
    untitled: 'Untitled', noDescription: 'No description', defaultFor: m => `Default · ${m}`, custom: 'Custom',
    edit: n => `Edit “${n}”`, editHint: 'Changes save automatically and apply to the next observation and task.',
    resetDefault: 'Reset to default', remove: 'Delete',
    name: 'Name', nameSub: 'shown and used by the character (max 40)',
    fields: {
      description: { label: 'Description', sub: 'Who the character is, in a sentence or two.' },
      personality: { label: 'Personality', sub: 'Temperament and habits.' },
      scenario: { label: 'Scenario', sub: 'Where and how the character meets the user.' },
      systemPrompt: { label: 'System prompt', sub: 'Extra instructions. Safety rules always win over this card.' },
      speakingStyle: { label: 'Speaking style', sub: 'Tone and register. Replies still follow the voice language.' },
    },
  },
  general: {
    userName: 'What to call you', userNameHint: 'The character calls you by this name. Leave it empty to skip.', userNamePlaceholder: 'Name or nickname',
    language: 'Display language', languageHint: 'Menus, apps and demo data follow this language. The voice language can be set separately under Voice.',
    mode: 'Mode', modeHint: 'Quiet and ornamental modes never capture the screen.',
    modes: {
      active: { title: 'Active', desc: 'Watches the screen and may speak up' },
      quiet: { title: 'Quiet', desc: 'Answers only when spoken to' },
      ornamental: { title: 'Ornamental', desc: 'Just stays on the desktop' },
    },
    sound: 'Sound', soundDesc: 'Speak lines aloud. Turning it off stops the current line.',
  },
  voice: {
    voiceLang: 'Voice language', voiceLangHint: 'Speech recognition, replies and the character’s voice use this language.',
    followUi: l => `Same as display (${l})`,
    ptt: 'Push-to-talk shortcut', pttHint: mod => `Letters and digits need Ctrl, Alt or ${mod} so typing on the desktop is not taken over. A shortcut without those keys is ignored while you type in a text field.`,
    pttDefault: 'Push-to-talk (default)', pttRecording: 'Press the new key combination. Esc cancels.', pttIdle: 'Hold to talk. Works anywhere on the desktop.',
    cancel: 'Cancel', record: 'Record shortcut', keyReject: mod => `Letters, digits and typing keys need Ctrl, Alt or ${mod}.`,
    style: 'Voice style', styleHint: 'How the character’s voice is generated. Lively is the default.',
    styles: {
      lively: { title: 'Lively (default)', desc: 'Spoken and expressive, about 0.6 s' },
      conversational: { title: 'Conversational', desc: 'Most natural, about 3–4 s' },
      fast: { title: 'Fast', desc: 'Quickest, flatter delivery' },
    },
    vad: 'VAD', vadHint: 'Voice activity detection listens hands-free and sends what you say when you stop. Push-to-talk keeps working while it is on.',
    vadName: 'Voice activity detection', vadLoading: 'Loading model…', vadOn: 'Listening for speech', off: 'Off',
  },
  permissions: {
    hint: 'Reading is always allowed. Choose when the assistant asks before acting on your behalf.',
    levels: {
      manual: { title: 'Manual (default)', desc: 'Asks before every change and anything sent' },
      auto: { title: 'Auto', desc: 'Handles drafts, calendar and reminders; asks before sending' },
      bypass: { title: 'Bypass', desc: 'Never asks, including sending mail and messages' },
    },
    bypassWarn: 'Bypass sends mail and posts messages without confirmation. Use it only when you trust the request.',
  },
  connectors: {
    hint: 'All actions run on the virtual desktop. What needs your confirmation is set under Permissions. Live reads fall back to mock data on failure.',
    desc: {
      mail: 'Read, reply, send, draft and trash mail',
      calendar: 'List events, find conflicts, add and delete events',
      drive: 'Search and read files',
      slack: 'Read channels, draft and post messages',
      discord: 'Read channels and post messages',
    },
    live: 'Live', mock: 'Mock',
  },
  about: {
    tagline: 'A desktop companion that watches with you, speaks up when it helps, and does the work you ask for.',
    notices: 'Open source notices', noticesHint: 'Full list with licenses and usage: THIRD_PARTY_NOTICES.md in the repository root.',
    items: [
      'Live2D wiring, audio pipeline, lip sync structure, and the look of these settings and dashboard windows.',
      'Character core built to WASM.',
      'Character rendering.',
      'App framework and libraries.',
      'Voice activity detection and lip sync.',
      'Provider SDKs.',
    ],
    notRedistributed: 'Live2D Cubism Core and character models are not redistributed in the repository.',
  },
  tray: { watching: s => `Watching screen · ${s}s on this view`, paused: 'Paused', pause: 'Pause watching', resume: 'Resume watching', hideChar: 'Hide character', showChar: 'Show character', quiet: 'Quiet mode', mode: 'Mode', language: 'Display language', sound: 'Sound', vad: 'Hands-free voice (VAD)', settings: 'Settings…', dashboard: 'Dashboard…' },
  dash: {
    title: 'Dashboard',
    decisions: {
      'idle': 'Idle', 'silent': 'Stayed silent', 'acted': 'Spoke up / acted', 'error': 'Observer error',
      'budget': 'Budget reached (fallback lines)', 'dropped:speaking': 'Held back: you were speaking',
      'dropped:talking': 'Held back: voice still playing', 'dropped:busy': 'Held back: working on a task',
      'dropped:gap': 'Held back: spoke a moment ago',
    },
    ago: s => s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`,
    proactive: 'Proactive remarks this session', proactiveLast: a => `last ${a}`, proactiveNone: 'None yet', lastDecision: 'Last observer decision', checking: 'Checking the screen…', noCheck: 'No check yet', dwell: s => `dwell ${s} s`,
    tasksRun: 'Agent tasks run', fromScreen: n => `${n} offered from the screen`,
    drafts: 'Drafts saved', draftsBreakdown: (m, s) => `${m} mail · ${s} Slack`,
    dialogue: 'Recent dialogue', emptyDialogue: k => `No conversation yet. Hold ${k} or the talk button and say hello.`, you: 'You',
    now: 'Now', mode: 'Mode', model: 'Model', character: 'Character', voice: 'Voice',
    speaking: 'Speaking', listeningVad: 'Listening (VAD)', ptt: k => `Push-to-talk (${k})`, sound: 'Sound', on: 'On', off: 'Off',
    services: 'Connected services',
    counts: { mail: n => `${n} mails`, calendar: n => `${n} events`, drive: n => `${n} files`, slack: n => `${n} channels`, discord: n => `${n} channels` },
  },
}

const KO: SettingsStrings = {
  settings: '설정',
  back: '뒤로',
  pages: {
    card: { title: '캐릭터', desc: '모델과 캐릭터 카드' },
    general: { title: '일반', desc: '표시 언어, 모드, 소리' },
    voice: { title: '음성', desc: '음성 언어, 누르고 말하기, VAD' },
    permissions: { title: '권한', desc: '묻지 않고 해도 되는 일' },
    connectors: { title: '연결', desc: '서비스별 목업 또는 실데이터' },
    about: { title: '정보', desc: '오픈소스 고지' },
  },
  card: {
    model: '모델', modelHint: '모델마다 캐릭터 카드를 따로 기억해요.', inUse: '사용 중', switchTo: '이 모델로 바꾸기',
    cards: '카드', cardsHint: m => `${m}에 쓸 카드를 고르세요.`, newCard: '새 카드', duplicate: '복제',
    untitled: '이름 없음', noDescription: '설명 없음', defaultFor: m => `기본 · ${m}`, custom: '사용자 지정',
    edit: n => `“${n}” 편집`, editHint: '변경 사항은 자동 저장되고 다음 관찰과 작업부터 적용돼요.',
    resetDefault: '기본값으로 되돌리기', remove: '삭제',
    name: '이름', nameSub: '캐릭터가 표시하고 스스로 부르는 이름 (최대 40자)',
    fields: {
      description: { label: '설명', sub: '캐릭터가 누구인지 한두 문장으로.' },
      personality: { label: '성격', sub: '기질과 습관.' },
      scenario: { label: '상황', sub: '캐릭터가 사용자를 어디서 어떻게 만나는지.' },
      systemPrompt: { label: '시스템 프롬프트', sub: '추가 지시. 안전 규칙이 항상 이 카드보다 우선해요.' },
      speakingStyle: { label: '말투', sub: '어조와 말씨. 답변 언어는 음성 언어를 따라요.' },
    },
  },
  general: {
    userName: '부를 이름', userNameHint: '캐릭터가 이 이름으로 불러요. 비워 두면 이름 없이 대화해요.', userNamePlaceholder: '이름이나 별명',
    language: '표시 언어', languageHint: '메뉴, 앱, 데모 데이터가 이 언어를 따라요. 음성 언어는 음성 메뉴에서 따로 정할 수 있어요.',
    mode: '모드', modeHint: '조용히·관상용 모드에서는 화면을 캡처하지 않아요.',
    modes: {
      active: { title: '활성', desc: '화면을 보고 먼저 말을 걸기도 해요' },
      quiet: { title: '조용히', desc: '말을 걸 때만 대답해요' },
      ornamental: { title: '관상용', desc: '데스크톱에 머물기만 해요' },
    },
    sound: '소리', soundDesc: '대사를 소리 내어 말해요. 끄면 지금 대사도 멈춰요.',
  },
  voice: {
    voiceLang: '음성 언어', voiceLangHint: '음성 인식, 답변, 캐릭터 목소리가 이 언어를 써요.',
    followUi: l => `표시 언어와 같게 (${l})`,
    ptt: '누르고 말하기 단축키', pttHint: mod => `글자와 숫자 키는 Ctrl, Alt, ${mod} 중 하나와 함께 눌러야 해요. 데스크톱에서 타이핑할 때 가로채지 않기 위해서예요. 이런 조합키가 없는 단축키는 입력창에 타이핑하는 동안 무시돼요.`,
    pttDefault: '누르고 말하기 (기본)', pttRecording: '새 키 조합을 누르세요. Esc를 누르면 취소돼요.', pttIdle: '누르고 있는 동안 말해요. 데스크톱 어디서나 동작해요.',
    cancel: '취소', record: '단축키 녹화', keyReject: mod => `글자, 숫자, 타이핑 키는 Ctrl, Alt, ${mod} 중 하나와 함께 눌러야 해요.`,
    style: '목소리 스타일', styleHint: '캐릭터 목소리를 만드는 방식이에요. 기본은 생동감이에요.',
    styles: {
      lively: { title: '생동감 (기본)', desc: '말하듯 표현력 있게, 약 0.6초' },
      conversational: { title: '대화형', desc: '가장 자연스러움, 약 3–4초' },
      fast: { title: '빠르게', desc: '가장 빠르지만 덜 풍부함' },
    },
    vad: 'VAD', vadHint: '음성 구간 감지(VAD)는 손 대지 않아도 듣다가 말이 끝나면 보내요. 켜져 있어도 누르고 말하기는 계속 쓸 수 있어요.',
    vadName: '음성 구간 감지', vadLoading: '모델 불러오는 중…', vadOn: '말소리 듣는 중', off: '꺼짐',
  },
  permissions: {
    hint: '읽기는 항상 허용돼요. 대신 행동하기 전에 언제 물어볼지 고르세요.',
    levels: {
      manual: { title: '수동 (기본)', desc: '변경과 전송 전에 항상 물어봐요' },
      auto: { title: '자동', desc: '초안, 일정, 알림은 알아서 하고 보내기 전에만 물어봐요' },
      bypass: { title: '권한 무시', desc: '메일과 메시지 전송까지 묻지 않고 해요' },
    },
    bypassWarn: '권한 무시 모드는 확인 없이 메일을 보내고 메시지를 올려요. 요청을 믿을 수 있을 때만 쓰세요.',
  },
  connectors: {
    hint: '모든 동작은 가상 데스크톱에서 실행돼요. 확인이 필요한 범위는 권한에서 정해요. 실데이터 읽기가 실패하면 목업 데이터로 대신해요.',
    desc: {
      mail: '메일 읽기, 답장, 보내기, 초안, 휴지통',
      calendar: '일정 보기, 겹침 찾기, 일정 추가와 삭제',
      drive: '파일 검색과 읽기',
      slack: '채널 읽기, 메시지 초안과 전송',
      discord: '채널 읽기와 메시지 전송',
    },
    live: '실데이터', mock: '목업',
  },
  about: {
    tagline: '함께 화면을 보고, 도움이 될 때 먼저 말을 걸고, 부탁한 일을 직접 해 주는 데스크톱 컴패니언이에요.',
    notices: '오픈소스 고지', noticesHint: '라이선스와 사용 방식 전체 목록: 저장소 루트의 THIRD_PARTY_NOTICES.md',
    items: [
      'Live2D 연동, 오디오 파이프라인, 립싱크 구조, 이 설정·대시보드 창의 디자인.',
      'WASM으로 빌드한 캐릭터 코어.',
      '캐릭터 렌더링.',
      '앱 프레임워크와 라이브러리.',
      '음성 구간 감지와 립싱크.',
      '제공자 SDK.',
    ],
    notRedistributed: 'Live2D Cubism Core와 캐릭터 모델은 저장소에 포함해 재배포하지 않아요.',
  },
  tray: { watching: s => `화면 보는 중 · 이 화면 ${s}초`, paused: '일시정지', pause: '화면 보기 멈추기', resume: '화면 보기 다시 시작', hideChar: '캐릭터 숨기기', showChar: '캐릭터 보이기', quiet: '조용히 모드', mode: '모드', language: '표시 언어', sound: '소리', vad: '핸즈프리 음성 (VAD)', settings: '설정…', dashboard: '대시보드…' },
  dash: {
    title: '대시보드',
    decisions: {
      'idle': '대기 중', 'silent': '조용히 있음', 'acted': '말을 걸거나 행동함', 'error': '관찰 오류',
      'budget': '예산 도달 (준비된 대사 사용)', 'dropped:speaking': '보류: 사용자가 말하는 중',
      'dropped:talking': '보류: 음성 재생 중', 'dropped:busy': '보류: 작업 중',
      'dropped:gap': '보류: 방금 말함',
    },
    ago: s => s < 60 ? `${s}초 전` : s < 3600 ? `${Math.floor(s / 60)}분 전` : `${Math.floor(s / 3600)}시간 전`,
    proactive: '이번 세션에서 먼저 말 건 횟수', proactiveLast: a => `마지막 ${a}`, proactiveNone: '아직 없음', lastDecision: '마지막 관찰 판단', checking: '화면 확인 중…', noCheck: '아직 확인 전', dwell: s => `머문 시간 ${s}초`,
    tasksRun: '실행한 작업', fromScreen: n => `화면 보고 제안한 작업 ${n}개`,
    drafts: '저장된 초안', draftsBreakdown: (m, s) => `메일 ${m} · Slack ${s}`,
    dialogue: '최근 대화', emptyDialogue: k => `아직 대화가 없어요. ${k} 키나 말하기 버튼을 누르고 인사해 보세요.`, you: '나',
    now: '현재', mode: '모드', model: '모델', character: '캐릭터', voice: '음성',
    speaking: '말하는 중', listeningVad: '듣는 중 (VAD)', ptt: k => `누르고 말하기 (${k})`, sound: '소리', on: '켜짐', off: '꺼짐',
    services: '연결된 서비스',
    counts: { mail: n => `메일 ${n}통`, calendar: n => `일정 ${n}개`, drive: n => `파일 ${n}개`, slack: n => `채널 ${n}개`, discord: n => `채널 ${n}개` },
  },
}

const JA: SettingsStrings = {
  settings: '設定',
  back: '戻る',
  pages: {
    card: { title: 'キャラクター', desc: 'モデルとキャラクターカード' },
    general: { title: '一般', desc: '表示言語、モード、サウンド' },
    voice: { title: '音声', desc: '音声言語、押して話す、VAD' },
    permissions: { title: '権限', desc: '確認なしで実行してよい操作' },
    connectors: { title: '連携', desc: 'サービスごとのモック／実データ' },
    about: { title: '情報', desc: 'オープンソースの表示' },
  },
  card: {
    model: 'モデル', modelHint: 'モデルごとにキャラクターカードを記憶します。', inUse: '使用中', switchTo: 'このモデルに切り替え',
    cards: 'カード', cardsHint: m => `${m}で使うカードを選んでください。`, newCard: '新規', duplicate: '複製',
    untitled: '無題', noDescription: '説明なし', defaultFor: m => `デフォルト · ${m}`, custom: 'カスタム',
    edit: n => `「${n}」を編集`, editHint: '変更は自動保存され、次の観察とタスクから反映されます。',
    resetDefault: 'デフォルトに戻す', remove: '削除',
    name: '名前', nameSub: 'キャラクターが表示・名乗る名前（最大40文字）',
    fields: {
      description: { label: '説明', sub: 'キャラクターが誰なのかを一、二文で。' },
      personality: { label: '性格', sub: '気質や癖。' },
      scenario: { label: 'シナリオ', sub: 'キャラクターがユーザーとどこでどう出会うか。' },
      systemPrompt: { label: 'システムプロンプト', sub: '追加の指示。安全ルールが常にこのカードより優先されます。' },
      speakingStyle: { label: '話し方', sub: '口調や言葉づかい。返答の言語は音声言語に従います。' },
    },
  },
  general: {
    userName: '呼び名', userNameHint: 'キャラクターがこの名前で呼びます。空欄なら名前なしで話します。', userNamePlaceholder: '名前やニックネーム',
    language: '表示言語', languageHint: 'メニュー、アプリ、デモデータがこの言語になります。音声言語は「音声」で別に設定できます。',
    mode: 'モード', modeHint: '静か・観賞用モードでは画面をキャプチャしません。',
    modes: {
      active: { title: 'アクティブ', desc: '画面を見て、自分から話しかけることも' },
      quiet: { title: '静か', desc: '話しかけたときだけ答えます' },
      ornamental: { title: '観賞用', desc: 'デスクトップにいるだけ' },
    },
    sound: 'サウンド', soundDesc: 'セリフを声に出します。オフにすると今のセリフも止まります。',
  },
  voice: {
    voiceLang: '音声言語', voiceLangHint: '音声認識、返答、キャラクターの声がこの言語になります。',
    followUi: l => `表示言語と同じ（${l}）`,
    ptt: '押して話すショートカット', pttHint: mod => `文字キーと数字キーは Ctrl、Alt、${mod} のいずれかと一緒に押す必要があります。デスクトップでの入力を妨げないためです。これらのキーを含まないショートカットは、入力欄で入力中は無視されます。`,
    pttDefault: '押して話す（デフォルト）', pttRecording: '新しいキーの組み合わせを押してください。Esc でキャンセル。', pttIdle: '押している間だけ話せます。デスクトップのどこでも使えます。',
    cancel: 'キャンセル', record: 'ショートカットを記録', keyReject: mod => `文字・数字・入力キーには Ctrl、Alt、${mod} のいずれかが必要です。`,
    style: '声のスタイル', styleHint: 'キャラクターの声の生成方法です。デフォルトは「いきいき」です。',
    styles: {
      lively: { title: 'いきいき（デフォルト）', desc: '話し言葉らしく表情豊か、約0.6秒' },
      conversational: { title: '会話向け', desc: '最も自然、約3〜4秒' },
      fast: { title: '高速', desc: '最速、ただし抑揚は控えめ' },
    },
    vad: 'VAD', vadHint: '音声区間検出（VAD）は手を使わずに聞き取り、話し終えたら送信します。オンの間も押して話すは使えます。',
    vadName: '音声区間検出', vadLoading: 'モデルを読み込み中…', vadOn: '音声を待機中', off: 'オフ',
  },
  permissions: {
    hint: '読み取りは常に許可されます。代わりに操作する前にいつ確認するかを選んでください。',
    levels: {
      manual: { title: '手動（デフォルト）', desc: '変更や送信の前に毎回確認します' },
      auto: { title: '自動', desc: '下書き・予定・リマインダーは任せて、送信前だけ確認します' },
      bypass: { title: '確認なし', desc: 'メールやメッセージの送信も確認しません' },
    },
    bypassWarn: '確認なしモードでは、確認せずにメールを送信しメッセージを投稿します。信頼できる依頼のときだけ使ってください。',
  },
  connectors: {
    hint: 'すべての操作は仮想デスクトップ上で行われます。確認が必要な範囲は「権限」で設定します。実データの読み取りに失敗した場合はモックデータを使います。',
    desc: {
      mail: 'メールの閲覧・返信・送信・下書き・ゴミ箱',
      calendar: '予定の一覧、重複の検出、予定の追加と削除',
      drive: 'ファイルの検索と閲覧',
      slack: 'チャンネルの閲覧、メッセージの下書きと投稿',
      discord: 'チャンネルの閲覧とメッセージ投稿',
    },
    live: '実データ', mock: 'モック',
  },
  about: {
    tagline: '一緒に画面を見て、役立つときに話しかけ、頼んだ仕事を実際にこなすデスクトップコンパニオン。',
    notices: 'オープンソースの表示', noticesHint: 'ライセンスと使用方法の全一覧: リポジトリ直下の THIRD_PARTY_NOTICES.md',
    items: [
      'Live2D 連携、オーディオパイプライン、リップシンク構造、この設定・ダッシュボード画面のデザイン。',
      'WASM にビルドしたキャラクターコア。',
      'キャラクターの描画。',
      'アプリのフレームワークとライブラリ。',
      '音声区間検出とリップシンク。',
      'プロバイダー SDK。',
    ],
    notRedistributed: 'Live2D Cubism Core とキャラクターモデルはリポジトリで再配布していません。',
  },
  tray: { watching: s => `画面を見ています · この画面 ${s}秒`, paused: '一時停止中', pause: '画面の観察を停止', resume: '画面の観察を再開', hideChar: 'キャラクターを隠す', showChar: 'キャラクターを表示', quiet: '静かモード', mode: 'モード', language: '表示言語', sound: 'サウンド', vad: 'ハンズフリー音声（VAD）', settings: '設定…', dashboard: 'ダッシュボード…' },
  dash: {
    title: 'ダッシュボード',
    decisions: {
      'idle': '待機中', 'silent': '静観', 'acted': '話しかけた／実行した', 'error': '観察エラー',
      'budget': '予算上限（用意したセリフを使用）', 'dropped:speaking': '保留: 発話中',
      'dropped:talking': '保留: 音声を再生中', 'dropped:busy': '保留: 作業中',
      'dropped:gap': '保留: 話したばかり',
    },
    ago: s => s < 60 ? `${s}秒前` : s < 3600 ? `${Math.floor(s / 60)}分前` : `${Math.floor(s / 3600)}時間前`,
    proactive: 'このセッションの自発的な発言', proactiveLast: a => `直近 ${a}`, proactiveNone: 'まだありません', lastDecision: '直近の観察判断', checking: '画面を確認中…', noCheck: 'まだ確認していません', dwell: s => `滞在 ${s}秒`,
    tasksRun: '実行したタスク', fromScreen: n => `画面から提案 ${n}件`,
    drafts: '保存した下書き', draftsBreakdown: (m, s) => `メール ${m} · Slack ${s}`,
    dialogue: '最近の会話', emptyDialogue: k => `まだ会話がありません。${k} か話すボタンを押して挨拶してみてください。`, you: 'あなた',
    now: '現在', mode: 'モード', model: 'モデル', character: 'キャラクター', voice: '音声',
    speaking: '発話中', listeningVad: '聞き取り中（VAD）', ptt: k => `押して話す（${k}）`, sound: 'サウンド', on: 'オン', off: 'オフ',
    services: '連携サービス',
    counts: { mail: n => `メール ${n}件`, calendar: n => `予定 ${n}件`, drive: n => `ファイル ${n}件`, slack: n => `チャンネル ${n}`, discord: n => `チャンネル ${n}` },
  },
}

const ZH_HANS: SettingsStrings = {
  settings: '设置',
  back: '返回',
  pages: {
    card: { title: '角色', desc: '模型与角色卡' },
    general: { title: '通用', desc: '显示语言、模式和声音' },
    voice: { title: '语音', desc: '语音语言、按住说话、VAD' },
    permissions: { title: '权限', desc: '无需询问即可执行的操作' },
    connectors: { title: '连接', desc: '各服务使用模拟或真实数据' },
    about: { title: '关于', desc: '开源声明' },
  },
  card: {
    model: '模型', modelHint: '每个模型会分别记住自己的角色卡。', inUse: '使用中', switchTo: '切换到此模型',
    cards: '角色卡', cardsHint: m => `为 ${m} 选择角色卡。`, newCard: '新建', duplicate: '复制',
    untitled: '未命名', noDescription: '暂无描述', defaultFor: m => `默认 · ${m}`, custom: '自定义',
    edit: n => `编辑“${n}”`, editHint: '更改会自动保存，并从下一次观察和任务开始生效。',
    resetDefault: '恢复默认', remove: '删除',
    name: '名称', nameSub: '角色显示和自称的名字（最多 40 字）',
    fields: {
      description: { label: '描述', sub: '用一两句话说明角色是谁。' },
      personality: { label: '性格', sub: '气质与习惯。' },
      scenario: { label: '情境', sub: '角色在哪里、如何与用户相遇。' },
      systemPrompt: { label: '系统提示词', sub: '额外指令。安全规则始终优先于此卡。' },
      speakingStyle: { label: '说话风格', sub: '语气与措辞。回复语言仍遵循语音语言。' },
    },
  },
  general: {
    userName: '称呼', userNameHint: '角色会用这个名字称呼你。留空则不使用名字。', userNamePlaceholder: '名字或昵称',
    language: '显示语言', languageHint: '菜单、应用和演示数据会使用此语言。语音语言可在“语音”中单独设置。',
    mode: '模式', modeHint: '安静和观赏模式不会截取屏幕。',
    modes: {
      active: { title: '活跃', desc: '观察屏幕，也会主动搭话' },
      quiet: { title: '安静', desc: '只在被叫到时回答' },
      ornamental: { title: '观赏', desc: '只待在桌面上' },
    },
    sound: '声音', soundDesc: '把台词读出来。关闭后当前台词也会停止。',
  },
  voice: {
    voiceLang: '语音语言', voiceLangHint: '语音识别、回复和角色的声音都使用此语言。',
    followUi: l => `与显示语言相同（${l}）`,
    ptt: '按住说话快捷键', pttHint: mod => `字母和数字键需要与 Ctrl、Alt 或 ${mod} 组合，以免影响在桌面上打字。不含这些修饰键的快捷键在输入框中打字时会被忽略。`,
    pttDefault: '按住说话（默认）', pttRecording: '请按下新的组合键。按 Esc 取消。', pttIdle: '按住即可说话，在桌面任意位置都可用。',
    cancel: '取消', record: '录制快捷键', keyReject: mod => `字母、数字和输入键需要与 Ctrl、Alt 或 ${mod} 组合。`,
    style: '声音风格', styleHint: '角色声音的生成方式。默认为“生动”。',
    styles: {
      lively: { title: '生动（默认）', desc: '口语化、富有表现力，约 0.6 秒' },
      conversational: { title: '对话', desc: '最自然，约 3–4 秒' },
      fast: { title: '快速', desc: '最快，但语调较平' },
    },
    vad: 'VAD', vadHint: '语音活动检测（VAD）可免手动聆听，说完后自动发送。开启时仍可使用按住说话。',
    vadName: '语音活动检测', vadLoading: '正在加载模型…', vadOn: '正在聆听', off: '关闭',
  },
  permissions: {
    hint: '读取始终允许。请选择助手代你操作前何时询问。',
    levels: {
      manual: { title: '手动（默认）', desc: '每次更改和发送前都会询问' },
      auto: { title: '自动', desc: '草稿、日程和提醒自动处理，仅在发送前询问' },
      bypass: { title: '跳过确认', desc: '包括发送邮件和消息在内都不询问' },
    },
    bypassWarn: '跳过确认模式会在不确认的情况下发送邮件和发布消息。仅在信任该请求时使用。',
  },
  connectors: {
    hint: '所有操作都在虚拟桌面上执行。需要确认的范围在“权限”中设置。真实数据读取失败时会改用模拟数据。',
    desc: {
      mail: '阅读、回复、发送、起草和删除邮件',
      calendar: '查看日程、查找冲突、添加和删除日程',
      drive: '搜索和阅读文件',
      slack: '阅读频道、起草和发布消息',
      discord: '阅读频道和发布消息',
    },
    live: '真实', mock: '模拟',
  },
  about: {
    tagline: '和你一起看屏幕、在有帮助时主动开口、并亲手完成你交代的工作的桌面伙伴。',
    notices: '开源声明', noticesHint: '完整的许可证与使用方式列表：仓库根目录下的 THIRD_PARTY_NOTICES.md',
    items: [
      'Live2D 集成、音频管线、口型同步结构，以及此设置和仪表盘窗口的外观。',
      '构建为 WASM 的角色核心。',
      '角色渲染。',
      '应用框架与库。',
      '语音活动检测与口型同步。',
      '服务商 SDK。',
    ],
    notRedistributed: 'Live2D Cubism Core 和角色模型不在仓库中再分发。',
  },
  tray: { watching: s => `正在观看屏幕 · 此画面 ${s} 秒`, paused: '已暂停', pause: '暂停观看', resume: '继续观看', hideChar: '隐藏角色', showChar: '显示角色', quiet: '安静模式', mode: '模式', language: '显示语言', sound: '声音', vad: '免手动语音（VAD）', settings: '设置…', dashboard: '仪表盘…' },
  dash: {
    title: '仪表盘',
    decisions: {
      'idle': '空闲', 'silent': '保持安静', 'acted': '搭话或执行', 'error': '观察出错',
      'budget': '已达预算（使用预设台词）', 'dropped:speaking': '暂缓：你正在说话',
      'dropped:talking': '暂缓：语音仍在播放', 'dropped:busy': '暂缓：正在执行任务',
      'dropped:gap': '暂缓：刚刚说过话',
    },
    ago: s => s < 60 ? `${s} 秒前` : s < 3600 ? `${Math.floor(s / 60)} 分钟前` : `${Math.floor(s / 3600)} 小时前`,
    proactive: '本次会话主动搭话', proactiveLast: a => `最近 ${a}`, proactiveNone: '暂无', lastDecision: '最近一次观察判断', checking: '正在检查屏幕…', noCheck: '尚未检查', dwell: s => `停留 ${s} 秒`,
    tasksRun: '已执行任务', fromScreen: n => `其中 ${n} 个由屏幕提出`,
    drafts: '已保存草稿', draftsBreakdown: (m, s) => `邮件 ${m} · Slack ${s}`,
    dialogue: '最近对话', emptyDialogue: k => `还没有对话。按住 ${k} 或说话按钮打个招呼吧。`, you: '你',
    now: '当前', mode: '模式', model: '模型', character: '角色', voice: '语音',
    speaking: '正在说话', listeningVad: '聆听中（VAD）', ptt: k => `按住说话（${k}）`, sound: '声音', on: '开', off: '关',
    services: '已连接的服务',
    counts: { mail: n => `${n} 封邮件`, calendar: n => `${n} 个日程`, drive: n => `${n} 个文件`, slack: n => `${n} 个频道`, discord: n => `${n} 个频道` },
  },
}

const ZH_HANT: SettingsStrings = {
  settings: '設定',
  back: '返回',
  pages: {
    card: { title: '角色', desc: '模型與角色卡' },
    general: { title: '一般', desc: '顯示語言、模式與聲音' },
    voice: { title: '語音', desc: '語音語言、按住說話、VAD' },
    permissions: { title: '權限', desc: '不需詢問即可執行的操作' },
    connectors: { title: '連結', desc: '各服務使用模擬或真實資料' },
    about: { title: '關於', desc: '開源聲明' },
  },
  card: {
    model: '模型', modelHint: '每個模型會各自記住自己的角色卡。', inUse: '使用中', switchTo: '切換到此模型',
    cards: '角色卡', cardsHint: m => `為 ${m} 選擇角色卡。`, newCard: '新增', duplicate: '複製',
    untitled: '未命名', noDescription: '尚無描述', defaultFor: m => `預設 · ${m}`, custom: '自訂',
    edit: n => `編輯「${n}」`, editHint: '變更會自動儲存，並從下一次觀察與任務開始套用。',
    resetDefault: '還原預設', remove: '刪除',
    name: '名稱', nameSub: '角色顯示與自稱的名字（最多 40 字）',
    fields: {
      description: { label: '描述', sub: '用一兩句話說明角色是誰。' },
      personality: { label: '個性', sub: '氣質與習慣。' },
      scenario: { label: '情境', sub: '角色在哪裡、如何與使用者相遇。' },
      systemPrompt: { label: '系統提示詞', sub: '額外指示。安全規則永遠優先於此卡。' },
      speakingStyle: { label: '說話風格', sub: '語氣與用詞。回覆語言仍依照語音語言。' },
    },
  },
  general: {
    userName: '稱呼', userNameHint: '角色會用這個名字稱呼你。留空則不使用名字。', userNamePlaceholder: '名字或暱稱',
    language: '顯示語言', languageHint: '選單、應用程式與示範資料會使用此語言。語音語言可在「語音」中另外設定。',
    mode: '模式', modeHint: '安靜與觀賞模式不會擷取螢幕。',
    modes: {
      active: { title: '活躍', desc: '觀察螢幕，也會主動搭話' },
      quiet: { title: '安靜', desc: '只在被叫到時回答' },
      ornamental: { title: '觀賞', desc: '只待在桌面上' },
    },
    sound: '聲音', soundDesc: '把台詞念出來。關閉後目前的台詞也會停止。',
  },
  voice: {
    voiceLang: '語音語言', voiceLangHint: '語音辨識、回覆與角色的聲音都使用此語言。',
    followUi: l => `與顯示語言相同（${l}）`,
    ptt: '按住說話快速鍵', pttHint: mod => `字母與數字鍵需搭配 Ctrl、Alt 或 ${mod}，以免影響在桌面上打字。不含這些輔助鍵的快速鍵在輸入框中打字時會被忽略。`,
    pttDefault: '按住說話（預設）', pttRecording: '請按下新的組合鍵。按 Esc 取消。', pttIdle: '按住即可說話，在桌面任何位置都能使用。',
    cancel: '取消', record: '錄製快速鍵', keyReject: mod => `字母、數字與輸入鍵需搭配 Ctrl、Alt 或 ${mod}。`,
    style: '聲音風格', styleHint: '角色聲音的產生方式。預設為「生動」。',
    styles: {
      lively: { title: '生動（預設）', desc: '口語化、富表現力，約 0.6 秒' },
      conversational: { title: '對話', desc: '最自然，約 3–4 秒' },
      fast: { title: '快速', desc: '最快，但語調較平' },
    },
    vad: 'VAD', vadHint: '語音活動偵測（VAD）可免手動聆聽，說完後自動送出。開啟時仍可使用按住說話。',
    vadName: '語音活動偵測', vadLoading: '正在載入模型…', vadOn: '正在聆聽', off: '關閉',
  },
  permissions: {
    hint: '讀取一律允許。請選擇助理代你操作前何時詢問。',
    levels: {
      manual: { title: '手動（預設）', desc: '每次變更與傳送前都會詢問' },
      auto: { title: '自動', desc: '草稿、行程與提醒自動處理，只在傳送前詢問' },
      bypass: { title: '略過確認', desc: '連寄信與傳訊息都不詢問' },
    },
    bypassWarn: '略過確認模式會在未確認的情況下寄出郵件並發布訊息。請只在信任該請求時使用。',
  },
  connectors: {
    hint: '所有操作都在虛擬桌面上執行。需要確認的範圍在「權限」中設定。真實資料讀取失敗時會改用模擬資料。',
    desc: {
      mail: '閱讀、回覆、寄送、草擬與刪除郵件',
      calendar: '查看行程、找出衝突、新增與刪除行程',
      drive: '搜尋與閱讀檔案',
      slack: '閱讀頻道、草擬與發布訊息',
      discord: '閱讀頻道與發布訊息',
    },
    live: '真實', mock: '模擬',
  },
  about: {
    tagline: '陪你一起看螢幕、在有幫助時主動開口，並親手完成你交辦工作的桌面夥伴。',
    notices: '開源聲明', noticesHint: '完整的授權與使用方式清單：儲存庫根目錄的 THIRD_PARTY_NOTICES.md',
    items: [
      'Live2D 整合、音訊管線、嘴型同步結構，以及此設定與儀表板視窗的外觀。',
      '建置為 WASM 的角色核心。',
      '角色繪製。',
      '應用程式框架與函式庫。',
      '語音活動偵測與嘴型同步。',
      '服務商 SDK。',
    ],
    notRedistributed: 'Live2D Cubism Core 與角色模型不在儲存庫中再散布。',
  },
  tray: { watching: s => `正在觀看螢幕 · 此畫面 ${s} 秒`, paused: '已暫停', pause: '暫停觀看', resume: '繼續觀看', hideChar: '隱藏角色', showChar: '顯示角色', quiet: '安靜模式', mode: '模式', language: '顯示語言', sound: '聲音', vad: '免手動語音（VAD）', settings: '設定…', dashboard: '儀表板…' },
  dash: {
    title: '儀表板',
    decisions: {
      'idle': '閒置', 'silent': '保持安靜', 'acted': '搭話或執行', 'error': '觀察錯誤',
      'budget': '已達預算（使用預設台詞）', 'dropped:speaking': '暫緩：你正在說話',
      'dropped:talking': '暫緩：語音仍在播放', 'dropped:busy': '暫緩：正在執行任務',
      'dropped:gap': '暫緩：剛剛說過話',
    },
    ago: s => s < 60 ? `${s} 秒前` : s < 3600 ? `${Math.floor(s / 60)} 分鐘前` : `${Math.floor(s / 3600)} 小時前`,
    proactive: '本次工作階段主動搭話', proactiveLast: a => `最近 ${a}`, proactiveNone: '尚無', lastDecision: '最近一次觀察判斷', checking: '正在檢查螢幕…', noCheck: '尚未檢查', dwell: s => `停留 ${s} 秒`,
    tasksRun: '已執行任務', fromScreen: n => `其中 ${n} 個由螢幕提出`,
    drafts: '已儲存草稿', draftsBreakdown: (m, s) => `郵件 ${m} · Slack ${s}`,
    dialogue: '最近對話', emptyDialogue: k => `還沒有對話。按住 ${k} 或說話按鈕打聲招呼吧。`, you: '你',
    now: '目前', mode: '模式', model: '模型', character: '角色', voice: '語音',
    speaking: '正在說話', listeningVad: '聆聽中（VAD）', ptt: k => `按住說話（${k}）`, sound: '聲音', on: '開', off: '關',
    services: '已連結的服務',
    counts: { mail: n => `${n} 封郵件`, calendar: n => `${n} 個行程`, drive: n => `${n} 個檔案`, slack: n => `${n} 個頻道`, discord: n => `${n} 個頻道` },
  },
}

const STRINGS: Record<Lang, SettingsStrings> = { 'en': EN, 'ko': KO, 'ja': JA, 'zh-Hans': ZH_HANS, 'zh-Hant': ZH_HANT }

export function settingsStrings(lang: Lang): SettingsStrings {
  return STRINGS[lang] ?? EN
}

/** Reactive strings for the current UI language. */
export function useSettingsI18n(getLang: () => Lang) {
  const t = computed(() => settingsStrings(getLang()))
  const bcp47 = computed(() => LANG_INFO[getLang()]?.bcp47 ?? 'en')
  return { t, bcp47 }
}
