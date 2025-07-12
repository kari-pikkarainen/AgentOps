/**
 * AgentOps
 * Server Integration Tests
 * 
 * Copyright © 2025 Kari Pikkarainen. All rights reserved.
 * This software is proprietary and confidential.
 */

// Mock dependencies BEFORE requiring anything
jest.mock('../src/process-manager', () => {
    const { EventEmitter } = require('events');
    const mockManager = new EventEmitter();
    mockManager.getAllInstances = jest.fn(() => []);
    mockManager.spawnInstance = jest.fn(() => ({ id: 'test-id', command: 'echo test' }));
    mockManager.terminateInstance = jest.fn(() => true);
    mockManager.sendInput = jest.fn(() => true);
    return mockManager;
});

jest.mock('../src/file-monitor', () => {
    const { EventEmitter } = require('events');
    const mockMonitor = new EventEmitter();
    mockMonitor.getStatus = jest.fn(() => ({ isMonitoring: false, watchedPaths: [], watcherCount: 0 }));
    mockMonitor.startMonitoring = jest.fn();
    mockMonitor.stopMonitoring = jest.fn(() => Promise.resolve(true));
    return mockMonitor;
});

jest.mock('../src/activity-parser', () => {
    const { EventEmitter } = require('events');
    const mockParser = new EventEmitter();
    mockParser.getRecentActivities = jest.fn(() => []);
    mockParser.getStatistics = jest.fn(() => ({ totalActivities: 0, typeDistribution: {}, importanceDistribution: {} }));
    mockParser.searchActivities = jest.fn(() => []);
    mockParser.clearActivities = jest.fn();
    mockParser.parseActivity = jest.fn();
    return mockParser;
});

const request = require('supertest');
const { app, setupCrossComponentIntegration } = require('../server');

describe('Server Integration Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Basic Routes', () => {
        test('should serve index page', async () => {
            const response = await request(app)
                .get('/')
                .expect(200);
            
            expect(response.headers['content-type']).toMatch(/text\/html/);
        });

        test('should serve static files', async () => {
            const response = await request(app)
                .get('/styles.css')
                .expect(200);
            
            expect(response.headers['content-type']).toMatch(/text\/css/);
        });
    });

    describe('API Integration', () => {
        test('should handle complete instance lifecycle', async () => {
            // Create instance
            const createResponse = await request(app)
                .post('/api/v1/claude-code/instances')
                .send({ command: 'echo test', options: {} })
                .expect(200);

            expect(createResponse.body).toHaveProperty('id');
            expect(createResponse.body).toHaveProperty('command', 'echo test');

            // Get instances
            const getResponse = await request(app)
                .get('/api/v1/claude-code/instances')
                .expect(200);

            expect(Array.isArray(getResponse.body)).toBe(true);

            // Send input
            await request(app)
                .post('/api/v1/claude-code/instances/test-id/input')
                .send({ input: 'test input' })
                .expect(200);

            // Terminate instance
            await request(app)
                .delete('/api/v1/claude-code/instances/test-id')
                .expect(200);
        });

        test('should handle monitoring workflow', async () => {
            // Get initial status
            const statusResponse = await request(app)
                .get('/api/v1/monitoring/status')
                .expect(200);

            expect(statusResponse.body).toHaveProperty('isMonitoring');

            // Start monitoring
            await request(app)
                .post('/api/v1/monitoring/start')
                .send({ projectPath: '/test/path' })
                .expect(200);

            // Stop monitoring
            await request(app)
                .post('/api/v1/monitoring/stop')
                .send({ projectPath: '/test/path' })
                .expect(200);
        });

        test('should handle activity management', async () => {
            // Get activities
            const activitiesResponse = await request(app)
                .get('/api/v1/activities')
                .expect(200);

            expect(Array.isArray(activitiesResponse.body)).toBe(true);

            // Get statistics
            const statsResponse = await request(app)
                .get('/api/v1/activities/statistics')
                .expect(200);

            expect(statsResponse.body).toHaveProperty('totalActivities');

            // Search activities
            await request(app)
                .post('/api/v1/activities/search')
                .send({ query: 'test', filters: {} })
                .expect(200);

            // Clear activities
            await request(app)
                .delete('/api/v1/activities')
                .expect(200);
        });
    });

    describe('Error Handling', () => {
        test('should handle 404 for unknown routes', async () => {
            await request(app)
                .get('/api/v1/nonexistent')
                .expect(404);
        });

        test('should handle malformed JSON in POST requests', async () => {
            const response = await request(app)
                .post('/api/v1/claude-code/instances')
                .send('invalid json')
                .set('Content-Type', 'application/json')
                .expect(400);
        });
    });

    describe('Cross-Component Integration', () => {
        test('should set up cross-component integration', () => {
            const processManager = require('../src/process-manager');
            const fileMonitor = require('../src/file-monitor');
            const activityParser = require('../src/activity-parser');

            // Clear any existing listeners
            processManager.removeAllListeners();
            fileMonitor.removeAllListeners();

            // Set up integration
            setupCrossComponentIntegration();

            // Verify listeners are set up
            expect(processManager.listenerCount('processOutput')).toBeGreaterThan(0);
            expect(fileMonitor.listenerCount('fileChange')).toBeGreaterThan(0);

            // Test process output integration
            processManager.emit('processOutput', {
                instanceId: 'test-id',
                type: 'stdout',
                data: 'test output'
            });

            expect(activityParser.parseActivity).toHaveBeenCalledWith('process_output', 'test output', {
                instanceId: 'test-id',
                outputType: 'stdout'
            });

            // Test file change integration
            fileMonitor.emit('fileChange', {
                eventType: 'change',
                fileName: 'test.js',
                path: '/test/test.js',
                fileExtension: '.js'
            });

            expect(activityParser.parseActivity).toHaveBeenCalledWith('file_change', 'change: test.js', {
                path: '/test/test.js',
                fileType: '.js',
                eventType: 'change'
            });
        });
    });

    describe('Content Type Handling', () => {
        test('should handle JSON content type', async () => {
            await request(app)
                .post('/api/v1/claude-code/instances')
                .send({ command: 'echo test' })
                .set('Content-Type', 'application/json')
                .expect(200);
        });

        test('should reject non-JSON content for JSON endpoints', async () => {
            await request(app)
                .post('/api/v1/claude-code/instances')
                .send('command=echo+test')
                .set('Content-Type', 'application/x-www-form-urlencoded')
                .expect(400);
        });
    });

    describe('Query Parameter Handling', () => {
        test('should handle query parameters in GET requests', async () => {
            await request(app)
                .get('/api/v1/activities?limit=10&type=error')
                .expect(200);
        });

        test('should handle missing query parameters gracefully', async () => {
            await request(app)
                .get('/api/v1/activities')
                .expect(200);
        });
    });
});