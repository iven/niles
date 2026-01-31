# 任务：讨论聚合源抓取

你需要从讨论聚合类网站（如 Hacker News）抓取内容并生成 RSS。

## 输入参数（环境变量）

- `SOURCE_NAME`: 源名称（如 hacker-news）
- `SOURCE_URL`: 源 URL
- `TOP_ITEMS`: 抓取前 N 条热门帖子
- `INTERESTS_TOPICS`: 感兴趣的主题（逗号分隔）
- `INTERESTS_EXCLUDE`: 排除的主题（逗号分隔）

## 执行步骤

### 1. 获取帖子列表

**使用 Hacker News API：**

SOURCE_URL 是 Hacker News API 基础地址（`https://hacker-news.firebaseio.com/v0`）。

步骤：
1. 访问 `{SOURCE_URL}/topstories.json` 获取热门帖子 ID 列表
2. 取前 TOP_ITEMS 个 ID
3. 对每个 ID，访问 `{SOURCE_URL}/item/{id}.json` 获取帖子详情

从 API 提取信息：
- `title`: 标题
- `url`: 原文链接
- `id`: 帖子 ID（用于构建 HN 讨论链接：`https://news.ycombinator.com/item?id={id}`）
- `score`: 分数
- `by`: 作者
- `time`: 发布时间（Unix 时间戳）
- `descendants`: 评论数量
- `kids`: 评论 ID 列表

### 2. 基于标题 AI 筛选

对每个帖子：
- 根据 INTERESTS_TOPICS 判断是否相关
- 根据 INTERESTS_EXCLUDE 排除不关心的内容
- 输出筛选理由（用于调试）

只保留筛选通过的帖子。

### 3. 抓取原文和评论

对每个筛选通过的帖子：
- 访问原文链接（`url` 字段），提取主要内容
- 使用 `kids` 字段中的评论 ID，递归访问 `{SOURCE_URL}/item/{comment_id}.json` 获取评论
  - 每个评论可能有 `kids` 子评论
  - 优先抓取顶层评论和高分评论

### 4. 生成摘要

为每个帖子生成：
- **原文摘要**：200-300 字，保留核心观点
- **讨论摘要**：200-300 字，总结热门评论的主要观点和争议点

### 5. 生成 RSS

输出到 `output/SOURCE_NAME.xml`。

RSS 格式：
```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Hacker News - 精选</title>
    <link>https://news.ycombinator.com</link>
    <description>基于个人兴趣筛选的 Hacker News 内容</description>
    <lastBuildDate>2026-01-31T08:30:00Z</lastBuildDate>

    <item>
      <title>文章标题</title>
      <link>原文链接</link>
      <pubDate>2026-01-31T07:15:00Z</pubDate>
      <guid>HN 讨论链接</guid>

      <description><![CDATA[
        <h3>原文摘要</h3>
        <p>...</p>

        <h3>讨论摘要</h3>
        <p>...</p>

        <p><a href="HN讨论链接">查看 HN 讨论 (156 条评论)</a></p>
      ]]></description>

      <content:encoded><![CDATA[
        <h2>原文摘要</h2>
        <p>...</p>

        <h2>Hacker News 讨论摘要</h2>
        <p>...</p>

        <hr/>
        <p><strong>原文链接：</strong><a href="原文链接">原文链接</a></p>
        <p><strong>HN 讨论：</strong><a href="HN讨论链接">HN讨论链接</a> (156 条评论, 342 分)</p>
      ]]></content:encoded>
    </item>
  </channel>
</rss>
```

**要求：**
- 使用标准 RSS 2.0 格式
- 每个条目包含：
  - 标题
  - 原文链接
  - description：原文摘要 + 讨论摘要 + HN 讨论链接（HTML 格式，用 CDATA 包裹）
  - content:encoded：完整格式化内容（包含摘要、链接、元数据等）
  - 发布时间
- 按发布时间倒序排列
- lastBuildDate 使用当前时间（ISO 8601 格式）
