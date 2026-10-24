<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDemo } from '@/stores/demo'
import { timeLabel } from '../format'
import { useDesktopStrings } from '../i18n'
import { setWindowTitle } from '../windows'

const demo = useDemo()
const { locale } = useDesktopStrings()
const selectedId = ref<string | null>('file-quote')
const files = computed(() => [...demo.files].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)))
const selected = computed(() => demo.files.find(f => f.id === selectedId.value) ?? null)

function kind(mime: string): { label: string, color: string } {
  if (mime.includes('word')) return { label: 'DOC', color: '#2563eb' }
  if (mime.includes('sheet')) return { label: 'XLS', color: '#16a34a' }
  if (mime.includes('pdf')) return { label: 'PDF', color: '#dc2626' }
  return { label: 'TXT', color: '#6b7280' }
}

watch(selected, f => setWindowTitle('drive', f ? `Drive — ${f.name}` : 'Drive — My Drive'), { immediate: true })
</script>

<template>
  <div class="drive">
    <div class="list">
      <div class="head">My Drive</div>
      <div class="cols"><span>Name</span><span>Modified</span></div>
      <button v-for="f in files" :key="f.id" class="row" :class="{ on: f.id === selectedId }" @click="selectedId = f.id">
        <span class="name"><span class="kind" :style="{ background: kind(f.mimeType).color }">{{ kind(f.mimeType).label }}</span>{{ f.name }}</span>
        <span class="time">{{ timeLabel(f.modifiedAt, undefined, locale) }}</span>
      </button>
    </div>
    <main class="preview">
      <template v-if="selected">
        <div class="pv-name">{{ selected.name }}</div>
        <pre class="pv-body">{{ selected.content }}</pre>
      </template>
      <div v-else class="empty">Select a file to preview</div>
    </main>
  </div>
</template>

<style scoped>
.drive { display: flex; height: 100%; font-size: 19px; }
.list { width: 560px; flex: 0 0 560px; border-right: 1px solid #e5e7eb; }
.head { font-size: 24px; font-weight: 800; padding: 16px 20px 8px; }
.cols { display: flex; justify-content: space-between; padding: 6px 20px; font-size: 15px; color: #6b7280; border-bottom: 1px solid #eef0f4; }
.row { display: flex; width: 100%; justify-content: space-between; align-items: center; gap: 10px; border: none; border-bottom: 1px solid #f1f3f6; background: #fff; padding: 12px 20px; cursor: pointer; font-family: inherit; font-size: 18px; text-align: left; }
.row.on { background: #e6f4ea; }
.name { display: flex; align-items: center; gap: 10px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kind { color: #fff; font-size: 12px; font-weight: 800; border-radius: 5px; padding: 3px 6px; flex: 0 0 auto; }
.time { font-size: 15px; color: #6b7280; flex: 0 0 auto; }
.preview { flex: 1; padding: 24px 30px; background: #f8fafc; overflow: hidden; }
.pv-name { font-size: 22px; font-weight: 700; margin-bottom: 14px; }
.pv-body { white-space: pre-wrap; font-family: inherit; font-size: 19px; line-height: 1.6; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px 24px; margin: 0; }
.empty { color: #9ca3af; }
</style>
