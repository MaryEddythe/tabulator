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

        // Determine totalScore to save:
        // For overall category, if weightedTotal is present, use it;
        // otherwise use data.totalScore
        let totalScoreToSave = data.totalScore;
        if (data.category === 'overall' && data.weightedTotal != null) {
            totalScoreToSave = data.weightedTotal;
        }

        // Prepare row data
        const rowData = [
            timestamp,
            data.judgeName,
            data.candidateNumber,
            totalScoreToSave
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
        if (!category || typeof category !== 'string') {
            Logger.log('Invalid category parameter in getResults: ' + category);
            return createResponse('error', 'Invalid category parameter');
        }

        const sheet = getSheet(category);
        if (!sheet) {
            Logger.log(`Sheet for category "${category}" not found or could not be created`);
            return createResponse('error', `Sheet for category "${category}" not found or could not be created`);
        }

        const dataRange = sheet.getDataRange();
        if (!dataRange) {
            Logger.log(`No data found in sheet for category "${category}"`);
            return createResponse('error', `No data found in sheet for category "${category}"`);
        }

        const data = dataRange.getValues();

        if (!Array.isArray(data) || data.length <= 1) {
            // No data or only header row
            Logger.log(`No scoring data rows for category "${category}"`);
            return ContentService
                .createTextOutput(JSON.stringify({
                    status: 'success',
                    results: []
                }))
                .setMimeType(ContentService.MimeType.JSON);
        }

        // Skip header row
        const rows = data.slice(1);

        if (!rows.every(row => Array.isArray(row))) {
            Logger.log('Malformed data found in sheet rows for category: ' + category);
            return createResponse('error', 'Malformed data found in sheet rows');
        }

        // Defensive check for null or undefined rows and cells
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row || !Array.isArray(row)) {
                Logger.log(`Skipping null or invalid row at index ${i}: ${JSON.stringify(row)}`);
                rows.splice(i, 1);
                i--;
                continue;
            }
        }

        const results = calculateResults(rows, category);

        return ContentService
            .createTextOutput(JSON.stringify({
                status: 'success',
                results: results
            }))
            .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
        Logger.log('Error in getResults: ' + error.stack);
        return createResponse('error', 'Results Error: ' + error.message);
    }
}

function calculateResults(rows, category) {
    const candidateScores = {};
    const criteria = getCategoryCriteria(category) || [];

    if (!Array.isArray(rows)) {
        Logger.log('Invalid rows data in calculateResults');
        throw new Error('Invalid rows data');
    }

    // Group scores by candidate
    rows.forEach((row, rowIndex) => {
        // Defensive checks for expected columns
        if (!Array.isArray(row) || row.length < 4) {
            Logger.log(`Skipping malformed row at index ${rowIndex}: ${JSON.stringify(row)}`);
            return;
        }

        const candidate = row[2]; // candidate number at col 3 expected
        const totalScore = parseFloat(row[3]);

        if (!candidate) {
            Logger.log(`Skipping row with missing candidate number at index ${rowIndex}`);
            return;
        }

        if (isNaN(totalScore)) {
            Logger.log(`Skipping row with invalid totalScore at index ${rowIndex}: ${row[3]}`);
            return;
        }

        if (!candidateScores[candidate]) {
            candidateScores[candidate] = {
                totalScores: [],
                criterionScores: {}
            };

            criteria.forEach((criterion) => {
                candidateScores[candidate].criterionScores[criterion.name] = [];
            });
        }

        candidateScores[candidate].totalScores.push(totalScore);

        criteria.forEach((criterion, index) => {
            const rawScore = row[4 + index];
            const criterionScore = (typeof rawScore === 'number' && !isNaN(rawScore)) ? rawScore : 0;
            candidateScores[candidate].criterionScores[criterion.name].push(criterionScore);
        });
    });

    const results = [];
    for (const [candidate, scores] of Object.entries(candidateScores)) {
        const totalCount = scores.totalScores.length;
        if (totalCount === 0) continue;

        // Calculate average scores per criterion
        const avgScores = {};
        for (const [criterionName, criterionScores] of Object.entries(scores.criterionScores)) {
            const count = criterionScores.length;
            avgScores[criterionName] = count > 0 ?
                (criterionScores.reduce((sum, score) => sum + score, 0) / count) : 0;
        }

        // Calculate weighted total score based on criteria percentages
        let weightedTotal = 0;
        criteria.forEach(criterion => {
            const avg = avgScores[criterion.name] || 0;
            weightedTotal += (avg * (criterion.percentage || 0)) / 100;
        });

        results.push({
            candidate: candidate,
            totalScore: weightedTotal,
            scores: avgScores,
            numberOfScores: totalCount
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
            { name: "Audience Impact", percentage: 10 }
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
            "Audience Impact": 5.5
        }
    };
    const result = submitScore(testData);
    Logger.log(result.getContent());
}