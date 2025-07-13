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
const { spawn } = require('child_process');

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

    // Claude Code status and detection routes
    app.get('/api/v1/claude-code/status', getClaudeCodeStatus);
    app.get('/api/v1/claude-code/detect', detectClaudeCode);
    app.post('/api/v1/claude-code/test', testClaudeCodeConnection);
    app.post('/api/v1/claude-code/generate-tasks', generateTasksWithClaudeCode);

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
    app.post('/api/v1/filesystem/analyze', analyzeProject);

    // Git operations routes
    app.post('/api/v1/git/commit', commitChangesToGit);
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

// Project Analysis Handler
function analyzeProject(req, res) {
    try {
        const { projectPath } = req.body;
        
        if (!projectPath) {
            return res.status(400).json({ error: 'Project path is required' });
        }
        
        const normalizedPath = path.resolve(projectPath);
        
        if (!fs.existsSync(normalizedPath)) {
            return res.status(404).json({ error: 'Project path does not exist' });
        }
        
        const stats = fs.statSync(normalizedPath);
        if (!stats.isDirectory()) {
            return res.status(400).json({ error: 'Project path must be a directory' });
        }
        
        // Analyze project structure
        const analysis = {
            projectName: path.basename(normalizedPath),
            projectPath: normalizedPath,
            type: 'Unknown',
            technologies: [],
            fileCount: 0,
            status: 'Ready for development'
        };
        
        try {
            // Count files and detect technologies
            const files = fs.readdirSync(normalizedPath);
            analysis.fileCount = countFiles(normalizedPath);
            
            // Detect project type and technologies
            if (files.includes('package.json')) {
                analysis.type = 'Node.js Project';
                analysis.technologies.push('JavaScript', 'Node.js');
                
                // Try to read package.json for more details
                try {
                    const packageJson = JSON.parse(fs.readFileSync(path.join(normalizedPath, 'package.json'), 'utf8'));
                    if (packageJson.name) {
                        analysis.projectName = packageJson.name;
                    }
                    
                    // Detect frameworks
                    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
                    if (dependencies.react) analysis.technologies.push('React');
                    if (dependencies.vue) analysis.technologies.push('Vue.js');
                    if (dependencies.angular) analysis.technologies.push('Angular');
                    if (dependencies.express) analysis.technologies.push('Express');
                    if (dependencies.typescript) analysis.technologies.push('TypeScript');
                    
                } catch (e) {
                    // Ignore package.json parsing errors
                }
            } else if (files.includes('requirements.txt') || files.includes('setup.py')) {
                analysis.type = 'Python Project';
                analysis.technologies.push('Python');
            } else if (files.includes('Cargo.toml')) {
                analysis.type = 'Rust Project';
                analysis.technologies.push('Rust');
            } else if (files.includes('go.mod')) {
                analysis.type = 'Go Project';
                analysis.technologies.push('Go');
            } else if (files.includes('pom.xml') || files.includes('build.gradle')) {
                analysis.type = 'Java Project';
                analysis.technologies.push('Java');
            } else if (files.some(f => f.endsWith('.html') || f.endsWith('.css') || f.endsWith('.js'))) {
                analysis.type = 'Web Project';
                analysis.technologies.push('HTML', 'CSS', 'JavaScript');
            }
            
            // Check for common files
            if (files.includes('README.md') || files.includes('README.txt')) {
                analysis.technologies.push('Documentation');
            }
            if (files.includes('.git')) {
                analysis.technologies.push('Git');
            }
            if (files.includes('Dockerfile')) {
                analysis.technologies.push('Docker');
            }
            
            // Determine project status
            if (analysis.fileCount === 0) {
                analysis.status = 'Empty project directory';
            } else if (analysis.fileCount < 5) {
                analysis.status = 'Early stage project';
            } else {
                analysis.status = 'Active project - ready for continued development';
            }
            
        } catch (analysisError) {
            console.error('Error during project analysis:', analysisError);
            analysis.status = 'Analysis completed with some limitations';
        }
        
        res.json(analysis);
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to analyze project', details: error.message });
    }
}

// Helper function to count files recursively
function countFiles(dirPath, maxDepth = 3, currentDepth = 0) {
    if (currentDepth >= maxDepth) return 0;
    
    try {
        const items = fs.readdirSync(dirPath);
        let count = 0;
        
        for (const item of items) {
            // Skip hidden files and common ignore patterns
            if (item.startsWith('.') || ['node_modules', 'dist', 'build', '__pycache__'].includes(item)) {
                continue;
            }
            
            const itemPath = path.join(dirPath, item);
            const stats = fs.statSync(itemPath);
            
            if (stats.isFile()) {
                count++;
            } else if (stats.isDirectory()) {
                count += countFiles(itemPath, maxDepth, currentDepth + 1);
            }
        }
        
        return count;
    } catch (error) {
        return 0;
    }
}

// Claude Code Status and Detection Handlers
function getClaudeCodeStatus(req, res) {
    try {
        const instances = processManager.getAllInstances();
        const claudeInstances = instances.filter(inst => 
            inst.command && inst.command.includes('claude')
        );

        // Try to detect Claude Code if not already detected
        const detectedPath = findClaudeCodeExecutable();
        
        res.json({
            available: detectedPath !== null,
            detectedPath: detectedPath,
            version: 'Unknown', // Will be determined by test connection
            activeInstances: claudeInstances.length,
            instances: claudeInstances.map(inst => ({
                id: inst.id,
                status: inst.status,
                pid: inst.process ? inst.process.pid : null
            }))
        });
    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to get Claude Code status', 
            details: error.message,
            available: false,
            activeInstances: 0
        });
    }
}

function detectClaudeCode(req, res) {
    try {
        const claudePath = findClaudeCodeExecutable();
        
        if (claudePath) {
            res.json({
                success: true,
                path: claudePath,
                message: 'Claude Code executable found'
            });
        } else {
            res.json({
                success: false,
                path: null,
                error: 'Claude Code executable not found in common locations'
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            path: null,
            error: 'Detection failed',
            details: error.message
        });
    }
}

function testClaudeCodeConnection(req, res) {
    try {
        const { path: claudePath, args = [] } = req.body;
        const executablePath = claudePath || findClaudeCodeExecutable();
        
        if (!executablePath) {
            return res.status(400).json({
                success: false,
                error: 'No Claude Code executable path provided or detected'
            });
        }

        // Test Claude Code with --version or --help flag
        const testProcess = spawn(executablePath, ['--version'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 5000
        });

        let output = '';
        let errorOutput = '';

        testProcess.stdout.on('data', (data) => {
            output += data.toString();
        });

        testProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        testProcess.on('close', (code) => {
            if (code === 0 || output.includes('claude') || output.includes('version')) {
                res.json({
                    success: true,
                    version: output.trim() || 'Available',
                    message: 'Claude Code connection successful',
                    output: output.trim()
                });
            } else {
                res.json({
                    success: false,
                    error: `Process exited with code ${code}`,
                    stderr: errorOutput.trim(),
                    stdout: output.trim()
                });
            }
        });

        testProcess.on('error', (error) => {
            res.json({
                success: false,
                error: 'Failed to execute Claude Code',
                details: error.message
            });
        });

        // Timeout handling
        setTimeout(() => {
            if (!testProcess.killed) {
                testProcess.kill();
                res.json({
                    success: false,
                    error: 'Connection test timed out after 5 seconds'
                });
            }
        }, 5000);

    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Connection test failed',
            details: error.message
        });
    }
}

// Helper function to find Claude Code executable in common locations
function findClaudeCodeExecutable() {
    const commonPaths = [
        '/usr/local/bin/claude',
        '/usr/bin/claude',
        '/opt/homebrew/bin/claude',
        process.env.HOME + '/.local/bin/claude',
        process.env.HOME + '/bin/claude'
    ];

    // Also check if 'claude' is in PATH
    try {
        const { execSync } = require('child_process');
        const whichResult = execSync('which claude', { encoding: 'utf8', stdio: 'pipe' });
        if (whichResult && whichResult.trim()) {
            return whichResult.trim();
        }
    } catch (e) {
        // 'which' command failed, continue with manual search
    }

    // Check common installation paths
    for (const claudePath of commonPaths) {
        try {
            if (fs.existsSync(claudePath)) {
                const stats = fs.statSync(claudePath);
                if (stats.isFile() && (stats.mode & parseInt('111', 8))) {
                    return claudePath;
                }
            }
        } catch (e) {
            continue;
        }
    }

    return null;
}

/**
 * Generate development tasks using Claude Code AI
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
async function generateTasksWithClaudeCode(req, res) {
    try {
        const { prompt, projectContext } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }
        
        // Check if Claude Code is available
        const claudePath = findClaudeCodeExecutable();
        if (!claudePath) {
            return res.status(503).json({ 
                error: 'Claude Code not found. Please install Claude Code CLI first.',
                fallback: true
            });
        }
        
        // Create a temporary Claude Code instance for task generation
        const instanceId = `task-gen-${Date.now()}`;
        const workingDir = projectContext?.projectPath || process.cwd();
        
        try {
            // Spawn Claude Code process
            const claudeProcess = spawn(claudePath, {
                cwd: workingDir,
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env }
            });
            
            let output = '';
            let errorOutput = '';
            
            // Collect output
            claudeProcess.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            claudeProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });
            
            // Send the task generation prompt
            claudeProcess.stdin.write(prompt + '\n');
            claudeProcess.stdin.end();
            
            // Wait for process to complete
            await new Promise((resolve, reject) => {
                claudeProcess.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`Claude Code exited with code ${code}: ${errorOutput}`));
                    }
                });
                
                claudeProcess.on('error', (error) => {
                    reject(error);
                });
                
                // Timeout after 30 seconds
                setTimeout(() => {
                    claudeProcess.kill();
                    reject(new Error('Claude Code task generation timed out'));
                }, 30000);
            });
            
            // Parse the AI response to extract JSON tasks
            const tasks = extractTasksFromAIResponse(output);
            
            res.json({
                success: true,
                tasks: tasks,
                projectContext: projectContext,
                generatedAt: new Date().toISOString()
            });
            
        } catch (processError) {
            console.error('Claude Code process error:', processError);
            res.status(500).json({
                error: 'Failed to generate tasks with Claude Code',
                details: processError.message,
                fallback: true
            });
        }
        
    } catch (error) {
        console.error('Task generation error:', error);
        res.status(500).json({
            error: 'Internal server error during task generation',
            details: error.message,
            fallback: true
        });
    }
}

/**
 * Extract JSON tasks from AI response text
 * @param {string} aiOutput - Raw output from Claude Code
 * @returns {Array} Parsed tasks array
 */
function extractTasksFromAIResponse(aiOutput) {
    try {
        // Look for JSON array in the output
        const jsonMatch = aiOutput.match(/\[\s*{[\s\S]*}\s*\]/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        
        // Fallback: try to parse the entire output as JSON
        const cleaned = aiOutput.trim();
        if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
            return JSON.parse(cleaned);
        }
        
        // If no valid JSON found, return empty array
        console.warn('No valid JSON tasks found in AI output:', aiOutput);
        return [];
        
    } catch (parseError) {
        console.error('Failed to parse AI task response:', parseError);
        return [];
    }
}

/**
 * Commit changes to git repository
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
function commitChangesToGit(req, res) {
    try {
        const { message, projectPath } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Commit message is required' });
        }
        
        const workingDir = projectPath || process.cwd();
        
        // Check if directory is a git repository
        if (!fs.existsSync(path.join(workingDir, '.git'))) {
            return res.status(400).json({ error: 'Directory is not a git repository' });
        }
        
        // Execute git add and commit
        const { execSync } = require('child_process');
        
        try {
            // Add all changes
            execSync('git add .', { cwd: workingDir, stdio: 'pipe' });
            
            // Commit with provided message
            const commitOutput = execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
                cwd: workingDir,
                stdio: 'pipe',
                encoding: 'utf8'
            });
            
            // Get latest commit info
            const commitHash = execSync('git rev-parse HEAD', {
                cwd: workingDir,
                stdio: 'pipe',
                encoding: 'utf8'
            }).trim();
            
            res.json({
                success: true,
                message: 'Changes committed successfully',
                commitHash: commitHash.substring(0, 7),
                commitMessage: message,
                output: commitOutput.trim()
            });
            
        } catch (gitError) {
            // Handle case where there are no changes to commit
            if (gitError.message.includes('nothing to commit')) {
                res.json({
                    success: true,
                    message: 'No changes to commit',
                    noChanges: true
                });
            } else {
                res.status(500).json({
                    error: 'Git commit failed',
                    details: gitError.message
                });
            }
        }
        
    } catch (error) {
        res.status(500).json({
            error: 'Failed to commit changes',
            details: error.message
        });
    }
}

module.exports = {
    configureApiRoutes,
    // Export individual handlers for testing
    getInstances,
    createInstance,
    generateTasksWithClaudeCode,
    terminateInstance,
    sendInstanceInput,
    getClaudeCodeStatus,
    detectClaudeCode,
    testClaudeCodeConnection,
    getMonitoringStatus,
    startMonitoring,
    stopMonitoring,
    getActivities,
    getActivityStatistics,
    searchActivities,
    clearActivities,
    browseFolders,
    analyzeProject,
    commitChangesToGit
};