<script setup>
import { ref, onMounted, shallowRef } from 'vue'
import TTS from './components/TTS.vue'
import Whisper from './components/Whisper.vue'
import { useSettingsStore } from './stores/settings'

const settingsStore = useSettingsStore()
onMounted(() => {
  settingsStore.loadSettings()
})

const tabs = {
  'TTS-文本转语音': TTS,
  'STT-语音转文本': Whisper
}
const activeTabName = ref('TTS-文本转语音')
const activeTab = shallowRef(TTS) 

function switchTab(tabName, tabComponent) {
  activeTabName.value = tabName
  activeTab.value = tabComponent
}
</script>

<template>
  <div class="app-container">
    <header class="tabs">
      <button 
        v-for="(component, name) in tabs" 
        :key="name" 
        :class="['tab-button', { active: activeTabName === name }]"
        @click="switchTab(name, component)">
        {{ name }}
      </button>
    </header>
    <main class="content">
      <Transition name="fade" mode="out-in">
        <component :is="activeTab" />
      </Transition>
    </main>
  </div>
</template>

<style>
:root {
  --primary-bg: #ffffff;
  --secondary-bg: #f7f7f8;
  --container-bg: #fdfdfd;
  --primary-text: #2c3e50;
  --secondary-text: #5a6a7a;
  --accent-color: #4a69bd;
  --accent-hover: #5d81d1;
  --border-color: #e4e7ed;
  --shadow-color: rgba(0, 0, 0, 0.08);
  --danger-color: #f56c6c;
  --success-color: #67c23a;
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

body {
  margin: 0;
  font-family: var(--font-sans);
  background-color: var(--primary-bg);
  color: var(--primary-text);
  overflow: hidden;
  height: 100vh;
}

.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.tabs {
  display: flex;
  justify-content: center;
  padding: 10px;
  background-color: var(--secondary-bg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.tab-button {
  padding: 8px 20px;
  border: none;
  background-color: transparent;
  cursor: pointer;
  font-size: 16px;
  color: var(--secondary-text);
  border-radius: 8px;
  transition: background-color 0.2s, color 0.2s, box-shadow 0.2s;
  margin: 0 5px;
  font-weight: 500;
}

.tab-button:hover {
  background-color: #eef0f2;
  color: var(--primary-text);
}

.tab-button.active {
  background-color: var(--accent-color);
  color: white;
  box-shadow: 0 2px 4px rgba(74, 105, 189, 0.3);
}

.content {
  flex-grow: 1;
  padding: 16px 24px; /* Reduced top/bottom padding */
  overflow-y: auto;
  background-color: var(--secondary-bg);
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.component-container {
  background: var(--container-bg);
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 4px 12px var(--shadow-color);
}

.component-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 15px;
}

.component-header h2 {
  margin: 0;
  font-size: 24px;
  color: var(--primary-text);
}
</style>