# Hacker News 支持与智能翻译功能设计

## 概述

为 Niles 添加对 Hacker News 等英文源的支持，通过抓取网页内容和社区评论，结合两阶段 AI 筛选，生成中文的智能总结 RSS。

## 核心问题

Hacker News 有两个特殊挑战：

1. **标题模糊**：仅从标题和 RSS 描述难以判断内容相关性
2. **语言障碍**：英文内容需要翻译为中文，但不是简单直译，而是智能总结

## 解决方案

### 架构：三阶段流程

```
extract-new-items.py (增强)
  ↓ 抓取网页内容
  │ - Meta description
  │ - 正文前 1000 字符
  ↓
Claude 两阶段分析
  ↓
  阶段 1: 快速筛选 (title + meta)
  │ - 标记可能感兴趣的为 "maybe"
  │ - 其他直接归为 "excluded"
  ↓
  阶段 2: 深度分析 (仅针对 maybe)
  │ - 读取正文内容
  │ - 获取社区评论 (AI 自主决定)
  │ - 最终分类 + 智能总结
  ↓
generate-rss.py (增强)
  ↓ 生成中文 RSS
```

### Token 优化

**传统方式**（所有条目都分析正文）：
- 30 条 × 500 字符 ≈ 3,750 tokens

**两阶段方式**：
- 阶段 1: 30 条 × 100 字符(meta) ≈ 750 tokens
- 阶段 2: 5 条 × 500 字符 ≈ 625 tokens
- **总计**: 1,375 tokens（**省 63%**）

## 配置设计

### 全局配置新增

```json
{
  "global": {
    "high_interest": "...",
    "interest": "...",
    "uninterested": "...",
    "exclude": "...",
    "preferred_language": "zh"  // 新增：首选语言
  }
}
```

### 源配置新增

```json
{
  "sources": [
    {
      "name": "hacker-news",
      "url": "https://hnrss.org/best",
      "cron": "0 0 * * *",
      "fetch_content": true,   // 是否抓取网页内容
      "translate": true        // 是否翻译/总结
    },
    {
      "name": "cnbeta",
      "url": "https://www.cnbeta.com.tw/backend.php",
      "cron": "*/30 * * * *",
      "fetch_content": false,  // 中文源不需要
      "translate": false
    }
  ]
}
```

**配置说明**：
- `preferred_language`: 全局设置，适用于所有需要翻译的源
- `fetch_content`: 源级别，控制是否抓取网页内容（meta + 正文）
- `translate`: 源级别，控制是否翻译/总结
- `fetch_comments`: 不配置，由 AI 根据需要自主决定

## 数据结构

### extract-new-items.py 输出

当 `fetch_content=true` 时，JSON 增加字段：

```json
{
  "source_name": "hacker-news",
  "source_url": "https://hnrss.org/best",
  "new_items": 15,
  "items": [
    {
      "guid": "https://news.ycombinator.com/item?id=12345",
      "title": "What I learned building a coding agent",
      "link": "https://example.com/coding-agent",
      "pubDate": "Sun, 01 Feb 2026 12:00:00 GMT",
      "description": "原始 RSS 的 description",

      // fetch_content=true 时新增
      "meta": "Lessons I learned while building...",
      "content": "正文前 1000 字符..."
    }
  ]
}
```

### Claude 输出（filter-results.json）

当 `translate=true` 时：

```json
{
  "source_name": "hacker-news",
  "source_url": "https://hnrss.org/best",
  "results": {
    "guid-1": {
      "title": "从零构建 Coding Agent：最小化设计理念的实践",
      "description": "作者详细介绍了构建 coding agent 的技术细节...\n\n社区讨论：\n- 多数人认同最小化理念，但对不支持 MCP 有争议\n- 主要讨论焦点在于 YOLO 模式的可靠性",
      "type": "interest",
      "reason": "编程工具和效率相关"
    }
  }
}
```

## Prompt 改动

### 新增环境变量

```markdown
- `PREFERRED_LANGUAGE`: 首选语言（如 "zh", "en"）
- `FETCH_CONTENT`: 是否已抓取网页内容（"true"/"false"）
- `TRANSLATE`: 是否需要翻译/总结（"true"/"false"）
```

### 两阶段筛选逻辑

```markdown
## 执行步骤

### 1. 阶段一：快速筛选（基于标题和 Meta）

读取 NEW_ITEMS_JSON 中每个条目的 `title` 和 `meta` 字段，
快速判断哪些条目可能感兴趣，标记为 `maybe`。

其他条目直接归类为 `excluded`。

### 2. 阶段二：深度分析（仅针对 maybe）

对于标记为 `maybe` 的条目：

1. 读取 `content` 字段（网页正文摘要）

2. 如果条目来自社交新闻平台，可以尝试通过 API 获取社区评论
   例如：Hacker News 可以使用 Hacker News API

   注意：是否获取评论由 AI 自主判断，不是强制要求

3. 综合分析后：
   - 判断最终分类：high_interest / interest / other / excluded
   - 如果 TRANSLATE=true，生成目标语言的标题和描述
```

### 翻译/总结格式

```markdown
如果 TRANSLATE=true：

- `title`: 用 PREFERRED_LANGUAGE 概括文章核心内容和观点
  - 要自然，像新闻标题
  - 不要生硬的"作者分享"等说法
  - 示例：
    - ✗ "作者分享构建最小化 Coding Agent 的经验"
    - ✓ "从零构建 Coding Agent：最小化设计理念的实践"

- `description`: 用 PREFERRED_LANGUAGE 总结，包含：
  - 文章主要内容和核心观点
  - 社区讨论的主要观点和争议点（如果获取了评论）
  - 格式：
    ```
    <文章内容总结>

    社区讨论：
    - <讨论要点1>
    - <讨论要点2>
    ```
```

## 实现变更

### 1. extract-new-items.py

**改为 uv script**：
```python
#!/usr/bin/env -S uv run --script
# /// script
# dependencies = ["httpx", "beautifulsoup4"]
# ///
```

**新增功能**：
- 读取配置中的 `fetch_content` 字段
- 如果为 true，对每个新条目：
  - 用 httpx + BeautifulSoup 抓取网页
  - 提取 meta description
  - 提取正文前 1000 字符
  - 添加到输出 JSON

**技术细节**：
```python
import httpx
from bs4 import BeautifulSoup

def fetch_page_content(url, max_length=1000):
    """抓取网页内容"""
    with httpx.Client(timeout=10) as client:
        response = client.get(url, headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        })
        response.raise_for_status()

    soup = BeautifulSoup(response.text, 'html.parser')

    # 提取 meta description
    meta = soup.find('meta', attrs={'name': 'description'}) or \
           soup.find('meta', attrs={'property': 'og:description'})
    meta_desc = meta.get('content', '') if meta else ''

    # 提取正文
    for tag in soup(['script', 'style', 'nav', 'header', 'footer', 'aside']):
        tag.decompose()

    main = soup.find('article') or soup.find('main') or soup.find('body')
    text = main.get_text(separator=' ', strip=True) if main else ''
    text = ' '.join(text.split())  # 清理空白

    return {
        'meta': meta_desc,
        'content': text[:max_length]
    }
```

### 2. rss-prompt.md

**主要改动**：
- 添加新的环境变量说明
- 添加两阶段筛选逻辑
- 添加翻译/总结格式说明
- 保持通用性：不写死特定平台的 URL 或 API

### 3. generate-rss.py

**改为 uv script**：
```python
#!/usr/bin/env -S uv run --script
# /// script
# dependencies = []
# ///
```

**改动**：
- 读取 filter-results 时，优先使用翻译后的 title 和 description
- 如果不存在，回退到原始的 title 和 description

```python
# 原有逻辑
title = item.get("title")
description = item.get("description", "")

# 新增：如果有翻译，使用翻译
if guid in filter_results:
    result = filter_results[guid]
    title = result.get("title", title)  # 优先用翻译后的
    description = result.get("description", description)
```

### 4. config.schema.json

**新增字段定义**：
```json
{
  "global": {
    "properties": {
      "preferred_language": {
        "type": "string",
        "description": "首选语言代码，如 zh, en",
        "default": "zh"
      }
    }
  },
  "sources": {
    "items": {
      "properties": {
        "fetch_content": {
          "type": "boolean",
          "description": "是否抓取网页内容（meta + 正文）",
          "default": false
        },
        "translate": {
          "type": "boolean",
          "description": "是否翻译/总结为 preferred_language",
          "default": false
        }
      }
    }
  }
}
```

### 5. test.py

**改为 uv script**：
```python
#!/usr/bin/env -S uv run --script
# /// script
# dependencies = []
# ///
```

**改动**：
- 传递新的环境变量：`PREFERRED_LANGUAGE`, `FETCH_CONTENT`, `TRANSLATE`
- 从配置中读取这些值

### 6. .github/workflows/fetch-rss.yml

**改动**：
- 从 config payload 中读取 `fetch_content` 和 `translate`
- 设置对应的环境变量传递给 Claude

## 依赖管理

使用 uv script 的 inline metadata 管理依赖，无需额外安装步骤：

```python
#!/usr/bin/env -S uv run --script
# /// script
# dependencies = ["httpx", "beautifulsoup4"]
# ///
```

uv 会自动创建虚拟环境并安装依赖。
