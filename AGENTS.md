# Niles 开发指南

## 项目简介

Niles 是一个智能 RSS 新闻聚合器，使用 Claude AI 根据个人兴趣自动筛选和聚合新闻内容。

**核心功能**：
- 基于 4 级兴趣层次（强烈感兴趣、一般感兴趣、不感兴趣、强烈排除）自动过滤内容。
- 可选的深度分析模式：翻译标题并生成结构化总结。
- 插件系统：获取网页元信息、完整内容、Hacker News 评论等额外数据。
- 使用 Cloudflare Workers cron 自动调度，GitHub Actions 执行，GitHub Pages 托管输出。

## 架构概览

### 目录结构

```
.
├── .claude/
│   ├── agents/
│   │   ├── filter.md              # 分类 agent
│   │   └── summarize.md           # 总结 agent
│   └── skills/
│       └── personalize-rss/
│           └── SKILL.md           # 编排 skill
├── .github/workflows/
│   └── fetch-rss.yml              # GitHub Actions workflow
├── scripts/
│   ├── fetch-rss-items.py         # 提取新条目
│   ├── generate-rss.py            # 生成 RSS
│   └── plugins/                   # 插件系统
│       ├── fetch_meta.py          # 获取网页元信息
│       ├── fetch_content.py       # 获取完整内容
│       └── hacker_news_comments.py # 获取 HN 评论
├── schemas/                        # JSON Schema 验证
│   ├── filter-results.schema.json
│   ├── items-summarized.schema.json
│   └── item-summarized.schema.json
├── tests/                          # 测试脚本
│   ├── lib/common.sh
│   ├── fixtures/                   # 测试数据
│   ├── test-filter-*.sh
│   ├── test-summarize.sh
│   └── test-personalize-*.sh
└── worker/
    ├── config.json                 # 配置文件
    ├── config.schema.json
    └── index.js                    # Cloudflare Worker
```

### 工作流程

**简单模式** (`summarize: false`):
1. 提取新条目
2. 基于标题和摘要进行分类
3. 生成 RSS

**深度分析模式** (`summarize: true`)：
1. 提取新条目（可选使用插件获取额外信息）。
2. 初步分类（stage1）。
3. 对非排除条目进行深度分析：
   - 翻译标题为目标语言。
   - 生成结构化 HTML 总结（300-500 字）。
4. 基于翻译后标题重新分类（stage3）。
5. 生成 RSS。

### 核心组件

**Agents**：单一职责的 AI 任务单元
- `filter`：基于标题/摘要对条目分类。
- `summarize`：深度理解内容并生成翻译和总结。

**Skills**：编排多个 agents 的工作流
- `personalize-rss`：根据配置选择执行路径，并行处理条目。

**插件系统**：可扩展的内容增强
- 在提取条目时运行，为后续分析提供额外信息。
- 所有额外数据存储在 `item['extra']` 字段中。

**数据验证**：JSON Schema 严格验证中间数据格式。

**调度器**：Cloudflare Worker 读取配置文件，按 cron 触发 GitHub Actions。

## 设计原则

### Context 节约

避免将大文件加载到 AI context：
- 使用 bash/jq 提取必要数据。
- Filter agent 输出分类后，用 jq 从源文件合并 description。
- 只传递 AI 需要的字段（标题、摘要、meta）。

### 数据流

- 所有中间数据使用 JSON 格式。
- JSON Schema 验证格式，失败时自动重试（最多 5 次）。
- 使用 jq 在文件层面合并数据。

### 配置管理

- 单一配置源：`config.json`。
- Source 配置与 global 配置合并（兴趣关键词合并，source 优先级更高）。
- GitHub Actions 每 30 分钟执行所有源。

## 关键设计决策

### 为什么两阶段过滤

标题常常模糊。深度分析模式先翻译和总结内容，再基于清晰的标题重新分类，显著提高准确率。

### 为什么 Description 不加载到 Context

分类主要依据标题和摘要，description 可能很长（网页正文、评论等）。设计策略：
1. Filter agent 只输出分类结果（不含 description）。
2. 使用 jq 从输入文件合并 description 到输出。
3. Description 不占用 AI context，大幅节省 tokens。


### 为什么用插件系统

插件在提取条目时运行，为分类、总结或最终输出提供额外信息：
- `fetch_meta`：获取网页 meta description 辅助分类。
- `fetch_content`：获取完整内容用于深度分析。
- `cnbeta_fetch_content`：获取 cnBeta 文章正文（HTML 格式），直接替换 description 字段用于最终 RSS 输出。
- `hn_fetch_comments`：获取 Hacker News 讨论内容理解社区关注点。

## 开发工作流

### 本地测试

所有测试脚本默认使用 print 模式，可通过 `-i` 或 `--interactive` 切换到交互模式。测试脚本从 `config.json` 读取配置，使用 `tests/fixtures/` 中的测试数据。

```bash
# 测试 filter agent
bash tests/test-filter-cnbeta.sh
bash tests/test-filter-hn.sh

# 测试 summarize agent
bash tests/test-summarize.sh

# 测试完整流程
bash tests/test-personalize-cnbeta.sh
bash tests/test-personalize-hn.sh

# 测试插件
bash tests/test-plugin.sh fetch_content https://www.phoronix.com/news/example

# 任意脚本都支持交互模式
bash tests/test-personalize-hn.sh -i
```

### 手动触发 workflow

使用 `gh workflow run` 触发 workflow。

```bash
# 正常执行（会推送到 gh-pages）
gh workflow run fetch-rss.yml

# Dry run 模式（不推送到 gh-pages，固定抓取 3 条用于测试）
gh workflow run fetch-rss.yml -f dry-run=true

# 在非默认分支测试（需要指定 --ref）
gh workflow run fetch-rss.yml --ref your-branch-name -f dry-run=true
```

**参数说明**：
- `-f dry-run=true`：启用 dry run 模式，不推送到 gh-pages，固定抓取 3 条
- `--ref`：指定运行 workflow 的分支（默认使用当前分支或仓库默认分支）

### 添加新插件

1. 在 `scripts/plugins/` 创建插件文件。
2. 实现 `process_item(item: dict) -> dict` 函数。
3. 将额外数据存储在 `item['extra']` 字段中。
4. 更新 `schemas/config.schema.json` 的 plugins enum。
5. 使用 `test-plugin.sh` 测试插件功能。

### 添加新 Agent

1. 在 `.claude/agents/` 创建 markdown 文件。
2. 定义 frontmatter (name, description, tools)。
3. 编写任务说明和输入输出格式。
4. 创建对应的测试脚本。
5. 在 skill 中调用新 agent。

### 修改配置结构

1. 更新 `schemas/config.schema.json`。
2. 更新 `config.json`。
3. 验证配置文件：`uvx check-jsonschema --schemafile schemas/config.schema.json config.json`。
4. 更新所有使用该配置的 agents/skills。

## 代码规范

### 编码风格

修改文件时必须先阅读现有内容，严格遵照原有的代码/行文风格。

**关键原则**：更详细 ≠ 更有帮助。如果现有内容是简洁的，新增内容也必须简洁。

### Git 操作

**禁止自动提交和推送代码**，除非用户明确说明（如「commit this」「push」）。

- 修改代码后，等待用户指示再提交。
- 不要主动运行 `git commit` 或 `git push`。
- 用户可能需要先审查修改或进行其他操作。

### Commit Message

所有 commit message 使用英文编写：

- 首字母大写，使用祈使句。
- 简洁描述改动内容。
- 常用动词：`Add`、`Update`、`Fix`、`Remove`、`Refactor`、`Improve` 等。

示例：
```
Add documentation and refine filtering workflow
Fix shell syntax error in Generate RSS step
Improve RSS workflow and prompt
```
