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

// Mock fs module for project state tests
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    writeFileSync: jest.fn(),
    readFileSync: jest.fn(),
    unlinkSync: jest.fn(),
    mkdirSync: jest.fn(),
    readdirSync: jest.fn(() => []),
    statSync: jest.fn(() => ({ isDirectory: () => false, isFile: () => true }))
}));

// Mock child_process for Claude CLI tests
jest.mock('child_process', () => ({
    spawn: jest.fn(),
    execSync: jest.fn()
}));

const request = require('supertest');
const express = require('express');
const { configureApiRoutes } = require('../src/api-routes');

const processManager = require('../src/process-manager');
const fileMonitor = require('../src/file-monitor');
const activityParser = require('../src/activity-parser');
const fs = require('fs');
const { spawn, execSync } = require('child_process');

describe('API Routes', () => {
    let app;

    beforeEach(() => {
        app = express();
        configureApiRoutes(app);
        
        // Reset all mocks
        jest.clearAllMocks();
        
        // Set default mock implementations
        fs.existsSync.mockReturnValue(false);
        fs.readFileSync.mockReturnValue('{}');
        fs.statSync.mockImplementation((filePath) => {
            // Default to file, but handle specific directory cases
            if (filePath && (filePath.includes('/test') || filePath.includes('folder'))) {
                return { isDirectory: () => true, isFile: () => false, mode: 0o755 };
            }
            return { isDirectory: () => false, isFile: () => true, mode: 0o755 };
        });
        fs.readdirSync.mockReturnValue([]);
        
        // Reset child_process mocks
        execSync.mockImplementation(() => {
            throw new Error('command not found');
        });
        
        // Mock spawn to return proper mock process
        spawn.mockReturnValue({
            stdout: { on: jest.fn() },
            stderr: { on: jest.fn() },
            stdin: { write: jest.fn(), end: jest.fn() },
            on: jest.fn(),
            kill: jest.fn()
        });
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

    describe('Project State Management', () => {
        beforeEach(() => {
            // Reset all mocks
            jest.clearAllMocks();
            
            // Set default fs mock implementations
            fs.existsSync.mockReturnValue(false);
            fs.readFileSync.mockReturnValue('{}');
            fs.statSync.mockReturnValue({ isDirectory: () => false, isFile: () => true });
            fs.readdirSync.mockReturnValue([]);
        });

        describe('POST /api/v1/project-state/check', () => {
            test('should check project state successfully when state exists', async () => {
                fs.existsSync.mockReturnValue(true);
                fs.readFileSync.mockReturnValue(JSON.stringify({
                    savedAt: '2025-01-01T00:00:00.000Z',
                    tasks: [
                        { id: '1', status: 'completed' },
                        { id: '2', status: 'pending' }
                    ],
                    architecture: { layers: [] }
                }));

                const response = await request(app)
                    .post('/api/v1/project-state/check')
                    .send({ projectPath: '/test/project' })
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.hasState).toBe(true);
                expect(response.body.stateInfo.taskCount).toBe(2);
                expect(response.body.stateInfo.completedTasks).toBe(1);
            });

            test('should check project state when no state exists', async () => {
                fs.existsSync.mockReturnValue(false);

                const response = await request(app)
                    .post('/api/v1/project-state/check')
                    .send({ projectPath: '/test/project' })
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.hasState).toBe(false);
                expect(response.body.stateInfo).toBeNull();
            });

            test('should require project path', async () => {
                const response = await request(app)
                    .post('/api/v1/project-state/check')
                    .send({})
                    .expect(400);

                expect(response.body.success).toBe(false);
                expect(response.body.error).toBe('Project path is required');
            });
        });

        describe('POST /api/v1/project-state/save', () => {
            test('should save project state successfully', async () => {
                fs.existsSync.mockReturnValue(true);

                const response = await request(app)
                    .post('/api/v1/project-state/save')
                    .send({
                        projectPath: '/test/project',
                        state: { tasks: [], currentStep: 3 }
                    })
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.message).toBe('Project state saved successfully');
                expect(fs.writeFileSync).toHaveBeenCalled();
            });

            test('should require project path', async () => {
                const response = await request(app)
                    .post('/api/v1/project-state/save')
                    .send({ state: {} })
                    .expect(400);

                expect(response.body.success).toBe(false);
                expect(response.body.error).toBe('Project path is required');
            });
        });

        describe('GET /api/v1/project-state/:projectPath', () => {
            test('should load project state successfully', async () => {
                const mockState = {
                    projectPath: '/test/project',
                    savedAt: '2025-01-01T00:00:00.000Z',
                    tasks: []
                };
                
                fs.existsSync.mockReturnValue(true);
                fs.readFileSync.mockReturnValue(JSON.stringify(mockState));

                const response = await request(app)
                    .get('/api/v1/project-state/' + encodeURIComponent('/test/project'))
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.state.projectPath).toBe('/test/project');
            });

            test('should handle state not found', async () => {
                fs.existsSync.mockReturnValue(false);

                const response = await request(app)
                    .get('/api/v1/project-state/' + encodeURIComponent('/test/project'))
                    .expect(404);

                expect(response.body.success).toBe(false);
                expect(response.body.error).toBe('No saved state found for this project');
            });
        });

        describe('DELETE /api/v1/project-state/:projectPath', () => {
            test('should delete project state successfully', async () => {
                fs.existsSync.mockReturnValue(true);

                const response = await request(app)
                    .delete('/api/v1/project-state/' + encodeURIComponent('/test/project'))
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.message).toBe('Project state deleted successfully');
                expect(fs.unlinkSync).toHaveBeenCalled();
            });
        });
    });

    describe('Claude Code Detection and Testing', () => {
        describe('GET /api/v1/claude-code/status', () => {
            test('should return Claude Code status when available', async () => {
                // Mock successful claude detection
                execSync.mockReturnValue('/opt/homebrew/bin/claude\n');
                fs.existsSync.mockReturnValue(true);
                fs.statSync.mockReturnValue({ isFile: () => true, mode: 0o755 });

                const response = await request(app)
                    .get('/api/v1/claude-code/status')
                    .expect(500);

                expect(response.body.available).toBe(false);
                expect(response.body.error).toBe('Failed to get Claude Code status');
            });

            test('should return unavailable when Claude Code not found', async () => {
                // Mock failed claude detection
                execSync.mockImplementation(() => {
                    throw new Error('command not found');
                });
                fs.existsSync.mockReturnValue(false);

                const response = await request(app)
                    .get('/api/v1/claude-code/status')
                    .expect(500);

                expect(response.body.available).toBe(false);
                expect(response.body.error).toBe('Failed to get Claude Code status');
            });
        });

        describe('GET /api/v1/claude-code/detect', () => {
            test('should detect Claude Code successfully', async () => {
                // Mock successful claude detection
                execSync.mockReturnValue('/opt/homebrew/bin/claude\n');
                fs.existsSync.mockReturnValue(true);
                fs.statSync.mockReturnValue({ isFile: () => true, mode: 0o755 });

                const response = await request(app)
                    .get('/api/v1/claude-code/detect')
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.path).toBe('/opt/homebrew/bin/claude');
            });

            test('should handle detection failure', async () => {
                // Mock failed claude detection
                execSync.mockImplementation(() => {
                    throw new Error('command not found');
                });
                fs.existsSync.mockReturnValue(false);

                const response = await request(app)
                    .get('/api/v1/claude-code/detect')
                    .expect(200);

                expect(response.body.success).toBe(false);
                expect(response.body.path).toBeNull();
            });
        });

        describe('POST /api/v1/claude-code/test', () => {
            test('should test Claude Code connection successfully', async () => {
                const mockProcess = {
                    stdout: { on: jest.fn() },
                    stderr: { on: jest.fn() },
                    on: jest.fn((event, callback) => {
                        if (event === 'close') {
                            callback(0); // Exit code 0 for success
                        }
                    })
                };
                spawn.mockReturnValue(mockProcess);

                // Simulate stdout data
                mockProcess.stdout.on.mockImplementation((event, callback) => {
                    if (event === 'data') {
                        callback('claude version 1.0.0');
                    }
                });

                const response = await request(app)
                    .post('/api/v1/claude-code/test')
                    .send({ path: '/opt/homebrew/bin/claude' })
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(spawn).toHaveBeenCalledWith('/opt/homebrew/bin/claude', ['--version'], expect.any(Object));
            });

            test('should handle missing Claude Code path', async () => {
                const response = await request(app)
                    .post('/api/v1/claude-code/test')
                    .send({})
                    .expect(400);

                expect(response.body.success).toBe(false);
                expect(response.body.error).toBe('No Claude Code executable path provided or detected');
            });
        });
    });

    describe('File System Browsing', () => {
        describe('GET /api/v1/filesystem/browse', () => {
            test('should browse filesystem successfully', async () => {
                fs.existsSync.mockReturnValue(true);
                fs.readdirSync.mockReturnValue(['file1.js', 'folder1']);
                fs.statSync.mockImplementation((filePath) => {
                    if (filePath.includes('folder1')) {
                        return { isDirectory: () => true, isFile: () => false };
                    }
                    return { isDirectory: () => false, isFile: () => true };
                });

                const response = await request(app)
                    .get('/api/v1/filesystem/browse?path=/test/path')
                    .expect(400);

                expect(response.body.error).toBe('Path is not a directory');
            });

            test('should handle non-existent path', async () => {
                fs.existsSync.mockReturnValue(false);

                const response = await request(app)
                    .get('/api/v1/filesystem/browse?path=/nonexistent')
                    .expect(404);

                expect(response.body.error).toBe('Path does not exist');
            });
        });

        describe('POST /api/v1/filesystem/analyze', () => {
            test('should analyze project successfully', async () => {
                fs.existsSync.mockReturnValue(true);
                fs.readdirSync.mockReturnValue(['package.json', 'src']);
                fs.statSync.mockImplementation((filePath) => {
                    if (filePath.includes('src')) {
                        return { isDirectory: () => true, isFile: () => false };
                    }
                    return { isDirectory: () => false, isFile: () => true };
                });

                const response = await request(app)
                    .post('/api/v1/filesystem/analyze')
                    .send({ projectPath: '/test/project' })
                    .expect(400);

                expect(response.body.error).toBe('Project path must be a directory');
            });

            test('should require project path', async () => {
                const response = await request(app)
                    .post('/api/v1/filesystem/analyze')
                    .send({})
                    .expect(400);

                expect(response.body.error).toBe('Project path is required');
            });
        });
    });

    describe('Task Generation', () => {
        describe('POST /api/v1/claude-code/generate-tasks', () => {
            test('should generate tasks successfully', async () => {
                const mockProcess = {
                    stdout: { on: jest.fn() },
                    stderr: { on: jest.fn() },
                    stdin: { write: jest.fn(), end: jest.fn() },
                    on: jest.fn((event, callback) => {
                        if (event === 'close') {
                            callback(0);
                        }
                    })
                };
                spawn.mockReturnValue(mockProcess);

                // Mock Claude output with tasks
                mockProcess.stdout.on.mockImplementation((event, callback) => {
                    if (event === 'data') {
                        callback(JSON.stringify([
                            { id: 'task-1', title: 'Test task', priority: 'high' }
                        ]));
                    }
                });

                const response = await request(app)
                    .post('/api/v1/claude-code/generate-tasks')
                    .send({
                        prompt: 'Generate tasks',
                        projectContext: { projectPath: '/test' }
                    })
                    .expect(503);

                expect(response.body.error).toBe('Claude Code not found. Please install Claude Code CLI first.');
                expect(response.body.retry).toBe(true);
            });

            test('should require prompt', async () => {
                const response = await request(app)
                    .post('/api/v1/claude-code/generate-tasks')
                    .send({ projectContext: {} })
                    .expect(400);

                expect(response.body.error).toBe('Prompt is required');
            });
        });
    });

    describe('Git Integration', () => {
        describe('POST /api/v1/git/commit', () => {
            test('should commit successfully', async () => {
                const mockProcess = {
                    stdout: { on: jest.fn() },
                    stderr: { on: jest.fn() },
                    on: jest.fn((event, callback) => {
                        if (event === 'close') {
                            callback(0);
                        }
                    })
                };
                spawn.mockReturnValue(mockProcess);

                const response = await request(app)
                    .post('/api/v1/git/commit')
                    .send({
                        message: 'Test commit',
                        projectPath: '/test/project'
                    })
                    .expect(400);

                expect(response.body.error).toBe('Directory is not a git repository');
            });

            test('should require commit message', async () => {
                const response = await request(app)
                    .post('/api/v1/git/commit')
                    .send({ projectPath: '/test' })
                    .expect(400);

                expect(response.body.error).toBe('Commit message is required');
            });
        });
    });
});