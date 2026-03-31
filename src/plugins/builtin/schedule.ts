import { Cron } from "croner";
import { basePlugin, type Plugin, type PluginContext } from "../../plugin";

interface ScheduleOptions {
  cron: string;
  timezone?: string;
}

const plugin: Plugin<ScheduleOptions> = {
  ...basePlugin,
  async beforeRun(
    options: ScheduleOptions,
    context: PluginContext,
  ): Promise<boolean> {
    if (context.isDryRun) return true;

    const { cron, timezone = "Asia/Shanghai" } = options;
    const { now } = context;
    const job = new Cron(cron, { timezone });
    const prevTriggers = job.previousRuns(1, now);

    if (prevTriggers.length === 0) {
      context.logger.info("schedule: 尚无历史触发点，跳过");
      return false;
    }

    const lastTrigger = prevTriggers[0] as Date;

    const trackerFile = Bun.file(`output/${context.sourceName}-processed.json`);
    const lastRun = (await trackerFile.exists())
      ? new Date((await trackerFile.json()).updated_at)
      : new Date(0);

    if (lastRun >= lastTrigger) {
      context.logger.info(
        `schedule: 本触发窗口已执行过（${lastTrigger.toISOString()}），跳过`,
      );
      return false;
    }

    return true;
  },
};

export default plugin;
