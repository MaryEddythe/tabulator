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

        // add: reference to category navigation so we can hide it for Admin
        this.categoryNav = document.querySelector('.category-nav');
        
        // Optional DOM elements: the category header/criteria were removed from the markup by request.
        // Cache references and gracefully skip updates when not present.
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
            this.logoutBtn.className = 'logout-btn hidden';
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

    logout() {
        // Clear stored data associated with current session/role
        localStorage.removeItem('selectedJudge');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userToken');

        // Optionally reset UI state or redirect to role selection page
        // For simplicity, reload page to show role selection modal again
        window.location.reload();
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
        if (this.logoutBtn) this.logoutBtn.classList.remove('hidden');

        // Update judge badge (visible for Judges and Admin)
        this.updateJudgeBadge(role);

        if (role === 'Admin') {
            // Admin: hide scoring, show live results
            this.scoringSection.style.display = 'none';
            this.resultsSection.style.display = 'block';
            // hide category navigation for admin (only show live results)
            if (this.categoryNav) this.categoryNav.style.display = 'none';
        } else if (role.startsWith('Judge')) {
            // Judge: show scoring, hide live results
            this.scoringSection.style.display = 'block';
            this.resultsSection.style.display = 'none';

            // ensure category nav is visible for judges
            if (this.categoryNav) this.categoryNav.style.display = '';
            
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
        // If there is no visible judge select in the DOM, nothing to restrict.
        if (!this.judgeNameSelect) return;

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
                <div class="candidate-department">${candidate.department || ''}</div>
            `;

            // clicking the card selects candidate (updated to toggle selected class)
            card.addEventListener('click', () => {
                // Remove selected class from all candidate cards
                document.querySelectorAll('.candidate-card.selected').forEach(c => c.classList.remove('selected'));
                // Add selected class to clicked card
                card.classList.add('selected');
                // Update candidate number hidden input or input element for scoring
                const candidateNumberInput = document.getElementById('candidateNumber');
                if(candidateNumberInput) candidateNumberInput.value = candidate.number;
            });

            // clicking the image should show inline enlarged preview by default.
            const imgEl = card.querySelector('.candidate-card-image');
            if (imgEl) {
                // visual affordance and keyboard access
                imgEl.style.cursor = 'zoom-in';
                imgEl.tabIndex = 0;

                imgEl.addEventListener('click', (ev) => {
                    ev.stopPropagation(); // avoid double-triggering card click handlers
                    // Show inline preview (same select behavior as card click)
                    document.querySelectorAll('.candidate-card.selected').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    const candidateNumberInput = document.getElementById('candidateNumber');
                    if(candidateNumberInput) candidateNumberInput.value = candidate.number;

                    // If user holds Ctrl (Windows) or Meta (Mac) while clicking, open full lightbox
                    if (ev.ctrlKey || ev.metaKey) {
                        this.openLightbox(candidate);
                    }
                });

                // Keyboard: Enter or Space on image opens inline preview; Shift+Enter opens lightbox
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
                            // focus first score input for quick scoring
                            const firstInput = document.querySelector('.criteria-score-input');
                            if (firstInput) firstInput.focus();
                        }
                    }
                });
            }

            grid.appendChild(card);
        });
    }

    // Open lightbox / preview for candidate (candidate is object from CANDIDATES_DATA)
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

        // Score button should focus the scoring panel and close the lightbox
        scoreBtn.onclick = (e) => {
            e.preventDefault();
            // ensure candidate is selected (should be already)
            document.getElementById('candidateNumber').value = candidate.number;
            // close preview and focus first score input
            this.closeLightbox();
            const firstInput = document.querySelector('.criteria-score-input');
            if (firstInput) firstInput.focus();
        };

        // show lightbox and set container state to expand left panel
        lb.classList.remove('hidden');
        document.querySelector('.container')?.classList.add('left-focused');

        // attach close handlers
        document.getElementById('lightboxClose').onclick = () => this.closeLightbox();
        // clicking backdrop closes
        lb.querySelector('[data-close]')?.addEventListener('click', () => this.closeLightbox());

        // escape key closes
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

        // cleanup backdrop and escape handler
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

        // Update title if element exists (header may be removed)
        if (this.categoryTitleElem) {
            this.categoryTitleElem.textContent = categoryData.title;
        }

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
        // If the criteria container is not present (header removed), skip DOM writes.
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

            // CALL external function that handles network submission
            await window.AppFunctions.submitScore(data);

            this.showMessage('Score submitted successfully! ✓', 'success');
            this.form.reset();
            this.calculateTotal();
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
            // fetch results via separated function
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

    // helper: compute total from candidate.scores using category criteria (client-side)
    computeTotalForCategory(candidate, category) {
        const criteria = CATEGORIES[category]?.criteria || [];
        if (!candidate || !candidate.scores || criteria.length === 0) return 0;
        return criteria.reduce((sum, crit) => {
            const v = parseFloat(candidate.scores?.[crit.name]) || 0;
            return sum + v;
        }, 0);
    }

    // helper: try to obtain a category total (0-100) from various candidate shapes
    getCategoryTotalPercent(candidate, categoryKey) {
        // 1) If candidate already has scores for that category by criteria, use computeTotalForCategory
        const totalFromCriteria = this.computeTotalForCategory(candidate, categoryKey);
        if (totalFromCriteria > 0) return Math.min(100, (totalFromCriteria / (CATEGORIES[categoryKey]?.total || 100)) * 100);

        // 2) If candidate has nested breakdown per category (common shapes)
        if (candidate.scoresByCategory && candidate.scoresByCategory[categoryKey]) {
            const obj = candidate.scoresByCategory[categoryKey];
            if (typeof obj.total === 'number') return Math.min(100, (obj.total / (CATEGORIES[categoryKey]?.total || 100)) * 100);
            // try summing numeric values in obj
            const sum = Object.values(obj).reduce((s, v) => s + (parseFloat(v) || 0), 0);
            if (sum > 0) return Math.min(100, (sum / (CATEGORIES[categoryKey]?.total || 100)) * 100);
        }

        // 3) Common alternate shapes: candidate.totalScores[categoryKey] or candidate[categoryKey + 'Total']
        if (candidate.totalScores && typeof candidate.totalScores[categoryKey] === 'number') {
            return Math.min(100, (candidate.totalScores[categoryKey] / (CATEGORIES[categoryKey]?.total || 100)) * 100);
        }
        const altKey = categoryKey + 'Total';
        if (typeof candidate[altKey] === 'number') {
            return Math.min(100, (candidate[altKey] / (CATEGORIES[categoryKey]?.total || 100)) * 100);
        }

        // 4) fallback to candidate.totalScore if categoryKey matches current category (not useful here) -> return 0
        return 0;
    }

    // compute average "Overall Impact" from talent, sports, gown, interview (each normalized 0..1)
    computeOverallImpactAverage(candidate) {
        const cats = ['talent', 'sports', 'gown', 'interview'];
        let sumFraction = 0;
        let count = 0;

        cats.forEach(cat => {
            const crits = CATEGORIES[cat]?.criteria || [];
            // find criterion named "Overall Impact" or "Audience Impact" fallback for talent
            const targetNames = ['Overall Impact', 'Audience Impact'];
            let found = false;
            for (const target of targetNames) {
                const crit = crits.find(c => c.name === target);
                if (crit) {
                    // prefer candidate.scoresByCategory if present
                    let val = null;
                    if (candidate.scoresByCategory && candidate.scoresByCategory[cat] && candidate.scoresByCategory[cat][target] !== undefined) {
                        val = parseFloat(candidate.scoresByCategory[cat][target]) || 0;
                    } else if (candidate.scores && candidate.scores[target] !== undefined && typeof candidate.scores[target] === 'number') {
                        // NOTE: global candidate.scores may not be namespaced; only use if present
                        val = parseFloat(candidate.scores[target]) || 0;
                    } else if (candidate.scoresByCategory && candidate.scoresByCategory[cat]) {
                        // try to find any numeric field named similarly
                        const obj = candidate.scoresByCategory[cat];
                        val = Object.entries(obj).reduce((v, [k, x]) => (k === target ? (parseFloat(x) || 0) : v), null);
                    }
                    if (val === null) val = 0;
                    sumFraction += (val / (crit.maxScore || 1));
                    count++;
                    found = true;
                    break;
                }
            }
            // if no matching criterion found in CATEGORIES for this cat, skip
            if (!found) {
                // try to sniff a numeric "Overall Impact" in scoresByCategory if present
                if (candidate.scoresByCategory && candidate.scoresByCategory[cat]) {
                    const obj = candidate.scoresByCategory[cat];
                    const key = Object.keys(obj).find(k => /overall impact|impact/i.test(k));
                    if (key) {
                        const v = parseFloat(obj[key]) || 0;
                        // best-effort maxScore guess (10) to avoid bias
                        sumFraction += (v / 10);
                        count++;
                    }
                }
            }
        });

        return count > 0 ? (sumFraction / count) : 0;
    }

    computeOverallComposite(candidate) {
        const interviewPct = this.getCategoryTotalPercent(candidate, 'interview'); 
        const sportsPct = this.getCategoryTotalPercent(candidate, 'sports');
        const gownPct = this.getCategoryTotalPercent(candidate, 'gown');

        const impactAvgFraction = this.computeOverallImpactAverage(candidate); 
        const impactPoints = impactAvgFraction * 100; 

        const interviewWeight = 0.45;
        const sportsWeight = 0.15;
        const gownWeight = 0.15;
        const impactWeight = 0.25;

        const composite = (interviewPct * interviewWeight) +
                          (sportsPct * sportsWeight) +
                          (gownPct * gownWeight) +
                          (impactPoints * impactWeight);

        return Math.round(composite * 100) / 100; 
    }

    displayResults(results, category) {
        if (!results || results.length === 0) {
            this.results.innerHTML = '<div class="loading">No results available yet. Start scoring to see results!</div>';
            return;
        }

        let arr = results.slice();

        if (category === 'overall') {
            arr.sort((a, b) => {
                const ta = this.computeOverallComposite(a);
                const tb = this.computeOverallComposite(b);
                return tb - ta;
            });
        } else {
            arr.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
        }

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
        const criteria = CATEGORIES[category]?.criteria || [];
        
        if (category === 'overall') {
            const interviewPct = this.getCategoryTotalPercent(candidate, 'interview');
            const sportsPct = this.getCategoryTotalPercent(candidate, 'sports');
            const gownPct = this.getCategoryTotalPercent(candidate, 'gown');
            const impactFraction = this.computeOverallImpactAverage(candidate);

            const interviewPoints = (interviewPct * 0.45).toFixed(2);
            const sportsPoints = (sportsPct * 0.15).toFixed(2);
            const gownPoints = (gownPct * 0.15).toFixed(2);
            const impactPoints = (impactFraction * 100 * 0.25).toFixed(2);

            return `<span class="score-breakdown">Q&A(45%): ${interviewPoints} | Sports(15%): ${sportsPoints} | Gown(15%): ${gownPoints} | Impact(25%): ${impactPoints}</span>`;
        }
        
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
        const map = {
            'Stage Present': 'Stage',
            'Mastery': 'Mast',
            'Execution of Talent': 'Exec',
            'Audience Impact': 'Audience',
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

