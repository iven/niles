# Niles 开发指南

## 项目简介

Niles 是一个智能 RSS 新闻聚合器，使用 AI 根据个人兴趣自动筛选和聚合新闻内容。

**核心功能**：
- 基于 4 级兴趣层次（强烈感兴趣、一般感兴趣、不感兴趣、强烈排除）自动过滤内容。
- 可选的深度分析模式：生成结构化总结（输出为首选语言）。
- 多 AI provider 支持：使用 Tanstack AI 支持 Anthropic、OpenAI、Gemini、OpenRouter、Grok。
- RSSHub 支持：可直接使用 RSSHub 路由作为 RSS 源。
- 插件系统：获取网页元信息、完整内容、Hacker News 评论等额外数据。
- 使用 GitHub Actions cron 自动调度执行，GitHub Pages 托管输出。

## 架构概览

### 目录结构

```
.
├── bin/
│   └── cli.ts                      # CLI 入口
├── src/
│   ├── workflow.ts                 # 主工作流逻辑
│   ├── grade.ts                    # 分级逻辑
│   ├── summarize.ts                # 总结逻辑
│   ├── types.ts                    # 类型定义
│   ├── lib/                        # 可复用库组件
│   │   ├── llm.ts                  # LLM 客户端
│   │   ├── config.ts               # 配置加载
│   │   └── guid-tracker.ts         # GUID 跟踪
│   └── rss/                        # RSS 处理模块
│       ├── plugin.ts               # 插件加载器
│       ├── loader.ts               # RSS 加载
│       ├── writer.ts               # RSS 写入
│       └── plugins/                # 插件系统
│           ├── clean_text.ts
│           ├── fetch_content.ts
│           ├── hn_fetch_comments.ts
│           └── zaihuapd_clean_description.ts
├── .github/workflows/
│   └── fetch-rss.yml               # GitHub Actions workflow
└── config.json                     # 配置文件
```

### 工作流程

**简单模式** (`summarize: false`):
1. 加载 RSS 条目（应用插件）
2. 基于标题和描述进行分级
3. 生成 RSS 输出

**深度分析模式** (`summarize: true`)：
1. 加载 RSS 条目（应用插件）
2. 初步分级（避免为排除条目浪费 token）
3. 对非排除条目生成总结（使用首选语言）
4. 基于总结后标题重新分级（更清晰的标题提高准确率）
5. 生成 RSS 输出

### 输出文件

推送到 gh-pages 分支：
- `{source-name}.xml` - RSS 文件
- `{source-name}-guid-history.json` - GUID 历史记录（用于去重）

### 核心组件

**AI 处理模块**：
- `grade`：使用 Tanstack AI 调用配置的 LLM，基于标题/摘要对条目分级。
- `summarize`：使用 Tanstack AI 调用配置的 LLM，深度理解内容并生成总结。
- `llm.ts`：根据配置的 provider 创建对应的 LLM 客户端。

**主流程**：
- `workflow.ts`：整合完整的 RSS 处理流程，根据配置选择执行路径，并行处理条目。

**插件系统**：
- 在加载 RSS 时运行，为后续处理提供额外数据。
- 所有额外数据存储在 `item['extra']` 字段中。
- 内置插件：`clean_text`（清理零宽字符和空白）。
- 可选插件：`fetch_content`（获取网页内容）、`hn_fetch_comments`（获取 HN 评论）、`zaihuapd_clean_description`（清理特定来源内容）。

**GUID 跟踪**：
- 使用 GUID 历史记录而不是时间比较，解决动态排名 RSS（如 HN best）条目延迟进榜的问题。
- 自动清理超过 4 天的历史记录。

## 设计原则

### 配置管理

- 单一配置源：`config.json`，使用 Zod schema 验证。
- LLM 配置（`llm` 字段）：
  - `provider`：AI provider 类型（anthropic、openai、gemini、openrouter、grok）。
  - `baseUrl`：可选，自定义 API 端点（仅 OpenAI 支持）。
  - `models`：各任务使用的模型名称（`grade` 和 `summarize`）。
  - API key 通过环境变量提供（如 `ANTHROPIC_API_KEY`、`OPENAI_API_KEY`）。
- 配置文件中关键词列表使用紧凑格式，逗号分隔，中英文之间不加空格（如：`3A游戏,微软Copilot`）。
- Source 配置与 global 配置合并（兴趣关键词合并，source 优先级更高）。
- RSSHub 支持：`url` 字段可以使用 RSSHub 路由格式（如 `rsshub:/cnbeta/newest`）。
- GitHub Actions 每 1 小时执行所有源。


## 开发工作流

### 本地测试

```bash
# 运行所有单元测试和集成测试
bun test

# 测试单个 source
bun run niles <source-name>

# 使用自定义配置
bun run niles <source-name> --config config.json --output-dir output
```

### 手动测试脚本

**重要提示：这些脚本会调用真实的 LLM API，每次执行都会产生费用。应尽量减少执行次数。**

在 `scripts/` 目录下提供了手动测试工具：

```bash
# 测试分级功能（使用 3 个不同主题的测试条目）
bun run scripts/test-grade.ts

# 测试总结功能（使用包含引号、图片等格式的测试条目）
bun run scripts/test-summarize.ts
```

**使用注意事项**：
- 这些脚本直接调用 LLM API，会消耗 token 并产生费用
- 只在需要验证 LLM 行为时手动执行，不应作为常规测试的一部分
- 不要使用 grep、tail 等工具多次采集日志 - 如果第一次没找到内容，应直接重新完整执行脚本
- 脚本输出已经格式化，可以直接阅读，无需额外处理

### 代码检查

```bash
# 运行类型检查
bun run typecheck

# 运行代码风格检查和格式化
bun run check

# 检查未使用的代码、依赖和导出
bun run knip
```

### 手动触发 workflow

**禁止自动触发 workflow**，除非用户明确说明（如「run workflow」「trigger workflow」）。

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

1. 在 `src/rss/plugins/` 创建插件文件。
2. 导出默认对象，包含 `name` 和 `processItem(item: UngradedRssItem): Promise<UngradedRssItem>` 方法。
3. 将额外数据存储在 `item.extra` 字段中。
4. 编写单元测试，使用真实数据验证功能。
5. 本地测试插件功能：`bun run niles <source-name> --dry-run`。

### 修改配置结构

1. 更新 `src/lib/config.ts` 中的 Zod schema。
2. 更新 `config.json`。
3. 运行类型检查：`bun run typecheck`。
4. 更新所有使用该配置的代码。

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
