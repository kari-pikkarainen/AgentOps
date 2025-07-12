/**
 * AgentOps
 * Process Manager Module
 * 
 * Copyright © 2025 Kari Pikkarainen. All rights reserved.
 * This software is proprietary and confidential.
 */

const { spawn } = require('child_process');
const EventEmitter = require('events');

class ClaudeCodeProcessManager extends EventEmitter {
    constructor() {
        super();
        this.instances = new Map();
        this.maxConcurrentInstances = 10; // From performance requirements in CLAUDE.md
    }

    /**
     * Spawn a new Claude Code instance
     * @param {string} command - Command to spawn
     * @param {object} options - Spawn options
     * @returns {object} Process instance details
     */
    spawnInstance(command, options = {}) {
        if (this.instances.size >= this.maxConcurrentInstances) {
            throw new Error(`Maximum concurrent instances (${this.maxConcurrentInstances}) reached`);
        }

        const instanceId = this.generateInstanceId();
        
        const childProcess = spawn(command, options.args || [], {
            shell: true,
            stdio: ['pipe', 'pipe', 'pipe'],
            ...options
        });

        const instanceDetails = {
            id: instanceId,
            command,
            pid: childProcess.pid,
            startTime: new Date(),
            status: 'running'
        };

        this.instances.set(instanceId, {
            process: childProcess,
            details: instanceDetails
        });

        this.setupProcessListeners(instanceId, childProcess);
        this.emit('instanceCreated', instanceDetails);

        return instanceDetails;
    }

    /**
     * Terminate a specific Claude Code instance
     * @param {string} instanceId - ID of the instance to terminate
     */
    terminateInstance(instanceId) {
        const instance = this.instances.get(instanceId);
        if (!instance) {
            return false;
        }

        try {
            instance.process.kill('SIGTERM');
        } catch (error) {
            console.warn(`Error terminating instance ${instanceId}:`, error.message);
        }
        
        this.instances.delete(instanceId);
        this.emit('instanceTerminated', instanceId);
        return true;
    }

    /**
     * Set up listeners for process events
     * @param {string} instanceId - ID of the instance
     * @param {ChildProcess} process - Child process object
     */
    setupProcessListeners(instanceId, process) {
        process.stdout.on('data', (data) => {
            this.emit('processOutput', {
                instanceId,
                type: 'stdout',
                data: data.toString()
            });
        });

        process.stderr.on('data', (data) => {
            this.emit('processOutput', {
                instanceId,
                type: 'stderr',
                data: data.toString()
            });
        });

        process.on('close', (code) => {
            const instance = this.instances.get(instanceId);
            if (instance) {
                instance.details.status = code === 0 ? 'completed' : 'failed';
                instance.details.endTime = new Date();
                instance.details.exitCode = code;

                this.emit('instanceClosed', instance.details);
                this.instances.delete(instanceId);
            }
        });

        process.on('error', (error) => {
            this.emit('processError', {
                instanceId,
                error: error.message
            });
        });
    }

    /**
     * Generate a unique instance ID
     * @returns {string} Unique instance ID
     */
    generateInstanceId() {
        return `claude-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get all current instances
     * @returns {Array} List of current instances
     */
    getAllInstances() {
        return Array.from(this.instances.values()).map(instance => instance.details);
    }

    /**
     * Get instance by ID
     * @param {string} instanceId - Instance ID
     * @returns {object|null} Instance details or null if not found
     */
    getInstance(instanceId) {
        const instance = this.instances.get(instanceId);
        return instance ? instance.details : null;
    }

    /**
     * Send input to a specific instance
     * @param {string} instanceId - Instance ID
     * @param {string} input - Input to send
     * @returns {boolean} Success status
     */
    sendInput(instanceId, input) {
        const instance = this.instances.get(instanceId);
        if (!instance) {
            return false;
        }

        try {
            instance.process.stdin.write(input);
            return true;
        } catch (error) {
            console.warn(`Error sending input to instance ${instanceId}:`, error.message);
            return false;
        }
    }
}

module.exports = new ClaudeCodeProcessManager();