"""Hacker News 评论抓取插件"""

import sys
import re
import httpx


def process_item(item):
    """抓取 HN 评论

    Args:
        item: RSS 条目,包含 guid 字段

    Returns:
        增强后的 item,comments 写入 item['extra']['comments']
    """
    url = item.get('guid', '')

    # 判断是否是 HN 链接
    if 'news.ycombinator.com' not in url:
        return item

    # 初始化 extra 字典
    if 'extra' not in item:
        item['extra'] = {}

    # 提取 HN item id
    match = re.search(r'id=(\d+)', url)
    if not match:
        return item

    item_id = match.group(1)

    try:
        # 调用 HN API
        api_url = f"https://hn.algolia.com/api/v1/items/{item_id}"
        with httpx.Client(timeout=10) as client:
            response = client.get(api_url)
            response.raise_for_status()
            data = response.json()

        # 提取评论:顶级 10 条,其他层级 2 条,最深 2 层
        comments = extract_comments(data.get('children', []), depth=0, max_depth=2)
        item['extra']['comments'] = comments

    except Exception as e:
        print(f"抓取 HN 评论失败 {item_id}: {e}", file=sys.stderr)
        item['extra']['comments'] = []

    return item


def extract_comments(children, depth=0, max_depth=2):
    """递归提取评论

    策略:
    - 顶级评论(depth=0):最多 10 条
    - 其他层级:每层最多 2 条

    Args:
        children: 评论树
        depth: 当前深度
        max_depth: 最大深度

    Returns:
        评论列表(扁平化)
    """
    comments = []

    # 确定当前层级的限制
    limit = 10 if depth == 0 else 2

    for i, child in enumerate(children):
        if i >= limit:
            break

        text = child.get('text', '').strip()
        if text:
            comments.append({
                'author': child.get('author', ''),
                'text': text,
                'points': child.get('points', 0),
                'depth': depth
            })

        # 递归提取子评论
        if depth < max_depth and 'children' in child:
            sub_comments = extract_comments(
                child['children'],
                depth + 1,
                max_depth
            )
            comments.extend(sub_comments)

    return comments
