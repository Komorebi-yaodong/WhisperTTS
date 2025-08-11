<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { storeToRefs } from 'pinia';
import SettingsModal from './SettingsModal.vue';
import IconSettings from './icons/IconSettings.vue';

const settingsStore = useSettingsStore();
const { 
    config, 
    transcriptionChunkResults, 
    sttSelectedFile, 
    sttFilePreviewUrl, 
    sttFileDisplayName 
} = storeToRefs(settingsStore);
const { resetTranscriptionState, getRandomApiKey, setSttFile, clearSttFile } = settingsStore;

const format = ref('txt');
const language = ref('');
const showSettings = ref(false);
const chunkOption = ref(0);
const preparationMessage = ref('');
const transcriptionMode = ref('transcribe');
const collapsedChunks = ref({});
const showBackToTop = ref(false);
const scrollContainer = ref(null);

const isProcessing = computed(() => {
    if (preparationMessage.value) return true;
    return transcriptionChunkResults.value.some(c => c.status === 'pending' || c.status === 'processing');
});
const allTasksFinished = computed(() => {
    if (transcriptionChunkResults.value.length === 0) return true;
    return !isProcessing.value;
});
const completedChunksCount = computed(() => {
    return transcriptionChunkResults.value.filter(c => c.status === 'success' || c.status === 'error').length;
});
const finalResultText = computed(() => {
  const successfulChunks = transcriptionChunkResults.value.filter(c => c.status === 'success');
  if (successfulChunks.length === 0) return '';
  if (format.value === 'srt') {
    let globalSrtIndex = 1;
    const allBlocks = successfulChunks.map(chunk => {
      return chunk.result.split('\n\n').map(block => {
        if (!block.trim()) return null;
        const lines = block.split('\n');
        lines[0] = globalSrtIndex++;
        return lines.join('\n');
      }).filter(Boolean);
    });
    return allBlocks.flat().join('\n\n');
  }
  return successfulChunks.map(c => c.result).join('\n\n');
});

onMounted(() => {
    const contentEl = document.querySelector('.content');
    if (contentEl) {
        scrollContainer.value = contentEl;
        contentEl.addEventListener('scroll', handleScroll);
    }
});
onUnmounted(() => {
    if (scrollContainer.value) {
        scrollContainer.value.removeEventListener('scroll', handleScroll);
    }
});
function handleScroll(event) {
    showBackToTop.value = event.target.scrollTop > 200;
}
function scrollToTop() {
    scrollContainer.value?.scrollTo({ top: 0, behavior: 'smooth' });
}
function handleFileSelect(file) {
    if (file && file.type.startsWith('audio/')) {
        setSttFile(file);
        resetTaskState();
    } else {
        utools.showNotification('请选择一个有效的音频文件。');
    }
}
function onFileChange(event) { handleFileSelect(event.target.files[0]); }
function onFileDrop(event) { event.preventDefault(); handleFileSelect(event.dataTransfer.files[0]); }
function deleteFile() {
    clearSttFile();
    resetTaskState();
}
function toggleCollapse(chunkId) {
    collapsedChunks.value[chunkId] = !collapsedChunks.value[chunkId];
}
function resetTaskState() {
    resetTranscriptionState();
    collapsedChunks.value = {};
}

async function startProcessing() {
    if (!sttSelectedFile.value) {
        utools.showNotification('请先上传一个音频文件。'); return;
    }
    resetTaskState();
    const endpoint = transcriptionMode.value === 'translate' ? '/v1/audio/translations' : '/v1/audio/transcriptions';
    try {
        preparationMessage.value = '准备文件中...';
        const fileBuffer = await sttSelectedFile.value.arrayBuffer();
        const tempInputPath = await window.api.saveFileToTemp(fileBuffer, sttSelectedFile.value.name);
        
        let taskPaths = [];
        if (chunkOption.value > 0) {
            preparationMessage.value = '正在切分音频...';
            taskPaths = await window.api.sliceAudioWithFFmpeg(tempInputPath, chunkOption.value * 60);
        } else {
            taskPaths = [tempInputPath];
        }
        
        preparationMessage.value = '';

        const tasks = taskPaths.map((path, index) => {
            transcriptionChunkResults.value.push({
                id: index, status: 'pending', result: null, errorMessage: null,
                filePath: path, startTime: index * (chunkOption.value * 60)
            });
            // **FIX**: Set default state to collapsed
            collapsedChunks.value[index] = true; 
            return transcribeChunk(index, endpoint);
        });
        await Promise.all(tasks);
    } catch (error) {
        utools.showNotification(`处理失败: ${error.message}`);
        resetTaskState();
    } finally {
        preparationMessage.value = '';
    }
}

async function transcribeChunk(chunkIndex, endpoint) {
    let chunkState = transcriptionChunkResults.value[chunkIndex];
    transcriptionChunkResults.value.splice(chunkIndex, 1, { ...chunkState, status: 'processing' });
    try {
        let finalFilePath = chunkState.filePath;
        if (finalFilePath.toLowerCase().endsWith('.wav')) {
            chunkState = { ...chunkState, message: '压缩中...' };
            transcriptionChunkResults.value.splice(chunkIndex, 1, chunkState);
            finalFilePath = await window.api.compressAudioToMp3(finalFilePath);
        }
        const audioBlob = await getBlobFromPath(finalFilePath);
        const result = await transcribeApiCall(audioBlob, chunkState.startTime || 0, endpoint);
        transcriptionChunkResults.value.splice(chunkIndex, 1, { ...chunkState, status: 'success', result, message: '' });
    } catch (error) {
        transcriptionChunkResults.value.splice(chunkIndex, 1, { ...chunkState, status: 'error', errorMessage: error.message, message: '' });
    }
}

async function getBlobFromPath(filePath) {
    const buffer = await window.api.readFileAsBuffer(filePath);
    const ext = filePath.split('.').pop().toLowerCase();
    const mimeTypes = { 'mp3': 'audio/mpeg', 'm4a': 'audio/mp4', 'wav': 'audio/wav', 'ogg': 'audio/ogg' };
    return new Blob([buffer], { type: mimeTypes[ext] || 'audio/wav' });
}

async function retryChunk(chunkState) {
    const chunkIndex = transcriptionChunkResults.value.findIndex(c => c.id === chunkState.id);
    if (chunkIndex !== -1) {
        const endpoint = transcriptionMode.value === 'translate' ? '/v1/audio/translations' : '/v1/audio/transcriptions';
        await transcribeChunk(chunkIndex, endpoint);
    }
}

async function transcribeApiCall(audioBlob, startTime, endpoint) {
    const apiKey = getRandomApiKey('Whisper');
    if (!apiKey) throw new Error("未配置有效的 Whisper API 密钥。");

    const sizeInMB = audioBlob.size / 1024 / 1024;
    console.log(`[WhisperTTS] 发送分片 #${Math.round(startTime / (chunkOption.value*60))}, 大小: ${sizeInMB.toFixed(2)} MB`);

    const formData = new FormData();
    formData.append("file", audioBlob, `chunk.${audioBlob.type.split('/')[1] || 'mp3'}`);
    formData.append("model", config.value.WhisperapiModel);
    formData.append("response_format", "verbose_json");
    if (language.value && endpoint.includes('transcriptions')) {
        formData.append("language", language.value);
    }

    const response = await fetch(`${config.value.WhisperapiUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({'error': { 'message': '未知错误' }}));
        throw new Error(`HTTP ${response.status}: ${errorData.error?.message || '请求失败'}`);
    }

    const data = await response.json();
    return format.value === 'srt' ? correctSrtTimestamps(data.segments, startTime) : data.text;
}

function downloadResult() {
    if (!finalResultText.value) return;
    const blob = new Blob([finalResultText.value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `result_${Date.now()}.${format.value}`;
    link.click();
    URL.revokeObjectURL(url);
}
function correctSrtTimestamps(segments, startTimeOffset) {
  return segments.map((segment, index) => {
    const start = formatTime(segment.start + startTimeOffset);
    const end = formatTime(segment.end + startTimeOffset);
    return `${index + 1}\n${start} --> ${end}\n${segment.text.trim()}`;
  }).join('\n\n');
}
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000).toString().padStart(3, '0');
  return `${h}:${m}:${s},${ms}`;
}
</script>

<template>
  <div class="stt-container">
    <div class="component-header">
      <h2>语音转文本 (STT)</h2>
      <button class="icon-button" @click="showSettings = true" title="STT 设置"><IconSettings /></button>
    </div>

    <div class="drop-zone" @dragover.prevent @dragleave.prevent @drop.prevent="onFileDrop" @click="!sttSelectedFile && $refs.fileInput.click()">
      <input type="file" ref="fileInput" @change="onFileChange" accept="audio/*" style="display: none;" />
      <div v-if="!sttSelectedFile" class="placeholder-text"><p>拖拽音频文件到此处</p><p class="or-text">或点击选择文件</p></div>
      <div v-else class="file-preview"><p>{{ sttFileDisplayName }}</p><audio :src="sttFilePreviewUrl" controls></audio><button class="delete-button" @click.stop="deleteFile" title="删除文件">&times;</button></div>
    </div>
    
    <div class="options-grid">
      <select v-model="language" class="styled-select" title="选择识别语言" :disabled="transcriptionMode === 'translate'"><option value="">自动识别语言</option><option value="zh">中文</option><option value="en">英文</option><option value="ja">日语</option></select>
      <select v-model.number="chunkOption" class="styled-select" title="选择分片策略"><option value="0">不分片</option><option value="1">1 分钟/片</option><option value="2">2 分钟/片</option><option value="5">5 分钟/片</option><option value="10">10 分钟/片</option><option value="20">20 分钟/片</option></select>
      <div class="format-toggle"><label :class="{ active: transcriptionMode === 'transcribe' }"><input type="radio" v-model="transcriptionMode" value="transcribe">原语言</label><label :class="{ active: transcriptionMode === 'translate' }"><input type="radio" v-model="transcriptionMode" value="translate">英文</label></div>
      <div class="format-toggle"><label :class="{ active: format === 'txt' }"><input type="radio" v-model="format" value="txt">TXT</label><label :class="{ active: format === 'srt' }"><input type="radio" v-model="format" value="srt">SRT</label></div>
    </div>

    <div v-if="preparationMessage || !allTasksFinished" class="global-status-bar">
        <span class="loader small"></span>
        <span>{{ preparationMessage || `处理中... (${completedChunksCount} / ${transcriptionChunkResults.length})` }}</span>
    </div>

    <div class="action-buttons">
      <button class="button-primary" @click="startProcessing" :disabled="isProcessing || !sttSelectedFile">
          {{ isProcessing ? '处理中...' : (transcriptionMode === 'translate' ? '开始翻译' : '开始转写') }}
      </button>
      <button v-if="finalResultText && allTasksFinished" class="button-success download-button" @click="downloadResult">
        下载结果
      </button>
    </div>

    <div class="result-list" v-if="transcriptionChunkResults.length > 0">
        <div v-for="(chunk, index) in transcriptionChunkResults" :key="chunk.id" class="chunk-item" :class="[chunk.status, `color-bg-${index % 5}`]">
            <div class="chunk-header" @click="toggleCollapse(chunk.id)">
                <strong>{{ transcriptionChunkResults.length > 1 ? `分片 ${chunk.id + 1}` : (transcriptionMode === 'translate' ? '翻译任务' : '转写任务') }}</strong>
                <div class="header-right">
                  <span class="chunk-status">{{ chunk.status }}</span>
                  <span class="collapse-icon" :class="{ 'is-expanded': !collapsedChunks[chunk.id] }">
                      <svg viewBox="0 0 1024 1024" width="14" height="14"><path d="M765.7 486.8L314.9 134.7c-5.3-4-12.7-3.9-17.9 0.5L230.1 201c-5.5 4.9-5.6 13.5-0.1 18.6l328.8 288.5-328.8 288.5c-5.5 5.1-5.4 13.7 0.1 18.6l66.8 66.1c5.3 4.4 12.7 4.5 17.9 0.5l450.8-352.1c5.3-4.1 5.3-11.4 0-15.6z" fill="currentColor"></path></svg>
                  </span>
                </div>
            </div>
            <div class="chunk-content" v-show="!collapsedChunks[chunk.id]">
                <div v-if="chunk.status === 'processing'" class="loader-container"><span class="loader small"></span> {{ chunk.message || '上传处理中...' }}</div>
                <div v-else-if="chunk.status === 'success'"><pre>{{ chunk.result }}</pre></div>
                <div v-else-if="chunk.status === 'error'" class="error-container">
                    <p>失败: {{ chunk.errorMessage }}</p>
                    <button @click="retryChunk(chunk)" class="retry-button">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                        重试
                    </button>
                </div>
            </div>
        </div>
    </div>
    
    <Transition name="fade">
        <button v-if="showBackToTop" class="back-to-top" @click="scrollToTop" title="返回顶部">
            <svg viewBox="0 0 1024 1024" width="20" height="20"><path d="M512 378.24l-418.88 418.88L0 704l512-512 512 512-93.12 93.12z" fill="currentColor"></path></svg>
        </button>
    </Transition>

    <SettingsModal :show="showSettings" type="STT" @close="showSettings = false" @save="settingsStore.saveSettings($event)" />
  </div>
</template>


<style scoped>
.stt-container { padding-bottom: 60px; }
.options-grid { margin-top: 20px; display: grid; grid-template-columns: 1fr 1fr auto auto; gap: 12px; align-items: center; }
.action-buttons { margin-top: 16px; display: flex; gap: 12px; }
.action-buttons .button-primary, .action-buttons .button-secondary, .action-buttons .button-success { flex: 1; padding: 12px; font-size: 16px; display: flex; justify-content: center; align-items: center; gap: 8px; border-radius: 8px; font-weight: 500; cursor: pointer; transition: all 0.2s; border: none; }
.button-success { background-color: var(--success-color); color: white; border-color: var(--success-color); }
.button-success:hover { background-color: #85d962; }
.global-status-bar { margin-top: 20px; padding: 12px 16px; background-color: #eef2ff; border-radius: 8px; display: flex; align-items: center; gap: 12px; color: var(--accent-color); font-weight: 500; }
.result-list { margin-top: 20px; display: flex; flex-direction: column; gap: 12px; }
.chunk-item { border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; }
.chunk-header { cursor: pointer; display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background-color: #f7f9fc; border-bottom: 1px solid var(--border-color); font-size: 14px; }
.header-right { display: flex; align-items: center; gap: 12px; }
.collapse-icon { transition: transform 0.2s ease-in-out; color: var(--secondary-text); }
.collapse-icon.is-expanded { transform: rotate(90deg); }
.chunk-item.success { border-left: 4px solid var(--success-color); }
.chunk-item.error { border-left: 4px solid var(--danger-color); background-color: #fff8f8; }
.chunk-item.processing { border-left: 4px solid var(--accent-color); }
.color-bg-0.success { background-color: #f0fff4; } .color-bg-1.success { background-color: #f0f8ff; } .color-bg-2.success { background-color: #fffaf0; } .color-bg-3.success { background-color: #f5f5fd; } .color-bg-4.success { background-color: #f8f8f8; }
.chunk-status { font-weight: bold; text-transform: capitalize; }
.chunk-item.success .chunk-status { color: var(--success-color); } .chunk-item.error .chunk-status { color: var(--danger-color); } .chunk-item.processing .chunk-status { color: var(--accent-color); }
.chunk-content { padding: 12px; font-size: 14px; line-height: 1.6; }
.chunk-content pre { white-space: pre-wrap; word-wrap: break-word; margin: 0; font-family: inherit; }
.loader-container, .error-container { display: flex; align-items: center; gap: 8px; color: var(--secondary-text); }
.error-container { justify-content: space-between; }
.error-container p { margin: 0; color: var(--danger-color); }
.retry-button { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; font-size: 13px; background-color: #fff0f0; border: 1px solid var(--danger-color); color: var(--danger-color); border-radius: 6px; cursor: pointer; }
.loader.small { width: 16px; height: 16px; border-width: 2px; border-top-color: var(--accent-color) !important; }
.drop-zone { border: 2px dashed var(--border-color); border-radius: 12px; padding: 10px; text-align: center; cursor: pointer; transition: all 0.2s; background-color: var(--secondary-bg); }
.drop-zone:hover { border-color: var(--accent-color); background-color: #f0f4fa; }
.placeholder-text p { margin: 0; color: var(--secondary-text); }
.or-text { font-size: 14px; margin-top: 8px !important; }
.file-preview { position: relative; }
.file-preview p { font-weight: 500; margin-bottom: 12px; }
.file-preview audio { width: 100%; }
.delete-button { position: absolute; top: -10px; right: -10px; background: var(--danger-color); color: white; border: none; border-radius: 50%; width: 24px; height: 24px; font-size: 20px; line-height: 20px; cursor: pointer; }
.styled-select { padding: 12px; border-radius: 8px; border: 1px solid var(--border-color); font-size: 16px; width: 100%; box-sizing: border-box; }
.styled-select:disabled { background-color: #f5f7fa; color: #c0c4cc; cursor: not-allowed; }
.format-toggle { display: flex; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; flex-shrink: 0; }
.format-toggle label { padding: 12px 16px; cursor: pointer; background: white; transition: background-color 0.2s; font-size: 15px; }
.format-toggle label.active { background: var(--accent-color); color: white; }
.format-toggle input { display: none; }
.button-primary { background-color: var(--accent-color); color: white; }
.button-primary:disabled { background-color: #a9bce2; cursor: not-allowed; }
.button-secondary { background-color: white; color: var(--primary-text); border: 1px solid var(--border-color); }
.button-secondary:disabled { opacity: 0.6; cursor: not-allowed; }
.button-secondary:hover:not(:disabled) { background-color: var(--secondary-bg); }
.loader { border: 3px solid #f3f3f3; border-top: 3px solid var(--accent-color); border-radius: 50%; width: 18px; height: 18px; animation: spin 1s linear infinite; }
.button-primary .loader { border-top-color: white; }
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
.icon-button { background: transparent; border: none; cursor: pointer; padding: 8px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--secondary-text); transition: background-color 0.2s, color 0.2s; }
.icon-button:hover { background-color: #eef0f2; color: var(--primary-text); }
.back-to-top { position: fixed; bottom: 40px; right: 40px; width: 44px; height: 44px; border-radius: 50%; background-color: var(--accent-color); color: white; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 100; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>