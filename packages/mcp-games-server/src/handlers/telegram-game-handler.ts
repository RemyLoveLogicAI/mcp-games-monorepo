import { Context } from "telegraf";
import { GameEngine } from "../core/game-engine.js";
import { StateManager } from "../core/state-manager.js";
import { telemetry } from "../observability/index.js";
import { v4 as uuidv4 } from "uuid";

export class TelegramGameHandler {
  constructor(private stateManager: StateManager, private gameEngine: GameEngine) { }

  async handleStart(ctx: any): Promise<void> {
    const traceId = uuidv4();
    try {
      const userId = ctx.from?.id.toString();
      if (!userId) throw new Error("User ID not found");
      const session = await this.stateManager.createSession("default", userId, traceId);
      ctx.session = ctx.session || {};
      ctx.session.sessionId = session.id;
      await ctx.reply("Game started! Type /continue to play.");
      telemetry.emit("telegram:game:started", { userId, traceId });
    } catch (error) {
      await ctx.reply("Error starting game");
    }
  }

  async handleContinue(ctx: any): Promise<void> {
    const traceId = uuidv4();
    const sessionId = ctx.session?.sessionId;
    if (!sessionId) {
      await ctx.reply("No active session. Use /start");
      return;
    }
    const session = await this.stateManager.getSession(sessionId, traceId);
    if (session && !session.completedAt) {
      await ctx.reply("Continuing game...");
    } else {
      await ctx.reply("No active game.");
    }
  }
}
