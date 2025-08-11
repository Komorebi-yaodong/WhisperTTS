// 读取配置文件，如果不存在则返回默认配置
function getConfig() {
  defaultConfig = {
    config:{
      TTSapiUrl:"https://api.openai.com",
      TTSapiKey:"sk-xxxxxx",
      voiceList:[{"alloy":"Alloy"},{"echo":"Echo"},{"fable":"Fable"},{"onyx":"Onyx"},{"nova":"Nova"},{"shimmer":"Shimmer"}],
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
  
  // 异步方式更新配置文件 (可选)
async function updateConfigAsync(newConfig) {
    let configDoc = utools.db.get("config");
    if (configDoc) {
      configDoc.data = { ...configDoc.data, ...newConfig };
      return await utools.db.promises.put(configDoc);
    } else {
      return await utools.db.promises.put({
        _id: "config",
        data: newConfig,
      });
    }
  }

  
window.api = {
    getConfig,        // 添加 getConfig 到 api
    updateConfig,    // 添加 updateConfig 到 api
    updateConfigAsync // 添加 updateConfigAsync 到 api (可选)
};

utools.onPluginEnter(({ code, type, payload }) => {
    data = getConfig();
    console.log(data);
})