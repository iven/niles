#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import time
from pathlib import Path


def main():
    # 源名称（可通过参数指定，默认 cnbeta）
    source_name = sys.argv[1] if len(sys.argv) > 1 else "cnbeta"

    # 读取配置文件
    config_file = Path("worker/config.json")
    if not config_file.exists():
        print(f"错误: 找不到配置文件 {config_file}")
        sys.exit(1)

    with open(config_file) as f:
        config = json.load(f)

    # 查找源配置
    source_config = None
    for source in config["sources"]:
        if source["name"] == source_name:
            source_config = source
            break

    if not source_config:
        print(f"错误: 在 config.yml 中找不到源 '{source_name}'")
        sys.exit(1)

    source_url = source_config["url"]

    # 准备环境变量
    env = os.environ.copy()
    env["SOURCE_NAME"] = source_name
    env["SOURCE_URL"] = source_url

    # 全局兴趣配置
    env["GLOBAL_HIGH_INTEREST"] = config["global"].get("high_interest", "")
    env["GLOBAL_INTEREST"] = config["global"].get("interest", "")
    env["GLOBAL_UNINTERESTED"] = config["global"].get("uninterested", "")
    env["GLOBAL_EXCLUDE"] = config["global"].get("exclude", "")

    # 源特定配置
    env["SOURCE_HIGH_INTEREST"] = source_config.get("high_interest", "")
    env["SOURCE_INTEREST"] = source_config.get("interest", "")
    env["SOURCE_UNINTERESTED"] = source_config.get("uninterested", "")
    env["SOURCE_EXCLUDE"] = source_config.get("exclude", "")

    # 新增配置
    env["PREFERRED_LANGUAGE"] = config["global"].get("preferred_language", "zh")
    env["FETCH_CONTENT"] = str(source_config.get("fetch_content", False)).lower()
    env["TRANSLATE"] = str(source_config.get("translate", False)).lower()

    # 创建临时目录
    temp_dir = Path(f"/tmp/niles-rss/{source_name}")
    temp_dir.mkdir(parents=True, exist_ok=True)

    new_items_json = temp_dir / "new-items.json"
    filter_results_json = temp_dir / "filter-results.json"

    env["NEW_ITEMS_JSON"] = str(new_items_json)
    env["FILTER_RESULTS_JSON"] = str(filter_results_json)

    print(f"正在测试源: {source_name}")
    print(f"URL: {source_url}")
    print()

    # 检查是否已有提取的条目文件
    if new_items_json.exists():
        print(f"发现已存在的条目文件: {new_items_json}")
        skip = input("是否跳过第一步？(y/N): ").strip().lower()
        if skip == "y":
            with open(new_items_json) as f:
                data = json.load(f)
                new_count = data["new_items"]
            print(f"跳过提取，使用现有条目数: {new_count}")
        else:
            new_count = None
    else:
        new_count = None

    if new_count is None:
        print("=== 第一步：提取新条目 ===")
        start_time = time.time()

        # 提取新条目
        extract_cmd = [
            "uv",
            "run",
            "scripts/extract-new-items.py",
            source_url,
            f"output/{source_name}.xml",
            "--output",
            str(new_items_json),
        ]
        if source_config.get("fetch_content", False):
            extract_cmd.append("--fetch-content")

        result = subprocess.run(extract_cmd, env=env)

        if result.returncode != 0:
            print("提取新条目失败")
            sys.exit(1)

        # 检查新条目数
        with open(new_items_json) as f:
            data = json.load(f)
            new_count = data["new_items"]

        elapsed = time.time() - start_time
        print(f"新条目数: {new_count}")
        print(f"耗时: {elapsed:.2f} 秒")

    if new_count == 0:
        print("没有新条目，跳过 Claude 分析")
        sys.exit(0)

    # 删除旧的筛选结果文件
    if filter_results_json.exists():
        filter_results_json.unlink()

    # 等待按键
    print()
    input("按 Enter 键继续...")
    print("=== 第二步：使用 Claude 进行筛选 ===")
    start_time = time.time()

    # 读取 prompt
    with open("rss-prompt.md") as f:
        prompt = f.read()

    # 调用 Claude
    json_schema = '{"type":"object","properties":{"source_name":{"type":"string"},"source_url":{"type":"string"},"results":{"type":"object","additionalProperties":{"type":"object","properties":{"title":{"type":"string"},"description":{"type":"string"},"type":{"type":"string","enum":["high_interest","interest","other","excluded"]},"reason":{"type":"string"}},"required":["title","type","reason"]}}},"required":["source_name","source_url","results"]}'

    result = subprocess.run(
        [
            "claude",
            prompt,
            "--allowedTools",
            "WebFetch,Bash,Read,Write,Edit,Grep,Glob",
            "--json-schema",
            json_schema,
        ],
        env=env,
    )

    if result.returncode != 0:
        print("Claude 分析失败")
        sys.exit(1)

    elapsed = time.time() - start_time
    print(f"耗时: {elapsed:.2f} 秒")

    # 等待按键
    print()
    input("按 Enter 键继续...")
    print("=== 第三步：生成 RSS ===")
    start_time = time.time()

    # 生成 RSS
    result = subprocess.run(
        [
            "uv",
            "run",
            "scripts/generate-rss.py",
            str(new_items_json),
            str(filter_results_json),
            f"output/{source_name}.xml",
        ],
        env=env,
    )

    if result.returncode != 0:
        print("生成 RSS 失败")
        sys.exit(1)

    elapsed = time.time() - start_time
    print(f"耗时: {elapsed:.2f} 秒")
    print()
    print("测试完成！")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print()
        print("已中断")
        sys.exit(130)
