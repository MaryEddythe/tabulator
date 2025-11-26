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
        const totalScoreToSave = data.totalScore;

        const rowData = [
            timestamp,
            data.judgeName,
            data.candidateNumber,
            totalScoreToSave
        ];

        const criteria = getCategoryCriteria(data.category);
        criteria.forEach(criterion => {
            rowData.push(data.scores[criterion.name] || 0);
        });

        sheet.appendRow(rowData);
        
        // Auto-calculate overall scores after each submission to interview, sports, or gown
        if (data.category === 'interview' || data.category === 'sports' || data.category === 'gown') {
            try {
                calculateOverallScores();
            } catch (err) {
                Logger.log('Auto-calculate overall scores failed: ' + err.message);
            }
        }
        
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

        if (category === 'overall') {
            return getOverallResults();
        }
        
        const sheet = getSheet(category);
        if (!sheet) {
            Logger.log(`Sheet for category "${category}" not found`);
            return createResponse('error', `Sheet for category "${category}" not found`);
        }

        const dataRange = sheet.getDataRange();
        if (!dataRange) {
            Logger.log(`No data found in sheet for category "${category}"`);
            return createResponse('error', `No data found in sheet for category "${category}"`);
        }

        const data = dataRange.getValues();

        if (!Array.isArray(data) || data.length <= 1) {
            Logger.log(`No scoring data rows for category "${category}"`);
            return ContentService
                .createTextOutput(JSON.stringify({
                    status: 'success',
                    results: []
                }))
                .setMimeType(ContentService.MimeType.JSON);
        }

        const rows = data.slice(1);

        if (!rows.every(row => Array.isArray(row))) {
            Logger.log('Malformed data found in sheet rows for category: ' + category);
            return createResponse('error', 'Malformed data found in sheet rows');
        }

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

function getOverallResults() {
    try {
        const spreadsheet = SpreadsheetApp.openById('1gR29ljdFWJjYfu5t3hG-keJlGaDp8uUDDlrg_uPxD28');
        
        // Get data from the three main categories
        const categories = ['interview', 'sports', 'gown'];
        const candidateScores = {};
        
        categories.forEach(category => {
            const sheet = spreadsheet.getSheetByName(getSheetName(category));
            if (!sheet) {
                Logger.log(`Sheet not found for category: ${category}`);
                return;
            }
            
            const data = sheet.getDataRange().getValues();
            if (data.length <= 1) {
                Logger.log(`No data in sheet for category: ${category}`);
                return;
            }
            
            const rows = data.slice(1); // Skip header
            
            rows.forEach(row => {
                const candidate = row[2]; // Candidate number (column C)
                const totalScore = parseFloat(row[3]); // Total score (column D)
                
                // Get the "Overall Impact" score - it's the LAST criterion column
                // Columns: A=Timestamp, B=Judge, C=Candidate, D=Total, E onwards=criteria
                // For interview: E=Wit, F=Projection, G=Stage Presence, H=Overall Impact
                // For sports: E=Suitability, F=Sports Identity, G=Poise, H=Overall Impact
                // For gown: E=Poise, F=Design, G=Stage Deportment, H=Overall Impact
                const overallImpactScore = parseFloat(row[7]) || 0; // Column H (index 7)
                
                if (!candidate || isNaN(totalScore)) {
                    Logger.log(`Skipping invalid row: candidate=${candidate}, totalScore=${totalScore}`);
                    return;
                }
                
                if (!candidateScores[candidate]) {
                    candidateScores[candidate] = {
                        interviewTotals: [],
                        sportsTotals: [],
                        gownTotals: [],
                        impactScores: []
                    };
                }
                
                // Store the category total score and impact score
                if (category === 'interview') {
                    candidateScores[candidate].interviewTotals.push(totalScore);
                    candidateScores[candidate].impactScores.push(overallImpactScore);
                    Logger.log(`Interview - Candidate ${candidate}: Total=${totalScore}, Impact=${overallImpactScore}`);
                } else if (category === 'sports') {
                    candidateScores[candidate].sportsTotals.push(totalScore);
                    candidateScores[candidate].impactScores.push(overallImpactScore);
                    Logger.log(`Sports - Candidate ${candidate}: Total=${totalScore}, Impact=${overallImpactScore}`);
                } else if (category === 'gown') {
                    candidateScores[candidate].gownTotals.push(totalScore);
                    candidateScores[candidate].impactScores.push(overallImpactScore);
                    Logger.log(`Gown - Candidate ${candidate}: Total=${totalScore}, Impact=${overallImpactScore}`);
                }
            });
        });
        
        // Calculate overall scores for each candidate
        const results = [];
        
        for (const [candidate, scores] of Object.entries(candidateScores)) {
            // Calculate average scores for each category
            const avgInterviewTotal = scores.interviewTotals.length > 0 
                ? scores.interviewTotals.reduce((a, b) => a + b, 0) / scores.interviewTotals.length 
                : 0;
            
            const avgSportsTotal = scores.sportsTotals.length > 0 
                ? scores.sportsTotals.reduce((a, b) => a + b, 0) / scores.sportsTotals.length 
                : 0;
            
            const avgGownTotal = scores.gownTotals.length > 0 
                ? scores.gownTotals.reduce((a, b) => a + b, 0) / scores.gownTotals.length 
                : 0;
            
            const avgOverallImpact = scores.impactScores.length > 0 
                ? scores.impactScores.reduce((a, b) => a + b, 0) / scores.impactScores.length 
                : 0;
            
            // Calculate weighted overall score
            // Intelligence (Q&A): 45%, Sports Wear: 15%, Gown: 15%, Overall Impact: 25%
            const overallScore = (avgInterviewTotal * 0.45) + 
                               (avgSportsTotal * 0.15) + 
                               (avgGownTotal * 0.15) + 
                               (avgOverallImpact * 0.25);
            
            Logger.log(`Candidate ${candidate}: Interview=${avgInterviewTotal}, Sports=${avgSportsTotal}, Gown=${avgGownTotal}, Impact=${avgOverallImpact}, Overall=${overallScore}`);
            
            results.push({
                candidate: candidate,
                totalScore: overallScore,
                scores: {
                    'Intelligence (Q&A)': avgInterviewTotal,
                    'Sports Wear': avgSportsTotal,
                    'Gown': avgGownTotal,
                    'Overall Impact': avgOverallImpact
                },
                numberOfScores: Math.max(
                    scores.interviewTotals.length,
                    scores.sportsTotals.length,
                    scores.gownTotals.length
                )
            });
        }
        
        // Sort by total score (descending)
        results.sort((a, b) => b.totalScore - a.totalScore);
        
        return ContentService
            .createTextOutput(JSON.stringify({
                status: 'success',
                results: results
            }))
            .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
        Logger.log('Error in getOverallResults: ' + error.stack);
        return createResponse('error', 'Overall Results Error: ' + error.message);
    }
}

function calculateResults(rows, category) {
    const candidateScores = {};
    const criteria = getCategoryCriteria(category) || [];

    if (!Array.isArray(rows)) {
        Logger.log('Invalid rows data in calculateResults');
        throw new Error('Invalid rows data');
    }

    rows.forEach((row, rowIndex) => {
        if (!Array.isArray(row) || row.length < 4) {
            Logger.log(`Skipping malformed row at index ${rowIndex}: ${JSON.stringify(row)}`);
            return;
        }

        const candidate = row[2];
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

        const avgScores = {};
        for (const [criterionName, criterionScores] of Object.entries(scores.criterionScores)) {
            const count = criterionScores.length;
            avgScores[criterionName] = count > 0 ?
                (criterionScores.reduce((sum, score) => sum + score, 0) / count) : 0;
        }

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

    const headers = ['Timestamp', 'Judge Name', 'Candidate Number', 'Total Score'];
    criteria.forEach(criterion => {
        headers.push(criterion.name);
    });

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
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

function setupAllSheets() {
    const categories = ['talent', 'sports', 'gown', 'photogenic', 'interview', 'overall'];
    categories.forEach(category => {
        getSheet(category);
    });
}

function calculateOverallScores() {
    try {
        Logger.log('Starting calculateOverallScores function');
        const spreadsheet = SpreadsheetApp.openById('1gR29ljdFWJjYfu5t3hG-keJlGaDp8uUDDlrg_uPxD28');
        
        const categories = ['interview', 'sports', 'gown'];
        const categoryData = {};
        
        // Collect data from each category sheet
        categories.forEach(category => {
            const sheetName = getSheetName(category);
            Logger.log(`Looking for sheet: ${sheetName}`);
            const sheet = spreadsheet.getSheetByName(sheetName);
            if (sheet) {
                const data = sheet.getDataRange().getValues();
                Logger.log(`Found ${data.length} rows in ${sheetName}`);
                if (data.length > 1) {
                    categoryData[category] = data.slice(1); // Skip header
                }
            } else {
                Logger.log(`Sheet not found: ${sheetName}`);
            }
        });
        
        // Get or create Overall Scores sheet
        let overallSheet = spreadsheet.getSheetByName('Overall Scores');
        if (!overallSheet) {
            Logger.log('Creating Overall Scores sheet');
            overallSheet = spreadsheet.insertSheet('Overall Scores');
            const headers = ['Timestamp', 'Candidate Number', 'Total Score', 'Intelligence (Q&A)', 
                            'Sports Wear', 'Gown', 'Overall Impact'];
            overallSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
            overallSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
            overallSheet.autoResizeColumns(1, headers.length);
        }
        
        // Clear existing data (except header)
        const lastRow = overallSheet.getLastRow();
        if (lastRow > 1) {
            Logger.log(`Clearing rows 2 to ${lastRow}`);
            overallSheet.getRange(2, 1, lastRow - 1, overallSheet.getLastColumn()).clearContent();
        }
        
        // Aggregate scores by candidate
        const candidateScores = {};
        
        Object.keys(categoryData).forEach(category => {
            const data = categoryData[category];
            Logger.log(`Processing ${data.length} rows from ${category}`);
            
            data.forEach((row, idx) => {
                const candidate = row[2]; // Column C
                const totalScore = parseFloat(row[3]); // Column D
                const overallImpactScore = parseFloat(row[7]); // Column H
                
                Logger.log(`Row ${idx}: Candidate=${candidate}, Total=${totalScore}, Impact=${overallImpactScore}`);
                
                if (candidate && !isNaN(totalScore) && !isNaN(overallImpactScore)) {
                    if (!candidateScores[candidate]) {
                        candidateScores[candidate] = {
                            interview: { total: [], overallImpact: [] },
                            sports: { total: [], overallImpact: [] },
                            gown: { total: [], overallImpact: [] }
                        };
                    }
                    
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
        
        Logger.log(`Found ${Object.keys(candidateScores).length} candidates`);
        
        // Calculate and write overall scores
        Object.keys(candidateScores).forEach(candidate => {
            const scores = candidateScores[candidate];
            
            const avgInterviewTotal = scores.interview.total.length > 0 ? 
                scores.interview.total.reduce((a, b) => a + b, 0) / scores.interview.total.length : 0;
            
            const avgSportsTotal = scores.sports.total.length > 0 ? 
                scores.sports.total.reduce((a, b) => a + b, 0) / scores.sports.total.length : 0;
            
            const avgGownTotal = scores.gown.total.length > 0 ? 
                scores.gown.total.reduce((a, b) => a + b, 0) / scores.gown.total.length : 0;
            
            const avgInterviewImpact = scores.interview.overallImpact.length > 0 ? 
                scores.interview.overallImpact.reduce((a, b) => a + b, 0) / scores.interview.overallImpact.length : 0;
            
            const avgSportsImpact = scores.sports.overallImpact.length > 0 ? 
                scores.sports.overallImpact.reduce((a, b) => a + b, 0) / scores.sports.overallImpact.length : 0;
            
            const avgGownImpact = scores.gown.overallImpact.length > 0 ? 
                scores.gown.overallImpact.reduce((a, b) => a + b, 0) / scores.gown.overallImpact.length : 0;
            
            const overallImpactScore = (avgInterviewImpact + avgSportsImpact + avgGownImpact) / 3;
            
            const overallScore = (avgInterviewTotal * 0.45) + 
                               (avgSportsTotal * 0.15) + 
                               (avgGownTotal * 0.15) + 
                               (overallImpactScore * 0.25);
            
            Logger.log(`Writing Candidate ${candidate}: Overall=${overallScore}`);
            
            overallSheet.appendRow([
                new Date(),
                candidate,
                overallScore,
                avgInterviewTotal,
                avgSportsTotal,
                avgGownTotal,
                overallImpactScore
            ]);
        });
        
        Logger.log('calculateOverallScores completed successfully');
        return createResponse('success', 'Overall scores calculated successfully');
    } catch (error) {
        Logger.log('Error in calculateOverallScores: ' + error.stack);
        return createResponse('error', 'Error calculating overall scores: ' + error.message);
    }
}