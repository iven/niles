# Niles 开发指南

## 这是什么

Niles 用 AI 把一批 RSS / 网站源按个人兴趣分级、总结，再输出成新的 RSS feed，托管在 GitHub Pages。Bun + TypeScript，由 GitHub Actions 每小时执行一次。

- 每个「源」（source）在 `config.json` 里由一条**插件链**描述：抓取 → 补全内容 → LLM 分级 / 总结 → 输出。
- 入口：`bin/cli.ts` → `src/workflow.ts`；`bin/notify.ts` 只在 Actions 里做失败提醒。
- LLM 走 Tanstack AI；RSSHub 用 npm 库在本进程内渲染，不访问官网。

```
bin/cli.ts ──> src/workflow.ts ──> src/plugin.ts（加载与调用插件）
                                        └──> src/plugins/**（各阶段实现）
```

## 目录结构

```
bin/
  cli.ts                  # CLI 入口：--config / --dry-run，跑单个 source
  notify.ts               # 记录 source 连续失败次数，达阈值时在 GitHub Issue 提醒
src/
  workflow.ts             # 五个阶段的编排、前置插件
  plugin.ts               # Plugin / PluginContext 接口、加载器、dry-run 截断
  types.ts                # FeedItem 定义
  lib/                    # 配置、LLM 客户端、http、重试、日志、GUID 与失败计数
  plugins/
    builtin/              # 通用插件：collect-*、deduplicate、clean-text、fetch-*、
                          #   llm-grade、llm-summarize、llm-digest、reporter-*、schedule
    cnbeta/ hacker-news/ zaihuapd/ zhihu/ producthunt/ github-trending/   # 站点插件
docs/plans/               # 历史设计文档
.github/workflows/        # fetch-rss（定时抓取）、pr-check（PR 检查）
config.json               # 唯一的运行时配置
prek.toml                 # 提交前检查
```

插件与文件的对应关系：`builtin/foo` → `src/plugins/builtin/foo.ts`；`foo` → `src/plugins/foo.ts`，再退到 `src/plugins/foo/index.ts`。新增插件按这个约定放。

## 运行模型

### 阶段

`src/workflow.ts` 按固定顺序推进，每个阶段拿到的 logger 已打上插件名标签：

| 阶段 | 并发 | 语义 |
| --- | --- | --- |
| `beforeRun` | 并行 | 任一插件返回 `false`，整个 source 本轮跳过 |
| `collect` | 并行 | 各插件返回条目，按链顺序合并 |
| `processItems` | 串行 | 先跑前置插件，再按链顺序跑 source 插件 |
| `report` | 串行 | 每个插件都会被执行；是否写盘由插件自己判断 |
| `afterRun` | 并行 | 收尾通知 |

**前置插件**硬编码在 `workflow.ts`（`PIPELINE_PREFIX`），对所有 source 生效，只调用 `processItems`，且只读顶层 `plugins` 里的全局 options。

### 插件链与 options

`sources[].plugins` 的元素可以是插件名字符串，也可以是 `{ "name": ..., "options": {...} }`。顶层 `plugins` 给每个插件提供全局默认 options，source 内的同名插件 options 浅合并覆盖全局值。

### dry-run

`--dry-run` / workflow 的 `dry-run` 输入用于以极少 token 验证整条链：

- collector 只保留少量样本。**collector 必须在返回前调用 `applyDryRunLimit`**（`src/plugin.ts`），否则不会被截断。
- `deduplicate` 仍写入 GUID 历史，但返回原始条目，不把已处理过的标成 `rejected`——否则 dry-run 什么都看不出。
- `report` 照常执行，但各 reporter 自己跳过写盘；workflow 也不做状态上报和 gh-pages 提交。

dry-run 同样调用 LLM API 并消耗 token，不是免费测试。

### 输出文件

Actions 把结果提交到 `gh-pages`：

- `{source}.xml` — 最终 RSS（`reporter-rss`）
- `{source}-processed.json` — 已处理 GUID 历史（`deduplicate`）
- `{source}-pending.json` — 本轮未输出的条目（`reporter-pending`，配 `collect-pending` 下轮再处理）
- `{source}-failures.json` — 连续失败次数（`bin/notify.ts`）

数量上限、清理策略、失败阈值都以对应源码里的常量为准。

### workflow

`fetch-rss.yml` 先读 `config.json` 生成 source 矩阵，每个 source 一个并行 job，最后汇总提交 `gh-pages`。cron 定时 + `workflow_dispatch`（可带 `dry-run`）。单个 source 连续失败达到阈值时，会在固定标题的 Issue 里新建或追加评论。

## 数据模型

条目类型是 `src/types.ts` 的 `FeedItem`；字段定义以那里为准，这里只写不变量。

`level` 的生命周期：

```
unknown ──llm-grade──> critical / recommended / optional / rejected
   │                         │
   │                         └── llm-summarize 也可能判为 rejected
   └──deduplicate（历史里出现过）──> rejected
```

- `rejected` 的条目最终不输出；`critical` / `recommended` 在 RSS 标题上各有星标。
- **已 `rejected` 的条目不再做重活**（抓网页、调 LLM）：插件遍历时原样返回。
- `extra` 是插件间传递附加数据的唯一通道。**`llm-summarize` 会把 `item.extra` 的所有键值序列化进提示词**，增删 `extra` 字段等于改变提示词与 token 消耗。

## 插件

接口、`PluginContext` 的字段都在 `src/plugin.ts`；`basePlugin` 给空实现，插件用 `{ ...basePlugin, ... }` 只覆盖需要的阶段。各插件的 options 以其自身的类型定义为准，本文不重复。

写插件时的不变量：

1. 只对未 `rejected` 的条目做重活，`rejected` 条目原样返回。
2. collector 返回前调用 `applyDryRunLimit`。
3. 附加数据放 `item.extra`，不改 `FeedItem` 结构。
4. 日志只用 `context.logger`（已带插件名标签），不要直接 import `lib/logger`。
5. LLM 调用通过 `context.llm(tier)`，tier 取 `llm.models` 里的同名档位（`fast` / `balanced` / `powerful`），按任务复杂度选；同一插件可多次调用不同 tier。
6. 需要网络的地方 mock `src/lib/http`，不要依赖仓库外的样本文件。

新增插件：在 `src/plugins/builtin/` 或 `src/plugins/<site>/` 下按约定放文件，默认导出插件对象，写测试，然后在 `config.json` 对应 source 的 `plugins` 里引用。

## 配置

`config.json` 由 `src/lib/config.ts` 的 zod schema 校验，结构变化以那里为准。需要知道的约定：

- `sources[].name` 同时用于日志、`output/` 下的文件名和 feed 描述。
- `sources[].title` 是 feed 标题，缺省用 collector 返回的标题。
- `sources[].context` 是 source 级背景说明，注入该源所有插件的 LLM 提示词；插件 options 里的 `context` 会与之拼接。
- LLM 的 provider、默认端点、API key 环境变量集中在 `src/lib/llm.ts` 的 `PROVIDERS` 表；新增 provider 加一行数据，协议族在 `createLlmClient` 里按 `protocol` 构造。
- 兴趣关键词分四档（`highInterest` / `interest` / `uninterested` / `avoid`），分别倾向 `critical` / `recommended` / `optional` / `rejected`。全局关键词加 `global` 前缀（如 `globalHighInterest`），source 级不带前缀，两者可共存，source 级权重更高。
- 关键词用逗号分隔的紧凑格式，中英文之间不加空格，如 `3A游戏,微软Copilot`。
- 改配置结构：更新 `config.ts` 的 schema → 更新 `config.json` → 更新读取方 → `bun run typecheck`。

## 开发工作流

### 工作位置

新需求在 `.worktrees/` 下开 worktree 开发（该目录已在 `.gitignore` 里），不要在主仓库工作区改动：

```bash
git worktree add .worktrees/<topic> -b <type>/<topic> main
```

在 worktree 里改代码、跑检查、commit；完成后 cherry-pick 到 `main`，再删掉 worktree 与分支。其他时间不要动主仓库。

worktree 里没有 `node_modules`，`knip` 会误报未使用的 devDependencies；需要时链一份主仓库的（不要提交）：`ln -s ../../node_modules node_modules`。

### 本地测试与检查

```bash
bun run niles <source> --config config.json   # 跑单个 source（会调 LLM，见下）
bun test            # 单元测试
bun run typecheck   # 类型检查
bun run check       # 代码风格检查（--error-on-warnings）
bun run check:write # 代码风格检查并自动修复
bun run knip        # 未使用的代码、依赖和导出
prek run            # git add 之后对 staged 文件跑上述全部检查
```

每个需要替换模块的测试文件自己 `mock.module`，不要依赖别的文件留下的 mock。

### Token 消耗

**严格禁止主动执行消耗 Token 的操作。**

以下操作会调用 LLM API 并消耗 token，**必须**在用户明确指示后才能执行：

1. 执行 `bun run niles <source-name>`（包括带 `--dry-run` 的命令）
2. 触发 GitHub Actions workflow（`gh workflow run`）

- dry-run 同样会调用 LLM API 并消耗 token，不是免费的测试。
- 即使用户说「测试」「验证」，也必须先询问确认，不能自行执行。
- 只有当用户明确说「执行」「运行」「run」等词时才能执行。

### 触发 workflow

**禁止自动触发 workflow**，除非用户明确说明（如「run workflow」「trigger workflow」）。触发时禁止自行添加 `--dry-run` 参数，除非用户明确要求。

```bash
gh workflow run fetch-rss.yml
gh workflow run fetch-rss.yml -f dry-run=true            # 不推 gh-pages，只验证流水线
gh workflow run fetch-rss.yml --ref <branch> -f dry-run=true
```

## 代码规范

### 编码风格

修改文件时必须先阅读现有内容，严格遵照原有的代码/行文风格。

**关键原则**：更详细 ≠ 更有帮助。如果现有内容是简洁的，新增内容也必须简洁。

### TypeScript 类型

**严格禁止使用 `any` 和 `unknown` 类型。**

- 必须为所有变量、函数参数、返回值提供明确的类型定义。
- 如果不知道某个类型，应该先查阅官方文档，不到万不得已不要查看源代码。
- 使用 `bun run typecheck` 确保类型检查通过。

### Git

**严格禁止主动提交和推送代码。**

`git commit`、`git commit --amend`、`git push` 均属于破坏性操作，只有用户明确说出对应指令时才能执行。完成代码修改后，必须停下来等待用户确认修改符合要求，不得因为用户之前说过「commit and push」，就认为主动执行 commit 是正确的。

### Commit message

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
