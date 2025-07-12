/**
 * AgentOps
 * Activity Parser Module
 * 
 * Copyright © 2025 Kari Pikkarainen. All rights reserved.
 * This software is proprietary and confidential.
 */

const EventEmitter = require('events');

class ActivityParser extends EventEmitter {
    constructor() {
        super();
        this.activities = [];
        this.maxActivities = 1000; // Limit stored activities for memory management
        this.activityCounter = 0;
        this.parsePatterns = this.initializeParsePatterns();
    }

    /**
     * Initialize parsing patterns for different activity types
     * @returns {object} Parse patterns
     */
    initializeParsePatterns() {
        return {
            // Claude Code specific patterns
            claudeCode: {
                thinking: /^\s*<thinking>/,
                functionCall: /<invoke name="([^"]+)">/,
                functionResult: /<function_calls>/,
                error: /Error:|Exception:|Failed:/i,
                completion: /Task completed|Finished|Done/i
            },
            
            // Command execution patterns
            commands: {
                gitCommands: /^git\s+(add|commit|push|pull|checkout|branch|merge|status|diff|log)/,
                npmCommands: /^npm\s+(install|start|run|test|build)/,
                fileOperations: /^(cp|mv|rm|mkdir|touch|cat|ls|find|grep)/,
                dockerCommands: /^docker\s+(build|run|ps|stop|start|pull|push)/
            },
            
            // File change patterns
            fileChanges: {
                codeFiles: /\.(js|ts|jsx|tsx|py|java|cpp|c|h|css|html|vue|php|rb|go|rs)$/,
                configFiles: /(package\.json|tsconfig\.json|webpack\.config\.js|\.env|Dockerfile)/,
                testFiles: /\.(test|spec)\.(js|ts|jsx|tsx|py)$/
            },
            
            // Testing patterns
            testing: {
                testStart: /^Running tests|Test suite started/i,
                testPass: /✓|PASS|passed/i,
                testFail: /✗|FAIL|failed/i,
                coverage: /Coverage:|All files/i
            }
        };
    }

    /**
     * Parse activity from various sources
     * @param {string} source - Source of the activity (stdout, stderr, websocket, etc.)
     * @param {string} data - Raw data to parse
     * @param {object} metadata - Additional metadata
     * @returns {object|null} Parsed activity or null
     */
    parseActivity(source, data, metadata = {}) {
        if (!data || typeof data !== 'string') {
            return null;
        }

        const timestamp = new Date();
        const activityId = ++this.activityCounter;

        // Determine activity type and extract relevant information
        const activityType = this.determineActivityType(data);
        const parsedContent = this.parseContent(data, activityType);
        const importance = this.calculateImportance(activityType, data);

        const activity = {
            id: activityId,
            timestamp,
            source,
            type: activityType,
            rawData: data,
            parsedContent,
            importance,
            metadata: {
                ...metadata,
                length: data.length,
                lineCount: data.split('\n').length
            }
        };

        // Store activity
        this.storeActivity(activity);

        // Emit events
        this.emit('activityParsed', activity);
        this.emit(`activity:${activityType}`, activity);

        return activity;
    }

    /**
     * Determine the type of activity from the data
     * @param {string} data - Raw data
     * @returns {string} Activity type
     */
    determineActivityType(data) {
        const patterns = this.parsePatterns;

        // Check Claude Code patterns
        if (patterns.claudeCode.thinking.test(data)) return 'claude_thinking';
        if (patterns.claudeCode.functionCall.test(data)) return 'claude_function_call';
        if (patterns.claudeCode.functionResult.test(data)) return 'claude_function_result';
        if (patterns.claudeCode.error.test(data)) return 'error';
        if (patterns.claudeCode.completion.test(data)) return 'completion';

        // Check command patterns
        if (patterns.commands.gitCommands.test(data)) return 'git_command';
        if (patterns.commands.npmCommands.test(data)) return 'npm_command';
        if (patterns.commands.fileOperations.test(data)) return 'file_operation';
        if (patterns.commands.dockerCommands.test(data)) return 'docker_command';

        // Check testing patterns
        if (patterns.testing.testStart.test(data)) return 'test_start';
        if (patterns.testing.testPass.test(data)) return 'test_pass';
        if (patterns.testing.testFail.test(data)) return 'test_fail';
        if (patterns.testing.coverage.test(data)) return 'test_coverage';

        // Default classification
        if (data.includes('Error') || data.includes('Exception')) return 'error';
        if (data.includes('Warning')) return 'warning';
        if (data.trim().startsWith('$') || data.trim().startsWith('>')) return 'command';

        return 'general';
    }

    /**
     * Parse content based on activity type
     * @param {string} data - Raw data
     * @param {string} activityType - Type of activity
     * @returns {object} Parsed content
     */
    parseContent(data, activityType) {
        const parsed = {
            summary: this.generateSummary(data),
            details: {},
            tags: []
        };

        switch (activityType) {
            case 'claude_function_call':
                const functionMatch = data.match(/<invoke name="([^"]+)">/);
                if (functionMatch) {
                    parsed.details.functionName = functionMatch[1];
                    parsed.summary = `Called function: ${functionMatch[1]}`;
                    parsed.tags.push('function-call', functionMatch[1]);
                }
                break;

            case 'git_command':
                const gitMatch = data.match(/^git\s+(\w+)/);
                if (gitMatch) {
                    parsed.details.gitAction = gitMatch[1];
                    parsed.summary = `Git: ${gitMatch[1]}`;
                    parsed.tags.push('git', gitMatch[1]);
                }
                break;

            case 'npm_command':
                const npmMatch = data.match(/^npm\s+(\w+)/);
                if (npmMatch) {
                    parsed.details.npmAction = npmMatch[1];
                    parsed.summary = `NPM: ${npmMatch[1]}`;
                    parsed.tags.push('npm', npmMatch[1]);
                }
                break;

            case 'file_operation':
                parsed.details.operation = data.split(' ')[0];
                parsed.tags.push('file-operation');
                break;

            case 'test_pass':
            case 'test_fail':
                parsed.details.testResult = activityType === 'test_pass' ? 'passed' : 'failed';
                parsed.tags.push('testing', parsed.details.testResult);
                break;

            case 'error':
                parsed.details.errorType = this.extractErrorType(data);
                parsed.tags.push('error');
                break;

            default:
                // General parsing
                break;
        }

        return parsed;
    }

    /**
     * Generate a summary from raw data
     * @param {string} data - Raw data
     * @returns {string} Summary
     */
    generateSummary(data) {
        // Clean and truncate data for summary
        const cleaned = data.trim().replace(/\n+/g, ' ');
        const maxLength = 100;
        
        if (cleaned.length <= maxLength) {
            return cleaned;
        }
        
        return cleaned.substring(0, maxLength) + '...';
    }

    /**
     * Extract error type from error message
     * @param {string} data - Error data
     * @returns {string} Error type
     */
    extractErrorType(data) {
        if (data.includes('SyntaxError')) return 'syntax';
        if (data.includes('TypeError')) return 'type';
        if (data.includes('ReferenceError')) return 'reference';
        if (data.includes('NetworkError')) return 'network';
        if (data.includes('TimeoutError')) return 'timeout';
        return 'unknown';
    }

    /**
     * Calculate importance score for an activity
     * @param {string} activityType - Type of activity
     * @param {string} data - Raw data
     * @returns {number} Importance score (1-10)
     */
    calculateImportance(activityType, data) {
        let score = 5; // Default importance

        // High importance activities
        if (activityType === 'error') score = 9;
        if (activityType === 'test_fail') score = 8;
        if (activityType === 'completion') score = 7;
        if (activityType === 'claude_function_call') score = 6;

        // Medium importance activities
        if (activityType === 'git_command') score = 5;
        if (activityType === 'npm_command') score = 5;
        if (activityType === 'test_pass') score = 4;

        // Low importance activities
        if (activityType === 'general') score = 3;
        if (activityType === 'claude_thinking') score = 2;

        // Adjust based on data length and content
        if (data.length > 1000) score += 1;
        if (data.includes('CRITICAL') || data.includes('FATAL')) score = 10;
        if (data.includes('WARNING')) score += 1;

        return Math.min(10, Math.max(1, score));
    }

    /**
     * Store activity in memory
     * @param {object} activity - Activity to store
     */
    storeActivity(activity) {
        this.activities.unshift(activity);
        
        // Limit stored activities
        if (this.activities.length > this.maxActivities) {
            this.activities = this.activities.slice(0, this.maxActivities);
        }
    }

    /**
     * Get recent activities
     * @param {number} limit - Number of activities to return
     * @param {string} type - Filter by activity type
     * @returns {Array} Recent activities
     */
    getRecentActivities(limit = 50, type = null) {
        let filtered = this.activities;
        
        if (type) {
            filtered = this.activities.filter(activity => activity.type === type);
        }
        
        return filtered.slice(0, limit);
    }

    /**
     * Get activity statistics
     * @returns {object} Statistics
     */
    getStatistics() {
        const typeCount = {};
        const importanceCount = { high: 0, medium: 0, low: 0 };
        
        this.activities.forEach(activity => {
            // Count by type
            typeCount[activity.type] = (typeCount[activity.type] || 0) + 1;
            
            // Count by importance
            if (activity.importance >= 7) importanceCount.high++;
            else if (activity.importance >= 4) importanceCount.medium++;
            else importanceCount.low++;
        });

        return {
            totalActivities: this.activities.length,
            typeDistribution: typeCount,
            importanceDistribution: importanceCount,
            lastActivity: this.activities[0]?.timestamp || null
        };
    }

    /**
     * Clear all stored activities
     */
    clearActivities() {
        this.activities = [];
        this.activityCounter = 0;
        this.emit('activitiesCleared');
    }

    /**
     * Search activities
     * @param {string} query - Search query
     * @param {object} filters - Additional filters
     * @returns {Array} Matching activities
     */
    searchActivities(query, filters = {}) {
        return this.activities.filter(activity => {
            // Text search
            const matchesQuery = !query || 
                activity.parsedContent.summary.toLowerCase().includes(query.toLowerCase()) ||
                activity.rawData.toLowerCase().includes(query.toLowerCase());

            // Type filter
            const matchesType = !filters.type || activity.type === filters.type;

            // Importance filter
            const matchesImportance = !filters.minImportance || activity.importance >= filters.minImportance;

            // Time filter
            const matchesTime = !filters.since || activity.timestamp >= filters.since;

            return matchesQuery && matchesType && matchesImportance && matchesTime;
        });
    }
}

module.exports = new ActivityParser();