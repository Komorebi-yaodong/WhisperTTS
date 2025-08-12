<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { storeToRefs } from 'pinia';
import SettingsModal from './SettingsModal.vue';
import IconSettings from './icons/IconSettings.vue';
import { ElMessage } from 'element-plus'; // [FIX] Import ElMessage

const settingsStore = useSettingsStore();
const { getRandomApiKey, resetTtsState } = settingsStore;
const {
  config,
  ttsInputText,
  ttsSplitOption,
  ttsAudioResults,
  ttsCollapsedChunks
} = storeToRefs(settingsStore);

const isLoading = ref(false);
const isFetchingVoices = ref(false);
const showSettings = ref(false);
const isMerging = ref(false);
const showBackToTop = ref(false);
const scrollContainer = ref(null);

let ttsAbortController = null;
let mergeAbortHandler = null;

watch(() => config.value.selectedVoice, (newValue, oldValue) => {
    if (newValue !== oldValue && oldValue !== undefined) {
        settingsStore.saveSettings({ selectedVoice: newValue });
    }
});

const voiceOptions = computed(() => {
  try {
    const list = JSON.parse(settingsStore.config.voiceList);
    if (Array.isArray(list)) {
      return list.flatMap(item =>
        Object.entries(item).map(([value, text]) => ({ value, text }))
      );
    }
  } catch (e) { return []; }
  return [];
});

const hasSuccessfulChunks = computed(() => ttsAudioResults.value.some(r => r.status === 'success'));
const hasFailedChunks = computed(() => ttsAudioResults.value.some(r => r.status === 'error'));

onMounted(() => {
    const contentEl = document.querySelector('.content');
    if (contentEl) {
        scrollContainer.value = contentEl;
        contentEl.addEventListener('scroll', handleScroll);
    }
});
onUnmounted(() => {
    if (scrollContainer.value) scrollContainer.value.removeEventListener('scroll', handleScroll);
});
function handleScroll(event) { showBackToTop.value = event.target.scrollTop > 200; }
function scrollToTop() { scrollContainer.value?.scrollTo({ top: 0, behavior: 'smooth' }); }

async function handleSaveSettings(newConfig) {
    await settingsStore.saveSettings(newConfig);
    ElMessage.success('设置已保存！'); // Use ElMessage for explicit saves
}

async function fetchVoices() {
  const { TTSapiUrl } = settingsStore.config;
  if (!TTSapiUrl) { ElMessage.error('请先在设置中填写 API 地址。'); return; } // [FIX]
  isFetchingVoices.value = true;
  const headers = { 'Content-Type': 'application/json' };
  const key = getRandomApiKey('TTS');
  if (key) { headers['Authorization'] = `Bearer ${key}`; }
  const endpoints = ['/v1/voices', '/voices', '/v1/voices/all'];
  let fetchedData = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${TTSapiUrl}${endpoint}`, { headers });
      if (response.ok) { fetchedData = await response.json(); break; }
    } catch (error) { console.warn(`尝试 ${endpoint} 失败:`, error); }
  }
  if (fetchedData) {
    let formattedVoices = [];
    if (Array.isArray(fetchedData)) { formattedVoices = fetchedData.map(v => ({ [v.ShortName]: `${v.DisplayName} (${v.Locale})` })); }
    else if (fetchedData.voices && Array.isArray(fetchedData.voices)) { formattedVoices = fetchedData.voices.map(v => ({ [v.id]: v.name })); }
    else { ElMessage.error('无法识别声音列表的格式。'); isFetchingVoices.value = false; return; } // [FIX]
    if (formattedVoices.length > 0) {
      await settingsStore.saveSettings({ voiceList: JSON.stringify(formattedVoices, null, 2) });
      ElMessage.success('声音列表已成功更新！'); // [FIX]
    } else { ElMessage.warning('获取到的声音列表为空。'); } // [FIX]
  } else { ElMessage.error('无法从您的 API 地址获取声音列表，请检查地址和密钥是否正确。'); } // [FIX]
  isFetchingVoices.value = false;
}

function countWords(text) {
  if (!text) return 0;
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
  const nonChineseText = text.replace(/[\u4e00-\u9fa5]/g, ' ');
  const englishWords = nonChineseText.trim().split(/\s+/).filter(Boolean);
  return chineseChars.length + englishWords.length;
}

function splitTextIntoChunks(text, limit) {
  const sentences = text.split(/([.!?;\u3002\uff01\uff1f\uff1b])/g);
  const processedSentences = [];
  for (let i = 0; i < sentences.length; i += 2) {
    if (sentences[i]) processedSentences.push(sentences[i] + (sentences[i + 1] || ''));
  }
  if (processedSentences.length === 0) { const trimmedText = text.trim(); return trimmedText ? [trimmedText] : []; }
  const chunks = [];
  let currentChunk = '';
  for (const sentence of processedSentences) {
    if (countWords(currentChunk) + countWords(sentence) > limit && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else { currentChunk += sentence; }
  }
  if (currentChunk.trim()) chunks.push(currentChunk.trim());
  return chunks.filter(Boolean);
}

async function convertToSpeech() {
  if (isLoading.value) {
    if (ttsAbortController) ttsAbortController.abort();
    isLoading.value = false;
    return;
  }
  if (!ttsInputText.value.trim() || !settingsStore.config.selectedVoice) { ElMessage.warning('请输入文本并选择一个声音。'); return; } // [FIX]
  
  isLoading.value = true;
  resetTtsState();
  ttsAbortController = new AbortController();

  const chunks = ttsSplitOption.value > 0 ? splitTextIntoChunks(ttsInputText.value, ttsSplitOption.value) : [ttsInputText.value.trim()];
  if (chunks.length === 0) { isLoading.value = false; ElMessage.warning('没有可供转换的文本。'); return; } // [FIX]

  ttsAudioResults.value = chunks.map((chunk, index) => ({ id: index, text: chunk, status: 'pending', url: null, blob: null, error: null }));
  chunks.forEach((_, index) => { ttsCollapsedChunks.value[index] = true; });

  const promises = chunks.map((_, index) => fetchSpeechForChunk(index));
  await Promise.allSettled(promises);
  isLoading.value = false;
  ttsAbortController = null;
}

async function fetchSpeechForChunk(index) {
  const chunkData = ttsAudioResults.value[index];
  if (chunkData.status === 'cancelled') return;
  chunkData.status = 'processing';
  const apiKey = getRandomApiKey('TTS');
  if (!apiKey) { chunkData.status = 'error'; chunkData.error = '未配置有效的TTS API密钥'; return; }
  try {
    const response = await fetch(`${settingsStore.config.TTSapiUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: settingsStore.config.TTSmodel, input: chunkData.text, voice: settingsStore.config.selectedVoice }),
      signal: ttsAbortController?.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.json().catch(() => ({}))).error?.message || '请求失败'}`);
    const blob = await response.blob();
    if (blob.size === 0) throw new Error("API返回了空的音频文件");
    chunkData.status = 'success';
    chunkData.url = URL.createObjectURL(blob);
    chunkData.blob = blob;
    chunkData.error = null;
  } catch (error) {
    if (error.name === 'AbortError') {
      chunkData.status = 'cancelled';
      chunkData.error = '用户取消';
    } else {
      chunkData.status = 'error';
      chunkData.error = error.message;
    }
  }
}

function downloadAudio(url) {
  if (!url) return;
  const link = document.createElement('a');
  link.href = url;
  link.download = `tts_chunk_${Date.now()}.mp3`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function toggleCollapse(chunkId) { ttsCollapsedChunks.value[chunkId] = !ttsCollapsedChunks.value[chunkId]; }

async function retryChunk(index) { await fetchSpeechForChunk(index); }

async function retryAllFailed() {
    if (isLoading.value || isMerging.value) return;
    const failedChunks = ttsAudioResults.value.filter(r => r.status === 'error');
    if (failedChunks.length === 0) { ElMessage.warning("没有失败的任务可重试。"); return; } // [FIX]
    isLoading.value = true;
    ttsAbortController = new AbortController();
    const promises = failedChunks.map(chunk => fetchSpeechForChunk(chunk.id));
    await Promise.allSettled(promises);
    isLoading.value = false;
    ttsAbortController = null;
}

async function mergeAndDownload() {
    if (isMerging.value) {
        if (mergeAbortHandler && typeof mergeAbortHandler.kill === 'function') {
            mergeAbortHandler.kill();
        }
        isMerging.value = false;
        return;
    }
    isMerging.value = true;
    try {
        const successfulChunks = ttsAudioResults.value.filter(r => r.status === 'success' && r.blob).sort((a, b) => a.id - b.id);
        if (successfulChunks.length === 0) { ElMessage.warning("没有可合并的成功音频。"); return; } // [FIX]
        ElMessage.info("正在准备文件并合并..."); // [FIX]
        const blobArrayBuffers = await Promise.all(successfulChunks.map(chunk => chunk.blob.arrayBuffer()));
        const mergedFileBuffer = await window.api.mergeBlobsAndGetBuffer(blobArrayBuffers, (handle) => { mergeAbortHandler = handle; });
        if (!mergedFileBuffer) { ElMessage.warning("合并被取消。"); return; } // [FIX]
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([mergedFileBuffer], { type: 'audio/mp3' }));
        link.download = `tts_merged_${Date.now()}.mp3`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        ElMessage.success("合并完成，已开始下载！"); // [FIX]
    } catch (error) {
        ElMessage.error(`合并下载失败: ${error.message}`); // [FIX]
    } finally {
        isMerging.value = false;
        mergeAbortHandler = null;
    }
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
        v-model="ttsInputText"
        class="large-textarea"
        placeholder="在此输入文本...&#10;使用 Ctrl+Enter 快速提交"
        @keydown.ctrl.enter.prevent="convertToSpeech"
      ></textarea>
      
      <div class="options-wrapper">
        <div class="select-wrapper split-options-wrapper">
            <select v-model.number="ttsSplitOption" class="styled-select" title="选择拆分策略">
                <option value="0">不拆分</option>
                <option value="100">100 词/段</option>
                <option value="200">200 词/段</option>
                <option value="500">500 词/段</option>
            </select>
        </div>
        <div class="select-wrapper">
          <!-- [FIX] Bind v-model to config.selectedVoice -->
          <select v-model="config.selectedVoice" class="styled-select" title="选择声音">
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
      </div>

      <div class="action-buttons">
          <button type="submit" class="button-primary" :class="{ 'button-danger': isLoading }" :disabled="isMerging">
            <span v-if="isLoading" class="loader"></span>
            {{ isLoading ? '取消转换' : '转换为语音' }}
          </button>
          <button v-if="!isLoading && hasFailedChunks" type="button" class="button-secondary" @click="retryAllFailed" :disabled="isMerging">
              重试所有失败项
          </button>
          <button v-if="!isLoading && hasSuccessfulChunks" type="button" class="button-success" :class="{ 'button-danger': isMerging }" @click="mergeAndDownload" :disabled="isLoading">
              <span v-if="isMerging" class="loader"></span>
              {{ isMerging ? '取消合并' : '合并并下载' }}
          </button>
      </div>
    </form>

    <div v-if="ttsAudioResults.length > 0" class="result-list">
      <div v-for="(result, index) in ttsAudioResults" :key="result.id" class="chunk-item" :class="result.status">
            <div class="chunk-header" @click="toggleCollapse(result.id)">
                <strong>{{ ttsAudioResults.length > 1 ? `分段 ${result.id + 1}` : `转换任务` }}</strong>
                <div class="header-right">
                  <span class="chunk-status">{{ result.status }}</span>
                  <span class="collapse-icon" :class="{ 'is-expanded': !ttsCollapsedChunks[result.id] }">
                      <svg viewBox="0 0 1024 1024" width="14" height="14"><path d="M765.7 486.8L314.9 134.7c-5.3-4-12.7-3.9-17.9 0.5L230.1 201c-5.5 4.9-5.6 13.5-0.1 18.6l328.8 288.5-328.8 288.5c-5.5 5.1-5.4 13.7 0.1 18.6l66.8 66.1c5.3 4.4 12.7 4.5 17.9 0.5l450.8-352.1c5.3-4.1 5.3-11.4 0-15.6z" fill="currentColor"></path></svg>
                  </span>
                </div>
            </div>
            <div class="chunk-content" v-show="!ttsCollapsedChunks[result.id]">
                <p class="chunk-text">{{ result.text }}</p>
                <div v-if="result.status === 'processing'" class="loader-container"><span class="loader small"></span> 处理中...</div>
                <div v-else-if="result.status === 'success'" class="audio-player-wrapper">
                    <audio :src="result.url" controls></audio>
                    <button @click="downloadAudio(result.url)" class="icon-button download-btn" title="下载此分段">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    </button>
                </div>
                <div v-else-if="result.status === 'error'" class="error-container">
                    <p>失败: {{ result.error }}</p>
                    <button @click="retryChunk(index)" class="retry-button" :disabled="isLoading">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                        重试
                    </button>
                </div>
                 <div v-else-if="result.status === 'cancelled'" class="error-container">
                    <p>任务已取消</p>
                </div>
            </div>
        </div>
    </div>
    
    <Transition name="fade">
        <button v-if="showBackToTop" class="back-to-top" @click="scrollToTop" title="返回顶部">
            <svg viewBox="0 0 1024 1024" width="20" height="20"><path d="M512 378.24l-418.88 418.88L0 704l512-512 512 512-93.12 93.12z" fill="currentColor"></path></svg>
        </button>
    </Transition>

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

.options-wrapper {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 16px;
  align-items: center;
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
  height: 46px; /* Align height with button */
  box-sizing: border-box;
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

.action-buttons {
    display: flex;
    gap: 12px;
}
.button-primary, .button-success, .button-secondary {
  padding: 12px 20px;
  border-radius: 8px;
  border: none;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
}
.button-primary {
    flex-grow: 1;
    background-color: var(--accent-color);
    color: white;
}
.button-success {
    flex-grow: 1;
    background-color: var(--success-color);
    color: white;
}
/* [NEW] Style for the new button */
.button-secondary {
    background-color: #f0f4fa;
    color: var(--secondary-text);
    border: 1px solid var(--border-color);
}
.button-secondary:hover:not(:disabled) {
    background-color: #e4e7ed;
    border-color: #dcdfe6;
}
.button-danger {
    background-color: var(--danger-color) !important;
}

.button-primary:disabled, .button-success:disabled, .button-secondary:disabled {
  background-color: #a9bce2;
  cursor: not-allowed;
}
.button-success:disabled {
    background-color: #b3e1a0;
}
.button-secondary:disabled {
    background-color: #f0f4fa;
    opacity: 0.6;
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

.result-list {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.chunk-item { border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; }
.chunk-header { cursor: pointer; display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background-color: #f7f9fc; border-bottom: 1px solid var(--border-color); font-size: 14px; }
.header-right { display: flex; align-items: center; gap: 12px; }
.collapse-icon { transition: transform 0.2s ease-in-out; color: var(--secondary-text); }
.collapse-icon.is-expanded { transform: rotate(90deg); }
.chunk-item.success { border-left: 4px solid var(--success-color); }
.chunk-item.error { border-left: 4px solid var(--danger-color); }
.chunk-item.processing { border-left: 4px solid var(--accent-color); }
.chunk-item.cancelled { border-left: 4px solid #909399; }

.chunk-status { font-weight: bold; text-transform: capitalize; }
.chunk-item.success .chunk-status { color: var(--success-color); } .chunk-item.error .chunk-status { color: var(--danger-color); } .chunk-item.processing .chunk-status { color: var(--accent-color); } .chunk-item.cancelled .chunk-status { color: #909399; }

.chunk-content { padding: 12px; font-size: 14px; line-height: 1.6; }
.chunk-content .chunk-text { margin: 0 0 12px 0; padding: 10px; background-color: #f0f4fa; border-radius: 6px; color: var(--secondary-text); line-height: 1.5; font-size: 14px; white-space: pre-wrap; word-wrap: break-word; }
.loader-container, .error-container { display: flex; align-items: center; gap: 8px; color: var(--secondary-text); }
.error-container { justify-content: space-between; }
.error-container p { margin: 0; color: var(--danger-color); }
.retry-button { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; font-size: 13px; background-color: #fff0f0; border: 1px solid var(--danger-color); color: var(--danger-color); border-radius: 6px; cursor: pointer; }
.retry-button:disabled { opacity: 0.6; cursor: not-allowed; }

.audio-player-wrapper {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
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
.icon-button.download-btn {
    flex-shrink: 0;
}
.back-to-top { 
    position: fixed; 
    bottom: 40px; 
    right: 40px; 
    width: 44px; 
    height: 44px; 
    border-radius: 50%; 
    background-color: var(--accent-color); 
    color: white; 
    border: none; 
    cursor: pointer; 
    display: flex; 
    align-items: center; 
    justify-content: center; 
    box-shadow: 0 4px 12px rgba(0,0,0,0.15); 
    z-index: 100; 
}
.fade-enter-active, .fade-leave-active { 
    transition: opacity 0.3s ease; 
}
.fade-enter-from, .fade-leave-to { 
    opacity: 0; 
}
</style>