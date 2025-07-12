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
const fs = require('fs');
const path = require('path');

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

    // File system browsing routes
    app.get('/api/v1/filesystem/browse', browseFolders);
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

// File System Browsing Handlers
function browseFolders(req, res) {
    try {
        const { path: browsePath } = req.query;
        const targetPath = browsePath || process.env.HOME || '/';
        
        // Security check: prevent access to sensitive directories
        const normalizedPath = path.resolve(targetPath);
        
        if (!fs.existsSync(normalizedPath)) {
            return res.status(404).json({ error: 'Path does not exist' });
        }
        
        const stats = fs.statSync(normalizedPath);
        if (!stats.isDirectory()) {
            return res.status(400).json({ error: 'Path is not a directory' });
        }
        
        const items = [];
        
        // Add parent directory option (except for root)
        if (normalizedPath !== '/' && normalizedPath !== path.parse(normalizedPath).root) {
            items.push({
                name: '..',
                type: 'parent',
                path: path.dirname(normalizedPath),
                isDirectory: true
            });
        }
        
        // Read directory contents
        const files = fs.readdirSync(normalizedPath);
        
        for (const file of files) {
            try {
                // Skip hidden files for security
                if (file.startsWith('.')) continue;
                
                const filePath = path.join(normalizedPath, file);
                const fileStats = fs.statSync(filePath);
                
                if (fileStats.isDirectory()) {
                    items.push({
                        name: file,
                        type: 'folder',
                        path: filePath,
                        isDirectory: true
                    });
                }
            } catch (error) {
                // Skip files that can't be read (permission issues, etc.)
                continue;
            }
        }
        
        // Sort: parent first, then folders alphabetically
        items.sort((a, b) => {
            if (a.type === 'parent') return -1;
            if (b.type === 'parent') return 1;
            return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });
        
        res.json({
            currentPath: normalizedPath,
            items: items
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to browse folders', details: error.message });
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
    clearActivities,
    browseFolders
};