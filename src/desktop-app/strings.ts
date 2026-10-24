// User-visible strings of the desktop shell (tray menu, permission notices).

import type { Lang } from '@shared/languages'

export interface DesktopStrings {
  tray: { show: string, hide: string, agent: string, settings: string, dashboard: string, quit: string }
  /** Bubble when Screen Recording is not allowed yet. */
  screenPermission: string
}

export const DESKTOP_STRINGS: Record<Lang, DesktopStrings> = {
  'en': {
    tray: { show: 'Show YuiYumi', hide: 'Hide YuiYumi', agent: 'Agent…', settings: 'Settings…', dashboard: 'Dashboard…', quit: 'Quit YuiYumi' },
    screenPermission: 'I can\'t see your screen yet. Please allow YuiYumi under System Settings > Privacy & Security > Screen Recording, then restart me.',
  },
  'ja': {
    tray: { show: 'YuiYumi を表示', hide: 'YuiYumi を隠す', agent: 'エージェント…', settings: '設定…', dashboard: 'ダッシュボード…', quit: 'YuiYumi を終了' },
    screenPermission: 'まだ画面が見えないの。システム設定 > プライバシーとセキュリティ > 画面収録 で YuiYumi を許可して、再起動してね。',
  },
  'ko': {
    tray: { show: 'YuiYumi 보이기', hide: 'YuiYumi 숨기기', agent: '에이전트…', settings: '설정…', dashboard: '대시보드…', quit: 'YuiYumi 종료' },
    screenPermission: '아직 화면이 안 보여요. 시스템 설정 > 개인정보 보호 및 보안 > 화면 기록에서 YuiYumi를 허용하고 다시 실행해 주세요.',
  },
  'zh-Hans': {
    tray: { show: '显示 YuiYumi', hide: '隐藏 YuiYumi', agent: '智能体…', settings: '设置…', dashboard: '仪表盘…', quit: '退出 YuiYumi' },
    screenPermission: '我还看不到你的屏幕。请在 系统设置 > 隐私与安全性 > 录屏 中允许 YuiYumi，然后重新启动我。',
  },
  'zh-Hant': {
    tray: { show: '顯示 YuiYumi', hide: '隱藏 YuiYumi', agent: '智慧代理…', settings: '設定…', dashboard: '儀表板…', quit: '結束 YuiYumi' },
    screenPermission: '我還看不到你的螢幕。請在 系統設定 > 隱私權與安全性 > 螢幕錄製 中允許 YuiYumi，然後重新啟動我。',
  },
}
