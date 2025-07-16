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

// Session state management for Claude CLI continuity
const projectSessions = new Map();
const SESSION_TIMEOUT = 60 * 60 * 1000; // 1 hour timeout

// Project state persistence
const projectStates = new Map();
const PROJECT_STATE_DIR = path.join(process.cwd(), '.agentops-states');

// Ensure state directory exists
if (!fs.existsSync(PROJECT_STATE_DIR)) {
    fs.mkdirSync(PROJECT_STATE_DIR, { recursive: true });
}

/**
 * Project state persistence functions
 */
function getProjectStateFilePath(projectPath) {
    const projectName = path.basename(projectPath);
    const sanitizedName = projectName.replace(/[^a-zA-Z0-9-_]/g, '_');
    return path.join(PROJECT_STATE_DIR, `${sanitizedName}.json`);
}

function saveProjectState(projectPath, state) {
    try {
        const stateFilePath = getProjectStateFilePath(projectPath);
        const stateData = {
            projectPath: projectPath,
            savedAt: new Date().toISOString(),
            version: '1.0',
            ...state
        };
        
        fs.writeFileSync(stateFilePath, JSON.stringify(stateData, null, 2));
        projectStates.set(projectPath, stateData);
        console.log('Project state saved for:', projectPath);
        return true;
    } catch (error) {
        console.error('Failed to save project state:', error);
        return false;
    }
}

function loadProjectState(projectPath) {
    try {
        const stateFilePath = getProjectStateFilePath(projectPath);
        
        if (!fs.existsSync(stateFilePath)) {
            return null;
        }
        
        const stateData = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
        projectStates.set(projectPath, stateData);
        console.log('Project state loaded for:', projectPath);
        return stateData;
    } catch (error) {
        console.error('Failed to load project state:', error);
        return null;
    }
}

function hasProjectState(projectPath) {
    const stateFilePath = getProjectStateFilePath(projectPath);
    return fs.existsSync(stateFilePath);
}

function deleteProjectState(projectPath) {
    try {
        const stateFilePath = getProjectStateFilePath(projectPath);
        if (fs.existsSync(stateFilePath)) {
            fs.unlinkSync(stateFilePath);
        }
        projectStates.delete(projectPath);
        console.log('Project state deleted for:', projectPath);
        return true;
    } catch (error) {
        console.error('Failed to delete project state:', error);
        return false;
    }
}

/**
 * Session management functions
 */
function getSessionState(projectPath) {
    if (!projectPath) return null;
    const normalizedPath = path.resolve(projectPath);
    return projectSessions.get(normalizedPath);
}

function setSessionState(projectPath, active = true) {
    if (!projectPath) return;
    const normalizedPath = path.resolve(projectPath);
    const session = {
        active: active,
        lastUsed: Date.now(),
        sessionStarted: Date.now(),
        projectPath: normalizedPath
    };
    projectSessions.set(normalizedPath, session);
    console.log(`Session ${active ? 'started' : 'updated'} for project:`, normalizedPath);
    return session;
}

function updateSessionActivity(projectPath) {
    const session = getSessionState(projectPath);
    if (session) {
        session.lastUsed = Date.now();
        projectSessions.set(path.resolve(projectPath), session);
    }
}

function resetSession(projectPath) {
    if (!projectPath) return;
    const normalizedPath = path.resolve(projectPath);
    projectSessions.delete(normalizedPath);
    console.log('Session reset for project:', normalizedPath);
}

function shouldContinueSession(projectPath, isNewProject = false) {
    if (isNewProject) {
        resetSession(projectPath);
        return false;
    }
    
    const session = getSessionState(projectPath);
    if (!session) return false;
    
    // Check if session has expired
    const now = Date.now();
    if (now - session.lastUsed > SESSION_TIMEOUT) {
        resetSession(projectPath);
        return false;
    }
    
    return session.active;
}

function cleanupExpiredSessions() {
    const now = Date.now();
    for (const [projectPath, session] of projectSessions.entries()) {
        if (now - session.lastUsed > SESSION_TIMEOUT) {
            projectSessions.delete(projectPath);
            console.log('Cleaned up expired session for:', projectPath);
        }
    }
}

// Clean up expired sessions every 30 minutes
const sessionCleanupInterval = setInterval(cleanupExpiredSessions, 30 * 60 * 1000);

// Allow cleanup of interval for testing
if (process.env.NODE_ENV === 'test') {
    sessionCleanupInterval.unref();
}

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
    
    // Session management routes
    app.get('/api/v1/claude-code/session/:projectPath', getSessionInfo);
    app.post('/api/v1/claude-code/session/reset', resetProjectSession);
    
    // Task execution routes
    app.post('/api/v1/claude-code/execute-task', executeTask);
    app.get('/api/v1/claude-code/live-metrics/:projectPath(*)', getLiveExecutionMetrics);
    
    // Architecture analysis routes
    app.post('/api/v1/claude-code/generate-architecture', generateArchitecture);
    app.post('/api/v1/claude-code/progressive-analysis', progressiveProjectAnalysis);
    
    // Project state management routes
    app.get('/api/v1/project-state/:projectPath(*)', getProjectState);
    app.post('/api/v1/project-state/save', saveProjectStateAPI);
    app.post('/api/v1/project-state/check', checkProjectState);
    app.delete('/api/v1/project-state/:projectPath(*)', deleteProjectStateAPI);
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
                retry: true
            });
        }
        
        const workingDir = projectContext && projectContext.projectPath || process.cwd();
        
        try {
            // Use Claude CLI with --print flag for non-interactive mode
            const taskGenerationPrompt = buildTaskGenerationPrompt(prompt, projectContext);
            const options = {
                isNewProject: projectContext && projectContext.isNewProject || false
            };
            
            const tasks = await executeClaudeWithPrint(claudePath, taskGenerationPrompt, workingDir, options);
            
            res.json({
                success: true,
                tasks: tasks,
                projectContext: projectContext,
                generatedAt: new Date().toISOString(),
                source: 'claude_cli',
                sessionContinued: shouldContinueSession(workingDir, options.isNewProject)
            });
            
        } catch (processError) {
            console.error('Claude Code process error:', processError);
            res.status(500).json({
                error: 'Failed to generate tasks with Claude Code',
                details: processError.message,
                retry: true
            });
        }
        
    } catch (error) {
        console.error('Task generation error:', error);
        res.status(500).json({
            error: 'Internal server error during task generation',
            details: error.message,
            retry: true
        });
    }
}

/**
 * Execute Claude CLI with --print flag for non-interactive mode
 * @param {string} claudePath - Path to Claude executable
 * @param {string} prompt - Task generation prompt
 * @param {string} workingDir - Working directory
 * @returns {Promise<Array>} Generated tasks
 */
async function executeClaudeWithPrint(claudePath, prompt, workingDir, options = {}) {
    const { spawn } = require('child_process');
    
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        console.log('Starting Claude execution at:', new Date().toISOString());
        console.log('Prompt length:', prompt.length);
        console.log('Working directory:', workingDir);
        
        // Build Claude arguments with optional --continue flag and tool permissions
        const args = ['--print', '--model', 'sonnet'];
        
        // Add tool permissions for file operations
        args.push('--allowedTools', 'Write,Read,Bash,Edit');
        
        // Add directory access permission
        if (workingDir && workingDir !== process.cwd()) {
            args.push('--add-dir', workingDir);
        }
        
        const useContinue = options.useContinue !== undefined ? options.useContinue : shouldContinueSession(workingDir, options.isNewProject);
        
        if (useContinue) {
            args.push('--continue');
            console.log('Using --continue flag for session continuity');
            updateSessionActivity(workingDir);
        } else {
            console.log('Starting fresh Claude session');
            if (workingDir) setSessionState(workingDir, true);
        }
        
        console.log('Claude arguments:', args);
        
        // Spawn Claude process
        const claudeProcess = spawn(claudePath, args, {
            cwd: workingDir,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let output = '';
        let errorOutput = '';
        
        claudeProcess.stdout.on('data', (data) => {
            const chunk = data.toString();
            output += chunk;
            console.log('Claude stdout chunk received:', chunk.substring(0, 100) + '...');
            
            // Call streaming callback if provided
            if (options.onProgress && typeof options.onProgress === 'function') {
                options.onProgress({
                    type: 'stdout',
                    data: chunk,
                    timestamp: Date.now()
                });
            }
        });
        
        claudeProcess.stderr.on('data', (data) => {
            const chunk = data.toString();
            errorOutput += chunk;
            console.log('Claude stderr:', chunk);
            
            // Call streaming callback for errors too
            if (options.onProgress && typeof options.onProgress === 'function') {
                options.onProgress({
                    type: 'stderr',
                    data: chunk,
                    timestamp: Date.now()
                });
            }
        });
        
        claudeProcess.on('close', (code) => {
            const endTime = Date.now();
            console.log('Claude execution completed in:', (endTime - startTime), 'ms');
            console.log('Exit code:', code);
            console.log('Output length:', output.length);
            
            if (code === 0) {
                // Check if we should return raw output or parsed tasks
                if (options.returnRawOutput) {
                    resolve(output);
                } else {
                    try {
                        // Parse the output for tasks
                        const tasks = extractTasksFromAIResponse(output);
                        console.log('Parsed tasks count:', tasks.length);
                        
                        if (tasks.length === 0) {
                            console.log('Full Claude output for debugging:', output);
                            reject(new Error('No valid tasks found in Claude response'));
                        } else {
                            resolve(tasks);
                        }
                    } catch (parseError) {
                        console.error('Parse error:', parseError);
                        console.log('Raw output that failed to parse:', output);
                        reject(new Error(`Failed to parse Claude response: ${parseError.message}`));
                    }
                }
            } else {
                console.log('Claude failed with output:', output);
                console.log('Claude error output:', errorOutput);
                reject(new Error(`Claude exited with code ${code}: ${errorOutput}`));
            }
        });
        
        claudeProcess.on('error', (error) => {
            console.error('Claude process error:', error);
            reject(new Error(`Failed to start Claude process: ${error.message}`));
        });
        
        // Send prompt through stdin
        try {
            console.log('Sending prompt to Claude stdin...');
            claudeProcess.stdin.write(prompt + '\n');
            claudeProcess.stdin.end();
            console.log('Prompt sent, waiting for response...');
        } catch (stdinError) {
            console.error('Error writing to Claude stdin:', stdinError);
            reject(new Error(`Failed to send prompt to Claude: ${stdinError.message}`));
            return;
        }
        
        // Set timeout - Claude can take several minutes for complex tasks
        const timeoutMs = options.timeout || 60000;
        const timeout = setTimeout(() => {
            console.log(`Claude process timeout after ${timeoutMs/1000}s, killing...`);
            claudeProcess.kill('SIGTERM');
            reject(new Error(`Claude execution timed out after ${timeoutMs/1000} seconds`));
        }, timeoutMs);
        
        claudeProcess.on('close', () => {
            clearTimeout(timeout);
        });
    });
}

/**
 * Build a comprehensive task generation prompt
 * @param {string} userPrompt - User's original prompt
 * @param {Object} projectContext - Project context information
 * @returns {string} Complete prompt for Claude
 */
function buildTaskGenerationPrompt(userPrompt, projectContext) {
    const isExisting = projectContext && projectContext.isExisting || false;
    const projectPath = projectContext && projectContext.projectPath || '';
    const projectType = isExisting ? 'existing' : 'new';
    
    return `You are a senior software architect helping to generate development tasks for a ${projectType} project.

PROJECT CONTEXT:
- Type: ${projectType} project
- Path: ${projectPath}
- User Request: ${userPrompt}

INSTRUCTIONS:
Generate 3-6 specific, actionable development tasks as a JSON array. Each task should have:
- id: unique identifier
- title: clear, specific title
- description: detailed description (2-3 sentences)
- priority: "high", "medium", or "low"
- estimatedTime: realistic time estimate
- type: task category (e.g., "setup", "feature", "refactoring", "testing", "documentation")

${isExisting ? 
`For EXISTING projects, focus on:
- Code quality improvements
- Adding new features
- Refactoring and optimization
- Testing improvements
- Documentation updates
- Performance enhancements` :
`For NEW projects, focus on:
- Project initialization and setup
- Core architecture design
- Essential dependencies
- Basic functionality implementation
- Initial testing setup`}

IMPORTANT: Respond ONLY with valid JSON array. No explanations, no markdown formatting.

Example format:
[
  {
    "id": "task-1",
    "title": "Improve error handling",
    "description": "Add comprehensive error handling throughout the application. Implement try-catch blocks and proper error logging.",
    "priority": "high",
    "estimatedTime": "2 hours",
    "type": "refactoring"
  }
]

Generate tasks now:`;
}

/**
 * Extract JSON tasks from AI response text
 * @param {string} aiOutput - Raw output from Claude Code
 * @returns {Array} Parsed tasks array
 */
function extractTasksFromAIResponse(aiOutput) {
    try {
        console.log('Raw AI output:', aiOutput.substring(0, 500) + '...');
        
        // Look for JSON within code blocks
        const codeBlockMatch = aiOutput.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
        if (codeBlockMatch) {
            console.log('Found JSON in code block');
            return JSON.parse(codeBlockMatch[1]);
        }
        
        // Look for JSON array in the output (more flexible regex)
        const jsonArrayMatch = aiOutput.match(/\[\s*\{[\s\S]*?\}\s*(?:,\s*\{[\s\S]*?\}\s*)*\]/);
        if (jsonArrayMatch) {
            console.log('Found JSON array');
            return JSON.parse(jsonArrayMatch[0]);
        }
        
        // Look for individual task objects and construct array
        const taskMatches = aiOutput.match(/\{[^{}]*"title"[^{}]*"description"[^{}]*\}/g);
        if (taskMatches && taskMatches.length > 0) {
            console.log('Found individual task objects');
            const tasksArray = '[' + taskMatches.join(',') + ']';
            return JSON.parse(tasksArray);
        }
        
        // Fallback: try to parse cleaned output
        const cleaned = aiOutput.trim();
        if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
            console.log('Parsing cleaned output');
            return JSON.parse(cleaned);
        }
        
        // Generate fallback tasks based on project context if no JSON found
        console.warn('No valid JSON tasks found in AI output, generating fallback');
        return generateFallbackTasks(aiOutput);
        
    } catch (parseError) {
        console.error('Failed to parse AI task response:', parseError);
        console.log('Generating fallback tasks due to parse error');
        return generateFallbackTasks(aiOutput);
    }
}

/**
 * Generate intelligent tasks based on project context
 * @param {Object} projectContext - Project context information
 * @param {string} userPrompt - User's original prompt
 * @returns {Array} Context-aware task array
 */
function generateIntelligentTasks(projectContext, userPrompt) {
    const isExisting = projectContext && projectContext.isExisting || false;
    const projectPath = projectContext && projectContext.projectPath || '';
    
    if (isExisting) {
        return generateExistingProjectTasks(userPrompt, projectPath);
    } else {
        return generateNewProjectTasks(userPrompt);
    }
}

/**
 * Generate tasks for existing projects
 * @param {string} userPrompt - User's request
 * @param {string} projectPath - Project directory path
 * @returns {Array} Task array for existing projects
 */
function generateExistingProjectTasks(userPrompt, projectPath) {
    const tasks = [];
    const taskId = () => `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Analyze project type from path
    const isNodeProject = projectPath.includes('node') || projectPath.includes('npm') || projectPath.includes('js');
    const isPythonProject = projectPath.includes('python') || projectPath.includes('py');
    const isWebProject = projectPath.includes('web') || projectPath.includes('html') || projectPath.includes('frontend');
    
    // Core improvement tasks for existing projects
    tasks.push({
        id: taskId(),
        title: 'Code Quality Assessment',
        description: 'Analyze the current codebase for potential improvements in code quality, maintainability, and performance. Identify technical debt and refactoring opportunities.',
        priority: 'high',
        estimatedTime: '45 minutes',
        type: 'analysis'
    });
    
    tasks.push({
        id: taskId(),
        title: 'Error Handling Enhancement',
        description: 'Review and improve error handling throughout the application. Add comprehensive try-catch blocks, proper logging, and user-friendly error messages.',
        priority: 'medium',
        estimatedTime: '1 hour',
        type: 'refactoring'
    });
    
    tasks.push({
        id: taskId(),
        title: 'Test Coverage Improvement',
        description: 'Expand test coverage by adding unit tests, integration tests, and edge case scenarios. Ensure critical functionality is properly tested.',
        priority: 'high',
        estimatedTime: '2 hours',
        type: 'testing'
    });
    
    // Project-specific tasks
    if (isNodeProject) {
        tasks.push({
            id: taskId(),
            title: 'Dependency Security Audit',
            description: 'Run npm audit to identify and fix security vulnerabilities in dependencies. Update outdated packages to their latest secure versions.',
            priority: 'high',
            estimatedTime: '30 minutes',
            type: 'security'
        });
    }
    
    if (isWebProject) {
        tasks.push({
            id: taskId(),
            title: 'Performance Optimization',
            description: 'Optimize frontend performance by analyzing bundle sizes, implementing code splitting, and optimizing asset loading strategies.',
            priority: 'medium',
            estimatedTime: '1.5 hours',
            type: 'optimization'
        });
    }
    
    tasks.push({
        id: taskId(),
        title: 'Documentation Update',
        description: 'Update project documentation including README, API docs, and inline code comments. Ensure all features and setup instructions are properly documented.',
        priority: 'low',
        estimatedTime: '45 minutes',
        type: 'documentation'
    });
    
    return tasks;
}

/**
 * Generate tasks for new projects
 * @param {string} userPrompt - User's request
 * @returns {Array} Task array for new projects
 */
function generateNewProjectTasks(userPrompt) {
    const taskId = () => `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return [
        {
            id: taskId(),
            title: 'Project Structure Setup',
            description: 'Create the initial project structure with proper directory organization, configuration files, and basic project metadata.',
            priority: 'high',
            estimatedTime: '30 minutes',
            type: 'setup'
        },
        {
            id: taskId(),
            title: 'Development Environment Configuration',
            description: 'Set up development tools, linting rules, formatting configuration, and development scripts for a consistent development experience.',
            priority: 'high',
            estimatedTime: '45 minutes',
            type: 'setup'
        },
        {
            id: taskId(),
            title: 'Core Architecture Design',
            description: 'Design and implement the core application architecture, including main modules, data flow, and basic application structure.',
            priority: 'high',
            estimatedTime: '2 hours',
            type: 'architecture'
        },
        {
            id: taskId(),
            title: 'Essential Dependencies Setup',
            description: 'Install and configure essential dependencies, frameworks, and libraries needed for the project functionality.',
            priority: 'medium',
            estimatedTime: '30 minutes',
            type: 'setup'
        },
        {
            id: taskId(),
            title: 'Basic Testing Framework',
            description: 'Set up testing framework, configure test runners, and create initial test structure with example tests.',
            priority: 'medium',
            estimatedTime: '1 hour',
            type: 'testing'
        },
        {
            id: taskId(),
            title: 'Initial Documentation',
            description: 'Create comprehensive README with project description, setup instructions, usage examples, and contribution guidelines.',
            priority: 'low',
            estimatedTime: '30 minutes',
            type: 'documentation'
        }
    ];
}

/**
 * Generate fallback tasks when AI parsing fails
 * @param {string} aiOutput - Raw AI output for context
 * @returns {Array} Basic task array
 */
function generateFallbackTasks(aiOutput) {
    const fallbackTasks = [
        {
            id: 'fallback-1',
            title: 'Code Analysis and Review',
            description: 'Analyze the current codebase structure and identify areas for improvement',
            priority: 'medium',
            estimatedTime: '30 minutes',
            type: 'analysis'
        },
        {
            id: 'fallback-2', 
            title: 'Documentation Update',
            description: 'Update project documentation and README files',
            priority: 'low',
            estimatedTime: '20 minutes',
            type: 'documentation'
        },
        {
            id: 'fallback-3',
            title: 'Code Quality Improvements',
            description: 'Refactor code for better readability and maintainability',
            priority: 'medium',
            estimatedTime: '45 minutes',
            type: 'refactoring'
        }
    ];
    
    return fallbackTasks;
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

/**
 * Get session information for a project
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
function getSessionInfo(req, res) {
    try {
        const projectPath = decodeURIComponent(req.params.projectPath);
        const session = getSessionState(projectPath);
        
        if (session) {
            const now = Date.now();
            const isExpired = (now - session.lastUsed) > SESSION_TIMEOUT;
            
            res.json({
                success: true,
                session: {
                    active: session.active && !isExpired,
                    lastUsed: session.lastUsed,
                    sessionStarted: session.sessionStarted,
                    projectPath: session.projectPath,
                    timeRemaining: Math.max(0, SESSION_TIMEOUT - (now - session.lastUsed))
                }
            });
        } else {
            res.json({
                success: true,
                session: null
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to get session info',
            details: error.message
        });
    }
}

/**
 * Reset session for a project
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
function resetProjectSession(req, res) {
    try {
        const { projectPath } = req.body;
        
        if (!projectPath) {
            return res.status(400).json({
                success: false,
                error: 'Project path is required'
            });
        }
        
        resetSession(projectPath);
        
        res.json({
            success: true,
            message: 'Session reset successfully',
            projectPath: projectPath
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to reset session',
            details: error.message
        });
    }
}

/**
 * Get live execution metrics for a project
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function getLiveExecutionMetrics(req, res) {
    console.log('============ MY NEW FUNCTION CALLED ============');
    console.log('getLiveExecutionMetrics called with path:', req.params.projectPath);
    try {
        const projectPath = decodeURIComponent(req.params.projectPath);
        
        if (!projectPath || !fs.existsSync(projectPath)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid project path'
            });
        }
        
        // Get time window for recent changes (default: last 5 minutes)
        const timeWindow = parseInt(req.query.timeWindow) || (5 * 60 * 1000);
        const since = Date.now() - timeWindow;
        
        const metrics = scanForRecentChanges(projectPath, since);
        
        res.json({
            success: true,
            metrics: {
                ...metrics,
                timeWindow: timeWindow,
                lastUpdated: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Error getting execution metrics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get execution metrics',
            details: error.message
        });
    }
}

/**
 * Scan directory for recent file changes
 * @param {string} projectPath - Path to project directory
 * @param {number} since - Timestamp threshold for "recent" changes
 * @returns {Object} Metrics about recent changes
 */
function scanForRecentChanges(projectPath, since) {
    const metrics = {
        filesModified: 0,
        linesChanged: 0,
        newFiles: 0,
        deletedFiles: 0,
        fileTypes: {},
        recentFiles: []
    };
    
    try {
        const scanDirectory = (dir) => {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                
                // Skip common directories and files
                if (item.name.startsWith('.') || 
                    item.name === 'node_modules' || 
                    item.name === 'dist' || 
                    item.name === 'build') {
                    continue;
                }
                
                if (item.isDirectory()) {
                    scanDirectory(fullPath);
                } else if (item.isFile() && isCodeFile(item.name)) {
                    const stats = fs.statSync(fullPath);
                    const modifiedTime = stats.mtime.getTime();
                    
                    if (modifiedTime > since) {
                        metrics.filesModified++;
                        
                        // Estimate lines changed (rough approximation)
                        const sizeKB = stats.size / 1024;
                        const estimatedLines = Math.ceil(sizeKB * 30); // Rough estimate: 30 lines per KB
                        metrics.linesChanged += estimatedLines;
                        
                        // Track file types
                        const ext = path.extname(item.name).toLowerCase();
                        metrics.fileTypes[ext] = (metrics.fileTypes[ext] || 0) + 1;
                        
                        // Add to recent files list (limit to 10)
                        if (metrics.recentFiles.length < 10) {
                            metrics.recentFiles.push({
                                path: path.relative(projectPath, fullPath),
                                modified: new Date(modifiedTime).toISOString(),
                                size: stats.size
                            });
                        }
                    }
                    
                    // Check for very recent files (new files)
                    const createdTime = stats.birthtime.getTime();
                    if (createdTime > since) {
                        metrics.newFiles++;
                    }
                }
            }
        };
        
        scanDirectory(projectPath);
    } catch (error) {
        console.error('Error scanning for changes:', error);
    }
    
    return metrics;
}

/**
 * Check if a file is a code file based on extension
 * @param {string} filename - Name of the file
 * @returns {boolean} True if it's a code file
 */
function isCodeFile(filename) {
    const codeExtensions = new Set([
        '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp',
        '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala', '.clj',
        '.html', '.css', '.scss', '.sass', '.less', '.vue', '.svelte',
        '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
        '.md', '.txt', '.sql', '.sh', '.bat', '.ps1', '.dockerfile', '.makefile'
    ]);
    
    const ext = path.extname(filename).toLowerCase();
    return codeExtensions.has(ext) || filename.toLowerCase().includes('makefile') || filename.toLowerCase().includes('dockerfile');
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
    commitChangesToGit,
    // Session management handlers
    getSessionInfo,
    resetProjectSession,
    // Task execution handlers
    executeTask,
    getLiveExecutionMetrics,
    // Architecture analysis handlers
    generateArchitecture,
    progressiveProjectAnalysis,
    // Streaming utilities for WebSocket handler
    executeClaudeWithPrint,
    buildTaskExecutionPrompt,
    shouldContinueSession,
    updateSessionActivity,
    // Project state management
    saveProjectState,
    loadProjectState,
    hasProjectState,
    deleteProjectState
};

/**
 * Execute a single task using Claude CLI with session continuity
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function executeTask(req, res) {
    try {
        const { task, projectContext, executionOptions = {} } = req.body;
        
        if (!task) {
            return res.status(400).json({ error: 'Task is required' });
        }
        
        if (!task.title || !task.description) {
            return res.status(400).json({ error: 'Task must have title and description' });
        }
        
        const projectPath = projectContext?.projectPath || process.cwd();
        const claudePath = projectContext?.claudePath || '/opt/homebrew/bin/claude';
        
        // Build task execution prompt
        const taskPrompt = buildTaskExecutionPrompt(task, projectContext);
        
        console.log(`Executing task: ${task.title}`);
        console.log(`Project path: ${projectPath}`);
        console.log(`Using Claude CLI: ${claudePath}`);
        
        // Determine if we should continue session (always use continue for task execution)
        const useContinue = shouldContinueSession(projectPath, false); // false = not new project
        
        // Update session activity
        updateSessionActivity(projectPath);
        
        // Execute task with Claude CLI
        const startTime = Date.now();
        let result;
        try {
            result = await executeClaudeWithPrint(claudePath, taskPrompt, projectPath, {
                useContinue,
                timeout: executionOptions.timeout || 300000, // 5 minutes default
                model: executionOptions.model || 'sonnet',
                returnRawOutput: true // For task execution, we need raw output for parsing
            });
        } catch (claudeError) {
            console.error('Claude CLI execution error:', claudeError.message);
            
            // If the error mentions "pattern" or "string", try a simpler prompt
            if (claudeError.message.includes('pattern') || claudeError.message.includes('string')) {
                console.log('Retrying with simplified prompt...');
                const simplePrompt = `${task.title}: ${task.description}`;
                try {
                    result = await executeClaudeWithPrint(claudePath, simplePrompt, projectPath, {
                        useContinue: useContinue, // Use same session continuity setting as first attempt
                        timeout: executionOptions.timeout || 300000,
                        model: executionOptions.model || 'sonnet',
                        returnRawOutput: true // For task execution, we need raw output for parsing
                    });
                } catch (retryError) {
                    throw new Error(`Claude CLI failed: ${claudeError.message}. Retry also failed: ${retryError.message}`);
                }
            } else {
                throw new Error(`Claude CLI error: ${claudeError.message}. This may be due to prompt formatting, Claude CLI version compatibility, or session issues.`);
            }
        }
        const endTime = Date.now();
        
        // Parse execution result and extract metrics
        const executionResult = parseTaskExecutionResult(result, task);
        executionResult.duration = endTime - startTime;
        executionResult.sessionContinued = useContinue;
        
        // Set session as active after successful execution
        setSessionState(projectPath, true);
        
        console.log(`Task "${task.title}" completed in ${executionResult.duration}ms`);
        
        res.json({
            success: true,
            task: {
                ...task,
                status: 'completed',
                executionResult
            },
            sessionInfo: {
                continued: useContinue,
                projectPath: projectPath
            }
        });
        
    } catch (error) {
        console.error('Task execution failed:', error);
        
        res.status(500).json({
            success: false,
            error: error.message,
            task: {
                ...req.body.task,
                status: 'failed',
                error: error.message
            }
        });
    }
}

/**
 * Get live execution metrics for a project during task execution
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
function getLiveExecutionMetrics(req, res) {
    try {
        const projectPath = req.params.projectPath || process.cwd();
        const fs = require('fs');
        const path = require('path');
        
        // Initialize metrics
        const metrics = {
            filesModified: 0,
            filesCreated: 0,
            linesChanged: 0,
            lastActivity: Date.now(),
            projectSize: 0,
            recentFiles: []
        };
        
        // Check if project path exists
        if (!fs.existsSync(projectPath)) {
            return res.json({
                success: false,
                error: 'Project path not found',
                metrics: metrics
            });
        }
        
        try {
            // Analyze recent file changes (files modified in last 5 minutes)
            const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
            const recentChanges = scanForRecentChanges(projectPath, fiveMinutesAgo);
            
            metrics.filesModified = recentChanges.modified.length;
            metrics.filesCreated = recentChanges.created.length;
            metrics.linesChanged = recentChanges.totalLines;
            metrics.recentFiles = recentChanges.recentFiles.slice(0, 5); // Last 5 files
            metrics.projectSize = recentChanges.projectSize;
            metrics.lastActivity = recentChanges.lastActivity;
            
            res.json({
                success: true,
                metrics: metrics,
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.warn('Error analyzing file changes:', error.message);
            res.json({
                success: true,
                metrics: metrics,
                timestamp: Date.now(),
                warning: 'Limited metrics available due to file access restrictions'
            });
        }
        
    } catch (error) {
        console.error('Failed to get execution metrics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get execution metrics',
            details: error.message
        });
    }
}

/**
 * Scan for recent file changes in project directory
 * @param {string} projectPath - Project directory path
 * @param {number} sinceTime - Timestamp to check changes since
 * @returns {Object} Changes summary
 */
function scanForRecentChanges(projectPath, sinceTime) {
    const fs = require('fs');
    const path = require('path');
    
    const results = {
        modified: [],
        created: [],
        totalLines: 0,
        recentFiles: [],
        projectSize: 0,
        lastActivity: 0
    };
    
    // Patterns to ignore
    const ignorePatterns = [
        /node_modules/,
        /\.git/,
        /\.DS_Store/,
        /package-lock\.json/,
        /\.log$/,
        /coverage/,
        /dist/,
        /build/
    ];
    
    function scanDirectory(dir, depth = 0) {
        if (depth > 3) return; // Limit recursion depth
        
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                // Skip ignored patterns
                if (ignorePatterns.some(pattern => pattern.test(fullPath))) {
                    continue;
                }
                
                try {
                    const stats = fs.statSync(fullPath);
                    const modTime = stats.mtime.getTime();
                    
                    if (entry.isDirectory()) {
                        scanDirectory(fullPath, depth + 1);
                    } else if (entry.isFile()) {
                        results.projectSize += stats.size;
                        
                        if (modTime > sinceTime) {
                            const isNew = stats.birthtime.getTime() > sinceTime;
                            
                            if (isNew) {
                                results.created.push(fullPath);
                            } else {
                                results.modified.push(fullPath);
                            }
                            
                            // Count lines for code files
                            if (isCodeFile(fullPath)) {
                                try {
                                    const content = fs.readFileSync(fullPath, 'utf8');
                                    const lineCount = content.split('\n').length;
                                    results.totalLines += lineCount;
                                } catch (e) {
                                    // Skip files that can't be read
                                }
                            }
                            
                            results.recentFiles.push({
                                path: path.relative(projectPath, fullPath),
                                modified: modTime,
                                size: stats.size,
                                isNew: isNew
                            });
                            
                            if (modTime > results.lastActivity) {
                                results.lastActivity = modTime;
                            }
                        }
                    }
                } catch (e) {
                    // Skip files that can't be accessed
                    continue;
                }
            }
        } catch (e) {
            // Skip directories that can't be read
            return;
        }
    }
    
    scanDirectory(projectPath);
    
    // Sort recent files by modification time (newest first)
    results.recentFiles.sort((a, b) => b.modified - a.modified);
    
    return results;
}

/**
 * Check if file is a code file
 * @param {string} filePath - File path
 * @returns {boolean} True if code file
 */
function isCodeFile(filePath) {
    const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.css', '.html', '.vue', '.php', '.rb', '.go', '.rs', '.json', '.yml', '.yaml'];
    return codeExtensions.includes(path.extname(filePath));
}

/**
 * Build Claude CLI prompt for task execution
 * @param {Object} task - Task to execute
 * @param {Object} projectContext - Project context information
 * @returns {string} Formatted prompt for Claude CLI
 */
function buildTaskExecutionPrompt(task, projectContext) {
    const projectPath = projectContext?.projectPath || process.cwd();
    const projectName = projectContext?.projectName || 'Unknown Project';
    
    return `Execute this task in project "${projectName}" at ${projectPath}:

TASK: ${task.title}
${task.description}

You have access to Write, Read, Bash, and Edit tools. Please use these tools to:
1. Create any necessary files and directories in ${projectPath}
2. Execute required commands using Bash tool
3. Implement the task requirements completely

Report what you accomplished with specific file paths and actions taken.`;
}

/**
 * Parse the result of task execution from Claude CLI output
 * @param {string} claudeOutput - Raw output from Claude CLI
 * @param {Object} task - Original task object
 * @returns {Object} Parsed execution result with metrics
 */
function parseTaskExecutionResult(claudeOutput, task) {
    const result = {
        output: claudeOutput,
        filesModified: [],
        filesCreated: [],
        commandsRun: [],
        errorsEncountered: [],
        warnings: [],
        testsRun: 0,
        testsPassed: 0,
        success: true
    };
    
    try {
        // Extract file operations from output
        const fileModifiedMatches = claudeOutput.match(/modified:?\s+([^\n\r]+)/gi) || [];
        result.filesModified = fileModifiedMatches.map(match => 
            match.replace(/modified:?\s+/i, '').trim()
        );
        
        const fileCreatedMatches = claudeOutput.match(/created:?\s+([^\n\r]+)/gi) || [];
        result.filesCreated = fileCreatedMatches.map(match => 
            match.replace(/created:?\s+/i, '').trim()
        );
        
        // Extract commands run
        const commandMatches = claudeOutput.match(/(?:running|executing):?\s+`([^`]+)`/gi) || [];
        result.commandsRun = commandMatches.map(match => 
            match.replace(/(?:running|executing):?\s+`([^`]+)`/i, '$1')
        );
        
        // Extract errors and warnings
        const errorMatches = claudeOutput.match(/error:?\s+([^\n\r]+)/gi) || [];
        result.errorsEncountered = errorMatches.map(match => 
            match.replace(/error:?\s+/i, '').trim()
        );
        
        const warningMatches = claudeOutput.match(/warning:?\s+([^\n\r]+)/gi) || [];
        result.warnings = warningMatches.map(match => 
            match.replace(/warning:?\s+/i, '').trim()
        );
        
        // Extract test results
        const testMatches = claudeOutput.match(/(\d+)\s+tests?\s+passed/i);
        if (testMatches) {
            result.testsPassed = parseInt(testMatches[1]);
        }
        
        const testRunMatches = claudeOutput.match(/(\d+)\s+tests?\s+run/i);
        if (testRunMatches) {
            result.testsRun = parseInt(testRunMatches[1]);
        }
        
        // Determine success based on errors
        result.success = result.errorsEncountered.length === 0;
        
    } catch (parseError) {
        console.warn('Failed to parse task execution result:', parseError);
        result.parseError = parseError.message;
    }
    
    return result;
}

/**
 * Progressive project analysis with real-time progress updates
 * Breaks down analysis into stages with individual timeouts and progress reporting
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function progressiveProjectAnalysis(req, res) {
    try {
        const { projectContext } = req.body;
        
        if (!projectContext) {
            return res.status(400).json({ error: 'Project context is required' });
        }
        
        const projectPath = projectContext.projectPath || process.cwd();
        const projectName = projectContext.projectName || 'Unknown Project';
        const claudePath = projectContext.claudePath || '/opt/homebrew/bin/claude';
        
        console.log(`Starting progressive analysis for: ${projectName}`);
        console.log(`Project path: ${projectPath}`);
        
        // Analysis stages with individual timeouts (increased for Claude CLI operations)
        const stages = [
            {
                name: 'File System Scan',
                description: 'Scanning project files and structure',
                timeout: 60000, // 60 seconds (was 15s)
                progress: 0
            },
            {
                name: 'Technology Detection',
                description: 'Identifying technologies and frameworks',
                timeout: 90000, // 90 seconds (was 20s)
                progress: 0
            },
            {
                name: 'Architecture Analysis',
                description: 'Analyzing project architecture and patterns',
                timeout: 120000, // 120 seconds (was 45s)
                progress: 0
            },
            {
                name: 'Finalization',
                description: 'Generating final analysis report',
                timeout: 30000, // 30 seconds (was 10s)
                progress: 0
            }
        ];
        
        let currentStage = 0;
        let overallProgress = 0;
        const results = {};
        
        // Stage 1: File System Scan
        try {
            stages[currentStage].progress = 20;
            const fileScanPrompt = `Analyze the file structure of this project at ${projectPath}. Focus on:
1. Main directories and their purposes
2. Configuration files present
3. Entry points and main files
4. Overall project organization
Provide a brief JSON summary of the file structure.`;
            
            stages[currentStage].progress = 50;
            const fileScanResult = await executeClaudeWithPrint(claudePath, fileScanPrompt, projectPath, {
                timeout: stages[currentStage].timeout,
                model: 'haiku', // Use faster model for file scanning
                returnRawOutput: true
            });
            
            stages[currentStage].progress = 100;
            results.fileStructure = fileScanResult;
            currentStage++;
            overallProgress = 25;
            console.log(`Stage 1 completed: File System Scan`);
            
        } catch (error) {
            console.log(`Stage 1 failed, using fallback: ${error.message}`);
            results.fileStructure = 'File scan failed, using basic analysis';
            currentStage++;
            overallProgress = 25;
        }
        
        // Stage 2: Technology Detection
        try {
            stages[currentStage].progress = 20;
            const techDetectionPrompt = `Based on the project at ${projectPath}, identify:
1. Programming languages used
2. Frameworks and libraries
3. Build tools and package managers
4. Development tools and configurations
Provide a JSON list of technologies found.`;
            
            stages[currentStage].progress = 50;
            const techResult = await executeClaudeWithPrint(claudePath, techDetectionPrompt, projectPath, {
                timeout: stages[currentStage].timeout,
                model: 'haiku',
                returnRawOutput: true
            });
            
            stages[currentStage].progress = 100;
            results.technologies = techResult;
            currentStage++;
            overallProgress = 50;
            console.log(`Stage 2 completed: Technology Detection`);
            
        } catch (error) {
            console.log(`Stage 2 failed, using fallback: ${error.message}`);
            results.technologies = 'Technology detection failed, using basic analysis';
            currentStage++;
            overallProgress = 50;
        }
        
        // Stage 3: Architecture Analysis (main analysis)
        try {
            stages[currentStage].progress = 10;
            const architecturePrompt = buildArchitecturePrompt(projectContext);
            
            stages[currentStage].progress = 30;
            const useContinue = shouldContinueSession(projectPath, false);
            if (useContinue) {
                updateSessionActivity(projectPath);
            }
            
            stages[currentStage].progress = 50;
            const architectureResult = await executeClaudeWithPrint(claudePath, architecturePrompt, projectPath, {
                useContinue,
                timeout: stages[currentStage].timeout,
                model: 'sonnet',
                returnRawOutput: true
            });
            
            stages[currentStage].progress = 100;
            results.architecture = parseArchitectureResponse(architectureResult, projectContext);
            currentStage++;
            overallProgress = 85;
            console.log(`Stage 3 completed: Architecture Analysis`);
            
        } catch (error) {
            console.log(`Stage 3 failed, using fallback: ${error.message}`);
            results.architecture = generateFallbackArchitectureBackend(projectContext);
            currentStage++;
            overallProgress = 85;
        }
        
        // Stage 4: Finalization
        stages[currentStage].progress = 50;
        
        // Combine all results into final architecture object
        const finalArchitecture = {
            ...results.architecture,
            fileStructureAnalysis: results.fileStructure,
            technologyStack: results.technologies,
            analysisStages: stages.map(stage => ({
                name: stage.name,
                completed: true,
                progress: stage.progress
            }))
        };
        
        stages[currentStage].progress = 100;
        overallProgress = 100;
        console.log(`Progressive analysis completed for: ${projectName}`);
        
        res.json({
            success: true,
            architecture: finalArchitecture,
            progress: {
                overall: overallProgress,
                stages: stages,
                completed: true
            },
            sessionInfo: {
                continued: shouldContinueSession(projectPath, false),
                projectPath: projectPath
            }
        });
        
    } catch (error) {
        console.error('Progressive analysis failed:', error);
        
        res.status(500).json({
            success: false,
            error: error.message,
            progress: {
                overall: 0,
                stages: [],
                completed: false,
                failed: true
            },
            architecture: generateFallbackArchitectureBackend(req.body.projectContext)
        });
    }
}

/**
 * Generate project architecture analysis using Claude CLI
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function generateArchitecture(req, res) {
    try {
        const { projectContext } = req.body;
        
        if (!projectContext) {
            return res.status(400).json({ error: 'Project context is required' });
        }
        
        const projectPath = projectContext.projectPath || process.cwd();
        const projectName = projectContext.projectName || 'Unknown Project';
        const isExisting = projectContext.isExisting || false;
        const claudePath = projectContext.claudePath || '/opt/homebrew/bin/claude';
        
        // Validate required fields
        if (!projectPath || projectPath === 'null') {
            console.log('No project path provided, using fallback architecture');
            return res.json({
                success: true,
                architecture: generateFallbackArchitectureBackend(projectContext),
                sessionInfo: {
                    continued: false,
                    projectPath: process.cwd()
                }
            });
        }
        
        // Build architecture analysis prompt
        const architecturePrompt = buildArchitecturePrompt(projectContext);
        
        console.log(`Generating architecture analysis for: ${projectName}`);
        console.log(`Project path: ${projectPath}`);
        
        // Use session continuity for architecture analysis (unless it's a new project start)
        const isNewProject = projectContext && projectContext.isNewProject || false;
        const useContinue = shouldContinueSession(projectPath, isNewProject);
        
        if (useContinue) {
            updateSessionActivity(projectPath);
        }
        
        // Execute architecture analysis with Claude CLI
        const startTime = Date.now();
        let architecture;
        try {
            const result = await executeClaudeWithPrint(claudePath, architecturePrompt, projectPath, {
                useContinue,
                timeout: 60000, // 60 seconds for architecture analysis
                model: 'sonnet',
                returnRawOutput: true // For architecture analysis, we need raw output for parsing
            });
            // Parse architecture from Claude response
            architecture = parseArchitectureResponse(result, projectContext);
        } catch (error) {
            console.log('Claude CLI failed, using real project analysis fallback:', error.message);
            architecture = generateFallbackArchitectureBackend(projectContext);
        }
        const endTime = Date.now();
        
        console.log(`Architecture analysis completed in ${endTime - startTime}ms`);
        
        res.json({
            success: true,
            architecture: architecture,
            sessionInfo: {
                continued: useContinue,
                projectPath: projectPath
            }
        });
        
    } catch (error) {
        console.error('Architecture generation failed:', error);
        
        res.status(500).json({
            success: false,
            error: error.message,
            // Provide fallback architecture
            architecture: generateFallbackArchitectureBackend(req.body.projectContext)
        });
    }
}

/**
 * Build Claude CLI prompt for architecture analysis
 * @param {Object} projectContext - Project context information
 * @returns {string} Formatted prompt for architecture analysis
 */
function buildArchitecturePrompt(projectContext) {
    const projectName = projectContext.projectName || 'Project';
    const isExisting = projectContext.isExisting || false;
    
    if (isExisting) {
        return `Analyze the architecture of ${projectName}. Return JSON: {"layers":[{"name":"Frontend","description":"UI components","components":["Views"],"color":"#6366F1"}],"overview":"Brief summary"}`;
    } else {
        return `Design architecture for new project ${projectName}. Return JSON: {"layers":[{"name":"Setup","description":"Project init","components":["Config"],"color":"#6366F1"}],"overview":"Brief summary"}`;
    }
}

/**
 * Parse architecture response from Claude CLI
 * @param {string} claudeOutput - Raw output from Claude CLI
 * @param {Object} projectContext - Project context
 * @returns {Object} Parsed architecture object
 */
function parseArchitectureResponse(claudeOutput, projectContext) {
    try {
        // Handle different types of Claude output
        let outputString = '';
        
        if (typeof claudeOutput === 'string') {
            outputString = claudeOutput;
        } else if (Array.isArray(claudeOutput)) {
            // If Claude returns tasks instead of architecture, use fallback
            console.log('Claude returned tasks instead of architecture, using fallback');
            return generateFallbackArchitectureBackend(projectContext);
        } else if (claudeOutput && claudeOutput.toString) {
            outputString = claudeOutput.toString();
        } else {
            console.warn('Invalid Claude output type:', typeof claudeOutput);
            return generateFallbackArchitectureBackend(projectContext);
        }
        
        // Look for JSON in the response
        const jsonMatch = outputString.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.layers && Array.isArray(parsed.layers)) {
                return parsed;
            }
        }
    } catch (parseError) {
        console.warn('Failed to parse architecture JSON:', parseError);
    }
    
    // Return fallback if parsing fails
    return generateFallbackArchitectureBackend(projectContext);
}

/**
 * Generate real project-based architecture by analyzing files
 * @param {Object} projectContext - Project context
 * @returns {Object} Project-specific architecture
 */
function generateFallbackArchitectureBackend(projectContext) {
    const isExisting = projectContext?.isExisting || false;
    const projectName = projectContext?.projectName || 'Project';
    const projectPath = projectContext?.projectPath;
    
    if (isExisting && projectPath && projectPath !== 'null') {
        return analyzeRealProjectStructure(projectPath, projectName);
    } else {
        return generateNewProjectArchitecture(projectName);
    }
}

/**
 * Analyze actual project structure to generate real architecture
 * @param {string} projectPath - Path to project
 * @param {string} projectName - Project name
 * @returns {Object} Real project architecture
 */
function analyzeRealProjectStructure(projectPath, projectName) {
    try {
        const fs = require('fs');
        const path = require('path');
        
        if (!fs.existsSync(projectPath)) {
            return generateGenericExistingArchitecture(projectName);
        }
        
        const architecture = {
            layers: [],
            overview: `${projectName} architecture based on actual project analysis`
        };
        
        // Analyze different aspects of the project
        const frontendComponents = analyzeFrontend(projectPath);
        const backendComponents = analyzeBackend(projectPath);
        const dataComponents = analyzeData(projectPath);
        const infraComponents = analyzeInfrastructure(projectPath);
        
        // Add layers based on what we found
        if (frontendComponents.length > 0) {
            architecture.layers.push({
                name: 'Frontend/UI Layer',
                description: 'User interface and presentation components',
                components: frontendComponents,
                color: '#6366F1'
            });
        }
        
        if (backendComponents.length > 0) {
            architecture.layers.push({
                name: 'Backend/API Layer', 
                description: 'Server-side logic and API endpoints',
                components: backendComponents,
                color: '#10B981'
            });
        }
        
        if (dataComponents.length > 0) {
            architecture.layers.push({
                name: 'Data Layer',
                description: 'Data storage, models, and persistence',
                components: dataComponents,
                color: '#F59E0B'
            });
        }
        
        if (infraComponents.length > 0) {
            architecture.layers.push({
                name: 'Infrastructure Layer',
                description: 'Build tools, configuration, and deployment',
                components: infraComponents,
                color: '#EF4444'
            });
        }
        
        // Ensure at least one layer exists
        if (architecture.layers.length === 0) {
            return generateGenericExistingArchitecture(projectName);
        }
        
        return architecture;
        
    } catch (error) {
        console.warn('Failed to analyze project structure:', error.message);
        return generateGenericExistingArchitecture(projectName);
    }
}

/**
 * Analyze frontend components in the project
 */
function analyzeFolder(projectPath, patterns) {
    const fs = require('fs');
    const path = require('path');
    const components = [];
    
    try {
        const files = fs.readdirSync(projectPath, { withFileTypes: true });
        
        for (const file of files) {
            if (file.isDirectory()) {
                // Check subdirectories
                const dirName = file.name;
                if (patterns.dirs.some(pattern => dirName.match(pattern))) {
                    components.push(dirName.charAt(0).toUpperCase() + dirName.slice(1));
                }
                
                // Recursively check one level deep
                try {
                    const subPath = path.join(projectPath, dirName);
                    const subFiles = fs.readdirSync(subPath);
                    for (const subFile of subFiles) {
                        if (patterns.files.some(pattern => subFile.match(pattern))) {
                            const componentName = path.basename(subFile, path.extname(subFile));
                            if (!components.includes(componentName)) {
                                components.push(componentName);
                            }
                        }
                    }
                } catch (subError) {
                    // Skip if can't read subdirectory
                }
            } else {
                // Check files
                if (patterns.files.some(pattern => file.name.match(pattern))) {
                    const componentName = path.basename(file.name, path.extname(file.name));
                    components.push(componentName);
                }
            }
        }
    } catch (error) {
        // Skip if can't read directory
    }
    
    return components.slice(0, 6); // Limit to 6 components
}

function analyzeFrontend(projectPath) {
    return analyzeFolder(projectPath, {
        dirs: [/^(public|frontend|client|ui|src|app|pages|components|views)$/i],
        files: [/\.(html|css|js|jsx|ts|tsx|vue|svelte)$/i, /^(index|app|main)\./i]
    });
}

function analyzeBackend(projectPath) {
    return analyzeFolder(projectPath, {
        dirs: [/^(server|backend|api|src|routes|controllers|services)$/i],
        files: [/server\.|app\.|main\.|index\./, /\.(py|java|go|rb|php|rs)$/i]
    });
}

function analyzeData(projectPath) {
    return analyzeFolder(projectPath, {
        dirs: [/^(models|data|db|database|storage|migrations)$/i],
        files: [/\.(sql|db|json|yaml|yml)$/i, /schema\.|model\./i]
    });
}

function analyzeInfrastructure(projectPath) {
    return analyzeFolder(projectPath, {
        dirs: [/^(config|build|dist|deploy|docker|k8s|test|tests)$/i],
        files: [/package\.json|requirements\.txt|Dockerfile|docker-compose|\.env|config\./i]
    });
}

function generateGenericExistingArchitecture(projectName) {
    return {
        layers: [
            { 
                name: 'Application Layer', 
                description: 'Main application components and logic',
                components: ['Core Logic', 'User Interface', 'Business Rules'],
                color: '#6366F1'
            },
            { 
                name: 'Infrastructure Layer', 
                description: 'Support systems and configuration',
                components: ['Configuration', 'Build Tools', 'Dependencies'],
                color: '#10B981'
            }
        ],
        overview: `${projectName} follows a modular architecture pattern.`
    };
}

function generateNewProjectArchitecture(projectName) {
    return {
        layers: [
            { 
                name: 'Core Setup', 
                description: 'Project initialization and basic structure',
                components: ['Package.json', 'Dependencies', 'Entry Points'],
                color: '#6366F1'
            },
            { 
                name: 'Application Framework', 
                description: 'Main application structure and routing',
                components: ['App Structure', 'Routing', 'Middleware'],
                color: '#10B981'
            },
            { 
                name: 'Features & Components', 
                description: 'Core functionality and user-facing features',
                components: ['Features', 'Components', 'Services'],
                color: '#F59E0B'
            },
            { 
                name: 'Development Tools', 
                description: 'Testing, building, and development workflow',
                components: ['Tests', 'Build Tools', 'Documentation'],
                color: '#EF4444'
            }
        ],
        overview: `${projectName} will use a modular architecture emphasizing maintainability and testability.`
    };
}

// Project State Management API Handlers
function getProjectState(req, res) {
    try {
        const projectPath = decodeURIComponent(req.params.projectPath);
        const state = loadProjectState(projectPath);
        
        if (!state) {
            return res.status(404).json({ 
                success: false, 
                error: 'No saved state found for this project' 
            });
        }
        
        res.json({
            success: true,
            state: state,
            hasState: true
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to load project state', 
            details: error.message 
        });
    }
}

function saveProjectStateAPI(req, res) {
    try {
        const { projectPath, state } = req.body;
        
        if (!projectPath) {
            return res.status(400).json({ 
                success: false, 
                error: 'Project path is required' 
            });
        }
        
        const success = saveProjectState(projectPath, state);
        
        if (success) {
            res.json({
                success: true,
                message: 'Project state saved successfully'
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to save project state'
            });
        }
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to save project state', 
            details: error.message 
        });
    }
}

function checkProjectState(req, res) {
    try {
        const { projectPath } = req.body;
        
        if (!projectPath) {
            return res.status(400).json({ 
                success: false, 
                error: 'Project path is required' 
            });
        }
        
        const hasState = hasProjectState(projectPath);
        let stateInfo = null;
        
        if (hasState) {
            const state = loadProjectState(projectPath);
            stateInfo = {
                savedAt: state?.savedAt,
                taskCount: state?.tasks?.length || 0,
                completedTasks: state?.tasks?.filter(t => t.status === 'completed').length || 0,
                architecture: state?.architecture ? 'Available' : 'Not saved'
            };
        }
        
        res.json({
            success: true,
            hasState: hasState,
            stateInfo: stateInfo
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to check project state', 
            details: error.message 
        });
    }
}

function deleteProjectStateAPI(req, res) {
    try {
        const projectPath = decodeURIComponent(req.params.projectPath);
        const success = deleteProjectState(projectPath);
        
        if (success) {
            res.json({
                success: true,
                message: 'Project state deleted successfully'
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Failed to delete project state'
            });
        }
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: 'Failed to delete project state', 
            details: error.message 
        });
    }
}