const chokidar = require('chokidar');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs').promises;

class FileSystemMonitor extends EventEmitter {
    constructor() {
        super();
        this.watchers = new Map();
        this.isMonitoring = false;
        this.ignoredPatterns = [
            'node_modules/**',
            '.git/**',
            'coverage/**',
            '*.log',
            '.DS_Store',
            'package-lock.json'
        ];
    }

    /**
     * Start monitoring a directory
     * @param {string} projectPath - Path to monitor
     * @param {object} options - Monitoring options
     */
    startMonitoring(projectPath, options = {}) {
        if (this.watchers.has(projectPath)) {
            console.warn(`Already monitoring ${projectPath}`);
            return;
        }

        const watchOptions = {
            ignored: this.ignoredPatterns,
            persistent: true,
            ignoreInitial: true,
            ...options
        };

        const watcher = chokidar.watch(projectPath, watchOptions);

        // Set up event listeners
        watcher
            .on('add', (filePath) => this.handleFileChange('add', filePath))
            .on('change', (filePath) => this.handleFileChange('change', filePath))
            .on('unlink', (filePath) => this.handleFileChange('unlink', filePath))
            .on('addDir', (dirPath) => this.handleDirectoryChange('addDir', dirPath))
            .on('unlinkDir', (dirPath) => this.handleDirectoryChange('unlinkDir', dirPath))
            .on('error', (error) => this.handleError(error))
            .on('ready', () => {
                console.log(`File monitoring started for: ${projectPath}`);
                this.emit('monitoringStarted', { projectPath });
            });

        this.watchers.set(projectPath, watcher);
        this.isMonitoring = true;
    }

    /**
     * Stop monitoring a directory
     * @param {string} projectPath - Path to stop monitoring
     */
    async stopMonitoring(projectPath) {
        const watcher = this.watchers.get(projectPath);
        if (!watcher) {
            return false;
        }

        await watcher.close();
        this.watchers.delete(projectPath);
        
        if (this.watchers.size === 0) {
            this.isMonitoring = false;
        }

        this.emit('monitoringStopped', { projectPath });
        return true;
    }

    /**
     * Stop all monitoring
     */
    async stopAllMonitoring() {
        const promises = Array.from(this.watchers.keys()).map(path => this.stopMonitoring(path));
        await Promise.all(promises);
        this.isMonitoring = false;
    }

    /**
     * Handle file change events
     * @param {string} eventType - Type of change
     * @param {string} filePath - Path of changed file
     */
    async handleFileChange(eventType, filePath) {
        try {
            const fileInfo = await this.getFileInfo(filePath, eventType);
            
            const changeEvent = {
                type: 'file',
                eventType,
                path: filePath,
                relativePath: this.getRelativePath(filePath),
                fileName: path.basename(filePath),
                fileExtension: path.extname(filePath),
                timestamp: new Date(),
                ...fileInfo
            };

            this.emit('fileChange', changeEvent);
            
            // Emit specific events for different file types
            if (this.isCodeFile(filePath)) {
                this.emit('codeFileChange', changeEvent);
            }
            
            if (this.isConfigFile(filePath)) {
                this.emit('configFileChange', changeEvent);
            }

        } catch (error) {
            this.handleError(error);
        }
    }

    /**
     * Handle directory change events
     * @param {string} eventType - Type of change
     * @param {string} dirPath - Path of changed directory
     */
    handleDirectoryChange(eventType, dirPath) {
        const changeEvent = {
            type: 'directory',
            eventType,
            path: dirPath,
            relativePath: this.getRelativePath(dirPath),
            directoryName: path.basename(dirPath),
            timestamp: new Date()
        };

        this.emit('directoryChange', changeEvent);
    }

    /**
     * Get file information
     * @param {string} filePath - File path
     * @param {string} eventType - Event type
     * @returns {object} File information
     */
    async getFileInfo(filePath, eventType) {
        if (eventType === 'unlink') {
            return { size: 0, exists: false };
        }

        try {
            const stats = await fs.stat(filePath);
            return {
                size: stats.size,
                modified: stats.mtime,
                exists: true
            };
        } catch (error) {
            return { size: 0, exists: false };
        }
    }

    /**
     * Get relative path from project root
     * @param {string} fullPath - Full file path
     * @returns {string} Relative path
     */
    getRelativePath(fullPath) {
        // Get the first watched path as project root
        const projectRoot = this.watchers.keys().next().value;
        if (projectRoot) {
            return path.relative(projectRoot, fullPath);
        }
        return fullPath;
    }

    /**
     * Check if file is a code file
     * @param {string} filePath - File path
     * @returns {boolean} True if code file
     */
    isCodeFile(filePath) {
        const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.css', '.html', '.vue', '.php', '.rb', '.go', '.rs'];
        return codeExtensions.includes(path.extname(filePath));
    }

    /**
     * Check if file is a configuration file
     * @param {string} filePath - File path
     * @returns {boolean} True if config file
     */
    isConfigFile(filePath) {
        const fileName = path.basename(filePath);
        const configFiles = ['package.json', 'tsconfig.json', 'webpack.config.js', '.env', 'Dockerfile', 'docker-compose.yml'];
        const configExtensions = ['.json', '.yml', '.yaml', '.toml', '.ini'];
        
        return configFiles.includes(fileName) || configExtensions.includes(path.extname(filePath));
    }

    /**
     * Handle errors
     * @param {Error} error - Error object
     */
    handleError(error) {
        console.error('File monitoring error:', error);
        this.emit('error', {
            message: error.message,
            timestamp: new Date()
        });
    }

    /**
     * Get monitoring status
     * @returns {object} Status information
     */
    getStatus() {
        return {
            isMonitoring: this.isMonitoring,
            watchedPaths: Array.from(this.watchers.keys()),
            watcherCount: this.watchers.size
        };
    }

    /**
     * Add ignore pattern
     * @param {string} pattern - Pattern to ignore
     */
    addIgnorePattern(pattern) {
        if (!this.ignoredPatterns.includes(pattern)) {
            this.ignoredPatterns.push(pattern);
        }
    }

    /**
     * Remove ignore pattern
     * @param {string} pattern - Pattern to remove
     */
    removeIgnorePattern(pattern) {
        const index = this.ignoredPatterns.indexOf(pattern);
        if (index > -1) {
            this.ignoredPatterns.splice(index, 1);
        }
    }
}

module.exports = new FileSystemMonitor();