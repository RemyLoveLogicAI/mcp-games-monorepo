"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusAggregator = void 0;
var shared_1 = require("@omnigents/shared");
var StatusAggregator = /** @class */ (function () {
    function StatusAggregator(redisUrl) {
        this.services = new Map();
        this.bus = new shared_1.TelemetryBus(redisUrl);
    }
    StatusAggregator.prototype.start = function () {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: 
                    // Subscribe to telemetry stream
                    // In a real CLI, we might use a dedicated consumer group or just listen as a simple subscriber
                    // For CLI "snapshot", we might query latest state from a persistent store, 
                    // but for "watch" mode, we subscribe.
                    // For Sprint 2, let's implement a listener that updates local state.
                    return [4 /*yield*/, this.bus.subscribe('tier0:telemetry', function (event) {
                            _this.processEvent(event);
                        })];
                    case 1:
                        // Subscribe to telemetry stream
                        // In a real CLI, we might use a dedicated consumer group or just listen as a simple subscriber
                        // For CLI "snapshot", we might query latest state from a persistent store, 
                        // but for "watch" mode, we subscribe.
                        // For Sprint 2, let's implement a listener that updates local state.
                        _a.sent();
                        return [4 /*yield*/, this.bus.subscribe('tier0:health', function (event) {
                                _this.processEvent(event);
                            })];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    StatusAggregator.prototype.processEvent = function (event) {
        // Infer service name from event data or metadata if available
        // Currently TelemetryEvent structure is generic. 
        // We might need to enforce a 'service' field in the data payload or look at the event type.
        // Let's assume the payload has 'service' field for now, as seen in Tier 1 emitter.
        var data = event.data;
        var serviceName = data.service || 'unknown-service';
        var state = this.services.get(serviceName);
        if (!state) {
            state = {
                name: serviceName,
                status: 'OK',
                uptime: '0s', // Todo: calculate
                lastCheck: new Date().toISOString(),
                metrics: {
                    errorRate: 0,
                    throughput: 0
                },
                activeIssues: []
            };
            this.services.set(serviceName, state);
        }
        state.lastCheck = new Date(event.timestamp).toISOString();
        // Simple heuristic for status
        if (event.stream === 'tier0:telemetry') {
            var eventName = data.event || '';
            state.metrics.throughput = (state.metrics.throughput || 0) + 1;
            if (eventName === 'error' || eventName.includes('error') || (data.level && data.level === 'ERROR')) {
                state.metrics.errorRate = (state.metrics.errorRate || 0) + 1;
                state.status = 'DEGRADED';
                var issue = typeof data.error === 'string' ? data.error : JSON.stringify(data.error) || 'Unknown error';
                if (!state.activeIssues.includes(issue)) {
                    state.activeIssues.push(issue);
                    // Keep only last 5 issues
                    if (state.activeIssues.length > 5)
                        state.activeIssues.shift();
                }
            }
        }
    };
    StatusAggregator.prototype.getSystemStatus = function () {
        var services = Array.from(this.services.values());
        // Check for stale heartbeats (30s timeout)
        var now = Date.now();
        services.forEach(function (s) {
            var last = new Date(s.lastCheck).getTime();
            if (now - last > 30000) {
                s.status = 'CRITICAL';
                if (!s.activeIssues.includes('Offline / No Heartbeat')) {
                    s.activeIssues.push('Offline / No Heartbeat');
                }
            }
        });
        // Determine overall health
        var overallHealth = 'HEALTHY';
        if (services.some(function (s) { return s.status === 'CRITICAL'; }))
            overallHealth = 'CRITICAL';
        else if (services.some(function (s) { return s.status === 'DEGRADED'; }))
            overallHealth = 'DEGRADED';
        return {
            timestamp: new Date().toISOString(),
            overallHealth: overallHealth,
            services: services,
            watchdogStatus: {
                activeRecoveries: 0,
                successRate24h: 100,
                lastAction: null,
                lastActionTime: null
            },
            hitlQueue: {
                pending: 0,
                oldest: null
            },
            keyMetrics: {
                requestsPerMinute: services.reduce(function (acc, s) { return acc + (s.metrics.throughput || 0); }, 0), // Rough approx
                errorRate: services.reduce(function (acc, s) { return acc + (s.metrics.errorRate || 0); }, 0),
                p99Latency: 0,
                activeUsers: 0
            }
        };
    };
    return StatusAggregator;
}());
exports.StatusAggregator = StatusAggregator;
