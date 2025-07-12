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

### Phase 1 (Foundation)
- Real-time workflow visualization with interactive canvas
- Activity timeline with filtering and search capabilities
- Testing & coverage dashboard with quality gates
- Claude Code command line integration
- Basic workflow management with templates

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

# Run tests (when implemented)
npm test
```

Current technology stack:
- Frontend: HTML/CSS/JavaScript with responsive design
- Backend: Node.js with Express for API services
- Real-time: WebSocket for live updates
- File monitoring: Chokidar for file system watching
- Process management: Node.js child_process
- Activity parsing: Custom pattern recognition engine
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

### Phase 1: Core Foundation (Completed)
- Basic web interface with workflow visualization
- Activity timeline with mock data
- Status dashboard and controls
- WebSocket infrastructure for real-time updates

### Phase 2: Real Integration (Completed)
- ✅ Claude Code process management and communication
- ✅ File system monitoring and change detection
- ✅ Real-time activity parsing and display
- ✅ Command execution and output capture
- ✅ REST API endpoints and WebSocket integration
- ✅ Activity search, filtering, and statistics
- ✅ Multi-instance support (up to 10 concurrent)

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