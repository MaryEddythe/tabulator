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
        } else if (action === 'calculateOverallScores') {
            return calculateOverallScores();
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

        // Use totalScore directly (no special handling needed)
        const totalScoreToSave = data.totalScore;

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

        // If category is 'overall', read from the Overall Scores sheet
        if (category === 'overall') {
            const spreadsheet = SpreadsheetApp.openById('1gR29ljdFWJjYfu5t3hG-keJlGaDp8uUDDlrg_uPxD28');
            const overallSheet = spreadsheet.getSheetByName('Overall Scores');
            
            if (!overallSheet) {
                return ContentService
                    .createTextOutput(JSON.stringify({
                        status: 'success',
                        results: []
                    }))
                    .setMimeType(ContentService.MimeType.JSON);
            }
            
            const dataRange = overallSheet.getDataRange();
            if (!dataRange) {
                return ContentService
                    .createTextOutput(JSON.stringify({
                        status: 'success',
                        results: []
                    }))
                    .setMimeType(ContentService.MimeType.JSON);
            }
            
            const data = dataRange.getValues();
            
            if (!Array.isArray(data) || data.length <= 1) {
                return ContentService
                    .createTextOutput(JSON.stringify({
                        status: 'success',
                        results: []
                    }))
                    .setMimeType(ContentService.MimeType.JSON);
            }
            
            // Skip header row
            const rows = data.slice(1);
            
            // For overall category, we have a simpler structure
            const results = [];
            rows.forEach(row => {
                const candidate = row[2]; // Candidate number
                const overallScore = parseFloat(row[3]); // Overall score
                const interviewTotal = parseFloat(row[4]);
                const sportsTotal = parseFloat(row[5]);
                const gownTotal = parseFloat(row[6]);
                const overallImpactScore = parseFloat(row[7]);
                
                if (candidate && !isNaN(overallScore)) {
                    results.push({
                        candidate: candidate,
                        totalScore: overallScore,
                        scores: {
                            'Intelligence (Q&A)': interviewTotal,
                            'Sports Wear': sportsTotal,
                            'Gown': gownTotal,
                            'Overall Impact': overallImpactScore
                        },
                        numberOfScores: 1 // This is calculated, not from individual judges
                    });
                }
            });
            
            // Sort by total score (descending)
            results.sort((a, b) => b.totalScore - a.totalScore);
            
            return ContentService
                .createTextOutput(JSON.stringify({
                    status: 'success',
                    results: results
                }))
                .setMimeType(ContentService.MimeType.JSON);
        }
        
        // For other categories, use the existing logic
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

// NEW: Function to calculate overall scores from individual categories
function calculateOverallScores() {
    try {
        const spreadsheet = SpreadsheetApp.openById('1gR29ljdFWJjYfu5t3hG-keJlGaDp8uUDDlrg_uPxD28');
        
        // Get all individual category sheets
        const categories = ['interview', 'sports', 'gown'];
        const categoryData = {};
        
        categories.forEach(category => {
            const sheet = spreadsheet.getSheetByName(getSheetName(category));
            if (sheet) {
                const data = sheet.getDataRange().getValues();
                if (data.length > 1) {
                    categoryData[category] = data.slice(1); // Skip header
                }
            }
        });
        
        // Get existing Overall Scores sheet or create it
        let overallSheet = spreadsheet.getSheetByName('Overall Scores');
        if (!overallSheet) {
            overallSheet = spreadsheet.insertSheet('Overall Scores');
            // Create header for Overall Scores sheet
            const headers = ['Timestamp', 'Judge Name', 'Candidate Number', 'Overall Score', 
                            'Interview Total', 'Sports Total', 'Gown Total', 'Overall Impact Score'];
            overallSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
            overallSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
            overallSheet.autoResizeColumns(1, headers.length);
        }
        
        // Clear existing data (except header)
        const lastRow = overallSheet.getLastRow();
        if (lastRow > 1) {
            overallSheet.getRange(2, 1, lastRow - 1, overallSheet.getLastColumn()).clearContent();
        }
        
        // Calculate overall scores for each candidate
        const candidateScores = {};
        
        // Process each category
        Object.keys(categoryData).forEach(category => {
            const data = categoryData[category];
            data.forEach(row => {
                const candidate = row[2]; // Candidate number
                const totalScore = parseFloat(row[3]); // Total score
                const overallImpactScore = parseFloat(row[7]); // Overall Impact score (column index 7)
                
                if (candidate && !isNaN(totalScore) && !isNaN(overallImpactScore)) {
                    if (!candidateScores[candidate]) {
                        candidateScores[candidate] = {
                            interview: { total: [], overallImpact: [] },
                            sports: { total: [], overallImpact: [] },
                            gown: { total: [], overallImpact: [] }
                        };
                    }
                    
                    // Add the scores to the respective category
                    if (category === 'interview') {
                        candidateScores[candidate].interview.total.push(totalScore);
                        candidateScores[candidate].interview.overallImpact.push(overallImpactScore);
                    } else if (category === 'sports') {
                        candidateScores[candidate].sports.total.push(totalScore);
                        candidateScores[candidate].sports.overallImpact.push(overallImpactScore);
                    } else if (category === 'gown') {
                        candidateScores[candidate].gown.total.push(totalScore);
                        candidateScores[candidate].gown.overallImpact.push(overallImpactScore);
                    }
                }
            });
        });
        
        // Calculate weighted averages and add to Overall Scores sheet
        Object.keys(candidateScores).forEach(candidate => {
            const scores = candidateScores[candidate];
            
            // Calculate average total scores for each category
            const avgInterviewTotal = scores.interview.total.length > 0 ? 
                scores.interview.total.reduce((a, b) => a + b, 0) / scores.interview.total.length : 0;
            
            const avgSportsTotal = scores.sports.total.length > 0 ? 
                scores.sports.total.reduce((a, b) => a + b, 0) / scores.sports.total.length : 0;
            
            const avgGownTotal = scores.gown.total.length > 0 ? 
                scores.gown.total.reduce((a, b) => a + b, 0) / scores.gown.total.length : 0;
            
            // Calculate average overall impact scores
            const avgInterviewImpact = scores.interview.overallImpact.length > 0 ? 
                scores.interview.overallImpact.reduce((a, b) => a + b, 0) / scores.interview.overallImpact.length : 0;
            
            const avgSportsImpact = scores.sports.overallImpact.length > 0 ? 
                scores.sports.overallImpact.reduce((a, b) => a + b, 0) / scores.sports.overallImpact.length : 0;
            
            const avgGownImpact = scores.gown.overallImpact.length > 0 ? 
                scores.gown.overallImpact.reduce((a, b) => a + b, 0) / scores.gown.overallImpact.length : 0;
            
            // Calculate overall impact score as average of the three
            const overallImpactScore = (avgInterviewImpact + avgSportsImpact + avgGownImpact) / 3;
            
            // Calculate weighted overall score
            const overallScore = (avgInterviewTotal * 0.45) + 
                               (avgSportsTotal * 0.15) + 
                               (avgGownTotal * 0.15) + 
                               (overallImpactScore * 0.25);
            
            // Add row to Overall Scores sheet
            overallSheet.appendRow([
                new Date(),
                'Calculated Overall',
                candidate,
                overallScore,
                avgInterviewTotal,
                avgSportsTotal,
                avgGownTotal,
                overallImpactScore
            ]);
        });
        
        return createResponse('success', 'Overall scores calculated successfully');
    } catch (error) {
        return createResponse('error', 'Error calculating overall scores: ' + error.message);
    }
}