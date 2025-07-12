/**
 * AgentOps
 * WebSocket Handler Module
 * 
 * Copyright © 2025 Kari Pikkarainen. All rights reserved.
 * This software is proprietary and confidential.
 */

const processManager = require('./process-manager');
const fileMonitor = require('./file-monitor');
const activityParser = require('./activity-parser');

class WebSocketHandler {
    constructor(wss) {
        this.wss = wss;
        this.setupGlobalEventHandlers();
    }

    /**
     * Set up global event handlers that broadcast to all clients
     */
    setupGlobalEventHandlers() {
        // Forward parsed activities to all WebSocket clients
        activityParser.on('activityParsed', (activity) => {
            this.broadcastToAll({
                type: 'activityParsed',
                data: activity
            });
        });
    }

    /**
     * Handle new WebSocket connection
     * @param {WebSocket} ws - WebSocket connection
     */
    handleConnection(ws) {
        console.log('Client connected');

        // Set up event listeners for this specific client
        const eventListeners = this.setupClientEventListeners(ws);

        // Handle incoming messages
        ws.on('message', (message) => {
            this.handleMessage(ws, message);
        });

        // Handle client disconnect
        ws.on('close', () => {
            console.log('Client disconnected');
            this.removeClientEventListeners(eventListeners);
        });

        // Send welcome message
        this.sendWelcomeMessage(ws);
    }

    /**
     * Set up event listeners for a specific client
     * @param {WebSocket} ws - WebSocket connection
     * @returns {Object} Event listener functions for cleanup
     */
    setupClientEventListeners(ws) {
        const onInstanceCreated = (instance) => {
            this.sendMessage(ws, {
                type: 'instanceCreated',
                data: instance
            });
        };

        const onInstanceTerminated = (instanceId) => {
            this.sendMessage(ws, {
                type: 'instanceTerminated',
                data: { instanceId }
            });
        };

        const onProcessOutput = (output) => {
            this.sendMessage(ws, {
                type: 'processOutput',
                data: output
            });
        };

        const onInstanceClosed = (instance) => {
            this.sendMessage(ws, {
                type: 'instanceClosed',
                data: instance
            });
        };

        const onFileChange = (changeEvent) => {
            this.sendMessage(ws, {
                type: 'fileChange',
                data: changeEvent
            });
        };

        const onDirectoryChange = (changeEvent) => {
            this.sendMessage(ws, {
                type: 'directoryChange',
                data: changeEvent
            });
        };

        const onMonitoringStarted = (data) => {
            this.sendMessage(ws, {
                type: 'monitoringStarted',
                data
            });
        };

        const onMonitoringStopped = (data) => {
            this.sendMessage(ws, {
                type: 'monitoringStopped',
                data
            });
        };

        // Attach listeners
        processManager.on('instanceCreated', onInstanceCreated);
        processManager.on('instanceTerminated', onInstanceTerminated);
        processManager.on('processOutput', onProcessOutput);
        processManager.on('instanceClosed', onInstanceClosed);
        
        fileMonitor.on('fileChange', onFileChange);
        fileMonitor.on('directoryChange', onDirectoryChange);
        fileMonitor.on('monitoringStarted', onMonitoringStarted);
        fileMonitor.on('monitoringStopped', onMonitoringStopped);

        return {
            onInstanceCreated,
            onInstanceTerminated,
            onProcessOutput,
            onInstanceClosed,
            onFileChange,
            onDirectoryChange,
            onMonitoringStarted,
            onMonitoringStopped
        };
    }

    /**
     * Remove event listeners for a disconnected client
     * @param {Object} eventListeners - Event listener functions
     */
    removeClientEventListeners(eventListeners) {
        processManager.removeListener('instanceCreated', eventListeners.onInstanceCreated);
        processManager.removeListener('instanceTerminated', eventListeners.onInstanceTerminated);
        processManager.removeListener('processOutput', eventListeners.onProcessOutput);
        processManager.removeListener('instanceClosed', eventListeners.onInstanceClosed);
        
        fileMonitor.removeListener('fileChange', eventListeners.onFileChange);
        fileMonitor.removeListener('directoryChange', eventListeners.onDirectoryChange);
        fileMonitor.removeListener('monitoringStarted', eventListeners.onMonitoringStarted);
        fileMonitor.removeListener('monitoringStopped', eventListeners.onMonitoringStopped);
    }

    /**
     * Handle incoming WebSocket message
     * @param {WebSocket} ws - WebSocket connection
     * @param {String} message - Incoming message
     */
    handleMessage(ws, message) {
        try {
            const parsedMessage = JSON.parse(message.toString());
            this.routeMessage(ws, parsedMessage);
        } catch (error) {
            this.sendMessage(ws, {
                type: 'error',
                data: 'Invalid JSON message'
            });
        }
    }

    /**
     * Route parsed message to appropriate handler
     * @param {WebSocket} ws - WebSocket connection
     * @param {Object} parsedMessage - Parsed message object
     */
    routeMessage(ws, parsedMessage) {
        switch(parsedMessage.type) {
            case 'spawnInstance':
                this.handleSpawnInstance(ws, parsedMessage);
                break;
                
            case 'terminateInstance':
                this.handleTerminateInstance(ws, parsedMessage);
                break;
                
            case 'getInstances':
                this.handleGetInstances(ws);
                break;
                
            case 'startMonitoring':
                this.handleStartMonitoring(ws, parsedMessage);
                break;
                
            case 'stopMonitoring':
                this.handleStopMonitoring(ws, parsedMessage);
                break;
                
            case 'getMonitoringStatus':
                this.handleGetMonitoringStatus(ws);
                break;
                
            case 'getActivities':
                this.handleGetActivities(ws, parsedMessage);
                break;
                
            case 'getActivityStatistics':
                this.handleGetActivityStatistics(ws);
                break;
                
            case 'searchActivities':
                this.handleSearchActivities(ws, parsedMessage);
                break;
                
            case 'clearActivities':
                this.handleClearActivities(ws);
                break;
                
            default:
                this.sendMessage(ws, {
                    type: 'error',
                    data: 'Unknown message type'
                });
        }
    }

    // Message handlers
    handleSpawnInstance(ws, message) {
        try {
            const instance = processManager.spawnInstance(message.command, message.options);
            this.sendMessage(ws, {
                type: 'response',
                data: instance
            });
        } catch (error) {
            this.sendMessage(ws, {
                type: 'error',
                data: error.message
            });
        }
    }

    handleTerminateInstance(ws, message) {
        const success = processManager.terminateInstance(message.instanceId);
        this.sendMessage(ws, {
            type: 'response',
            data: { success }
        });
    }

    handleGetInstances(ws) {
        this.sendMessage(ws, {
            type: 'instances',
            data: processManager.getAllInstances()
        });
    }

    handleStartMonitoring(ws, message) {
        try {
            const pathToMonitor = message.projectPath || process.cwd();
            fileMonitor.startMonitoring(pathToMonitor, message.options);
            this.sendMessage(ws, {
                type: 'response',
                data: { message: 'File monitoring started', path: pathToMonitor }
            });
        } catch (error) {
            this.sendMessage(ws, {
                type: 'error',
                data: error.message
            });
        }
    }

    handleStopMonitoring(ws, message) {
        fileMonitor.stopMonitoring(message.projectPath).then(success => {
            this.sendMessage(ws, {
                type: 'response',
                data: { success }
            });
        });
    }

    handleGetMonitoringStatus(ws) {
        this.sendMessage(ws, {
            type: 'monitoringStatus',
            data: fileMonitor.getStatus()
        });
    }

    handleGetActivities(ws, message) {
        const activities = activityParser.getRecentActivities(
            message.limit || 50,
            message.type || null
        );
        this.sendMessage(ws, {
            type: 'activities',
            data: activities
        });
    }

    handleGetActivityStatistics(ws) {
        this.sendMessage(ws, {
            type: 'activityStatistics',
            data: activityParser.getStatistics()
        });
    }

    handleSearchActivities(ws, message) {
        const searchResults = activityParser.searchActivities(
            message.query,
            message.filters
        );
        this.sendMessage(ws, {
            type: 'searchResults',
            data: searchResults
        });
    }

    handleClearActivities(ws) {
        activityParser.clearActivities();
        this.sendMessage(ws, {
            type: 'response',
            data: { message: 'Activities cleared' }
        });
    }

    /**
     * Send welcome message to newly connected client
     * @param {WebSocket} ws - WebSocket connection
     */
    sendWelcomeMessage(ws) {
        this.sendMessage(ws, {
            type: 'welcome',
            data: {
                message: 'Connected to AgentOps',
                currentInstances: processManager.getAllInstances(),
                monitoringStatus: fileMonitor.getStatus(),
                activityStatistics: activityParser.getStatistics()
            }
        });
    }

    /**
     * Send message to specific client
     * @param {WebSocket} ws - WebSocket connection
     * @param {Object} data - Data to send
     */
    sendMessage(ws, data) {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(data));
        }
    }

    /**
     * Broadcast message to all connected clients
     * @param {Object} data - Data to broadcast
     */
    broadcastToAll(data) {
        this.wss.clients.forEach(client => {
            this.sendMessage(client, data);
        });
    }
}

module.exports = WebSocketHandler;