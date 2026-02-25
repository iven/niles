/**
 * 统一的日志模块
 */

import { createConsola } from "consola";

const consola = createConsola({
  formatOptions: {
    columns: 1, // 设置较小的 columns 值,使日期显示在左侧而不是右侧对齐
  },
});

// 执行测试时静默日志
if (process.env.NODE_ENV === "test") {
  consola.level = -999;
}

export const logger = consola;
