import pyperclip
import os


from moveDist import moveDist


UTOOLS_DOC = "./utools-api-doc.md"
README = "./README.md"
PRELOAD = "./"+moveDist()+"/"

MAIN = [
    "./whisper-tts-vue/index.html",
    "./whisper-tts-vue/src/stores/",
    "./whisper-tts-vue/src/components/",
    "./whisper-tts-vue/src/App.vue",
]



# 获取文件文本
def read_text(file_path,iscode = True):
    with open(file_path, 'r',encoding='utf-8') as file:
        if iscode:
            return f"```{file_path.split('.')[-1]}\n{file_path}\n"+file.read()+"\n```\n"
        else:
            return file.read()+"\n"


# 从置顶目录下获取文件文本
def get_text_from_dir(dir_path):
    text = ""
    for file in os.listdir(dir_path):
        file_path = os.path.join(dir_path, file)
        if os.path.isfile(file_path) and (file.endswith(".md") or file.endswith(".js") or file.endswith(".vue") or file.endswith(".json")):
            text += read_text(file_path)
    return text


def get_summary():
    utools_doc = read_text(UTOOLS_DOC,False)
    readme = read_text(README,False)
    preload = get_text_from_dir(PRELOAD)
    main_text = ""
    for file in MAIN:
        if os.path.isdir(file):
            main_text += get_text_from_dir(file)
        else:
            main_text += read_text(file)
    
    text = [
        "以下是Utools插件的开发文档",
        utools_doc,
        "以下是whispertts_main的README文件",
        readme,
        "以下是预加载文件和主页面,preload，preload.js是主界面的预加载文件、window_preload.js是独立窗口界面的预加载文件，其它是其他工具文件",
        preload,
        "以下是主页面的前端代码，在./whisper-tts-vue/目录下，其预加载文件为preload.js",
        main_text,
        "不论你进行如何修改，一定保证不会破坏已有的功能，前端修改一定要保持相同的主题风格，并保证节省开发者工作量的原则，对于javascript，如果只改动一个函数，请给出完整的函数代码并告诉我在哪里进行覆盖，对于vue代码，请给出所需要修改的对应的块（完整的<script setup>块、<template>块或者<style>块等完整的代码），千万不要省略代码\n\n"
    ]

    return "\n".join(text)

if __name__ == "__main__":
    sum = get_summary()
    with open("result.md", "w", encoding='utf-8') as file:
        file.write(sum)
    # 将内容发送到剪切板
    pyperclip.copy(sum)
    print("内容已复制到剪切板")