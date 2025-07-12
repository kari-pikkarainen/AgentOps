/**
 * AgentOps
 * Main Server Application
 * 
 * Copyright © 2025 Kari Pikkarainen. All rights reserved.
 * This software is proprietary and confidential.
 */

const express = require('express');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
const { configureApiRoutes } = require('./src/api-routes');
const WebSocketHandler = require('./src/websocket-handler');
const processManager = require('./src/process-manager');
const fileMonitor = require('./src/file-monitor');
const activityParser = require('./src/activity-parser');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Set up cross-component integration
function setupCrossComponentIntegration() {
    processManager.on('processOutput', (output) => {
        // Parse process output as activity
        activityParser.parseActivity('process_output', output.data, {
            instanceId: output.instanceId,
            outputType: output.type
        });
    });

    fileMonitor.on('fileChange', (changeEvent) => {
        // Parse file changes as activities
        const summary = `${changeEvent.eventType}: ${changeEvent.fileName}`;
        activityParser.parseActivity('file_change', summary, {
            path: changeEvent.path,
            fileType: changeEvent.fileExtension,
            eventType: changeEvent.eventType
        });
    });
}

// Initialize cross-component integration
setupCrossComponentIntegration();

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Basic route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Configure API routes
configureApiRoutes(app);

// Initialize WebSocket handler
const wsHandler = new WebSocketHandler(wss);

// WebSocket connection handling
wss.on('connection', (ws) => {
    wsHandler.handleConnection(ws);
});

// Export for testing
function createServer() {
    return { app, server, wss, wsHandler };
}

// Start server only if this file is run directly (not required as module)
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`AgentOps running on http://localhost:${PORT}`);
        console.log('Press Ctrl+C to stop the server');
    });
}

// Export for testing
module.exports = { 
    createServer, 
    setupCrossComponentIntegration,
    app,
    server,
    wss
};