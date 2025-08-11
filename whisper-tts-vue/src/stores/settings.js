import { reactive } from 'vue'
import { defineStore } from 'pinia'

export const useSettingsStore = defineStore('settings', () => {
  // 使用 reactive 来管理整个配置对象，确保深层对象的响应性
  const config = reactive({
    TTSapiUrl: "https://api.openai.com",
    TTSapiKey: "",
    voiceList: JSON.stringify([{ "alloy": "Alloy" }, { "echo": "Echo" }, { "fable": "Fable" }, { "onyx": "Onyx" }, { "nova": "Nova" }, { "shimmer": "Shimmer" }]),
    selectedVoice: "alloy",
    TTSmodel: "tts-1",
    WhisperapiUrl: "https://api.groq.com/openai",
    WhisperapiKey: "",
    WhisperapiModel: "whisper-large-v3"
  })

  // 从 utools.db 加载配置
  async function loadSettings() {
    // 调用 preload.js 中的函数
    const savedConfig = await window.api.getConfig()
    // 合并加载的配置到响应式对象中
    Object.assign(config, savedConfig)
  }

  // 保存配置到 utools.db
  async function saveSettings(newConfig) {
    // 更新 Pinia store 的状态
    Object.assign(config, newConfig)
    // 通过 preload.js 更新 utools.db
    await window.api.updateConfig(newConfig)
    utools.showNotification('设置已保存！') // 中文化
  }

  return { config, loadSettings, saveSettings }
})