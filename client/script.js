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
let resultPcoordsChart = null;

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
    renderClusters();

    fetch("/api/score", {
        method: "POST",
        headers: {"Content-Type": "application/json"},  
        body: JSON.stringify({ answers: userAnswers })
    })
    .then(response => response.json())
    .then(data => {

        if (data.upperclassmen && data.upperclassmen.length > 0) {
            celebsData = data.upperclassmen.map(item => {
                // Extract Q1 through Q10 numerical values
                const vector = [];
                for (let i = 1; i <= 10; i++) {
                    vector.push(Number(item[`Q${i}`]) || 0);
                }
                return {
                    Name: item.Name || "Upperclassman",
                    vector: vector
                };
            });

            renderPolarScatterChart();

            } else {
            console.warn("No upperclassmen data received from backend.");
        }

        resultMessage.textContent = `${username}, your profile vector is complete!`;
        showPage(pageResult);

        const sessionData = {
            username: username,
            answers: userAnswers
        };
        sendToGoogleSheets(sessionData);
    })
    .catch(error => {
        console.warn("Background API sync failed, using client-rendered results:", error);
        celebsData = celebsData || []; // Ensure it remains an array
        renderPolarScatterChart();
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

function convertToPolarCartesian(userVector, personVector) {
    let sumSq = 0;
    let xDir = 0;
    let yDir = 0;
    const numQuestions = Math.max(userVector.length, personVector.length);

    for (let i = 0; i < numQuestions; i++) {
        const uVal = userVector[i] || 0;
        const pVal = personVector[i] || 0;
        const diff = pVal - uVal;

        // Euclidean Distance component
        sumSq += diff * diff;

        // Angle direction based on which questions differed
        const phi = (i / numQuestions) * 2 * Math.PI;
        xDir += diff * Math.cos(phi);
        yDir += diff * Math.sin(phi);
    }

    const r = Math.sqrt(sumSq); // Radial distance from user
    const theta = Math.atan2(yDir, xDir); // Angular direction of deviation

    // Convert polar (r, theta) to Cartesian (x, y) for Chart.js scatter
    return {
        x: parseFloat((r * Math.cos(theta)).toFixed(2)),
        y: parseFloat((r * Math.sin(theta)).toFixed(2)),
        distance: parseFloat(r.toFixed(2))
    };
}

function renderPolarScatterChart() {

    const canvas = document.getElementById("results-pcords-chart");
    if (!canvas) {
        console.error("Could not find canvas with ID 'results-pcords-chart'. Check HTML");
        return;
    }
    const ctx = canvas.getContext("2d");

    if (resultPcoordsChart) resultPcoordsChart.destroy();

    const userVector = getUserAnswerVector();

    // Ensure celebsData is an array before calling .map()
    const safeCelebsData = Array.isArray(celebsData) ? celebsData : [];

    // Map upperclassmen into (x, y) offset relative to user
    const scatterPoints = safeCelebsData.map(person => {

        let personVector = [];
        if (Array.isArray(person.vector)) {
            personVector = person.vector;
        } else if (person.answers && typeof person.answers === 'object') {
            personVector = Object.keys(person.answers).sort().map(k => person.answers[k]);
        } else {
            personVector = Object.keys(person)
                .filter(k => k.startsWith("Q"))
                .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)))
                .map(k => Number(person[k]) || 0);
        }

        const coords = convertToPolarCartesian(userVector, personVector);

        return {
            x: coords.x,
            y: coords.y,
            name: person.Name || person.name || "Upperclassman",
            dist: coords.distance,
            rawPerson: person
        };
    });

    console.log("Data successfully connected! Plotting points:", scatterPoints);

    resultPcoordsChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Upperclassmen Clusters',
                    data: scatterPoints,
                    backgroundColor: 'rgba(155, 93, 229, 0.7)',
                    borderColor: '#9B5DE5',
                    pointRadius: 6,
                    pointHoverRadius: 9
                },
                {
                    label: `You (${username || "User"})`,
                    data: [{ x: 0, y: 0, name: username || "User", dist: 0 }],
                    backgroundColor: '#22dcf4',
                    borderColor: '#ffffff',   
                    borderWidth: 2,            
                    pointRadius: 12,           
                    pointHoverRadius: 14,
                    pointStyle: 'circle'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,

            onClick: (event, elements) => {
                if (elements.length > 0) {
                    const firstElement = elements[0];

                    if (firstElement.datasetIndex === 0) {
                        const clickedPoint = scatterPoints[firstElement.index];
                        if (clickedPoint && clickedPoint.rawPerson) {
                            openBioPanel(clickedPoint.rawPerson);
                        }
                    }
                }
            },

            plugins: {
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.raw.name} (Distance: ${ctx.raw.dist})`
                    }
                },
                zoom: {
                    pan: { enabled: true, mode: 'xy' },
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        mode: 'xy'
                    }
                }
            },

            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    title: { display: true, text: '← Response Trajectory →', color: '#a89fc2' }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    title: { display: true, text: '← Response Trajectory →', color: '#a89fc2' }
                }
            }
        }
    });
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

function openBioPanel(person) {
    const panel = document.getElementById("bio-panel");
    const bioName = document.getElementById("bio-name");
    const bioText = document.getElementById("bio-text");
    const bioAvatar = document.getElementById("bio-avatar");

    bioName.textContent = person.Name || "Anonymous Upperclassman";
    bioText.textContent = person.Bio || person.description || "No bio available.";
    
    // Fallback image if custom image path is not provided in CSV
    bioAvatar.src = person.Image || "client/default-avatar.png"; 

    panel.classList.add("active");
}

document.getElementById("close-bio-btn").addEventListener("click", () => {
    document.getElementById("bio-panel").classList.remove("active");
});

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