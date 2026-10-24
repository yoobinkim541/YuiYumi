<script setup lang="ts">
// First-visit welcome: pick the language, tell the character what to call you, start.
// The start click also unlocks audio, so the first greeting is heard. Shown once; the
// name stays editable in Settings > General.
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

interface WelcomeStrings {
  hello: (char: string) => string
  ask: string
  placeholder: string
  start: string
  skip: string
  note: string
  greet: (user: string, char: string) => string
  greetNoName: (char: string) => string
}

const STRINGS: Record<Lang, WelcomeStrings> = {
  'ko': {
    hello: c => `처음 뵙겠습니다! 저는 ${c}예요.`,
    ask: '뭐라고 불러 드릴까요?',
    placeholder: '이름이나 별명',
    start: '시작하기',
    skip: '건너뛰기',
    note: '설정 > 일반에서 언제든 바꿀 수 있어요. 시작하면 소리가 켜져요.',
    greet: (u, c) => `${u}, 반가워요! 저는 ${c}예요. 화면 같이 보다가 도울 일 있으면 말 걸게요.`,
    greetNoName: c => `반가워요! 저는 ${c}예요. 화면 같이 보다가 도울 일 있으면 말 걸게요.`,
  },
  'ja': {
    hello: c => `はじめまして！${c}です。`,
    ask: 'なんて呼べばいいですか？',
    placeholder: '名前やニックネーム',
    start: 'はじめる',
    skip: 'スキップ',
    note: '設定 > 一般でいつでも変えられます。はじめると音声がオンになります。',
    greet: (u, c) => `${u}さん、よろしくお願いします！${c}です。一緒に画面を見ながら、手伝えそうなときは声をかけますね。`,
    greetNoName: c => `よろしくお願いします！${c}です。一緒に画面を見ながら、手伝えそうなときは声をかけますね。`,
  },
  'en': {
    hello: c => `Hi there! I'm ${c}.`,
    ask: 'What should I call you?',
    placeholder: 'Name or nickname',
    start: 'Start',
    skip: 'Skip',
    note: 'You can change it anytime in Settings > General. Starting turns the sound on.',
    greet: (u, c) => `Nice to meet you, ${u}! I'm ${c}. I'll watch the screen with you and speak up when I can help.`,
    greetNoName: c => `Nice to meet you! I'm ${c}. I'll watch the screen with you and speak up when I can help.`,
  },
  'zh-Hans': {
    hello: c => `初次见面！我是${c}。`,
    ask: '我该怎么称呼你？',
    placeholder: '名字或昵称',
    start: '开始',
    skip: '跳过',
    note: '随时可以在 设置 > 通用 中修改。开始后会打开声音。',
    greet: (u, c) => `${u}，很高兴认识你！我是${c}。我会和你一起看屏幕，需要帮忙时会叫你。`,
    greetNoName: c => `很高兴认识你！我是${c}。我会和你一起看屏幕，需要帮忙时会叫你。`,
  },
  'zh-Hant': {
    hello: c => `初次見面！我是${c}。`,
    ask: '我該怎麼稱呼你？',
    placeholder: '名字或暱稱',
    start: '開始',
    skip: '略過',
    note: '隨時可以在 設定 > 一般 中修改。開始後會開啟聲音。',
    greet: (u, c) => `${u}，很高興認識你！我是${c}。我會陪你一起看螢幕，需要幫忙時會叫你。`,
    greetNoName: c => `很高興認識你！我是${c}。我會陪你一起看螢幕，需要幫忙時會叫你。`,
  },
}

const t = computed(() => STRINGS[settings.lang] ?? STRINGS.en)
const charName = computed(() => persona.activeCard.name || 'Yumi')

onMounted(() => { void nextTick(() => input.value?.focus()) })

function finish(useName: boolean) {
  unlockAudio()
  const n = useName ? name.value.replace(/\s+/g, ' ').trim().slice(0, USER_NAME_MAX) : ''
  if (useName) settings.userName = n
  settings.sound = true
  settings.welcomed = true
  const line = n ? t.value.greet(n, charName.value) : t.value.greetNoName(charName.value)
  // Let the overlay fade first so the greeting lands on the visible character.
  setTimeout(() => bus.emit('character:react', { emotion: 'happy', line, source: 'fallback' }), 350)
}
</script>

<template>
  <Transition name="welcome">
    <div v-if="!settings.welcomed" class="welcome" data-no-capture :lang="LANG_INFO[settings.lang].bcp47">
      <form class="card" @submit.prevent="finish(true)">
        <div class="langs" role="radiogroup" aria-label="Language">
          <button
            v-for="l in LANGS" :key="l" type="button" role="radio" class="lang"
            :class="{ on: settings.lang === l }" :aria-checked="settings.lang === l"
            @click="settings.lang = l"
          >
            {{ LANG_INFO[l].label }}
          </button>
        </div>
        <p class="hello">{{ t.hello(charName) }}</p>
        <h1 class="ask">{{ t.ask }}</h1>
        <input
          ref="input" v-model="name" class="name" type="text" :maxlength="USER_NAME_MAX"
          :placeholder="t.placeholder" autocomplete="nickname" :aria-label="t.ask"
        >
        <div class="actions">
          <button type="button" class="skip" @click="finish(false)">{{ t.skip }}</button>
          <button type="submit" class="start" :disabled="!name.trim()">{{ t.start }}</button>
        </div>
        <p class="note">{{ t.note }}</p>
      </form>
    </div>
  </Transition>
</template>

<style scoped>
.welcome {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 7vh;
  background: rgba(24, 18, 34, 0.28);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}
.card {
  width: min(440px, calc(100vw - 32px));
  padding: 22px 24px 18px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 24px 60px rgba(40, 24, 70, 0.28), 0 2px 6px rgba(40, 24, 70, 0.12);
  font-family: system-ui, -apple-system, 'Apple SD Gothic Neo', 'Hiragino Sans', 'PingFang TC', 'PingFang SC', sans-serif;
  color: #2c2438;
  animation: pop 0.32s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
}
.langs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
.lang {
  padding: 4px 10px;
  border: 1px solid #e6e1ee;
  border-radius: 999px;
  background: #fff;
  color: #6b6178;
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.lang:hover { border-color: #f3a6bb; }
.lang.on { background: #ffe8ef; border-color: #f48aa8; color: #d23d66; }
.hello { margin: 0 0 4px; font-size: 14px; color: #8a7f98; }
.ask { margin: 0 0 14px; font-size: 22px; font-weight: 650; letter-spacing: -0.01em; }
.name {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  border: 1.5px solid #e2dcea;
  border-radius: 12px;
  font: inherit;
  font-size: 16px;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.name:focus { border-color: #f48aa8; box-shadow: 0 0 0 4px rgba(244, 138, 168, 0.18); }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
.skip, .start {
  padding: 9px 18px;
  border-radius: 10px;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.skip { border: 0; background: transparent; color: #8a7f98; }
.skip:hover { color: #4a3f5c; }
.start { border: 0; background: linear-gradient(180deg, #ff7d9f, #ec4f7c); color: #fff; box-shadow: 0 4px 12px rgba(236, 79, 124, 0.3); }
.start:disabled { opacity: 0.45; cursor: default; box-shadow: none; }
.note { margin: 12px 0 0; font-size: 12px; color: #a39bb0; }
.welcome-leave-active { transition: opacity 0.3s ease; }
.welcome-leave-to { opacity: 0; }
@keyframes pop { from { opacity: 0; transform: translateY(10px) scale(0.97); } }
</style>
