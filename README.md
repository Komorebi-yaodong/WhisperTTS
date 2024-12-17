# WhisperTTS
## 我的第一个插件（提供链接均官方链接或开源项目，非个人链接与引导链接）

基于openai的tts与whisper实现的文本转语音、语音转文本，只需要满足openai请求格式即可；

whisper可以在groq中获得免费额度，足够个人日用；

tts可以使用edge-tts转openai api项目，如`https://github.com/travisvn/openai-edge-tts`


## 展示图片
![alt text](image/1.png)
![alt text](image/2.png)
![alt text](image/3.png)
![alt text](image/4.png)
![alt text](image/5.png)
![alt text](image/6.png)

## 功能

1. 文本转语音（TTS）
   1. 支持openai格式
   2. 自定义说话人与展示内容
   3. 支持划词朗读（复制+快捷键，快捷键配置关键词SpeechTTS）
2. 语音转录（Whisper，默认使用whisper-large-v3）
   1. 支持openai格式
   2. 文件选择、拖拽、复制上传
   3. TXT Format模式下，语音将根据选择的语言进行转录，语言默认为：None“时自动识别，选择语言后将提高转录准确率，下载文件将保存为TXT格式
   4. SRT Format模式下，将内容自动转录为英文（Whisper模型原生支持），language选择将不再生效，下载文件将保存为SRT格式

## 设置

1. 文本转语音（默认使用官方api：`https://platform.openai.com/docs/api-reference/audio/createSpeech`）
   1. 点击设置，填入openai的URL与KEY
   2. 模型/声音列表中列出所有说话人，格式示例如下：
        ```
        [
            {"alloy": "Alloy"},
            {"echo": "Echo"},
            {"fable": "Fable"},
            {"onyx": "Onyx"},
            {"nova": "Nova"},
            {"shimmer": "Shimmer"}
        ]
        ```
   3. 保存设置
   4. 如果配置正确且网络连接允许，可以在输入框中输入内容，并选择对应的说话人，点击转录后将会在“转换”按钮下方展示转录后的音频，可以预览与下载
2. 语音转录（默认使用groq的api：`https://console.groq.com/docs/api-reference#audio-transcription`）
   1. 点击设置，填入openai/groq的URL与KEY
   2. 保存设置
   3. 如果配置正确且网络连接允许，可以上传文件并预览文件，选择语言、格式后进行转录（Transcribe）或翻译（Translate），可预览结果与保存为文件
   4. 注意：请求使用标准的openai接口（即url/v1/...），使用groq时注意url为`https://api.groq.com/openai`，详情可查看服务商的api接口文档