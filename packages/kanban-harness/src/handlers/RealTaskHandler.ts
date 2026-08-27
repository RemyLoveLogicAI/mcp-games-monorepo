import { exec } from "child_process";
import { promisify } from "util";
import type { KanbanTask } from "../schemas/Task";

const execAsync = promisify(exec);

/**
 * RealTaskHandler — production handler that executes tasks based on metadata.
 *
 * Supported task types (via task.metadata.type):
 *   - "shell"   → executes task.metadata.command as a shell command
 *   - "http"    → POSTs task.metadata.body to task.metadata.url
 *   - "log"     → falls back to LogTaskHandler behavior (default)
 *
 * All execution results are captured and logged.
 * Timeout: task.metadata.timeoutMs (default 30000)
 */

export interface RealTaskResult {
  taskId: string;
  title: string;
  type: string;
  durationMs: number;
  output: string;
  success: boolean;
  exitCode?: number;
}

export async function realTaskHandler(task: KanbanTask): Promise<void> {
  const type = (task.metadata.type as string) ?? "log";
  const timeoutMs = (task.metadata.timeoutMs as number) ?? 30_000;
  const start = Date.now();

  let output: string;
  let success: boolean;

  switch (type) {
    case "shell": {
      const command = task.metadata.command as string;
      if (!command) throw new Error(`Shell task ${task.id} missing metadata.command`);

      try {
        const { stdout, stderr } = await execAsync(command, {
          timeout: timeoutMs,
          maxBuffer: 1024 * 1024,
          cwd: (task.metadata.cwd as string) ?? process.cwd(),
          env: { ...process.env, ...(task.metadata.env as Record<string, string> | undefined) },
        });
        output = stdout + (stderr ? `\n[stderr]\n${stderr}` : "");
        success = true;
      } catch (err: any) {
        output = (err.stdout ?? "") + (err.stderr ?? "");
        success = false;
        throw new Error(`Shell command failed (exit ${err.code ?? 1}): ${err.message}\nOutput: ${output.slice(0, 500)}`);
      }
      break;
    }

    case "http": {
      const url = task.metadata.url as string;
      if (!url) throw new Error(`HTTP task ${task.id} missing metadata.url`);

      try {
        const response = await fetch(url, {
          method: (task.metadata.method as string) ?? "POST",
          headers: {
            "Content-Type": "application/json",
            ...(task.metadata.headers as Record<string, string> | undefined),
          },
          body: task.metadata.body ? JSON.stringify(task.metadata.body) : undefined,
          signal: AbortSignal.timeout(timeoutMs),
        });

        const responseText = await response.text();
        output = `[${response.status} ${response.statusText}] ${responseText.slice(0, 1000)}`;
        success = response.ok;

        if (!success) {
          throw new Error(`HTTP ${response.status}: ${responseText.slice(0, 500)}`);
        }
      } catch (err: any) {
        output = err.message;
        success = false;
        throw new Error(`HTTP request failed: ${err.message}`);
      }
      break;
    }

    case "log":
    default: {
      // Fallback: simulate work
      const estimate = (task.metadata.estimateMs as number) ?? 100;
      await new Promise((resolve) => setTimeout(resolve, estimate));
      output = `[executed] ${task.title} — ${Date.now() - start}ms — tags: ${task.tags.join(", ") || "none"}`;
      success = true;
      break;
    }
  }

  const duration = Date.now() - start;
  const result: RealTaskResult = {
    taskId: task.id,
    title: task.title,
    type,
    durationMs: duration,
    output: output.slice(0, 2000),
    success,
  };

  console.log(`[handler:${type}] ${task.title} — ${duration}ms — ${success ? "OK" : "FAIL"}`);
  if (output) {
    console.log(`[handler:${type}] output: ${output.slice(0, 200)}`);
  }

  if (task.metadata.failOnPurpose) {
    throw new Error(`Intentional failure for task ${task.id}`);
  }
}
