/**
 * AgentOps
 * Activity Parser Tests
 * 
 * Copyright © 2025 Kari Pikkarainen. All rights reserved.
 * This software is proprietary and confidential.
 */

const activityParser = require('../src/activity-parser');

describe('Activity Parser', () => {
    beforeEach(() => {
        activityParser.clearActivities();
        activityParser.removeAllListeners();
    });

    describe('Activity Parsing', () => {
        test('should parse basic activity', () => {
            const activity = activityParser.parseActivity('test', 'Hello world', { test: true });
            
            expect(activity).toBeDefined();
            expect(activity.id).toBeDefined();
            expect(activity.timestamp).toBeInstanceOf(Date);
            expect(activity.source).toBe('test');
            expect(activity.rawData).toBe('Hello world');
            expect(activity.type).toBe('general');
            expect(activity.importance).toBeGreaterThan(0);
            expect(activity.metadata.test).toBe(true);
        });

        test('should return null for invalid input', () => {
            expect(activityParser.parseActivity('test', null)).toBeNull();
            expect(activityParser.parseActivity('test', undefined)).toBeNull();
            expect(activityParser.parseActivity('test', 123)).toBeNull();
        });

        test('should determine activity types correctly', () => {
            const gitActivity = activityParser.parseActivity('test', 'git commit -m "test"');
            expect(gitActivity.type).toBe('git_command');

            const npmActivity = activityParser.parseActivity('test', 'npm install react');
            expect(npmActivity.type).toBe('npm_command');

            const errorActivity = activityParser.parseActivity('test', 'Error: Something failed');
            expect(errorActivity.type).toBe('error');

            const testActivity = activityParser.parseActivity('test', 'Test passed ✓');
            expect(testActivity.type).toBe('test_pass');
        });

        test('should calculate importance scores', () => {
            const errorActivity = activityParser.parseActivity('test', 'Error: Critical failure');
            expect(errorActivity.importance).toBeGreaterThanOrEqual(9);

            const normalActivity = activityParser.parseActivity('test', 'Regular message');
            expect(normalActivity.importance).toBeLessThan(9);

            const criticalActivity = activityParser.parseActivity('test', 'CRITICAL: System failure');
            expect(criticalActivity.importance).toBe(10);
        });
    });

    describe('Activity Storage', () => {
        test('should store activities in memory', () => {
            activityParser.parseActivity('test', 'First activity');
            activityParser.parseActivity('test', 'Second activity');
            
            const activities = activityParser.getRecentActivities();
            expect(activities).toHaveLength(2);
            expect(activities[0].parsedContent.summary).toBe('Second activity');
            expect(activities[1].parsedContent.summary).toBe('First activity');
        });

        test('should limit stored activities', () => {
            // Set a lower limit for testing
            const originalLimit = activityParser.maxActivities;
            activityParser.maxActivities = 5;
            
            // Add more activities than the limit
            for (let i = 0; i < 10; i++) {
                activityParser.parseActivity('test', `Activity ${i}`);
            }
            
            const activities = activityParser.getRecentActivities();
            expect(activities.length).toBeLessThanOrEqual(5);
            
            // Restore original limit
            activityParser.maxActivities = originalLimit;
        });

        test('should clear all activities', () => {
            activityParser.parseActivity('test', 'Test activity');
            expect(activityParser.getRecentActivities()).toHaveLength(1);
            
            activityParser.clearActivities();
            expect(activityParser.getRecentActivities()).toHaveLength(0);
        });
    });

    describe('Activity Retrieval', () => {
        beforeEach(() => {
            activityParser.parseActivity('test', 'git commit -m "test"');
            activityParser.parseActivity('test', 'npm install');
            activityParser.parseActivity('test', 'Error: Something failed');
        });

        test('should get recent activities with limit', () => {
            const activities = activityParser.getRecentActivities(2);
            expect(activities).toHaveLength(2);
        });

        test('should filter activities by type', () => {
            const gitActivities = activityParser.getRecentActivities(50, 'git_command');
            expect(gitActivities).toHaveLength(1);
            expect(gitActivities[0].type).toBe('git_command');
        });

        test('should search activities', () => {
            const results = activityParser.searchActivities('Error');
            expect(results).toHaveLength(1);
            expect(results[0].type).toBe('error');
        });

        test('should search with filters', () => {
            const results = activityParser.searchActivities('', {
                type: 'git_command',
                minImportance: 1
            });
            expect(results).toHaveLength(1);
            expect(results[0].type).toBe('git_command');
        });
    });

    describe('Statistics', () => {
        beforeEach(() => {
            activityParser.parseActivity('test', 'git commit -m "test"');
            activityParser.parseActivity('test', 'npm install');
            activityParser.parseActivity('test', 'Error: Critical failure');
        });

        test('should generate statistics', () => {
            const stats = activityParser.getStatistics();
            
            expect(stats.totalActivities).toBe(3);
            expect(stats.typeDistribution).toBeDefined();
            expect(stats.typeDistribution.git_command).toBe(1);
            expect(stats.typeDistribution.npm_command).toBe(1);
            expect(stats.typeDistribution.error).toBe(1);
            expect(stats.importanceDistribution).toBeDefined();
            expect(stats.lastActivity).toBeInstanceOf(Date);
        });
    });

    describe('Event Emission', () => {
        test('should emit activityParsed event', (done) => {
            activityParser.once('activityParsed', (activity) => {
                expect(activity.rawData).toBe('Test event');
                done();
            });
            
            activityParser.parseActivity('test', 'Test event');
        });

        test('should emit specific activity type events', (done) => {
            activityParser.once('activity:error', (activity) => {
                expect(activity.type).toBe('error');
                done();
            });
            
            activityParser.parseActivity('test', 'Error: Test error');
        });

        test('should emit activitiesCleared event', (done) => {
            activityParser.once('activitiesCleared', () => {
                done();
            });
            
            activityParser.clearActivities();
        });
    });
});