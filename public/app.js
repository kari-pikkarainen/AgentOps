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
        this.pauseAfterNextTask = false;
        this.stopAfterNextTask = false;
        
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

        // AI Spec Generation
        document.getElementById('generate-spec-btn').addEventListener('click', () => this.openSpecGeneratorModal());

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
        document.getElementById('pause-after-next-btn').addEventListener('click', () => this.setPauseAfterNextTask());
        document.getElementById('stop-after-next-btn').addEventListener('click', () => this.setStopAfterNextTask());

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

        // AI Spec Generator Modal
        document.getElementById('generate-spec-confirm-btn').addEventListener('click', () => this.generateAISpecification());
        document.getElementById('cancel-spec-gen-btn').addEventListener('click', () => this.closeSpecGeneratorModal());

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
                } else if (modal.id === 'ai-spec-generator-modal') {
                    this.closeSpecGeneratorModal();
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
        this.projectData.type = type;
        this.isExistingProject = (type === 'existing');
        
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

        // Reset progress UI
        this.resetProgressUI();
        
        // Step 1: Analyze project context
        await this.updateProgress('analyze', 'Analyzing project structure and context...');
        await this.delay(500);
        
        // Step 2: Prepare AI prompt
        await this.updateProgress('identify', 'Preparing AI analysis with project details...');
        await this.delay(300);
        
        // Step 3: Generate tasks with AI
        await this.updateProgress('generate', 'Generating intelligent tasks with Claude Code...');
        const tasks = await this.generateIntelligentTasks();
        await this.delay(200);
        
        // Step 4: Process and prioritize
        await this.updateProgress('prioritize', 'Processing AI recommendations and prioritizing...');
        this.taskList = tasks; // Tasks are already prioritized by AI
        await this.delay(400);
        
        // Show final summary
        this.showTaskSummary();
        await this.delay(800);
        
        // Complete and show results
        this.completeAllProgressSteps();
        this.renderTaskList();
        
        setTimeout(() => {
            document.getElementById('task-loading').style.display = 'none';
            document.getElementById('identified-tasks').style.display = 'block';
        }, 300);
    }

    // Task Generation Helper Methods
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    resetProgressUI() {
        // Reset all progress steps to default state
        document.querySelectorAll('.progress-step').forEach(step => {
            step.classList.remove('active', 'completed');
        });
        
        // Hide task summary
        document.getElementById('task-summary').style.display = 'none';
        
        // Reset status text
        document.getElementById('analysis-status').textContent = 'Analyzing project and generating tasks...';
    }

    async updateProgress(stepId, statusText) {
        // Mark previous steps as completed
        const stepIds = ['analyze', 'identify', 'generate', 'prioritize'];
        const currentIndex = stepIds.indexOf(stepId);
        
        stepIds.forEach((id, index) => {
            const element = document.getElementById(`step-${id}`);
            if (index < currentIndex) {
                element.classList.remove('active');
                element.classList.add('completed');
            } else if (index === currentIndex) {
                element.classList.remove('completed');
                element.classList.add('active');
            } else {
                element.classList.remove('active', 'completed');
            }
        });
        
        // Update status text
        document.getElementById('analysis-status').textContent = statusText;
    }

    completeAllProgressSteps() {
        document.querySelectorAll('.progress-step').forEach(step => {
            step.classList.remove('active');
            step.classList.add('completed');
        });
        document.getElementById('analysis-status').textContent = 'Task analysis completed successfully!';
    }

    showTaskSummary() {
        const taskCount = this.taskList.length;
        const highPriorityCount = this.taskList.filter(task => task.priority === 'high').length;
        const totalTime = this.calculateTotalEstimatedTime();
        
        document.getElementById('task-count').textContent = taskCount;
        document.getElementById('high-priority-count').textContent = highPriorityCount;
        document.getElementById('total-time').textContent = totalTime;
        document.getElementById('task-summary').style.display = 'flex';
    }

    calculateTotalEstimatedTime() {
        let totalMinutes = 0;
        
        this.taskList.forEach(task => {
            const timeStr = task.estimated || '0 min';
            if (timeStr.includes('min')) {
                totalMinutes += parseInt(timeStr) || 0;
            } else if (timeStr.includes('hour') || timeStr.includes('h')) {
                totalMinutes += (parseInt(timeStr) || 0) * 60;
            }
        });
        
        if (totalMinutes >= 60) {
            const hours = Math.floor(totalMinutes / 60);
            const mins = totalMinutes % 60;
            return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
        } else {
            return `${totalMinutes}m`;
        }
    }

    async generateIntelligentTasks() {
        try {
            // Use the selected AI agent to generate real tasks
            const tasks = await this.generateTasksWithAI();
            return this.prioritizeAndEstimateTasks(tasks);
        } catch (error) {
            console.error('Failed to generate tasks with AI:', error);
            // Fallback to basic task structure if AI fails
            return this.generateFallbackTasks();
        }
    }

    async generateTasksWithAI() {
        const projectContext = this.buildProjectContext();
        const aiPrompt = this.buildTaskGenerationPrompt(projectContext);
        
        try {
            // Send request to Claude Code instance to generate tasks
            const response = await fetch('/api/v1/claude-code/generate-tasks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: aiPrompt,
                    projectContext: projectContext
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return this.parseAITaskResponse(data.tasks);
        } catch (error) {
            console.error('AI task generation failed:', error);
            throw error;
        }
    }


    prioritizeAndEstimateTasks(tasks) {
        // Sort tasks by priority and add better estimates
        const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
        
        return tasks.sort((a, b) => {
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
    }

    buildProjectContext() {
        const context = {
            projectType: this.isExistingProject ? 'existing' : 'new',
            projectPath: this.projectData.path || null,
            projectName: this.projectData.name || 'Untitled Project',
            specification: this.projectData.specification || null,
            technologies: this.projectAnalysis?.technologies || [],
            fileStructure: this.projectAnalysis?.structure || null,
            hasTests: this.projectAnalysis?.hasTests || false,
            hasDocumentation: this.projectAnalysis?.hasReadme || false,
            packageJson: this.projectAnalysis?.packageInfo || null
        };
        
        return context;
    }
    
    buildTaskGenerationPrompt(context) {
        const basePrompt = `You are an expert software development assistant. Generate a list of specific, actionable development tasks for this project.

Project Context:
- Type: ${context.projectType} project
- Name: ${context.projectName}
- Technologies: ${context.technologies.join(', ') || 'Not detected'}
- Has Tests: ${context.hasTests ? 'Yes' : 'No'}
- Has Documentation: ${context.hasDocumentation ? 'Yes' : 'No'}
`;

        let specificPrompt = '';
        
        if (context.projectType === 'existing') {
            specificPrompt = `
This is an EXISTING project that needs improvement and maintenance. DO NOT suggest basic setup tasks like "install dependencies" or "initialize project".

Focus on:
- Improving code quality and architecture
- Adding/improving tests and documentation
- Security audits and dependency updates
- Performance optimizations
- Adding missing features based on the codebase
- Technology-specific improvements

Project Analysis:
${context.fileStructure ? 'File structure: ' + JSON.stringify(context.fileStructure, null, 2) : 'File structure not available'}
`;
        } else {
            specificPrompt = `
This is a NEW project that needs to be built from scratch.

Specification:
${context.specification || 'No specification provided'}

Focus on:
- Project setup and initialization
- Core architecture and structure
- Feature implementation
- Testing setup
- Documentation creation
- Deployment preparation
`;
        }
        
        const formatPrompt = `
Return ONLY a JSON array of tasks in this exact format:
[
  {
    "title": "Task title",
    "description": "Detailed description of what needs to be done",
    "priority": "high|medium|low",
    "estimated": "time estimate (e.g. 30min, 1h, 2h)",
    "category": "setup|feature|testing|documentation|optimization|security"
  }
]

Generate 6-10 tasks. Be specific and actionable. No markdown formatting, just valid JSON.`;
        
        return basePrompt + specificPrompt + formatPrompt;
    }
    
    parseAITaskResponse(aiResponse) {
        try {
            let tasks;
            if (typeof aiResponse === 'string') {
                // Clean up response - remove markdown code blocks if present
                const cleaned = aiResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
                tasks = JSON.parse(cleaned);
            } else {
                tasks = aiResponse;
            }
            
            // Convert AI response to our task format
            return tasks.map((task, index) => ({
                id: Date.now() + index,
                title: task.title,
                description: task.description,
                priority: task.priority || 'medium',
                estimated: task.estimated || '1h',
                category: task.category || 'feature',
                selected: task.priority === 'high' || index < 3 // Auto-select high priority and first 3 tasks
            }));
        } catch (error) {
            console.error('Failed to parse AI task response:', error);
            throw new Error('Invalid AI response format');
        }
    }
    
    generateFallbackTasks() {
        // Minimal fallback if AI fails
        const baseId = Date.now();
        return [
            {
                id: baseId + 1,
                title: this.isExistingProject ? 'Code Review' : 'Project Setup',
                description: this.isExistingProject ? 'Review and improve existing code quality' : 'Initialize project structure and dependencies',
                priority: 'high',
                estimated: '1h',
                selected: true
            },
            {
                id: baseId + 2,
                title: this.isExistingProject ? 'Improve Tests' : 'Implement Features',
                description: this.isExistingProject ? 'Add or improve test coverage' : 'Build core application features',
                priority: 'medium',
                estimated: '2h',
                selected: true
            }
        ];
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
                    <button class="btn-small task-move-btn" 
                            onclick="agentOps.moveTaskUp(${task.id})" 
                            ${index === 0 ? 'disabled' : ''} 
                            title="Move task up">↑</button>
                    <button class="btn-small task-move-btn" 
                            onclick="agentOps.moveTaskDown(${task.id})" 
                            ${index === selectedTasks.length - 1 ? 'disabled' : ''} 
                            title="Move task down">↓</button>
                </div>
            </div>
        `).join('');
    }

    moveTaskUp(taskId) {
        const selectedTasks = this.taskList.filter(task => task.selected);
        const taskIndex = selectedTasks.findIndex(task => task.id === parseInt(taskId));
        
        if (taskIndex > 0) {
            // Add visual feedback
            this.addTaskMoveAnimation(taskId, 'up');
            
            // Swap with the task above
            [selectedTasks[taskIndex], selectedTasks[taskIndex - 1]] = [selectedTasks[taskIndex - 1], selectedTasks[taskIndex]];
            
            // Update the original taskList to maintain the new order
            this.updateTaskListOrder(selectedTasks);
            
            // Slight delay to show the movement, then refresh
            setTimeout(() => {
                this.setupTaskPlanning();
            }, 150);
        }
    }

    moveTaskDown(taskId) {
        const selectedTasks = this.taskList.filter(task => task.selected);
        const taskIndex = selectedTasks.findIndex(task => task.id === parseInt(taskId));
        
        if (taskIndex < selectedTasks.length - 1) {
            // Add visual feedback
            this.addTaskMoveAnimation(taskId, 'down');
            
            // Swap with the task below
            [selectedTasks[taskIndex], selectedTasks[taskIndex + 1]] = [selectedTasks[taskIndex + 1], selectedTasks[taskIndex]];
            
            // Update the original taskList to maintain the new order
            this.updateTaskListOrder(selectedTasks);
            
            // Slight delay to show the movement, then refresh
            setTimeout(() => {
                this.setupTaskPlanning();
            }, 150);
        }
    }

    addTaskMoveAnimation(taskId, direction) {
        const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
        if (taskElement) {
            taskElement.style.transform = direction === 'up' ? 'translateY(-5px)' : 'translateY(5px)';
            taskElement.style.transition = 'transform 0.15s ease';
            
            setTimeout(() => {
                taskElement.style.transform = '';
                taskElement.style.transition = '';
            }, 150);
        }
    }

    updateTaskListOrder(orderedSelectedTasks) {
        // Create a map of task IDs to their new order position
        const orderMap = {};
        orderedSelectedTasks.forEach((task, index) => {
            orderMap[task.id] = index;
        });
        
        // Sort the entire taskList, putting selected tasks in the new order
        // and unselected tasks at the end
        this.taskList.sort((a, b) => {
            if (a.selected && b.selected) {
                return orderMap[a.id] - orderMap[b.id];
            } else if (a.selected && !b.selected) {
                return -1;
            } else if (!a.selected && b.selected) {
                return 1;
            } else {
                return 0; // Keep unselected tasks in their current relative order
            }
        });
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
            // For existing projects, add final analysis task if not already present
            if (this.isExistingProject && !this.hasAnalysisTask()) {
                await this.addFinalAnalysisTask();
                return;
            }
            
            this.showNotification('🎉 All tasks completed successfully!', 'success');
            this.completeExecution();
            return;
        }

        const nextTask = pendingTasks[0];
        nextTask.status = 'executing';
        nextTask.progress = 0;
        
        this.currentExecutingTask = nextTask;
        this.renderTaskProgress();
        
        // Add activity log
        this.addActivity({
            type: 'task_started',
            timestamp: Date.now(),
            parsedContent: {
                summary: `Started executing: ${nextTask.title}`
            },
            importance: 8
        });

        try {
            // Execute task based on execution mode
            const executionMode = document.getElementById('execution-mode').value;
            
            if (executionMode === 'step-by-step') {
                await this.executeTaskStepByStep(nextTask);
            } else {
                await this.executeTaskAutomatically(nextTask);
            }
            
        } catch (error) {
            console.error('Task execution error:', error);
            nextTask.status = 'error';
            nextTask.error = error.message;
            this.addActivity({
                type: 'error',
                timestamp: Date.now(),
                parsedContent: {
                    summary: `Task failed: ${nextTask.title} - ${error.message}`
                },
                importance: 9
            });
            this.renderTaskProgress();
            
            if (executionMode === 'semi-auto') {
                this.pauseExecution();
            }
        }
    }

    async executeTaskStepByStep(task) {
        // Show confirmation dialog for step-by-step mode
        const proceed = confirm(`Execute task: ${task.title}\n\nDescription: ${task.description}\n\nProceed?`);
        
        if (!proceed) {
            task.status = 'pending';
            this.renderTaskProgress();
            return;
        }
        
        await this.executeTaskAutomatically(task);
    }

    async executeTaskAutomatically(task) {
        // Initialize task metrics
        task.metrics = {
            filesCreated: 0,
            filesModified: 0,
            linesAdded: 0,
            linesDeleted: 0,
            errorsEncountered: 0,
            warningsGenerated: 0,
            testsRun: 0,
            testsPassed: 0,
            commands: [],
            duration: 0
        };
        
        const startTime = Date.now();
        const steps = this.getTaskExecutionSteps(task);
        
        for (let i = 0; i < steps.length; i++) {
            if (!this.isExecuting || this.isPaused) break;
            
            const step = steps[i];
            task.progress = Math.round(((i + 1) / steps.length) * 100);
            
            // Generate realistic metrics for this step
            const stepMetrics = this.generateStepMetrics(step, task);
            this.updateTaskMetrics(task, stepMetrics);
            
            this.addActivity({
                type: 'command',
                timestamp: Date.now(),
                parsedContent: {
                    summary: step.description,
                    details: this.formatStepDetails(stepMetrics)
                },
                importance: 6,
                metrics: stepMetrics
            });
            
            this.renderTaskProgress();
            this.updateExecutionMetrics();
            
            // Simulate step execution time
            await this.delay(step.duration || 1000);
            
            // Simulate potential errors with detailed error info
            if (step.errorChance && Math.random() < step.errorChance) {
                const error = this.generateStepError(step);
                task.metrics.errorsEncountered++;
                
                this.addActivity({
                    type: 'error',
                    timestamp: Date.now(),
                    parsedContent: {
                        summary: `❌ Error in ${step.description}`,
                        details: error.details
                    },
                    importance: 9,
                    error: error
                });
                
                throw new Error(`Step failed: ${step.description} - ${error.message}`);
            }
        }
        
        // Calculate final metrics
        task.metrics.duration = Date.now() - startTime;
        task.status = 'completed';
        task.progress = 100;
        task.completedAt = Date.now();
        
        this.addActivity({
            type: 'completion',
            timestamp: Date.now(),
            parsedContent: {
                summary: `✅ Completed: ${task.title}`,
                details: this.formatTaskSummary(task.metrics)
            },
            importance: 7,
            metrics: task.metrics
        });
        
        this.renderTaskProgress();
        this.updateExecutionMetrics();
        
        // Check if user wants to pause after this task
        if (this.pauseAfterNextTask) {
            this.pauseAfterNextTask = false;
            this.pauseExecution();
            this.showGitCommitOption();
            return;
        }
        
        // Check if user wants to stop after this task
        if (this.stopAfterNextTask) {
            this.stopAfterNextTask = false;
            this.stopExecution();
            this.showGitCommitOption();
            return;
        }
        
        // Continue with next task after a brief delay
        setTimeout(() => {
            this.executeNextTask();
        }, 1000);
    }

    getTaskExecutionSteps(task) {
        // Generate execution steps based on task type
        const commonSteps = [
            { description: 'Initializing task environment', duration: 800 },
            { description: 'Setting up dependencies', duration: 1200 },
            { description: 'Executing main task logic', duration: 2000 },
            { description: 'Running validation checks', duration: 600 },
            { description: 'Finalizing and cleanup', duration: 400 }
        ];
        
        // Add task-specific steps
        if (task.title.toLowerCase().includes('setup')) {
            commonSteps.splice(1, 0, 
                { description: 'Creating project structure', duration: 1000 },
                { description: 'Configuring environment variables', duration: 500 }
            );
        } else if (task.title.toLowerCase().includes('test')) {
            commonSteps.push(
                { description: 'Running test suite', duration: 1500, errorChance: 0.1 },
                { description: 'Generating test reports', duration: 300 }
            );
        } else if (task.title.toLowerCase().includes('deploy')) {
            commonSteps.push(
                { description: 'Building for production', duration: 2000 },
                { description: 'Uploading to server', duration: 1000, errorChance: 0.05 }
            );
        }
        
        return commonSteps;
    }

    completeExecution() {
        this.isExecuting = false;
        this.isPaused = false;
        this.currentExecutingTask = null;
        
        document.getElementById('start-execution-btn').disabled = false;
        document.getElementById('pause-execution-btn').disabled = true;
        document.getElementById('stop-execution-btn').disabled = true;
        
        // Show completion summary
        const completedTasks = this.taskList.filter(task => task.status === 'completed');
        const failedTasks = this.taskList.filter(task => task.status === 'error');
        
        let summaryMessage = `Execution completed!\n\n`;
        summaryMessage += `✅ Completed: ${completedTasks.length} tasks\n`;
        if (failedTasks.length > 0) {
            summaryMessage += `❌ Failed: ${failedTasks.length} tasks\n`;
        }
        
        alert(summaryMessage);
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

    // New methods for enhanced execution monitoring
    generateStepMetrics(step, task) {
        const metrics = {
            filesAffected: 0,
            linesChanged: 0,
            commands: [],
            warnings: 0,
            errors: 0
        };
        
        // Generate realistic metrics based on step type
        if (step.description.includes('Creating') || step.description.includes('Setup')) {
            metrics.filesAffected = Math.floor(Math.random() * 5) + 1;
            metrics.linesChanged = Math.floor(Math.random() * 200) + 50;
            metrics.commands = ['mkdir', 'touch', 'npm init'];
        } else if (step.description.includes('Installing') || step.description.includes('dependencies')) {
            metrics.filesAffected = Math.floor(Math.random() * 3) + 1;
            metrics.linesChanged = Math.floor(Math.random() * 100) + 20;
            metrics.commands = ['npm install', 'yarn add'];
        } else if (step.description.includes('test')) {
            metrics.testsRun = Math.floor(Math.random() * 10) + 3;
            metrics.testsPassed = metrics.testsRun - Math.floor(Math.random() * 2);
            metrics.commands = ['npm test', 'jest'];
        } else if (step.description.includes('Executing') || step.description.includes('main')) {
            metrics.filesAffected = Math.floor(Math.random() * 8) + 2;
            metrics.linesChanged = Math.floor(Math.random() * 500) + 100;
            metrics.warnings = Math.floor(Math.random() * 3);
            metrics.commands = ['build', 'compile', 'transform'];
        }
        
        return metrics;
    }
    
    updateTaskMetrics(task, stepMetrics) {
        if (stepMetrics.filesAffected) {
            if (stepMetrics.commands.some(cmd => cmd.includes('create') || cmd.includes('touch'))) {
                task.metrics.filesCreated += stepMetrics.filesAffected;
            } else {
                task.metrics.filesModified += stepMetrics.filesAffected;
            }
        }
        
        task.metrics.linesAdded += Math.floor(stepMetrics.linesChanged * 0.7);
        task.metrics.linesDeleted += Math.floor(stepMetrics.linesChanged * 0.3);
        task.metrics.warningsGenerated += stepMetrics.warnings || 0;
        task.metrics.commands.push(...(stepMetrics.commands || []));
        
        if (stepMetrics.testsRun) {
            task.metrics.testsRun += stepMetrics.testsRun;
            task.metrics.testsPassed += stepMetrics.testsPassed;
        }
    }
    
    formatStepDetails(stepMetrics) {
        const details = [];
        if (stepMetrics.filesAffected) details.push(`${stepMetrics.filesAffected} files affected`);
        if (stepMetrics.linesChanged) details.push(`${stepMetrics.linesChanged} lines changed`);
        if (stepMetrics.testsRun) details.push(`${stepMetrics.testsPassed}/${stepMetrics.testsRun} tests passed`);
        if (stepMetrics.warnings) details.push(`${stepMetrics.warnings} warnings`);
        return details.join(' • ');
    }
    
    formatTaskSummary(metrics) {
        const summary = [];
        if (metrics.filesCreated) summary.push(`${metrics.filesCreated} files created`);
        if (metrics.filesModified) summary.push(`${metrics.filesModified} files modified`);
        if (metrics.linesAdded) summary.push(`+${metrics.linesAdded} lines`);
        if (metrics.linesDeleted) summary.push(`-${metrics.linesDeleted} lines`);
        if (metrics.testsRun) summary.push(`${metrics.testsPassed}/${metrics.testsRun} tests passed`);
        if (metrics.duration) summary.push(`${Math.round(metrics.duration/1000)}s duration`);
        return summary.join(' • ');
    }
    
    renderTaskMetrics(metrics, status) {
        if (!metrics || Object.keys(metrics).length === 0) return '';
        
        const items = [];
        if (metrics.filesCreated) items.push(`📄 ${metrics.filesCreated} created`);
        if (metrics.filesModified) items.push(`✏️ ${metrics.filesModified} modified`);
        if (metrics.linesAdded) items.push(`📈 +${metrics.linesAdded} lines`);
        if (metrics.linesDeleted) items.push(`📉 -${metrics.linesDeleted} lines`);
        if (metrics.testsRun) items.push(`🧪 ${metrics.testsPassed}/${metrics.testsRun} tests`);
        if (metrics.errorsEncountered) items.push(`❌ ${metrics.errorsEncountered} errors`);
        if (metrics.warningsGenerated) items.push(`⚠️ ${metrics.warningsGenerated} warnings`);
        
        if (items.length === 0) return '';
        
        return `<div class="task-metrics">${items.join(' • ')}</div>`;
    }
    
    generateStepError(step) {
        const errorTypes = [
            { message: 'Permission denied', details: 'Insufficient permissions to modify file' },
            { message: 'File not found', details: 'Required dependency file missing' },
            { message: 'Syntax error', details: 'Invalid code syntax detected' },
            { message: 'Network timeout', details: 'Failed to connect to external service' },
            { message: 'Memory limit exceeded', details: 'Process exceeded available memory' }
        ];
        
        return errorTypes[Math.floor(Math.random() * errorTypes.length)];
    }
    
    updateExecutionMetrics() {
        // Update overall execution statistics in the UI
        const allMetrics = this.taskList
            .filter(task => task.metrics)
            .reduce((total, task) => {
                const m = task.metrics;
                return {
                    totalFiles: total.totalFiles + (m.filesCreated || 0) + (m.filesModified || 0),
                    totalLines: total.totalLines + (m.linesAdded || 0) + (m.linesDeleted || 0),
                    totalErrors: total.totalErrors + (m.errorsEncountered || 0),
                    totalWarnings: total.totalWarnings + (m.warningsGenerated || 0),
                    totalTests: total.totalTests + (m.testsRun || 0)
                };
            }, { totalFiles: 0, totalLines: 0, totalErrors: 0, totalWarnings: 0, totalTests: 0 });
        
        // Update execution stats in header if element exists
        const statsElement = document.getElementById('execution-stats');
        if (statsElement) {
            statsElement.innerHTML = `
                📄 ${allMetrics.totalFiles} files • 
                📝 ${allMetrics.totalLines} lines • 
                🧪 ${allMetrics.totalTests} tests • 
                ${allMetrics.totalErrors ? `❌ ${allMetrics.totalErrors} errors • ` : ''}
                ${allMetrics.totalWarnings ? `⚠️ ${allMetrics.totalWarnings} warnings` : ''}
            `;
        }
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
        progressList.innerHTML = selectedTasks.map(task => {
            const progress = task.progress || 0;
            const status = task.status || 'pending';
            const isExecuting = status === 'executing';
            const metrics = task.metrics || {};
            
            return `
            <div class="task-progress-item ${status}" data-task-id="${task.id}">
                <div class="task-status-icon ${isExecuting ? 'spinning' : ''}">
                    ${status === 'completed' ? '✅' : 
                      status === 'executing' ? '🔄' : 
                      status === 'error' ? '❌' : '⏳'}
                </div>
                <div class="task-info">
                    <h4>${task.title}</h4>
                    <div class="task-progress-bar">
                        <div class="progress-fill" style="width: ${progress}%"></div>
                    </div>
                    <div class="task-progress-percent">${progress}%</div>
                    ${this.renderTaskMetrics(metrics, status)}
                    ${task.error ? `<div class="task-error">Error: ${task.error}</div>` : ''}
                    ${status === 'completed' && task.completedAt ? 
                        `<div class="task-completed-time">Completed: ${this.formatTime(task.completedAt)}</div>` : ''}
                </div>
            </div>`;
        }).join('');
    }
                <div class="task-info">
                    <div class="task-header">
                        <h4>${task.title}</h4>
                        <span class="task-progress-percent">${progress}%</span>
                    </div>
                    <p>${task.description}</p>
                    <div class="task-progress-bar">
                        <div class="progress-fill ${isExecuting ? 'active' : ''}" 
                             style="width: ${progress}%"></div>
                    </div>
                    ${status === 'error' ? `<div class="task-error">❌ ${task.error}</div>` : ''}
                    ${task.completedAt ? `<div class="task-completed-time">Completed: ${new Date(task.completedAt).toLocaleTimeString()}</div>` : ''}
                </div>
            </div>
            `;
        }).join('');
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

    // AI Specification Generator
    openSpecGeneratorModal() {
        this.showModal('ai-spec-generator-modal');
    }

    closeSpecGeneratorModal() {
        this.hideModal('ai-spec-generator-modal');
        // Clear form
        document.getElementById('project-idea').value = '';
        document.getElementById('target-audience').value = '';
        document.getElementById('tech-preferences').value = '';
    }

    async generateAISpecification() {
        const projectIdea = document.getElementById('project-idea').value.trim();
        const targetAudience = document.getElementById('target-audience').value.trim();
        const techPreferences = document.getElementById('tech-preferences').value.trim();

        if (!projectIdea) {
            alert('Please describe your project idea first.');
            return;
        }

        // Show generating state
        document.getElementById('spec-generating').style.display = 'block';
        document.getElementById('generate-spec-confirm-btn').disabled = true;

        try {
            // Generate specification using mock AI (for demo purposes)
            const specification = await this.mockAISpecGeneration(projectIdea, targetAudience, techPreferences);
            
            // Fill in the specification textarea
            document.getElementById('claude-specification').value = specification;
            
            // Auto-extract project name
            const projectName = this.extractProjectNameFromSpec(specification);
            if (projectName && !document.getElementById('project-name').value) {
                document.getElementById('project-name').value = projectName;
            }

            // Close modal and save data
            this.closeSpecGeneratorModal();
            this.saveProjectData();
            
            // Show success message
            this.showNotification('✅ Project specification generated successfully!', 'success');

        } catch (error) {
            console.error('Error generating specification:', error);
            this.showNotification('❌ Failed to generate specification. Please try again.', 'error');
        } finally {
            // Hide generating state
            document.getElementById('spec-generating').style.display = 'none';
            document.getElementById('generate-spec-confirm-btn').disabled = false;
        }
    }

    async mockAISpecGeneration(idea, audience, tech) {
        // Simulate API delay
        await this.delay(2000);
        
        const projectName = this.generateProjectName(idea);
        const techStack = tech || 'HTML, CSS, JavaScript, Node.js';
        
        return `# ${projectName}

## Project Overview
${idea}

This application aims to provide a comprehensive solution for ${audience || 'users'} with an intuitive and modern interface.

## Target Audience
${audience || 'General users who need this type of solution'}

## Core Features
- User authentication and profile management
- Main functionality based on the core idea
- Responsive web interface
- Data persistence and management
- User-friendly dashboard
- Search and filtering capabilities

## Technical Requirements

### Technology Stack
${techStack}

### Architecture
- Frontend: Modern responsive web application
- Backend: RESTful API with proper data validation
- Database: Efficient data storage and retrieval
- Authentication: Secure user management system

## Success Metrics
- User engagement and retention
- System performance and reliability
- Feature adoption rates
- User satisfaction scores

## Development Timeline
- Phase 1: Core functionality (2-3 weeks)
- Phase 2: Advanced features (2-3 weeks)
- Phase 3: Testing and optimization (1-2 weeks)
- Phase 4: Deployment and monitoring (1 week)

## Risk Assessment
- Technical complexity management
- User experience optimization
- Performance and scalability considerations
- Security and data protection compliance

This specification provides a solid foundation for building a robust and user-focused application.`;
    }

    generateProjectName(idea) {
        // Simple name generation based on idea keywords
        const words = idea.toLowerCase().split(' ');
        const keyWords = words.filter(word => 
            word.length > 3 && 
            !['the', 'and', 'for', 'with', 'that', 'this', 'will', 'can', 'have', 'are', 'is'].includes(word)
        );
        
        if (keyWords.length >= 2) {
            return keyWords.slice(0, 2).map(word => 
                word.charAt(0).toUpperCase() + word.slice(1)
            ).join('');
        } else {
            return 'MyProject';
        }
    }

    extractProjectNameFromSpec(specification) {
        const lines = specification.split('\n');
        for (const line of lines) {
            if (line.startsWith('# ')) {
                return line.substring(2).trim();
            }
        }
        return null;
    }

    showNotification(message, type = 'info') {
        // Simple notification system
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 16px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            max-width: 300px;
            background: ${type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : '#6366F1'};
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
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

    // Helper methods for execution control
    hasAnalysisTask() {
        return this.taskList.some(task => 
            task.title.toLowerCase().includes('analyze') && 
            task.title.toLowerCase().includes('more tasks')
        );
    }

    async addFinalAnalysisTask() {
        const analysisTask = {
            id: Date.now(),
            title: "Analyze Project for Additional Tasks",
            description: "Review the current project state and identify any remaining improvements, optimizations, or features that could be added.",
            priority: "medium",
            estimatedTime: "5 min",
            selected: true,
            completed: false,
            status: "pending",
            progress: 0
        };
        
        this.taskList.push(analysisTask);
        this.renderTaskProgress();
        
        // Continue execution with the new task
        setTimeout(() => {
            this.executeNextTask();
        }, 500);
    }

    setPauseAfterNextTask() {
        this.pauseAfterNextTask = true;
        this.showNotification('Execution will pause after the next completed task', 'info');
    }

    setStopAfterNextTask() {
        this.stopAfterNextTask = true;
        this.showNotification('Execution will stop after the next completed task', 'info');
    }

    showGitCommitOption() {
        // Show git commit modal/option
        const shouldCommit = confirm('Task completed. Would you like to commit the changes to git?');
        if (shouldCommit) {
            this.commitChangesToGit();
        }
    }

    async commitChangesToGit() {
        try {
            const commitMessage = prompt('Enter commit message:', 'Update: Task completion via AgentOps');
            if (!commitMessage) return;

            // Send git commit request to backend
            const response = await fetch('/api/v1/git/commit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: commitMessage,
                    projectPath: this.projectData.selectedFolder || process.cwd()
                })
            });

            if (response.ok) {
                this.showNotification('✅ Changes committed to git successfully', 'success');
            } else {
                const error = await response.json();
                this.showNotification(`❌ Git commit failed: ${error.error}`, 'error');
            }
        } catch (error) {
            console.error('Git commit error:', error);
            this.showNotification('❌ Git commit failed', 'error');
        }
    }
}


// Initialize the app when DOM is loaded
let agentOps;
document.addEventListener('DOMContentLoaded', () => {
    agentOps = new AgentOpsWorkflow();
    window.agentOps = agentOps; // Make it globally accessible
});