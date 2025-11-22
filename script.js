// Replace this with your Google Apps Script Web App URL
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwkrSiL9I_7NzNJ0ULxdRoQrfzUr-quPlz87raa_pgfUBx-ckahy68e3YqYPM6CfRFriQ/exec';
// DEPLOYMENT ID AKfycbzFduq-6Pf4g6_LidXtXws4XNLTVtDDbrNeMbzSr_2kYwkIrsixXsA9_IQGRxL_Np_PSw
class PageantJudgingSystem {
    constructor() {
        this.currentCategory = 'talent';
        this.form = document.getElementById('scoreForm');
        this.message = document.getElementById('message');
        this.results = document.getElementById('results');
        this.refreshBtn = document.getElementById('refreshResults');
        this.resultsCategory = document.getElementById('resultsCategory');
        
        this.init();
    }

    init() {
        this.populateCandidateOptions();
        this.setupCategoryNavigation();
        this.loadCategory(this.currentCategory);
        
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        this.refreshBtn.addEventListener('click', () => this.loadResults());
        this.resultsCategory.addEventListener('change', () => this.loadResults());
        
        // Load initial results
        this.loadResults();
        
        // Auto-calculate total when scores change
        this.setupAutoCalculate();
    }

    populateCandidateOptions() {
        const select = document.getElementById('candidateNumber');
        select.innerHTML = '<option value="">Select Candidate</option>';
        
        CONTESTANTS.forEach(contestant => {
            const option = document.createElement('option');
            option.value = contestant;
            option.textContent = `Candidate ${contestant}`;
            select.appendChild(option);
        });
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

    async handleSubmit(e) {
        e.preventDefault();
        
        const formData = new FormData(this.form);
        const scores = this.getScores();
        
        const data = {
            judgeName: formData.get('judgeName'),
            candidateNumber: formData.get('candidateNumber'),
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

        try {
            await this.submitScore(data);
            this.showMessage('Score submitted successfully!', 'success');
            this.form.reset();
            this.calculateTotal();
            // Refresh results after successful submission
            setTimeout(() => this.loadResults(), 1000);
        } catch (error) {
            this.showMessage('Error submitting score: ' + error.message, 'error');
        }
    }

    getScores() {
        const scores = {};
        const criteria = CATEGORIES[this.currentCategory].criteria;
        const inputs = document.querySelectorAll('.criteria-score-input');
        
        criteria.forEach((criterion, index) => {
            scores[criterion.name] = parseFloat(inputs[index].value) || 0;
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
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const result = await response.json();
        
        if (result.status !== 'success') {
            throw new Error(result.message || 'Unknown error occurred');
        }

        return result;
    }

    async loadResults() {
        const category = this.resultsCategory.value;
        this.results.innerHTML = '<div class="loading">Loading results...</div>';
        
        try {
            const response = await fetch(`${SCRIPT_URL}?action=getResults&category=${category}`);
            const data = await response.json();
            
            if (data.status === 'success') {
                this.displayResults(data.results, category);
            } else {
                throw new Error(data.message);
            }
        } catch (error) {
            this.results.innerHTML = `<div class="message error">Error loading results: ${error.message}</div>`;
        }
    }

    displayResults(results, category) {
        if (!results || results.length === 0) {
            this.results.innerHTML = '<div class="loading">No results available yet.</div>';
            return;
        }

        let html = '';
        results.forEach((candidate, index) => {
            const rankClass = `rank-${index + 1}`;
            
            html += `
                <div class="ranking-item">
                    <div class="rank ${rankClass}">#${index + 1}</div>
                    <div class="candidate-info">
                        <div class="candidate-number">Candidate ${candidate.candidate}</div>
                        <div class="candidate-scores">
                            ${this.getScoreBreakdown(candidate, category)}
                        </div>
                    </div>
                    <div class="total-score">${candidate.totalScore.toFixed(2)}</div>
                </div>
            `;
        });
        
        this.results.innerHTML = html;
    }

    getScoreBreakdown(candidate, category) {
        if (category === 'overall') {
            return `
                <span class="score-breakdown">
                    Q&A: ${candidate.scores?.['Intelligence (Q&A)']?.toFixed(1) || '0.0'} |
                    Sports: ${candidate.scores?.['Sports Wear']?.toFixed(1) || '0.0'} |
                    Gown: ${candidate.scores?.['Gown']?.toFixed(1) || '0.0'} |
                    Impact: ${candidate.scores?.['Overall Impact']?.toFixed(1) || '0.0'}
                </span>
            `;
        }
        
        // For category-specific results, show criteria breakdown
        const criteria = CATEGORIES[category]?.criteria || [];
        let breakdown = '';
        criteria.forEach(criterion => {
            const score = candidate.scores?.[criterion.name]?.toFixed(1) || '0.0';
            breakdown += `${criterion.name.split(' ')[0]}: ${score} | `;
        });
        
        return `<span class="score-breakdown">${breakdown.slice(0, -3)}</span>`;
    }

    showMessage(text, type) {
        this.message.textContent = text;
        this.message.className = `message ${type}`;
        
        // Hide message after 5 seconds
        setTimeout(() => {
            this.message.className = 'message hidden';
        }, 5000);
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PageantJudgingSystem();
});