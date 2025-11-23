// Replace this with your Google Apps Script Web App URL
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzs0wlZ_in7uWwX-QSfFwCE_PJIaxgs48SlyyakERn4A6uVaTyltoRpfJxMoq9A6HVcTA/exec';

class PageantJudgingSystem {
    constructor() {
        this.currentCategory = 'talent';
        this.form = document.getElementById('scoreForm');
        this.message = document.getElementById('message');
        this.results = document.getElementById('results');
        this.refreshBtn = document.getElementById('refreshResults');
        this.resultsCategory = document.getElementById('resultsCategory');

        this.roleSelectionModal = document.getElementById('roleSelectionModal');
        this.mainContent = document.getElementById('mainContent');
        this.judgeNameSelect = document.getElementById('judgeName');
        this.scoringSection = document.querySelector('.scoring-section');
        this.resultsSection = document.querySelector('.results-section');

        this.selectedRole = null;

        // Ensure a hidden input exists so a disabled select still provides judgeName in FormData
        this.hiddenJudgeInput = document.getElementById('hiddenJudgeName');
        if (!this.hiddenJudgeInput) {
            this.hiddenJudgeInput = document.createElement('input');
            this.hiddenJudgeInput.type = 'hidden';
            this.hiddenJudgeInput.name = 'judgeName';
            this.hiddenJudgeInput.id = 'hiddenJudgeName';
            this.form.appendChild(this.hiddenJudgeInput);
        }

        // Snapshot initial judge dropdown options so we can restore them on logout
        this.initialJudgeOptions = this.judgeNameSelect
            ? Array.from(this.judgeNameSelect.options).map(o => ({ value: o.value, text: o.text, selected: o.selected }))
            : [];

        // Create a logout button (if not present in DOM) and append to mainContent; hidden by default
        this.logoutBtn = document.getElementById('logoutBtn');
        if (!this.logoutBtn) {
            this.logoutBtn = document.createElement('button');
            this.logoutBtn.id = 'logoutBtn';
            this.logoutBtn.type = 'button';
            this.logoutBtn.textContent = 'Logout / Change Role';
            this.logoutBtn.className = 'logout-btn';
            this.logoutBtn.style.display = 'none';
            if (this.mainContent) {
                this.mainContent.prepend(this.logoutBtn);
            } else {
                document.body.prepend(this.logoutBtn);
            }
        }
        this.logoutBtn.addEventListener('click', () => this.logout());

        // references for UI enhancements
        this.judgeBadge = document.getElementById('judgeBadge');
        this.submitBtn = document.querySelector('.submit-btn');
        this.submitBtnText = this.submitBtn ? this.submitBtn.querySelector('.btn-text') : null;
        this.submitSpinner = this.submitBtn ? this.submitBtn.querySelector('.spinner') : null;

        // keyboard shortcut: Ctrl+Shift+L to logout/change role
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') {
                e.preventDefault();
                this.logout();
            }
        });

        this.init();
    }

init() {
        // Check if a judge role is stored in localStorage
        const storedJudge = localStorage.getItem('selectedJudge');

        if (storedJudge && storedJudge.startsWith('Judge')) {
            // If stored judge exists, select role directly and skip modal
            this.selectRole(storedJudge);
        } else {
            // Otherwise, show role selection modal
            this.setupRoleSelection();
        }
        // Role based UI is initialized after role is selected
    }

    setupRoleSelection() {
        // Show role selection modal
        this.roleSelectionModal.classList.remove('hidden');
        this.mainContent.style.display = 'none';

        // Attach event listener for buttons
        const buttons = this.roleSelectionModal.querySelectorAll('button[data-role]');
        buttons.forEach(button => {
            button.addEventListener('click', () => {
                const role = button.getAttribute('data-role');
                this.selectRole(role);
            });
        });

        // focus first role button for accessibility
        const firstBtn = this.roleSelectionModal.querySelector('button[data-role]');
        if (firstBtn) {
            setTimeout(() => firstBtn.focus(), 50);
        }

        // prevent background scroll while modal is open
        document.body.style.overflow = 'hidden';
    }

selectRole(role) {
        this.selectedRole = role;

        // Store judge role to localStorage if Judge
        if (role.startsWith('Judge')) {
            localStorage.setItem('selectedJudge', role);
            // keep hidden input in sync so submission includes judgeName even if dropdown is disabled
            if (this.hiddenJudgeInput) this.hiddenJudgeInput.value = role;
        } else {
            // Clear stored judge if not Judge (e.g., Admin)
            localStorage.removeItem('selectedJudge');
            if (this.hiddenJudgeInput) this.hiddenJudgeInput.value = '';
        }

        // Hide role selection modal
        this.roleSelectionModal.classList.add('hidden');
        // Show main content
        this.mainContent.style.display = 'block';

        // restore scrolling when modal closed
        document.body.style.overflow = '';

        // Show logout button so user can switch role
        if (this.logoutBtn) this.logoutBtn.style.display = 'inline-block';

        // Update judge badge (visible for Judges and Admin)
        this.updateJudgeBadge(role);

        if (role === 'Admin') {
            // Admin: hide scoring, show live results
            this.scoringSection.style.display = 'none';
            this.resultsSection.style.display = 'block';
        } else if (role.startsWith('Judge')) {
            // Judge: show scoring, hide live results
            this.scoringSection.style.display = 'block';
            this.resultsSection.style.display = 'none';

            // Restrict judge dropdown to selected judge
            this.restrictJudgeDropdown(role);
        }

        // Proceed with rest of app initialization
        this.populateCandidateOptions();
        this.setupCategoryNavigation();
        this.loadCategory(this.currentCategory);
        
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        this.refreshBtn.addEventListener('click', () => this.loadResults());
        this.resultsCategory.addEventListener('change', () => this.loadResults());
        
        // Load initial results if Admin
        if (role === 'Admin') {
            this.loadResults();
        }
        
        // Auto-calculate total when scores change
        this.setupAutoCalculate();
    }

    restrictJudgeDropdown(selectedJudge) {
        // Remove all options except the selected judge
        for (let i = this.judgeNameSelect.options.length - 1; i >= 0; i--) {
            const option = this.judgeNameSelect.options[i];
            if (option.value !== selectedJudge) {
                this.judgeNameSelect.remove(i);
            }
        }
        // Set and disable the dropdown to the selected judge
        this.judgeNameSelect.value = selectedJudge;
        this.judgeNameSelect.disabled = true;
    }

    populateCandidateOptions() {
        const grid = document.getElementById('candidatesGrid');
        grid.innerHTML = '';

        CANDIDATES_DATA.forEach(candidate => {
            const card = document.createElement('div');
            card.className = 'candidate-card';
            card.dataset.candidateId = candidate.number;
            card.innerHTML = `
                <div class="candidate-card-image-wrapper">
                    <img src="${candidate.image}" alt="Candidate ${candidate.number}: ${candidate.name}" class="candidate-card-image" />
                    <div class="candidate-number-badge">${candidate.number}</div>
                    <div class="candidate-card-selected-checkmark">✓</div>
                </div>
                <div class="candidate-card-name">${candidate.name}</div>
            `;

            card.addEventListener('click', () => this.selectCandidate(candidate.number, card));
            grid.appendChild(card);
        });
    }

    selectCandidate(candidateNumber, cardElement) {
        // Update hidden input
        document.getElementById('candidateNumber').value = candidateNumber;

        // Remove selected class from all cards
        document.querySelectorAll('.candidate-card').forEach(card => {
            card.classList.remove('selected');
        });

        // Add selected class to clicked card
        cardElement.classList.add('selected');

        // Update candidate showcase
        this.updateCandidateShowcase(candidateNumber);

        // Recalculate total (in case there's any dependency)
        this.calculateTotal();
    }

    updateCandidateShowcase(candidateNumber) {
        const showcase = document.getElementById('candidateShowcase');
        const candidate = CANDIDATES_DATA.find(c => c.number == candidateNumber);

        if (candidate) {
            showcase.innerHTML = `
                <div class="showcase-content">
                    <img src="${candidate.image}" alt="Candidate ${candidate.number}: ${candidate.name}" class="showcase-image" />
                    <div class="showcase-info">
                        <div class="showcase-number">Candidate #${candidate.number}</div>
                        <div class="showcase-name">${candidate.name}</div>
                        <div class="showcase-status">Ready to score</div>
                    </div>
                </div>
            `;
            showcase.classList.remove('hidden');
        } else {
            showcase.classList.add('hidden');
        }
    }

    setupCategoryNavigation() {
        const navButtons = document.querySelectorAll('.nav-btn');
        navButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const category = btn.dataset.category;
                this.switchCategory(category);
            });
        });
    }

    switchCategory(category) {
        // Update active nav button
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-category="${category}"]`).classList.add('active');
        
        // Load new category
        this.currentCategory = category;
        this.loadCategory(category);
    }

    loadCategory(category) {
        const categoryData = CATEGORIES[category];

        // Update title
        document.getElementById('categoryTitle').textContent = categoryData.title;

        // Update criteria display
        this.displayCriteria(categoryData.criteria);

        // Update score inputs
        this.createScoreInputs(categoryData.criteria);

        // Reset form
        this.form.reset();

        // Reset candidate selection
        document.getElementById('candidateNumber').value = '';
        document.querySelectorAll('.candidate-card').forEach(card => {
            card.classList.remove('selected');
        });

        // Reset showcase
        const showcase = document.getElementById('candidateShowcase');
        showcase.classList.add('hidden');
        showcase.innerHTML = '<div class="showcase-placeholder"><p>Select a candidate to begin scoring</p></div>';

        this.calculateTotal();
    }

    displayCriteria(criteria) {
        const criteriaContainer = document.getElementById('categoryCriteria');
        criteriaContainer.innerHTML = '';
        
        criteria.forEach(criterion => {
            const div = document.createElement('div');
            div.className = 'criteria-item';
            div.innerHTML = `
                <span>${criterion.name}</span>
                <span>${criterion.percentage}%</span>
            `;
            criteriaContainer.appendChild(div);
        });
    }

    createScoreInputs(criteria) {
        const container = document.getElementById('scoreInputs');
        container.innerHTML = '';
        
        criteria.forEach((criterion, index) => {
            const div = document.createElement('div');
            div.className = 'criteria-score';
            div.innerHTML = `
                <div class="criteria-info">
                    <div class="criteria-name">${criterion.name}</div>
                    <div class="criteria-percentage">${criterion.percentage}% (Max: ${criterion.maxScore})</div>
                </div>
                <input type="number" 
                       class="score-input criteria-score-input" 
                       data-max="${criterion.maxScore}"
                       data-name="${criterion.name}"
                       min="0" 
                       max="${criterion.maxScore}" 
                       step="0.1" 
                       placeholder="0.0"
                       required>
            `;
            container.appendChild(div);
        });
    }

    setupAutoCalculate() {
        document.addEventListener('input', (e) => {
            if (e.target.classList.contains('criteria-score-input')) {
                this.validateScoreInput(e.target);
                this.calculateTotal();
            }
        });
    }

    validateScoreInput(input) {
        const maxScore = parseFloat(input.dataset.max);
        const value = parseFloat(input.value) || 0;
        
        if (value > maxScore) {
            input.value = maxScore;
        } else if (value < 0) {
            input.value = 0;
        }
    }

    calculateTotal() {
        const inputs = document.querySelectorAll('.criteria-score-input');
        let total = 0;
        
        inputs.forEach(input => {
            total += parseFloat(input.value) || 0;
        });
        
        document.getElementById('totalScore').value = total.toFixed(1);
    }

    // Show an app-level message (error, success, info)
	showMessage(text, type = 'info') {
		if (!this.message) return;
		this.message.textContent = text;
		this.message.className = `message ${type}`;

		// Auto-hide success and info messages after 5 seconds
		if (type === 'success' || type === 'info') {
			clearTimeout(this._messageTimeout);
			this._messageTimeout = setTimeout(() => {
				this.message.className = 'message hidden';
			}, 5000);
		}
	}

    // Update the judge badge UI
    updateJudgeBadge(role) {
        if (!this.judgeBadge) return;
        if (!role) {
            this.judgeBadge.classList.add('hidden');
            this.judgeBadge.setAttribute('aria-hidden', 'true');
            return;
        }
        this.judgeBadge.textContent = role;
        this.judgeBadge.classList.remove('hidden');
        this.judgeBadge.setAttribute('aria-hidden', 'false');
    }

    // Toggle submit loading state (spinner + disable form)
    toggleSubmitLoading(isLoading) {
        if (isLoading) {
            if (this.submitBtn) this.submitBtn.setAttribute('disabled', 'disabled');
            if (this.submitSpinner) this.submitSpinner.classList.remove('hidden');
            if (this.submitBtnText) this.submitBtnText.textContent = 'Submitting...';
        } else {
            if (this.submitBtn) this.submitBtn.removeAttribute('disabled');
            if (this.submitSpinner) this.submitSpinner.classList.add('hidden');
            if (this.submitBtnText) this.submitBtnText.textContent = 'Submit Score';
        }
    }

    async handleSubmit(e) {
        e.preventDefault();

        const formData = new FormData(this.form);

        // Prefer selectedRole (set when role was chosen), then hidden/form value, then visible select value
        const resolvedJudgeName = this.selectedRole || formData.get('judgeName') || (this.judgeNameSelect ? this.judgeNameSelect.value : '');

        // Get candidate number from hidden input
        const candidateNumber = document.getElementById('candidateNumber').value;

        const scores = this.getScores();

        const data = {
            judgeName: resolvedJudgeName,
            candidateNumber: candidateNumber,
            category: this.currentCategory,
            scores: scores,
            totalScore: parseFloat(document.getElementById('totalScore').value)
        };

        // Validate all scores are provided
        const validationError = this.validateSubmission(data);
        if (validationError) {
            this.showMessage(validationError, 'error');
            return;
        }

        // Confirm submission to avoid accidental sends
        const confirmed = confirm(`Submit scores for Candidate ${candidateNumber} (${data.totalScore.toFixed(1)})?`);
        if (!confirmed) return;

        try {
            this.toggleSubmitLoading(true);
            this.showMessage('Submitting score...', 'info');
            await this.submitScore(data);
            this.showMessage('Score submitted successfully! ✓', 'success');
            this.form.reset();
            this.calculateTotal();
            // Refresh results after successful submission
            setTimeout(() => this.loadResults(), 1000);
        } catch (error) {
            this.showMessage('Error submitting score: ' + error.message, 'error');
            console.error('Submission error:', error);
        } finally {
            this.toggleSubmitLoading(false);
        }
    }

    getScores() {
        const scores = {};
        const inputs = document.querySelectorAll('.criteria-score-input');
        
        inputs.forEach(input => {
            const criterionName = input.dataset.name;
            scores[criterionName] = parseFloat(input.value) || 0;
        });
        
        return scores;
    }

    validateSubmission(data) {
        if (!data.judgeName) return 'Please select a judge';
        if (!data.candidateNumber) return 'Please select a candidate';
        
        const criteria = CATEGORIES[this.currentCategory].criteria;
        const maxTotal = criteria.reduce((sum, criterion) => sum + criterion.maxScore, 0);
        
        if (data.totalScore > maxTotal) {
            return `Total score cannot exceed ${maxTotal}`;
        }
        
        return null;
    }

    async submitScore(data) {
        try {
            // Use GET with query params to avoid CORS preflight issues
            const params = new URLSearchParams({
                action: 'submitScore',
                data: JSON.stringify(data)
            });
            
            const url = `${SCRIPT_URL}?${params.toString()}`;
            console.log('Submitting to:', url);
            
            const response = await fetch(url, {
                method: 'GET',
                redirect: 'follow'
            });

            // Get response text first to handle non-JSON responses
            const responseText = await response.text();
            console.log('Response:', responseText);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Try to parse as JSON
            let result;
            try {
                result = JSON.parse(responseText);
            } catch (parseError) {
                console.error('Parse error:', parseError);
                console.error('Response text:', responseText);
                throw new Error('Invalid response from server. Please check your script URL.');
            }
            
            if (result.status !== 'success') {
                throw new Error(result.message || 'Unknown error occurred');
            }

            return result;
        } catch (error) {
            console.error('Submit error:', error);
            throw error;
        }
    }

    async loadResults() {
        const category = this.resultsCategory.value;
        this.results.innerHTML = '<div class="loading">Loading results...</div>';
        
        try {
            const url = `${SCRIPT_URL}?action=getResults&category=${category}`;
            console.log('Loading results from:', url);
            
            const response = await fetch(url, {
                method: 'GET',
                redirect: 'follow'
            });
            
            // Get response text first
            const responseText = await response.text();
            console.log('Results response:', responseText);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            // Try to parse as JSON
            let data;
            try {
                data = JSON.parse(responseText);
            } catch (parseError) {
                console.error('Parse error:', parseError);
                console.error('Response text:', responseText);
                throw new Error('Invalid response from server. Please check your script URL and deployment.');
            }
            
            if (data.status === 'success') {
                this.displayResults(data.results, category);
            } else {
                throw new Error(data.message || 'Unknown error');
            }
        } catch (error) {
            console.error('Load results error:', error);
            this.results.innerHTML = `
                <div class="message error">
                    <strong>Error loading results:</strong> ${error.message}
                    <br><small>Check the browser console for more details.</small>
                </div>
            `;
        }
    }

    displayResults(results, category) {
        if (!results || results.length === 0) {
            this.results.innerHTML = '<div class="loading">No results available yet. Start scoring to see results!</div>';
            return;
        }

        let html = '';
        results.forEach((candidate, index) => {
            const rankClass = index < 3 ? `rank-${index + 1}` : '';
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
            const candidateData = CANDIDATES_DATA.find(c => c.number == candidate.candidate);
            const candidateImage = candidateData ? candidateData.image : '';
            const candidateName = candidateData ? candidateData.name : `Candidate ${candidate.candidate}`;

            html += `
                <div class="ranking-item ${rankClass}">
                    <div class="rank-badge">
                        <span class="rank-medal">${medal}</span>
                        <span class="rank-number">#${index + 1}</span>
                    </div>
                    <img src="${candidateImage}" alt="${candidateName}" class="candidate-result-image" />
                    <div class="candidate-info">
                        <div class="candidate-number">Candidate ${candidate.candidate}</div>
                        <div class="candidate-name">${candidateName}</div>
                        <div class="candidate-scores">
                            ${this.getScoreBreakdown(candidate, category)}
                        </div>
                        <div class="num-judges">Based on ${candidate.numberOfScores} judge${candidate.numberOfScores !== 1 ? 's' : ''}</div>
                    </div>
                    <div class="total-score">${candidate.totalScore.toFixed(2)}</div>
                </div>
            `;
        });

        this.results.innerHTML = html;
    }

    getScoreBreakdown(candidate, category) {
        const criteria = CATEGORIES[category]?.criteria || [];
        
        if (criteria.length === 0) {
            return '<span class="score-breakdown">No breakdown available</span>';
        }
        
        let breakdown = '';
        criteria.forEach((criterion, index) => {
            const score = candidate.scores?.[criterion.name]?.toFixed(1) || '0.0';
            const shortName = this.getShortenedName(criterion.name);
            breakdown += `${shortName}: ${score}`;
            if (index < criteria.length - 1) {
                breakdown += ' | ';
            }
        });
        
        return `<span class="score-breakdown">${breakdown}</span>`;
    }

    getShortenedName(name) {
		const abbreviations = {
			'Intelligence (Q&A)': 'Q&A',
			'Stage Present': 'Stage',
			'Mastery': 'Mastery',
			'Execution of Talent': 'Execution',
			'Audience Impact': 'Impact',
			'Suitability': 'Suit',
			'Sports Identity': 'Identity',
			'Poise and Bearing': 'Poise',
			'Overall Impact': 'Impact',
			'Design and Fitting': 'Design',
			'Natural Smile and Look': 'Smile',
			'Poise and Confidence': 'Confidence',
			'Personality': 'Personality',
			'Beauty': 'Beauty',
			'Wit and Content': 'Wit',
			'Projection and Delivery': 'Delivery',
			'Stage Presence': 'Presence'
		};

		return abbreviations[name] || name;
	}

    // Restore judge dropdown from the initial snapshot and enable it
    restoreJudgeDropdown() {
        if (!this.judgeNameSelect) return;
        this.judgeNameSelect.innerHTML = '';
        this.initialJudgeOptions.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.text;
            if (opt.selected) option.selected = true;
            this.judgeNameSelect.appendChild(option);
        });
        this.judgeNameSelect.disabled = false;
    }

    // Logout: clear stored role, restore judge dropdown, show role selection modal
    logout() {
        // Clear selected role and persisted judge
        this.selectedRole = null;
        localStorage.removeItem('selectedJudge');

        // Clear hidden input so submissions won't include stale judge
        if (this.hiddenJudgeInput) this.hiddenJudgeInput.value = '';

        // Restore the judge select to its original options/state
        this.restoreJudgeDropdown();

        // Hide main UI and show the role selection modal
        this.mainContent.style.display = 'none';
        this.roleSelectionModal.classList.remove('hidden');

        // Reset sections to default
        if (this.scoringSection) this.scoringSection.style.display = 'block';
        if (this.resultsSection) this.resultsSection.style.display = 'none';

        // Hide logout button until a new role is chosen
        if (this.logoutBtn) this.logoutBtn.style.display = 'none';

        // restore focus to first role button for easy selection
        setTimeout(() => {
            const firstBtn = this.roleSelectionModal.querySelector('button[data-role]');
            if (firstBtn) firstBtn.focus();
        }, 80);

        // re-hide any toast/message after logout to avoid stale messages
        if (this.message) this.message.className = 'message hidden';
        this.updateJudgeBadge(null);
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PageantJudgingSystem();
});
