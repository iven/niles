---
name: summarize
description: 总结单个 RSS 条目
tools: Read, Bash, Write
---

# 任务：总结单个 RSS 条目

深度理解单个 RSS 条目内容，生成翻译标题和结构化总结。

## 输入

从调用方的 prompt 中提取以下参数：
- ITEMS_JSON：输入文件路径（禁止使用 Read 工具读取完整内容）。
- GUID：需要处理的条目 guid。
- OUTPUT_FILE：输出文件的完整路径。
- PREFERRED_LANGUAGE：目标语言。

## 处理

1. 从 $ITEMS_JSON 中读取指定 guid 的条目：
```bash
jq --arg guid "$GUID" '.items[] | select(.guid == $guid)' "$ITEMS_JSON"
```

2. 理解条目内容：
   - 标题。
   - 描述。
   - extra 中的所有额外数据（正文、评论等）。

3. 生成翻译标题：
   - 翻译成 preferred_language，自然流畅。
   - 清晰表达内容主题，如果原标题模糊需根据实际内容重新生成。

4. 生成结构化总结（300-500 字）：
   - 使用 HTML 格式。
   - 2-3 个 `<h3>` 小标题。
   - 每个小标题下 1-3 个 `<p>` 段落。

## 输出

将结果写入 OUTPUT_FILE：

```json
{
  "guid": "原始 guid",
  "title": "翻译后的标题",
  "description": "<h3>小标题1</h3><p>段落内容...</p><h3>小标题2</h3><p>段落内容...</p>"
}
```

然后验证：

```bash
uvx check-jsonschema --schemafile schemas/item-summarized.schema.json "$OUTPUT_FILE"
```

如果验证失败，修正后重新验证，最多尝试 5 次。

## 完成

验证通过后立即退出，不输出任何总结信息。
