// ═══════════════════════════════════════════════════════════════════════════
// TIER 3: NOTIFICATION SENDER
// Sends HITL notifications via console, Telegram, or webhook
// ═══════════════════════════════════════════════════════════════════════════

import { HitlRequest, HitlOption } from '@omnigents/shared';

export type NotificationChannel = 'console' | 'telegram' | 'webhook';

export interface NotificationConfig {
    channels: NotificationChannel[];
    telegramBotToken?: string;
    telegramChatId?: string;
    webhookUrl?: string;
}

/**
 * Sends HITL notifications to configured channels.
 * Sprint 1: Console output only.
 * Sprint 2+: Telegram push notifications and webhooks.
 */
export class NotificationSender {
    constructor(private config: NotificationConfig = { channels: ['console'] }) { }

    async send(request: HitlRequest): Promise<void> {
        for (const channel of this.config.channels) {
            try {
                switch (channel) {
                    case 'console':
                        this.sendConsole(request);
                        break;
                    case 'telegram':
                        await this.sendTelegram(request);
                        break;
                    case 'webhook':
                        await this.sendWebhook(request);
                        break;
                }
            } catch (err: any) {
                console.error(`[TIER3] Failed to send via ${channel}: ${err.message}`);
            }
        }
    }

    private sendConsole(request: HitlRequest): void {
        const priorityEmoji = {
            LOW: '🟡',
            MEDIUM: '🟠',
            HIGH: '🔴',
        };

        console.log('\n' + '═'.repeat(60));
        console.log(`${priorityEmoji[request.priority]} HUMAN DECISION REQUIRED ${priorityEmoji[request.priority]}`);
        console.log('═'.repeat(60));
        console.log(`Priority:    ${request.priority}`);
        console.log(`Situation:   ${request.situation}`);
        console.log(`AI Analysis: ${request.aiAnalysis}`);
        console.log(`Recommend:   ${request.aiRecommendation}`);
        console.log('─'.repeat(60));
        console.log('Options:');
        for (const option of request.options) {
            const isDefault = request.defaultOption === option.id;
            console.log(`  [${option.id}] ${option.label}${isDefault ? ' (DEFAULT)' : ''}`);
            console.log(`      ${option.description}`);
        }
        console.log('─'.repeat(60));
        console.log(`Expires: ${request.expiresAt}`);
        if (request.defaultOption !== undefined) {
            console.log(`Auto-select option ${request.defaultOption} on timeout.`);
        }
        console.log('═'.repeat(60) + '\n');
    }

    private async sendTelegram(request: HitlRequest): Promise<void> {
        // Stub for Sprint 2 — requires Telegram Bot API integration
        if (!this.config.telegramBotToken || !this.config.telegramChatId) {
            console.warn('[TIER3] Telegram not configured. Skipping.');
            return;
        }

        const message = this.formatTelegramMessage(request);
        // In Sprint 2: use telegraf or fetch to send message
        console.log(`[TIER3] Would send Telegram message (${message.length} chars)`);
    }

    private async sendWebhook(request: HitlRequest): Promise<void> {
        if (!this.config.webhookUrl) {
            console.warn('[TIER3] Webhook URL not configured. Skipping.');
            return;
        }

        // In Sprint 2: POST to webhook URL
        console.log(`[TIER3] Would POST to webhook: ${this.config.webhookUrl}`);
    }

    private formatTelegramMessage(request: HitlRequest): string {
        const options = request.options
            .map((o) => `${o.id}. ${o.label}`)
            .join('\n');

        return [
            `🚨 *HITL Request* (${request.priority})`,
            '',
            `*Situation:* ${request.situation}`,
            `*AI Analysis:* ${request.aiAnalysis}`,
            `*Recommendation:* ${request.aiRecommendation}`,
            '',
            '*Options:*',
            options,
        ].join('\n');
    }
}
