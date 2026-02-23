import { SemanticQueryBuilder } from '../index.js';

describe('SemanticQueryBuilder', () => {
    it('should build a valid query', () => {
        const builder = new SemanticQueryBuilder();
        const query = builder.server('server-1').query('test').build();
        expect(query.server).toBe('server-1');
        expect(query.query).toBe('test');
    });
});
