#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import { StatusAggregator } from '../src/aggregator.js';
import ora from 'ora';
import { Telemetry, createLogger } from '@omnigents/shared';

const log = createLogger('omnigent-cli');

const tracing = new Telemetry({
    serviceName: 'tier2-systems-check',
    serviceVersion: '0.1.0',
});

// Initialize tracing early
tracing.start().catch((err) => log.error({ err }, 'Failed to start tracing'));

const program = new Command();

program
    .name('omnigent')
    .description('Unrestricted OmniAgents CLI')
    .version('0.1.0');

program
    .command('status')
    .description('Show system health status')
    .option('-w, --watch', 'Watch mode (live updates)', false)
    .action(async (options) => {
        const aggregator = new StatusAggregator();
        const spinner = ora('Connecting to Telemetry Bus...').start();

        try {
            await aggregator.start();
            spinner.succeed('Connected');
        } catch (error) {
            spinner.fail('Failed to connect to Redis/Telemetry Bus');
            log.error({ err: error }, 'Failed to connect to Redis/Telemetry Bus');
            process.exit(1);
        }

        if (options.watch) {
            // Watch mode implementation
            console.clear();
            const render = () => {
                console.clear();
                const status = aggregator.getSystemStatus();

                console.log(chalk.bold(`\nOmniGents System Status (${status.timestamp})`));
                const healthy = status.overallHealth === 'HEALTHY';
                console.log(`Overall: ${healthy ? chalk.green('HEALTHY') : chalk.red(status.overallHealth)}`);

                const table = new Table({
                    head: ['Service', 'Status', 'Requests', 'Errors', 'Last Heartbeat'],
                    style: { head: ['cyan'] }
                });

                status.services.forEach(s => {
                    const statusColor = s.status === 'OK' ? chalk.green
                        : s.status === 'DEGRADED' ? chalk.yellow
                            : chalk.red;

                    table.push([
                        s.name,
                        statusColor(s.status),
                        s.metrics.throughput || 0,
                        (s.metrics.errorRate || 0) > 0 ? chalk.red(s.metrics.errorRate) : (s.metrics.errorRate || 0),
                        new Date(s.lastCheck).toLocaleTimeString()
                    ]);
                });

                console.log(table.toString());

                status.services.filter(s => s.activeIssues.length > 0).forEach(s => {
                    console.log(chalk.bold(`\nIssues for [${s.name}]:`));
                    s.activeIssues.forEach(issue => console.log(chalk.red(`- ${issue}`)));
                });
            };

            setInterval(render, 1000);
            render(); // Initial render
        } else {
            // Snapshot mode (wait briefly for events then render)
            spinner.start('Collecting telemetry snapshot (5s)...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            spinner.stop();

            const status = aggregator.getSystemStatus();

            console.log(chalk.bold(`OmniGents System Status (${status.timestamp})`));
            const healthy = status.overallHealth === 'HEALTHY';
            console.log(`Overall: ${healthy ? chalk.green('HEALTHY') : chalk.red(status.overallHealth)}\n`);

            const table = new Table({
                head: ['Service', 'Status', 'Requests', 'Errors', 'Last Heartbeat'],
                style: { head: ['cyan'] }
            });

            status.services.forEach(s => {
                const statusColor = s.status === 'OK' ? chalk.green
                    : s.status === 'DEGRADED' ? chalk.yellow
                        : chalk.red;
                table.push([
                    s.name,
                    statusColor(s.status),
                    s.metrics.throughput || 0,
                    s.metrics.errorRate || 0,
                    new Date(s.lastCheck).toLocaleTimeString()
                ]);
            });

            console.log(table.toString());

            status.services.filter(s => s.activeIssues.length > 0).forEach(s => {
                console.log(chalk.bold(`\nIssues for [${s.name}]:`));
                s.activeIssues.forEach(issue => console.log(chalk.red(`- ${issue}`)));
            });

            process.exit(0);
        }
    });

program.parse();
