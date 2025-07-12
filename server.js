const express = require('express');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
const processManager = require('./src/process-manager');
const fileMonitor = require('./src/file-monitor');
const activityParser = require('./src/activity-parser');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Set up cross-component integration
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

// Forward parsed activities to WebSocket clients
activityParser.on('activityParsed', (activity) => {
    wss.clients.forEach(client => {
        if (client.readyState === client.OPEN) {
            client.send(JSON.stringify({
                type: 'activityParsed',
                data: activity
            }));
        }
    });
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Basic route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Routes for Claude Code instance management
app.use(express.json());

app.get('/api/v1/claude-code/instances', (req, res) => {
    res.json(processManager.getAllInstances());
});

app.post('/api/v1/claude-code/instances', (req, res) => {
    try {
        const { command, options } = req.body;
        const instance = processManager.spawnInstance(command, options);
        res.json(instance);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.delete('/api/v1/claude-code/instances/:id', (req, res) => {
    const success = processManager.terminateInstance(req.params.id);
    if (success) {
        res.json({ message: 'Instance terminated successfully' });
    } else {
        res.status(404).json({ error: 'Instance not found' });
    }
});

app.post('/api/v1/claude-code/instances/:id/input', (req, res) => {
    const { input } = req.body;
    const success = processManager.sendInput(req.params.id, input);
    if (success) {
        res.json({ message: 'Input sent successfully' });
    } else {
        res.status(404).json({ error: 'Instance not found' });
    }
});

// File monitoring API routes
app.get('/api/v1/monitoring/status', (req, res) => {
    res.json(fileMonitor.getStatus());
});

app.post('/api/v1/monitoring/start', (req, res) => {
    const { projectPath, options } = req.body;
    const pathToMonitor = projectPath || __dirname;
    
    try {
        fileMonitor.startMonitoring(pathToMonitor, options);
        res.json({ message: 'File monitoring started', path: pathToMonitor });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/v1/monitoring/stop', (req, res) => {
    const { projectPath } = req.body;
    
    fileMonitor.stopMonitoring(projectPath).then(success => {
        if (success) {
            res.json({ message: 'File monitoring stopped' });
        } else {
            res.status(404).json({ error: 'Path not being monitored' });
        }
    });
});

// Activities API routes
app.get('/api/v1/activities', (req, res) => {
    const { limit, type } = req.query;
    const activities = activityParser.getRecentActivities(
        limit ? parseInt(limit) : 50,
        type || null
    );
    res.json(activities);
});

app.get('/api/v1/activities/statistics', (req, res) => {
    res.json(activityParser.getStatistics());
});

app.post('/api/v1/activities/search', (req, res) => {
    const { query, filters } = req.body;
    const results = activityParser.searchActivities(query, filters);
    res.json(results);
});

app.delete('/api/v1/activities', (req, res) => {
    activityParser.clearActivities();
    res.json({ message: 'Activities cleared' });
});

// WebSocket connection for real-time updates
wss.on('connection', (ws) => {
    console.log('Client connected');
    
    // Set up process manager event listeners for this client
    const onInstanceCreated = (instance) => {
        ws.send(JSON.stringify({
            type: 'instanceCreated',
            data: instance
        }));
    };

    const onInstanceTerminated = (instanceId) => {
        ws.send(JSON.stringify({
            type: 'instanceTerminated',
            data: { instanceId }
        }));
    };

    const onProcessOutput = (output) => {
        ws.send(JSON.stringify({
            type: 'processOutput',
            data: output
        }));
    };

    const onInstanceClosed = (instance) => {
        ws.send(JSON.stringify({
            type: 'instanceClosed',
            data: instance
        }));
    };

    const onFileChange = (changeEvent) => {
        ws.send(JSON.stringify({
            type: 'fileChange',
            data: changeEvent
        }));
    };

    const onDirectoryChange = (changeEvent) => {
        ws.send(JSON.stringify({
            type: 'directoryChange',
            data: changeEvent
        }));
    };

    const onMonitoringStarted = (data) => {
        ws.send(JSON.stringify({
            type: 'monitoringStarted',
            data
        }));
    };

    const onMonitoringStopped = (data) => {
        ws.send(JSON.stringify({
            type: 'monitoringStopped',
            data
        }));
    };

    processManager.on('instanceCreated', onInstanceCreated);
    processManager.on('instanceTerminated', onInstanceTerminated);
    processManager.on('processOutput', onProcessOutput);
    processManager.on('instanceClosed', onInstanceClosed);
    
    fileMonitor.on('fileChange', onFileChange);
    fileMonitor.on('directoryChange', onDirectoryChange);
    fileMonitor.on('monitoringStarted', onMonitoringStarted);
    fileMonitor.on('monitoringStopped', onMonitoringStopped);
    
    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message.toString());
            
            switch(parsedMessage.type) {
                case 'spawnInstance':
                    try {
                        const instance = processManager.spawnInstance(parsedMessage.command, parsedMessage.options);
                        ws.send(JSON.stringify({
                            type: 'response',
                            data: instance
                        }));
                    } catch (error) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            data: error.message
                        }));
                    }
                    break;
                    
                case 'terminateInstance':
                    const success = processManager.terminateInstance(parsedMessage.instanceId);
                    ws.send(JSON.stringify({
                        type: 'response',
                        data: { success }
                    }));
                    break;
                    
                case 'getInstances':
                    ws.send(JSON.stringify({
                        type: 'instances',
                        data: processManager.getAllInstances()
                    }));
                    break;
                    
                case 'startMonitoring':
                    try {
                        const pathToMonitor = parsedMessage.projectPath || process.cwd();
                        fileMonitor.startMonitoring(pathToMonitor, parsedMessage.options);
                        ws.send(JSON.stringify({
                            type: 'response',
                            data: { message: 'File monitoring started', path: pathToMonitor }
                        }));
                    } catch (error) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            data: error.message
                        }));
                    }
                    break;
                    
                case 'stopMonitoring':
                    fileMonitor.stopMonitoring(parsedMessage.projectPath).then(success => {
                        ws.send(JSON.stringify({
                            type: 'response',
                            data: { success }
                        }));
                    });
                    break;
                    
                case 'getMonitoringStatus':
                    ws.send(JSON.stringify({
                        type: 'monitoringStatus',
                        data: fileMonitor.getStatus()
                    }));
                    break;
                    
                case 'getActivities':
                    const activities = activityParser.getRecentActivities(
                        parsedMessage.limit || 50,
                        parsedMessage.type || null
                    );
                    ws.send(JSON.stringify({
                        type: 'activities',
                        data: activities
                    }));
                    break;
                    
                case 'getActivityStatistics':
                    ws.send(JSON.stringify({
                        type: 'activityStatistics',
                        data: activityParser.getStatistics()
                    }));
                    break;
                    
                case 'searchActivities':
                    const searchResults = activityParser.searchActivities(
                        parsedMessage.query,
                        parsedMessage.filters
                    );
                    ws.send(JSON.stringify({
                        type: 'searchResults',
                        data: searchResults
                    }));
                    break;
                    
                case 'clearActivities':
                    activityParser.clearActivities();
                    ws.send(JSON.stringify({
                        type: 'response',
                        data: { message: 'Activities cleared' }
                    }));
                    break;
                    
                default:
                    ws.send(JSON.stringify({
                        type: 'error',
                        data: 'Unknown message type'
                    }));
            }
        } catch (error) {
            ws.send(JSON.stringify({
                type: 'error',
                data: 'Invalid JSON message'
            }));
        }
    });
    
    ws.on('close', () => {
        console.log('Client disconnected');
        // Remove event listeners to prevent memory leaks
        processManager.removeListener('instanceCreated', onInstanceCreated);
        processManager.removeListener('instanceTerminated', onInstanceTerminated);
        processManager.removeListener('processOutput', onProcessOutput);
        processManager.removeListener('instanceClosed', onInstanceClosed);
        
        fileMonitor.removeListener('fileChange', onFileChange);
        fileMonitor.removeListener('directoryChange', onDirectoryChange);
        fileMonitor.removeListener('monitoringStarted', onMonitoringStarted);
        fileMonitor.removeListener('monitoringStopped', onMonitoringStopped);
    });
    
    // Send welcome message with current status
    ws.send(JSON.stringify({
        type: 'welcome',
        data: {
            message: 'Connected to Claude Code Monitor',
            currentInstances: processManager.getAllInstances(),
            monitoringStatus: fileMonitor.getStatus(),
            activityStatistics: activityParser.getStatistics()
        }
    }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Claude Code Monitor running on http://localhost:${PORT}`);
    console.log('Press Ctrl+C to stop the server');
});