// Network and data functions separated from UI. Exposed as window.AppFunctions.

(() => {
    const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzs0wlZ_in7uWwX-QSfFwCE_PJIaxgs48SlyyakERn4A6uVaTyltoRpfJxMoq9A6HVcTA/exec';

    async function submitScore(data) {
        try {
            const params = new URLSearchParams({
                action: 'submitScore',
                data: JSON.stringify(data)
            });
            const url = `${SCRIPT_URL}?${params.toString()}`;
            const response = await fetch(url, { method: 'GET', redirect: 'follow' });
            const text = await response.text();

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${text}`);
            }

            let result;
            try {
                result = JSON.parse(text);
            } catch (err) {
                throw new Error('Invalid JSON response from server.');
            }

            if (result.status !== 'success') {
                throw new Error(result.message || 'Submission failed');
            }

            return result;
        } catch (err) {
            console.error('AppFunctions.submitScore error:', err);
            throw err;
        }
    }

    async function fetchResults(category = 'overall') {
        try {
            const url = `${SCRIPT_URL}?action=getResults&category=${encodeURIComponent(category)}`;
            const response = await fetch(url, { method: 'GET', redirect: 'follow' });
            const text = await response.text();

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${text}`);
            }

            let result;
            try {
                result = JSON.parse(text);
            } catch (err) {
                throw new Error('Invalid JSON response from server.');
            }

            return result;
        } catch (err) {
            console.error('AppFunctions.fetchResults error:', err);
            throw err;
        }
    }

    // NEW: Function to calculate overall scores
    async function calculateOverallScores() {
        try {
            const url = `${SCRIPT_URL}?action=calculateOverallScores`;
            const response = await fetch(url, { method: 'GET', redirect: 'follow' });
            const text = await response.text();

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${text}`);
            }

            let result;
            try {
                result = JSON.parse(text);
            } catch (err) {
                throw new Error('Invalid JSON response from server.');
            }

            return result;
        } catch (err) {
            console.error('AppFunctions.calculateOverallScores error:', err);
            throw err;
        }
    }

    // Export to global
    window.AppFunctions = {
        submitScore,
        fetchResults,
        calculateOverallScores
    };
})();