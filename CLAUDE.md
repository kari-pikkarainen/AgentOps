# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Claude Code AI Agent Visual Monitoring System** project that creates a comprehensive visual interface for tracking and managing Claude Code AI Agent operations in real-time. The system is designed to monitor workflows, visualize progress, and provide detailed insights into AI agent activities.

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

## Development Commands

*Note: This project appears to be in specification/design phase. No build tools or package managers are currently configured.*

When implementing this system, typical commands would include:
- Frontend: React/TypeScript with Electron for desktop app
- Backend: Node.js with Express for API services
- Database: SQLite for local storage, InfluxDB for time-series data
- Testing: Jest for unit tests, Cypress for e2e testing

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
- `/api/v1/workflows` - Workflow management
- `/api/v1/activities` - Activity monitoring with WebSocket streaming
- `/api/v1/claude-code/instances` - Claude Code instance management
- `/api/v1/testing` - Test execution and coverage reporting
- `/api/v1/config` - System configuration

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