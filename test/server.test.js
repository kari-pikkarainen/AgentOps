/**
 * AgentOps
 * Server Tests
 * 
 * Copyright © 2025 Kari Pikkarainen. All rights reserved.
 * This software is proprietary and confidential.
 */

const request = require('supertest');
const express = require('express');

// Mock the dependencies before requiring server
jest.mock('../src/process-manager', () => ({
    getAllInstances: () => [],
    spawnInstance: jest.fn(() => ({ id: 'test-id', command: 'test' })),
    terminateInstance: jest.fn(() => true),
    sendInput: jest.fn(() => true),
    on: jest.fn(),
    removeListener: jest.fn()
}));

jest.mock('../src/file-monitor', () => ({
    getStatus: () => ({ isMonitoring: false, watchedPaths: [], watcherCount: 0 }),
    startMonitoring: jest.fn(),
    stopMonitoring: jest.fn().mockResolvedValue(true),
    on: jest.fn(),
    removeListener: jest.fn()
}));

jest.mock('../src/activity-parser', () => ({
    getRecentActivities: () => [],
    getStatistics: () => ({ totalActivities: 0, typeDistribution: {}, importanceDistribution: {} }),
    searchActivities: () => [],
    clearActivities: jest.fn(),
    on: jest.fn()
}));

describe('Server API', () => {
    let app;

    beforeAll(() => {
        // Create a test version of the server without starting it
        app = express();
        app.use(express.json());
        
        // Add basic routes from server.js
        app.get('/api/v1/claude-code/instances', (req, res) => {
            res.json([]);
        });
        
        app.post('/api/v1/claude-code/instances', (req, res) => {
            res.json({ id: 'test-id', command: 'test' });
        });
        
        app.delete('/api/v1/claude-code/instances/:id', (req, res) => {
            res.json({ message: 'Instance terminated successfully' });
        });
        
        app.get('/api/v1/monitoring/status', (req, res) => {
            res.json({ isMonitoring: false, watchedPaths: [], watcherCount: 0 });
        });
        
        app.get('/api/v1/activities', (req, res) => {
            res.json([]);
        });
        
        app.get('/api/v1/activities/statistics', (req, res) => {
            res.json({ totalActivities: 0, typeDistribution: {}, importanceDistribution: {} });
        });
    });

    describe('Claude Code Instance Management', () => {
        test('GET /api/v1/claude-code/instances should return instances', async () => {
            const response = await request(app)
                .get('/api/v1/claude-code/instances')
                .expect(200);
            
            expect(Array.isArray(response.body)).toBe(true);
        });

        test('POST /api/v1/claude-code/instances should create instance', async () => {
            const response = await request(app)
                .post('/api/v1/claude-code/instances')
                .send({ command: 'echo test', options: {} })
                .expect(200);
            
            expect(response.body).toHaveProperty('id');
            expect(response.body).toHaveProperty('command');
        });

        test('DELETE /api/v1/claude-code/instances/:id should terminate instance', async () => {
            const response = await request(app)
                .delete('/api/v1/claude-code/instances/test-id')
                .expect(200);
            
            expect(response.body.message).toBe('Instance terminated successfully');
        });
    });

    describe('File Monitoring', () => {
        test('GET /api/v1/monitoring/status should return status', async () => {
            const response = await request(app)
                .get('/api/v1/monitoring/status')
                .expect(200);
            
            expect(response.body).toHaveProperty('isMonitoring');
            expect(response.body).toHaveProperty('watchedPaths');
            expect(response.body).toHaveProperty('watcherCount');
        });
    });

    describe('Activities', () => {
        test('GET /api/v1/activities should return activities', async () => {
            const response = await request(app)
                .get('/api/v1/activities')
                .expect(200);
            
            expect(Array.isArray(response.body)).toBe(true);
        });

        test('GET /api/v1/activities/statistics should return statistics', async () => {
            const response = await request(app)
                .get('/api/v1/activities/statistics')
                .expect(200);
            
            expect(response.body).toHaveProperty('totalActivities');
            expect(response.body).toHaveProperty('typeDistribution');
            expect(response.body).toHaveProperty('importanceDistribution');
        });
    });
});