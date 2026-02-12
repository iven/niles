#!/bin/bash
set -e

source "$(dirname "$0")/lib/common.sh"

init_paths
parse_mode "$1"

# 测试 hacker-news 完整流程
echo "=== 测试 hacker-news personalize-rss ($([ -z "$MODE" ] && echo "interactive" || echo "print") mode) ==="
setup_test_env "$PROJECT_DIR/tests/fixtures/hacker-news-items.json" "$PROJECT_DIR/tests/output/hacker-news"

extract_personalize_config "hacker-news"

echo "配置:$(echo "$CONFIG" | jq -c)"
echo ""

echo "/personalize-rss" | claude --allowedTools Task,Read,Bash,Write $MODE
