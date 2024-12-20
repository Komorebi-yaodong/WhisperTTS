// 读取配置文件，如果不存在则返回默认配置
function getConfig() {
  defaultConfig = {
    config:{
      TTSapiUrl:"https://api.openai.com",
      TTSapiKey:"sk-xxxxxx",
      voiceList:[{"alloy":"Alloy"},{"echo":"Echo"},{"fable":"Fable"},{"onyx":"Onyx"},{"nova":"Nova"},{"shimmer":"Shimmer"}],
      selectedVoice:"alloy",
      TTSmodel:"tts-1",
      WhisperapiUrl:"https://api.groq.com/openai",
      WhisperapiKey:"gsk_xxxxxx",
      WhisperapiModel:"whisper-large-v3"
    }
  }
    const configDoc = utools.db.get("config");
    if (configDoc) {
      return configDoc.data;
    } else {
      return defaultConfig;
    }
  }
  
  // 更新配置文件
function updateConfig(newConfig) {
    let configDoc = utools.db.get("config");
    if (configDoc) {
      // 更新已存在的配置
      configDoc.data = { ...configDoc.data, ...newConfig };
      return utools.db.put(configDoc);
    } else {
      // 创建新的配置
      return utools.db.put({
        _id: "config",
        data: newConfig,
      });
    }
  }

  
window.api = {
    getConfig,        // 添加 getConfig 到 api
    updateConfig,    // 添加 updateConfig 到 api
};

utools.onPluginEnter(async({ code, type, payload }) => {
    config = window.api.getConfig();
    console.log(config);
    if (code === 'SpeechTTS') {
      if (!utools.hideMainWindow(true)){
        utools.showNotification('取消分离为独立窗口后可以隐藏窗口');
      }
      payload = payload.replace(/([a-zA-Z])\s*\n\s*([a-zA-Z])/g, "$1 $2").replace(/\s*\n\s*/g, "");
      let requestData = {
        model: config.TTSmodel,
        input: payload,
        voice: config.selectedVoice || "alloy"
      };
      let headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.TTSapiKey}`
      };
      try{
        const response = await fetch(`${config.TTSapiUrl}/v1/audio/speech`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(requestData)
        })
        if (!response.ok) {
          utools.showNotification(`HTTP error! status: ${response.status}`)
          utools.outPlugin()
        }
        const blob = await response.blob();
        let audio = new Audio(URL.createObjectURL(blob));
        audio.play();
        audio.addEventListener('ended', () => {
          utools.outPlugin();
        })
      }
      catch(error){
        ttsLoaderContainer.style.display = 'none';
        utools.showNotification('Error:'+error);
      }
    }
})