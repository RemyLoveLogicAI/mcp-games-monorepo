import { HitlManager } from '../hitl-manager.js';
import { CreateHitlParams } from '@omnigents/shared';

describe('HitlManager', () => {
    let manager: HitlManager;

    beforeEach(() => {
        manager = new HitlManager();
    });

    afterEach(() => {
        manager.stop();
    });

    it('should initialize empty', () => {
        expect(manager.getPendingCount()).toBe(0);
    });

    it('should create a HITL request and store it', async () => {
        const params: CreateHitlParams = {
            priority: 'HIGH',
            situation: 'Test failure',
            aiAnalysis: 'Needs human intervention',
            options: [
                { id: 1, label: 'Retry', description: 'Retry action', action: 'RETRY' }
            ]
        };

        const request = await manager.createRequest(params);

        expect(manager.getPendingCount()).toBe(1);
        expect(request.priority).toBe('HIGH');
        expect(request.situation).toBe('Test failure');
    });

    it('should respond to a pending request and remove it', async () => {
        const params: CreateHitlParams = {
            priority: 'MEDIUM',
            situation: 'Timeout',
            aiAnalysis: 'Service timed out',
            options: [
                { id: 1, label: 'Restart', description: 'Restart service', action: 'RESTART' }
            ]
        };

        const request = await manager.createRequest(params);

        expect(manager.getPendingCount()).toBe(1);

        const handledRequest = manager.respond(request.id, 1, 'human-admin');

        expect(handledRequest).toBeTruthy();
        expect(handledRequest?.selectedOption).toBe(1);
        expect(handledRequest?.respondedBy).toBe('human-admin');
        expect(manager.getPendingCount()).toBe(0);
    });
});
