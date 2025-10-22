// --- Config Management ---
function getConfig() {
    const defaultConfig = { WhisperapiUrl: "https://api.groq.com/openai", WhisperapiKey: "", WhisperapiModel: "whisper-large-v3" };
    const configDoc = utools.db.get("config");
    const fullConfig = configDoc ? { ...defaultConfig, ...configDoc.data } : defaultConfig;
    return { WhisperapiUrl: fullConfig.WhisperapiUrl, WhisperapiKey: fullConfig.WhisperapiKey, WhisperapiModel: fullConfig.WhisperapiModel };
}

// [新增] --- 大模型优化配置 ---
const LLM_API_URL = "https://text.pollinations.ai/openai/chat/completions";
const LLM_MODEL = "openai-fast";
const SYSTEM_PROMPT = `# Role：高保真语义精准修复工程师

## Background：
语音识别（ASR）系统和口语输入文本常受到环境干扰、口音、语速变化及语言模型限制的影响，导致文本存在高频错别字、同音字混淆和标点缺失等问题。用户需要一个极致精确的语言工程环节，能够将这种不完美的输入提升至专业级的书面表达标准，确保信息的语义完整性、法律严谨性以及发布的流畅性。本角色的任务是在不改变核心语义的前提下，实现文本的“原音重现”和“笔墨精准”。

## Attention：
我的核心价值在于“精准还原”（Restoration Fidelity）与“格式合规”（Format Compliance）。我必须以最高语言学标准执行任务，严格遵守“语义绝对保真、表达完全规范”的原则。**我被绝对禁止进行任何形式的翻译或跨语言转写。** 如果接收到非中文文本，我必须在原文语言中执行高精度修复，然后返回修复后的原文，不得将其翻译为中文。每一次修正都必须基于语境分析和语言规范，以还原输入者最真实的表达意图，并且最终交付结果必须封装在指定的JSON结构中。

## Profile：
- MyName: 语义精准修复工程师
- Author: Komorebi
- Version: 2.1
- Language: 中文
- Description: 我是一名专注于将错误和模糊的语音转写文本转化为专业、无瑕疵书面文档的顶级语言工程师。我致力于系统性地解决语音输入中的所有错误，确保最终文本在准确性、规范性和专业性上达到出版级别，并严格遵守JSON输出协议。

### Skills:
- **高保真语境推断与校正**: 我能够深度分析上下文和语篇逻辑，精准推断并修正因发音模糊导致的字词错误，包括跨语言文本的拼写和语法校正。
- **多语言书写规范与校对**: 我精通主要的书面语规范（如中文的全角标点、英文的句首大写和标点使用规则）。
- **高频ASR错误模式识别**: 我掌握主流ASR系统常见的高频错误模式，能快速定位和纠正同音字、近音词和语序偏差。
- **语义保真度控制系统**: 我拥有严格的自查机制，确保所有修正行为仅涉及字词层面的准确性，不侵犯或改变原始信息结构和核心语义。
- **数据结构封装能力**: 我能够将处理后的高精度文本精确封装入指定的JSON数据结构中，并进行有效的输入内容校验。

## Goals:
- **语义绝对还原**: 消除所有由语音识别或口语输入导致的字词错误，实现对说话者原始意图的100%语义还原。
- **输入内容校验**: 准确判断输入文本是否为空或为无效语音转写，并反馈到\`isnull\`字段。
- **文本规范化处理**: 准确修正和补充所有标点符号，确保其符合文本语言的书写规范和句法结构。
- **消除所有语言瑕疵**: 纠正文本中的所有错别字、拼写错误，以及不符合语境的词汇选择。
- **交付专业级JSON结构**: 确保最终输出严格遵循指定的JSON格式要求，内容无需二次编辑，可直接用于专业报告或存档。

## Constrains:
- **禁止语义增删**: 绝对禁止添加、删除或替换任何会改变句子核心信息或逻辑关系的词汇或短语。
- **禁止语言翻译**: **绝对禁止将输入文本翻译成其他语言。** 如果输入是非中文，必须在原文语言中进行纠正并输出。
- **禁止风格化或润饰**: 任务仅限于高精度纠错，禁止任何形式的文学润色、修饰或改变原始表达风格。
- **标点严格规范**: 必须使用目标语言对应的规范标点（例如中文使用全角，英文使用半角），并确保句末标点完整。
- **输出格式绝对遵循**: 最终输出必须且只能是指定的JSON格式，禁止添加任何解释性文字或评论。
- **语音识别干扰项**： 语音识别存在误差，会出现有关“请不吝点赞、订阅、转发、打赏，支持明镜与点点栏目。”描述的干扰项，如果检查到有“明镜与点点栏目”相关的描述请自动去除。

## Workflow:
1. **输入解析与有效性判断**: 接收用户提供的原始转写文本（Raw Input Text）。首先判断文本内容是否为空或仅包含无意义字符。如果为空，则标记 \`isnull\` 为 \`true\`。
2. **语言识别与规范确定**: 识别输入文本的原始语言，并根据该语言确定后续校对需要遵循的书写规范和标点用法。
3. **错误热区识别**: 利用ASR错误模式库，对有效文本进行快速扫描，标记出拼写错误高风险区、句法不连贯区以及明显缺乏标点的长句。
4. **层级精细化校对**: 针对标记区域进行系统性、分层级的修正：
    a. **基础识别错误修正**: 修复因发音或环境干扰导致的字词/拼写错误。
    b. **词汇替换与语义对齐**: 根据上下文和专业背景，精准替换模糊发音对应的准确词汇，实现语义上的完美对齐。
    c. **句法与错别字优化**: 纠正常见输入错误和因识别偏差导致的微小语法瑕疵。
5. **标点符号植入与规范**: 依据句子的停顿和语意逻辑，补充缺失的标点，并纠正所有不规范的标点使用，严格遵守目标语言的规范。
6. **最终保真度检验**: 将修正后的文本与原始语义意图进行最终交叉核验，确认信息量和表达方式完全一致。
7. **JSON封装与交付**: 将最终的高精度文本封装入\`content\`字段，并设置\`isnull\`字段，输出最终的JSON结构。

## OutputFormat:
请直接输出一个符合以下结构的JSON对象。禁止在JSON之外添加任何其他字符或解释性文字。

\`\`\`json
{
  "content": "[纠正后的高精度文本]",
  "isnull": "[true/false，用于表达输入是否为空语音或无意义文本]"
}
\`\`\`

## Suggestions:
- **最小修正原则**: 对于任何修正，如果存在多种可能性，应优先选择在当前语境下能够恢复语义且改动最小的词汇，以最大程度保证原始性。
- **专业术语优先**: 在专业领域文本中，若出现模糊发音，应优先将其还原为该领域内最常用、最规范的专业术语，体现专业精准性。
- **将自身视为过滤层**: 我必须把自己定位为用户与完美文本之间的唯一、绝对可靠的过滤和修复层，保持极高的技术中立性。
- **坚持单一职责**: 严格遵守**禁止翻译**的约束，确保所有处理资源集中在文本的内部质量提升上，无论该文本是中文还是其他语言。
- **语种敏感性**: 在进行标点和大小写修正时，必须高度敏感于文本的原始语言特性（例如，英文修正时需要处理大写和半角符号）。

## Initialization
作为高保真语义精准修复工程师，我必须遵守我的约束（Constrains），使用默认的中文与用户交流。我已完全理解并准备严格执行JSON格式输出规范，并**绝对禁止任何形式的翻译行为，无论输入文本是何种语言**。请立即提供您需要校对和重构的原始语音转写文本（Raw Input Text）。`;

async function optimizeTextWithLLM(rawText) {
    console.log('[WhisperTTS] Optimizing text with LLM...');
    if (!rawText || !rawText.trim()) {
        return rawText; // 如果原始文本为空，则不调用API
    }

    try {
        const response = await fetch(LLM_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: LLM_MODEL,
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: rawText }
                ],
                stream: false
            })
        });

        if (!response.ok) {
            console.error(`[WhisperTTS] LLM API error ${response.status}:`, await response.text());
            utools.showNotification('文本优化失败，已复制原始结果。');
            return rawText; // API出错，返回原始文本
        }

        const llmResult = await response.json();
        const llmContent = llmResult.choices[0]?.message?.content;
        console.log("[WhisperTTS] LLM response:",llmContent);

        if (llmContent) {
            try {
                // 模型被要求返回JSON字符串，所以需要解析
                const parsedContent = JSON.parse(llmContent);
                if (parsedContent.isnull === false && typeof parsedContent.content === 'string') {
                    console.log('[WhisperTTS] Optimization successful.');
                    return parsedContent.content;
                } else {
                    console.warn('[WhisperTTS] LLM reported empty or invalid input, returning original text.');
                    rawText = "";
                    return rawText; // 模型认为输入无效，返回原始文本
                }
            } catch (jsonError) {
                console.error('[WhisperTTS] Failed to parse LLM JSON response:', jsonError, 'Raw content:', llmContent);
                utools.showNotification('优化结果格式错误，已复制原始结果。');
                return rawText; // JSON解析失败，返回原始文本
            }
        }
        // 如果没有内容返回，也返回原始文本
        return rawText;
    } catch (error) {
        console.error('[WhisperTTS] LLM fetch request failed:', error);
        utools.showNotification('文本优化请求失败，已复制原始结果。');
        return rawText; // 请求本身失败，返回原始文本
    }
}


// --- Global variables ---
let mediaRecorder, audioChunks = [], audioStream;
let audioContext, analyser, animationFrameId;
let canvas, canvasCtx, dataArray, bufferLength;
let isCancelled = false; 

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
    window.removeEventListener('keydown', escListener);
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        updateStatus('processing');
        mediaRecorder.stop();
    }
};

const cancelRecording = () => {
    isCancelled = true;
    window.removeEventListener('keydown', keydownListener);
    window.removeEventListener('keydown', escListener);
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
    } else {
        window.close();
    }
};

const keydownListener = (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        stopRecordingAndTranscribe();
    }
};

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
                    // [修改] 调用大模型优化文本，而不是直接复制
                    const optimizedText = await optimizeTextWithLLM(result.text);
                    console.log('[WhisperTTS] ASR result:', result.text);
                    utools.copyText(optimizedText);
                    utools.showNotification('优化后的文本已复制');
                } else {
                    utools.showNotification('未能识别出任何文本。');
                }
            } catch (error) {
                console.error('[WhisperTTS] ASR or LLM process failed:', error);
                utools.showNotification(`语音处理失败: ${error.message}`);
            } finally {
                if (audioContext && audioContext.state !== 'closed') audioContext.close();
                if (audioStream) audioStream.getTracks().forEach(track => track.stop());
                window.close();
            }
        };

        mediaRecorder.start();
        window.addEventListener('keydown', keydownListener);
        window.addEventListener('keydown', escListener);
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