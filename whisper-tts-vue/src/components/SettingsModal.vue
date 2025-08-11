<script setup>
import { ref, watch } from 'vue';
import { useSettingsStore } from '@/stores/settings';

const props = defineProps({
  show: Boolean,
  type: String // 'TTS' or 'STT'
});

const emit = defineEmits(['close', 'save']);
const settingsStore = useSettingsStore();
const localConfig = ref({});

watch(() => props.show, (newVal) => {
  if (newVal) {
    localConfig.value = JSON.parse(JSON.stringify(settingsStore.config));
  }
});

function save() {
  emit('save', localConfig.value);
  emit('close');
}
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="show" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-content">
        <h3 class="modal-title">{{ type }} 设置</h3>
        
        <div class="form-group">
          <!-- TTS Settings -->
          <template v-if="type === 'TTS'">
            <label for="tts-url">API 地址</label>
            <input id="tts-url" type="text" v-model="localConfig.TTSapiUrl" placeholder="例如: https://api.openai.com">
            
            <label for="tts-key">API 密钥</label>
            <input id="tts-key" type="password" v-model="localConfig.TTSapiKey" placeholder="您的 API 密钥 (例如: sk-...)">

            <label for="tts-model">模型</label>
            <input id="tts-model" type="text" v-model="localConfig.TTSmodel" placeholder="例如: tts-1, tts-1-hd">

            <label for="tts-voices">声音列表 (JSON格式)</label>
            <textarea 
              id="tts-voices" 
              v-model="localConfig.voiceList" 
              rows="5"
              placeholder='[{"alloy": "Alloy (推荐)"},{"echo": "Echo (推荐)"}]'
            ></textarea>
            <p class="form-hint">您可以在 TTS 页面点击刷新按钮自动获取。</p>
          </template>

          <!-- STT (Whisper) Settings -->
          <template v-if="type === 'STT'">
            <label for="stt-url">API 地址</label>
            <input id="stt-url" type="text" v-model="localConfig.WhisperapiUrl" placeholder="例如: https://api.groq.com/openai">

            <label for="stt-key">API 密钥</label>
            <input id="stt-key" type="password" v-model="localConfig.WhisperapiKey" placeholder="您的 API 密钥 (例如: gsk-...)">

            <label for="stt-model">模型</label>
            <input id="stt-model" type="text" v-model="localConfig.WhisperapiModel" placeholder="例如: whisper-large-v3">
          </template>
        </div>

        <div class="modal-actions">
          <button class="button-secondary" @click="emit('close')">取消</button>
          <button class="button-primary" @click="save">保存</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* 样式与上一版相同，但为 textarea 添加提示样式 */
.form-group label {
  display: block;
  font-weight: 500;
  margin-bottom: 8px;
  margin-top: 16px;
  color: var(--secondary-text);
}
.form-group input, .form-group textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 14px;
  box-sizing: border-box;
}
.form-group textarea {
  resize: vertical;
  min-height: 100px;
  font-family: monospace;
}
.form-hint {
    font-size: 12px;
    color: var(--secondary-text);
    margin-top: 8px;
    margin-bottom: 0;
}
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}
.modal-content {
  background: white;
  padding: 24px 32px;
  border-radius: 12px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  width: 90%;
  max-width: 500px;
}
.modal-title {
  margin-top: 0;
  margin-bottom: 24px;
  font-size: 20px;
  color: var(--primary-text);
}
.modal-actions {
  margin-top: 24px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
button {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}
.button-primary {
  background-color: var(--accent-color);
  color: white;
}
.button-primary:hover {
  background-color: var(--accent-hover);
  box-shadow: 0 2px 8px rgba(74, 105, 189, 0.4);
}
.button-secondary {
  background-color: #eef0f2;
  color: var(--secondary-text);
  border: 1px solid var(--border-color);
}
.button-secondary:hover {
  background-color: #e4e7ed;
}

.modal-fade-enter-active, .modal-fade-leave-active {
  transition: opacity 0.3s ease;
}
.modal-fade-enter-from, .modal-fade-leave-to {
  opacity: 0;
}
</style>