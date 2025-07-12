/**
 * AgentOps
 * Jest Configuration
 * 
 * Copyright © 2025 Kari Pikkarainen. All rights reserved.
 * This software is proprietary and confidential.
 */

module.exports = {
    // Test environment
    testEnvironment: 'node',

    // Coverage configuration
    collectCoverage: false, // Set to true when running coverage
    coverageDirectory: 'coverage',
    coverageProvider: 'v8',
    
    // Coverage thresholds
    coverageThreshold: {
        global: {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80
        }
    },

    // Files to include in coverage
    collectCoverageFrom: [
        'src/**/*.js',
        'server.js',
        '!src/**/*.test.js',
        '!**/node_modules/**'
    ],

    // Test file patterns
    testMatch: [
        '**/test/**/*.test.js',
        '**/src/**/*.test.js'
    ],

    // Setup files
    setupFilesAfterEnv: [],

    // Clear mocks between tests
    clearMocks: true,

    // Verbose output
    verbose: true,

    // Transform files
    transform: {},

    // Module file extensions
    moduleFileExtensions: ['js', 'json'],

    // Ignore patterns
    testPathIgnorePatterns: [
        '/node_modules/',
        '/coverage/'
    ]
};