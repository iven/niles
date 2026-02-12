---
name: personalize-rss
description: 个性化 RSS 源
---

# 任务：RSS 源筛选编排

编排 filter 和 summarize agents 来完成 RSS 内容筛选、翻译和总结。

## 输入

从环境变量读取输入参数：
```bash
printf "ITEMS_JSON=%s\nOUTPUT_DIR=%s\nCONFIG=%s\n" "$ITEMS_JSON" "$OUTPUT_DIR" "$CONFIG"
```

## 执行流程

根据 `CONFIG` 中的 `summarize` 字段选择执行流程：

### 如果 summarize=false（简单筛选）

#### 步骤 1：分类
使用 Task 工具调用 filter agent：
- 输入文件：`$ITEMS_JSON`。
- 输出文件：`$OUTPUT_DIR/filter-results.json`。
- 配置：从 `CONFIG` 获取 source_name, source_url, high_interest, interest, uninterested, exclude。

#### 步骤 2：输出最终文件
将 `$ITEMS_JSON` 复制为 `$OUTPUT_DIR/items-final.json`：
```bash
cp "$ITEMS_JSON" "$OUTPUT_DIR/items-final.json"
```

### 如果 summarize=true（深度分析）

#### 步骤 1：初步分类
使用 Task 工具调用 filter agent：
- 输入文件：`$ITEMS_JSON`。
- 输出文件：`$OUTPUT_DIR/filter-results-stage1.json`。
- 配置：从 `CONFIG` 获取相关字段。

#### 步骤 2：深度分析和翻译
1. 读取 `$OUTPUT_DIR/filter-results-stage1.json`，找出所有 type != "excluded" 的条目 guid。
2. 创建目录 `$OUTPUT_DIR/items/`。
3. 对每个 guid：
   - 计算 guid 的 MD5 hash。
   - 生成输出路径：`$OUTPUT_DIR/items/{hash}.json`。
4. 并行使用 Task 工具调用多个 summarize agent，每个处理一个条目：
   - 传递参数：ITEMS_JSON, GUID, OUTPUT_FILE, PREFERRED_LANGUAGE（从 CONFIG 获取）。
5. 等待所有 agent 完成。

#### 步骤 3：合并结果
1. 使用 jq 合并所有 items/*.json：
```bash
jq -s --slurpfile original "$ITEMS_JSON" '{
  source_name: $config.source_name,
  source_url: $config.source_url,
  source_title: $original[0].source_title,
  total_items: length,
  items: .
}' --argjson config "$CONFIG" "$TEMP_DIR"/items/*.json > "$OUTPUT_DIR/items-final.json"
```
2. 验证输出：
```bash
uvx check-jsonschema --schemafile schemas/items-summarized.schema.json "$OUTPUT_DIR/items-final.json"
```

#### 步骤 4：基于翻译后标题重新分类
使用 Task 工具调用 filter agent：
- 输入文件：`$OUTPUT_DIR/items-final.json`。
- 输出文件：`$OUTPUT_DIR/filter-results.json`。
- 配置：从 `CONFIG` 获取相关字段。
