#!/usr/bin/env python3
"""
从 RSS feed 中提取新条目（去重）

输入：RSS feed URL 和已有 RSS 文件路径
输出：JSON 格式的新条目列表
"""

import argparse
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from pathlib import Path


def parse_existing_rss(rss_path):
    """解析现有 RSS，提取 lastBuildDate"""
    if not rss_path.exists():
        return None

    content = rss_path.read_text(encoding="utf-8")

    # 提取 lastBuildDate
    match = re.search(r"<lastBuildDate>([^<]+)</lastBuildDate>", content)
    if not match:
        return None

    # 解析时间
    try:
        return parsedate_to_datetime(match.group(1))
    except:
        return None


def fetch_rss(url):
    """获取 RSS feed"""
    req = urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0 (compatible; RSS Reader/1.0)"}
    )
    with urllib.request.urlopen(req) as response:
        return response.read()


def parse_rss_items(rss_content):
    """解析 RSS 内容，提取条目"""
    root = ET.fromstring(rss_content)

    # 查找所有 item
    items = []
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

        # 解析时间用于过滤
        parsed_date = None
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

    return items


def main():
    parser = argparse.ArgumentParser(description="从 RSS feed 中提取新条目")
    parser.add_argument("url", type=str, help="RSS feed URL")
    parser.add_argument("existing_rss", type=str, help="已有 RSS 文件路径")
    parser.add_argument("--top", type=int, default=50, help="最多提取前 N 条")
    parser.add_argument(
        "--output", type=str, help="输出 JSON 文件路径（不指定则输出到 stdout）"
    )

    args = parser.parse_args()

    existing_rss_path = Path(args.existing_rss)

    # 读取已有 RSS 的 lastBuildDate
    last_build_date = parse_existing_rss(existing_rss_path)

    # 获取 RSS feed
    rss_content = fetch_rss(args.url)

    # 解析条目
    all_items = parse_rss_items(rss_content)

    # 只保留前 N 条
    all_items = all_items[: args.top]

    # 过滤条目：只保留 pubDate > lastBuildDate 的条目
    new_items = []
    for item in all_items:
        # 如果有 lastBuildDate，只保留比它更新的条目
        if last_build_date and item["_parsed_date"]:
            if item["_parsed_date"] <= last_build_date:
                continue
        # 移除内部字段
        new_item = {k: v for k, v in item.items() if not k.startswith("_")}
        new_items.append(new_item)

    # 输出结果
    result = {
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
