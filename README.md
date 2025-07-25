# AgentOps

AI agent monitoring and workflow visualization platform for Claude Code development lifecycle management.

![Status](https://img.shields.io/badge/Status-Production%20Ready-brightgreen)
![Coverage](https://img.shields.io/badge/Coverage-88.46%25-brightgreen)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen)

![AgentOps Screenshot](AgentOps-screenshot.png)

## 🚀 Features

- **5-Step Workflow**: Specification → Location → Tasks → Planning → Execution
- **Real-time Monitoring**: Live file tracking, execution metrics, architecture visualization
- **Claude Integration**: Direct Claude AI workflow integration with proper tool permissions
- **Smart Task Management**: AI-powered task generation and execution planning
- **Live Execution Control**: Stop/pause controls with graceful workflow management
- **Visual Architecture**: Real-time project layer visualization with activity highlighting

## 🛠️ Tech Stack

- **Frontend**: HTML5/CSS3/JavaScript, WebSocket real-time updates
- **Backend**: Node.js/Express, Chokidar file monitoring
- **Testing**: Jest (114+ tests, 88.46% coverage)
- **Integration**: Claude Code CLI with full tool permissions

## 🎯 Quick Start

```bash
# Install and start
npm install
npm start

# Open browser
http://localhost:3000
```

**Prerequisites**: Node.js 18+, Claude Code CLI

## 📖 Usage

### 5-Step Workflow
1. **Specification** - Generate project specs with Claude AI
2. **Location** - Browse and select project directory
3. **Tasks** - AI-generated task identification and selection
4. **Planning** - Configure execution modes and instance limits
5. **Execution** - Live monitoring with real-time metrics and controls

### Key APIs
```bash
# Claude instances
GET/POST /api/v1/claude-code/instances
GET /api/v1/claude-code/status

# File monitoring
POST /api/v1/monitoring/start
GET /api/v1/activities

# Task generation
POST /api/v1/claude-code/generate-tasks

# Live metrics
GET /api/v1/claude-code/live-metrics/:projectPath
```

## 🗂️ Project Structure

```
AgentOps/
├── public/                 # Frontend (workflow interface)
├── src/                    # Backend services
│   ├── api-routes.js       # REST API endpoints
│   ├── process-manager.js  # Claude Code management
│   ├── file-monitor.js     # File system monitoring
│   └── websocket-handler.js # Real-time communication
├── test/                   # Test suites (114+ tests)
└── server.js               # Express server
```

## 🔧 Development

```bash
npm run dev       # Development server
npm test          # Run tests
npm run test:coverage # Coverage report
```

## ⚡ Performance

- **Response Time**: <200ms for 95% of requests
- **Concurrent Support**: 10+ Claude instances
- **Real-time Updates**: 3-second polling during execution
- **Memory Efficient**: Limited activity storage prevents leaks

## 🔮 Roadmap

- **Phase 4**: Advanced analytics and reporting dashboard
- **Phase 5**: React/TypeScript migration, mobile apps
- **Future**: Multi-project workspaces, team collaboration

## ⚠️ Known Issues

- **Task Timeouts**: Large tasks may timeout (5+ min) - split into smaller tasks
- **WebSocket Drops**: Refresh browser if real-time updates stop
- **Tool Permissions**: Ensure Claude CLI has `--allowedTools` and `--add-dir` flags

## 📄 License

**Copyright © 2025 Kari Pikkarainen. All rights reserved.**  
Proprietary software. Commercial licensing available upon request.

---

Ready for advanced analytics and optimization features.