# 任务：RSS 源筛选

你需要从 RSS feed 读取内容并根据兴趣筛选。

## 输入参数（环境变量）

- `SOURCE_NAME`: 源名称（如 cnbeta）
- `SOURCE_URL`: RSS feed URL
- `INTERESTS_TOPICS`: 感兴趣的主题（逗号分隔）
- `INTERESTS_EXCLUDE`: 排除的主题（逗号分隔）

## 执行步骤

### 1. 读取 RSS feed

访问 SOURCE_URL，解析 RSS 内容，获取所有条目。

### 2. 基于标题 AI 筛选

**筛选规则（宽松策略）：**

对每个条目按以下顺序判断：
1. **优先排除**：如果标题与 INTERESTS_EXCLUDE 中的任何主题相关 → 排除
2. **保留其他**：其他所有条目都保留
3. **优先级排序**：匹配 INTERESTS_TOPICS 的条目排在前面

**输出要求：**
- 输出筛选理由（用于调试）
- 对每个条目标注是否匹配感兴趣主题

### 3. 生成 RSS

输出到 `output/SOURCE_NAME.xml`。

RSS 格式：
```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>SOURCE_NAME - 精选</title>
    <link>SOURCE_URL</link>
    <description>基于个人兴趣筛选的 SOURCE_NAME 内容</description>
    <lastBuildDate>2026-01-31T08:30:00Z</lastBuildDate>

    <item>
      <title>文章标题</title>
      <link>原文链接</link>
      <pubDate>2026-01-31T07:00:00Z</pubDate>
      <description>原始描述</description>
    </item>
  </channel>
</rss>
```

**要求：**
- 保留原始条目的：
  - 标题
  - 链接
  - 描述
  - 发布时间
- 按发布时间倒序排列
- lastBuildDate 使用当前时间（ISO 8601 格式）
- channel 的 title 使用 "SOURCE_NAME - 精选" 格式
