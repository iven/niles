#!/usr/bin/env -S uv run --script
# /// script
# dependencies = ["httpx", "beautifulsoup4"]
# ///
"""
从 RSS feed 中提取新条目（去重）

输入：RSS feed URL 和已有 RSS 文件路径
输出：JSON 格式的新条目列表
"""

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any

import httpx

from guid_tracker import GuidTracker


def fetch_rss(url: str) -> bytes:
    """获取 RSS feed"""
    with httpx.Client(timeout=10) as client:
        response = client.get(
            url, headers={"User-Agent": "Mozilla/5.0 (compatible; RSS Reader/1.0)"}
        )
        response.raise_for_status()
        return response.content


def apply_plugins(
    items: list[dict[str, Any]], plugin_names: list[str], max_workers: int = 10
) -> list[dict[str, Any]]:
    """应用插件

    Args:
        items: 条目列表
        plugin_names: 插件名称列表
        max_workers: 最大并发数

    Returns:
        增强后的条目列表
    """
    if not plugin_names:
        return items

    # 动态导入 plugins 模块
    plugins_dir = Path(__file__).parent / "plugins"
    sys.path.insert(0, str(plugins_dir.parent))

    from plugins import load_plugin

    for plugin_name in plugin_names:
        try:
            plugin = load_plugin(plugin_name)
            if hasattr(plugin, "process_item"):
                print(f"应用插件: {plugin_name}", file=sys.stderr)
                # 并行处理所有 items
                with ThreadPoolExecutor(max_workers=max_workers) as executor:
                    # 提交所有任务
                    future_to_idx = {
                        executor.submit(plugin.process_item, item): idx
                        for idx, item in enumerate(items)
                    }
                    # 收集结果(保持原始顺序)
                    results: list[dict[str, Any] | None] = [None] * len(items)
                    for future in as_completed(future_to_idx):
                        idx = future_to_idx[future]
                        try:
                            results[idx] = future.result()
                        except Exception as e:
                            print(f"处理 item {idx} 失败: {e}", file=sys.stderr)
                            results[idx] = items[idx]  # 失败时保留原始 item
                    items = [item for item in results if item is not None]
        except Exception as e:
            print(f"插件 {plugin_name} 执行失败: {e}", file=sys.stderr)

    return items


def parse_rss_items(rss_content: bytes) -> tuple[str | None, list[dict[str, Any]]]:
    """解析 RSS 内容，提取条目和频道标题"""
    root = ET.fromstring(rss_content)

    # 提取频道标题
    channel_title = None
    channel = root.find(".//channel/title")
    if channel is not None and channel.text:
        channel_title = channel.text.strip()

    # 查找所有 item
    items: list[dict[str, Any]] = []
    for item in root.findall(".//item"):
        title_elem = item.find("title")
        link_elem = item.find("link")
        pub_date_elem = item.find("pubDate")
        description_elem = item.find("description")
        guid_elem = item.find("guid")

        title = (title_elem.text or "").strip("\u200b ")
        link = link_elem.text if link_elem is not None else ""
        pub_date = pub_date_elem.text if pub_date_elem is not None else ""
        description = (description_elem.text or "").strip("\u200b ")
        guid = guid_elem.text if guid_elem is not None else link

        # 解析时间用于清理
        parsed_date: datetime | None = None
        if pub_date:
            try:
                parsed_date = parsedate_to_datetime(pub_date)
            except:
                pass

        items.append(
            {
                "title": title,
                "link": link,
                "pubDate": pub_date,
                "description": description,
                "guid": guid,
                "_parsed_date": parsed_date,
            }
        )

    return channel_title, items


def main() -> None:
    parser = argparse.ArgumentParser(description="从 RSS feed 中提取新条目")
    parser.add_argument("url", type=str, help="RSS feed URL")
    parser.add_argument("existing_rss", type=str, help="已有 RSS 文件路径")
    parser.add_argument("--source-name", type=str, required=True, help="源名称")
    parser.add_argument("--max-items", type=int, default=20, help="最多提取前 N 条")
    parser.add_argument("--min-items", type=int, default=0, help="最少提取 N 条（即使非新条目）")
    parser.add_argument(
        "--output", type=str, help="输出 JSON 文件路径（不指定则输出到 stdout）"
    )
    parser.add_argument("--plugins", type=str, help="逗号分隔的插件列表")

    args = parser.parse_args()

    existing_rss_path = Path(args.existing_rss)

    # 初始化 GUID 跟踪器
    history_path = existing_rss_path.parent / f"{args.source_name}-processed.json"
    tracker = GuidTracker(history_path)

    # 获取 RSS feed
    rss_content = fetch_rss(args.url)

    # 解析条目和频道标题
    channel_title, all_items = parse_rss_items(rss_content)

    # 只保留前 N 条
    all_items = all_items[: args.max_items]

    # 过滤条目：只保留未处理过的条目
    new_items: list[dict[str, Any]] = []
    for item in all_items:
        if not tracker.is_processed(item["guid"]):
            # 移除内部字段
            new_item = {k: v for k, v in item.items() if not k.startswith("_")}
            new_items.append(new_item)

    # 如果新条目数量少于最小要求，从所有条目中补齐
    if len(new_items) < args.min_items:
        for item in all_items:
            if len(new_items) >= args.min_items:
                break
            # 检查是否已经在 new_items 中
            new_item = {k: v for k, v in item.items() if not k.startswith("_")}
            if new_item not in new_items:
                new_items.append(new_item)

    # 应用插件
    plugins = args.plugins.split(",") if args.plugins else []
    new_items = apply_plugins(new_items, plugins)

    # 标记已处理的 GUID
    new_guids = [item["guid"] for item in new_items]
    tracker.mark_processed(new_guids)

    # 清理旧的 GUID
    tracker.cleanup()

    # 保存更新后的 GUID 历史记录
    tracker.save()

    # 输出结果
    result = {
        "source_name": args.source_name,
        "source_url": args.url,
        "source_title": channel_title,
        "total_items": len(all_items),
        "existing_items": len(all_items) - len(new_items),
        "new_items": len(new_items),
        "items": new_items,
    }

    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"提取完成: {len(new_items)} 个新条目", file=sys.stderr)
    else:
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
