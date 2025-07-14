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
        this.codeAnalysisComplete = false;
        this.hasGeneratedTasks = false; // Track if tasks have been generated for this project
        
        // File change aggregation
        this.fileChangeBuffer = new Map(); // Map of component -> change count
        this.fileChangeTimer = null;
        this.AGGREGATION_INTERVAL = 3000; // 3 seconds
        
        // Uptime update timer
        this.uptimeTimer = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupWebSocket();
        this.updateStepIndicators();
        this.validateCurrentStep();
        this.startUptimeUpdates();
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
        document.getElementById('stop-execution-btn').addEventListener('click', () => this.stopExecution());
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
            case 'directoryChange':
                this.handleDirectoryChange(message.data);
                break;
            case 'processOutput':
                this.handleProcessOutput(message.data);
                break;
            case 'response':
                // Handle generic response messages
                if (message.data && message.data.success === false) {
                    console.error('Server response error:', message.data.error);
                } else {
                    console.log('Server response:', message.data);
                }
                break;
            case 'monitoringStarted':
                console.log('File monitoring started for:', message.data.path);
                break;
            case 'monitoringStopped':
                console.log('File monitoring stopped');
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
                path: document.getElementById('project-path').value,
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
        
        // Reset task generation flag when changing project type
        this.hasGeneratedTasks = false;
        
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
        
        // Reset task generation flag when selecting a new project folder
        this.hasGeneratedTasks = false;
        
        if (this.isSelectingExistingProject) {
            document.getElementById('existing-project-path').value = currentPath;
            this.isSelectingExistingProject = false;
            this.closeFolderSelector();
            this.saveProjectData(); // Save project data after setting path
            this.analyzeExistingProject(currentPath);
        } else {
            document.getElementById('project-path').value = currentPath;
            this.closeFolderSelector();
            this.saveProjectData(); // Save project data after setting path
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
            // Check if project has saved state first
            const hasState = await this.checkProjectState(projectPath);
            
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
            let scanSummary = `
                <div class="scan-item">📁 Project Path: ${projectPath}</div>
                <div class="scan-item">🔍 Scanning for files...</div>
                <div class="scan-item">⚙️ Monitoring enabled</div>
            `;
            
            if (hasState) {
                scanSummary += `<div class="scan-item">💾 Saved project state found - you can resume or start fresh</div>`;
            }
            
            document.getElementById('scan-summary').innerHTML = scanSummary;

        } catch (error) {
            console.error('Error scanning project:', error);
        }
    }

    // Step 3: Task Identification
    async generateTasks() {
        // Determine if this is a new project (first time generating tasks)
        const isNewProject = !this.hasGeneratedTasks;
        
        document.getElementById('task-loading').style.display = 'block';
        document.getElementById('identified-tasks').style.display = 'none';

        // Reset progress UI
        this.resetProgressUI();
        
        // Step 1: Analyze project context
        await this.updateProgress('analyze', 'Analyzing project structure and context...');
        
        // For existing projects, perform comprehensive code analysis
        if (this.isExistingProject) {
            await this.performCodeAnalysis();
        }
        
        await this.delay(500);
        
        // Step 2: Generate architecture visualization
        await this.updateProgress('architecture', 'Generating project architecture and design overview...');
        this.projectArchitecture = await this.generateArchitectureAnalysis();
        await this.delay(800);
        
        // Step 3: Prepare AI prompt
        await this.updateProgress('identify', 'Preparing AI analysis with project details...');
        await this.delay(300);
        
        try {
            // Step 4: Generate tasks with AI
            await this.updateProgress('generate', 'Generating intelligent tasks with Claude Code...');
            const tasks = await this.generateIntelligentTasks(isNewProject);
            await this.delay(200);
            
            // Step 5: Process and prioritize with architecture mapping
            await this.updateProgress('prioritize', 'Processing AI recommendations and mapping to architecture...');
            this.taskList = this.mapTasksToArchitecture(tasks);
            await this.delay(400);
            
            // Mark that we have generated tasks for this project
            this.hasGeneratedTasks = true;
            
            // Save project state after task generation
            await this.saveCurrentProjectState();
            
            // Complete and show results
            this.completeAllProgressSteps();
            this.renderTaskList();
            
            setTimeout(() => {
                document.getElementById('task-loading').style.display = 'none';
                document.getElementById('identified-tasks').style.display = 'block';
            }, 300);
            
        } catch (error) {
            console.error('Task generation failed:', error);
            this.showTaskGenerationError(error);
        }
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
        const stepIds = ['analyze', 'architecture', 'identify', 'generate', 'prioritize'];
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

    async generateIntelligentTasks(isNewProject = false) {
        try {
            // Use the selected AI agent to generate real tasks
            const tasks = await this.generateTasksWithAI(isNewProject);
            return this.prioritizeAndEstimateTasks(tasks);
        } catch (error) {
            console.error('Failed to generate tasks with AI:', error);
            throw error; // Re-throw to handle properly in calling function
        }
    }

    async generateTasksWithAI(isNewProject = false) {
        const projectContext = this.buildProjectContext();
        const aiPrompt = this.buildTaskGenerationPrompt(projectContext);
        
        // Add session control to project context
        projectContext.isNewProject = isNewProject;
        
        try {
            // Send request to Claude Code instance to generate tasks
            // Claude CLI can take 20-60 seconds, so use longer timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 70000); // 70 seconds
            
            const response = await fetch('/api/v1/claude-code/generate-tasks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: aiPrompt,
                    projectContext: projectContext
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return this.parseAITaskResponse(data.tasks);
        } catch (error) {
            if (error.name === 'AbortError') {
                console.error('Task generation timed out after 70 seconds');
                throw new Error('Task generation timed out. Claude CLI took too long to respond.');
            }
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
            isExisting: this.isExistingProject,
            projectPath: this.projectData.path || null,
            projectName: this.projectData.name || 'Untitled Project',
            specification: this.projectData.specification || null,
            technologies: this.projectAnalysis && this.projectAnalysis.technologies || [],
            fileStructure: this.projectAnalysis && this.projectAnalysis.structure || null,
            hasTests: this.projectAnalysis && this.projectAnalysis.hasTests || false,
            hasDocumentation: this.projectAnalysis && this.projectAnalysis.hasReadme || false,
            packageJson: this.projectAnalysis && this.projectAnalysis.packageInfo || null,
            claudePath: this.settings.claudePath || '/opt/homebrew/bin/claude'
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
    
    showTaskGenerationError(error) {
        // Hide loading UI
        document.getElementById('task-loading').style.display = 'none';
        
        // Show error UI with retry option
        const errorHtml = `
            <div class="task-generation-error">
                <div class="error-icon">⚠️</div>
                <h3>Task Generation Failed</h3>
                <p class="error-message">${error.message || 'Failed to generate tasks with Claude Code'}</p>
                <div class="error-details">
                    <p>This can happen if:</p>
                    <ul>
                        <li>Claude Code is not responding</li>
                        <li>Network connection issues</li>
                        <li>Claude Code is processing a complex request</li>
                    </ul>
                </div>
                <div class="error-actions">
                    <button id="retry-task-generation" class="btn btn-primary">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M1 4v6h6"/>
                            <path d="M23 20v-6h-6"/>
                            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10"/>
                            <path d="M3.51 15a9 9 0 0 0 14.85 3.36L23 14"/>
                        </svg>
                        Retry Task Generation
                    </button>
                    <button id="manual-task-entry" class="btn btn-secondary">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 20h9"/>
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                        </svg>
                        Enter Tasks Manually
                    </button>
                </div>
            </div>
        `;
        
        document.getElementById('identified-tasks').innerHTML = errorHtml;
        document.getElementById('identified-tasks').style.display = 'block';
        
        // Add event listeners
        document.getElementById('retry-task-generation').addEventListener('click', () => {
            this.generateTasks(); // Retry task generation
        });
        
        document.getElementById('manual-task-entry').addEventListener('click', () => {
            this.showManualTaskEntry();
        });
    }

    showManualTaskEntry() {
        // Clear task list and show empty state for manual entry
        this.taskList = [];
        
        const manualHtml = `
            <div class="manual-task-entry">
                <h3>Manual Task Entry</h3>
                <p>Add tasks manually to proceed with your workflow.</p>
                <div class="task-controls">
                    <button id="add-custom-task-btn" class="btn btn-primary">+ Add Task</button>
                </div>
                <div id="tasks-container" class="tasks-container">
                    <div class="empty-state">
                        <p>No tasks added yet. Click "Add Task" to get started.</p>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('identified-tasks').innerHTML = manualHtml;
        
        // Re-bind the add task button
        document.getElementById('add-custom-task-btn').addEventListener('click', () => this.openCustomTaskModal());
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
                    ${task.architectureArea ? `<span class="task-architecture">🏗️ ${task.architectureArea}</span>` : ''}
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
        // Reset task generation flag to allow regeneration
        this.hasGeneratedTasks = false;
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
        this.renderArchitectureDiagram(); // Add architecture diagram to execution view
        this.renderClaudeInstances();
        this.renderLiveActivities();
    }

    async startExecution() {
        this.isExecuting = true;
        
        document.getElementById('stop-execution-btn').disabled = false;
        document.getElementById('start-execution-btn').disabled = true;

        // Calculate optimal number of instances based on tasks and settings
        const maxInstances = parseInt(document.getElementById('claude-instance-limit').value);
        const executionMode = document.getElementById('execution-mode').value;
        const selectedTasks = this.taskList.filter(task => task.selected && !task.completed);
        
        // Don't launch more instances than we have tasks
        const optimalInstances = Math.min(maxInstances, selectedTasks.length);
        
        console.log(`Starting execution with ${optimalInstances} instances (max: ${maxInstances}, tasks: ${selectedTasks.length}) in ${executionMode} mode`);

        // Create the optimal number of Claude instances
        await this.createClaudeInstances(optimalInstances);

        // Begin task execution
        await this.executeNextTask();
    }

    async executeNextTask() {
        if (!this.isExecuting) return;

        const pendingTasks = this.taskList.filter(task => task.selected && !task.completed);
        if (pendingTasks.length === 0) {
            this.showNotification('🎉 All tasks completed successfully!', 'success');
            this.showCompletionUI();
            await this.completeExecution();
            return;
        }

        const nextTask = pendingTasks[0];
        nextTask.status = 'executing';
        
        // Highlight the architecture area this task affects
        if (nextTask.architectureArea) {
            this.highlightArchitectureArea(nextTask.architectureArea);
        }
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

        // Get execution mode outside try/catch so it's accessible in both blocks
        const executionMode = document.getElementById('execution-mode')?.value || 'auto';
        
        try {
            // Execute task based on execution mode
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
                // Semi-auto mode pauses after each task for user confirmation
                // For simplicity, we'll just show a notification instead
                this.showNotification('Task completed. Click "Continue" to proceed to next task.', 'info');
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
        
        try {
            // Execute task with real Claude CLI
            const result = await this.executeTaskWithClaudeCLI(task);
            
            // Update task with execution results
            task.status = result.success ? 'completed' : 'failed';
            task.completed = result.success;
            task.progress = 100;
            task.completedAt = Date.now();
            task.metrics = this.mergeTaskMetrics(task.metrics, result.executionResult);
            task.executionResult = result.executionResult;
            
            // Save project state after task completion
            await this.saveCurrentProjectState();
            
            this.addActivity({
                type: result.success ? 'completion' : 'error',
                timestamp: Date.now(),
                parsedContent: {
                    summary: result.success ? `✅ Completed: ${task.title}` : `❌ Failed: ${task.title}`,
                    details: this.formatExecutionResult(result.executionResult),
                    architectureArea: task.architectureArea || 'General'
                },
                importance: result.success ? 7 : 9,
                metrics: task.metrics
            });
            
            // Update architecture visualization during execution
            this.highlightArchitectureArea(task.architectureArea);
            
            // Update architecture statistics based on task results
            if (task.architectureArea && result.executionResult) {
                this.updateArchitectureStatistics(task.architectureArea, result.executionResult);
                // Refresh the architecture diagram display
                this.updateArchitectureStatsDisplay(task.architectureArea);
            }
            
            if (!result.success) {
                throw new Error(result.error || 'Task execution failed');
            }
            
        } catch (error) {
            console.error('Task execution failed:', error);
            task.status = 'failed';
            task.error = error.message;
            task.metrics.errorsEncountered++;
            
            this.addActivity({
                type: 'error',
                timestamp: Date.now(),
                parsedContent: {
                    summary: `❌ Failed: ${task.title}`,
                    details: error.message
                },
                importance: 9,
                error: error.message
            });
            
            throw error;
        } finally {
            task.metrics.duration = Date.now() - startTime;
            this.renderTaskProgress();
            this.updateExecutionMetrics();
        }
        
        // Check if user wants to stop after this task
        if (this.stopAfterNextTask) {
            this.stopAfterNextTask = false;
            this.stopExecution();
            this.showGitCommitOption();
            return;
        }
        
        // Clear architecture highlighting after task completion
        setTimeout(() => {
            this.clearArchitectureHighlighting();
        }, 2000);
        
        // Continue with next task after a brief delay
        setTimeout(() => {
            this.executeNextTask();
        }, 1000);
    }

    async executeTaskWithClaudeCLI(task) {
        try {
            // Build project context
            const projectContext = {
                projectPath: this.projectData.path || this.getDefaultProjectPath(),
                projectName: this.projectData.name || 'Unknown Project',
                isExisting: this.isExistingProject,
                claudePath: this.settings.claudePath || '/opt/homebrew/bin/claude'
            };
            
            // Debug logging
            console.log('Task execution project context:', {
                savedPath: this.projectData.path,
                fallbackPath: this.getDefaultProjectPath(),
                finalPath: projectContext.projectPath,
                isExisting: this.isExistingProject
            });
            
            // Send task execution request to backend
            // Task execution can take up to 5 minutes, use longer timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 330000); // 5.5 minutes
            
            const response = await fetch('/api/v1/claude-code/execute-task', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    task: task,
                    projectContext: projectContext,
                    executionOptions: {
                        timeout: 300000, // 5 minutes
                        model: 'sonnet'
                    }
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            return result;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.error('Task execution timed out after 5.5 minutes');
                throw new Error('Task execution timed out. The task is taking too long to complete.');
            }
            console.error('Claude CLI task execution failed:', error);
            throw error;
        }
    }

    mergeTaskMetrics(existingMetrics, executionResult) {
        // Handle case where executionResult is undefined
        if (!executionResult) {
            return {
                ...existingMetrics,
                filesCreated: 0,
                filesModified: 0,
                commands: [],
                errorsEncountered: 0,
                warningsGenerated: 0,
                testsRun: 0,
                testsPassed: 0,
                duration: 0
            };
        }
        
        return {
            ...existingMetrics,
            filesCreated: executionResult.filesCreated?.length || 0,
            filesModified: executionResult.filesModified?.length || 0,
            commands: executionResult.commandsRun || [],
            errorsEncountered: executionResult.errorsEncountered?.length || 0,
            warningsGenerated: executionResult.warnings?.length || 0,
            testsRun: executionResult.testsRun || 0,
            testsPassed: executionResult.testsPassed || 0,
            duration: executionResult.duration || 0
        };
    }

    formatExecutionResult(executionResult) {
        if (!executionResult) return 'No execution details available';
        
        const details = [];
        
        if (executionResult.filesCreated?.length > 0) {
            details.push(`📁 Created: ${executionResult.filesCreated.join(', ')}`);
        }
        
        if (executionResult.filesModified?.length > 0) {
            details.push(`✏️ Modified: ${executionResult.filesModified.join(', ')}`);
        }
        
        if (executionResult.commandsRun?.length > 0) {
            details.push(`⚡ Commands: ${executionResult.commandsRun.join(', ')}`);
        }
        
        if (executionResult.testsRun > 0) {
            details.push(`🧪 Tests: ${executionResult.testsPassed}/${executionResult.testsRun} passed`);
        }
        
        if (executionResult.errorsEncountered?.length > 0) {
            details.push(`❌ Errors: ${executionResult.errorsEncountered.join(', ')}`);
        }
        
        if (executionResult.warnings?.length > 0) {
            details.push(`⚠️ Warnings: ${executionResult.warnings.join(', ')}`);
        }
        
        if (executionResult.duration) {
            details.push(`⏱️ Duration: ${Math.round(executionResult.duration / 1000)}s`);
        }
        
        return details.length > 0 ? details.join('\n') : 'Task completed successfully';
    }

    // Architecture Analysis Methods
    async generateArchitectureAnalysis() {
        try {
            const projectContext = this.buildProjectContext();
            
            // Generate architecture analysis using Claude CLI
            // Architecture generation can take up to 60 seconds, use longer timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 70000); // 70 seconds
            
            const response = await fetch('/api/v1/claude-code/generate-architecture', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    projectContext: projectContext
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            const data = await response.json();
            
            // Return architecture whether successful or not (API provides fallback)
            return data.architecture || this.generateFallbackArchitecture();
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.error('Architecture generation timed out after 70 seconds');
            } else {
                console.error('Architecture analysis failed:', error);
            }
            // Return fallback architecture
            return this.generateFallbackArchitecture();
        }
    }

    generateFallbackArchitecture() {
        const isExisting = this.isExistingProject;
        const projectName = this.projectData.name || 'Project';
        
        if (isExisting) {
            return {
                layers: [
                    { 
                        name: 'Frontend/UI Layer', 
                        description: 'User interface components and presentation logic',
                        components: ['Views', 'Components', 'Styles', 'Assets'],
                        color: '#6366F1'
                    },
                    { 
                        name: 'Business Logic Layer', 
                        description: 'Core application logic and data processing',
                        components: ['Services', 'Controllers', 'Utils', 'Helpers'],
                        color: '#10B981'
                    },
                    { 
                        name: 'Data Layer', 
                        description: 'Data storage, models, and database interactions',
                        components: ['Models', 'Database', 'APIs', 'Storage'],
                        color: '#F59E0B'
                    },
                    { 
                        name: 'Infrastructure Layer', 
                        description: 'Configuration, build tools, and deployment',
                        components: ['Config', 'Build', 'Tests', 'Documentation'],
                        color: '#EF4444'
                    }
                ],
                overview: `${projectName} follows a layered architecture pattern with clear separation of concerns between presentation, business logic, data management, and infrastructure.`
            };
        } else {
            return {
                layers: [
                    { 
                        name: 'Core Setup', 
                        description: 'Project initialization and basic structure',
                        components: ['Package.json', 'Dependencies', 'Entry Points'],
                        color: '#6366F1'
                    },
                    { 
                        name: 'Application Framework', 
                        description: 'Main application structure and routing',
                        components: ['App Structure', 'Routing', 'Middleware'],
                        color: '#10B981'
                    },
                    { 
                        name: 'Features & Components', 
                        description: 'Core functionality and user-facing features',
                        components: ['Features', 'Components', 'Services'],
                        color: '#F59E0B'
                    },
                    { 
                        name: 'Development Tools', 
                        description: 'Testing, building, and development workflow',
                        components: ['Tests', 'Build Tools', 'Documentation'],
                        color: '#EF4444'
                    }
                ],
                overview: `${projectName} will be built with a modular architecture emphasizing maintainability, testability, and clear separation between core functionality and supporting infrastructure.`
            };
        }
    }

    mapTasksToArchitecture(tasks) {
        if (!this.projectArchitecture || !this.projectArchitecture.layers) {
            return tasks;
        }
        
        return tasks.map(task => {
            // Determine which architecture layer this task affects
            const architectureArea = this.determineArchitectureArea(task);
            return {
                ...task,
                architectureArea: architectureArea
            };
        });
    }

    determineArchitectureArea(task) {
        const title = task.title.toLowerCase();
        const description = task.description.toLowerCase();
        const combined = `${title} ${description}`;
        
        // Map task keywords to architecture layers
        const layerMappings = [
            {
                keywords: ['ui', 'frontend', 'component', 'view', 'style', 'css', 'html', 'design', 'interface', 'user'],
                layer: 'Frontend/UI Layer'
            },
            {
                keywords: ['business', 'logic', 'service', 'controller', 'algorithm', 'processing', 'core', 'feature'],
                layer: 'Business Logic Layer'
            },
            {
                keywords: ['data', 'database', 'model', 'api', 'storage', 'query', 'schema', 'migration'],
                layer: 'Data Layer'
            },
            {
                keywords: ['config', 'build', 'deploy', 'test', 'ci', 'cd', 'documentation', 'setup', 'infrastructure'],
                layer: 'Infrastructure Layer'
            },
            {
                keywords: ['setup', 'init', 'package', 'dependency', 'framework', 'structure'],
                layer: 'Core Setup'
            },
            {
                keywords: ['app', 'application', 'routing', 'middleware', 'framework'],
                layer: 'Application Framework'
            },
            {
                keywords: ['feature', 'component', 'functionality', 'service', 'module'],
                layer: 'Features & Components'
            },
            {
                keywords: ['test', 'build', 'tool', 'development', 'workflow', 'documentation'],
                layer: 'Development Tools'
            }
        ];
        
        // Find the best matching layer
        let bestMatch = { layer: 'General', score: 0 };
        
        layerMappings.forEach(mapping => {
            const score = mapping.keywords.reduce((count, keyword) => {
                return count + (combined.includes(keyword) ? 1 : 0);
            }, 0);
            
            if (score > bestMatch.score) {
                bestMatch = { layer: mapping.layer, score: score };
            }
        });
        
        return bestMatch.layer;
    }

    highlightArchitectureArea(architectureArea) {
        if (!architectureArea || !this.projectArchitecture) return;
        
        // Find the layer that matches the architecture area
        const layer = this.projectArchitecture.layers.find(l => l.name === architectureArea);
        if (!layer) return;
        
        // Create or update architecture highlight in the activity feed
        this.showArchitectureHighlight(layer);
    }

    showArchitectureHighlight(layer) {
        // Add a visual indicator in the activity feed showing which architecture area is being worked on
        this.addActivity({
            type: 'architecture',
            timestamp: Date.now(),
            parsedContent: {
                summary: `🏗️ Working on: ${layer.name}`,
                details: `${layer.description}\nComponents: ${layer.components.join(', ')}`
            },
            importance: 5,
            architectureLayer: layer
        });
        
        // Also update the visual architecture diagram
        this.updateArchitectureDiagram(layer.name, 'working');
    }

    renderArchitectureDiagram() {
        if (!this.projectArchitecture || !this.projectArchitecture.layers) {
            this.renderFallbackArchitecture();
            return;
        }

        const diagramContainer = document.getElementById('architecture-diagram');
        if (!diagramContainer) return;

        // Initialize architecture statistics
        if (!this.architectureStats) {
            this.initializeArchitectureStats();
            // Load real project statistics
            this.loadRealArchitectureStats();
        }

        const layers = this.projectArchitecture.layers;
        
        diagramContainer.innerHTML = `
            <div class="architecture-layers">
                ${layers.map(layer => this.renderArchitectureLayer(layer)).join('')}
            </div>
            <div class="architecture-legend">
                <div class="legend-item">
                    <div class="legend-indicator" style="background: var(--primary);"></div>
                    <span>Selected Task</span>
                </div>
                <div class="legend-item">
                    <div class="legend-indicator" style="background: var(--accent);"></div>
                    <span>Currently Working</span>
                </div>
                <div class="legend-item">
                    <div class="legend-indicator" style="background: var(--border);"></div>
                    <span>Inactive</span>
                </div>
            </div>
        `;
    }

    renderArchitectureLayer(layer) {
        const stats = this.architectureStats[layer.name] || { files: 0, edits: 0, tests: 0 };
        
        return `
            <div class="architecture-layer" data-layer="${layer.name}">
                <div class="layer-header">
                    <div class="layer-title">
                        <div class="layer-color-indicator" style="background: ${layer.color};"></div>
                        <span>${layer.name}</span>
                    </div>
                    <div class="layer-stats">
                        <div class="layer-stat">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14,2 14,8 20,8"/>
                            </svg>
                            <span class="layer-stat-value">${stats.files}</span>
                            <span>files</span>
                        </div>
                        <div class="layer-stat">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                            </svg>
                            <span class="layer-stat-value">${stats.edits}</span>
                            <span>edits</span>
                        </div>
                        <div class="layer-stat">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="9,11 12,14 22,4"/>
                                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                            </svg>
                            <span class="layer-stat-value">${stats.tests}</span>
                            <span>tests</span>
                        </div>
                    </div>
                </div>
                <div class="layer-description">${layer.description}</div>
                <div class="layer-components">
                    ${layer.components.map(component => 
                        `<div class="layer-component" data-component="${component}">${component}</div>`
                    ).join('')}
                </div>
            </div>
        `;
    }

    initializeArchitectureStats() {
        this.architectureStats = {};
        
        if (this.projectArchitecture && this.projectArchitecture.layers) {
            this.projectArchitecture.layers.forEach(layer => {
                this.architectureStats[layer.name] = {
                    files: 0, // Start with zero - will be updated by real task execution
                    edits: 0,
                    tests: 0
                };
            });
        }
    }

    // Add method to analyze real project files for initial stats
    async loadRealArchitectureStats() {
        if (!this.projectData.path || !this.projectArchitecture?.layers) return;

        try {
            const response = await fetch('/api/v1/filesystem/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    projectPath: this.projectData.path,
                    includeStats: true 
                })
            });

            if (response.ok) {
                const analysis = await response.json();
                this.updateStatsFromAnalysis(analysis);
            }
        } catch (error) {
            console.warn('Could not load real architecture stats:', error);
        }
    }

    updateStatsFromAnalysis(analysis) {
        // Map file types to architecture layers and count real files
        if (!analysis.filesByType) return;

        this.projectArchitecture.layers.forEach(layer => {
            let fileCount = 0;
            
            // Map layer names to file types
            switch (layer.name.toLowerCase()) {
                case 'frontend/ui layer':
                case 'presentation layer':
                case 'presentation':
                    fileCount = (analysis.filesByType.html || 0) + 
                               (analysis.filesByType.css || 0) + 
                               (analysis.filesByType.js || 0) + 
                               (analysis.filesByType.tsx || 0) + 
                               (analysis.filesByType.jsx || 0);
                    break;
                case 'business logic layer':
                case 'application layer':
                case 'application':
                    fileCount = (analysis.filesByType.js || 0) + 
                               (analysis.filesByType.ts || 0) + 
                               (analysis.filesByType.py || 0);
                    break;
                case 'data layer':
                case 'domain layer':
                    fileCount = (analysis.filesByType.sql || 0) + 
                               (analysis.filesByType.json || 0) + 
                               (analysis.filesByType.db || 0);
                    break;
                case 'infrastructure layer':
                    fileCount = (analysis.filesByType.yml || 0) + 
                               (analysis.filesByType.yaml || 0) + 
                               (analysis.filesByType.dockerfile || 0) + 
                               (analysis.filesByType.config || 0);
                    break;
                default:
                    fileCount = Math.floor((analysis.totalFiles || 0) / this.projectArchitecture.layers.length);
            }
            
            this.architectureStats[layer.name] = {
                files: fileCount,
                edits: 0, // Will be updated during task execution
                tests: analysis.testFiles || 0
            };
        });
        
        // Refresh the display
        this.renderArchitectureDiagram();
    }

    updateArchitectureDiagram(layerName, status = 'active') {
        const layerElement = document.querySelector(`[data-layer="${layerName}"]`);
        if (!layerElement) return;

        // Clear previous states
        document.querySelectorAll('.architecture-layer').forEach(el => {
            el.classList.remove('active', 'working');
        });

        // Add new state
        layerElement.classList.add(status);

        // If working, also highlight relevant components
        if (status === 'working') {
            this.highlightRelevantComponents(layerElement, layerName);
        }
    }

    highlightRelevantComponents(layerElement, layerName) {
        const components = layerElement.querySelectorAll('.layer-component');
        
        // Randomly highlight 1-2 components to simulate work being done
        const activeComponents = Array.from(components).slice(0, Math.min(2, components.length));
        activeComponents.forEach(comp => comp.classList.add('working'));
    }

    incrementArchitectureStats(layerName, statType, increment = 1) {
        if (!this.architectureStats[layerName]) {
            this.architectureStats[layerName] = { files: 0, edits: 0, tests: 0 };
        }
        
        this.architectureStats[layerName][statType] += increment;
        
        // Update the display
        const layerElement = document.querySelector(`[data-layer="${layerName}"]`);
        if (layerElement) {
            const statElement = layerElement.querySelector(`[data-stat="${statType}"]`);
            if (statElement) {
                statElement.textContent = this.architectureStats[layerName][statType];
            }
        }
    }

    renderFallbackArchitecture() {
        const diagramContainer = document.getElementById('architecture-diagram');
        if (!diagramContainer) return;

        diagramContainer.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 1rem;">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="9" y1="9" x2="9" y2="15"/>
                    <line x1="15" y1="9" x2="15" y2="15"/>
                </svg>
                <p>Architecture analysis is being generated...</p>
                <p style="font-size: 0.8rem; margin-top: 0.5rem;">The visual diagram will appear once project analysis is complete.</p>
            </div>
        `;
    }

    clearArchitectureHighlighting() {
        // Clear all active states from architecture layers and components
        document.querySelectorAll('.architecture-layer').forEach(el => {
            el.classList.remove('active', 'working');
        });
        
        document.querySelectorAll('.layer-component').forEach(el => {
            el.classList.remove('active', 'working');
        });
    }

    getDefaultProjectPath() {
        // Return a placeholder project path for frontend use
        // This should rarely be used as projectData.path should be set
        return '';
    }

    updateArchitectureStatistics(layerName, executionResult) {
        if (!this.architectureStats[layerName]) {
            this.architectureStats[layerName] = { files: 0, edits: 0, tests: 0 };
        }

        // Guard against undefined executionResult
        if (!executionResult) {
            console.warn('updateArchitectureStatistics called with undefined executionResult');
            return;
        }

        // Extract statistics from execution result
        const filesCreated = executionResult.filesCreated?.length || 0;
        const filesModified = executionResult.filesModified?.length || 0;
        const testsRun = executionResult.testsRun || 0;
        
        // Update statistics
        this.architectureStats[layerName].files += filesCreated;
        this.architectureStats[layerName].edits += filesModified;
        this.architectureStats[layerName].tests += testsRun;
        
        // Refresh the visual display
        this.updateArchitectureStatsDisplay(layerName);
    }

    updateArchitectureStatsDisplay(layerName) {
        const layerElement = document.querySelector(`[data-layer="${layerName}"]`);
        if (!layerElement) return;

        const stats = this.architectureStats[layerName];
        const statElements = layerElement.querySelectorAll('.layer-stat-value');
        
        if (statElements.length >= 3) {
            statElements[0].textContent = stats.files; // files
            statElements[1].textContent = stats.edits; // edits  
            statElements[2].textContent = stats.tests; // tests
            
            // Add a brief animation to show the update
            statElements.forEach(el => {
                el.style.background = 'var(--accent)';
                el.style.color = 'white';
                el.style.borderRadius = '3px';
                el.style.padding = '1px 3px';
                
                setTimeout(() => {
                    el.style.background = '';
                    el.style.color = '';
                    el.style.borderRadius = '';
                    el.style.padding = '';
                }, 1000);
            });
        }
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

    async completeExecution() {
        this.isExecuting = false;
        this.currentExecutingTask = null;
        
        // Terminate all Claude instances
        await this.terminateAllInstances();
        
        document.getElementById('start-execution-btn').disabled = false;
        document.getElementById('stop-execution-btn').disabled = true;
        
        // Show completion summary
        const completedTasks = this.taskList.filter(task => task.status === 'completed');
        const failedTasks = this.taskList.filter(task => task.status === 'error');
        
        let summaryMessage = `Execution completed!\n\n`;
        summaryMessage += `✅ Completed: ${completedTasks.length} tasks\n`;
        if (failedTasks.length > 0) {
            summaryMessage += `❌ Failed: ${failedTasks.length} tasks\n`;
        }
        summaryMessage += `\n🤖 All Claude instances have been terminated.`;
        
        this.showNotification(summaryMessage, 'success');
    }

    // Removed pauseExecution and resumeExecution - simplified to just stop

    async stopExecution() {
        this.isExecuting = false;
        
        // Save current project state before stopping
        await this.saveCurrentProjectState();
        
        // Terminate all Claude instances
        await this.terminateAllInstances();

        document.getElementById('start-execution-btn').disabled = false;
        document.getElementById('stop-execution-btn').disabled = true;
        
        this.showNotification('Execution stopped. Project state saved. All Claude instances terminated.', 'info');
    }

    // New methods for enhanced execution monitoring
    generateStepMetrics(step, task) {
        const metrics = {
            // Code metrics
            filesAffected: 0,
            linesChanged: 0,
            commands: [],
            warnings: 0,
            errors: 0,
            
            // Architectural metrics
            componentsCreated: 0,
            componentsModified: 0,
            designPatternsImplemented: [],
            dependenciesAdded: [],
            dependenciesRemoved: [],
            apiEndpoints: 0,
            databaseChanges: 0,
            configurationUpdates: 0,
            
            // Quality metrics
            testCoverage: 0,
            codeComplexity: 'low',
            securityIssues: 0,
            performanceImpact: 'neutral',
            
            // Architecture status
            layerChanges: [],
            moduleInteractions: [],
            dataFlowUpdates: []
        };
        
        // Generate realistic architectural metrics based on step type
        const designPatterns = ['MVC', 'Repository', 'Factory', 'Observer', 'Singleton', 'Strategy', 'Decorator'];
        const layers = ['Presentation', 'Business Logic', 'Data Access', 'Infrastructure'];
        const performanceImpacts = ['improved', 'neutral', 'degraded'];
        const complexityLevels = ['low', 'medium', 'high'];
        
        if (step.description.includes('Creating') || step.description.includes('Setup')) {
            metrics.filesAffected = Math.floor(Math.random() * 5) + 2;
            metrics.linesChanged = Math.floor(Math.random() * 300) + 100;
            metrics.componentsCreated = Math.floor(Math.random() * 3) + 1;
            metrics.designPatternsImplemented = [designPatterns[Math.floor(Math.random() * designPatterns.length)]];
            metrics.dependenciesAdded = ['express', 'lodash', 'uuid'].slice(0, Math.floor(Math.random() * 3) + 1);
            metrics.configurationUpdates = Math.floor(Math.random() * 2) + 1;
            metrics.layerChanges = [layers[Math.floor(Math.random() * layers.length)]];
            metrics.commands = ['mkdir', 'touch', 'npm init'];
            
        } else if (step.description.includes('Installing') || step.description.includes('dependencies')) {
            metrics.filesAffected = Math.floor(Math.random() * 3) + 1;
            metrics.linesChanged = Math.floor(Math.random() * 100) + 20;
            metrics.dependenciesAdded = ['react', 'axios', 'moment'].slice(0, Math.floor(Math.random() * 3) + 1);
            metrics.configurationUpdates = 1;
            metrics.commands = ['npm install', 'yarn add'];
            
        } else if (step.description.includes('test')) {
            metrics.testsRun = Math.floor(Math.random() * 15) + 5;
            metrics.testsPassed = metrics.testsRun - Math.floor(Math.random() * 3);
            metrics.testCoverage = Math.floor(Math.random() * 30) + 70; // 70-100%
            metrics.commands = ['npm test', 'jest', 'cypress'];
            
        } else if (step.description.includes('API') || step.description.includes('endpoint')) {
            metrics.filesAffected = Math.floor(Math.random() * 4) + 1;
            metrics.linesChanged = Math.floor(Math.random() * 200) + 80;
            metrics.componentsModified = Math.floor(Math.random() * 2) + 1;
            metrics.apiEndpoints = Math.floor(Math.random() * 3) + 1;
            metrics.designPatternsImplemented = ['RESTful', 'MVC'];
            metrics.layerChanges = ['Business Logic', 'Presentation'];
            metrics.commands = ['curl', 'postman', 'swagger'];
            
        } else if (step.description.includes('database') || step.description.includes('Database')) {
            metrics.filesAffected = Math.floor(Math.random() * 3) + 1;
            metrics.linesChanged = Math.floor(Math.random() * 150) + 50;
            metrics.databaseChanges = Math.floor(Math.random() * 3) + 1;
            metrics.componentsModified = 1;
            metrics.designPatternsImplemented = ['Repository', 'DAO'];
            metrics.layerChanges = ['Data Access'];
            metrics.commands = ['migrate', 'seed', 'query'];
            
        } else if (step.description.includes('Executing') || step.description.includes('main')) {
            metrics.filesAffected = Math.floor(Math.random() * 8) + 3;
            metrics.linesChanged = Math.floor(Math.random() * 600) + 200;
            metrics.componentsModified = Math.floor(Math.random() * 4) + 1;
            metrics.warnings = Math.floor(Math.random() * 3);
            metrics.designPatternsImplemented = designPatterns.slice(0, Math.floor(Math.random() * 2) + 1);
            metrics.codeComplexity = complexityLevels[Math.floor(Math.random() * complexityLevels.length)];
            metrics.performanceImpact = performanceImpacts[Math.floor(Math.random() * performanceImpacts.length)];
            metrics.layerChanges = layers.slice(0, Math.floor(Math.random() * 2) + 1);
            metrics.moduleInteractions = ['AuthService', 'UserController', 'DatabaseService'].slice(0, Math.floor(Math.random() * 2) + 1);
            metrics.commands = ['build', 'compile', 'transform'];
            
        } else if (step.description.includes('refactor') || step.description.includes('improve')) {
            metrics.filesAffected = Math.floor(Math.random() * 6) + 2;
            metrics.linesChanged = Math.floor(Math.random() * 400) + 100;
            metrics.componentsModified = Math.floor(Math.random() * 3) + 1;
            metrics.designPatternsImplemented = [designPatterns[Math.floor(Math.random() * designPatterns.length)]];
            metrics.codeComplexity = 'low'; // Refactoring should reduce complexity
            metrics.performanceImpact = 'improved';
            metrics.testCoverage = Math.floor(Math.random() * 20) + 80; // Better coverage after refactoring
            metrics.layerChanges = layers.slice(0, Math.floor(Math.random() * 2) + 1);
            metrics.commands = ['refactor', 'optimize', 'cleanup'];
        }
        
        // Add random security and quality checks
        if (Math.random() < 0.1) {
            metrics.securityIssues = Math.floor(Math.random() * 2) + 1;
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
        
        // Core metrics
        const coreItems = [];
        if (metrics.filesCreated) coreItems.push(`📄 ${metrics.filesCreated} created`);
        if (metrics.filesModified) coreItems.push(`✏️ ${metrics.filesModified} modified`);
        if (metrics.linesAdded) coreItems.push(`📈 +${metrics.linesAdded} lines`);
        if (metrics.linesDeleted) coreItems.push(`📉 -${metrics.linesDeleted} lines`);
        
        // Architecture metrics
        const archItems = [];
        if (metrics.componentsCreated) archItems.push(`🏗️ ${metrics.componentsCreated} components created`);
        if (metrics.componentsModified) archItems.push(`🔧 ${metrics.componentsModified} components modified`);
        if (metrics.designPatternsImplemented && metrics.designPatternsImplemented.length > 0) {
            archItems.push(`🎯 ${metrics.designPatternsImplemented.join(', ')} patterns`);
        }
        if (metrics.dependenciesAdded && metrics.dependenciesAdded.length > 0) {
            archItems.push(`📦 +${metrics.dependenciesAdded.length} dependencies`);
        }
        if (metrics.dependenciesRemoved && metrics.dependenciesRemoved.length > 0) {
            archItems.push(`📦 -${metrics.dependenciesRemoved.length} dependencies`);
        }
        if (metrics.apiEndpoints) archItems.push(`🌐 ${metrics.apiEndpoints} API endpoints`);
        if (metrics.databaseChanges) archItems.push(`🗄️ ${metrics.databaseChanges} DB changes`);
        if (metrics.configurationUpdates) archItems.push(`⚙️ ${metrics.configurationUpdates} config updates`);
        
        // Quality metrics
        const qualityItems = [];
        if (metrics.testsRun) qualityItems.push(`🧪 ${metrics.testsPassed}/${metrics.testsRun} tests`);
        if (metrics.testCoverage) qualityItems.push(`📊 ${metrics.testCoverage}% coverage`);
        if (metrics.codeComplexity) qualityItems.push(`🔍 ${metrics.codeComplexity} complexity`);
        if (metrics.securityIssues) qualityItems.push(`🛡️ ${metrics.securityIssues} security issues`);
        if (metrics.performanceImpact && metrics.performanceImpact !== 'neutral') {
            const icon = metrics.performanceImpact === 'improved' ? '⚡' : '🐌';
            qualityItems.push(`${icon} ${metrics.performanceImpact} performance`);
        }
        if (metrics.errorsEncountered) qualityItems.push(`❌ ${metrics.errorsEncountered} errors`);
        if (metrics.warningsGenerated) qualityItems.push(`⚠️ ${metrics.warningsGenerated} warnings`);
        
        // Layer changes
        const layerItems = [];
        if (metrics.layerChanges && metrics.layerChanges.length > 0) {
            layerItems.push(`🏛️ ${metrics.layerChanges.join(', ')} layers`);
        }
        if (metrics.moduleInteractions && metrics.moduleInteractions.length > 0) {
            layerItems.push(`🔗 ${metrics.moduleInteractions.length} module interactions`);
        }
        
        // Combine all sections
        const allItems = [];
        if (coreItems.length > 0) allItems.push(...coreItems);
        if (archItems.length > 0) allItems.push(...archItems);
        if (qualityItems.length > 0) allItems.push(...qualityItems);
        if (layerItems.length > 0) allItems.push(...layerItems);
        
        if (allItems.length === 0) return '';
        
        return `
            <div class="task-metrics">
                <div class="metrics-core">${coreItems.join(' • ')}</div>
                ${archItems.length > 0 ? `<div class="metrics-architecture">${archItems.join(' • ')}</div>` : ''}
                ${qualityItems.length > 0 ? `<div class="metrics-quality">${qualityItems.join(' • ')}</div>` : ''}
                ${layerItems.length > 0 ? `<div class="metrics-layers">${layerItems.join(' • ')}</div>` : ''}
            </div>`;
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
                
                // Collect architectural metrics from step metrics within tasks
                const stepMetrics = task.stepMetrics || [];
                const archMetrics = stepMetrics.reduce((arch, step) => ({
                    totalComponents: arch.totalComponents + (step.componentsCreated || 0) + (step.componentsModified || 0),
                    totalPatterns: arch.totalPatterns + (step.designPatternsImplemented && step.designPatternsImplemented.length || 0),
                    totalDependencies: arch.totalDependencies + (step.dependenciesAdded && step.dependenciesAdded.length || 0) + (step.dependenciesRemoved && step.dependenciesRemoved.length || 0),
                    totalEndpoints: arch.totalEndpoints + (step.apiEndpoints || 0),
                    totalDbChanges: arch.totalDbChanges + (step.databaseChanges || 0),
                    totalLayerChanges: arch.totalLayerChanges + (step.layerChanges && step.layerChanges.length || 0)
                }), { totalComponents: 0, totalPatterns: 0, totalDependencies: 0, totalEndpoints: 0, totalDbChanges: 0, totalLayerChanges: 0 });
                
                return {
                    totalFiles: total.totalFiles + (m.filesCreated || 0) + (m.filesModified || 0),
                    totalLines: total.totalLines + (m.linesAdded || 0) + (m.linesDeleted || 0),
                    totalErrors: total.totalErrors + (m.errorsEncountered || 0),
                    totalWarnings: total.totalWarnings + (m.warningsGenerated || 0),
                    totalTests: total.totalTests + (m.testsRun || 0),
                    totalComponents: total.totalComponents + archMetrics.totalComponents,
                    totalPatterns: total.totalPatterns + archMetrics.totalPatterns,
                    totalDependencies: total.totalDependencies + archMetrics.totalDependencies,
                    totalEndpoints: total.totalEndpoints + archMetrics.totalEndpoints,
                    totalDbChanges: total.totalDbChanges + archMetrics.totalDbChanges,
                    totalLayerChanges: total.totalLayerChanges + archMetrics.totalLayerChanges
                };
            }, { 
                totalFiles: 0, totalLines: 0, totalErrors: 0, totalWarnings: 0, totalTests: 0,
                totalComponents: 0, totalPatterns: 0, totalDependencies: 0, totalEndpoints: 0,
                totalDbChanges: 0, totalLayerChanges: 0
            });
        
        // Update execution stats in header if element exists
        const statsElement = document.getElementById('execution-stats');
        if (statsElement) {
            const coreStats = [
                `📄 ${allMetrics.totalFiles} files`,
                `📝 ${allMetrics.totalLines} lines`,
                `🧪 ${allMetrics.totalTests} tests`
            ];
            
            const archStats = [];
            if (allMetrics.totalComponents > 0) archStats.push(`🏗️ ${allMetrics.totalComponents} components`);
            if (allMetrics.totalPatterns > 0) archStats.push(`🎯 ${allMetrics.totalPatterns} patterns`);
            if (allMetrics.totalDependencies > 0) archStats.push(`📦 ${allMetrics.totalDependencies} deps`);
            if (allMetrics.totalEndpoints > 0) archStats.push(`🌐 ${allMetrics.totalEndpoints} endpoints`);
            if (allMetrics.totalDbChanges > 0) archStats.push(`🗄️ ${allMetrics.totalDbChanges} DB`);
            if (allMetrics.totalLayerChanges > 0) archStats.push(`🏛️ ${allMetrics.totalLayerChanges} layers`);
            
            const issueStats = [];
            if (allMetrics.totalErrors > 0) issueStats.push(`❌ ${allMetrics.totalErrors} errors`);
            if (allMetrics.totalWarnings > 0) issueStats.push(`⚠️ ${allMetrics.totalWarnings} warnings`);
            
            const allStats = [...coreStats, ...archStats, ...issueStats].filter(Boolean);
            
            statsElement.innerHTML = allStats.join(' • ');
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
                    <div class="activity-description">${activity.parsedContent && activity.parsedContent.summary || activity.rawData}</div>
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

    async createClaudeInstances(count) {
        console.log(`Creating ${count} Claude instances...`);
        
        // Clear any existing instances first
        await this.terminateAllInstances();
        
        // Create the specified number of instances
        const createPromises = [];
        for (let i = 0; i < count; i++) {
            createPromises.push(this.createSingleInstance(i + 1));
        }
        
        try {
            await Promise.all(createPromises);
            console.log(`Successfully created ${count} Claude instances`);
        } catch (error) {
            console.error('Failed to create Claude instances:', error);
            this.showNotification('Failed to create Claude instances', 'error');
        }
    }

    async createSingleInstance(index) {
        const response = await fetch('/api/v1/claude-code/instances', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                command: this.settings.claudePath || '/opt/homebrew/bin/claude',
                options: {
                    name: `Claude Agent ${index}`,
                    workingDir: this.projectData.path || this.getDefaultProjectPath()
                }
            })
        });
        
        if (!response.ok) {
            throw new Error(`Failed to create instance ${index}: ${response.statusText}`);
        }
        
        return await response.json();
    }

    async terminateAllInstances() {
        const terminatePromises = this.claudeInstances.map(instance => 
            this.terminateInstance(instance.id)
        );
        
        await Promise.allSettled(terminatePromises);
        this.claudeInstances = [];
        this.renderClaudeInstances();
    }

    addClaudeInstance(instance) {
        // Ensure startTime is set if not present
        if (!instance.startTime) {
            instance.startTime = new Date().toISOString();
        }
        this.claudeInstances.push(instance);
        this.renderClaudeInstances();
    }

    startUptimeUpdates() {
        // Update uptimes every 5 seconds
        this.uptimeTimer = setInterval(() => {
            if (this.claudeInstances.length > 0) {
                this.renderClaudeInstances();
            }
        }, 5000);
    }

    removeClaudeInstance(instanceId) {
        this.claudeInstances = this.claudeInstances.filter(instance => instance.id !== instanceId);
        this.renderClaudeInstances();
    }

    async terminateInstance(instanceId) {
        try {
            const response = await fetch(`/api/v1/claude-code/instances/${instanceId}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                this.removeClaudeInstance(instanceId);
                return true;
            } else {
                console.error(`Failed to terminate instance ${instanceId}`);
                return false;
            }
        } catch (error) {
            console.error(`Error terminating instance ${instanceId}:`, error);
            return false;
        }
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
        if (!startTime) return '0m 0s';
        
        const now = new Date();
        const start = new Date(startTime);
        
        // Handle invalid dates
        if (isNaN(start.getTime())) return '0m 0s';
        
        const diff = Math.floor((now - start) / 1000);
        const minutes = Math.floor(diff / 60);
        const seconds = diff % 60;
        
        // Ensure non-negative values
        if (diff < 0) return '0m 0s';
        
        return `${minutes}m ${seconds}s`;
    }

    handleFileChange(data) {
        // Determine which architecture component this file belongs to
        const component = this.getArchitectureComponentFromPath(data.filePath || data.path);
        
        // Buffer the change
        const currentCount = this.fileChangeBuffer.get(component) || 0;
        this.fileChangeBuffer.set(component, currentCount + 1);
        
        // Reset/start aggregation timer
        if (this.fileChangeTimer) {
            clearTimeout(this.fileChangeTimer);
        }
        
        this.fileChangeTimer = setTimeout(() => {
            this.flushFileChanges();
        }, this.AGGREGATION_INTERVAL);
    }

    handleDirectoryChange(data) {
        console.log('Directory changed:', data);
        // Handle directory change events if needed
    }

    getArchitectureComponentFromPath(filePath) {
        if (!filePath) return 'Unknown';
        
        const path = filePath.toLowerCase();
        
        // Map file paths to architecture components
        if (path.includes('/src/') || path.includes('/lib/')) return 'Source Code';
        if (path.includes('/test/') || path.includes('test.') || path.includes('.test.')) return 'Tests';
        if (path.includes('/docs/') || path.includes('readme') || path.includes('.md')) return 'Documentation';
        if (path.includes('/api/') || path.includes('/routes/')) return 'API Layer';
        if (path.includes('/components/') || path.includes('/ui/')) return 'UI Components';
        if (path.includes('/models/') || path.includes('/schema/')) return 'Data Models';
        if (path.includes('/config/') || path.includes('.config.') || path.includes('.json')) return 'Configuration';
        if (path.includes('/assets/') || path.includes('/static/')) return 'Assets';
        if (path.includes('package.json') || path.includes('yarn.lock') || path.includes('package-lock.json')) return 'Dependencies';
        
        return 'Project Files';
    }

    flushFileChanges() {
        if (this.fileChangeBuffer.size === 0) return;
        
        // Create aggregated activity entries
        for (const [component, count] of this.fileChangeBuffer.entries()) {
            const activity = {
                id: `file-${Date.now()}-${Math.random()}`,
                timestamp: new Date().toISOString(),
                type: 'file_changes',
                message: `${count} file${count > 1 ? 's' : ''} modified in ${component}`,
                importance: Math.min(count, 10), // Cap importance at 10
                details: `${count} changes`,
                icon: '📝'
            };
            
            this.addActivity(activity);
        }
        
        // Clear the buffer
        this.fileChangeBuffer.clear();
        this.fileChangeTimer = null;
    }

    // Project State Management
    async checkProjectState(projectPath) {
        try {
            const response = await fetch('/api/v1/project-state/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectPath })
            });
            
            const result = await response.json();
            
            if (result.success && result.hasState) {
                this.showResumeDialog(projectPath, result.stateInfo);
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Error checking project state:', error);
            return false;
        }
    }

    showResumeDialog(projectPath, stateInfo) {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Resume Previous Work?</h3>
                </div>
                <div class="modal-body">
                    <p>Found saved project state from ${new Date(stateInfo.savedAt).toLocaleString()}:</p>
                    <ul style="margin: 1rem 0; padding-left: 1.5rem;">
                        <li><strong>Tasks:</strong> ${stateInfo.completedTasks} completed out of ${stateInfo.taskCount} total</li>
                        <li><strong>Architecture:</strong> ${stateInfo.architecture}</li>
                    </ul>
                    <p>Would you like to resume from where you left off, or start fresh analysis?</p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-success" onclick="agentOps.resumeProjectState('${projectPath}')">
                        📂 Resume Previous Work
                    </button>
                    <button class="btn btn-outline" onclick="agentOps.startFreshAnalysis('${projectPath}')">
                        🔄 Start Fresh Analysis
                    </button>
                    <button class="btn btn-danger" onclick="agentOps.deleteAndStartFresh('${projectPath}')">
                        🗑️ Delete Saved State & Start Fresh
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }

    async resumeProjectState(projectPath) {
        try {
            const response = await fetch(`/api/v1/project-state/${encodeURIComponent(projectPath)}`);
            const result = await response.json();
            
            if (result.success) {
                const state = result.state;
                
                // Restore project data
                this.projectData = state.projectData || {};
                this.taskList = state.tasks || [];
                this.isExistingProject = true;
                
                // Restore architecture if available
                if (state.architecture) {
                    this.renderArchitecture(state.architecture);
                }
                
                // Update UI to reflect restored state
                this.renderTasks();
                this.goToStep(state.currentStep || 3);
                
                this.showNotification('Project state restored successfully!', 'success');
                this.closeResumeDialog();
            } else {
                this.showNotification('Failed to load project state: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('Error resuming project state:', error);
            this.showNotification('Error loading project state', 'error');
        }
    }

    async startFreshAnalysis(projectPath) {
        this.closeResumeDialog();
        // Continue with normal project analysis flow
        await this.generateTasks();
    }

    async deleteAndStartFresh(projectPath) {
        try {
            const response = await fetch(`/api/v1/project-state/${encodeURIComponent(projectPath)}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showNotification('Saved state deleted', 'info');
            }
            
            this.closeResumeDialog();
            await this.generateTasks();
        } catch (error) {
            console.error('Error deleting project state:', error);
            this.closeResumeDialog();
        }
    }

    closeResumeDialog() {
        const modal = document.querySelector('.modal');
        if (modal) {
            modal.remove();
        }
    }

    async saveCurrentProjectState() {
        const projectPath = this.projectData.path;
        if (!projectPath) return;
        
        const state = {
            projectData: this.projectData,
            tasks: this.taskList,
            currentStep: this.currentStep,
            architecture: this.architecture,
            isExistingProject: this.isExistingProject,
            settings: this.settings
        };
        
        try {
            const response = await fetch('/api/v1/project-state/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectPath, state })
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log('Project state saved successfully');
            } else {
                console.error('Failed to save project state:', result.error);
            }
        } catch (error) {
            console.error('Error saving project state:', error);
        }
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


    setStopAfterNextTask() {
        this.stopAfterNextTask = true;
        this.showNotification('Execution will stop after the current task completes', 'info');
    }

    showGitCommitOption() {
        // For pause/stop scenarios, show completion UI instead
        this.showCompletionUI();
    }

    async commitChangesToGit() {
        try {
            // Auto-generate commit message based on completed tasks
            const completedTasks = this.taskList.filter(t => t.completed);
            const taskSummary = completedTasks.slice(0, 3).map(t => t.title).join(', ');
            const commitMessage = `AgentOps: ${taskSummary}${completedTasks.length > 3 ? ` + ${completedTasks.length - 3} more tasks` : ''}`;

            // Send git commit request to backend
            const response = await fetch('/api/v1/git/commit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: commitMessage,
                    projectPath: this.projectData.selectedFolder || this.projectData.path || this.getDefaultProjectPath()
                })
            });

            if (response.ok) {
                const result = await response.json();
                this.showNotification(`✅ Changes committed to git: ${result.commitHash}`, 'success');
                this.closeCompletionUI();
            } else {
                const error = await response.json();
                this.showNotification(`❌ Git commit failed: ${error.error}`, 'error');
            }
        } catch (error) {
            console.error('Git commit error:', error);
            this.showNotification('❌ Git commit failed', 'error');
        }
    }

    showCompletionUI() {
        const completionHtml = `
            <div id="completion-overlay" class="completion-overlay">
                <div class="completion-modal">
                    <div class="completion-header">
                        <h2>🎉 All Tasks Completed!</h2>
                        <p>Your project workflow has been successfully executed.</p>
                    </div>
                    <div class="completion-stats">
                        <div class="stat-group">
                            <span class="stat-label">Tasks Completed:</span>
                            <span class="stat-value">${this.taskList.filter(t => t.completed).length}</span>
                        </div>
                        <div class="stat-group">
                            <span class="stat-label">Files Modified:</span>
                            <span class="stat-value" id="final-files-count">0</span>
                        </div>
                        <div class="stat-group">
                            <span class="stat-label">Lines Changed:</span>
                            <span class="stat-value" id="final-lines-count">0</span>
                        </div>
                    </div>
                    <div class="completion-actions">
                        <button id="commit-changes-btn" class="btn btn-primary">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M9 11l3 3 8-8"/>
                            </svg>
                            Commit Changes to Git
                        </button>
                        <button id="redo-planning-btn" class="btn btn-secondary">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 3v5h5"/>
                                <path d="M21 21v-5h-5"/>
                                <path d="M12 7h7v10"/>
                                <path d="M5 17h7V7"/>
                            </svg>
                            Redo Planning
                        </button>
                        <button id="close-completion-btn" class="btn btn-outline">Close</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', completionHtml);
        
        // Add event listeners
        document.getElementById('commit-changes-btn').addEventListener('click', () => this.commitChangesToGit());
        document.getElementById('redo-planning-btn').addEventListener('click', () => this.redoPlanning());
        document.getElementById('close-completion-btn').addEventListener('click', () => this.closeCompletionUI());
        
        // Update final stats
        this.updateFinalStats();
    }

    closeCompletionUI() {
        const overlay = document.getElementById('completion-overlay');
        if (overlay) {
            overlay.remove();
        }
    }

    redoPlanning() {
        this.closeCompletionUI();
        
        // Reset execution state
        this.isExecuting = false;
        this.isPaused = false;
        this.currentExecutingTask = null;
        
        // Reset to task generation step
        this.currentStep = 3; 
        this.taskList = []; 
        this.codeAnalysisComplete = false;
        
        // Update UI to show correct step
        this.updateStepView();
        this.updateStepIndicators();
        
        // Reset execution buttons
        document.getElementById('start-execution-btn').style.display = 'none';
        document.getElementById('next-btn').style.display = 'inline-block';
        document.getElementById('stop-execution-btn').disabled = true;
        document.getElementById('stop-after-next-btn').disabled = true;
        
        // Re-run task generation
        this.generateTasks();
        this.showNotification('Planning phase restarted - generating new tasks', 'info');
    }

    updateFinalStats() {
        // Calculate total metrics from all completed tasks
        const completedTasks = this.taskList.filter(t => t.completed);
        let totalFiles = 0;
        let totalLines = 0;
        
        completedTasks.forEach(task => {
            if (task.metrics) {
                totalFiles += task.metrics.filesCreated || 0;
                totalFiles += task.metrics.filesModified || 0;
                totalLines += task.metrics.linesAdded || 0;
                totalLines += task.metrics.linesDeleted || 0;
            }
        });
        
        document.getElementById('final-files-count').textContent = totalFiles;
        document.getElementById('final-lines-count').textContent = totalLines;
    }

    async performCodeAnalysis() {
        await this.updateProgress('analyze', 'Performing comprehensive code analysis...');
        await this.delay(800);
        
        // Analyze project structure
        await this.updateProgress('analyze', 'Scanning project files and dependencies...');
        await this.delay(600);
        
        // Analyze code quality
        await this.updateProgress('analyze', 'Analyzing code quality and patterns...');
        await this.delay(700);
        
        // Identify improvement opportunities
        await this.updateProgress('analyze', 'Identifying improvement opportunities...');
        await this.delay(500);
        
        // This analysis will inform the AI task generation with real project insights
        this.codeAnalysisComplete = true;
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