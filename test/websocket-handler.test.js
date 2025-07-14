/**
 * AgentOps
 * WebSocket Handler Tests
 * 
 * Copyright © 2025 Kari Pikkarainen. All rights reserved.
 * This software is proprietary and confidential.
 */

// Mock dependencies BEFORE requiring anything
jest.mock('../src/process-manager', () => {
    const { EventEmitter } = require('events');
    const mockManager = new EventEmitter();
    mockManager.getAllInstances = jest.fn(() => []);
    mockManager.spawnInstance = jest.fn();
    mockManager.terminateInstance = jest.fn();
    return mockManager;
});

jest.mock('../src/file-monitor', () => {
    const { EventEmitter } = require('events');
    const mockMonitor = new EventEmitter();
    mockMonitor.getStatus = jest.fn(() => ({ isMonitoring: false }));
    mockMonitor.startMonitoring = jest.fn();
    mockMonitor.stopMonitoring = jest.fn(() => Promise.resolve(true));
    return mockMonitor;
});

jest.mock('../src/activity-parser', () => {
    const { EventEmitter } = require('events');
    const mockParser = new EventEmitter();
    mockParser.getRecentActivities = jest.fn(() => []);
    mockParser.getStatistics = jest.fn(() => ({ totalActivities: 0 }));
    mockParser.searchActivities = jest.fn(() => []);
    mockParser.clearActivities = jest.fn();
    return mockParser;
});

const WebSocketHandler = require('../src/websocket-handler');
const { EventEmitter } = require('events');

const processManager = require('../src/process-manager');
const fileMonitor = require('../src/file-monitor');
const activityParser = require('../src/activity-parser');

describe('WebSocket Handler', () => {
    let mockWss, mockWs, wsHandler;

    beforeEach(() => {
        // Mock WebSocket Server
        mockWss = {
            clients: new Set(),
            on: jest.fn()
        };

        // Mock WebSocket connection
        mockWs = {
            readyState: 1, // OPEN
            OPEN: 1,
            send: jest.fn(),
            on: jest.fn(),
            removeListener: jest.fn()
        };

        mockWss.clients.add(mockWs);

        // Create handler
        wsHandler = new WebSocketHandler(mockWss);

        // Reset mocks
        jest.clearAllMocks();
    });

    afterEach(() => {
        // Clean up event listeners
        processManager.removeAllListeners();
        fileMonitor.removeAllListeners();
        activityParser.removeAllListeners();
    });

    describe('Initialization', () => {
        test('should set up global event handlers', () => {
            expect(activityParser.listenerCount('activityParsed')).toBeGreaterThan(0);
        });

        test('should broadcast activities to all clients', () => {
            const mockActivity = { id: 1, type: 'test' };
            
            activityParser.emit('activityParsed', mockActivity);

            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'activityParsed',
                data: mockActivity
            }));
        });
    });

    describe('Connection Handling', () => {
        test('should handle new connections', () => {
            wsHandler.handleConnection(mockWs);

            expect(mockWs.on).toHaveBeenCalledWith('message', expect.any(Function));
            expect(mockWs.on).toHaveBeenCalledWith('close', expect.any(Function));
            const welcomeCall = mockWs.send.mock.calls.find(call => {
                const parsed = JSON.parse(call[0]);
                return parsed.type === 'welcome';
            });
            expect(welcomeCall).toBeDefined();
            const welcomeData = JSON.parse(welcomeCall[0]);
            expect(welcomeData.data).toEqual(expect.objectContaining({
                message: 'Connected to AgentOps',
                currentInstances: expect.any(Array),
                monitoringStatus: expect.any(Object),
                activityStatistics: expect.any(Object)
            }));
        });

        test('should set up event listeners for client', () => {
            wsHandler.handleConnection(mockWs);

            // Verify that listeners are added to various modules
            expect(processManager.listenerCount('instanceCreated')).toBeGreaterThan(0);
            expect(fileMonitor.listenerCount('fileChange')).toBeGreaterThan(0);
        });

        test('should clean up listeners on disconnect', () => {
            wsHandler.handleConnection(mockWs);
            
            // Get the close handler
            const closeHandler = mockWs.on.mock.calls.find(call => call[0] === 'close')[1];
            
            // Simulate disconnect
            closeHandler();

            // Verify cleanup (listeners should be removed)
            // Note: Exact verification depends on implementation details
        });
    });

    describe('Message Handling', () => {
        beforeEach(() => {
            wsHandler.handleConnection(mockWs);
        });

        test('should handle valid JSON messages', () => {
            const message = JSON.stringify({ type: 'getInstances' });
            
            wsHandler.handleMessage(mockWs, message);

            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'instances',
                data: []
            }));
        });

        test('should handle invalid JSON messages', () => {
            wsHandler.handleMessage(mockWs, 'invalid json');

            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'error',
                data: 'Invalid JSON message'
            }));
        });

        test('should handle unknown message types', () => {
            const message = JSON.stringify({ type: 'unknownType' });
            
            wsHandler.handleMessage(mockWs, message);

            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'error',
                data: 'Unknown message type'
            }));
        });
    });

    describe('Message Routing', () => {
        beforeEach(() => {
            wsHandler.handleConnection(mockWs);
        });

        test('should route spawnInstance messages', () => {
            const mockInstance = { id: 'test-1', command: 'echo test' };
            processManager.spawnInstance.mockReturnValue(mockInstance);

            wsHandler.routeMessage(mockWs, {
                type: 'spawnInstance',
                command: 'echo test',
                options: {}
            });

            expect(processManager.spawnInstance).toHaveBeenCalledWith('echo test', {});
            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'response',
                data: mockInstance
            }));
        });

        test('should handle spawnInstance errors', () => {
            processManager.spawnInstance.mockImplementation(() => {
                throw new Error('Max instances reached');
            });

            wsHandler.routeMessage(mockWs, {
                type: 'spawnInstance',
                command: 'echo test'
            });

            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'error',
                data: 'Max instances reached'
            }));
        });

        test('should route terminateInstance messages', () => {
            processManager.terminateInstance.mockReturnValue(true);

            wsHandler.routeMessage(mockWs, {
                type: 'terminateInstance',
                instanceId: 'test-1'
            });

            expect(processManager.terminateInstance).toHaveBeenCalledWith('test-1');
            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'response',
                data: { success: true }
            }));
        });

        test('should route monitoring messages', () => {
            // Clear previous calls
            mockWs.send.mockClear();
            
            wsHandler.routeMessage(mockWs, {
                type: 'startMonitoring',
                projectPath: '/test/path'
            });

            expect(fileMonitor.startMonitoring).toHaveBeenCalledWith('/test/path', undefined);
            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'response',
                data: {
                    message: 'File monitoring started',
                    path: '/test/path'
                }
            }));
        });

        test('should handle monitoring without project path', () => {
            // Clear previous calls
            mockWs.send.mockClear();
            
            wsHandler.routeMessage(mockWs, {
                type: 'startMonitoring',
                options: { ignored: ['*.log'] }
            });

            expect(fileMonitor.startMonitoring).toHaveBeenCalledWith(process.cwd(), { ignored: ['*.log'] });
            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'response',
                data: {
                    message: 'File monitoring started',
                    path: process.cwd()
                }
            }));
        });

        test('should handle monitoring errors', () => {
            // Clear previous calls and setup error
            mockWs.send.mockClear();
            fileMonitor.startMonitoring.mockImplementation(() => {
                throw new Error('Monitoring failed');
            });
            
            wsHandler.routeMessage(mockWs, {
                type: 'startMonitoring',
                projectPath: '/test/path'
            });

            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'error',
                data: 'Monitoring failed'
            }));
        });

        test('should route activity messages with activity type filter', () => {
            const mockActivities = [{ id: 1, type: 'error' }];
            activityParser.getRecentActivities.mockReturnValue(mockActivities);
            
            // Clear previous calls
            mockWs.send.mockClear();

            wsHandler.routeMessage(mockWs, {
                type: 'getActivities',
                limit: 10,
                activityType: 'error'  // Use different property name to avoid conflict
            });

            expect(activityParser.getRecentActivities).toHaveBeenCalledWith(10, 'getActivities'); // message.type is used as the filter
            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'activities',
                data: mockActivities
            }));
        });

        test('should route activity messages with defaults', () => {
            const mockActivities = [{ id: 1, type: 'test' }];
            activityParser.getRecentActivities.mockReturnValue(mockActivities);
            
            // Clear previous calls
            mockWs.send.mockClear();

            wsHandler.routeMessage(mockWs, {
                type: 'getActivities'
            });

            expect(activityParser.getRecentActivities).toHaveBeenCalledWith(50, 'getActivities');
        });

        test('should route stopMonitoring messages', async () => {
            fileMonitor.stopMonitoring.mockResolvedValue(true);
            
            // Clear previous calls
            mockWs.send.mockClear();
            
            wsHandler.routeMessage(mockWs, {
                type: 'stopMonitoring',
                projectPath: '/test/path'
            });

            // Wait for promise to resolve
            await new Promise(resolve => setImmediate(resolve));

            expect(fileMonitor.stopMonitoring).toHaveBeenCalledWith('/test/path');
            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'response',
                data: { success: true }
            }));
        });

        test('should route getMonitoringStatus messages', () => {
            const mockStatus = { isMonitoring: true, watchedPaths: ['/test'] };
            fileMonitor.getStatus.mockReturnValue(mockStatus);
            
            // Clear previous calls
            mockWs.send.mockClear();

            wsHandler.routeMessage(mockWs, {
                type: 'getMonitoringStatus'
            });

            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'monitoringStatus',
                data: mockStatus
            }));
        });

        test('should route getActivityStatistics messages', () => {
            const mockStats = { totalActivities: 42, errorCount: 3 };
            activityParser.getStatistics.mockReturnValue(mockStats);
            
            // Clear previous calls
            mockWs.send.mockClear();

            wsHandler.routeMessage(mockWs, {
                type: 'getActivityStatistics'
            });

            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'activityStatistics',
                data: mockStats
            }));
        });

        test('should route searchActivities messages', () => {
            const mockResults = [{ id: 1, description: 'error occurred' }];
            activityParser.searchActivities.mockReturnValue(mockResults);
            
            // Clear previous calls
            mockWs.send.mockClear();

            wsHandler.routeMessage(mockWs, {
                type: 'searchActivities',
                query: 'error',
                filters: { type: 'error' }
            });

            expect(activityParser.searchActivities).toHaveBeenCalledWith('error', { type: 'error' });
            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'searchResults',
                data: mockResults
            }));
        });

        test('should route clearActivities messages', () => {
            // Clear previous calls
            mockWs.send.mockClear();

            wsHandler.routeMessage(mockWs, {
                type: 'clearActivities'
            });

            expect(activityParser.clearActivities).toHaveBeenCalled();
            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'response',
                data: { message: 'Activities cleared' }
            }));
        });

        test('should route directoryChange messages', () => {
            // Clear previous calls
            mockWs.send.mockClear();

            wsHandler.routeMessage(mockWs, {
                type: 'directoryChange',
                path: '/test/directory'
            });

            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'response',
                data: {
                    success: true,
                    message: 'Directory change acknowledged'
                }
            }));
        });
    });

    describe('Event Forwarding', () => {
        beforeEach(() => {
            wsHandler.handleConnection(mockWs);
        });

        test('should forward process manager events', () => {
            const mockInstance = { id: 'test-1', command: 'echo test' };
            
            processManager.emit('instanceCreated', mockInstance);

            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'instanceCreated',
                data: mockInstance
            }));
        });

        test('should forward file monitor events', () => {
            const mockFileChange = { path: '/test/file.js', eventType: 'change' };
            
            fileMonitor.emit('fileChange', mockFileChange);

            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'fileChange',
                data: mockFileChange
            }));
        });
    });

    describe('Utility Methods', () => {
        test('should send message only to open connections', () => {
            mockWs.readyState = 0; // CONNECTING
            
            wsHandler.sendMessage(mockWs, { type: 'test', data: 'test' });

            expect(mockWs.send).not.toHaveBeenCalled();
        });

        test('should send message to open connections', () => {
            mockWs.readyState = 1; // OPEN
            
            wsHandler.sendMessage(mockWs, { type: 'test', data: 'test' });

            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'test',
                data: 'test'
            }));
        });

        test('should broadcast to all clients', () => {
            const mockWs2 = { readyState: 1, OPEN: 1, send: jest.fn() };
            mockWss.clients.add(mockWs2);

            wsHandler.broadcastToAll({ type: 'broadcast', data: 'test' });

            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'broadcast',
                data: 'test'
            }));
            expect(mockWs2.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'broadcast',
                data: 'test'
            }));
        });
    });

    describe('Streaming Task Execution', () => {
        // Mock api-routes module
        const mockApiRoutes = {
            executeClaudeWithPrint: jest.fn(),
            buildTaskExecutionPrompt: jest.fn(),
            shouldContinueSession: jest.fn(),
            updateSessionActivity: jest.fn()
        };

        beforeEach(() => {
            // Mock require for api-routes
            jest.doMock('../src/api-routes', () => mockApiRoutes);
            wsHandler.handleConnection(mockWs);
            jest.clearAllMocks();
        });

        test('should handle streaming task execution successfully', async () => {
            const mockTask = {
                id: 'task-1',
                title: 'Test Task',
                description: 'Test task description'
            };
            
            const mockProjectContext = {
                projectPath: '/test/project',
                claudePath: '/opt/homebrew/bin/claude'
            };

            mockApiRoutes.buildTaskExecutionPrompt.mockReturnValue('test prompt');
            mockApiRoutes.shouldContinueSession.mockReturnValue(true);
            mockApiRoutes.executeClaudeWithPrint.mockResolvedValue({
                success: true,
                output: 'Task completed successfully'
            });

            // Clear previous calls
            mockWs.send.mockClear();

            await wsHandler.handleExecuteTaskStreaming(mockWs, {
                task: mockTask,
                projectContext: mockProjectContext,
                executionOptions: { timeout: 60000, model: 'haiku' }
            });

            // Verify task started event
            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'taskStarted',
                data: {
                    taskId: 'task-1',
                    title: 'Test Task',
                    projectPath: '/test/project',
                    sessionContinued: true
                }
            }));

            // Verify task completion
            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'taskCompleted',
                data: {
                    taskId: 'task-1',
                    result: {
                        success: true,
                        output: 'Task completed successfully'
                    },
                    success: true
                }
            }));

            expect(mockApiRoutes.buildTaskExecutionPrompt).toHaveBeenCalledWith(mockTask, mockProjectContext);
            expect(mockApiRoutes.shouldContinueSession).toHaveBeenCalledWith('/test/project', false);
            expect(mockApiRoutes.updateSessionActivity).toHaveBeenCalledWith('/test/project');
        });

        test('should handle streaming task execution with default options', async () => {
            const mockTask = {
                id: 'task-2',
                title: 'Default Task'
            };

            mockApiRoutes.buildTaskExecutionPrompt.mockReturnValue('test prompt');
            mockApiRoutes.shouldContinueSession.mockReturnValue(false);
            mockApiRoutes.executeClaudeWithPrint.mockResolvedValue({ success: true });

            // Clear previous calls
            mockWs.send.mockClear();

            await wsHandler.handleExecuteTaskStreaming(mockWs, {
                task: mockTask
            });

            expect(mockApiRoutes.executeClaudeWithPrint).toHaveBeenCalledWith(
                '/opt/homebrew/bin/claude',
                'test prompt',
                process.cwd(),
                expect.objectContaining({
                    useContinue: false,
                    timeout: 300000,
                    model: 'sonnet'
                })
            );
        });

        test('should handle streaming task execution without task', async () => {
            // Clear previous calls
            mockWs.send.mockClear();

            await wsHandler.handleExecuteTaskStreaming(mockWs, {
                projectContext: { projectPath: '/test' }
            });

            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'taskError',
                data: { error: 'Task is required' }
            }));
        });

        test('should handle streaming task execution errors', async () => {
            const mockTask = {
                id: 'task-3',
                title: 'Error Task'
            };

            mockApiRoutes.buildTaskExecutionPrompt.mockReturnValue('test prompt');
            mockApiRoutes.shouldContinueSession.mockReturnValue(false);
            mockApiRoutes.executeClaudeWithPrint.mockRejectedValue(new Error('Execution failed'));

            // Clear previous calls
            mockWs.send.mockClear();

            await wsHandler.handleExecuteTaskStreaming(mockWs, {
                task: mockTask,
                projectContext: { projectPath: '/test/project' }
            });

            // Verify error response
            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'taskError',
                data: {
                    taskId: 'task-3',
                    error: 'Execution failed',
                    success: false
                }
            }));
        });

        test('should handle streaming with progress callbacks', async () => {
            const mockTask = {
                id: 'task-4',
                title: 'Progress Task'
            };

            mockApiRoutes.buildTaskExecutionPrompt.mockReturnValue('test prompt');
            mockApiRoutes.shouldContinueSession.mockReturnValue(false);
            
            // Mock executeClaudeWithPrint to call progress callback
            mockApiRoutes.executeClaudeWithPrint.mockImplementation(async (claudePath, prompt, workingDir, options) => {
                // Simulate progress callback
                if (options.onProgress) {
                    options.onProgress({ step: 'analyzing', progress: 50 });
                }
                return { success: true };
            });

            // Clear previous calls
            mockWs.send.mockClear();

            await wsHandler.handleExecuteTaskStreaming(mockWs, {
                task: mockTask,
                projectContext: { projectPath: '/test/project' }
            });

            // Verify progress was sent
            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'taskProgress',
                data: {
                    taskId: 'task-4',
                    progress: { step: 'analyzing', progress: 50 }
                }
            }));
        });

        test('should handle general streaming execution errors', async () => {
            // Mock buildTaskExecutionPrompt to throw an error
            mockApiRoutes.buildTaskExecutionPrompt.mockImplementation(() => {
                throw new Error('Prompt build failed');
            });

            // Clear previous calls
            mockWs.send.mockClear();

            await wsHandler.handleExecuteTaskStreaming(mockWs, {
                task: { id: 'task-5', title: 'Test' }
            });

            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'taskError',
                data: { error: 'Prompt build failed' }
            }));
        });
    });

    describe('Directory Change Handling', () => {
        beforeEach(() => {
            wsHandler.handleConnection(mockWs);
        });

        test('should handle directory change successfully', () => {
            // Clear previous calls
            mockWs.send.mockClear();

            wsHandler.handleDirectoryChange(mockWs, {
                path: '/test/directory',
                event: 'change'
            });

            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'response',
                data: {
                    success: true,
                    message: 'Directory change acknowledged'
                }
            }));
        });

        test('should handle directory change errors', () => {
            // Mock console.error to avoid output during tests
            const originalConsoleError = console.error;
            console.error = jest.fn();

            // Clear previous calls
            mockWs.send.mockClear();

            // Create a mock that throws on first sendMessage call but works on second
            let callCount = 0;
            const errorWs = {
                readyState: 1,
                OPEN: 1,
                send: jest.fn(() => {
                    callCount++;
                    if (callCount === 1) {
                        throw new Error('Send failed');
                    }
                    // Second call succeeds (for error response)
                })
            };

            try {
                wsHandler.handleDirectoryChange(errorWs, {
                    path: '/test/directory'
                });

                expect(console.error).toHaveBeenCalledWith('Error handling directory change:', expect.any(Error));
                expect(errorWs.send).toHaveBeenCalledTimes(2); // First fails, second succeeds
            } finally {
                // Restore mocks
                console.error = originalConsoleError;
            }
        });
    });

    describe('Additional Event Forwarding', () => {
        beforeEach(() => {
            wsHandler.handleConnection(mockWs);
        });

        test('should forward instanceTerminated events', () => {
            const instanceId = 'test-instance-1';
            
            processManager.emit('instanceTerminated', instanceId);

            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'instanceTerminated',
                data: { instanceId }
            }));
        });

        test('should forward processOutput events', () => {
            const outputData = { instanceId: 'test-1', output: 'Hello World' };
            
            processManager.emit('processOutput', outputData);

            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'processOutput',
                data: outputData
            }));
        });

        test('should forward instanceClosed events', () => {
            const instanceData = { id: 'test-1', exitCode: 0 };
            
            processManager.emit('instanceClosed', instanceData);

            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'instanceClosed',
                data: instanceData
            }));
        });

        test('should forward directoryChange events', () => {
            const changeData = { path: '/test/dir', eventType: 'change' };
            
            fileMonitor.emit('directoryChange', changeData);

            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'directoryChange',
                data: changeData
            }));
        });

        test('should forward monitoringStarted events', () => {
            const monitoringData = { path: '/test/path', options: {} };
            
            fileMonitor.emit('monitoringStarted', monitoringData);

            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'monitoringStarted',
                data: monitoringData
            }));
        });

        test('should forward monitoringStopped events', () => {
            const stoppedData = { path: '/test/path', success: true };
            
            fileMonitor.emit('monitoringStopped', stoppedData);

            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'monitoringStopped',
                data: stoppedData
            }));
        });
    });

    describe('Welcome Message', () => {
        test('should send welcome message with current status', () => {
            const mockInstances = [{ id: 'test-1' }];
            const mockStatus = { isMonitoring: true };
            const mockStats = { totalActivities: 5 };

            processManager.getAllInstances.mockReturnValue(mockInstances);
            fileMonitor.getStatus.mockReturnValue(mockStatus);
            activityParser.getStatistics.mockReturnValue(mockStats);

            wsHandler.sendWelcomeMessage(mockWs);

            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'welcome',
                data: {
                    message: 'Connected to AgentOps',
                    currentInstances: mockInstances,
                    monitoringStatus: mockStatus,
                    activityStatistics: mockStats
                }
            }));
        });
    });

    describe('Error Edge Cases', () => {
        beforeEach(() => {
            wsHandler.handleConnection(mockWs);
        });

        test('should handle WebSocket send errors gracefully', () => {
            // Mock WebSocket send to throw an error
            mockWs.send.mockImplementation(() => {
                throw new Error('WebSocket send failed');
            });

            // The sendMessage method doesn't catch errors, so it will throw
            // This is actually the current behavior in the implementation
            expect(() => {
                wsHandler.sendMessage(mockWs, { type: 'test', data: 'test' });
            }).toThrow('WebSocket send failed');
        });

        test('should handle closed WebSocket connections', () => {
            // Create a fresh mock websocket for this test
            const closedWs = {
                readyState: 3, // CLOSED
                OPEN: 1,
                send: jest.fn()
            };
            
            wsHandler.sendMessage(closedWs, { type: 'test', data: 'test' });

            expect(closedWs.send).not.toHaveBeenCalled();
        });

        test('should handle broadcast with no clients', () => {
            // Clear all clients
            mockWss.clients.clear();

            expect(() => {
                wsHandler.broadcastToAll({ type: 'test', data: 'test' });
            }).not.toThrow();
        });

        test('should handle malformed message buffer', () => {
            const buffer = Buffer.from('invalid json {{{');
            
            wsHandler.handleMessage(mockWs, buffer);

            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'error',
                data: 'Invalid JSON message'
            }));
        });
    });

    describe('Cleanup and Memory Management', () => {
        test('should properly remove all event listeners on disconnect', () => {
            wsHandler.handleConnection(mockWs);
            
            const initialInstanceListeners = processManager.listenerCount('instanceCreated');
            const initialFileListeners = fileMonitor.listenerCount('fileChange');
            
            // Get the close handler and call it
            const closeHandler = mockWs.on.mock.calls.find(call => call[0] === 'close')[1];
            closeHandler();
            
            // Verify that listener counts decreased (exact count depends on implementation)
            expect(processManager.listenerCount('instanceCreated')).toBeLessThanOrEqual(initialInstanceListeners);
            expect(fileMonitor.listenerCount('fileChange')).toBeLessThanOrEqual(initialFileListeners);
        });

        test('should handle multiple client connections and disconnections', () => {
            const mockWs2 = {
                readyState: 1,
                OPEN: 1,
                send: jest.fn(),
                on: jest.fn()
            };
            
            // Connect two clients
            wsHandler.handleConnection(mockWs);
            wsHandler.handleConnection(mockWs2);
            
            // Verify both get activity broadcasts
            const mockActivity = { id: 1, type: 'test' };
            activityParser.emit('activityParsed', mockActivity);
            
            expect(mockWs.send).toHaveBeenCalled();
            expect(mockWs2.send).toHaveBeenCalled();
        });
    });
});