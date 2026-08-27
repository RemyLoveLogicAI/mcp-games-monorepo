import type { HarnessDB } from "./schemas/HarnessDB";
import { TickDispatcher, type TickResult } from "./dispatcher/TickDispatcher";

/**
 * WorkerLoop — runs the tick dispatcher on a fixed interval.
 *
 * Default: 1000ms tick interval. Stops cleanly on SIGTERM/SIGINT.
 * Emits tick results to an optional callback for observability.
 */

export interface WorkerLoopOptions {
  intervalMs?: number;
  onTick?: (result: TickResult) => void;
  onError?: (err: Error) => void;
  signal?: AbortSignal;
}

export class WorkerLoop {
  private dispatcher: TickDispatcher;
  private intervalMs: number;
  private onTick?: (result: TickResult) => void;
  private onError?: (err: Error) => void;
  private running: boolean = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private abortSignal?: AbortSignal;

  constructor(dispatcher: TickDispatcher, options: WorkerLoopOptions = {}) {
    this.dispatcher = dispatcher;
    this.intervalMs = options.intervalMs ?? 1000;
    this.onTick = options.onTick;
    this.onError = options.onError;
    this.abortSignal = options.signal;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    const tickFn = async () => {
      if (!this.running) return;
      try {
        const result = await this.dispatcher.tick("worker-loop");
        this.onTick?.(result);
      } catch (err) {
        this.onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    };

    // Run immediately then on interval
    await tickFn();
    this.timer = setInterval(tickFn, this.intervalMs);

    // Handle abort signal
    if (this.abortSignal) {
      this.abortSignal.addEventListener("abort", () => this.stop());
    }
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  getTickCount(): number {
    return this.dispatcher.getTickCount();
  }
}
