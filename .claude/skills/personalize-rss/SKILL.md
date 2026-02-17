---
name: personalize-rss
description: 个性化 RSS 源
---

# 任务：RSS 源筛选编排

编排 filter 和 summarize agents 来完成 RSS 内容筛选和总结。

## 输入

从环境变量读取输入参数：
```bash
printf "INPUT_FILE=%s\nOUTPUT_DIR=%s\nGLOBAL_CONFIG=%s\nSOURCE_CONFIG=%s\n" "$INPUT_FILE" "$OUTPUT_DIR" "$GLOBAL_CONFIG" "$SOURCE_CONFIG"
```

## 执行流程

根据已读取到的 SOURCE_CONFIG 中的 `summarize` 值决定执行哪个流程。

### 如果 summarize=false（简单筛选）

#### 步骤 1：分级
使用 Task 工具调用 filter agent：
- 输入文件：`<INPUT_FILE>`。
- 输出文件：`<OUTPUT_DIR>/filter-results.json`。
- 传递：GLOBAL_CONFIG, SOURCE_CONFIG。

#### 步骤 2：输出最终文件
将 `<INPUT_FILE>` 复制为 `<OUTPUT_DIR>/items-final.json`：
```bash
cp "<INPUT_FILE>" "<OUTPUT_DIR>/items-final.json"
```

### 如果 summarize=true（深度分析）

#### 步骤 1：初步分级
使用 Task 工具调用 filter agent：
- 输入文件：`<INPUT_FILE>`。
- 输出文件：`<OUTPUT_DIR>/filter-results-stage1.json`。
- 传递：GLOBAL_CONFIG, SOURCE_CONFIG。

#### 步骤 2：深度分析
1. 提取非 exclude 的条目 guid：
```bash
jq -r '.results | to_entries[] | select(.value.type == "exclude" | not) | .key' "<OUTPUT_DIR>/filter-results-stage1.json"
```
2. 创建目录 `<OUTPUT_DIR>/items/`。
3. 并行使用 Task 工具调用多个 summarize agent，每个处理一个条目：
   - 传递参数：INPUT_FILE, GUID, OUTPUT_DIR（让 agent 自己生成输出文件路径）, PREFERRED_LANGUAGE（从 GLOBAL_CONFIG 获取）。
4. 等待所有 agent 完成。

#### 步骤 3：合并结果
1. 使用 jq 合并所有 items/*.json，并从原始数据补充 link 和 pubDate：
```bash
SOURCE_NAME=$(echo "<SOURCE_CONFIG>" | jq -r '.name')
SOURCE_URL=$(echo "<SOURCE_CONFIG>" | jq -r '.url')
jq -s --slurpfile original "<INPUT_FILE>" --arg source_name "$SOURCE_NAME" --arg source_url "$SOURCE_URL" '{
  source_name: $source_name,
  source_url: $source_url,
  source_title: $original[0].source_title,
  total_items: length,
  items: map(
    . as $summarized |
    ($original[0].items[] | select(.guid == $summarized.guid)) as $orig |
    $summarized + {link: $orig.link, pubDate: $orig.pubDate}
  )
}' "<OUTPUT_DIR>"/items/*.json > "<OUTPUT_DIR>/items-final.json"
```
2. 验证输出：
```bash
uvx check-jsonschema --schemafile schemas/items-summarized.schema.json "<OUTPUT_DIR>/items-final.json"
```

#### 步骤 4：基于处理后条目重新分级
使用 Task 工具调用 filter agent：
- 输入文件：`<OUTPUT_DIR>/items-final.json`。
- 输出文件：`<OUTPUT_DIR>/filter-results.json`。
- 传递：GLOBAL_CONFIG, SOURCE_CONFIG。
