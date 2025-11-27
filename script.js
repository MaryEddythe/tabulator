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

        this.categoryNav = document.querySelector('.category-nav');
        
        this.categoryTitleElem = document.getElementById('categoryTitle');
        this.categoryCriteriaElem = document.getElementById('categoryCriteria');

        this.selectedRole = null;

        this.hiddenJudgeInput = document.getElementById('hiddenJudgeName');
        if (!this.hiddenJudgeInput) {
            this.hiddenJudgeInput = document.createElement('input');
            this.hiddenJudgeInput.type = 'hidden';
            this.hiddenJudgeInput.name = 'judgeName';
            this.hiddenJudgeInput.id = 'hiddenJudgeName';
            this.form.appendChild(this.hiddenJudgeInput);
        }

        this.initialJudgeOptions = this.judgeNameSelect
            ? Array.from(this.judgeNameSelect.options).map(o => ({ value: o.value, text: o.text, selected: o.selected }))
            : [];

        this.logoutBtn = document.getElementById('logoutBtn');
        if (!this.logoutBtn) {
            this.logoutBtn = document.createElement('button');
            this.logoutBtn.id = 'logoutBtn';
            this.logoutBtn.type = 'button';
            this.logoutBtn.textContent = 'Logout / Change Role';
            this.logoutBtn.className = 'logout-btn hidden';
             if (this.mainContent) {
                 this.mainContent.prepend(this.logoutBtn);
             } else {
                 document.body.prepend(this.logoutBtn);
             }
         }
        this.logoutBtn.addEventListener('click', () => this.logout());

        this.judgeBadge = document.getElementById('judgeBadge');
        this.submitBtn = document.querySelector('.submit-btn');
        this.submitBtnText = this.submitBtn ? this.submitBtn.querySelector('.btn-text') : null;
        this.submitSpinner = this.submitBtn ? this.submitBtn.querySelector('.spinner') : null;

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') {
                e.preventDefault();
                this.logout();
            }
        });

        this.init();
    }

    logout() {
        localStorage.removeItem('selectedJudge');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userToken');
        window.location.reload();
    }

    init() {
        const storedJudge = localStorage.getItem('selectedJudge');

        if (storedJudge && storedJudge.startsWith('Judge')) {
            this.selectRole(storedJudge);
        } else {
            this.setupRoleSelection();
        }
    }

    setupRoleSelection() {
        this.roleSelectionModal.classList.remove('hidden');
        this.mainContent.style.display = 'none';

        const buttons = this.roleSelectionModal.querySelectorAll('button[data-role]');
        buttons.forEach(button => {
            button.addEventListener('click', () => {
                const role = button.getAttribute('data-role');
                this.selectRole(role);
            });
        });

        const firstBtn = this.roleSelectionModal.querySelector('button[data-role]');
        if (firstBtn) {
            setTimeout(() => firstBtn.focus(), 50);
        }

        document.body.style.overflow = 'hidden';
    }

    selectRole(role) {
        this.selectedRole = role;

        if (role.startsWith('Judge')) {
            localStorage.setItem('selectedJudge', role);
            if (this.hiddenJudgeInput) this.hiddenJudgeInput.value = role;
        } else {
            localStorage.removeItem('selectedJudge');
            if (this.hiddenJudgeInput) this.hiddenJudgeInput.value = '';
        }

        this.roleSelectionModal.classList.add('hidden');
        this.mainContent.style.display = 'block';

        document.body.style.overflow = '';

        if (this.logoutBtn) this.logoutBtn.classList.remove('hidden');

        this.updateJudgeBadge(role);

        if (role === 'Admin') {
            this.scoringSection.style.display = 'none';
            this.resultsSection.style.display = 'block';
            if (this.categoryNav) this.categoryNav.style.display = 'none';
            
            // Add calculate overall scores button for admin
            this.addCalculateOverallButton();
        } else if (role.startsWith('Judge')) {
            this.scoringSection.style.display = 'block';
            this.resultsSection.style.display = 'none';

            if (this.categoryNav) this.categoryNav.style.display = '';
            
            this.restrictJudgeDropdown(role);
        }

        this.populateCandidateOptions();
        this.setupCategoryNavigation();
        this.loadCategory(this.currentCategory);
        
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        this.refreshBtn.addEventListener('click', () => this.loadResults());
        this.resultsCategory.addEventListener('change', () => this.loadResults());
        
        if (role === 'Admin') {
            this.loadResults();
        }
        
        this.setupAutoCalculate();
    }

    addCalculateOverallButton() {
        // Remove existing button if it exists
        const existingBtn = document.getElementById('calculateOverallBtn');
        if (existingBtn) {
            existingBtn.remove();
        }
        
        // Add new button
        const calculateBtn = document.createElement('button');
        calculateBtn.id = 'calculateOverallBtn';
        calculateBtn.className = 'calculate-overall-btn';
        calculateBtn.textContent = 'Calculate Overall Scores';
        calculateBtn.style.marginTop = '20px';
        calculateBtn.style.padding = '10px 20px';
        calculateBtn.style.backgroundColor = '#4CAF50';
        calculateBtn.style.color = 'white';
        calculateBtn.style.border = 'none';
        calculateBtn.style.borderRadius = '4px';
        calculateBtn.style.cursor = 'pointer';
        
        calculateBtn.addEventListener('click', async () => {
            try {
                this.showMessage('Calculating overall scores...', 'info');
                
                const result = await window.AppFunctions.calculateOverallScores();
                
                if (result && result.status === 'success') {
                    this.showMessage('Overall scores calculated successfully!', 'success');
                    setTimeout(() => this.loadResults(), 1000);
                } else {
                    throw new Error(result.message || 'Failed to calculate overall scores');
                }
            } catch (error) {
                this.showMessage('Error calculating overall scores: ' + (error.message || error), 'error');
                console.error('Calculate overall error:', error);
            }
        });
        
        this.results.appendChild(calculateBtn);
    }

    restrictJudgeDropdown(selectedJudge) {
        if (!this.judgeNameSelect) return;

         for (let i = this.judgeNameSelect.options.length - 1; i >= 0; i--) {
             const option = this.judgeNameSelect.options[i];
             if (option.value !== selectedJudge) {
                 this.judgeNameSelect.remove(i);
             }
         }
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
                <div class="candidate-department">${candidate.department || ''}</div>
            `;

            card.addEventListener('click', () => {
                document.querySelectorAll('.candidate-card.selected').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                const candidateNumberInput = document.getElementById('candidateNumber');
                if(candidateNumberInput) candidateNumberInput.value = candidate.number;
            });

            const imgEl = card.querySelector('.candidate-card-image');
            if (imgEl) {
                imgEl.style.cursor = 'zoom-in';
                imgEl.tabIndex = 0;

                imgEl.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    document.querySelectorAll('.candidate-card.selected').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    const candidateNumberInput = document.getElementById('candidateNumber');
                    if(candidateNumberInput) candidateNumberInput.value = candidate.number;

                    if (ev.ctrlKey || ev.metaKey) {
                        this.openLightbox(candidate);
                    }
                });

                imgEl.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        document.querySelectorAll('.candidate-card.selected').forEach(c => c.classList.remove('selected'));
                        card.classList.add('selected');
                        const candidateNumberInput = document.getElementById('candidateNumber');
                        if(candidateNumberInput) candidateNumberInput.value = candidate.number;

                        if (ev.shiftKey) {
                            this.openLightbox(candidate);
                        } else {
                            const firstInput = document.querySelector('.criteria-score-input');
                            if (firstInput) firstInput.focus();
                        }
                    }
                });
            }

            grid.appendChild(card);
        });
    }

    openLightbox(candidate) {
        const lb = document.getElementById('lightbox');
        const img = document.getElementById('lightboxImage');
        const name = document.getElementById('lightboxName');
        const number = document.getElementById('lightboxNumber');
        const scoreBtn = document.getElementById('lightboxScoreBtn');

        if (!lb || !img) return;

        img.src = candidate.image;
        img.alt = `Candidate ${candidate.number}: ${candidate.name}`;
        name.textContent = candidate.name;
        number.textContent = `Candidate #${candidate.number}`;

        scoreBtn.onclick = (e) => {
            e.preventDefault();
            document.getElementById('candidateNumber').value = candidate.number;
            this.closeLightbox();
            const firstInput = document.querySelector('.criteria-score-input');
            if (firstInput) firstInput.focus();
        };

        lb.classList.remove('hidden');
        document.querySelector('.container')?.classList.add('left-focused');

        document.getElementById('lightboxClose').onclick = () => this.closeLightbox();
        lb.querySelector('[data-close]')?.addEventListener('click', () => this.closeLightbox());

        this._lightboxEscHandler = (ev) => {
            if (ev.key === 'Escape') this.closeLightbox();
        };
        document.addEventListener('keydown', this._lightboxEscHandler, { once: false });
    }

    closeLightbox() {
        const lb = document.getElementById('lightbox');
        if (!lb) return;
        lb.classList.add('hidden');
        document.querySelector('.container')?.classList.remove('left-focused');

        if (this._lightboxEscHandler) {
            document.removeEventListener('keydown', this._lightboxEscHandler);
            this._lightboxEscHandler = null;
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
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-category="${category}"]`).classList.add('active');
        
        this.currentCategory = category;
        this.loadCategory(category);
    }

    loadCategory(category) {
        const categoryData = CATEGORIES[category];

        if (this.categoryTitleElem) {
            this.categoryTitleElem.textContent = categoryData.title;
        }

        this.displayCriteria(categoryData.criteria);
        this.createScoreInputs(categoryData.criteria);
        this.form.reset();

        document.getElementById('candidateNumber').value = '';
        document.querySelectorAll('.candidate-card').forEach(card => {
            card.classList.remove('selected');
        });

        const showcase = document.getElementById('candidateShowcase');
        if (showcase) {
            showcase.classList.add('hidden');
            showcase.innerHTML = '<div class="showcase-placeholder"><p>Select a candidate to begin scoring</p></div>';
        }

        this.calculateTotal();
    }

    displayCriteria(criteria) {
        if (!this.categoryCriteriaElem) return;
        this.categoryCriteriaElem.innerHTML = '';
        criteria.forEach(criterion => {
            const div = document.createElement('div');
            div.className = 'criteria-item';
            div.innerHTML = `<span>${criterion.name}</span><span>${criterion.percentage}% (${criterion.maxScore} pts)</span>`;
            this.categoryCriteriaElem.appendChild(div);
        });
    }

    createScoreInputs(criteria) {
        const inputsContainer = document.getElementById('scoreInputs');
        inputsContainer.innerHTML = '';
        
        criteria.forEach(criterion => {
            const div = document.createElement('div');
            div.className = 'criteria-score';
            div.innerHTML = `
                <label for="${criterion.name.replace(/\s/g, '')}" class="criteria-label">${criterion.name}</label>
                <div class="score-input-wrapper">
                    <input type="number" id="${criterion.name.replace(/\s/g, '')}" name="${criterion.name}" class="criteria-score-input" data-name="${criterion.name}" 
                    min="0" max="${criterion.maxScore}" step="0.1" required aria-label="${criterion.name} score" />
                    <span class="score-max">/ ${criterion.maxScore}</span>
                </div>
            `;
            inputsContainer.appendChild(div);
        });
    }

    setupAutoCalculate() {
        const inputsContainer = document.getElementById('scoreInputs');
        inputsContainer.addEventListener('input', (e) => {
            if (e.target.classList.contains('criteria-score-input')) {
                this.calculateTotal();
            }
        });
    }

    calculateTotal() {
        const inputs = document.querySelectorAll('.criteria-score-input');
        let total = 0;
        inputs.forEach(input => {
            total += parseFloat(input.value) || 0;
        });
        document.getElementById('totalScore').value = total.toFixed(1);
    }

    updateJudgeBadge(role) {
        if (role) {
            this.judgeBadge.textContent = role;
            this.judgeBadge.classList.remove('hidden');
        } else {
            this.judgeBadge.classList.add('hidden');
        }
    }

    showMessage(msg, type) {
        this.message.textContent = msg;
        this.message.className = `message ${type}`;
        this.message.classList.remove('hidden');
        setTimeout(() => {
            this.message.classList.add('hidden');
        }, 5000);
    }

    toggleSubmitLoading(isLoading) {
        if (isLoading) {
            this.submitBtn.setAttribute('disabled', 'disabled');
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
        const resolvedJudgeName = this.selectedRole || formData.get('judgeName') || (this.judgeNameSelect ? this.judgeNameSelect.value : '');
        const candidateNumber = document.getElementById('candidateNumber').value;
        const scores = this.getScores();

        const data = {
            judgeName: resolvedJudgeName,
            candidateNumber: candidateNumber,
            category: this.currentCategory,
            scores: scores,
            totalScore: parseFloat(document.getElementById('totalScore').value)
        };

        const validationError = this.validateSubmission(data);
        if (validationError) {
            this.showMessage(validationError, 'error');
            return;
        }

        let candidateName = '';
        if (typeof CANDIDATES_DATA !== "undefined") {
            const cand = CANDIDATES_DATA.find(c => c.number == candidateNumber);
            candidateName = cand ? cand.name : `#${candidateNumber}`;
        } else {
            candidateName = `#${candidateNumber}`;
        }

        const result = await Swal.fire({
            title: 'Are you sure?',
            html: `Are you sure these are the final scores for <b>${candidateName}</b>?<br>Total Score: <b>${data.totalScore.toFixed(1)}</b>`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Yes, submit',
            cancelButtonText: 'Cancel',
            focusCancel: true
        });

        if (!result.isConfirmed) return;

        try {
            this.toggleSubmitLoading(true);
            this.showMessage('Submitting score...', 'info');

            await window.AppFunctions.submitScore(data);

            this.showMessage('Score submitted successfully! ✓', 'success');
            this.form.reset();
            this.calculateTotal();
            
            document.getElementById('candidateNumber').value = '';
            document.querySelectorAll('.candidate-card.selected').forEach(c => c.classList.remove('selected'));
            
            setTimeout(() => this.loadResults(), 1000);
        } catch (error) {
            this.showMessage('Error submitting score: ' + (error.message || error), 'error');
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

    async loadResults() {
        const category = this.resultsCategory.value || this.currentCategory || 'overall';
        this.results.innerHTML = '<div class="loading">Loading results...</div>';

        try {
            const response = await window.AppFunctions.fetchResults(category);

            if (response && response.status === 'success') {
                this.displayResults(response.results, category);
            } else {
                throw new Error((response && response.message) || 'Unknown error fetching results');
            }
        } catch (error) {
            console.error('Load results error:', error);
            this.results.innerHTML = `
                <div class="message error">
                    <strong>Error loading results:</strong> ${error.message || error}
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

        let arr = results.slice();
        arr.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));

        const placementTitles = [
            'Binibining Minero 2025',
            '1st Runner-up',
            '2nd Runner-up',
            'Consolation Prize'
        ];

        let html = '';
        arr.forEach((candidate, index) => {
            const rankClass = index < 3 ? `rank-${index + 1}` : '';
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
            const candidateData = CANDIDATES_DATA.find(c => c.number == candidate.candidate);
            const candidateImage = candidateData ? candidateData.image : '';
            const candidateName = candidateData ? candidateData.name : `Candidate ${candidate.candidate}`;
            const candidateDept = candidateData ? candidateData.department || '' : '';

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
                        <div class="candidate-department">${candidateDept}</div>
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
        if (category === 'overall') {
            // For overall, show weighted components
            const criteria = CATEGORIES[category]?.criteria || [];
            let breakdown = '';
            criteria.forEach((criterion, index) => {
                const score = candidate.scores?.[criterion.name]?.toFixed(1) || '0.0';
                const percentage = criterion.percentage;
                breakdown += `${this.getShortenedName(criterion.name)}: ${score} (${percentage}%)`;
                if (index < criteria.length - 1) {
                    breakdown += ' | ';
                }
            });
            return `<span class="score-breakdown">${breakdown}</span>`;
        } else {
            // For category rankings, show individual judge scores
            if (!candidate.judges || candidate.judges.length === 0) {
                return '<span class="score-breakdown">No judge scores available</span>';
            }

            let breakdown = '';
            candidate.judges.forEach((judge, index) => {
                const judgeName = judge.judgeName || `Judge ${index + 1}`;
                const score = judge.totalScore?.toFixed(1) || '0.0';
                breakdown += `${judgeName}: ${score}`;
                if (index < candidate.judges.length - 1) {
                    breakdown += ' | ';
                }
            });

            return `<span class="score-breakdown">${breakdown}</span>`;
        }
    }

    getShortenedName(name) {
        const map = {
            'Stage Present': 'Stage',
            'Mastery': 'Mast',
            'Execution of Talent': 'Exec',
            'Overall Impact': 'Overall',
            'Suitability': 'Suit',
            'Sports Identity': 'Sport ID',
            'Poise and Bearing': 'Poise',
            'Overall Impact': 'Impact',
            'Design and Fitting': 'Design',
            'Stage Deportment': 'Stage Dep',
            'Natural Smile and Look': 'Smile',
            'Poise and Confidence': 'Confidence',
            'Personality': 'Personality',
            'Beauty': 'Beauty',
            'Wit and Content': 'Wit',
            'Projection and Delivery': 'Projection',
            'Stage Presence': 'Stage Pres',
            'Intelligence (Q&A)': 'Intelligence',
            'Sports Wear': 'Sports Wear',
            'Gown': 'Gown'
        };
        return map[name] || name;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PageantJudgingSystem();
});