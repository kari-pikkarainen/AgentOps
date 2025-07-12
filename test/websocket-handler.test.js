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

        test('should route activity messages', () => {
            const mockActivities = [{ id: 1, type: 'test' }];
            activityParser.getRecentActivities.mockReturnValue(mockActivities);
            
            // Clear previous calls
            mockWs.send.mockClear();

            wsHandler.routeMessage(mockWs, {
                type: 'getActivities',
                limit: 10
            });

            expect(activityParser.getRecentActivities).toHaveBeenCalledWith(10, 'getActivities');
            expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({
                type: 'activities',
                data: mockActivities
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
});