const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxgPVlnRnsvvNW6fMPrgb2L88tlYQO6eah-YFTvoN3XYJX8Um0oXDRsfe1CpTTRKWMA/exec";

let questionsData = [];
let currentIndex = 0;
let userAnswers = {};
let username = "";
let finalType = "";

// Page elements
const pageUsername = document.getElementById("page-username");
const pageIntro = document.getElementById("page-intro");
const pageQuiz = document.getElementById("page-quiz");
const pageResult = document.getElementById("page-result");

// Username elements
const usernameInput = document.getElementById("username-input");            
const usernameConfirmBtn = document.getElementById("username-confirm-btn");

// Intro elements
const introGreeting = document.getElementById("intro-greeting");  
const resultMessage = document.getElementById("result-message");

// Quiz elements
const startBtn = document.getElementById("start-btn");
const questionProgress = document.getElementById("question-progress");
const questionText = document.getElementById("question-text");
const choicesContainer = document.getElementById("choices-container");
const restartBtn = document.getElementById("restart-btn");

// Result elements
const resultType = document.getElementById("result-type");

// Analytics elements
const navQuizBtn = document.getElementById("nav-quiz-btn");
const navAnalyticsBtn = document.getElementById("nav-analytics-btn");
const pageAnalytics = document.getElementById("page-analytics");
const analyticsTotal = document.getElementById("analytics-total");
const axisChartTotal = document.getElementById("axis-chart-total");
const mostPickedStatus = document.getElementById("most-picked-status");

// Most Picked elements
const mostPickedQuestion = document.getElementById("most-picked-question");
const mostPickedAnswer = document.getElementById("most-picked-answer");
const mostPickedCount = document.getElementById("most-picked-count");
const mostPickedPosition = document.getElementById("most-picked-position");
const mostPickedPrevBtn = document.getElementById("most-picked-prev");
const mostPickedNextBtn = document.getElementById("most-picked-next");

// Clustering elements
const navClusterBtn = document.getElementById("nav-cluster-btn");
const pageCluster = document.getElementById("page-cluster");

let analyticsChart = null; 
let pollIntervalId = null;
let previousPage = pageIntro;
let axisChart = null;
let clusterRadarChart = null;
let hasLoadedAnalyticsOnce = false;
let mostPickedResults = []; 
let mostPickedIndex = 0; 
let celebsData = [];

function showPage(pageToShow) {
    [pageUsername, pageIntro, pageQuiz, pageResult, pageAnalytics, pageCluster].forEach(page => page.classList.remove("active"));
    pageToShow.classList.add("active");
}

function loadQuestions() {
    fetch("questions.json")
        .then(response => response.json())
        .then(data => {
            questionsData = data.questions;
        })
        .catch(error => console.error("Error loading questions:", error));
}

function renderQuestion() {
    const currentQuestion = questionsData[currentIndex];
    questionProgress.textContent = `Question ${currentIndex + 1} of ${questionsData.length}`;
    questionText.textContent = currentQuestion.question;

    choicesContainer.innerHTML = "";

    currentQuestion.choices.forEach(choice => {
        const choiceBtn = document.createElement("button");
        choiceBtn.textContent = choice.choice;
        choiceBtn.classList.add("choice-btn");
        choiceBtn.addEventListener("click", () => selectAnswer(currentQuestion.id, choice.preference));
        choicesContainer.appendChild(choiceBtn);
    });
}

function selectAnswer(questionId, preference) {
    userAnswers[questionId] = preference;

    if (currentIndex < questionsData.length - 1) {
        currentIndex++;
        renderQuestion();
    } else {
        submitAnswers();
    }
}

function submitAnswers() {
    fetch("/api/score", {
        method: "POST",
        headers: {"Content-Type": "application/json"},  
        body: JSON.stringify({ answers: userAnswers })
    })
    .then(response => response.json())
    .then(data => {
        finalType = data.type_code;
        resultMessage.textContent = `${username}, your results show that your MBTI is ${finalType}!`;
        resultType.textContent = data.type_code;
        showPage(pageResult);

        renderClusters();

        const sessionData = {
            username: username,
            answers: userAnswers,
            type: finalType
        };
        sendToGoogleSheets(sessionData);
    })
    .catch(error => console.error("Error submitting answers:", error));
}

function sendToGoogleSheets(sessionData) {
    fetch("https://script.google.com/macros/s/AKfycbxgPVlnRnsvvNW6fMPrgb2L88tlYQO6eah-YFTvoN3XYJX8Um0oXDRsfe1CpTTRKWMA/exec", {
        method: "POST",
        mode: "no-cors",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(sessionData)
    })
}

function getDedupedRows(rows) {
    const seenUsernames = new Set(); 
    const deduped = [];               

    for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i];
        if (seenUsernames.has(row.username)) continue; // already counted this person, skip
        seenUsernames.add(row.username);
        deduped.push(row);
    }

    return deduped;
}

function tallyTypes(dedupedRows) {
    const counts = {}; 
    dedupedRows.forEach(row => {
        counts[row.type] = (counts[row.type] || 0) + 1;
    });
    return counts;
}

function tallyAxes(dedupedRows) {
    const axisCounts = {
        EI: { E: 0, I: 0 },
        SN: { S: 0, N: 0 },
        TF: { T: 0, F: 0 },
        JP: { J: 0, P: 0 }
    };

    dedupedRows.forEach(row => {
        const type = row.type; 
        axisCounts.EI[type[0]]++; 
        axisCounts.SN[type[1]]++;
        axisCounts.TF[type[2]]++; 
        axisCounts.JP[type[3]]++; 
    });

    return axisCounts;
}

function tallyChoicesPerQuestion(dedupedRows) {
    const questionTallies = {}; 
    dedupedRows.forEach(row => {
        let parsedAnswers;
        try {
            parsedAnswers = JSON.parse(row.answers); 
        } catch (e) {
            console.error("Skipping row with malformed answers:", row, e);
            return; 
        }

        Object.entries(parsedAnswers).forEach(([questionId, preference]) => {
            if (!questionTallies[questionId]) questionTallies[questionId] = {}; 
            questionTallies[questionId][preference] = (questionTallies[questionId][preference] || 0) + 1; 
        });
    });

    return questionTallies;
}

function getMostPickedChoices(questionTallies) {
    const results = []; 
    questionsData.forEach(question => { 
        const tally = questionTallies[question.id];
        if (!tally) return; 

        let topPreference = null; 
        let topCount = 0;
        Object.entries(tally).forEach(([preference, count]) => {
            if (count > topCount) {      
                topPreference = preference;
                topCount = count;
            }
        });

        const matchingChoice = question.choices.find(choice => choice.preference === topPreference);

        const totalVotes = Object.values(tally).reduce((sum, c) => sum + c, 0); 

        results.push({
            questionText: question.question,                        
            mostPickedText: matchingChoice ? matchingChoice.choice : "N/A",
            count: topCount,
            totalVotes: totalVotes
        });
    });

    return results;
}

function renderMostPicked(results) {
    mostPickedResults = results; 

    if (mostPickedIndex >= mostPickedResults.length) {
        mostPickedIndex = 0;
    }

    renderMostPickedCard(); 
}

function renderMostPickedCard() {
    if (mostPickedResults.length === 0) return; 

    const current = mostPickedResults[mostPickedIndex];
    mostPickedQuestion.textContent = current.questionText;
    mostPickedAnswer.textContent = `"${current.mostPickedText}"`;
    mostPickedCount.textContent = `${current.count} of ${current.totalVotes} picked this`;
    mostPickedPosition.textContent = `${mostPickedIndex + 1} / ${mostPickedResults.length}`; 
}

function renderChart(counts) {
    const labels = Object.keys(counts);   
    const values = Object.values(counts); 

    if (analyticsChart) {
        analyticsChart.data.labels = labels;
        analyticsChart.data.datasets[0].data = values;
        analyticsChart.update();
    } else {
        const ctx = document.getElementById("analytics-chart").getContext("2d");
        analyticsChart = new Chart(ctx, {
            type: "bar",
            data: {
                labels: labels,
                datasets: [{ label: "Number of participants", data: values }]
            },
            options: {
                responsive: true,
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } // whole numbers only on the axis
            }
        });
    }
}

function renderAxisChart(axisCounts) {
    const labels = ["E", "I", "S", "N", "T", "F", "J", "P"];
    const values = [
        axisCounts.EI.E, axisCounts.EI.I,
        axisCounts.SN.S, axisCounts.SN.N,
        axisCounts.TF.T, axisCounts.TF.F,
        axisCounts.JP.J, axisCounts.JP.P
    ];

    if (axisChart) {
        axisChart.data.datasets[0].data = values;
        axisChart.update();
    } else {
        const ctx = document.getElementById("axis-chart").getContext("2d");
        axisChart = new Chart(ctx, {
            type: "bar",
            data: {
                labels: labels,
                datasets: [{ label: "Number of participants", data: values }]
            },
            options: {
                responsive: true,
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
        });
    }
}

function fetchAndRenderAnalytics() {

    if (!hasLoadedAnalyticsOnce) {
        analyticsTotal.textContent = "Loading...";
        axisChartTotal.textContent = "Loading...";
        mostPickedStatus.textContent = "Loading...";
    }

    fetch("https://script.google.com/macros/s/AKfycbxgPVlnRnsvvNW6fMPrgb2L88tlYQO6eah-YFTvoN3XYJX8Um0oXDRsfe1CpTTRKWMA/exec") 
        .then(response => response.json())
        .then(rows => {
            const deduped = getDedupedRows(rows);

            const typeCounts = tallyTypes(deduped); 
            renderChart(typeCounts);

            const axisCounts = tallyAxes(deduped);
            renderAxisChart(axisCounts);
            axisChartTotal.textContent = "";

            const questionTallies = tallyChoicesPerQuestion(deduped); 
            const mostPicked = getMostPickedChoices(questionTallies);  
            renderMostPicked(mostPicked);                             
            mostPickedStatus.textContent = ""; 

            analyticsTotal.textContent = `${deduped.length} total submissions`;
            hasLoadedAnalyticsOnce = true;
        })

        .catch(error => {
            console.error("Error fetching analytics:", error);
            if (!hasLoadedAnalyticsOnce) {
                analyticsTotal.textContent = "Unable to load results — retrying shortly...";
                axisChartTotal.textContent = "Unable to load results — retrying shortly...";
                mostPickedStatus.textContent = "Unable to load results — retrying shortly...";
            }
        });   
}

function startPolling() {
    fetchAndRenderAnalytics();                         
    pollIntervalId = setInterval(fetchAndRenderAnalytics, 15000); 
}

function stopPolling() {
    clearInterval(pollIntervalId); 
    pollIntervalId = null;
}

function getGroupInfo(type) {
    const ei = type[0], sn = type[1], tf = type[2], jp = type[3];

    let group;
    if (sn === "N" && tf === "T") group = "Analysts";
    else if (sn === "N" && tf === "F") group = "Diplomats";
    else if (sn === "S" && jp === "J") group = "Sentinels";
    else group = "Explorers";

    const x = ei === "E" ? 1 : 0;
    const y = (group === "Analysts" || group === "Diplomats")
        ? (jp === "J" ? 1 : 0)
        : (tf === "T" ? 1 : 0);

    return { group, x, y };
}

function loadCelebs() {
    fetch("celebs.json")
        .then(response => response.json())
        .then(data => {
            celebsData = data.people;
            renderClusters();
        })
        .catch(error => console.error("Error loading celebrity data:", error));
}

function getGroupInfo(type) {
    const ei = type[0], sn = type[1], tf = type[2], jp = type[3];

    let group;
    if (sn === "N" && tf === "T") group = "analysts";
    else if (sn === "N" && tf === "F") group = "diplomats";
    else if (sn === "S" && jp === "J") group = "sentinels";
    else group = "explorers";

    const x = ei === "E" ? 1 : 0; // E/I is always the x-axis
    const y = (group === "analysts" || group === "diplomats")
        ? (jp === "J" ? 1 : 0)   // Analysts/Diplomats: J/P is the remaining free letter
        : (tf === "T" ? 1 : 0);  // Sentinels/Explorers: T/F is the remaining free letter

    return { group, x, y };
}

function renderClusters() {
    const byType = {};
    celebsData.forEach(person => {
        if (!byType[person.type]) byType[person.type] = [];
        byType[person.type].push(person);

     renderUserPin();
    });

    document.querySelectorAll(".region-points").forEach(el => el.innerHTML = ""); 

    Object.entries(byType).forEach(([type, people]) => {
        const { group, x, y } = getGroupInfo(type);
        const regionEl = document.querySelector(`#region-${group} .region-points`);

        const baseXPercent = x === 1 ? 75 : 25;
        const baseYPercent = y === 1 ? 25 : 75;

        people.forEach((person, index) => {
            const circle = document.createElement("div");
            circle.className = "person-circle";

            const spacingPx = 44;
            const offsetPx = (index - (people.length - 1) / 2) * spacingPx;

            circle.style.left = `calc(${baseXPercent}% + ${offsetPx}px)`;
            circle.style.top = `${baseYPercent}%`;

            const tooltip = document.createElement("div");
            tooltip.className = "person-tooltip";
            tooltip.innerHTML = `<strong>${person.name}</strong><br>${person.type} — ${person.category}<br>${person.bio}`;
            circle.appendChild(tooltip);

            regionEl.appendChild(circle);
        });
    });
}

function renderUserPin() {
    const hint = document.getElementById("cluster-hint");

    if (!finalType) {
        
        if (hint) hint.style.display = "block";
        return;
    }
    if (hint) hint.style.display = "none";

    const { group, x, y } = getGroupInfo(finalType);
    const regionEl = document.querySelector(`#region-${group} .region-points`);

    const baseXPercent = x === 1 ? 75 : 25;
    const baseYPercent = y === 1 ? 25 : 75;

    const pin = document.createElement("div");
    pin.className = "person-circle user-pin"; 

    pin.style.left = `calc(${baseXPercent}% + 26px)`;
    pin.style.top = `${baseYPercent}%`;

    const tooltip = document.createElement("div");
    tooltip.className = "person-tooltip";
    tooltip.innerHTML = `<strong>You (${username})</strong><br>${finalType}`;
    pin.appendChild(tooltip);

    regionEl.appendChild(pin);
}

function calculateEuclideanDistance(vec1, vec2) {
    let sumSq = 0;
    const keys = Object.keys(vec1);
    
    if (keys.length === 0) return 0; // Return zero if user hasn't answered questions yet

    keys.forEach(key => {
        // Convert non-numeric values (e.g. strings) to numeric hashes if necessary
        const val1 = typeof vec1[key] === 'number' ? vec1[key] : (vec1[key] ? vec1[key].charCodeAt(0) : 0);
        const val2 = typeof vec2[key] === 'number' ? vec2[key] : (vec2[key] ? vec2[key].charCodeAt(0) : 0);
        
        const diff = val1 - val2;
        sumSq += diff * diff;
    });
    
    return Math.sqrt(sumSq);
}

function computeClusterDistances() {
    if (!celebsData || celebsData.length === 0) return [];

    const datasetWithDistances = celebsData.map(person => {
        // Fallback mockup vector matching user answers if missing in JSON
        const personVector = person.answers || {};
        const distance = calculateEuclideanDistance(userAnswers, personVector);

        return {
            label: person.name || person.type,
            distance: parseFloat(distance.toFixed(2))
        };
    });

    // Sort closest to furthest
    datasetWithDistances.sort((a, b) => a.distance - b.distance);
    return datasetWithDistances;
}

function renderRadarClusterChart(clusterDataset) {
    const chartCanvas = document.getElementById("cluster-radar-chart");
    if (!chartCanvas) return;

    const labels = clusterDataset.map(item => item.label);
    const distances = clusterDataset.map(item => item.distance);

    if (clusterRadarChart) {
        clusterRadarChart.data.labels = labels;
        clusterRadarChart.data.datasets[0].data = distances;
        clusterRadarChart.update();
    } else {
        const ctx = chartCanvas.getContext("2d");
        clusterRadarChart = new Chart(ctx, {
            type: "radar",
            data: {
                labels: labels,
                datasets: [{
                    label: "Euclidean Distance",
                    data: distances,
                    fill: true,
                    backgroundColor: "rgba(75, 192, 192, 0.2)",
                    borderColor: "rgba(75, 192, 192, 1)",
                    pointBackgroundColor: "rgba(75, 192, 192, 1)",
                    pointBorderColor: "#fff",
                    pointHoverBackgroundColor: "#fff",
                    pointHoverBorderColor: "rgba(75, 192, 192, 1)"
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: { display: true },
                        suggestedMin: 0,
                        ticks: { stepSize: 1 }
                    }
                }
            }
        });
    }
}

usernameConfirmBtn.addEventListener("click", () => {
    const enteredUsername = usernameInput.value.trim();

    if (enteredUsername === "") {
        alert("Please enter your name to continue.");
        return;
    }

    username = enteredUsername;
    introGreeting.textContent = `Welcome, ${username}! Press the button below to find out your MBTI!`;    
    showPage(pageIntro);
});

startBtn.addEventListener("click", () => {
    showPage(pageQuiz);
    renderQuestion();
});

restartBtn.addEventListener("click", () => {
    const sessionData = {              
        username: username,            
        answers: userAnswers,          
        type: finalType                
    };

    currentIndex = 0;        
    userAnswers = {};        
    username = "";           
    finalType = "";          
    usernameInput.value = "";

    showPage(pageUsername);
});

navAnalyticsBtn.addEventListener("click", () => {
    const currentlyActive = document.querySelector(".page.active");
    
    if (currentlyActive !== pageAnalytics) {
            previousPage = currentlyActive;
        }

    showPage(pageAnalytics);
    startPolling(); 
});

navClusterBtn.addEventListener("click", () => {
    const currentlyActive = document.querySelector(".page.active");
    if (currentlyActive !== pageCluster) previousPage = currentlyActive; 
    showPage(pageCluster);
});

navQuizBtn.addEventListener("click", () => {
    stopPolling(); 
    showPage(previousPage);
});

mostPickedPrevBtn.addEventListener("click", () => {
    mostPickedIndex = (mostPickedIndex - 1 + mostPickedResults.length) % mostPickedResults.length;
    renderMostPickedCard();
});

mostPickedNextBtn.addEventListener("click", () => {
    mostPickedIndex = (mostPickedIndex + 1) % mostPickedResults.length; 
    renderMostPickedCard();
});

loadQuestions();
loadCelebs();