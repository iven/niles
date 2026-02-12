#!/bin/bash

# 公共测试库

# 初始化路径
init_paths() {
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[1]}")" && pwd)"
  PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
}

# 处理 MODE 参数
parse_mode() {
  MODE="--print"
  if [[ "$1" == "--interactive" ]] || [[ "$1" == "-i" ]]; then
    MODE=""
  fi
}

# 设置测试环境
setup_test_env() {
  local items_json="$1"
  local output_dir="$2"
  export ITEMS_JSON="$items_json"
  export OUTPUT_DIR="$output_dir"
  rm -rf "$OUTPUT_DIR"
  mkdir -p "$OUTPUT_DIR"
}

# 提取 filter 配置
extract_filter_config() {
  local source_name="$1"
  local config_file="$PROJECT_DIR/worker/config.json"

  local config=$(jq ".sources[] | select(.name == \"$source_name\")" "$config_file")
  local global=$(jq '.global' "$config_file")

  SOURCE_NAME=$(echo "$config" | jq -r '.name')
  SOURCE_URL=$(echo "$config" | jq -r '.url')
  HIGH_INTEREST=$(echo "$global $config" | jq -s '.[1].high_interest // .[0].high_interest' -r)
  INTEREST=$(echo "$global $config" | jq -s '.[1].interest // .[0].interest' -r)
  UNINTERESTED=$(echo "$global $config" | jq -s '.[1].uninterested // .[0].uninterested' -r)
  EXCLUDE=$(echo "$global $config" | jq -s '.[1].exclude // .[0].exclude' -r)
}

# 提取并合并 personalize 配置
extract_personalize_config() {
  local source_name="$1"
  local config_file="$PROJECT_DIR/worker/config.json"

  local config_source=$(jq ".sources[] | select(.name == \"$source_name\")" "$config_file")
  local global_config=$(jq '.global' "$config_file")

  export CONFIG=$(echo "$global_config $config_source" | jq -s '
    .[0] as $global |
    .[1] as $source |
    $global + $source + {
      source_name: $source.name,
      source_url: $source.url
    } |
    del(.name, .url, .cron, .plugins, .timeout)
  ')
}

# 提取 preferred_language
extract_preferred_language() {
  local config_file="$PROJECT_DIR/worker/config.json"
  PREFERRED_LANGUAGE=$(jq -r '.global.preferred_language' "$config_file")
}
