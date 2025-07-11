# Claude Code AI Agent Visual Monitoring System

A comprehensive visual interface for tracking and managing Claude Code AI Agent operations in real-time. Monitor workflows, visualize progress, and gain detailed insights into AI agent activities.

![Project Status](https://img.shields.io/badge/Status-Basic%20Version%20Complete-green)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen)
![License](https://img.shields.io/badge/License-MIT-blue)

## 🚀 Features

### Current (Phase 1)
- **Real-time Workflow Visualization** - Interactive canvas showing workflow progress
- **Activity Timeline** - Live feed of Claude Code operations and decisions
- **Status Dashboard** - Progress tracking, metrics, and performance indicators
- **Responsive Design** - Works on desktop, tablet, and mobile devices
- **WebSocket Communication** - Real-time updates without page refresh

### Coming Soon (Phase 2)
- **Real Claude Code Integration** - Connect to actual Claude Code processes
- **File System Monitoring** - Track code changes and modifications
- **Command Execution** - Execute and monitor Claude Code commands
- **Multiple Instance Support** - Monitor several Claude Code agents simultaneously

## 🛠️ Technology Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js, Express
- **Real-time**: WebSocket (ws)
- **File Monitoring**: Chokidar
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

### Basic Controls
- **Start Monitoring** - Begin tracking Claude Code activities
- **Pause** - Temporarily stop monitoring
- **Stop** - End monitoring session

### Interface Overview
- **Left Panel**: Workflow canvas and status dashboard
- **Right Panel**: Real-time activity timeline
- **Header**: Controls and connection status

### Current Features (Mock Data)
The basic version includes simulated Claude Code activities to demonstrate the interface:
- Command executions (npm install, git commands)
- File modifications and changes
- Test runs and validations
- Decision-making processes

## 📖 API Documentation

### WebSocket Events
```javascript
// Connect to WebSocket
const ws = new WebSocket('ws://localhost:3000');

// Listen for events
ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    // Handle different event types
};
```

### Future REST Endpoints
- `GET /api/v1/workflows` - List all workflows
- `GET /api/v1/activities` - Get activity history
- `POST /api/v1/claude-code/instances` - Create new Claude Code instance
- `GET /api/v1/testing/results` - Get test execution results

## 🗂️ Project Structure

```
CodingAgentWorkflow/
├── public/
│   ├── index.html          # Main HTML interface
│   ├── styles.css          # Styling and animations
│   └── app.js              # Frontend JavaScript
├── src/                    # Future backend modules
├── server.js               # Express server and WebSocket
├── package.json            # Dependencies and scripts
├── CLAUDE.md               # Development guidance
└── README.md              # This file
```

## 🔧 Development

### Scripts
```bash
npm start      # Start production server
npm run dev    # Start development server (future)
npm test       # Run tests (future)
```

### Adding New Features
1. Read `CLAUDE.md` for architecture guidance
2. Follow existing code patterns and conventions
3. Update both frontend and backend components
4. Test thoroughly before committing

## 🔮 Roadmap

### Phase 1: Core Foundation ✅
- [x] Basic web interface with workflow visualization
- [x] Activity timeline with mock data
- [x] Status dashboard and controls
- [x] WebSocket infrastructure

### Phase 2: Real Integration (Current)
- [ ] Claude Code process management
- [ ] File system monitoring
- [ ] Real-time activity parsing
- [ ] Command execution and output capture

### Phase 3: Advanced Features
- [ ] Workflow designer with drag-and-drop
- [ ] Custom workflow templates
- [ ] Advanced analytics and metrics
- [ ] Multi-project support

### Phase 4: Mobile & Enterprise
- [ ] Native iOS app with SwiftUI
- [ ] Native Android app with Kotlin/Compose
- [ ] Cross-platform mobile with React Native/Flutter
- [ ] Enterprise authentication and collaboration
- [ ] Push notifications and offline support

## 🔐 Security

- Environment variables for sensitive configuration
- Input validation and sanitization
- Process isolation for Claude Code instances
- Future: TLS encryption, token-based auth

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built for the Claude Code AI Agent ecosystem
- Inspired by modern DevOps monitoring tools
- Designed for developer productivity and insights

## 📞 Support

- Create an issue for bug reports or feature requests
- Check `CLAUDE.md` for development guidelines
- Review the project roadmap for planned features

---

**Note**: This is currently a basic version with mock data. Real Claude Code integration is planned for Phase 2. The interface demonstrates the intended user experience and functionality.