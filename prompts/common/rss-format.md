# RSS 格式规范

## 基础结构

```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>SOURCE_NAME - 精选</title>
    <link>源网站链接</link>
    <description>基于个人兴趣筛选的 SOURCE_NAME 内容</description>
    <lastBuildDate>当前时间（ISO 8601 格式）</lastBuildDate>

    <!-- 条目列表，按发布时间倒序排列 -->
    <item>
      <!-- 具体内容见各策略定义 -->
    </item>
  </channel>
</rss>
```

## 通用要求

- 使用 UTF-8 编码
- lastBuildDate 使用当前时间（ISO 8601 格式，如 `2026-01-31T08:30:00Z`）
- 所有条目按 `<pubDate>` 倒序排列（最新的在前）
- channel 的 title 格式：`SOURCE_NAME - 精选`

## 条目基础字段

每个 `<item>` 必须包含：
- `<title>`: 标题
- `<link>`: 原文链接
- `<pubDate>`: 发布时间（ISO 8601 格式）
- `<guid>`: 唯一标识符（通常使用链接或讨论页面链接）

## HTML 内容处理

- 所有 HTML 内容必须用 `<![CDATA[...]]>` 包裹
- 在 `<description>` 和 `<content:encoded>` 中使用 HTML 标签
