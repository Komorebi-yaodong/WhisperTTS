<script setup>
import { ref, computed } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import SettingsModal from './SettingsModal.vue';
import IconSettings from './icons/IconSettings.vue';

const settingsStore = useSettingsStore();
const { getRandomApiKey } = settingsStore;
const inputText = ref('');
const isLoading = ref(false);
const isFetchingVoices = ref(false);
const audioUrl = ref('');
const showSettings = ref(false);

const voiceOptions = computed(() => {
  try {
    const list = JSON.parse(settingsStore.config.voiceList);
    if (Array.isArray(list)) {
      return list.flatMap(item => 
        Object.entries(item).map(([value, text]) => ({ value, text }))
      );
    }
  } catch (e) {
    console.error("解析声音列表失败:", e);
    return [];
  }
  return [];
});

async function handleSaveSettings(newConfig) {
  await settingsStore.saveSettings(newConfig);
}

/**
 * 自动获取声音列表的函数
 */
async function fetchVoices() {
  const { TTSapiUrl, TTSapiKey } = settingsStore.config;
  if (!TTSapiUrl) {
    utools.showNotification('请先在设置中填写 API 地址。');
    return;
  }
  isFetchingVoices.value = true;

  const headers = { 'Content-Type': 'application/json' };
  if (TTSapiKey) {
    headers['Authorization'] = `Bearer ${TTSapiKey}`;
  }

  // 尝试多种常见的 API 端点
  const endpoints = ['/v1/voices', '/voices', '/v1/voices/all'];
  let fetchedData = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${TTSapiUrl}${endpoint}`, { headers });
      if (response.ok) {
        fetchedData = await response.json();
        break; // 成功获取，跳出循环
      }
    } catch (error) {
      console.warn(`尝试 ${endpoint} 失败:`, error);
    }
  }

  if (fetchedData) {
    // 解析获取到的数据并格式化
    let formattedVoices = [];
    if (Array.isArray(fetchedData)) { // 兼容 Azure 格式
      formattedVoices = fetchedData.map(v => ({ [v.ShortName]: `${v.DisplayName} (${v.Locale})` }));
    } else if (fetchedData.voices && Array.isArray(fetchedData.voices)) { // 兼容 OpenAI /v1/voices 格式
      formattedVoices = fetchedData.voices.map(v => ({ [v.id]: v.name }));
    } else {
        utools.showNotification('无法识别声音列表的格式。');
        isFetchingVoices.value = false;
        return;
    }

    if (formattedVoices.length > 0) {
      // 更新到 Pinia Store
      await settingsStore.saveSettings({ voiceList: JSON.stringify(formattedVoices, null, 2) });
      utools.showNotification('声音列表已成功更新！');
    } else {
        utools.showNotification('获取到的声音列表为空。');
    }
  } else {
    utools.showNotification('无法从您的 API 地址获取声音列表，请检查地址和密钥是否正确。');
  }

  isFetchingVoices.value = false;
}

async function convertToSpeech() {
  if (!inputText.value.trim() || !settingsStore.config.selectedVoice) {
    utools.showNotification('请输入文本并选择一个声音。');
    return;
  }
  const apiKey = getRandomApiKey('TTS');
  if (!apiKey) {
      utools.showNotification('请先在设置中配置有效的 TTS API 密钥。');
      return;
  }
  isLoading.value = true;
  audioUrl.value = '';

  try {
    const response = await fetch(`${settingsStore.config.TTSapiUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: settingsStore.config.TTSmodel,
        input: inputText.value,
        voice: settingsStore.config.selectedVoice,
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({'error': { 'message': '未知错误' }}));
      throw new Error(`HTTP 错误 ${response.status}: ${errorData.error.message || '请求失败'}`);
    }

    const blob = await response.blob();
    audioUrl.value = URL.createObjectURL(blob);
  } catch (error) {
    utools.showNotification('错误: ' + error.message);
  } finally {
    isLoading.value = false;
  }
}

function downloadAudio() {
  if (!audioUrl.value) return;
  const link = document.createElement('a');
  link.href = audioUrl.value;
  link.download = `tts_${Date.now()}.mp3`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
</script>

<template>
  <div class="tts-container component-container">
    <div class="component-header">
      <h2>文本转语音 (TTS)</h2>
      <button class="icon-button" @click="showSettings = true" title="TTS 设置">
        <IconSettings />
      </button>
    </div>
    
    <form @submit.prevent="convertToSpeech" class="form-layout">
      <textarea
        v-model="inputText"
        class="large-textarea"
        placeholder="在此输入文本...&#10;使用 Ctrl+Enter 快速提交"
        @keydown.ctrl.enter.prevent="convertToSpeech"
      ></textarea>
      
      <div class="select-wrapper">
        <select v-model="settingsStore.config.selectedVoice" class="styled-select">
          <option disabled value="">-- 请选择一个声音 --</option>
          <option v-for="voice in voiceOptions" :key="voice.value" :value="voice.value">
            {{ voice.text }}
          </option>
        </select>
        <button type="button" @click="fetchVoices" class="refresh-button" title="刷新声音列表" :disabled="isFetchingVoices">
            <span v-if="isFetchingVoices" class="loader small"></span>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
        </button>
      </div>

      <button type="submit" class="button-primary" :disabled="isLoading">
        <span v-if="isLoading" class="loader"></span>
        <span v-else>转换为语音</span>
      </button>
    </form>

    <div v-if="audioUrl" class="audio-player-wrapper">
      <audio :src="audioUrl" controls autoplay></audio>
      <button @click="downloadAudio" class="icon-button" title="下载音频">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
      </button>
    </div>

    <SettingsModal 
      :show="showSettings" 
      type="TTS" 
      @close="showSettings = false"
      @save="handleSaveSettings"
    />
  </div>
</template>

<style scoped>
/* Scoped Styles */
.form-layout {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.large-textarea {
  width: 100%;
  min-height: 150px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 16px;
  resize: vertical;
  box-sizing: border-box;
}
.select-wrapper {
  display: flex;
  gap: 8px;
  align-items: center;
}
.styled-select {
  flex-grow: 1;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background-color: white;
  font-size: 16px;
  /*-webkit-appearance: none; 
  -moz-appearance: none;
  appearance: none;*/
}
.refresh-button {
  flex-shrink: 0;
  height: 46px;
  width: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background-color: #f9fafb;
  cursor: pointer;
  color: var(--secondary-text);
  transition: all 0.2s;
}
.refresh-button:hover:not(:disabled) {
  background-color: #f0f4fa;
  color: var(--accent-color);
  border-color: var(--accent-color);
}
.refresh-button:disabled {
    cursor: not-allowed;
    opacity: 0.7;
}
.button-primary {
  padding: 12px 20px;
  border-radius: 8px;
  border: none;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  background-color: var(--accent-color);
  color: white;
  transition: all 0.2s;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
}
.button-primary:disabled {
  background-color: #a9bce2;
  cursor: not-allowed;
}
.loader {
  border: 3px solid #f3f3f3;
  border-top: 3px solid #fff;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  animation: spin 1s linear infinite;
}
.loader.small {
    width: 16px;
    height: 16px;
    border-width: 2px;
    border-top-color: var(--accent-color);
}
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.audio-player-wrapper {
  margin-top: 24px;
  display: flex;
  align-items: center;
  gap: 16px;
}
audio {
  width: 100%;
  flex-grow: 1;
}
.icon-button {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--secondary-text);
  transition: background-color 0.2s, color 0.2s;
}
.icon-button:hover {
  background-color: #eef0f2;
  color: var(--primary-text);
}
</style>