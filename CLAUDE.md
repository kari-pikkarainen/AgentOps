# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **AgentOps**, an AI agent monitoring, control, and workflow visualization platform that brings DevOps principles to AI agent development. It provides real-time oversight and management of AI agents like Claude Code throughout the entire development lifecycle.

## Architecture

### Core System Components

The system follows a layered architecture with these key components:

- **Workflow Visualization Engine**: Renders interactive workflow diagrams and real-time progress indicators
- **Claude Code Integration Bridge**: Handles communication with Claude Code instances via command line interface
- **Activity Monitoring Service**: Collects, processes, and stores all agent activities and decisions
- **Testing & Coverage Dashboard**: Provides comprehensive test execution monitoring and code coverage visualization
- **Configuration Management System**: Manages workflow definitions, user preferences, and system settings

### Data Models

The system uses structured data models for:
- **Workflow Definitions**: JSON-based workflow configurations with steps, dependencies, and execution logic
- **Activity Records**: Timestamped records of all agent activities with metadata and performance metrics
- **Test Execution Results**: Comprehensive test results with coverage data and quality gates
- **Claude Code Instances**: Process management for multiple concurrent AI agent instances

## Key Features

### Phase 1 (Foundation) - ✅ COMPLETED
- Real-time workflow visualization with interactive canvas
- Activity timeline with filtering and search capabilities
- Claude Code command line integration
- Basic workflow management with templates
- **TEST COVERAGE: 88.46%** with 114 passing tests across 7 test suites
- **BRANCH COVERAGE: 84%** exceeding the 80% quality threshold
- **MODULAR ARCHITECTURE**: Extracted API routes and WebSocket handlers for improved testability
- **QUALITY ASSURANCE**: All coverage thresholds met across statements, branches, functions, and lines

### Future Phases
- Advanced workflow designer with drag-and-drop interface
- AI-powered workflow optimization and analytics
- Enterprise features with multi-user support and collaboration tools
- Mobile client applications for iOS and Android

## Development Commands

```bash
# Install dependencies
npm install

# Start development server
npm start

# Run in development mode with auto-reload
npm run dev

# Run test suite (114 tests)
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

Current technology stack:
- Frontend: HTML/CSS/JavaScript with responsive design
- Backend: Node.js with Express for API services
- Real-time: WebSocket for live updates
- File monitoring: Chokidar for file system watching
- Process management: Node.js child_process
- Activity parsing: Custom pattern recognition engine
- Testing: Jest with comprehensive mocking, 88.46% coverage, and 84% branch coverage
- Future: React/TypeScript, Electron for desktop app, mobile clients

## Integration Points

### Claude Code Communication
The system integrates with Claude Code instances through:
- Process spawning and management
- Standard I/O stream capture and parsing
- Command injection and response handling
- File system change monitoring
- Real-time activity streaming

### File System Monitoring
- Project root directory monitoring
- Real-time change detection for code files
- Git integration for version control tracking
- Build artifact and test result monitoring

## API Structure

The system exposes REST APIs for:
- `/api/v1/claude-code/instances` - Claude Code instance management (✅ Implemented)
- `/api/v1/monitoring` - File system monitoring control (✅ Implemented)
- `/api/v1/activities` - Activity monitoring with search/filter (✅ Implemented)
- `/api/v1/workflows` - Workflow management (Future)
- `/api/v1/testing` - Test execution and coverage reporting (Future)
- `/api/v1/config` - System configuration (Future)

## Performance Requirements

- UI updates within 100ms of activity occurrence
- API response times under 200ms for 95% of requests
- Support for 10+ concurrent Claude Code instances
- Memory usage under 512MB for desktop application
- Real-time WebSocket communication for live updates

## Security Considerations

- Token-based authentication for API access
- TLS 1.3 for all network communications
- AES-256 encryption for sensitive configuration data
- Input validation and sanitization for all API endpoints
- Process isolation for Claude Code instances

## Future Development Roadmap

### Phase 1: Core Foundation (✅ COMPLETED)
- ✅ Basic web interface with workflow visualization
- ✅ Activity timeline with mock data
- ✅ Status dashboard and controls
- ✅ WebSocket infrastructure for real-time updates
- ✅ **TEST COVERAGE IMPROVEMENTS**: 88.46% coverage with 114 tests
- ✅ **BRANCH COVERAGE ACHIEVEMENT**: 84% branch coverage exceeding 80% threshold
- ✅ **MODULAR REFACTORING**: Extracted api-routes.js and websocket-handler.js
- ✅ **COMPREHENSIVE TESTING**: 7 test suites with mocked dependencies
- ✅ **QUALITY THRESHOLDS**: All coverage metrics above 80% requirement

### Phase 2: Real Integration (✅ COMPLETED)
- ✅ Claude Code process management and communication
- ✅ File system monitoring and change detection
- ✅ Real-time activity parsing and display
- ✅ Command execution and output capture
- ✅ REST API endpoints and WebSocket integration
- ✅ Activity search, filtering, and statistics
- ✅ Multi-instance support (up to 10 concurrent)
- ✅ **ROBUST ERROR HANDLING**: Comprehensive error testing across all modules
- ✅ **INTEGRATION TESTING**: Full end-to-end API and WebSocket testing

### Phase 3: Advanced Features (Next)
- Workflow designer with drag-and-drop interface
- Custom workflow templates and sharing
- Advanced analytics and performance metrics
- Multi-project support and management
- Enhanced UI with React/TypeScript
- Testing dashboard with coverage visualization

### Phase 4: Mobile & Enterprise
- **Mobile Client Development**:
  - Native iOS app with SwiftUI
  - Native Android app with Kotlin/Compose
  - Cross-platform option with React Native or Flutter
  - Mobile-optimized UI for monitoring on-the-go
  - Push notifications for important events
  - Offline viewing of cached activity data
- Enterprise authentication and user management
- Team collaboration and workflow sharing
- Advanced security and compliance features

## Testing Guidelines

### Test Coverage Standards
- **Minimum Coverage**: 80% for statements, branches, functions, and lines
- **Current Achievement**: 88.46% statement coverage, 84% branch coverage with 114 tests
- **Quality Status**: ✅ ALL THRESHOLDS MET - All metrics exceed 80% requirement
- **Test Organization**: Separate test files for each module with comprehensive mocking

### Test Structure
```
test/
├── api-routes.test.js          # REST API endpoint testing
├── websocket-handler.test.js   # WebSocket connection and message testing
├── server-integration.test.js  # Full integration testing
├── process-manager.test.js     # Claude Code process management
├── file-monitor.test.js        # File system monitoring
├── activity-parser.test.js     # Activity parsing and classification
└── server.test.js              # Basic server functionality
```

### Test Commands
```bash
npm test                # Run all tests (114 tests)
npm run test:watch      # Run tests in watch mode for development
npm run test:coverage   # Generate coverage report (88.46% coverage)
```

### Testing Best Practices
- **Mock Dependencies**: All external dependencies are properly mocked
- **Isolated Testing**: Each module is tested in isolation
- **Error Coverage**: All error paths and edge cases are tested
- **Integration Tests**: End-to-end testing of API and WebSocket flows
- **Async Handling**: Proper handling of async operations and promises

### Adding New Tests
When adding new functionality:
1. Create corresponding test file if new module
2. Mock all external dependencies before requiring modules
3. Test both success and error scenarios
4. Maintain minimum 80% coverage threshold (currently exceeding at 88.46%)
5. Ensure branch coverage remains above 80% (currently at 84%)
6. Update test documentation in this file