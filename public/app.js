/**
 * AgentOps - AI Agent Workflow Platform
 * Real-time project workflow management and Claude Code integration
 */

class AgentOpsWorkflow {
    constructor() {
        this.currentStep = 1;
        this.maxSteps = 5;
        this.projectData = {};
        this.taskList = [];
        this.claudeInstances = [];
        this.isExecuting = false;
        this.isPaused = false;
        this.websocket = null;
        this.activities = [];
        this.projectType = 'new';
        this.isExistingProject = false;
        this.settings = this.loadSettings();
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupWebSocket();
        this.updateStepIndicators();
        this.validateCurrentStep();
    }

    setupEventListeners() {
        // Navigation controls
        document.getElementById('prev-btn').addEventListener('click', () => this.previousStep());
        document.getElementById('next-btn').addEventListener('click', () => this.nextStep());
        document.getElementById('start-execution-btn').addEventListener('click', () => this.startExecution());

        // Step 1: Project Specification
        ['project-name', 'claude-specification', 'additional-notes', 'existing-project-name'].forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('input', () => this.saveProjectData());
            }
        });

        // Project type selection
        document.querySelectorAll('input[name="project-type"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.handleProjectTypeChange(e.target.value));
        });

        // Existing project folder selection
        document.getElementById('browse-existing-project-btn').addEventListener('click', () => this.openExistingProjectSelector());

        // Settings
        document.getElementById('settings-btn').addEventListener('click', () => this.openSettings());

        // Step 2: Folder Selection
        const browseFolderBtn = document.getElementById('browse-folder-btn');
        if (browseFolderBtn) {
            browseFolderBtn.addEventListener('click', () => this.openFolderSelector());
        } else {
            console.error('browse-folder-btn element not found');
        }
        
        const projectPath = document.getElementById('project-path');
        if (projectPath) {
            projectPath.addEventListener('change', () => this.scanProject());
        } else {
            console.error('project-path element not found');
        }

        // Step 3: Task Management
        document.getElementById('add-custom-task-btn').addEventListener('click', () => this.openCustomTaskModal());
        document.getElementById('regenerate-tasks-btn').addEventListener('click', () => this.regenerateTasks());

        // Execution controls
        document.getElementById('pause-execution-btn').addEventListener('click', () => this.pauseExecution());
        document.getElementById('stop-execution-btn').addEventListener('click', () => this.stopExecution());
        document.getElementById('resume-execution-btn').addEventListener('click', () => this.resumeExecution());

        // Modal controls
        this.setupModalControls();
        this.setupSettingsControls();

        // Activity filters
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.filterActivities(e.target.dataset.filter));
        });
    }

    setupModalControls() {
        // Custom Task Modal
        document.getElementById('add-custom-task-confirm-btn').addEventListener('click', () => this.addCustomTask());
        document.getElementById('cancel-custom-task-btn').addEventListener('click', () => this.closeCustomTaskModal());

        // Folder Select Modal
        document.getElementById('select-folder-btn').addEventListener('click', () => this.selectCurrentFolder());
        document.getElementById('cancel-folder-select-btn').addEventListener('click', () => this.closeFolderSelector());

        // Modal close buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal.id === 'settings-modal') {
                    this.closeSettings();
                } else if (modal.id === 'folder-select-modal') {
                    this.closeFolderSelector();
                } else if (modal.id === 'custom-task-modal') {
                    this.closeCustomTaskModal();
                } else {
                    // Generic modal close with animation
                    if (modal) {
                        modal.classList.remove('show');
                        setTimeout(() => {
                            modal.style.display = 'none';
                        }, 300);
                    }
                }
            });
        });
    }

    setupSettingsControls() {
        // Settings modal event listeners
        document.getElementById('save-settings-btn').addEventListener('click', () => this.applySettings());
        document.getElementById('cancel-settings-btn').addEventListener('click', () => this.closeSettings());
        document.getElementById('reset-settings-btn').addEventListener('click', () => this.resetSettings());

        // Claude Code specific controls
        document.getElementById('detect-claude-btn').addEventListener('click', () => this.autoDetectClaude());
        document.getElementById('test-claude-connection').addEventListener('click', () => this.testClaudeConnection());
    }

    closeSettings() {
        const modal = document.getElementById('settings-modal');
        modal.classList.remove('show');
        // Wait for animation to complete before hiding
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300);
    }

    // Modal helper methods
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            // Force visibility with inline styles
            modal.style.display = 'flex';
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.width = '100%';
            modal.style.height = '100%';
            modal.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            modal.style.zIndex = '9999';
            modal.style.opacity = '1';
            
            // Small delay to ensure display is set before adding show class
            setTimeout(() => {
                modal.classList.add('show');
            }, 10);
            
            return true;
        } else {
            console.error(`Modal ${modalId} not found`);
            return false;
        }
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('show');
            // Wait for animation to complete before hiding
            setTimeout(() => {
                modal.style.display = 'none';
            }, 300);
            return true;
        } else {
            console.error(`Modal ${modalId} not found`);
            return false;
        }
    }

    setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        this.websocket = new WebSocket(`${protocol}//${host}`);

        this.websocket.onopen = () => {
            console.log('WebSocket connected to AgentOps');
        };

        this.websocket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleWebSocketMessage(message);
        };

        this.websocket.onclose = () => {
            console.log('WebSocket disconnected. Attempting to reconnect...');
            setTimeout(() => this.setupWebSocket(), 3000);
        };

        this.websocket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    handleWebSocketMessage(message) {
        switch (message.type) {
            case 'welcome':
                console.log('Connected to AgentOps backend');
                break;
            case 'activityParsed':
                this.addActivity(message.data);
                break;
            case 'instanceCreated':
                this.addClaudeInstance(message.data);
                break;
            case 'instanceTerminated':
                this.removeClaudeInstance(message.data.id);
                break;
            case 'fileChange':
                this.handleFileChange(message.data);
                break;
            case 'processOutput':
                this.handleProcessOutput(message.data);
                break;
            default:
                console.log('Unknown message type:', message.type);
        }
    }

    // Navigation Methods
    nextStep() {
        if (this.currentStep < this.maxSteps && this.validateCurrentStep()) {
            // Special handling for existing projects - skip step 2
            if (this.projectType === 'existing' && this.currentStep === 1) {
                this.currentStep = 3; // Skip to task identification
                this.isExistingProject = true;
            } else {
                this.currentStep++;
            }
            this.updateStepView();
            this.updateStepIndicators();
            this.handleStepEntry();
        }
    }

    previousStep() {
        if (this.currentStep > 1) {
            // Special handling for existing projects - skip step 2 when going back
            if (this.isExistingProject && this.currentStep === 3) {
                this.currentStep = 1; // Go back to specification
            } else {
                this.currentStep--;
            }
            this.updateStepView();
            this.updateStepIndicators();
        }
    }

    updateStepView() {
        // Hide all steps
        document.querySelectorAll('.workflow-step').forEach(step => {
            step.classList.remove('active');
        });

        // Show current step
        document.getElementById(`step-${this.currentStep}`).classList.add('active');

        // Update navigation buttons
        document.getElementById('prev-btn').disabled = (this.currentStep === 1);
        
        if (this.currentStep === this.maxSteps) {
            document.getElementById('next-btn').style.display = 'none';
            document.getElementById('start-execution-btn').style.display = 'inline-block';
        } else {
            document.getElementById('next-btn').style.display = 'inline-block';
            document.getElementById('start-execution-btn').style.display = 'none';
        }
    }

    updateStepIndicators() {
        document.querySelectorAll('.step-indicator').forEach((indicator, index) => {
            const stepNum = index + 1;
            const stepNumber = indicator.querySelector('.step-number');
            
            indicator.classList.remove('completed', 'active', 'pending');
            
            if (stepNum < this.currentStep) {
                indicator.classList.add('completed');
                stepNumber.textContent = '✓';
            } else if (stepNum === this.currentStep) {
                indicator.classList.add('active');
                stepNumber.textContent = stepNum;
            } else {
                indicator.classList.add('pending');
                stepNumber.textContent = stepNum;
            }
        });
    }

    validateCurrentStep() {
        switch (this.currentStep) {
            case 1:
                return this.validateProjectSpecification();
            case 2:
                return this.validateFolderSelection();
            case 3:
                return this.validateTaskIdentification();
            case 4:
                return this.validateTaskPlanning();
            case 5:
                return true;
            default:
                return false;
        }
    }

    validateProjectSpecification() {
        if (this.projectType === 'existing') {
            const existingPath = document.getElementById('existing-project-path').value.trim();
            return existingPath.length > 0;
        } else {
            const name = document.getElementById('project-name').value.trim();
            const specification = document.getElementById('claude-specification').value.trim();
            return name.length > 0 && specification.length > 50;
        }
    }

    validateFolderSelection() {
        return document.getElementById('project-path').value.trim().length > 0;
    }

    validateTaskIdentification() {
        return this.taskList.length > 0;
    }

    validateTaskPlanning() {
        return this.taskList.some(task => task.selected);
    }

    handleStepEntry() {
        switch (this.currentStep) {
            case 3:
                this.generateTasks();
                break;
            case 4:
                this.setupTaskPlanning();
                break;
            case 5:
                this.setupExecutionView();
                break;
        }
    }

    // Step 1: Project Specification
    saveProjectData() {
        if (this.projectType === 'existing') {
            this.projectData = {
                type: 'existing',
                name: document.getElementById('existing-project-name').value || 'Detected Project Name',
                path: document.getElementById('existing-project-path').value,
                analysis: this.projectAnalysis || {}
            };
        } else {
            this.projectData = {
                type: 'new',
                name: document.getElementById('project-name').value,
                claudeSpecification: document.getElementById('claude-specification').value,
                additionalNotes: document.getElementById('additional-notes').value,
                extractedDetails: this.extractedDetails || {}
            };
        }
    }

    handleProjectTypeChange(type) {
        this.projectType = type;
        const newSection = document.getElementById('new-project-section');
        const existingSection = document.getElementById('existing-project-section');
        
        if (type === 'existing') {
            newSection.style.display = 'none';
            existingSection.style.display = 'block';
        } else {
            newSection.style.display = 'block';
            existingSection.style.display = 'none';
        }
        
        this.saveProjectData();
    }

    openExistingProjectSelector() {
        // Reuse the existing folder selector modal
        if (this.showModal('folder-select-modal')) {
            this.isSelectingExistingProject = true;
            this.loadFolderContents();
        }
    }

    async analyzeExistingProject(projectPath) {
        try {
            const response = await fetch('/api/v1/filesystem/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectPath })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to analyze project: ${response.statusText}`);
            }
            
            const analysis = await response.json();
            this.projectAnalysis = analysis;
            
            this.displayProjectAnalysis(analysis);
            
        } catch (error) {
            console.error('Error analyzing project:', error);
            this.displayProjectAnalysis({
                projectName: projectPath.split('/').pop(),
                type: 'Unknown',
                files: [],
                technologies: [],
                status: 'Analysis failed - proceeding with basic information'
            });
        }
    }

    displayProjectAnalysis(analysis) {
        const analysisSection = document.getElementById('project-analysis');
        const resultsDiv = document.getElementById('analysis-results');
        
        // Auto-fill project name if not set
        const nameInput = document.getElementById('existing-project-name');
        if (!nameInput.value && analysis.projectName) {
            nameInput.value = analysis.projectName;
        }
        
        resultsDiv.innerHTML = `
            <div class="analysis-item">
                <div class="analysis-item-icon">📦</div>
                <div class="analysis-item-content">
                    <div class="analysis-item-title">Project Type</div>
                    <div class="analysis-item-description">${analysis.type || 'Unknown'}</div>
                </div>
            </div>
            <div class="analysis-item">
                <div class="analysis-item-icon">📁</div>
                <div class="analysis-item-content">
                    <div class="analysis-item-title">Files Found</div>
                    <div class="analysis-item-description">${analysis.fileCount || 0} files detected</div>
                </div>
            </div>
            <div class="analysis-item">
                <div class="analysis-item-icon">⚙️</div>
                <div class="analysis-item-content">
                    <div class="analysis-item-title">Technologies</div>
                    <div class="analysis-item-description">${(analysis.technologies || []).join(', ') || 'None detected'}</div>
                </div>
            </div>
            <div class="analysis-item">
                <div class="analysis-item-icon">📊</div>
                <div class="analysis-item-content">
                    <div class="analysis-item-title">Status</div>
                    <div class="analysis-item-description">${analysis.status || 'Ready for task identification'}</div>
                </div>
            </div>
        `;
        
        analysisSection.style.display = 'block';
        this.saveProjectData();
    }

    // Step 2: Folder Selection
    openFolderSelector() {
        if (this.showModal('folder-select-modal')) {
            // Start from user's home directory
            this.loadFolderContents();
        }
    }

    async loadFolderContents(path = null) {
        try {
            const response = await fetch(`/api/v1/filesystem/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`);
            
            if (!response.ok) {
                throw new Error(`Failed to load folder contents: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            const currentPathElement = document.getElementById('current-path');
            const folderList = document.getElementById('folder-list');
            
            if (!currentPathElement || !folderList) {
                console.error('Required modal elements not found');
                return;
            }
            
            currentPathElement.textContent = data.currentPath;
            
            if (!data.items || data.items.length === 0) {
                folderList.innerHTML = '<div class="folder-item"><span class="folder-name">No accessible folders found</span></div>';
                return;
            }

            folderList.innerHTML = data.items.map(item => `
                <div class="folder-item" data-path="${item.path}" data-type="${item.type}">
                    <span class="folder-icon">${this.getFolderIcon(item.type)}</span>
                    <span class="folder-name">${item.name}</span>
                </div>
            `).join('');

            folderList.querySelectorAll('.folder-item').forEach(item => {
                item.addEventListener('click', () => {
                    const newPath = item.dataset.path;
                    const itemType = item.dataset.type;
                    
                    if (itemType === 'folder' || itemType === 'parent') {
                        this.loadFolderContents(newPath);
                    }
                });
            });
        } catch (error) {
            console.error('Error loading folder contents:', error);
            const folderList = document.getElementById('folder-list');
            folderList.innerHTML = `<div class="folder-item error"><span class="folder-name">Error: ${error.message}</span></div>`;
        }
    }

    getFolderIcon(type) {
        switch (type) {
            case 'parent': return '⬆️';
            case 'folder': return '📁';
            default: return '📄';
        }
    }

    selectCurrentFolder() {
        const currentPath = document.getElementById('current-path').textContent;
        
        if (this.isSelectingExistingProject) {
            document.getElementById('existing-project-path').value = currentPath;
            this.isSelectingExistingProject = false;
            this.closeFolderSelector();
            this.analyzeExistingProject(currentPath);
        } else {
            document.getElementById('project-path').value = currentPath;
            this.closeFolderSelector();
            this.scanProject();
        }
    }

    closeFolderSelector() {
        this.hideModal('folder-select-modal');
    }

    async scanProject() {
        const projectPath = document.getElementById('project-path').value;
        if (!projectPath) return;

        try {
            // Start monitoring the selected folder
            this.sendWebSocketMessage({
                type: 'startMonitoring',
                projectPath: projectPath,
                options: {
                    ignored: ['node_modules', '.git', 'dist', 'build']
                }
            });

            // Show scan results
            document.getElementById('project-scan-results').style.display = 'block';
            document.getElementById('scan-summary').innerHTML = `
                <div class="scan-item">📁 Project Path: ${projectPath}</div>
                <div class="scan-item">🔍 Scanning for files...</div>
                <div class="scan-item">⚙️ Monitoring enabled</div>
            `;

        } catch (error) {
            console.error('Error scanning project:', error);
        }
    }

    // Step 3: Task Identification
    async generateTasks() {
        document.getElementById('task-loading').style.display = 'block';
        document.getElementById('identified-tasks').style.display = 'none';

        // Simulate task generation delay
        setTimeout(() => {
            this.taskList = this.generateMockTasks();
            this.renderTaskList();
            
            document.getElementById('task-loading').style.display = 'none';
            document.getElementById('identified-tasks').style.display = 'block';
        }, 2000);
    }

    generateMockTasks() {
        const projectType = this.projectData.techStack.toLowerCase();
        const baseTasks = [
            {
                id: 1,
                title: 'Project Setup',
                description: 'Initialize project structure and configuration',
                priority: 'high',
                estimated: '30 min',
                selected: true
            },
            {
                id: 2,
                title: 'Install Dependencies',
                description: 'Install required packages and dependencies',
                priority: 'high',
                estimated: '15 min',
                selected: true
            },
            {
                id: 3,
                title: 'Create Core Components',
                description: 'Build main application components',
                priority: 'medium',
                estimated: '2 hours',
                selected: true
            },
            {
                id: 4,
                title: 'Implement Features',
                description: 'Add specific features based on requirements',
                priority: 'medium',
                estimated: '3 hours',
                selected: true
            },
            {
                id: 5,
                title: 'Add Testing',
                description: 'Create unit and integration tests',
                priority: 'medium',
                estimated: '1 hour',
                selected: false
            },
            {
                id: 6,
                title: 'Documentation',
                description: 'Create README and documentation',
                priority: 'low',
                estimated: '30 min',
                selected: false
            }
        ];

        return baseTasks;
    }

    renderTaskList() {
        const container = document.getElementById('tasks-container');
        container.innerHTML = this.taskList.map(task => `
            <div class="task-item ${task.selected ? 'selected' : ''}" data-task-id="${task.id}">
                <div class="task-header">
                    <input type="checkbox" ${task.selected ? 'checked' : ''} 
                           onchange="agentOps.toggleTaskSelection(${task.id})" />
                    <h4>${task.title}</h4>
                    <span class="task-priority priority-${task.priority}">${task.priority}</span>
                </div>
                <p class="task-description">${task.description}</p>
                <div class="task-meta">
                    <span class="task-estimate">📅 ${task.estimated}</span>
                </div>
            </div>
        `).join('');
    }

    toggleTaskSelection(taskId) {
        const task = this.taskList.find(t => t.id === taskId);
        if (task) {
            task.selected = !task.selected;
            this.renderTaskList();
        }
    }

    openCustomTaskModal() {
        this.showModal('custom-task-modal');
    }

    closeCustomTaskModal() {
        this.hideModal('custom-task-modal');
        // Clear form
        document.getElementById('custom-task-title').value = '';
        document.getElementById('custom-task-description').value = '';
        document.getElementById('custom-task-priority').value = 'medium';
    }

    addCustomTask() {
        const title = document.getElementById('custom-task-title').value.trim();
        const description = document.getElementById('custom-task-description').value.trim();
        const priority = document.getElementById('custom-task-priority').value;

        if (title && description) {
            const newTask = {
                id: this.taskList.length + 1,
                title,
                description,
                priority,
                estimated: 'TBD',
                selected: true,
                custom: true
            };

            this.taskList.push(newTask);
            this.renderTaskList();
            this.closeCustomTaskModal();
        }
    }

    regenerateTasks() {
        this.generateTasks();
    }

    // Step 4: Task Planning
    setupTaskPlanning() {
        const selectedTasks = this.taskList.filter(task => task.selected);
        const orderList = document.getElementById('task-order-list');
        
        orderList.innerHTML = selectedTasks.map((task, index) => `
            <div class="sortable-task" data-task-id="${task.id}">
                <div class="task-order-number">${index + 1}</div>
                <div class="task-info">
                    <h4>${task.title}</h4>
                    <p>${task.description}</p>
                </div>
                <div class="task-controls">
                    <button class="btn-small" onclick="agentOps.moveTaskUp(${task.id})">↑</button>
                    <button class="btn-small" onclick="agentOps.moveTaskDown(${task.id})">↓</button>
                </div>
            </div>
        `).join('');
    }

    moveTaskUp(taskId) {
        // Implementation for moving tasks up in order
        console.log('Move task up:', taskId);
    }

    moveTaskDown(taskId) {
        // Implementation for moving tasks down in order
        console.log('Move task down:', taskId);
    }

    // Step 5: Execution
    setupExecutionView() {
        this.renderTaskProgress();
        this.renderClaudeInstances();
        this.renderLiveActivities();
    }

    async startExecution() {
        this.isExecuting = true;
        this.isPaused = false;
        
        document.getElementById('pause-execution-btn').disabled = false;
        document.getElementById('stop-execution-btn').disabled = false;
        document.getElementById('start-execution-btn').disabled = true;

        // Start Claude Code instances based on settings
        const maxInstances = parseInt(document.getElementById('claude-instance-limit').value);
        const executionMode = document.getElementById('execution-mode').value;

        console.log(`Starting execution with ${maxInstances} instances in ${executionMode} mode`);

        // Begin task execution
        await this.executeNextTask();
    }

    async executeNextTask() {
        if (!this.isExecuting || this.isPaused) return;

        const pendingTasks = this.taskList.filter(task => task.selected && !task.completed);
        if (pendingTasks.length === 0) {
            console.log('All tasks completed!');
            return;
        }

        const nextTask = pendingTasks[0];
        nextTask.status = 'executing';
        
        // Create Claude instance for task
        this.sendWebSocketMessage({
            type: 'spawnInstance',
            command: `claude code --task "${nextTask.title}"`,
            options: {
                cwd: this.projectData.projectPath
            }
        });

        this.renderTaskProgress();
    }

    pauseExecution() {
        this.isPaused = true;
        document.getElementById('pause-execution-btn').style.display = 'none';
        document.getElementById('resume-execution-btn').style.display = 'inline-block';
    }

    resumeExecution() {
        this.isPaused = false;
        document.getElementById('pause-execution-btn').style.display = 'inline-block';
        document.getElementById('resume-execution-btn').style.display = 'none';
        this.executeNextTask();
    }

    stopExecution() {
        this.isExecuting = false;
        this.isPaused = false;
        
        // Terminate all Claude instances
        this.claudeInstances.forEach(instance => {
            this.sendWebSocketMessage({
                type: 'terminateInstance',
                instanceId: instance.id
            });
        });

        document.getElementById('start-execution-btn').disabled = false;
    }

    // Activity Management
    addActivity(activity) {
        this.activities.unshift(activity);
        if (this.activities.length > 100) {
            this.activities.pop();
        }
        this.renderLiveActivities();
    }

    renderLiveActivities() {
        const timeline = document.getElementById('live-activity-timeline');
        if (!timeline) return;

        timeline.innerHTML = this.activities.map(activity => `
            <div class="activity-item ${activity.type}" data-type="${activity.type}">
                <div class="activity-icon">${this.getActivityIcon(activity.type)}</div>
                <div class="activity-content">
                    <div class="activity-description">${activity.parsedContent?.summary || activity.rawData}</div>
                    <div class="activity-meta">
                        <span class="activity-time">${this.formatTime(activity.timestamp)}</span>
                        <span class="activity-importance">Priority: ${activity.importance}/10</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    filterActivities(filter) {
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-filter="${filter}"]`).classList.add('active');

        const activities = document.querySelectorAll('.activity-item');
        activities.forEach(activity => {
            if (filter === 'all' || activity.dataset.type === filter) {
                activity.style.display = 'block';
            } else {
                activity.style.display = 'none';
            }
        });
    }

    renderTaskProgress() {
        const progressList = document.getElementById('task-progress-list');
        if (!progressList) return;

        const selectedTasks = this.taskList.filter(task => task.selected);
        progressList.innerHTML = selectedTasks.map(task => `
            <div class="task-progress-item ${task.status || 'pending'}">
                <div class="task-status-icon">
                    ${task.status === 'completed' ? '✅' : 
                      task.status === 'executing' ? '🔄' : 
                      task.status === 'error' ? '❌' : '⏳'}
                </div>
                <div class="task-info">
                    <h4>${task.title}</h4>
                    <p>${task.description}</p>
                    <div class="task-progress-bar">
                        <div class="progress-fill" style="width: ${task.progress || 0}%"></div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    renderClaudeInstances() {
        const instancesList = document.getElementById('claude-instances-list');
        if (!instancesList) return;

        instancesList.innerHTML = this.claudeInstances.map(instance => `
            <div class="claude-instance ${instance.status}">
                <div class="instance-header">
                    <span class="instance-id">${instance.id}</span>
                    <span class="instance-status">${instance.status}</span>
                </div>
                <div class="instance-info">
                    <p class="instance-command">${instance.command}</p>
                    <p class="instance-uptime">Uptime: ${this.calculateUptime(instance.startTime)}</p>
                </div>
                <div class="instance-controls">
                    <button class="btn-small" onclick="agentOps.terminateInstance('${instance.id}')">Terminate</button>
                </div>
            </div>
        `).join('');
    }

    addClaudeInstance(instance) {
        this.claudeInstances.push(instance);
        this.renderClaudeInstances();
    }

    removeClaudeInstance(instanceId) {
        this.claudeInstances = this.claudeInstances.filter(instance => instance.id !== instanceId);
        this.renderClaudeInstances();
    }

    terminateInstance(instanceId) {
        this.sendWebSocketMessage({
            type: 'terminateInstance',
            instanceId
        });
    }

    // Utility Methods
    sendWebSocketMessage(message) {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify(message));
        }
    }

    getActivityIcon(type) {
        const icons = {
            command: '⚡',
            git_command: '📚',
            file_change: '📝',
            npm_command: '📦',
            test_pass: '✅',
            test_fail: '❌',
            error: '🚨',
            completion: '🎉'
        };
        return icons[type] || '📄';
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString();
    }

    calculateUptime(startTime) {
        const now = new Date();
        const start = new Date(startTime);
        const diff = Math.floor((now - start) / 1000);
        const minutes = Math.floor(diff / 60);
        const seconds = diff % 60;
        return `${minutes}m ${seconds}s`;
    }

    handleFileChange(data) {
        console.log('File changed:', data);
    }

    handleProcessOutput(data) {
        console.log('Process output:', data);
    }

    // Settings Management
    loadSettings() {
        const defaultSettings = {
            aiAgent: {
                provider: 'claude-code',
                claudeCodePath: '',
                claudeCodeArgs: '--model sonnet --max-tokens 8000',
                maxConcurrentInstances: 3,
                autoRestartFailed: true
            },
            general: {
                activityHistoryLimit: 1000,
                autoSaveWorkflows: true,
                showDebugInfo: false
            }
        };

        try {
            const saved = localStorage.getItem('agentops-settings');
            return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
        } catch (error) {
            console.error('Error loading settings:', error);
            return defaultSettings;
        }
    }

    saveSettings() {
        try {
            localStorage.setItem('agentops-settings', JSON.stringify(this.settings));
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }

    openSettings() {
        this.populateSettingsForm();
        if (this.showModal('settings-modal')) {
            this.checkClaudeCodeAvailability();
        }
    }

    populateSettingsForm() {
        // AI Agent settings
        document.getElementById('ai-agent-provider').value = this.settings.aiAgent.provider;
        document.getElementById('claude-code-path').value = this.settings.aiAgent.claudeCodePath;
        document.getElementById('claude-code-args').value = this.settings.aiAgent.claudeCodeArgs;
        document.getElementById('max-concurrent-instances').value = this.settings.aiAgent.maxConcurrentInstances;
        document.getElementById('auto-restart-failed').checked = this.settings.aiAgent.autoRestartFailed;

        // General settings
        document.getElementById('activity-history-limit').value = this.settings.general.activityHistoryLimit;
        document.getElementById('auto-save-workflows').checked = this.settings.general.autoSaveWorkflows;
        document.getElementById('show-debug-info').checked = this.settings.general.showDebugInfo;
    }

    async checkClaudeCodeAvailability() {
        const availabilitySpan = document.getElementById('claude-availability');
        const versionSpan = document.getElementById('claude-version');
        const instancesSpan = document.getElementById('claude-active-instances');

        availabilitySpan.textContent = 'Checking...';
        availabilitySpan.className = 'status-value status-info';

        try {
            const response = await fetch('/api/v1/claude-code/status');
            
            if (response.ok) {
                const status = await response.json();
                
                availabilitySpan.textContent = status.available ? 'Available' : 'Not Available';
                availabilitySpan.className = `status-value ${status.available ? 'status-success' : 'status-error'}`;
                
                versionSpan.textContent = status.version || 'Unknown';
                instancesSpan.textContent = status.activeInstances || '0';
                
                // Auto-fill path if detected and not already set
                if (status.detectedPath && !this.settings.aiAgent.claudeCodePath) {
                    document.getElementById('claude-code-path').value = status.detectedPath;
                }
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Error checking Claude Code availability:', error);
            availabilitySpan.textContent = 'Error checking';
            availabilitySpan.className = 'status-value status-error';
            versionSpan.textContent = 'Unknown';
            instancesSpan.textContent = '0';
        }
    }

    async testClaudeConnection() {
        const testBtn = document.getElementById('test-claude-connection');
        const originalText = testBtn.textContent;
        
        testBtn.textContent = '🔄 Testing...';
        testBtn.disabled = true;

        try {
            const response = await fetch('/api/v1/claude-code/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: document.getElementById('claude-code-path').value,
                    args: document.getElementById('claude-code-args').value.split(' ').filter(arg => arg.trim())
                })
            });

            const result = await response.json();
            
            if (response.ok && result.success) {
                testBtn.textContent = '✅ Connection OK';
                testBtn.style.backgroundColor = '#2ecc71';
                setTimeout(() => {
                    testBtn.textContent = originalText;
                    testBtn.style.backgroundColor = '';
                    testBtn.disabled = false;
                }, 3000);
            } else {
                throw new Error(result.error || 'Connection test failed');
            }
        } catch (error) {
            console.error('Claude Code connection test failed:', error);
            testBtn.textContent = '❌ Test Failed';
            testBtn.style.backgroundColor = '#e74c3c';
            
            setTimeout(() => {
                testBtn.textContent = originalText;
                testBtn.style.backgroundColor = '';
                testBtn.disabled = false;
            }, 3000);
            
            alert(`Connection test failed: ${error.message}`);
        }
    }

    async autoDetectClaude() {
        const detectBtn = document.getElementById('detect-claude-btn');
        const pathInput = document.getElementById('claude-code-path');
        const originalText = detectBtn.textContent;
        
        detectBtn.textContent = '🔍 Detecting...';
        detectBtn.disabled = true;

        try {
            const response = await fetch('/api/v1/claude-code/detect');
            const result = await response.json();
            
            if (response.ok && result.path) {
                pathInput.value = result.path;
                detectBtn.textContent = '✅ Found';
                detectBtn.style.backgroundColor = '#2ecc71';
                
                setTimeout(() => {
                    detectBtn.textContent = originalText;
                    detectBtn.style.backgroundColor = '';
                    detectBtn.disabled = false;
                }, 2000);
            } else {
                throw new Error(result.error || 'Claude Code not found');
            }
        } catch (error) {
            console.error('Auto-detection failed:', error);
            detectBtn.textContent = '❌ Not Found';
            detectBtn.style.backgroundColor = '#e74c3c';
            
            setTimeout(() => {
                detectBtn.textContent = originalText;
                detectBtn.style.backgroundColor = '';
                detectBtn.disabled = false;
            }, 3000);
            
            alert(`Auto-detection failed: ${error.message}`);
        }
    }

    applySettings() {
        // Collect settings from form
        this.settings = {
            aiAgent: {
                provider: document.getElementById('ai-agent-provider').value,
                claudeCodePath: document.getElementById('claude-code-path').value,
                claudeCodeArgs: document.getElementById('claude-code-args').value,
                maxConcurrentInstances: parseInt(document.getElementById('max-concurrent-instances').value),
                autoRestartFailed: document.getElementById('auto-restart-failed').checked
            },
            general: {
                activityHistoryLimit: parseInt(document.getElementById('activity-history-limit').value),
                autoSaveWorkflows: document.getElementById('auto-save-workflows').checked,
                showDebugInfo: document.getElementById('show-debug-info').checked
            }
        };

        this.saveSettings();
        this.closeSettings();
        
        // Update activity history limit
        if (this.activities.length > this.settings.general.activityHistoryLimit) {
            this.activities = this.activities.slice(0, this.settings.general.activityHistoryLimit);
        }
        
        console.log('Settings applied:', this.settings);
    }

    resetSettings() {
        if (confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
            localStorage.removeItem('agentops-settings');
            this.settings = this.loadSettings();
            this.populateSettingsForm();
        }
    }

    // Step 1: Claude Integration Functions
    togglePreview() {
        const previewSection = document.getElementById('spec-preview');
        const specification = document.getElementById('claude-specification').value.trim();
        
        if (previewSection.style.display === 'none' || !previewSection.style.display) {
            if (specification) {
                document.getElementById('preview-content').textContent = specification;
                previewSection.style.display = 'block';
                event.target.textContent = '👁️ Hide Preview';
            } else {
                alert('Please paste a Claude specification first.');
            }
        } else {
            previewSection.style.display = 'none';
            event.target.textContent = '👁️ Preview Specification';
        }
    }

    extractProjectDetails() {
        const specification = document.getElementById('claude-specification').value.trim();
        
        if (!specification) {
            alert('Please paste a Claude specification first.');
            return;
        }

        try {
            // Simple markdown parsing to extract key information
            const lines = specification.split('\n');
            const details = {
                projectName: '',
                description: '',
                features: [],
                techStack: [],
                timeline: '',
                risks: []
            };

            let currentSection = '';
            
            for (let line of lines) {
                line = line.trim();
                
                // Extract project name from first h1
                if (line.startsWith('# ') && !details.projectName) {
                    details.projectName = line.substring(2).trim();
                    continue;
                }
                
                // Detect sections
                if (line.startsWith('## ')) {
                    currentSection = line.substring(3).toLowerCase();
                    continue;
                }
                
                // Extract content based on current section
                if (line.startsWith('- ') || line.startsWith('* ')) {
                    const item = line.substring(2).trim();
                    
                    if (currentSection.includes('feature') || currentSection.includes('functionality')) {
                        details.features.push(item);
                    } else if (currentSection.includes('technical') || currentSection.includes('tech') || currentSection.includes('stack')) {
                        details.techStack.push(item);
                    } else if (currentSection.includes('risk')) {
                        details.risks.push(item);
                    }
                } else if (line && !line.startsWith('#') && currentSection.includes('overview')) {
                    if (!details.description) {
                        details.description = line;
                    }
                }
            }

            this.extractedDetails = details;
            
            // Auto-fill project name if extracted
            if (details.projectName && !document.getElementById('project-name').value) {
                document.getElementById('project-name').value = details.projectName;
            }

            // Show extraction results
            const resultText = `
Extracted Details:
• Project: ${details.projectName || 'Not found'}
• Description: ${details.description ? details.description.substring(0, 100) + '...' : 'Not found'}
• Features: ${details.features.length} found
• Tech Stack: ${details.techStack.length} items found
• Risks: ${details.risks.length} identified

This information will be used to generate tasks in Step 3.
            `.trim();
            
            alert(resultText);
            this.saveProjectData();
            
        } catch (error) {
            console.error('Error extracting project details:', error);
            alert('Error parsing specification. Please check the format.');
        }
    }
}

// Global functions for HTML onclick handlers
function copyPrompt() {
    const promptText = document.getElementById('claude-prompt').textContent;
    navigator.clipboard.writeText(promptText).then(() => {
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = '✅ Copied!';
        btn.style.background = '#2ecc71';
        
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '#667eea';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
        alert('Failed to copy prompt. Please copy manually.');
    });
}

function togglePreview() {
    if (window.agentOps) {
        agentOps.togglePreview();
    }
}

function extractProjectDetails() {
    if (window.agentOps) {
        agentOps.extractProjectDetails();
    }
}

function reanalyzeProject() {
    if (window.agentOps) {
        const projectPath = document.getElementById('existing-project-path').value;
        if (projectPath) {
            agentOps.analyzeExistingProject(projectPath);
        }
    }
}

function viewProjectFiles() {
    if (window.agentOps) {
        const projectPath = document.getElementById('existing-project-path').value;
        if (projectPath) {
            agentOps.openFolderSelector();
            agentOps.loadFolderContents(projectPath);
        }
    }
}


// Initialize the app when DOM is loaded
let agentOps;
document.addEventListener('DOMContentLoaded', () => {
    agentOps = new AgentOpsWorkflow();
    window.agentOps = agentOps; // Make it globally accessible
});