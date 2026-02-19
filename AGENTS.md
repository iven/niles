# Niles 开发指南

## 项目简介

Niles 是一个智能 RSS 新闻聚合器，使用 Claude AI 根据个人兴趣自动筛选和聚合新闻内容。

**核心功能**：
- 基于 4 级兴趣层次（强烈感兴趣、一般感兴趣、不感兴趣、强烈排除）自动过滤内容。
- 可选的深度分析模式：生成结构化总结（输出为首选语言）。
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
├── src/
│   ├── bin/
│   │   ├── fetch-rss-items.ts     # 提取新条目
│   │   └── generate-rss.ts        # 生成 RSS
│   ├── lib/
│   │   ├── guid-tracker.ts        # GUID 历史记录跟踪
│   │   └── plugin.ts              # 插件加载器
│   └── plugins/                   # 插件系统
│       ├── fetch_meta.ts          # 获取网页元信息
│       ├── fetch_content.ts       # 获取完整内容
│       ├── cnbeta_fetch_content.ts # 获取 cnBeta 正文
│       └── hn_fetch_comments.ts   # 获取 HN 评论
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
2. 初步分类。
3. 对非排除条目进行深度分析（生成总结，使用首选语言）。
4. 基于总结后标题重新分类。
5. 生成 RSS。

### 中间文件

GitHub Actions 运行时在 `/tmp/niles-rss/{source-name}/` 目录生成以下中间文件：

**简单模式** (`summarize: false`)：
- `items-raw.json` - 提取的原始条目（包含 GUID、标题、描述等）
- `items-final.json` - 最终条目（复制自 items-raw.json）
- `filter-results.json` - 分类结果（每个 GUID 对应的分类）

**深度分析模式** (`summarize: true`)：
- `items-raw.json` - 提取的原始条目
- `filter-results-stage1.json` - 第一次分类结果（基于原始标题/摘要）
- `items/` - 每个条目的总结文件目录
  - `{guid-hash}.json` - 单个条目的总结（包含翻译后的标题和结构化总结）
- `items-final.json` - 合并所有总结后的条目
- `filter-results.json` - 第二次分类结果（基于总结后的标题）

**输出文件**（推送到 gh-pages）：
- `{source-name}.xml` - 最终生成的 RSS 文件
- `{source-name}-processed.json` - GUID 历史记录（用于去重）

### 核心组件

**Agents**：单一职责的 AI 任务单元
- `filter`：基于标题/摘要对条目分类。
- `summarize`：深度理解内容并生成总结。

**Skills**：编排多个 agents 的工作流
- `personalize-rss`：根据配置选择执行路径，并行处理条目。

**插件系统**：可扩展的内容增强
- 在提取条目时运行，为后续分析提供额外信息。
- 所有额外数据存储在 `item['extra']` 字段中。

**数据验证**：JSON Schema 严格验证中间数据格式。

**调度器**：Cloudflare Worker 读取配置文件，按 cron 触发 GitHub Actions。

**GUID 跟踪**：使用 GUID 历史记录去重，解决动态排名 RSS 的遗漏问题。

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
- 配置文件中关键词列表使用紧凑格式，逗号分隔，中英文之间不加空格（如：`3A游戏,微软Copilot`）。
- Source 配置与 global 配置合并（兴趣关键词合并，source 优先级更高）。
- GitHub Actions 每 1 小时执行所有源。

## 关键设计决策

### 为什么两阶段过滤

标题常常模糊。深度分析模式先总结内容，再基于总结后清晰的标题重新分类，显著提高准确率。

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

### 为什么用 GUID 去重而不是 lastBuildDate

**问题**：HN best RSS 是动态排名，条目可能在发布几小时后才进入 top-20。使用 lastBuildDate 时间比较会跳过这些"迟到"的条目。

**解决方案**：
1. 记录所有处理过的 GUID 及其处理时间。
2. 只处理未见过的 GUID（无论发布时间）。
3. 自动清理超过 4 天的历史记录。
4. GUID 历史记录存储在 gh-pages 分支，随 RSS 文件一起更新。

这样可以捕获所有条目，无论它们何时进入排行榜。

## 开发工作流

### 本地测试

所有测试脚本默认使用 print 模式，可通过 `-i` 或 `--interactive` 切换到交互模式。测试脚本从 `config.json` 读取配置，使用 `tests/fixtures/` 中的测试数据。

```bash
# 测试 filter agent
bash tests/test-filter-cnbeta.sh
bash tests/test-filter-hn.sh

# 测试 summarize agent
bash tests/test-summarize.sh
INPUT_FILE=tests/fixtures/phoronix-items.json bash tests/test-summarize.sh

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

**重要**：workflow 运行后必须检查日志中是否有 `Error:` 或错误信息。任何错误（即使最终被修正）都会导致 agent 重试，造成 token 浪费，不可容忍。使用以下命令检查：

```bash
gh run view <run-id> --log | grep -i "error:"
```

如果发现错误，必须：
1. 分析错误原因（schema 验证失败、插件失败、网络问题等）
2. 修复导致错误的根本原因
3. 重新测试确认不再出现错误

### 添加新插件

1. 在 `src/plugins/` 创建插件文件。
2. 导出默认对象，包含 `name` 和 `processItem(item: RssItem): Promise<RssItem>` 方法。
3. 将额外数据存储在 `item.extra` 字段中。
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
3. 验证配置文件：`bun ajv validate -s schemas/config.schema.json -d config.json`。
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
