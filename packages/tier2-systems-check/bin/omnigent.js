#!/usr/bin/env node
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
var commander_1 = require("commander");
var chalk_1 = require("chalk");
var cli_table3_1 = require("cli-table3");
var aggregator_js_1 = require("../src/aggregator.js");
var ora_1 = require("ora");
var program = new commander_1.Command();
program
    .name('omnigent')
    .description('Unrestricted OmniAgents CLI')
    .version('0.1.0');
program
    .command('status')
    .description('Show system health status')
    .option('-w, --watch', 'Watch mode (live updates)', false)
    .action(function (options) { return __awaiter(void 0, void 0, void 0, function () {
    var aggregator, spinner, error_1, render, status_1, healthy, table_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                aggregator = new aggregator_js_1.StatusAggregator();
                spinner = (0, ora_1.default)('Connecting to Telemetry Bus...').start();
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, aggregator.start()];
            case 2:
                _a.sent();
                spinner.succeed('Connected');
                return [3 /*break*/, 4];
            case 3:
                error_1 = _a.sent();
                spinner.fail('Failed to connect to Redis/Telemetry Bus');
                console.error(error_1);
                process.exit(1);
                return [3 /*break*/, 4];
            case 4:
                if (!options.watch) return [3 /*break*/, 5];
                // Watch mode implementation
                console.clear();
                render = function () {
                    console.clear();
                    var status = aggregator.getSystemStatus();
                    var stats = aggregator.getDetailedStats();
                    console.log(chalk_1.default.bold("\nOmniGents System Status (".concat(status.timestamp, ")")));
                    var healthy = status.overallHealth === 'HEALTHY';
                    console.log("Overall: ".concat(healthy ? chalk_1.default.green('HEALTHY') : chalk_1.default.red(status.overallHealth)));
                    var table = new cli_table3_1.default({
                        head: ['Service', 'Status', 'Requests', 'Errors', 'Last Heartbeat'],
                        style: { head: ['cyan'] }
                    });
                    status.services.forEach(function (s) {
                        var statusColor = s.status === 'OK' ? chalk_1.default.green
                            : s.status === 'DEGRADED' ? chalk_1.default.yellow
                                : chalk_1.default.red;
                        table.push([
                            s.name,
                            statusColor(s.status),
                            s.metrics.throughput || 0,
                            (s.metrics.errorRate || 0) > 0 ? chalk_1.default.red(s.metrics.errorRate) : (s.metrics.errorRate || 0),
                            new Date(s.lastCheck).toLocaleTimeString()
                        ]);
                    });
                    console.log(table.toString());
                    status.services.filter(function (s) { return s.activeIssues.length > 0; }).forEach(function (s) {
                        console.log(chalk_1.default.bold("\nIssues for [".concat(s.name, "]:")));
                        s.activeIssues.forEach(function (issue) { return console.log(chalk_1.default.red("- ".concat(issue))); });
                    });
                };
                setInterval(render, 1000);
                render(); // Initial render
                return [3 /*break*/, 7];
            case 5:
                // Snapshot mode (wait briefly for events then render)
                spinner.start('Collecting telemetry snapshot (5s)...');
                return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 5000); })];
            case 6:
                _a.sent();
                spinner.stop();
                status_1 = aggregator.getSystemStatus();
                console.log(chalk_1.default.bold("OmniGents System Status (".concat(status_1.timestamp, ")")));
                healthy = status_1.overallHealth === 'HEALTHY';
                console.log("Overall: ".concat(healthy ? chalk_1.default.green('HEALTHY') : chalk_1.default.red(status_1.overallHealth), "\n"));
                table_1 = new cli_table3_1.default({
                    head: ['Service', 'Status', 'Requests', 'Errors', 'Last Heartbeat'],
                    style: { head: ['cyan'] }
                });
                status_1.services.forEach(function (s) {
                    var statusColor = s.status === 'OK' ? chalk_1.default.green
                        : s.status === 'DEGRADED' ? chalk_1.default.yellow
                            : chalk_1.default.red;
                    table_1.push([
                        s.name,
                        statusColor(s.status),
                        s.metrics.throughput || 0,
                        s.metrics.errorRate || 0,
                        new Date(s.lastCheck).toLocaleTimeString()
                    ]);
                });
                console.log(table_1.toString());
                status_1.services.filter(function (s) { return s.activeIssues.length > 0; }).forEach(function (s) {
                    console.log(chalk_1.default.bold("\nIssues for [".concat(s.name, "]:")));
                    s.activeIssues.forEach(function (issue) { return console.log(chalk_1.default.red("- ".concat(issue))); });
                });
                process.exit(0);
                _a.label = 7;
            case 7: return [2 /*return*/];
        }
    });
}); });
program.parse();
