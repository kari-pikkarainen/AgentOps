/**
 * AgentOps
 * Process Manager Tests
 * 
 * Copyright © 2025 Kari Pikkarainen. All rights reserved.
 * This software is proprietary and confidential.
 */

const processManager = require('../src/process-manager');

describe('Process Manager', () => {
    afterEach(() => {
        // Clean up any running instances
        const instances = processManager.getAllInstances();
        instances.forEach(instance => {
            processManager.terminateInstance(instance.id);
        });
        
        // Remove all listeners
        processManager.removeAllListeners();
    });

    describe('Instance Management', () => {
        test('should spawn a new instance', () => {
            const instance = processManager.spawnInstance('echo "test"');
            
            expect(instance).toBeDefined();
            expect(instance.id).toMatch(/^claude-\d+-[a-z0-9]+$/);
            expect(instance.command).toBe('echo "test"');
            expect(instance.status).toBe('running');
            expect(instance.pid).toBeDefined();
            expect(instance.startTime).toBeInstanceOf(Date);
        });

        test('should get all instances', () => {
            const instance1 = processManager.spawnInstance('echo "test1"');
            const instance2 = processManager.spawnInstance('echo "test2"');
            
            const instances = processManager.getAllInstances();
            expect(instances).toHaveLength(2);
            expect(instances.map(i => i.id)).toContain(instance1.id);
            expect(instances.map(i => i.id)).toContain(instance2.id);
        });

        test('should get instance by ID', () => {
            const instance = processManager.spawnInstance('echo "test"');
            const retrieved = processManager.getInstance(instance.id);
            
            expect(retrieved).toBeDefined();
            expect(retrieved.id).toBe(instance.id);
            expect(retrieved.command).toBe('echo "test"');
        });

        test('should return null for non-existent instance', () => {
            const retrieved = processManager.getInstance('non-existent-id');
            expect(retrieved).toBeNull();
        });

        test('should terminate an instance', () => {
            const instance = processManager.spawnInstance('echo "test"');
            const success = processManager.terminateInstance(instance.id);
            
            expect(success).toBe(true);
            expect(processManager.getAllInstances()).toHaveLength(0);
        });

        test('should handle terminating non-existent instance', () => {
            const success = processManager.terminateInstance('non-existent-id');
            expect(success).toBe(false);
        });
    });

    describe('Concurrent Instance Limits', () => {
        test('should enforce maximum concurrent instances', () => {
            // Spawn maximum instances (10)
            const instances = [];
            for (let i = 0; i < 10; i++) {
                instances.push(processManager.spawnInstance(`echo "test${i}"`));
            }
            
            expect(instances).toHaveLength(10);
            expect(processManager.getAllInstances()).toHaveLength(10);
            
            // Try to spawn 11th instance
            expect(() => {
                processManager.spawnInstance('echo "overflow"');
            }).toThrow('Maximum concurrent instances (10) reached');
        });
    });

    describe('Event Emission', () => {
        test('should emit instanceCreated event', (done) => {
            processManager.once('instanceCreated', (instance) => {
                expect(instance.command).toBe('echo "test"');
                expect(instance.status).toBe('running');
                done();
            });
            
            processManager.spawnInstance('echo "test"');
        });

        test('should emit instanceTerminated event', (done) => {
            const instance = processManager.spawnInstance('echo "test"');
            
            processManager.once('instanceTerminated', (instanceId) => {
                expect(instanceId).toBe(instance.id);
                done();
            });
            
            processManager.terminateInstance(instance.id);
        });

        test('should emit processOutput event', (done) => {
            processManager.once('processOutput', (output) => {
                expect(output.instanceId).toBeDefined();
                expect(output.type).toBe('stdout');
                expect(typeof output.data).toBe('string');
                expect(output.data.length).toBeGreaterThan(0);
                done();
            });
            
            processManager.spawnInstance('echo "test output"');
        }, 10000);
    });

    describe('Input Handling', () => {
        test('should send input to instance', () => {
            const instance = processManager.spawnInstance('cat'); // Cat echoes input
            const success = processManager.sendInput(instance.id, 'hello\n');
            
            expect(success).toBe(true);
        });

        test('should handle sending input to non-existent instance', () => {
            const success = processManager.sendInput('non-existent-id', 'hello\n');
            expect(success).toBe(false);
        });
    });

    describe('ID Generation', () => {
        test('should generate unique instance IDs', () => {
            const instance1 = processManager.spawnInstance('echo "test1"');
            const instance2 = processManager.spawnInstance('echo "test2"');
            
            expect(instance1.id).not.toBe(instance2.id);
            expect(instance1.id).toMatch(/^claude-\d+-[a-z0-9]+$/);
            expect(instance2.id).toMatch(/^claude-\d+-[a-z0-9]+$/);
        });
    });
});