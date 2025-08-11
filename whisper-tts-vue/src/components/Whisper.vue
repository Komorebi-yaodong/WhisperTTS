<script setup>
import { ref } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import SettingsModal from './SettingsModal.vue';
import IconSettings from './icons/IconSettings.vue';

const settingsStore = useSettingsStore();
const selectedFile = ref(null);
const filePreviewUrl = ref('');
const fileDisplayName = ref('');
const isLoading = ref(false);
const transcriptionResult = ref('');
const format = ref('txt');
const language = ref('');
const showSettings = ref(false);

function handleFileSelect(file) {
  if (file && file.type.startsWith('audio/')) {
    selectedFile.value = file;
    filePreviewUrl.value = URL.createObjectURL(file);
    fileDisplayName.value = file.name;
    transcriptionResult.value = ''; // 清除上次的结果
  } else {
    utools.showNotification('请选择一个有效的音频文件。');
  }
}

function onFileChange(event) {
  handleFileSelect(event.target.files[0]);
}

function onFileDrop(event) {
  event.preventDefault();
  handleFileSelect(event.dataTransfer.files[0]);
}

function deleteFile() {
  selectedFile.value = null;
  filePreviewUrl.value = '';
  fileDisplayName.value = '';
}

async function processAudio(endpoint) {
  if (!selectedFile.value) {
    utools.showNotification('请先上传一个音频文件。');
    return;
  }
  isLoading.value = true;
  transcriptionResult.value = '';

  const formData = new FormData();
  formData.append("file", selectedFile.value);
  formData.append("model", settingsStore.config.WhisperapiModel);
  formData.append("response_format", "verbose_json");
  if (language.value && endpoint.includes('transcriptions')) {
    formData.append("language", language.value);
  }

  try {
    const response = await fetch(`${settingsStore.config.WhisperapiUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${settingsStore.config.WhisperapiKey}` },
      body: formData
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({'error': { 'message': '未知错误' }}));
        throw new Error(`HTTP 错误 ${response.status}: ${errorData.error.message || '请求失败'}`);
    }
    
    const data = await response.json();
    if (format.value === 'srt') {
      transcriptionResult.value = convertToSRT(data.segments);
    } else {
      transcriptionResult.value = data.text;
    }
  } catch (error) {
    utools.showNotification('错误: ' + error.message);
  } finally {
    isLoading.value = false;
  }
}

function downloadResult() {
    if (!transcriptionResult.value) return;
    // 使用 utf-8 编码以确保中文字符正确保存
    const blob = new Blob([transcriptionResult.value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transcription_${Date.now()}.${format.value}`;
    link.click();
    URL.revokeObjectURL(url);
}

function convertToSRT(segments) {
  return segments.map((segment, index) => {
    const start = formatTime(segment.start);
    const end = formatTime(segment.end);
    return `${index + 1}\n${start} --> ${end}\n${segment.text.trim()}`;
  }).join('\n\n');
}

function formatTime(seconds) {
  const date = new Date(0);
  date.setSeconds(seconds);
  const timeString = date.toISOString().substr(11, 12);
  return timeString.replace('.', ',');
}
</script>

<template>
  <div class="whisper-container component-container">
    <div class="component-header">
      <h2>语音转文本 (STT)</h2>
      <button class="icon-button" @click="showSettings = true" title="STT 设置">
        <IconSettings />
      </button>
    </div>

    <div
      class="drop-zone"
      @dragover.prevent
      @dragleave.prevent
      @drop.prevent="onFileDrop"
      @click="!selectedFile && $refs.fileInput.click()"
    >
      <input type="file" ref="fileInput" @change="onFileChange" accept="audio/*" style="display: none;" />
      <div v-if="!selectedFile" class="placeholder-text">
        <p>拖拽音频文件到此处</p>
        <p class="or-text">或点击选择文件</p>
      </div>
      <div v-else class="file-preview">
        <p>{{ fileDisplayName }}</p>
        <audio :src="filePreviewUrl" controls></audio>
        <button class="delete-button" @click.stop="deleteFile" title="删除文件">&times;</button>
      </div>
    </div>
    
    <div class="controls-grid">
      <select v-model="language" class="styled-select">
        <option value="">自动识别语言</option>
        <option value="zh">中文 (Chinese)</option>
        <option value="en">英文 (English)</option>
        <option value="ja">日语 (Japanese)</option>
        <option value="fr">法语 (French)</option>
        <option value="de">德语 (German)</option>
        <option value="ru">俄语 (Russian)</option>
      </select>

      <div class="format-toggle">
        <label :class="{ active: format === 'txt' }">
          <input type="radio" v-model="format" value="txt" name="format"> 文本 (TXT)
        </label>
        <label :class="{ active: format === 'srt' }">
          <input type="radio" v-model="format" value="srt" name="format"> 字幕 (SRT)
        </label>
      </div>
    </div>

    <div class="action-buttons">
      <button class="button-primary" @click="processAudio('/v1/audio/transcriptions')" :disabled="isLoading || !selectedFile">
        <span v-if="isLoading" class="loader"></span> 转写
      </button>
      <button class="button-secondary" @click="processAudio('/v1/audio/translations')" :disabled="isLoading || !selectedFile">
        翻译为英文
      </button>
    </div>

    <div v-if="transcriptionResult" class="result-area">
      <textarea :value="transcriptionResult" readonly></textarea>
      <button class="button-primary download-result-btn" @click="downloadResult">下载 {{ format.toUpperCase() }}</button>
    </div>

    <SettingsModal 
      :show="showSettings" 
      type="STT" 
      @close="showSettings = false"
      @save="settingsStore.saveSettings($event)"
    />
  </div>
</template>

<style scoped>
/* Scoped Styles (与上一版相同，无需修改) */
.drop-zone {
  border: 2px dashed var(--border-color);
  border-radius: 12px;
  padding: 10px;
  text-align: center;
  cursor: pointer;
  transition: background-color 0.2s, border-color 0.2s;
  background-color: var(--secondary-bg);
}
.drop-zone:hover {
  border-color: var(--accent-color);
  background-color: #f0f4fa;
}
.placeholder-text p { margin: 0; color: var(--secondary-text); }
.or-text { font-size: 14px; margin-top: 8px !important; }

.file-preview { position: relative; }
.file-preview p { font-weight: 500; margin-bottom: 12px; }
.file-preview audio { width: 100%; }
.delete-button {
  position: absolute;
  top: -10px;
  right: -10px;
  background: var(--danger-color);
  color: white;
  border: none;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  font-size: 20px;
  line-height: 20px;
  cursor: pointer;
}

.controls-grid {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 16px;
  align-items: center;
  margin-top: 20px;
}
.styled-select {
  padding: 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  font-size: 16px;
}
.format-toggle {
  display: flex;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}
.format-toggle label {
  padding: 12px 20px;
  cursor: pointer;
  background: white;
  transition: background-color 0.2s;
}
.format-toggle label.active {
  background: var(--accent-color);
  color: white;
}
.format-toggle input { display: none; }

.action-buttons {
  display: flex;
  gap: 16px;
  margin-top: 20px;
}
.action-buttons .button-primary, .action-buttons .button-secondary {
  flex: 1;
  padding: 12px;
  font-size: 16px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
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
.button-secondary {
  background-color: white;
  color: var(--primary-text);
  border: 1px solid var(--border-color);
}
.button-secondary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}
.button-secondary:hover:not(:disabled) {
  background-color: var(--secondary-bg);
}

.result-area { margin-top: 20px; }
.result-area textarea {
  width: 100%;
  min-height: 150px;
  box-sizing: border-box;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
}
.download-result-btn {
  width: 100%;
  margin-top: 12px;
}
/* Other styles copied from TTS */
.loader { border: 3px solid #f3f3f3; border-top: 3px solid var(--accent-color); border-radius: 50%; width: 18px; height: 18px; animation: spin 1s linear infinite; }
.button-primary .loader { border-top-color: white; }
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
.icon-button { background: transparent; border: none; cursor: pointer; padding: 8px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--secondary-text); transition: background-color 0.2s, color 0.2s; }
.icon-button:hover { background-color: #eef0f2; color: var(--primary-text); }
</style>