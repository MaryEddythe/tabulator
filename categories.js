// categories.js
const CATEGORIES = {
    talent: {
        title: "Best in Talent",
        criteria: [
            { name: "Stage Present", percentage: 30, maxScore: 30 },
            { name: "Mastery", percentage: 30, maxScore: 30 },
            { name: "Execution of Talent", percentage: 30, maxScore: 30 },
            { name: "Overall Impact", percentage: 10, maxScore: 10 }
        ],
        total: 100
    },
    sports: {
        title: "Best in Sports Wear",
        criteria: [
            { name: "Suitability", percentage: 30, maxScore: 30 },
            { name: "Sports Identity", percentage: 20, maxScore: 20 },
            { name: "Poise and Bearing", percentage: 40, maxScore: 40 },
            { name: "Overall Impact", percentage: 10, maxScore: 10 }
        ],
        total: 100
    },
    gown: {
        title: "Best in Gown",
        criteria: [
            { name: "Poise and Bearing", percentage: 40, maxScore: 40 },
            { name: "Design and Fitting", percentage: 25, maxScore: 25 },
            { name: "Stage Deportment", percentage: 25, maxScore: 25 },
            { name: "Overall Impact", percentage: 10, maxScore: 10 }
        ],
        total: 100
    },
    photogenic: {
        title: "Most Photogenic",
        criteria: [
            { name: "Natural Smile and Look", percentage: 30, maxScore: 30 },
            { name: "Poise and Confidence", percentage: 20, maxScore: 20 },
            { name: "Personality", percentage: 15, maxScore: 15 },
            { name: "Beauty", percentage: 35, maxScore: 35 }
        ],
        total: 100
    },
    interview: {
        title: "Best in Interview",
        criteria: [
            { name: "Wit and Content", percentage: 40, maxScore: 40 },
            { name: "Projection and Delivery", percentage: 30, maxScore: 30 },
            { name: "Stage Presence", percentage: 20, maxScore: 20 },
            { name: "Overall Impact", percentage: 10, maxScore: 10 }
        ],
        total: 100
    },
    overall: {
        title: "Overall Awards",
        criteria: [
            { name: "Intelligence (Q&A)", percentage: 45, maxScore: 45 },
            { name: "Sports Wear", percentage: 15, maxScore: 15 },
            { name: "Gown", percentage: 15, maxScore: 15 },
            { name: "Overall Impact", percentage: 25, maxScore: 25 }
        ],
        total: 100
    },
    productionNumber: {
        title: "Best in Production Number",
        criteria: [
            { name: "Stage presence", percentage: 30, maxScore: 30 },
            { name: "Mastery", percentage: 30, maxScore: 30 },
            { name: "Projection", percentage: 30, maxScore: 30 },
            { name: "Overall Impact", percentage: 10, maxScore: 10 }
        ],
        total: 100
    }
};

// Contestant numbers (1-5)
const CONTESTANTS = Array.from({ length: 5 }, (_, i) => (i + 1).toString());