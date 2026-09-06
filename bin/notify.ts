#!/usr/bin/env bun
/**
 * 更新单个 source 的连续失败计数，达到阈值时通知 GitHub Issue
 *
 * 用法：bun bin/notify.ts --source <name> --status <success|failure> [--run-url <url>] [--failures <path>] [--dry-run]
 */

import { parseArgs } from "node:util";
import { updateFailureCount } from "../src/lib/failure-tracker";

/** 所有失败提醒共用同一个 Issue，永不关闭 */
const ISSUE_TITLE = "RSS source 连续运行失败";

interface ParsedArgs {
  values: {
    source?: string;
    status?: string;
    "run-url"?: string;
    failures?: string;
    "dry-run"?: boolean;
  };
}

async function gh(args: string[]): Promise<string> {
  const proc = Bun.spawn(["gh", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const code = await proc.exited;

  if (code !== 0) {
    throw new Error(`gh ${args.join(" ")} 失败 (exit ${code}): ${stderr}`);
  }
  return output;
}

/** 按固定标题查找已存在的失败通知 Issue */
async function findIssue(): Promise<number | undefined> {
  const output = await gh([
    "issue",
    "list",
    "--state",
    "open",
    "--json",
    "number,title",
    "--limit",
    "200",
  ]);
  const issues: { number: number; title: string }[] = JSON.parse(output);

  return issues.find((issue) => issue.title === ISSUE_TITLE)?.number;
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      source: { type: "string" },
      status: { type: "string" },
      "run-url": { type: "string" },
      failures: { type: "string", default: "failures.json" },
      "dry-run": { type: "boolean", default: false },
    },
  }) as ParsedArgs;

  const source = values.source;
  const status = values.status;
  if (!source || (status !== "success" && status !== "failure")) {
    console.error(
      "用法: bun bin/notify.ts --source <name> --status <success|failure> [--run-url <url>] [--failures <path>] [--dry-run]",
    );
    process.exit(1);
  }

  const runUrl = values["run-url"];
  const failuresPath = values.failures || "failures.json";
  const isDryRun = values["dry-run"] ?? false;

  const file = Bun.file(failuresPath);
  const prevCount: number = (await file.exists()) ? await file.json() : 0;

  const { count, notification } = updateFailureCount(
    prevCount,
    source,
    status,
    runUrl,
  );

  console.log(`[notify] ${source}: ${status}（连续失败 ${count} 次）`);

  if (!isDryRun) {
    await Bun.write(failuresPath, `${JSON.stringify(count)}\n`);
  }

  if (!notification) {
    console.log("[notify] 未达到连续失败阈值");
    return;
  }

  if (isDryRun) {
    console.log(
      `[notify] [dry-run] 将创建 Issue「${ISSUE_TITLE}」或评论已有 Issue：\n${notification.message}`,
    );
    return;
  }

  const issueNumber = await findIssue();
  if (issueNumber !== undefined) {
    await gh([
      "issue",
      "comment",
      String(issueNumber),
      "--body",
      notification.message,
    ]);
    console.log(`[notify] 已评论 Issue #${issueNumber}`);
  } else {
    await gh([
      "issue",
      "create",
      "--title",
      ISSUE_TITLE,
      "--body",
      notification.message,
    ]);
    console.log(`[notify] 已创建 Issue「${ISSUE_TITLE}」`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
