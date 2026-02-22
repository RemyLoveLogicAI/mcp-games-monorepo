import { ContextEngine } from '../context-engine.js';
import { Session } from '@omnigents/shared';

describe('ContextEngine', () => {
    let engine: ContextEngine;

    beforeEach(() => {
        engine = new ContextEngine();
    });

    it('should initialize empty', () => {
        expect(engine).toBeDefined();
    });

    it('should register a context source successfully', async () => {
        engine.registerSource({
            name: 'test-source',
            async fetch() {
                return { key: 'value' };
            }
        });

        const context = await engine.fetchContext('test-source', 'test-query', 'no-trace');
        expect(context?.result).toEqual({ key: 'value' });
    });
});
