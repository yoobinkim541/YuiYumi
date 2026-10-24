<script setup lang="ts">
// First-visit welcome, asked by the character in her speech bubble: first the language
// (the browser's language is preselected), then what to call the user, typed into the
// bubble and sent with Enter. The Enter press also unlocks audio, so
// the greeting that follows is heard. Shown once; the name stays editable in
// Settings > General.
import { computed, nextTick, onMounted, ref } from 'vue'
import { LANG_INFO, LANGS, type Lang } from '@shared/languages'
import { bus } from '@/core/bus'
import { usePersona } from '@/stores/persona'
import { USER_NAME_MAX, useSettings } from '@/stores/settings'
import { unlockAudio } from '@/voice'

const settings = useSettings()
const persona = usePersona()
const name = ref(settings.userName)
const input = ref<HTMLInputElement | null>(null)
const step = ref<'lang' | 'name'>('lang')

interface WelcomeStrings {
  hello: (char: string) => string
  ask: string
  placeholder: string
  skip: string
  greet: (user: string, char: string) => string
  greetNoName: (char: string) => string
}

const STRINGS: Record<Lang, WelcomeStrings> = {
  'ko': {
    hello: c => `안녕! 나는 ${c}야.`,
    ask: '뭐라고 불러 줄까?',
    placeholder: '이름이나 별명 쓰고 Enter',
    skip: '건너뛰기',
    greet: (u, c) => `${u}, 반가워! 나는 ${c}야. 화면 같이 보다가 도울 일 있으면 말 걸게.`,
    greetNoName: c => `반가워! 나는 ${c}야. 화면 같이 보다가 도울 일 있으면 말 걸게.`,
  },
  'ja': {
    hello: c => `はじめまして！${c}だよ。`,
    ask: 'なんて呼べばいい？',
    placeholder: '名前やニックネームを入力して Enter',
    skip: 'スキップ',
    greet: (u, c) => `${u}、よろしくね！${c}だよ。一緒に画面を見て、手伝えそうなときは声をかけるね。`,
    greetNoName: c => `よろしくね！${c}だよ。一緒に画面を見て、手伝えそうなときは声をかけるね。`,
  },
  'en': {
    hello: c => `Hi there! I'm ${c}.`,
    ask: 'What should I call you?',
    placeholder: 'Type a name or nickname, then Enter',
    skip: 'Skip',
    greet: (u, c) => `Nice to meet you, ${u}! I'm ${c}. I'll watch the screen with you and speak up when I can help.`,
    greetNoName: c => `Nice to meet you! I'm ${c}. I'll watch the screen with you and speak up when I can help.`,
  },
  'zh-Hans': {
    hello: c => `你好！我是${c}。`,
    ask: '我该怎么称呼你？',
    placeholder: '输入名字或昵称后按 Enter',
    skip: '跳过',
    greet: (u, c) => `${u}，很高兴认识你！我是${c}。我会和你一起看屏幕，需要帮忙时会叫你。`,
    greetNoName: c => `很高兴认识你！我是${c}。我会和你一起看屏幕，需要帮忙时会叫你。`,
  },
  'zh-Hant': {
    hello: c => `你好！我是${c}。`,
    ask: '我該怎麼稱呼你？',
    placeholder: '輸入名字或暱稱後按 Enter',
    skip: '略過',
    greet: (u, c) => `${u}，很高興認識你！我是${c}。我會陪你一起看螢幕，需要幫忙時會叫你。`,
    greetNoName: c => `很高興認識你！我是${c}。我會陪你一起看螢幕，需要幫忙時會叫你。`,
  },
}

const t = computed(() => STRINGS[settings.lang] ?? STRINGS.en)
const charName = computed(() => persona.activeCard.name || 'Yumi')

/** The language step greets in every language at once. */
const LANG_PROMPT = 'Hi! · こんにちは! · 안녕! · 你好!'

function focusInput() {
  // Wait for the bubble's enter transition before taking focus.
  void nextTick(() => setTimeout(() => input.value?.focus({ preventScroll: true }), 300))
}

function pickLang(l: Lang) {
  settings.lang = l
  step.value = 'name'
  focusInput()
}

onMounted(() => { if (step.value === 'name') focusInput() })

function finish(useName: boolean) {
  const n = useName ? name.value.replace(/\s+/g, ' ').trim().slice(0, USER_NAME_MAX) : ''
  if (useName && !n) return
  unlockAudio()
  if (useName) settings.userName = n
  settings.sound = true
  settings.welcomed = true
  const line = n ? t.value.greet(n, charName.value) : t.value.greetNoName(charName.value)
  // The regular speech bubble takes over and shows the greeting.
  setTimeout(() => bus.emit('character:react', { emotion: 'happy', line, source: 'fallback' }), 250)
}

function onKey(e: KeyboardEvent) {
  // Keep typing out of push-to-talk and the desktop shortcuts.
  e.stopPropagation()
  if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); finish(true) }
}
</script>

<template>
  <div v-if="step === 'lang'" class="speech-bubble welcome" data-no-capture @pointerdown.stop>
    <p class="ask">{{ LANG_PROMPT }}</p>
    <div class="langs" role="radiogroup" aria-label="Language">
      <button
        v-for="l in LANGS" :key="l" type="button" role="radio" class="lang"
        :class="{ on: settings.lang === l }" :aria-checked="settings.lang === l" :lang="LANG_INFO[l].bcp47"
        @click="pickLang(l)"
      >
        {{ LANG_INFO[l].label }}
      </button>
    </div>
  </div>
  <form v-else class="speech-bubble welcome" data-no-capture @submit.prevent="finish(true)" @pointerdown.stop>
    <p class="hello">{{ t.hello(charName) }}</p>
    <p class="ask">{{ t.ask }}</p>
    <input
      ref="input" v-model="name" class="name" type="text" :maxlength="USER_NAME_MAX"
      :placeholder="t.placeholder" autocomplete="nickname" enterkeyhint="done" :aria-label="t.ask"
      @keydown="onKey" @keyup.stop
    >
    <div class="foot">
      <button type="button" class="skip" @click="step = 'lang'">{{ LANG_INFO[settings.lang].label }} ▾</button>
      <button type="button" class="skip" @click="finish(false)">{{ t.skip }}</button>
    </div>
  </form>
</template>

<style scoped>
/* Same look as SpeechBubble.vue, with an input line. */
.speech-bubble {
  position: relative;
  width: 300px;
  padding: 12px 14px 10px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.97);
  color: #2a2230;
  font-size: 15px;
  line-height: 1.45;
  box-shadow: 0 6px 20px rgba(40, 20, 60, 0.18);
  word-break: keep-all;
  overflow-wrap: anywhere;
  pointer-events: auto;
  animation: pop 0.32s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
}
.speech-bubble::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -9px;
  transform: translateX(-50%);
  border: 10px solid transparent;
  border-top-color: rgba(255, 255, 255, 0.97);
  border-bottom: 0;
}
.hello { margin: 0; color: #6f6580; font-size: 14px; }
.ask { margin: 0 0 8px; font-weight: 650; }
.name {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1.5px solid #e4deec;
  border-radius: 10px;
  background: #fff;
  font: inherit;
  font-size: 14px;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.name:focus { border-color: #f48aa8; box-shadow: 0 0 0 3px rgba(244, 138, 168, 0.18); }
.langs { display: flex; flex-wrap: wrap; gap: 6px; }
.lang {
  padding: 5px 11px;
  border: 1px solid #e6e1ee;
  border-radius: 999px;
  background: #fff;
  color: #4a4058;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.lang:hover { border-color: #f3a6bb; }
.lang.on { background: #ffe8ef; border-color: #f48aa8; color: #d23d66; }
.foot { display: flex; justify-content: space-between; margin-top: 6px; }
.skip {
  display: block;
  padding: 2px 4px;
  border: 0;
  background: none;
  color: #a39bb0;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.skip:hover { color: #5d5370; }
@keyframes pop { from { opacity: 0; transform: translateY(8px) scale(0.96); } }
</style>
