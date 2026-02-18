---
name: summarize
description: 总结单个 RSS 条目
tools: Read, Bash, Write
---

# 任务：总结单个 RSS 条目

深度理解单个 RSS 条目内容，生成首选语言的标题和结构化总结。

## 输入

从调用方的 prompt 中提取以下参数：
- INPUT_FILE：输入文件路径（禁止使用 Read 工具读取完整内容）。
- GUID：需要处理的条目 guid。
- OUTPUT_DIR：输出目录路径。
- PREFERRED_LANGUAGE：目标语言。

## 处理

1. 从 INPUT_FILE 中读取指定 guid 的条目：
```bash
jq --arg guid "<GUID>" '.items[] | select(.guid == $guid)' "<INPUT_FILE>"
```

2. 计算 guid 的 MD5 hash 并生成输出文件路径：
```bash
HASH=$(echo -n "<GUID>" | md5sum | cut -d' ' -f1)
OUTPUT_FILE="<OUTPUT_DIR>/items/${HASH}.json"
```

3. 理解条目内容：
   - 标题。
   - 描述。
   - extra 中的所有额外数据（正文、评论等）。
   - 如果 `extra.content` 包含 `[IMAGE_N]` 占位符，说明文中有图片，位置信息已标记。
   - 如果有 `extra.images` 数组，包含图片的元数据（src、alt、尺寸等）。

4. 输出要求：
   - 所有输出使用首选语言（preferred_language）。
   - 专有名词或缩写首次出现时，用括号标注原文，如：「火狐浏览器（Firefox）」「错误检测与纠正（EDAC）」。
   - 后续提到相同名词时可以只用首选语言或只用原文，无需重复标注。

5. 生成标题：
   - 清晰表达内容主题。
   - 如果原标题模糊需根据实际内容重新生成。

6. 生成结构化总结：
   - 使用 HTML 格式。
   - 风格要求：轻松、口语化，易于阅读。
   - 正文内容严格限制 300-500 字。
   - 如果 `extra.images` 存在，根据原文中 `[IMAGE_N]` 的位置和描述，猜测其作用，在总结中适当位置插入对应的 `<img>` 标签。（禁止试图下载图片）
   - 图片标签格式：`<img src="..." alt="..." />`（保留 width/height 属性如果有）。
   - 如果文章的主要内容涉及比较冷门的领域知识，可添加单独的「你知道吗？」章节进行深入浅出的知识科普（不超过 300 字，不计入正文字数）。

## 输出

**重要**：中文内容中的引号必须使用直角引号「」，英文内容保持使用英文引号，以避免 JSON 格式错误。

将结果写入 OUTPUT_FILE：

```json
{
  "guid": "原始 guid",
  "title": "首选语言标题",
  "description": "HTML 格式的结构化总结"
}
```

然后验证：

```bash
bun ajv validate --spec=draft7 -s schemas/item-summarized.schema.json -d "$OUTPUT_FILE"
```

如果验证失败，修正后重新验证，最多尝试 5 次。

## 完成

验证通过后立即退出，不输出任何总结信息。
