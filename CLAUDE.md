# CLAUDE.md

Development guidance for Claude Code when working with this repository.

## Project Overview

**AgentOps** is an AI agent monitoring and workflow visualization platform for Claude Code development lifecycle management.

## Architecture

### Core Components
- **Workflow Engine**: 5-step workflow with real-time visualization
- **Claude Integration**: Direct CLI communication with proper tool permissions  
- **Activity Monitor**: Real-time parsing and classification of agent activities
- **File System**: Live monitoring with Chokidar, intelligent change detection

### Tech Stack
- **Frontend**: HTML5/CSS3/JavaScript, WebSocket real-time updates
- **Backend**: Node.js/Express, modular API routes, WebSocket handlers
- **Testing**: Jest with 88.46% coverage (114+ tests, 7 suites)
- **Quality**: 84% branch coverage, comprehensive error handling

## Current Status

**Phase 4 Complete** - Production ready with:
- ✅ 5-step workflow interface (Specification → Location → Tasks → Planning → Execution)
- ✅ Real-time execution monitoring with live metrics
- ✅ Architecture visualization with layer-based activity tracking
- ✅ Enhanced stats: Tasks completed, success rate, execution time, avg task time
- ✅ Project architecture stats synchronized with overall metrics
- ✅ Sharp, angular UI design with Neural Purple theme

## Development Commands

```bash
npm install      # Install dependencies
npm start        # Start production server
npm run dev      # Start development server
npm test         # Run test suite (114 tests)
npm run test:coverage # Coverage report
```

## Critical Implementation Notes

### Claude CLI Tool Permissions
**REQUIRED** for actual file operations:
```javascript
const args = ['--print', '--model', 'sonnet'];
args.push('--allowedTools', 'Write,Read,Bash,Edit');
args.push('--add-dir', workingDir);
```

**Without these flags:**
- Tasks appear to complete but no files are created
- Claude cannot access project directories
- Operations fail silently

### API Structure
Key endpoints:
- `/api/v1/claude-code/instances` - Process management
- `/api/v1/claude-code/live-metrics/:projectPath` - Real-time file metrics
- `/api/v1/filesystem/browse` - Directory navigation
- `/api/v1/claude-code/generate-tasks` - AI task generation

### Testing Guidelines
- **Coverage Target**: 80% minimum (currently 88.46%)
- **Test Structure**: 7 suites with comprehensive mocking
- **API Routes**: 53 dedicated tests with error handling
- **Integration**: Full end-to-end WebSocket and API testing

## Common Issues & Solutions

### Tasks Complete But No Files Created
**Cause**: Missing tool permissions
**Fix**: Ensure `--allowedTools` and `--add-dir` flags are present

### Claude CLI Timeout/Hanging  
**Causes**: Missing permissions, incorrect working directory, malformed prompts
**Solutions**: Verify flags, check project path, validate prompt formatting

### Architecture Stats Not Updating
**Fixed**: Architecture stats now update automatically based on file changes during execution

## File Organization

```
src/
├── api-routes.js       # REST endpoints, Claude integration
├── process-manager.js  # Claude CLI process management  
├── file-monitor.js     # Chokidar file system monitoring
├── websocket-handler.js # Real-time communication
└── activity-parser.js  # Intelligent activity classification

public/
├── index.html          # 5-step workflow interface
├── app.js              # AgentOpsWorkflow class
└── styles.css          # Neural Purple theme, sharp corners

test/                   # 114+ tests across 7 suites
```

## Next Phase

**Phase 5**: Advanced analytics dashboard, multi-project workspace, React/TypeScript migration

## Development Principles

1. **Maintain test coverage** above 80%
2. **Follow existing patterns** for API routes and WebSocket handlers  
3. **Use proper error handling** with comprehensive testing
4. **Ensure Claude CLI permissions** for file operations
5. **Keep UI sharp and angular** with Neural Purple theme
6. **Update both overall and architecture stats** simultaneously

---

Ready for Phase 5 development.