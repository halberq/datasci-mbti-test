let questionsData = [];
let currentIndex = 0;
let userAnswers = {};

const pageIntro = document.getElementById("page-intro");
const pageQuiz = document.getElementById("page-quiz");
const pageResult = document.getElementById("page-result");

const startBtn = document.getElementById("start-btn");
const questionProgress = document.getElementById("question-progress");
const questionText = document.getElementById("question-text");
const choicesContainer = document.getElementById("choices-container");
const restartBtn = document.getElementById("restart-btn");

const resultType = document.getElementById("result-type");
const resultBtn = document.getElementById("result-btn");

function showPage(pageToShow) {
    [pageIntro, pageQuiz, pageResult].forEach(page => page.classList.remove("active"));
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
    questionText.textContent = currentQuestion.text;

    choicesContainer.innerHTML = "";

    currentQuestion.choices.forEach(choice => {
        const choiceBtn = document.createElement("button");
        choiceBtn.textContent = choice.choice;
        choiceBtn.classList.add("choice-btn");
        choiceBtn.addEventListener("click", () => selectAnswer(currentQuestion.id, choice.preference));
        choicesContainer.appendChild(choiceBtn);

        choicesContainer.style.display = "flex";
        choicesContainer.style.flexDirection = "column";
        choicesContainer.style.gap = "10px";
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
        resultType.textContent = data.type_code;
        showPage(pageResult);
    })
    .catch(error => console.error("Error submitting answers:", error));
}

startBtn.addEventListener("click", () => {
    showPage(pageQuiz);
    renderQuestion();
});

restartBtn.addEventListener("click", () => {
    currentIndex = 0;
    userAnswers = {};
    showPage(pageIntro);
});

loadQuestions();