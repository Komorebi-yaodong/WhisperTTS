const fs = require('fs/promises');
const path = require('path');

// --- Config Management ---
function getConfig() {
    const defaultConfig = {
      TTSapiUrl: "https://api.openai.com",
      TTSapiKey: "",
      voiceList: JSON.stringify([{ "alloy": "Alloy" }, { "echo": "Echo" }, { "fable": "Fable" }, { "onyx": "Onyx" }, { "nova": "Nova" }, { "shimmer": "Shimmer" }]),
      selectedVoice: "alloy",
      TTSmodel: "tts-1",
      WhisperapiUrl: "https://api.groq.com/openai",
      WhisperapiKey: "",
      WhisperapiModel: "whisper-large-v3"
    };
    const configDoc = utools.db.get("config");
    return configDoc ? { ...defaultConfig, ...configDoc.data } : defaultConfig;
}
function updateConfig(newConfig) {
    let configDoc = utools.db.get("config");
    if (configDoc) { 
        configDoc.data = { ...configDoc.data, ...newConfig }; 
        utools.db.put(configDoc); 
    } else { 
        utools.db.put({ _id: "config", data: newConfig }); 
    }
}

// --- FFmpeg & File System Functions ---
async function saveFileToTemp(fileBuffer, originalFilename) {
    const tempDir = path.join(utools.getPath('temp'), `whisper-tts-uploads-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    const tempPath = path.join(tempDir, originalFilename);
    await fs.writeFile(tempPath, Buffer.from(fileBuffer));
    return tempPath;
}
async function compressAudioToMp3(inputPath) {
    const outputPath = inputPath.replace(/\.[^/.]+$/, "") + ".mp3";
    const ffmpegArgs = ['-i', inputPath, '-b:a', '192k', '-y', outputPath];
    console.log('[WhisperTTS] Compressing to MP3 with args:', ffmpegArgs.join(' '));
    try {
        await utools.runFFmpeg(ffmpegArgs);
        console.log('[WhisperTTS] Compression successful, new file:', outputPath);
        return outputPath;
    } catch (error) {
        console.error('[WhisperTTS] MP3 compression failed:', error);
        throw new Error(`MP3 compression failed: ${error.message || error}`);
    }
}
async function sliceAudioWithFFmpeg(inputPath, chunkDurationSeconds) {
    const tempDir = path.dirname(inputPath);
    const extension = path.extname(inputPath);
    const outputPathPattern = path.join(tempDir, `chunk_%03d${extension}`);
    const ffmpegArgs = ['-i', inputPath, '-f', 'segment', '-segment_time', String(chunkDurationSeconds), '-c', 'copy', outputPathPattern];
    console.log('[WhisperTTS] Slicing with args:', ffmpegArgs.join(' '));
    try {
        await utools.runFFmpeg(ffmpegArgs);
        const files = await fs.readdir(tempDir);
        const chunkFiles = files.filter(f => f.startsWith('chunk_')).map(f => path.join(tempDir, f));
        return chunkFiles.length > 0 ? chunkFiles : [inputPath];
    } catch (error) {
        console.error('[WhisperTTS] Slicing failed:', error);
        throw new Error(`FFmpeg slicing failed: ${error.message || error}`);
    }
}
async function readFileAsBuffer(filePath) {
    return fs.readFile(filePath);
}


// --- Expose APIs to renderer ---
window.api = {
    getConfig,
    updateConfig,
    saveFileToTemp,
    compressAudioToMp3,
    sliceAudioWithFFmpeg,
    readFileAsBuffer
};


utools.onPluginEnter(async ({ code, type, payload }) => {
    if (code === 'SpeechTTS') {
        const config = getConfig();

        // **FIX**: Implement multi-key random selection logic
        const keysString = config.TTSapiKey;
        if (!keysString || typeof keysString !== 'string') {
            utools.showNotification('请先在设置中配置 TTS API 密钥。');
            return;
        }
        const keys = keysString.split(/[,，]/).map(k => k.trim()).filter(Boolean);
        if (keys.length === 0) {
            utools.showNotification('请在设置中配置有效的 TTS API 密钥。');
            return;
        }
        const apiKey = keys[Math.floor(Math.random() * keys.length)];

        utools.hideMainWindow(true);
        payload = payload.replace(/([a-zA-Z])\s*\n\s*([a-zA-Z])/g, "$1 $2").replace(/\s*\n\s*/g, "");
        
        let requestData = { 
            model: config.TTSmodel, 
            input: payload, 
            voice: config.selectedVoice || "alloy" 
        };
        
        // **FIX**: Use the randomly selected apiKey
        let headers = { 
            'Content-Type': 'application/json', 
            'Authorization': `Bearer ${apiKey}` 
        };

        try {
            const response = await fetch(`${config.TTSapiUrl}/v1/audio/speech`, { 
                method: 'POST', 
                headers: headers, 
                body: JSON.stringify(requestData) 
            });
            if (!response.ok) {
                const errorBody = await response.text();
                utools.showNotification(`HTTP error! status: ${response.status} - ${errorBody}`);
                utools.outPlugin();
                return;
            }
            const blob = await response.blob();
            let audio = new Audio(URL.createObjectURL(blob));
            audio.play();
        } catch (error) {
            utools.showNotification('Error:' + error);
        }
    }
});