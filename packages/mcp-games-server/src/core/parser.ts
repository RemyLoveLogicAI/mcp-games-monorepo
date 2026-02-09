import fs from 'node:fs/promises';
import yaml from 'yaml';
import { GameDefinitionSchema } from './schema.js';
import { GameDefinition } from '@omnigents/shared';
import { telemetry } from '../observability/index.js';

export class GameParser {
    async parse(filePath: string): Promise<GameDefinition> {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const parsed = yaml.parse(content);

            const game = GameDefinitionSchema.parse(parsed) as unknown as GameDefinition;

            telemetry.emit('game:parsed', {
                gameId: game.id,
                title: game.title,
                sceneCount: Object.keys(game.scenes).length
            });

            return game;
        } catch (error) {
            telemetry.emit('game:parse_error', {
                file: filePath,
                error: error instanceof Error ? error.message : String(error)
            }, 'ERROR');
            throw error;
        }
    }
}

export const gameParser = new GameParser();
