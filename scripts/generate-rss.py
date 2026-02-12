#!/usr/bin/env -S uv run --script
# /// script
# dependencies = []
# ///
"""
RSS 生成脚本

输入：JSON 文件，包含筛选后的条目
输出：RSS XML 文件
"""

import argparse
import json
import re
from datetime import datetime, timezone
from email.utils import format_datetime
from html import escape
from pathlib import Path


def escape_xml(text):
    """转义 XML 特殊字符"""
    if not text:
        return ""
    return escape(text)


def parse_existing_rss(rss_path):
    """解析现有 RSS，提取所有 item"""
    if not rss_path.exists():
        return []

    content = rss_path.read_text(encoding="utf-8")
    items = re.findall(r"<item>(.*?)</item>", content, re.DOTALL)
    return items


def generate_rss_item(item):
    """生成单个 RSS item XML"""
    title = item["title"]
    # 根据兴趣级别添加星星标记
    if item.get("type") == "high_interest":
        title = f"⭐⭐ {title}"
    elif item.get("type") == "interest":
        title = f"⭐ {title}"
    title = escape_xml(title)
    link = escape_xml(item["link"])
    pub_date = item["pubDate"]
    guid = escape_xml(item.get("guid", item["link"]))
    description = item.get("description", "")
    description = f"{description}<p><small>[{item.get('type', 'unknown')}] {item['reason']}</small></p>"

    return f"""    <item>
      <title>{title}</title>
      <link>{link}</link>
      <pubDate>{pub_date}</pubDate>
      <guid>{guid}</guid>
      <description><![CDATA[{description}]]></description>
    </item>"""


def generate_rss(data, existing_rss_path):
    """生成完整 RSS"""
    source_name = data["source_name"]
    source_url = data["source_url"]
    items = data["items"]

    # 只取非 excluded 的条目
    matched_items = [item for item in items if item.get("type") in ["high_interest", "interest", "other"]]

    # 生成新条目 XML
    new_items_xml = "\n".join(generate_rss_item(item) for item in matched_items)

    # 读取现有条目
    existing_items = parse_existing_rss(existing_rss_path)

    # 合并新旧条目
    all_items_xml = new_items_xml
    if existing_items:
        all_items_xml += "\n" + "\n".join(
            f"    <item>{item}</item>" for item in existing_items
        )

    # 只保留最近 50 条
    all_items_list = [item for item in all_items_xml.split("<item>") if item.strip()]
    limited_items = "\n".join(f"<item>{item}" for item in all_items_list[:50])

    # 生成完整 RSS (使用 RFC 2822 格式)
    now = format_datetime(datetime.now(timezone.utc))

    rss = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>{escape_xml(source_name)} - 精选</title>
    <link>{escape_xml(source_url)}</link>
    <description>基于个人兴趣筛选的 {escape_xml(source_name)} 内容</description>
    <lastBuildDate>{now}</lastBuildDate>

{limited_items}
  </channel>
</rss>"""

    return rss, len(matched_items)


def main():
    parser = argparse.ArgumentParser(description="生成 RSS XML 文件")
    parser.add_argument("items", type=str, help="完整条目 JSON 文件路径")
    parser.add_argument("results", type=str, help="筛选结果 JSON 文件路径")
    parser.add_argument("output", type=str, help="输出 XML 文件路径")

    args = parser.parse_args()

    items_path = Path(args.items)
    results_path = Path(args.results)
    output_path = Path(args.output)

    # 读取完整条目
    with open(items_path, "r", encoding="utf-8") as f:
        items_data = json.load(f)

    # 读取筛选结果
    with open(results_path, "r", encoding="utf-8") as f:
        results_data = json.load(f)

    # 合并数据
    merged_items = []
    for item in items_data["items"]:
        guid = item["guid"]
        result = results_data["results"].get(
            guid, {"type": "excluded", "title": "", "reason": "未找到筛选结果"}
        )
        # 优先使用翻译后的 title 和 description
        title = result.get("title", item["title"])
        description = result.get("description", item.get("description", ""))
        merged_items.append(
            {
                **item,
                "title": title,
                "description": description,
                "type": result["type"],
                "reason": result["reason"],
            }
        )

    data = {
        "source_name": results_data["source_name"],
        "source_url": results_data["source_url"],
        "items": merged_items,
    }

    # 生成 RSS
    rss, new_count = generate_rss(data, output_path)

    # 写入输出文件
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(rss)

    print(f"RSS 生成成功: {output_path}")
    print(f"- 源名称: {data['source_name']}")
    print(f"- 新增条目: {new_count}")


if __name__ == "__main__":
    main()
