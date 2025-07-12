/**
 * AgentOps
 * API Routes Tests
 * 
 * Copyright © 2025 Kari Pikkarainen. All rights reserved.
 * This software is proprietary and confidential.
 */

// Mock dependencies BEFORE requiring anything
jest.mock('../src/process-manager', () => ({
    getAllInstances: jest.fn(() => []),
    spawnInstance: jest.fn(),
    terminateInstance: jest.fn(),
    sendInput: jest.fn()
}));

jest.mock('../src/file-monitor', () => ({
    getStatus: jest.fn(() => ({ isMonitoring: false, watchedPaths: [], watcherCount: 0 })),
    startMonitoring: jest.fn(),
    stopMonitoring: jest.fn(() => Promise.resolve(true))
}));

jest.mock('../src/activity-parser', () => ({
    getRecentActivities: jest.fn(() => []),
    getStatistics: jest.fn(() => ({ totalActivities: 0 })),
    searchActivities: jest.fn(() => []),
    clearActivities: jest.fn()
}));

const request = require('supertest');
const express = require('express');
const { configureApiRoutes } = require('../src/api-routes');

const processManager = require('../src/process-manager');
const fileMonitor = require('../src/file-monitor');
const activityParser = require('../src/activity-parser');

describe('API Routes', () => {
    let app;

    beforeEach(() => {
        app = express();
        configureApiRoutes(app);
        
        // Reset mocks
        jest.clearAllMocks();
    });

    describe('Claude Code Instance Management', () => {
        describe('GET /api/v1/claude-code/instances', () => {
            test('should return instances successfully', async () => {
                const mockInstances = [{ id: 'test-1', command: 'echo test' }];
                processManager.getAllInstances.mockReturnValue(mockInstances);

                const response = await request(app)
                    .get('/api/v1/claude-code/instances')
                    .expect(200);

                expect(response.body).toEqual(mockInstances);
                expect(processManager.getAllInstances).toHaveBeenCalled();
            });

            test('should handle errors gracefully', async () => {
                processManager.getAllInstances.mockImplementation(() => {
                    throw new Error('Database error');
                });

                const response = await request(app)
                    .get('/api/v1/claude-code/instances')
                    .expect(500);

                expect(response.body).toHaveProperty('error', 'Failed to get instances');
                expect(response.body).toHaveProperty('details', 'Database error');
            });
        });

        describe('POST /api/v1/claude-code/instances', () => {
            test('should create instance successfully', async () => {
                const mockInstance = { id: 'test-1', command: 'echo test' };
                processManager.spawnInstance.mockReturnValue(mockInstance);

                const response = await request(app)
                    .post('/api/v1/claude-code/instances')
                    .send({ command: 'echo test', options: {} })
                    .expect(200);

                expect(response.body).toEqual(mockInstance);
                expect(processManager.spawnInstance).toHaveBeenCalledWith('echo test', {});
            });

            test('should create instance without options', async () => {
                const mockInstance = { id: 'test-2', command: 'echo test' };
                processManager.spawnInstance.mockReturnValue(mockInstance);

                const response = await request(app)
                    .post('/api/v1/claude-code/instances')
                    .send({ command: 'echo test' })
                    .expect(200);

                expect(response.body).toEqual(mockInstance);
                expect(processManager.spawnInstance).toHaveBeenCalledWith('echo test', undefined);
            });

            test('should require command', async () => {
                const response = await request(app)
                    .post('/api/v1/claude-code/instances')
                    .send({})
                    .expect(400);

                expect(response.body).toHaveProperty('error', 'Command is required');
                expect(processManager.spawnInstance).not.toHaveBeenCalled();
            });

            test('should handle spawn errors', async () => {
                processManager.spawnInstance.mockImplementation(() => {
                    throw new Error('Max instances reached');
                });

                const response = await request(app)
                    .post('/api/v1/claude-code/instances')
                    .send({ command: 'echo test' })
                    .expect(400);

                expect(response.body).toHaveProperty('error', 'Max instances reached');
            });
        });

        describe('DELETE /api/v1/claude-code/instances/:id', () => {
            test('should terminate instance successfully', async () => {
                processManager.terminateInstance.mockReturnValue(true);

                const response = await request(app)
                    .delete('/api/v1/claude-code/instances/test-id')
                    .expect(200);

                expect(response.body).toHaveProperty('message', 'Instance terminated successfully');
                expect(processManager.terminateInstance).toHaveBeenCalledWith('test-id');
            });

            test('should handle instance not found', async () => {
                processManager.terminateInstance.mockReturnValue(false);

                const response = await request(app)
                    .delete('/api/v1/claude-code/instances/nonexistent')
                    .expect(404);

                expect(response.body).toHaveProperty('error', 'Instance not found');
            });

            test('should handle termination errors', async () => {
                processManager.terminateInstance.mockImplementation(() => {
                    throw new Error('Termination failed');
                });

                const response = await request(app)
                    .delete('/api/v1/claude-code/instances/test-id')
                    .expect(500);

                expect(response.body).toHaveProperty('error', 'Failed to terminate instance');
                expect(response.body).toHaveProperty('details', 'Termination failed');
            });
        });

        describe('POST /api/v1/claude-code/instances/:id/input', () => {
            test('should send input successfully', async () => {
                processManager.sendInput.mockReturnValue(true);

                const response = await request(app)
                    .post('/api/v1/claude-code/instances/test-id/input')
                    .send({ input: 'test input' })
                    .expect(200);

                expect(response.body).toHaveProperty('message', 'Input sent successfully');
                expect(processManager.sendInput).toHaveBeenCalledWith('test-id', 'test input');
            });

            test('should require input', async () => {
                const response = await request(app)
                    .post('/api/v1/claude-code/instances/test-id/input')
                    .send({})
                    .expect(400);

                expect(response.body).toHaveProperty('error', 'Input is required');
                expect(processManager.sendInput).not.toHaveBeenCalled();
            });

            test('should handle instance not found', async () => {
                processManager.sendInput.mockReturnValue(false);

                const response = await request(app)
                    .post('/api/v1/claude-code/instances/nonexistent/input')
                    .send({ input: 'test' })
                    .expect(404);

                expect(response.body).toHaveProperty('error', 'Instance not found');
            });
        });
    });

    describe('File Monitoring', () => {
        describe('GET /api/v1/monitoring/status', () => {
            test('should return monitoring status', async () => {
                const mockStatus = { isMonitoring: true, watchedPaths: ['/test'], watcherCount: 1 };
                fileMonitor.getStatus.mockReturnValue(mockStatus);

                const response = await request(app)
                    .get('/api/v1/monitoring/status')
                    .expect(200);

                expect(response.body).toEqual(mockStatus);
                expect(fileMonitor.getStatus).toHaveBeenCalled();
            });

            test('should handle errors gracefully', async () => {
                fileMonitor.getStatus.mockImplementation(() => {
                    throw new Error('Monitor error');
                });

                const response = await request(app)
                    .get('/api/v1/monitoring/status')
                    .expect(500);

                expect(response.body).toHaveProperty('error', 'Failed to get monitoring status');
            });
        });

        describe('POST /api/v1/monitoring/start', () => {
            test('should start monitoring successfully', async () => {
                const response = await request(app)
                    .post('/api/v1/monitoring/start')
                    .send({ projectPath: '/test/path', options: {} })
                    .expect(200);

                expect(response.body).toHaveProperty('message', 'File monitoring started');
                expect(response.body).toHaveProperty('path', '/test/path');
                expect(fileMonitor.startMonitoring).toHaveBeenCalledWith('/test/path', {});
            });

            test('should use current working directory as default', async () => {
                const response = await request(app)
                    .post('/api/v1/monitoring/start')
                    .send({})
                    .expect(200);

                expect(fileMonitor.startMonitoring).toHaveBeenCalledWith(process.cwd(), undefined);
            });

            test('should handle missing project path and options', async () => {
                const response = await request(app)
                    .post('/api/v1/monitoring/start')
                    .send({ options: { ignored: ['*.log'] } })
                    .expect(200);

                expect(fileMonitor.startMonitoring).toHaveBeenCalledWith(process.cwd(), { ignored: ['*.log'] });
            });

            test('should handle monitoring errors', async () => {
                fileMonitor.startMonitoring.mockImplementation(() => {
                    throw new Error('Already monitoring');
                });

                const response = await request(app)
                    .post('/api/v1/monitoring/start')
                    .send({ projectPath: '/test' })
                    .expect(400);

                expect(response.body).toHaveProperty('error', 'Already monitoring');
            });
        });

        describe('POST /api/v1/monitoring/stop', () => {
            test('should stop monitoring successfully', async () => {
                fileMonitor.stopMonitoring.mockResolvedValue(true);

                const response = await request(app)
                    .post('/api/v1/monitoring/stop')
                    .send({ projectPath: '/test/path' })
                    .expect(200);

                expect(response.body).toHaveProperty('message', 'File monitoring stopped');
                expect(fileMonitor.stopMonitoring).toHaveBeenCalledWith('/test/path');
            });

            test('should require project path', async () => {
                const response = await request(app)
                    .post('/api/v1/monitoring/stop')
                    .send({})
                    .expect(400);

                expect(response.body).toHaveProperty('error', 'Project path is required');
                expect(fileMonitor.stopMonitoring).not.toHaveBeenCalled();
            });

            test('should handle path not being monitored', async () => {
                fileMonitor.stopMonitoring.mockResolvedValue(false);

                const response = await request(app)
                    .post('/api/v1/monitoring/stop')
                    .send({ projectPath: '/nonexistent' })
                    .expect(404);

                expect(response.body).toHaveProperty('error', 'Path not being monitored');
            });
        });
    });

    describe('Activity Management', () => {
        describe('GET /api/v1/activities', () => {
            test('should return activities with default parameters', async () => {
                const mockActivities = [{ id: 1, type: 'test' }];
                activityParser.getRecentActivities.mockReturnValue(mockActivities);

                const response = await request(app)
                    .get('/api/v1/activities')
                    .expect(200);

                expect(response.body).toEqual(mockActivities);
                expect(activityParser.getRecentActivities).toHaveBeenCalledWith(50, null);
            });

            test('should handle query parameters', async () => {
                const mockActivities = [{ id: 1, type: 'error' }];
                activityParser.getRecentActivities.mockReturnValue(mockActivities);

                const response = await request(app)
                    .get('/api/v1/activities?limit=10&type=error')
                    .expect(200);

                expect(response.body).toEqual(mockActivities);
                expect(activityParser.getRecentActivities).toHaveBeenCalledWith(10, 'error');
            });

            test('should handle invalid limit parameter', async () => {
                const mockActivities = [{ id: 1, type: 'test' }];
                activityParser.getRecentActivities.mockReturnValue(mockActivities);

                const response = await request(app)
                    .get('/api/v1/activities?limit=invalid')
                    .expect(200);

                expect(response.body).toEqual(mockActivities);
                expect(activityParser.getRecentActivities).toHaveBeenCalledWith(NaN, null);
            });

            test('should handle only type parameter', async () => {
                const mockActivities = [{ id: 1, type: 'info' }];
                activityParser.getRecentActivities.mockReturnValue(mockActivities);

                const response = await request(app)
                    .get('/api/v1/activities?type=info')
                    .expect(200);

                expect(response.body).toEqual(mockActivities);
                expect(activityParser.getRecentActivities).toHaveBeenCalledWith(50, 'info');
            });

            test('should handle errors gracefully', async () => {
                activityParser.getRecentActivities.mockImplementation(() => {
                    throw new Error('Database error');
                });

                const response = await request(app)
                    .get('/api/v1/activities')
                    .expect(500);

                expect(response.body).toHaveProperty('error', 'Failed to get activities');
            });
        });

        describe('POST /api/v1/activities/search', () => {
            test('should search activities successfully', async () => {
                const mockResults = [{ id: 1, description: 'test error' }];
                activityParser.searchActivities.mockReturnValue(mockResults);

                const response = await request(app)
                    .post('/api/v1/activities/search')
                    .send({ query: 'error', filters: { type: 'error' } })
                    .expect(200);

                expect(response.body).toEqual(mockResults);
                expect(activityParser.searchActivities).toHaveBeenCalledWith('error', { type: 'error' });
            });

            test('should search without filters', async () => {
                const mockResults = [{ id: 1, description: 'test' }];
                activityParser.searchActivities.mockReturnValue(mockResults);

                const response = await request(app)
                    .post('/api/v1/activities/search')
                    .send({ query: 'test' })
                    .expect(200);

                expect(response.body).toEqual(mockResults);
                expect(activityParser.searchActivities).toHaveBeenCalledWith('test', undefined);
            });

            test('should handle search errors', async () => {
                activityParser.searchActivities.mockImplementation(() => {
                    throw new Error('Search failed');
                });

                const response = await request(app)
                    .post('/api/v1/activities/search')
                    .send({ query: 'test' })
                    .expect(500);

                expect(response.body).toHaveProperty('error', 'Failed to search activities');
            });
        });

        describe('DELETE /api/v1/activities', () => {
            test('should clear activities successfully', async () => {
                const response = await request(app)
                    .delete('/api/v1/activities')
                    .expect(200);

                expect(response.body).toHaveProperty('message', 'Activities cleared');
                expect(activityParser.clearActivities).toHaveBeenCalled();
            });

            test('should handle clear errors', async () => {
                activityParser.clearActivities.mockImplementation(() => {
                    throw new Error('Clear failed');
                });

                const response = await request(app)
                    .delete('/api/v1/activities')
                    .expect(500);

                expect(response.body).toHaveProperty('error', 'Failed to clear activities');
            });
        });
    });
});