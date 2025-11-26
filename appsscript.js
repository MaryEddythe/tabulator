function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    return submitScore(data);
  } catch (error) {
    return createResponse("error", "POST Error: " + error.message);
  }
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    if (action === "getResults") {
      const category = e.parameter.category;
      if (category === "overall") {
        return getOverallResults();
      } else {
        return getResults(category);
      }
    } else if (action === "submitScore") {
      const data = JSON.parse(e.parameter.data);
      return submitScore(data);
    } else if (action === "calculateOverallScores") {
      return calculateOverallScores();
    } else {
      return createResponse("error", "Invalid action");
    }
  } catch (error) {
    return createResponse("error", "GET Error: " + error.message);
  }
}

function submitScore(data) {
  try {
    const sheet = getSheet(data.category);
    const timestamp = new Date();
    const totalScoreToSave = data.totalScore || 0;
    const rowData = [timestamp, data.judgeName, data.candidateNumber, totalScoreToSave];

    const criteria = getCategoryCriteria(data.category);
    criteria.forEach(criterion => {
      rowData.push(data.scores[criterion.name] || 0);
    });

    sheet.appendRow(rowData);

    // Auto-calculate overall after submitting to these categories
    if (["interview", "sports", "gown"].includes(data.category)) {
      calculateOverallScores();
    }

    return createResponse("success", "Score submitted successfully");
  } catch (error) {
    return createResponse("error", "Submit Error: " + error.message);
  }
}

function getResults(category) {
  try {
    if (!category || typeof category !== "string") {
      return createResponse("error", "Invalid category parameter");
    }
    if (category === "overall") {
      return getOverallResults();
    }

    const sheet = getSheet(category);
    const dataRange = sheet.getDataRange();
    if (dataRange.getNumRows() < 2) {
      return createResponse("error", "No scoring data yet");
    }

    const data = dataRange.getValues();
    const rows = data.slice(1);
    const results = calculateResults(rows, category);

    return ContentService.createTextOutput(JSON.stringify({ status: "success", results }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    Logger.log("Error in getResults: " + error.stack);
    return createResponse("error", "Results Error: " + error.message);
  }
}

function calculateResults(rows, category) {
  const candidateScores = {};
  const criteria = getCategoryCriteria(category);

  rows.forEach(row => {
    if (!row || row.length < 4) return;
    const candidate = row[2]?.toString();
    const totalScore = parseFloat(row[3]);
    if (!candidate || isNaN(totalScore)) return;

    if (!candidateScores[candidate]) {
      candidateScores[candidate] = { totalScores: [], criterionScores: {} };
      criteria.forEach(c => candidateScores[candidate].criterionScores[c.name] = []);
    }

    candidateScores[candidate].totalScores.push(totalScore);
    criteria.forEach((c, i) => {
      const score = parseFloat(row[4 + i]);
      if (!isNaN(score)) {
        candidateScores[candidate].criterionScores[c.name].push(score);
      }
    });
  });

  const results = [];
  for (const [candidate, scores] of Object.entries(candidateScores)) {
    const totalCount = scores.totalScores.length;
    if (totalCount === 0) continue;

    const avgScores = {};
    for (const [name, list] of Object.entries(scores.criterionScores)) {
      avgScores[name] = list.length > 0 ? list.reduce((a, b) => a + b, 0) / list.length : 0;
    }

    let weightedTotal = 0;
    criteria.forEach(c => {
      weightedTotal += (avgScores[c.name] || 0) * (c.percentage / 100);
    });

    results.push({
      candidate,
      totalScore: weightedTotal,
      avgScores,
      numberOfScores: totalCount
    });
  }

  results.sort((a, b) => b.totalScore - a.totalScore);
  return results;
}

function getCategoryCriteria(category) {
  const map = {
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
    ]
  };
  return map[category] || [];
}

function getSheet(category) {
  const SPREADSHEET_ID = "1gR29ljdFWJjYfu5t3hG-keJlGaDp8uUDDlrg_uPxD28";
  const sheetName = {
    talent: "Talent Scores",
    sports: "Sports Wear Scores",
    gown: "Gown Scores",
    photogenic: "Photogenic Scores",
    interview: "Interview Scores",
    overall: "Overall Scores"
  }[category] || category;

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    createSheetHeaders(sheet, category);
  }
  return sheet;
}

function createSheetHeaders(sheet, category) {
  const criteria = getCategoryCriteria(category);
  const headers = ["Timestamp", "Judge Name", "Candidate Number", "Total Score"];
  criteria.forEach(c => headers.push(c.name));
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
  sheet.autoResizeColumns(1, headers.length);
}

function createResponse(status, message, data = null) {
  const res = { status, message };
  if (data) res.data = data;
  return ContentService.createTextOutput(JSON.stringify(res))
    .setMimeType(ContentService.MimeType.JSON);
}

function calculateOverallScores() {
  try {
    const SPREADSHEET_ID = "1gR29ljdFWJjYfu5t3hG-keJlGaDp8uUDDlrguPxD28";
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    const categories = ["interview", "sports", "gown"];
    const dataByCategory = {};

    // Load data from each category
    categories.forEach(cat => {
      const sheet = ss.getSheetByName(getSheet(cat).getName());
      if (!sheet || sheet.getLastRow() < 2) {
        dataByCategory[cat] = [];
      } else {
        dataByCategory[cat] = sheet.getDataRange().getValues().slice(1); // skip header
      }
    });

    // Prepare Overall Scores sheet
    let overallSheet = ss.getSheetByName("Overall Scores");
    if (!overallSheet) {
      overallSheet = ss.insertSheet("Overall Scores");
      const headers = ["Timestamp", "Candidate Number", "Final Score", "Intelligence (45%)", "Sports Wear (15%)", "Gown (15%)", "Avg Overall Impact (25%)"];
      overallSheet.appendRow(headers);
      overallSheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    }
    // Clear old results (keep header)
    if (overallSheet.getLastRow() > 1) {
      overallSheet.getRange(2, 1, overallSheet.getLastRow() - 1, overallSheet.getLastColumn()).clearContent();
    }

    const candidateData = {};

    categories.forEach(cat => {
      const rows = dataByCategory[cat];
      const criteria = getCategoryCriteria(cat);
      const impactIndex = criteria.findIndex(c => c.name === "Overall Impact"); // should be last

      rows.forEach(row => {
        const candidate = row[2]?.toString();
        const totalScore = parseFloat(row[3]);
        const impactScore = impactIndex >= 0 ? parseFloat(row[4 + impactIndex]) : 0;

        if (!candidate || isNaN(totalScore)) return;

        if (!candidateData[candidate]) {
          candidateData[candidate] = {
            interview: { total: 0, impact: 0, count: 0 },
            sports: { total: 0, impact: 0, count: 0 },
            gown: { total: 0, impact: 0, count: 0 }
          };
        }

        const section = candidateData[candidate][cat];
        section.total += totalScore;
        section.impact += isNaN(impactScore) ? 0 : impactScore;
        section.count += 1;
      });
    });

    // Compute and write final scores for each candidate
    const now = new Date();
    for (const [candidate, scores] of Object.entries(candidateData)) {
      const avg = (obj) => obj.count > 0 ? obj.total / obj.count : 0;
      const avgImpact = (obj) => obj.count > 0 ? obj.impact / obj.count : 0;

      const interviewAvg = avg(scores.interview);
      const sportsAvg = avg(scores.sports);
      const gownAvg = avg(scores.gown);

      const avgImpactInterview = avgImpact(scores.interview);
      const avgImpactSports = avgImpact(scores.sports);
      const avgImpactGown = avgImpact(scores.gown);

      const overallImpactAvg = (
        (scores.interview.count > 0 ? avgImpactInterview : 0) +
        (scores.sports.count > 0 ? avgImpactSports : 0) +
        (scores.gown.count > 0 ? avgImpactGown : 0)
      ) / [scores.interview.count, scores.sports.count, scores.gown.count].filter(c => c > 0).length || 1;

      const finalScore = (
        interviewAvg * 0.45 +
        sportsAvg * 0.15 +
        gownAvg * 0.15 +
        overallImpactAvg * 0.25
      );

      overallSheet.appendRow([
        now,
        candidate,
        finalScore.toFixed(4),
        interviewAvg.toFixed(2),
        sportsAvg.toFixed(2),
        gownAvg.toFixed(2),
        overallImpactAvg.toFixed(2)
      ]);
    }

    return createResponse("success", "Overall scores calculated successfully");
  } catch (error) {
    Logger.log("calculateOverallScores error: " + error.stack);
    return createResponse("error", "Error calculating overall scores: " + error.message);
  }
}

function getOverallResults() {
  try {
    const sheet = getSheet("overall");
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      return ContentService.createTextOutput(JSON.stringify({ status: "success", results: [] }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const rows = data.slice(1).map(row => ({
      candidate: row[1]?.toString(),
      totalScore: parseFloat(row[2]) || 0,
      numberOfScores: 1 // overall is per-candidate final
    }));

    rows.sort((a, b) => b.totalScore - a.totalScore);

    return ContentService.createTextOutput(JSON.stringify({ status: "success", results: rows }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return createResponse("error", "Error fetching overall results: " + error.message);
  }
}