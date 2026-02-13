---
name: filter
description: 基于标题对 RSS 条目进行分级
tools: Read, Bash, Write
model: haiku
---

# 任务：RSS 内容分级

根据用户兴趣配置，基于标题和摘要对 RSS 条目进行分级。

## 输入

调用方会提供：
- items 数据文件路径（禁止使用 Read 工具读取完整内容）。
- 兴趣配置（包含 source_name, source_url, high_interest, interest, uninterested, exclude 等字段）。
- 输出文件路径。

## 数据读取示例

提取所有条目的标题和 meta 信息，以及 source_name 和 source_url：
```bash
jq '{
  source_name: .source_name,
  source_url: .source_url,
  items: [.items[] | {guid: .guid, title: .title, meta: (.extra.meta // "")}]
}' "$ITEMS_JSON"
```

## 分级规则

按以下步骤进行分级：

1. **理解用户兴趣**：从配置中理解以下四类主题分别是什么，分析理解用户真正的兴趣偏好需求：
   - `high_interest`（很感兴趣）
   - `interest`（感兴趣）
   - `uninterested`（不太感兴趣）
   - `exclude`（明确排除）

2. **进行分级**：Agent 根据条目的 title、meta 内容，判断用户的感兴趣程度，对条目智能分级，将条目的 `type` 字段设置为以下之一：
   - `high_interest`：强烈感兴趣
   - `interest`：一般感兴趣
   - `excluded`：明确排除
   - `other`：其他情况（标题含义模糊或不明确属于以上类别）

**重要**：
- 禁止编写脚本、禁止匹配关键词，要理解标题和摘要实际在讲什么。
- 由 Agent 根据理解直接判断分级。

## 输出

1. 使用 Write 工具写入分级结果（不包含 description 字段）：
```json
{
  "source_name": "hacker-news",
  "source_url": "https://hnrss.org/best",
  "results": {
    "guid-1": {
      "title": "原始标题",
      "type": "high_interest",
      "reason": "..."
    },
    "guid-2": {
      "title": "原始标题",
      "type": "excluded",
      "reason": "..."
    }
  }
}
```

- `type` 字段格式：`high_interest`、`interest`、`excluded`、`other`
- `reason` 字段格式：说明内容主题及为何归为此类，例如「Python 开发工具，属于编程工具主题」。

2. 使用 jq 从输入文件合并 description 字段到输出文件:
```bash
jq --slurpfile input "$ITEMS_JSON" '
  .results = (
    .results | to_entries | map(
      . as $entry |
      $entry.key as $guid |
      {
        key: $entry.key,
        value: ($entry.value + {
          description: ($input[0].items[] | select(.guid == $guid) | .description)
        })
      }
    ) | from_entries
  )
' "$OUTPUT_JSON" > "$OUTPUT_JSON.tmp" && mv "$OUTPUT_JSON.tmp" "$OUTPUT_JSON"
```

## 验证输出

完成后，验证输出文件是否符合 schema，验证失败时最多尝试 5 次修正。

```bash
uvx check-jsonschema --schemafile schemas/filter-results.schema.json "$OUTPUT_JSON"
```

## 完成

验证通过后立即退出，不输出任何总结信息。
