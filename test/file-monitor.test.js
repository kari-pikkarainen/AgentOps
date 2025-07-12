/**
 * AgentOps
 * File Monitor Tests
 * 
 * Copyright © 2025 Kari Pikkarainen. All rights reserved.
 * This software is proprietary and confidential.
 */

const fileMonitor = require('../src/file-monitor');
const fs = require('fs').promises;
const path = require('path');

describe('File Monitor', () => {
    const testDir = path.join(__dirname, 'temp_test_dir');
    
    beforeEach(async () => {
        // Clean up any existing monitoring
        await fileMonitor.stopAllMonitoring();
        fileMonitor.removeAllListeners();
        
        // Create test directory
        try {
            await fs.mkdir(testDir, { recursive: true });
        } catch (error) {
            // Directory might already exist
        }
    });

    afterEach(async () => {
        // Clean up
        await fileMonitor.stopAllMonitoring();
        fileMonitor.removeAllListeners();
        
        // Remove test directory
        try {
            await fs.rmdir(testDir, { recursive: true });
        } catch (error) {
            // Directory might not exist
        }
    });

    describe('Monitoring Control', () => {
        test('should start monitoring a directory', (done) => {
            fileMonitor.once('monitoringStarted', (data) => {
                expect(data.projectPath).toBe(testDir);
                expect(fileMonitor.isMonitoring).toBe(true);
                done();
            });
            
            fileMonitor.startMonitoring(testDir);
        });

        test('should get monitoring status', () => {
            const status = fileMonitor.getStatus();
            expect(status).toHaveProperty('isMonitoring');
            expect(status).toHaveProperty('watchedPaths');
            expect(status).toHaveProperty('watcherCount');
            expect(Array.isArray(status.watchedPaths)).toBe(true);
        });

        test('should prevent duplicate monitoring', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            
            fileMonitor.startMonitoring(testDir);
            fileMonitor.startMonitoring(testDir); // Should warn about duplicate
            
            expect(consoleSpy).toHaveBeenCalledWith(`Already monitoring ${testDir}`);
            consoleSpy.mockRestore();
        });

        test('should stop monitoring', async () => {
            fileMonitor.startMonitoring(testDir);
            
            const success = await fileMonitor.stopMonitoring(testDir);
            expect(success).toBe(true);
        });

        test('should handle stopping non-monitored path', async () => {
            const success = await fileMonitor.stopMonitoring('/non/existent/path');
            expect(success).toBe(false);
        });
    });

    describe('File Type Detection', () => {
        test('should identify code files', () => {
            expect(fileMonitor.isCodeFile('test.js')).toBe(true);
            expect(fileMonitor.isCodeFile('component.tsx')).toBe(true);
            expect(fileMonitor.isCodeFile('style.css')).toBe(true);
            expect(fileMonitor.isCodeFile('readme.txt')).toBe(false);
        });

        test('should identify config files', () => {
            expect(fileMonitor.isConfigFile('package.json')).toBe(true);
            expect(fileMonitor.isConfigFile('tsconfig.json')).toBe(true);
            expect(fileMonitor.isConfigFile('config.yml')).toBe(true);
            expect(fileMonitor.isConfigFile('random.txt')).toBe(false);
        });
    });

    describe('Ignore Patterns', () => {
        test('should add ignore pattern', () => {
            const initialLength = fileMonitor.ignoredPatterns.length;
            fileMonitor.addIgnorePattern('*.tmp');
            expect(fileMonitor.ignoredPatterns.length).toBe(initialLength + 1);
            expect(fileMonitor.ignoredPatterns).toContain('*.tmp');
        });

        test('should not add duplicate ignore pattern', () => {
            fileMonitor.addIgnorePattern('*.log');
            const lengthAfterFirst = fileMonitor.ignoredPatterns.length;
            fileMonitor.addIgnorePattern('*.log'); // Duplicate
            expect(fileMonitor.ignoredPatterns.length).toBe(lengthAfterFirst);
        });

        test('should remove ignore pattern', () => {
            fileMonitor.addIgnorePattern('*.temp');
            expect(fileMonitor.ignoredPatterns).toContain('*.temp');
            
            fileMonitor.removeIgnorePattern('*.temp');
            expect(fileMonitor.ignoredPatterns).not.toContain('*.temp');
        });
    });

    describe('Path Utilities', () => {
        test('should get relative path', () => {
            fileMonitor.startMonitoring(testDir);
            const fullPath = path.join(testDir, 'subfolder', 'file.js');
            const relativePath = fileMonitor.getRelativePath(fullPath);
            expect(relativePath).toBe(path.join('subfolder', 'file.js'));
        });

        test('should handle no watchers for relative path', () => {
            const relativePath = fileMonitor.getRelativePath('/some/full/path');
            expect(relativePath).toBe('/some/full/path');
        });
    });

    describe('Error Handling', () => {
        test('should handle errors gracefully', (done) => {
            const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            
            fileMonitor.once('error', (errorData) => {
                expect(errorData.message).toBe('Test error');
                expect(errorData.timestamp).toBeInstanceOf(Date);
                expect(errorSpy).toHaveBeenCalledWith('File monitoring error:', expect.any(Error));
                errorSpy.mockRestore();
                done();
            });
            
            const mockError = new Error('Test error');
            fileMonitor.handleError(mockError);
        });
    });
});