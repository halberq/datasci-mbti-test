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
let resultRadarChart = null;
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
    resultMessage.textContent = `${username}, your profile vector is complete!`;
    showPage(pageResult);

    const clusterDistances = computeClusterDistances();
    renderResultRadarChart(clusterDistances);
    renderClusters();

    fetch("/api/score", {
        method: "POST",
        headers: {"Content-Type": "application/json"},  
        body: JSON.stringify({ answers: userAnswers })
    })
    .then(response => response.json())
    .then(() => {
        resultMessage.textContent = `${username}, your profile vector is complete!`;
        showPage(pageResult);

        const clusterDistances = computeClusterDistances();
        renderResultRadarChart(clusterDistances);
        renderClusters();

        const sessionData = {
            username: username,
            answers: userAnswers
        };
        sendToGoogleSheets(sessionData);
    })
    .catch(error => {
        console.warn("Background API sync failed, using client-rendered results:", error);
        // Render locally if backend API endpoint is offline
    });
}

function sendToGoogleSheets(sessionData) {
    fetch("https://script.google.com/macros/s/AKfycbxgPVlnRnsvvNW6fMPrgb2L88tlYQO6eah-YFTvoN3XYJX8Um0oXDRsfe1CpTTRKWMA/exec", {
        method: "POST",
        mode: "no-cors",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(sessionData)
    })
}

function renderResultRadarChart(clusterDataset) {
    const chartCanvas = document.getElementById("result-radar-chart");
    if (!chartCanvas) return;

    if (!clusterDataset || clusterDataset.length === 0) {
        console.warn("No upperclassmen dataset available. Ensure celebs.json is loaded properly.");
        return;
    }

    // Extract top 6 closest upperclassmen matches
    const topMatches = clusterDataset.slice(0, 6);
    const labels = topMatches.map(item => item.label);
    const distances = topMatches.map(item => item.distance);
    const userCenter = topMatches.map(() => 0);

    // Properly destroy existing instance before re-creating the chart
    if (resultRadarChart) {
        resultRadarChart.destroy();
    }

    const ctx = chartCanvas.getContext("2d");
    resultRadarChart = new Chart(ctx, {
        type: "radar",
        data: {
            labels: labels,
            datasets: [
                {
                    label: `You (${username || "User"})`,
                    data: userCenter,
                    fill: true,
                    backgroundColor: "rgba(241, 91, 181, 0.4)",
                    borderColor: "rgba(241, 91, 181, 1)",
                    pointBackgroundColor: "rgba(241, 91, 181, 1)",
                    pointRadius: 6
                },
                {
                    label: "Upperclassman Distance (Lower = Closer)",
                    data: distances,
                    fill: true,
                    backgroundColor: "rgba(155, 93, 229, 0.2)",
                    borderColor: "rgba(155, 93, 229, 1)",
                    pointBackgroundColor: "rgba(77, 124, 254, 1)",
                    pointRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    min: 0,
                    angleLines: { color: "rgba(155, 93, 229, 0.2)" },
                    grid: { color: "rgba(155, 93, 229, 0.2)" },
                    pointLabels: { color: "#a89fc2", font: { size: 12, weight: 'bold' } },
                    ticks: { color: "#a89fc2", backdropColor: "transparent", stepSize: 1 }
                }
            }
        }
    });
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

function loadUpperclassmenData() {
    fetch("test_csv.csv")
        .then(response => response.text())
        .then(csvText => {
            const lines = csvText.trim().split("\n");
            const headers = lines[0].split(",").map(h => h.trim());

            // Convert CSV rows into data vectors
            celebsData = lines.slice(1).map(line => {
                const values = line.split(",").map(v => v.trim());
                const name = values[0];
                const answers = {};

                // Map Q1 through Q10 column values
                for (let i = 1; i < headers.length; i++) {
                    answers[headers[i]] = parseInt(values[i], 10) || 0;
                }

                return {
                    Name: name,
                    answers: answers,
                    vector: values.slice(1).map(v => parseInt(v, 10) || 0)
                };
            });

            renderClusters();
        })
        .catch(error => console.error("Error loading CSV test data:", error));
}

function renderClusters() {
    const pointsContainer = document.getElementById("cluster-points");
    if (!pointsContainer) return;
    pointsContainer.innerHTML = "";

    const clusterDistances = computeClusterDistances();

    clusterDistances.forEach((person, index) => {
        const circle = document.createElement("div");
        circle.className = "person-circle";

        const angle = (index / Math.max(clusterDistances.length, 1)) * 2 * Math.PI;
        const radiusPercent = Math.min(person.distance * 12 + 15, 40); 
        
        const posX = 50 + radiusPercent * Math.cos(angle);
        const posY = 50 + radiusPercent * Math.sin(angle);

        circle.style.left = `${posX}%`;
        circle.style.top = `${posY}%`;

        const tooltip = document.createElement("div");
        tooltip.className = "person-tooltip";
        tooltip.innerHTML = `<strong>${person.label}</strong><br>Distance: ${person.distance}<br>${person.category ? person.category + '<br>' : ''}${person.bio || ""}`;
        circle.appendChild(tooltip);

        pointsContainer.appendChild(circle);
    });

    renderUserPin();
    renderRadarClusterChart(clusterDistances);
}

function renderUserPin() {
    const pointsContainer = document.getElementById("cluster-points");
    const hint = document.getElementById("cluster-hint");

    if (Object.keys(userAnswers).length === 0) {
        if (hint) hint.style.display = "block";
        return;
    }
    if (hint) hint.style.display = "none";
    if (!pointsContainer) return;

    const pin = document.createElement("div");
    pin.className = "person-circle user-pin"; 

    pin.style.left = `50%`;
    pin.style.top = `50%`;

    const tooltip = document.createElement("div");
    tooltip.className = "person-tooltip";
    tooltip.innerHTML = `<strong>You (${username || "User"})</strong><br>Origin (0.00)`;
    pin.appendChild(tooltip);

    pointsContainer.appendChild(pin);
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

    const userVector = getUserAnswerVector();

    const datasetWithDistances = celebsData.map(item => {
        let refVector = [];

        if (item.answers) {
            refVector = Object.keys(item.answers).sort().map(k => item.answers[k]);
        } else if (Array.isArray(item.vector)) {
            refVector = item.vector;
        } else {
            refVector = [];
        }

        let sumSq = 0;
        const length = Math.max(userVector.length, refVector.length);
        
        for (let i = 0; i < length; i++) {
            const uVal = userVector[i] !== undefined ? userVector[i] : 0;
            const rVal = refVector[i] !== undefined ? refVector[i] : 0;
            const diff = uVal - rVal;
            sumSq += diff * diff;
        }

        const distance = Math.sqrt(sumSq);

        return {
            ...item,
            label: item.Name || item.name || "Profile",
            distance: parseFloat(distance.toFixed(2))
        };
    });

    datasetWithDistances.sort((a, b) => a.distance - b.distance);
    return datasetWithDistances;
}

function renderRadarClusterChart(clusterDataset) {
    const chartCanvas = document.getElementById("cluster-radar-chart");
    if (!chartCanvas || clusterDataset.length === 0) return;

    const topMatches = clusterDataset.slice(0, 8);
    const labels = topMatches.map(item => item.label);
    const distances = topMatches.map(item => item.distance);

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
                    backgroundColor: "rgba(155, 93, 229, 0.2)",
                    borderColor: "rgba(155, 93, 229, 1)",
                    pointBackgroundColor: "rgba(241, 91, 181, 1)",
                    pointBorderColor: "#fff",
                    pointHoverBackgroundColor: "#fff",
                    pointHoverBorderColor: "rgba(241, 91, 181, 1)"
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: { color: "rgba(155, 93, 229, 0.2)" },
                        grid: { color: "rgba(155, 93, 229, 0.2)" },
                        pointLabels: { color: "#a89fc2", font: { size: 12 } },
                        ticks: { color: "#a89fc2", backdropColor: "transparent", stepSize: 1 },
                        suggestedMin: 0
                    }
                }
            }
        });
    }
}

function getUserAnswerVector() {
    return Object.keys(userAnswers)
        // Sort keys numerically (Q1, Q2, ..., Q10)
        .sort((a, b) => {
            const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
            const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
            return numA - numB;
        })
        .map(key => Number(userAnswers[key]) || 0);
}

function computeClosestNodes(userVector) {
    if (!celebsData || celebsData.length === 0) return [];

    const datasetWithDistances = celebsData.map(item => {
        // Extract reference answer vector from celeb/dataset object (Q1, Q2, ...)
        const refVector = item.answers 
            ? Object.keys(item.answers).sort().map(k => item.answers[k])
            : [0, 0, 0, 0]; // Fallback mock vector

        // Calculate Euclidean distance sum((u_i - r_i)^2)
        let sumSq = 0;
        const length = Math.max(userVector.length, refVector.length);
        
        for (let i = 0; i < length; i++) {
            const uVal = userVector[i] !== undefined ? userVector[i] : 0;
            const rVal = refVector[i] !== undefined ? refVector[i] : 0;
            const diff = uVal - rVal;
            sumSq += diff * diff;
        }

        const distance = Math.sqrt(sumSq);

        return {
            ...item,
            label: item.Name || item.name || item.type,
            distance: parseFloat(distance.toFixed(2))
        };
    });

    // Sort by euclidean_distance ascending (closest match first)
    datasetWithDistances.sort((a, b) => a.distance - b.distance);
    return datasetWithDistances;
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
    renderClusters();
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
loadUpperclassmenData();