/**
 * AgentOps
 * API Routes Module
 * 
 * Copyright © 2025 Kari Pikkarainen. All rights reserved.
 * This software is proprietary and confidential.
 */

const processManager = require('./process-manager');
const fileMonitor = require('./file-monitor');
const activityParser = require('./activity-parser');

/**
 * Configure all API routes for the Express app
 * @param {Express} app - Express application instance
 */
function configureApiRoutes(app) {
    // Parse JSON middleware
    app.use(require('express').json());

    // Claude Code instance management routes
    app.get('/api/v1/claude-code/instances', getInstances);
    app.post('/api/v1/claude-code/instances', createInstance);
    app.delete('/api/v1/claude-code/instances/:id', terminateInstance);
    app.post('/api/v1/claude-code/instances/:id/input', sendInstanceInput);

    // File monitoring routes
    app.get('/api/v1/monitoring/status', getMonitoringStatus);
    app.post('/api/v1/monitoring/start', startMonitoring);
    app.post('/api/v1/monitoring/stop', stopMonitoring);

    // Activity management routes
    app.get('/api/v1/activities', getActivities);
    app.get('/api/v1/activities/statistics', getActivityStatistics);
    app.post('/api/v1/activities/search', searchActivities);
    app.delete('/api/v1/activities', clearActivities);
}

// Claude Code Instance Management Handlers
function getInstances(req, res) {
    try {
        const instances = processManager.getAllInstances();
        res.json(instances);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get instances', details: error.message });
    }
}

function createInstance(req, res) {
    try {
        const { command, options } = req.body;
        
        if (!command) {
            return res.status(400).json({ error: 'Command is required' });
        }
        
        const instance = processManager.spawnInstance(command, options);
        res.json(instance);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

function terminateInstance(req, res) {
    try {
        const success = processManager.terminateInstance(req.params.id);
        if (success) {
            res.json({ message: 'Instance terminated successfully' });
        } else {
            res.status(404).json({ error: 'Instance not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to terminate instance', details: error.message });
    }
}

function sendInstanceInput(req, res) {
    try {
        const { input } = req.body;
        
        if (!input) {
            return res.status(400).json({ error: 'Input is required' });
        }
        
        const success = processManager.sendInput(req.params.id, input);
        if (success) {
            res.json({ message: 'Input sent successfully' });
        } else {
            res.status(404).json({ error: 'Instance not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to send input', details: error.message });
    }
}

// File Monitoring Handlers
function getMonitoringStatus(req, res) {
    try {
        const status = fileMonitor.getStatus();
        res.json(status);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get monitoring status', details: error.message });
    }
}

function startMonitoring(req, res) {
    try {
        const { projectPath, options } = req.body;
        const pathToMonitor = projectPath || process.cwd();
        
        fileMonitor.startMonitoring(pathToMonitor, options);
        res.json({ message: 'File monitoring started', path: pathToMonitor });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

function stopMonitoring(req, res) {
    const { projectPath } = req.body;
    
    if (!projectPath) {
        return res.status(400).json({ error: 'Project path is required' });
    }
    
    fileMonitor.stopMonitoring(projectPath).then(success => {
        if (success) {
            res.json({ message: 'File monitoring stopped' });
        } else {
            res.status(404).json({ error: 'Path not being monitored' });
        }
    }).catch(error => {
        res.status(500).json({ error: 'Failed to stop monitoring', details: error.message });
    });
}

// Activity Management Handlers
function getActivities(req, res) {
    try {
        const { limit, type } = req.query;
        const activities = activityParser.getRecentActivities(
            limit ? parseInt(limit) : 50,
            type || null
        );
        res.json(activities);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get activities', details: error.message });
    }
}

function getActivityStatistics(req, res) {
    try {
        const statistics = activityParser.getStatistics();
        res.json(statistics);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get statistics', details: error.message });
    }
}

function searchActivities(req, res) {
    try {
        const { query, filters } = req.body;
        const results = activityParser.searchActivities(query, filters);
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: 'Failed to search activities', details: error.message });
    }
}

function clearActivities(req, res) {
    try {
        activityParser.clearActivities();
        res.json({ message: 'Activities cleared' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear activities', details: error.message });
    }
}

module.exports = {
    configureApiRoutes,
    // Export individual handlers for testing
    getInstances,
    createInstance,
    terminateInstance,
    sendInstanceInput,
    getMonitoringStatus,
    startMonitoring,
    stopMonitoring,
    getActivities,
    getActivityStatistics,
    searchActivities,
    clearActivities
};