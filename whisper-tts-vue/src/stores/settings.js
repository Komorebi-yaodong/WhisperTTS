import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useSettingsStore = defineStore('settings', () => {
  // --- General Config ---
  const config = ref({
    TTSapiUrl: "https://api.openai.com",
    TTSapiKey: "",
    voiceList: JSON.stringify([{ "alloy": "Alloy" }, { "echo": "Echo" }, { "fable": "Fable" }, { "onyx": "Onyx" }, { "nova": "Nova" }, { "shimmer": "Shimmer" }]),
    selectedVoice: "alloy",
    TTSmodel: "tts-1",
    WhisperapiUrl: "https://api.groq.com/openai",
    WhisperapiKey: "",
    WhisperapiModel: "whisper-large-v3"
  })

  // --- STT File State ---
  const sttSelectedFile = ref(null);
  const sttFilePreviewUrl = ref('');
  const sttFileDisplayName = ref('');

  // --- STT Transcription State ---
  const transcriptionChunkResults = ref([])
  const sttChunkOption = ref(0); // **MOVED FROM Whisper.vue**

  // --- TTS State ---
  const ttsInputText = ref('');
  const ttsAudioResults = ref([]);
  const ttsCollapsedChunks = ref({});
  const ttsSplitOption = ref(0); // **MOVED FROM TTS.vue**


  // --- Actions ---
  async function loadSettings() {
    const savedConfig = await window.api.getConfig()
    Object.assign(config.value, savedConfig)
  }

  async function saveSettings(newConfig) {
    Object.assign(config.value, newConfig)
    await window.api.updateConfig(newConfig)
  }
  
  const getRandomApiKey = (type) => {
    const keysString = type === 'TTS' ? config.value.TTSapiKey : config.value.WhisperapiKey;
    if (!keysString || typeof keysString !== 'string') return '';
    const keys = keysString.split(/[,，]/).map(k => k.trim()).filter(Boolean);
    if (keys.length === 0) return '';
    const randomIndex = Math.floor(Math.random() * keys.length);
    return keys[randomIndex];
  };

  function resetTranscriptionState() {
    transcriptionChunkResults.value = []
  }

  function resetTtsState() {
    ttsAudioResults.value = [];
    ttsCollapsedChunks.value = {};
  }


  function setSttFile(file) {
    if (sttFilePreviewUrl.value) {
        URL.revokeObjectURL(sttFilePreviewUrl.value);
    }
    sttSelectedFile.value = file;
    sttFilePreviewUrl.value = URL.createObjectURL(file);
    sttFileDisplayName.value = file.name;
  }
  
  function clearSttFile() {
    if (sttFilePreviewUrl.value) {
        URL.revokeObjectURL(sttFilePreviewUrl.value);
    }
    sttSelectedFile.value = null;
    sttFilePreviewUrl.value = '';
    sttFileDisplayName.value = '';
  }

  // --- Computed ---
  const isProcessing = computed(() => 
    transcriptionChunkResults.value.some(c => c.status === 'pending' || c.status === 'processing')
  )

  return { 
    config, 
    loadSettings, 
    saveSettings,
    getRandomApiKey,
    
    sttSelectedFile,
    sttFilePreviewUrl,
    sttFileDisplayName,
    setSttFile,
    clearSttFile,
    
    transcriptionChunkResults,
    isProcessing,
    resetTranscriptionState,
    sttChunkOption, // **EXPORT NEW STATE**

    ttsInputText,
    ttsAudioResults,
    ttsCollapsedChunks,
    resetTtsState,
    ttsSplitOption // **EXPORT NEW STATE**
  }
})