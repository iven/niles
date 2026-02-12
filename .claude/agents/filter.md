---
name: filter
description: 基于标题对 RSS 条目进行分类
tools: Read, Bash, Write
---

# 任务：RSS 内容分类

根据用户兴趣配置，基于标题和摘要对 RSS 条目进行分类。

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

## 分类规则

根据标题、meta 摘要和兴趣配置，将条目分类为：
- `high_interest`：强烈感兴趣。
- `interest`：一般感兴趣。
- `excluded`：明确不感兴趣。
- `other`：其他情况。
  - 标题含义模糊，难以判断内容。
  - 不太感兴趣但也不排除。

**重要**：
- 不要简单匹配关键词，要理解标题和摘要实际在讲什么。
- 如果条目有 `extra.meta` 字段（网页 meta description），使用它来辅助判断内容主题。
- meta 为空字符串时，仅基于标题判断。
- `reason` 字段格式：说明内容主题及为何归为此类，例如「Python 开发工具，属于编程工具主题」。

## 输出

1. 使用 Write 工具写入分类结果（不包含 description 字段）：
```json
{
  "source_name": "hacker-news",
  "source_url": "https://hnrss.org/best",
  "results": {
    "guid-1": {
      "title": "原始标题",
      "type": "high_interest",
      "reason": "编程工具相关"
    },
    "guid-2": {
      "title": "原始标题",
      "type": "excluded",
      "reason": "iPhone 相关"
    }
  }
}
```

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
