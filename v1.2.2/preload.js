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
    const tempDir = path.join(utools.getPath('temp'), `whisper-tts-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
    await fs.mkdir(tempDir, { recursive: true });
    const tempPath = path.join(tempDir, originalFilename);
    await fs.writeFile(tempPath, Buffer.from(fileBuffer));
    return tempPath;
}

async function saveFileToSharedTemp(directory, fileBuffer, filename) {
    await fs.mkdir(directory, { recursive: true });
    const tempPath = path.join(directory, filename);
    await fs.writeFile(tempPath, Buffer.from(fileBuffer));
    return tempPath;
}

async function compressAudioToMp3(inputPath, onRun) {
    const outputPath = inputPath.replace(/\.[^/.]+$/, "") + ".mp3";
    const ffmpegArgs = ['-i', inputPath, '-b:a', '192k', '-y', outputPath];
    console.log('[WhisperTTS] Compressing to MP3 with args:', ffmpegArgs.join(' '));
    try {
        const run = utools.runFFmpeg(ffmpegArgs);
        if (onRun && typeof onRun === 'function') {
            onRun(run); 
        }
        await run;
        console.log('[WhisperTTS] Compression successful, new file:', outputPath);
        return outputPath;
    } catch (error) {
        if (error && error.message && error.message.toLowerCase().includes('kill')) {
            console.log('[WhisperTTS] Compression was cancelled.');
            return null;
        }
        console.error('[WhisperTTS] MP3 compression failed:', error);
        throw error;
    }
}

// [MODIFIED] 使用更稳定可靠的强制切片
async function sliceAudioWithFFmpeg(inputPath, chunkDurationSeconds, onRun) {
    const tempDir = path.dirname(inputPath);
    const extension = path.extname(inputPath);
    const outputPattern = path.join(tempDir, `chunk_%03d${extension}`);
    
    // 使用-f segment进行强制分片
    const ffmpegArgs = [
        '-i', inputPath,
        '-f', 'segment',
        '-segment_time', String(chunkDurationSeconds),
        '-c', 'copy', // 直接复制流，不重新编码，速度快
        '-y', // 覆盖已存在的文件
        outputPattern
    ];

    console.log('[WhisperTTS] Running forced slicing with args:', ffmpegArgs.join(' '));
    try {
        const run = utools.runFFmpeg(ffmpegArgs);
        if (onRun && typeof onRun === 'function') {
            onRun(run);
        }
        await run;

        // 查找 ffmpeg 创建的分片文件
        const filesInDir = await fs.readdir(tempDir);
        const chunkFiles = filesInDir
            .filter(f => f.startsWith('chunk_') && f.endsWith(extension))
            .map(f => path.join(tempDir, f))
            .sort(); // 排序确保顺序正确

        // 如果没有生成任何分片（通常因为源文件比切片时间短），则返回原始文件
        if (chunkFiles.length === 0) {
            console.warn('[WhisperTTS] Slicing produced 0 chunks, likely because the source is too short. Returning original file.');
            return [inputPath];
        }
        
        console.log(`[WhisperTTS] Forced slicing successful. Found ${chunkFiles.length} chunks.`);
        return chunkFiles;

    } catch (error) {
        if (error && error.message && error.message.toLowerCase().includes('kill')) {
            console.log('[WhisperTTS] Slicing was cancelled by the user.');
            return null;
        }
        console.error('[WhisperTTS] Slicing failed:', error);
        throw error;
    }
}

// [MODIFIED] 使用更稳定可靠的 concat demuxer 进行合并
async function mergeAudioWithFFmpeg(filePaths, onRun) {
    if (!filePaths || filePaths.length === 0) {
        throw new Error("At least one audio file is required for merging.");
    }
    if (filePaths.length === 1) {
        // 如果只有一个文件，直接复制，避免FFmpeg开销
        const tempDir = path.dirname(filePaths[0]);
        const outputPath = path.join(tempDir, `merged_output_${Date.now()}.mp3`);
        await fs.copyFile(filePaths[0], outputPath);
        return outputPath;
    }
    const tempDir = path.dirname(filePaths[0]);
    const outputPath = path.join(tempDir, `merged_output_${Date.now()}.mp3`);
    
    // 创建一个临时的文件列表供FFmpeg使用
    const listFilePath = path.join(tempDir, `ffmpeg_merge_list.txt`);
    // 将windows的反斜杠替换为正斜杠，增加兼容性
    const fileListContent = filePaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
    await fs.writeFile(listFilePath, fileListContent);

    // 使用 concat demuxer，它比 filter_complex 更高效且不易出错
    const ffmpegArgs = ['-f', 'concat', '-safe', '0', '-i', listFilePath, '-c', 'copy', outputPath];
    
    console.log('[WhisperTTS] Merging audio with args:', ffmpegArgs.join(' '));
    try {
        const run = utools.runFFmpeg(ffmpegArgs);
        if (onRun && typeof onRun === 'function') {
            onRun(run);
        }
        await run;
        console.log('[WhisperTTS] Merging successful, output file:', outputPath);
        return outputPath;
    } catch (error) {
        if (error && error.message && error.message.toLowerCase().includes('kill')) {
            console.log('[WhisperTTS] Merging was cancelled.');
            return null;
        }
        console.error('[WhisperTTS] Audio merging failed:', error);
        throw error;
    } finally {
        // 清理列表文件
        await fs.unlink(listFilePath).catch(e => console.error('Failed to delete merge list file:', e));
    }
}

async function readFileAsBuffer(filePath) {
    return fs.readFile(filePath);
}


async function mergeBlobsAndGetBuffer(blobArrayBuffers, onRun) {
    const tempDir = path.join(utools.getPath('temp'), `whisper-tts-merge-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    try {
        const tempFilePaths = await Promise.all(
            blobArrayBuffers.map((buffer, index) => {
                const filePath = path.join(tempDir, `tts_chunk_${index}.mp3`);
                return fs.writeFile(filePath, Buffer.from(buffer)).then(() => filePath);
            })
        );

        if (tempFilePaths.length === 0) throw new Error("No files to merge.");

        const mergedFilePath = await mergeAudioWithFFmpeg(tempFilePaths, onRun);
        if (!mergedFilePath) return null;

        const mergedBuffer = await readFileAsBuffer(mergedFilePath);

        return mergedBuffer;

    } catch (error) {
        console.error('[WhisperTTS] mergeBlobsAndGetBuffer failed during operation:', error);
        throw error;
    } finally {
        try {
            await new Promise(resolve => setTimeout(resolve, 100));
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch (cleanupError) {
            console.error(`[WhisperTTS] Non-critical error during temp directory cleanup:`, cleanupError);
        }
    }
}

// --- Expose APIs to renderer ---
window.api = {
    getConfig,
    updateConfig,
    saveFileToTemp,
    saveFileToSharedTemp,
    compressAudioToMp3,
    sliceAudioWithFFmpeg,
    readFileAsBuffer,
    mergeAudioWithFFmpeg,
    mergeBlobsAndGetBuffer
};


utools.onPluginEnter(async ({ code, type, payload }) => {
    if (code === 'SpeechTTS') {
        const config = getConfig();
        const keysString = config.TTSapiKey;
        if (!keysString || typeof keysString !== 'string') {
            utools.showNotification('请先在设置中配置 TTS API 密钥。'); return;
        }
        const keys = keysString.split(/[,，]/).map(k => k.trim()).filter(Boolean);
        if (keys.length === 0) {
            utools.showNotification('请在设置中配置有效的 TTS API 密钥。'); return;
        }
        const apiKey = keys[Math.floor(Math.random() * keys.length)];
        utools.hideMainWindow(true);
        payload = payload.replace(/([a-zA-Z])\s*\n\s*([a-zA-Z])/g, "$1 $2").replace(/\s*\n\s*/g, "");
        const requestData = { model: config.TTSmodel, input: payload, voice: config.selectedVoice || "alloy" };
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
        try {
            const response = await fetch(`${config.TTSapiUrl}/v1/audio/speech`, { method: 'POST', headers, body: JSON.stringify(requestData) });
            if (!response.ok) {
                utools.showNotification(`HTTP error! status: ${response.status} - ${await response.text()}`);
                utools.outPlugin();
                return;
            }
            const audio = new Audio(URL.createObjectURL(await response.blob()));
            audio.play();
            audio.onended = () => utools.outPlugin();
            audio.onerror = (e) => {
                utools.showNotification('音频播放错误: ' + e.message);
                utools.outPlugin();
            }
        } catch (error) { 
            utools.showNotification('Error:' + error); 
            utools.outPlugin();
        }
    } 
    else if (code === 'ASR') {
        utools.hideMainWindow(true);

        const windowWidth = 250;
        const windowHeight = 70;

        const { x: screenX, y: screenY, width: screenWidth, height: screenHeight } = utools.getPrimaryDisplay().workArea;

        const targetX = Math.round(screenX + (screenWidth - windowWidth) / 2);
        const targetY = Math.round(screenY + screenHeight * 0.90 - (windowHeight / 2));

        const asrWindow = utools.createBrowserWindow('asr.html', {
            x: targetX,
            y: targetY,
            width: windowWidth,
            height: windowHeight,
            show: true,
            frame: false,
            resizable: false,
            alwaysOnTop: true,
            skipTaskbar: true,
            transparent: true,
            backgroundColor: 'rgba(255, 255, 255, 0)',
            webPreferences: {
                preload: 'asr.js',
                devTools: true
            }
        });        
        asrWindow.focus();
        asrWindow.webContents.openDevTools({ mode: "detach" });
        utools.outPlugin();
    }
});