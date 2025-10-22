// --- Config Management ---
function getConfig() {
    const defaultConfig = { WhisperapiUrl: "https://api.groq.com/openai", WhisperapiKey: "", WhisperapiModel: "whisper-large-v3" };
    const configDoc = utools.db.get("config");
    const fullConfig = configDoc ? { ...defaultConfig, ...configDoc.data } : defaultConfig;
    return { WhisperapiUrl: fullConfig.WhisperapiUrl, WhisperapiKey: fullConfig.WhisperapiKey, WhisperapiModel: fullConfig.WhisperapiModel };
}

// --- Global variables ---
let mediaRecorder, audioChunks = [], audioStream;
let audioContext, analyser, animationFrameId;
let canvas, canvasCtx, dataArray, bufferLength;
let isCancelled = false; // [新增] 用于标记是否是用户取消操作

// --- UI State Manager ---
const updateStatus = (state) => {
    const canvasEl = document.getElementById('audio-canvas');
    const analyzerEl = document.querySelector('.analyzer');

    if (state === 'recording') {
        if (canvasEl) canvasEl.style.display = 'block';
        if (analyzerEl) analyzerEl.style.display = 'none';
        drawWaveform();
    } else if (state === 'processing') {
        cancelAnimationFrame(animationFrameId);
        if (canvasEl) canvasEl.style.display = 'none';
        if (analyzerEl) analyzerEl.style.display = 'flex';
    }
};

const drawWaveform = () => {
    animationFrameId = requestAnimationFrame(drawWaveform);
    analyser.getByteFrequencyData(dataArray);

    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

    const barWidth = 4;
    const gap = 2;
    const numBars = Math.floor(canvas.width / (barWidth + gap));
    const step = Math.floor(bufferLength / numBars);

    for (let i = 0; i < numBars; i++) {
        const dataIndex = i * step;
        const barHeight = (dataArray[dataIndex] / 255) * canvas.height * 0.8; 
        const x = i * (barWidth + gap);
        const y = canvas.height / 2 - barHeight / 2;
        
        canvasCtx.beginPath();
        canvasCtx.moveTo(x + barWidth / 2, y);
        canvasCtx.lineTo(x + barWidth / 2, y + barHeight);
        canvasCtx.stroke();
    }
};

// --- Core Logic ---
const stopRecordingAndTranscribe = () => {
    window.removeEventListener('keydown', keydownListener);
    window.removeEventListener('keydown', escListener); // [新增] 移除ESC监听
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        updateStatus('processing');
        mediaRecorder.stop();
    }
};

// [新增] 取消录音并关闭窗口的函数
const cancelRecording = () => {
    isCancelled = true;
    window.removeEventListener('keydown', keydownListener);
    window.removeEventListener('keydown', escListener);
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    } else {
        // 如果录音还没开始或者已经停止，直接关闭
        window.close();
    }
};


const keydownListener = (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        stopRecordingAndTranscribe();
    }
};

// [新增] ESC键的监听函数
const escListener = (e) => {
    if (e.key === 'Escape') {
        e.preventDefault();
        cancelRecording();
    }
};

const startRecording = async () => {
    try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(audioStream);
        source.connect(analyser);
        
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.75;
        bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        
        canvas = document.getElementById('audio-canvas');
        canvasCtx = canvas.getContext('2d');
        canvasCtx.strokeStyle = '#E5E7EB';
        canvasCtx.lineWidth = 4;
        canvasCtx.lineCap = 'round';

        mediaRecorder = new MediaRecorder(audioStream);
        mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunks.push(event.data); };

        mediaRecorder.onstop = async () => {
            // [修改] 检查是否是用户主动取消
            if (isCancelled) {
                if (audioContext && audioContext.state !== 'closed') audioContext.close();
                if (audioStream) audioStream.getTracks().forEach(track => track.stop());
                window.close();
                return;
            }

            if (audioChunks.length === 0) return window.close();
            const config = getConfig();
            const keysString = config.WhisperapiKey;
            if (!keysString || !keysString.trim()) {
                 utools.showNotification('请先在STT设置中配置 Whisper API 密钥。');
                 return window.close();
            }
            const keys = keysString.split(/[,，]/).map(k => k.trim()).filter(Boolean);
            const apiKey = keys[Math.floor(Math.random() * keys.length)];
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const formData = new FormData();
            formData.append("file", audioBlob, `asr-recording.webm`);
            formData.append("model", config.WhisperapiModel);
            try {
                const response = await fetch(`${config.WhisperapiUrl}/v1/audio/transcriptions`, {
                    method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}` }, body: formData
                });
                if (!response.ok) throw new Error(`API错误 ${response.status}: ${(await response.json().catch(()=>({}))).error?.message || '请求失败'}`);
                const result = await response.json();
                if (result.text && result.text.trim()) {
                    utools.copyText(result.text);
                } else {
                    utools.showNotification('未能识别出任何文本。');
                }
            } catch (error) {
                console.error('[WhisperTTS] ASR API call failed:', error);
                utools.showNotification(`语音识别失败: ${error.message}`);
            } finally {
                if (audioContext && audioContext.state !== 'closed') audioContext.close();
                if (audioStream) audioStream.getTracks().forEach(track => track.stop());
                window.close();
            }
        };

        mediaRecorder.start();
        window.addEventListener('keydown', keydownListener);
        window.addEventListener('keydown', escListener); // [新增] 添加ESC监听
        updateStatus('recording');

        utools.onPluginOut(() => {
            if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
            if (audioContext && audioContext.state !== 'closed') audioContext.close();
            if (audioStream) audioStream.getTracks().forEach(track => track.stop());
            cancelAnimationFrame(animationFrameId);
        });

    } catch (error) {
        console.error('[WhisperTTS] ASR start failed:', error);
        utools.showNotification('无法获取麦克风权限或录音失败。');
        window.close();
    }
};

window.addEventListener('DOMContentLoaded', () => {
    startRecording();
});