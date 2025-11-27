function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);
        return submitScore(data);
    } catch (error) {
        return createResponse('error', 'POST Error: ' + error.message);
    }
}

function doGet(e) {
    try {
        const action = e.parameter.action;
        
        if (action === 'getResults') {
            const category = e.parameter.category || 'overall';
            return getResults(category);
        } else if (action === 'submitScore') {
            // Handle GET-based score submission (fallback for CORS)
            const data = JSON.parse(e.parameter.data);
            return submitScore(data);
        } else {
            return createResponse('error', 'Invalid action');
        }
    } catch (error) {
        return createResponse('error', 'GET Error: ' + error.message);
    }
}

function submitScore(data) {
    try {
        const sheet = getSheet(data.category);
        const timestamp = new Date();

        // Prepare row data
        const rowData = [
            timestamp,
            data.judgeName,
            data.candidateNumber,
            data.totalScore
        ];

        // Add individual criterion scores
        const criteria = getCategoryCriteria(data.category);
        criteria.forEach(criterion => {
            rowData.push(data.scores[criterion.name] || 0);
        });

        // Add new row to sheet
        sheet.appendRow(rowData);

        return createResponse('success', 'Score submitted successfully');
    } catch (error) {
        return createResponse('error', 'Submit Error: ' + error.message);
    }
}

function getResults(category) {
    try {
        const sheet = getSheet(category);
        const data = sheet.getDataRange().getValues();

        if (data.length <= 1) {
            return ContentService
                .createTextOutput(JSON.stringify({
                    status: 'success',
                    results: []
                }))
                .setMimeType(ContentService.MimeType.JSON);
        }

        // Skip header row
        const rows = data.slice(1);
        const results = calculateResults(rows, category);

        return ContentService
            .createTextOutput(JSON.stringify({
                status: 'success',
                results: results
            }))
            .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
        return createResponse('error', 'Results Error: ' + error.message);
    }
}

function calculateResults(rows, category) {
    const candidateScores = {};
    const criteria = getCategoryCriteria(category);

    // Group scores by candidate
    rows.forEach(row => {
        const judgeName = row[1]; // judge name
        const candidate = row[2]; // candidate number
        const totalScore = row[3]; // total score

        if (!candidateScores[candidate]) {
            candidateScores[candidate] = {
                judges: []
            };
        }

        const judgeData = {
            judgeName: judgeName,
            totalScore: totalScore,
            criterionScores: {}
        };

        // Add individual criterion scores (starting from column 4)
        criteria.forEach((criterion, index) => {
            judgeData.criterionScores[criterion.name] = row[4 + index] || 0;
        });

        candidateScores[candidate].judges.push(judgeData);
    });

    // Calculate results for each candidate
    const results = [];
    for (const [candidate, data] of Object.entries(candidateScores)) {
        const judges = data.judges;
        const numberOfScores = judges.length;

        // Calculate average total score depending on category
        let totalAvg = 0;

        if (category === 'overall') {
            // Use weighted average for overall category
            const weightedSum = criteria.reduce((sum, criterion) => {
                const avgCriterionScore = judges.reduce((s, judge) => s + (judge.criterionScores[criterion.name] || 0), 0) / judges.length;
                return sum + (avgCriterionScore * (criterion.percentage / 100));
            }, 0);
            totalAvg = weightedSum;
        } else {
            // For other categories use average total score
            totalAvg = judges.reduce((sum, judge) => sum + judge.totalScore, 0) / judges.length;
        }

        // Calculate average for each criterion
        const avgScores = {};
        criteria.forEach(criterion => {
            avgScores[criterion.name] = judges.reduce((sum, judge) => sum + (judge.criterionScores[criterion.name] || 0), 0) / judges.length;
        });

        results.push({
            candidate: candidate,
            totalScore: totalAvg,
            scores: avgScores,
            judges: judges,
            numberOfScores: numberOfScores
        });
    }

    // Sort by total score (descending)
    results.sort((a, b) => b.totalScore - a.totalScore);

    return results;
}

function getCategoryCriteria(category) {
    const criteriaMap = {
        talent: [
            { name: "Stage Present", percentage: 30 },
            { name: "Mastery", percentage: 30 },
            { name: "Execution of Talent", percentage: 30 },
            { name: "Overall Impact", percentage: 10 }
        ],
        sports: [
            { name: "Suitability", percentage: 30 },
            { name: "Sports Identity", percentage: 20 },
            { name: "Poise and Bearing", percentage: 40 },
            { name: "Overall Impact", percentage: 10 }
        ],
        gown: [
            { name: "Poise and Bearing", percentage: 40 },
            { name: "Design and Fitting", percentage: 25 },
            { name: "Stage Deportment", percentage: 25 },
            { name: "Overall Impact", percentage: 10 }
        ],
        photogenic: [
            { name: "Natural Smile and Look", percentage: 30 },
            { name: "Poise and Confidence", percentage: 20 },
            { name: "Personality", percentage: 15 },
            { name: "Beauty", percentage: 35 }
        ],
        interview: [
            { name: "Wit and Content", percentage: 40 },
            { name: "Projection and Delivery", percentage: 30 },
            { name: "Stage Presence", percentage: 20 },
            { name: "Overall Impact", percentage: 10 }
        ],
        overall: [
            { name: "Intelligence (Q&A)", percentage: 45 },
            { name: "Sports Wear", percentage: 15 },
            { name: "Gown", percentage: 15 },
            { name: "Overall Impact", percentage: 25 }
        ]
    };

    return criteriaMap[category] || criteriaMap.overall;
}

function getSheet(category) {
    const SPREADSHEET_ID = '1gR29ljdFWJjYfu5t3hG-keJlGaDp8uUDDlrg_uPxD28';
    const sheetName = getSheetName(category);

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName(sheetName);

    // Create sheet if it doesn't exist
    if (!sheet) {
        sheet = spreadsheet.insertSheet(sheetName);
        createSheetHeaders(sheet, category);
    }

    return sheet;
}

function getSheetName(category) {
    const sheetNames = {
        talent: 'Talent Scores',
        sports: 'Sports Wear Scores',
        gown: 'Gown Scores',
        photogenic: 'Photogenic Scores',
        interview: 'Interview Scores',
        overall: 'Overall Scores'
    };

    return sheetNames[category] || 'Scores';
}

function createSheetHeaders(sheet, category) {
    const criteria = getCategoryCriteria(category);

    // Create header row
    const headers = ['Timestamp', 'Judge Name', 'Candidate Number', 'Total Score'];
    criteria.forEach(criterion => {
        headers.push(criterion.name);
    });

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');

    // Auto-resize columns
    sheet.autoResizeColumns(1, headers.length);
}

function createResponse(status, message, data = null) {
    const response = {
        status: status,
        message: message
    };

    if (data) {
        response.data = data;
    }

    return ContentService
        .createTextOutput(JSON.stringify(response))
        .setMimeType(ContentService.MimeType.JSON);
}

// Function to create all sheets at once (run this once manually)
function setupAllSheets() {
    const categories = ['talent', 'sports', 'gown', 'photogenic', 'interview', 'overall'];
    categories.forEach(category => {
        getSheet(category);
    });
}

// Test function to verify script works
function testGetResults() {
    const result = getResults('overall');
    Logger.log(result.getContent());
}

// Test function to verify submit works
function testSubmitScore() {
    const testData = {
        judgeName: "Test Judge",
        candidateNumber: "1",
        category: "talent",
        totalScore: 85.5,
        scores: {
            "Stage Present": 25,
            "Mastery": 27,
            "Execution of Talent": 28,
            "Overall Impact": 5.5
        }
    };
    const result = submitScore(testData);
    Logger.log(result.getContent());
}

  function renderResults(results, category) {
    if (!results || results.length === 0) {
      RESULTS_EL.innerHTML = '<div class="admin-message">No results yet for this category.</div>';
      return;
    }

    const html = results.map((r, idx) => {
      const candidate = (window.CANDIDATES_DATA || []).find(c => String(c.number) === String(r.candidate));
      const img = candidate ? candidate.image : '';
      const name = candidate ? candidate.name : `Candidate ${r.candidate}`;
      const dept = candidate ? candidate.department || '' : '';
      return `
        <div class="result-item ${idx < 3 ? 'top-'+(idx+1) : ''}">
          <div class="thumb"><img src="${img}" alt="${name}"></div>
          <div class="info">
            <div class="name">${name}</div>
            <div class="meta">Candidate ${r.candidate} — ${r.numberOfScores} judge${r.numberOfScores !== 1 ? 's' : ''}</div>
            <div class="candidate-department">${dept}</div>
          </div>
          <div class="score">${Number(r.totalScore).toFixed(2)}</div>
        </div>
      `;
    }).join('');
    RESULTS_EL.innerHTML = html;
  }