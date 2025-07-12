# AgentOps

AgentOps is an AI agent monitoring, control, and workflow visualization platform that brings DevOps principles to AI agent development. It provides real-time oversight and management of AI agents like Claude Code throughout the entire development lifecycle.

![Project Status](https://img.shields.io/badge/Status-Phase%202%20Complete-brightgreen)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen)
![License](https://img.shields.io/badge/License-Proprietary-red)

## 🚀 Features

### Current (Phase 2 Complete)
- **Real-time Claude Code Integration** - Direct process management and communication
- **File System Monitoring** - Live tracking of code changes and modifications
- **Activity Timeline** - Intelligent parsing and categorization of all activities
- **Process Management** - Spawn, monitor, and terminate Claude Code instances
- **Command Execution** - Real-time output capture and parsing
- **WebSocket Communication** - Live updates for all monitoring activities
- **Workflow Visualization** - Interactive canvas showing workflow progress
- **Status Dashboard** - Comprehensive metrics and performance indicators
- **Activity Search & Filter** - Advanced search capabilities with importance scoring
- **Multi-Instance Support** - Monitor up to 10 concurrent Claude Code agents

### Phase 1 Foundation ✅
- Real-time workflow visualization with interactive canvas
- Activity timeline with filtering and search capabilities
- Status dashboard and controls
- WebSocket infrastructure for real-time updates

## 🛠️ Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js, Express
- **Real-time**: WebSocket (ws)
- **File Monitoring**: Chokidar
- **Process Management**: Node.js child_process
- **Activity Parsing**: Custom pattern recognition engine
- **Future**: React/TypeScript, Electron, Mobile apps

## 📋 Prerequisites

- Node.js 18+ and npm
- Claude Code CLI installed and configured
- Modern web browser (Chrome, Firefox, Safari, Edge)

## 🎯 Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd CodingAgentWorkflow
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm start
   ```

4. **Open your browser**
   ```
   http://localhost:3000
   ```

## 🎮 Usage

### Claude Code Instance Management
- **Start Instance** - Spawn new Claude Code process with custom commands
- **Monitor Output** - Real-time stdout/stderr capture and parsing
- **Terminate Instance** - Gracefully stop running instances
- **Multi-Instance** - Manage up to 10 concurrent instances

### File System Monitoring
- **Auto-Detection** - Monitors code files, config files, and directories
- **Smart Filtering** - Ignores node_modules, .git, and other irrelevant files
- **Real-time Updates** - Instant notifications of file changes
- **File Type Classification** - Categorizes changes by file type and importance

### Activity Tracking
- **Intelligent Parsing** - Recognizes commands, errors, completions, and more
- **Importance Scoring** - Assigns relevance scores (1-10) to activities
- **Search & Filter** - Find activities by type, importance, or content
- **Statistics** - Track activity patterns and performance metrics

### Interface Overview
- **Left Panel**: Workflow canvas and status dashboard
- **Right Panel**: Real-time activity timeline with parsing
- **Header**: Instance controls and monitoring status

## 📖 API Documentation

### REST Endpoints

#### Claude Code Instance Management
```bash
# Get all instances
GET /api/v1/claude-code/instances

# Create new instance
POST /api/v1/claude-code/instances
{
  "command": "claude code --help",
  "options": { "cwd": "/path/to/project" }
}

# Terminate instance
DELETE /api/v1/claude-code/instances/:id

# Send input to instance
POST /api/v1/claude-code/instances/:id/input
{
  "input": "help\n"
}
```

#### File Monitoring
```bash
# Get monitoring status
GET /api/v1/monitoring/status

# Start monitoring
POST /api/v1/monitoring/start
{
  "projectPath": "/path/to/project",
  "options": { "ignored": ["*.log"] }
}

# Stop monitoring
POST /api/v1/monitoring/stop
{
  "projectPath": "/path/to/project"
}
```

#### Activity Management
```bash
# Get recent activities
GET /api/v1/activities?limit=50&type=error

# Get activity statistics
GET /api/v1/activities/statistics

# Search activities
POST /api/v1/activities/search
{
  "query": "error",
  "filters": { "minImportance": 7, "type": "error" }
}

# Clear all activities
DELETE /api/v1/activities
```

### WebSocket Events
```javascript
// Connect to WebSocket
const ws = new WebSocket('ws://localhost:3000');

// Instance events
ws.send(JSON.stringify({
  type: 'spawnInstance',
  command: 'claude code --help'
}));

// Monitoring events
ws.send(JSON.stringify({
  type: 'startMonitoring',
  projectPath: '/path/to/project'
}));

// Listen for real-time events
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  switch(data.type) {
    case 'instanceCreated':
    case 'processOutput':
    case 'fileChange':
    case 'activityParsed':
      // Handle events
      break;
  }
};
```

## 🗂️ Project Structure

```
CodingAgentWorkflow/
├── public/
│   ├── index.html          # Main HTML interface
│   ├── styles.css          # Styling and animations
│   └── app.js              # Frontend JavaScript
├── src/
│   ├── process-manager.js  # Claude Code process management
│   ├── file-monitor.js     # File system monitoring
│   └── activity-parser.js  # Activity parsing and classification
├── server.js               # Express server and WebSocket integration
├── package.json            # Dependencies and scripts
├── CLAUDE.md               # Development guidance
└── README.md              # This file
```

## 🔧 Development

### Scripts
```bash
npm start      # Start production server
npm run dev    # Start development server
npm test       # Run tests (future)
```

### Architecture
- **Event-Driven**: All components communicate via EventEmitter
- **Real-time**: WebSocket integration for live updates
- **Modular**: Separate modules for process, file, and activity management
- **Scalable**: Designed for multiple concurrent instances and projects

### Performance Features
- **Memory Management**: Activity history limited to 1000 entries
- **Concurrent Limits**: Maximum 10 Claude Code instances
- **Smart Filtering**: Intelligent file change filtering
- **Efficient Parsing**: Pattern-based activity classification

## 🔮 Roadmap

### Phase 1: Core Foundation ✅
- [x] Basic web interface with workflow visualization
- [x] Activity timeline with mock data
- [x] Status dashboard and controls
- [x] WebSocket infrastructure

### Phase 2: Real Integration ✅
- [x] Claude Code process management and communication
- [x] File system monitoring and change detection
- [x] Real-time activity parsing and display
- [x] Command execution and output capture
- [x] REST API endpoints and WebSocket integration

### Phase 3: Advanced Features (Next)
- [ ] Workflow designer with drag-and-drop interface
- [ ] Custom workflow templates and sharing
- [ ] Advanced analytics and performance metrics
- [ ] Multi-project support and management
- [ ] Enhanced UI with React/TypeScript

### Phase 4: Mobile & Enterprise
- [ ] Native iOS app with SwiftUI
- [ ] Native Android app with Kotlin/Compose
- [ ] Cross-platform mobile with React Native/Flutter
- [ ] Enterprise authentication and user management
- [ ] Team collaboration and workflow sharing
- [ ] Push notifications and offline support

## 🔐 Security

- **Process Isolation**: Claude Code instances run in separate processes
- **Input Validation**: All API inputs are validated and sanitized
- **Error Handling**: Comprehensive error handling and logging
- **Memory Limits**: Activity storage limits prevent memory leaks
- **Future**: TLS encryption, token-based authentication, AES-256 encryption

## ⚡ Performance

- **UI Updates**: Within 100ms of activity occurrence
- **API Response**: Under 200ms for 95% of requests
- **Concurrent Support**: 10+ Claude Code instances
- **Memory Usage**: Under 512MB for desktop application
- **Real-time Communication**: WebSocket for live updates

## 📄 License & Ownership

**Copyright © 2025 Kari Pikkarainen. All rights reserved.**

This software is proprietary and confidential. Unauthorized copying, distribution, modification, public performance, or public display of this software is strictly prohibited. No part of this software may be reproduced, distributed, or transmitted in any form or by any means, including photocopying, recording, or other electronic or mechanical methods, without the prior written permission of Kari Pikkarainen.

**Commercial Use**: This software is intended for personal and internal business use only. Commercial licensing may be available upon request.

**Contact**: For licensing inquiries or permissions, please contact Kari Pikkarainen.

## 🙏 Acknowledgments

- AgentOps is built for the Claude Code AI Agent ecosystem
- Inspired by modern DevOps monitoring tools
- Designed for developer productivity and insights

## 📞 Support

- Create an issue for bug reports or feature requests
- Check `CLAUDE.md` for development guidelines
- Review the project roadmap for planned features

---

**Phase 2 Complete**: AgentOps now provides real Claude Code integration with process management, file monitoring, activity parsing, and comprehensive WebSocket/REST API support. Ready for Phase 3 advanced features development.