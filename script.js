// --- CONFIGURATION & EXTERNAL DEPENDENCIES ---
// **TODO: REPLACE WITH YOUR LIVE STRIPE PUBLISHABLE KEY**
const STRIPE_PK = 'pk_test_TYaWkK8TYKk0mQ2vF6zIu94E';
const PREMIUM_PRICE_ID = 'price_1P3z9r2eZvKYlo2CSm3mKk54'; // Placeholder Price ID
const stripe = Stripe(STRIPE_PK);

const FREE_Q_LIMIT = 20;

// --- GLOBAL STATE ---
let allQuestions = [];
let user = loadUser();
let currentQuiz = {};
let currentQuizData = []; // Questions for the current session
let currentQuestionIndex = 0;
let quizStartTime;
let quizTimerInterval;
let quizMode = 'practice'; // 'practice' or 'exam'

// --- LOCAL STORAGE KEY CONSTANTS ---
const LS_KEYS = {
    USER: 'cpcFastLaneUser',
    SESSIONS: 'cpcFastLaneSessions',
    MISSED_Q: 'cpcFastLaneMissedQ', // { qId: count }
    LIFETIME_Q: 'cpcFastLaneLifetimeQ', // Set of unique question IDs attempted
};

// --- DOM ELEMENTS (Cached for performance) ---
const DOM = {
    views: document.querySelectorAll('.view'),
    // Header
    userDisplay: document.getElementById('user-display'),
    premiumBadge: document.getElementById('premium-badge'),
    signInBtn: document.getElementById('sign-in-btn'),
    upgradeTile: document.getElementById('upgrade-tile'),
    // Config View
    configView: document.getElementById('config-view'),
    configTitle: document.getElementById('config-title'),
    quizConfigForm: document.getElementById('quiz-config-form'),
    categorySelect: document.getElementById('category-select'),
    numQuestionsInput: document.getElementById('num-questions'),
    qCountDisplay: document.getElementById('q-count-display'),
    rationaleToggleGroup: document.getElementById('rationale-toggle-group'),
    showRationalesToggle: document.getElementById('show-rationales-toggle'),
    timerGroup: document.getElementById('timer-group'),
    timeLimitInput: document.getElementById('time-limit'),
    // Quiz Player
    quizPlayerView: document.getElementById('quiz-player-view'),
    quizProgressBar: document.getElementById('quiz-progress-bar'),
    questionCounter: document.getElementById('question-counter'),
    timerDisplay: document.getElementById('timer-display'),
    questionCategory: document.getElementById('question-category'),
    questionStem: document.getElementById('question-stem'),
    questionForm: document.getElementById('question-form'),
    feedbackRationale: document.getElementById('feedback-rationale'),
    feedbackText: document.getElementById('feedback-text'),
    rationaleText: document.getElementById('rationale-text'),
    prevBtn: document.getElementById('prev-btn'),
    nextBtn: document.getElementById('next-btn'),
    flagBtn: document.getElementById('flag-btn'),
    submitExamBtn: document.getElementById('submit-exam-btn'),
    // Results View
    resultsView: document.getElementById('results-view'),
    resultsTitle: document.getElementById('results-title'),
    scoreDisplay: document.getElementById('score-display'),
    totalQuestionsDisplay: document.getElementById('total-questions-display'),
    percentDisplay: document.getElementById('percent-display'),
    timeSpentDisplay: document.getElementById('time-spent-display'),
    avgTimeDisplay: document.getElementById('avg-time-display'),
    categoryChartCanvas: document.getElementById('category-chart'),
    reviewIncorrectBtn: document.getElementById('review-incorrect-btn'),
    retakeMissedBtn: document.getElementById('retake-missed-btn'),
    reviewList: document.getElementById('review-list'),
    // Progress View
    progressView: document.getElementById('progress-view'),
    noProgressMsg: document.getElementById('no-progress-msg'),
    totalAttemptsStat: document.getElementById('total-attempts-stat'),
    lifetimeAccuracyStat: document.getElementById('lifetime-accuracy-stat'),
    avgTimeStat: document.getElementById('avg-time-stat'),
    weakestAreaStat: document.getElementById('weakest-area-stat'),
    recentSessionsList: document.getElementById('recent-sessions-list'),
    lifetimeCategoryChartCanvas: document.getElementById('lifetime-category-chart'),
    // Settings View
    settingsView: document.getElementById('settings-view'),
    settingsEmailDisplay: document.getElementById('settings-email-display'),
    settingsPremiumStatus: document.getElementById('settings-premium-status'),
    settingsSignInBtn: document.getElementById('settings-sign-in-btn'),
    settingsRestoreBtn: document.getElementById('settings-restore-btn'),
    resetProgressBtn: document.getElementById('reset-progress-btn'),
    // Paywall View
    paywallView: document.getElementById('paywall-view'),
    stripeCheckoutBtn: document.getElementById('stripe-checkout-btn'),
    restorePurchaseBtn: document.getElementById('restore-purchase-btn'),
    // Missed View
    missedView: document.getElementById('missed-view'),
    missedQList: document.getElementById('missed-q-list'),
    noMissedMsg: document.getElementById('no-missed-msg')
};

// --- INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
    registerServiceWorker();
    loadQuestionsAndInit();
    setupEventListeners();
    updateUI();
});

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').then(function(registration) {
            console.log('Service Worker registered successfully with scope: ', registration.scope);
        }).catch(function(error) {
            console.log('Service Worker registration failed: ', error);
        });
    }
}

async function loadQuestionsAndInit() {
    try {
        const response = await fetch('data/questions.json');
        allQuestions = await response.json();
        // Check if question limit reached, if so, show paywall on load
        if (!user.isPremium && getLifetimeAttemptedCount() >= FREE_Q_LIMIT) {
            DOM.upgradeTile.classList.remove('hidden');
        } else {
            DOM.upgradeTile.classList.add('hidden');
        }
        populateConfigCategories();
        showView('home-view');
    } catch (error) {
        console.error('Error loading questions.json:', error);
        alert('Failed to load quiz questions. Please check the data/questions.json file.');
    }
}

function setupEventListeners() {
    document.body.addEventListener('click', handleNavigation);
    DOM.numQuestionsInput.addEventListener('input', () => {
        DOM.qCountDisplay.textContent = DOM.numQuestionsInput.value;
    });
    DOM.quizConfigForm.addEventListener('submit', handleQuizStart);
    DOM.nextBtn.addEventListener('click', handleNextQuestion);
    DOM.prevBtn.addEventListener('click', handlePrevQuestion);
    DOM.flagBtn.addEventListener('click', handleFlagQuestion);
    DOM.questionForm.addEventListener('change', handleAnswerSelection);
    DOM.submitExamBtn.addEventListener('click', handleSubmitExam);
    DOM.reviewIncorrectBtn.addEventListener('click', showReviewList);
    DOM.retakeMissedBtn.addEventListener('click', handleRetakeMissed);
    DOM.resetProgressBtn.addEventListener('click', handleResetProgress);
    DOM.stripeCheckoutBtn.addEventListener('click', handleStripeCheckout);
    DOM.restorePurchaseBtn.addEventListener('click', handleRestorePurchase);
    DOM.settingsRestoreBtn.addEventListener('click', handleRestorePurchase);
    DOM.signInBtn.addEventListener('click', handleSignIn);
    DOM.settingsSignInBtn.addEventListener('click', handleSignIn);
}

function handleNavigation(e) {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    // Check paywall for specific actions if limits reached
    if (!user.isPremium && getLifetimeAttemptedCount() >= FREE_Q_LIMIT) {
        if (['show-quiz-builder', 'show-exam-builder', 'show-missed-questions'].includes(action)) {
            showView('paywall-view');
            return;
        }
    }

    switch (action) {
        case 'show-quiz-builder':
            setupConfig('Quiz Builder', 'practice');
            break;
        case 'show-exam-builder':
            setupConfig('Exam Builder', 'exam');
            break;
        case 'show-progress':
            renderProgressDashboard();
            showView('progress-view');
            break;
        case 'show-settings':
            renderSettings();
            showView('settings-view');
            break;
        case 'show-paywall':
            showView('paywall-view');
            break;
        case 'go-home-btn':
            showView('home-view');
            break;
        case 'show-missed-questions':
            renderMissedQuestionsList();
            showView('missed-view');
            break;
        default:
            if (e.target.id === 'go-home-btn' || e.target.closest('#go-home-btn')) {
                 showView('home-view');
            }
    }
}

// --- USER & LOCAL STORAGE HANDLERS ---

function loadUser() {
    const defaultUser = {
        email: 'guest',
        isPremium: false,
        sessions: loadSessions(),
        missedQ: loadMissedQ(),
        lifetimeQ: loadLifetimeQ()
    };
    const savedUser = JSON.parse(localStorage.getItem(LS_KEYS.USER));
    return savedUser ? { ...defaultUser, ...savedUser } : defaultUser;
}

function saveUser() {
    localStorage.setItem(LS_KEYS.USER, JSON.stringify({
        email: user.email,
        isPremium: user.isPremium
    }));
    // Save associated data separately for clarity
    localStorage.setItem(LS_KEYS.SESSIONS, JSON.stringify(user.sessions));
    localStorage.setItem(LS_KEYS.MISSED_Q, JSON.stringify(user.missedQ));
    localStorage.setItem(LS_KEYS.LIFETIME_Q, JSON.stringify([...user.lifetimeQ]));
    updateUI();
}

function loadSessions() {
    try {
        const sessions = JSON.parse(localStorage.getItem(LS_KEYS.SESSIONS));
        return Array.isArray(sessions) ? sessions : [];
    } catch {
        return [];
    }
}

function loadMissedQ() {
    try {
        return JSON.parse(localStorage.getItem(LS_KEYS.MISSED_Q)) || {};
    } catch {
        return {};
    }
}

function loadLifetimeQ() {
    try {
        const setArray = JSON.parse(localStorage.getItem(LS_KEYS.LIFETIME_Q));
        return new Set(setArray || []);
    } catch {
        return new Set();
    }
}

function getLifetimeAttemptedCount() {
    return user.lifetimeQ.size;
}

function handleSignIn() {
    const newEmail = prompt('Enter your email for tracking (e.g., jane.doe@example.com):', user.email === 'guest' ? '' : user.email);
    if (newEmail && newEmail.includes('@')) {
        user.email = newEmail.toLowerCase();
        saveUser();
    } else if (newEmail !== null) {
        alert('Invalid email format. Please try again.');
    }
}

function updateUI() {
    // Header
    DOM.userDisplay.textContent = user.email;
    DOM.premiumBadge.classList.toggle('hidden', !user.isPremium);
    DOM.signInBtn.classList.toggle('hidden', user.email !== 'guest');
    
    // Check if free limit reached
    const lifetimeCount = getLifetimeAttemptedCount();
    const limitReached = lifetimeCount >= FREE_Q_LIMIT && !user.isPremium;
    
    // Home view: Show/Hide Upgrade tile
    DOM.upgradeTile.classList.toggle('hidden', !limitReached);

    // Settings view
    DOM.settingsEmailDisplay.textContent = user.email;
    DOM.settingsPremiumStatus.textContent = user.isPremium ? 'Premium (Full Access)' : `Basic (Limit: ${lifetimeCount}/${FREE_Q_LIMIT} Qs)`;
}

// --- QUIZ CONFIGURATION ---

function populateConfigCategories() {
    const categories = [...new Set(allQuestions.map(q => q.category))].sort();
    DOM.categorySelect.innerHTML = categories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    DOM.numQuestionsInput.max = allQuestions.length;
    DOM.numQuestionsInput.value = Math.min(25, allQuestions.length);
    DOM.qCountDisplay.textContent = DOM.numQuestionsInput.value;
}

function setupConfig(title, mode) {
    quizMode = mode;
    DOM.configTitle.textContent = title;
    
    // Toggle for Practice/Exam mode settings
    const isExam = mode === 'exam';
    DOM.rationaleToggleGroup.style.display = isExam ? 'none' : 'block';
    DOM.timerGroup.style.display = isExam ? 'block' : 'none';
    DOM.numQuestionsInput.max = isExam ? allQuestions.length : Math.min(50, allQuestions.length);
    DOM.numQuestionsInput.value = isExam ? allQuestions.length : Math.min(25, allQuestions.length);
    DOM.qCountDisplay.textContent = DOM.numQuestionsInput.value;
    
    showView('config-view');
}

function handleQuizStart(e) {
    e.preventDefault();

    const selectedCategories = Array.from(DOM.categorySelect.selectedOptions).map(opt => opt.value);
    const numQuestions = parseInt(DOM.numQuestionsInput.value);
    const timeLimitMinutes = parseInt(DOM.timeLimitInput.value) || 240;
    const showRationales = DOM.showRationalesToggle.checked;
    
    if (selectedCategories.length === 0) {
        alert('Please select at least one category.');
        return;
    }

    // 1. Filter Questions
    let filteredQuestions = allQuestions.filter(q => selectedCategories.includes(q.category));
    
    // 2. Apply Free Limit Restriction (only if not premium and not exam mode)
    if (!user.isPremium && quizMode !== 'exam') {
        const attemptedQIds = user.lifetimeQ;
        const availableQ = filteredQuestions.filter(q => !attemptedQIds.has(q.id));
        const attemptedCount = getLifetimeAttemptedCount();
        const availableLimit = FREE_Q_LIMIT - attemptedCount;

        if (availableLimit <= 0) {
            showView('paywall-view');
            return;
        }
        
        // Take the subset of available questions that matches the requested number
        // If requested number is more than available limit, cap at available limit
        const limit = Math.min(numQuestions, availableLimit);
        filteredQuestions = shuffleArray(availableQ).slice(0, limit);

        if (filteredQuestions.length === 0) {
            alert(`No new questions available in the selected categories. You have attempted ${attemptedCount}/${FREE_Q_LIMIT} free questions.`);
            return;
        }
    }

    // 3. Shuffle and Slice
    currentQuizData = shuffleArray(filteredQuestions).slice(0, numQuestions);
    
    if (currentQuizData.length === 0) {
        alert('No questions match your criteria.');
        return;
    }

    // 4. Initialize Quiz Session
    currentQuiz = {
        startTime: Date.now(),
        mode: quizMode,
        showRationales: quizMode === 'practice' ? showRationales : false,
        timeLimit: quizMode === 'exam' ? timeLimitMinutes * 60 : null, // Convert to seconds
        questions: currentQuizData.map(q => ({
            id: q.id,
            category: q.category,
            userAnswer: null,
            isCorrect: null,
            timeSpent: 0,
            flagged: false
        }))
    };
    currentQuestionIndex = 0;
    quizStartTime = Date.now();
    startQuizTimer();
    renderQuestion(currentQuestionIndex);
    showView('quiz-player-view');
}

// --- QUIZ TIMER & CONTROLS ---

function startQuizTimer() {
    clearInterval(quizTimerInterval);
    DOM.timerDisplay.classList.toggle('hidden', currentQuiz.timeLimit === null);

    if (currentQuiz.timeLimit) {
        let secondsLeft = currentQuiz.timeLimit;
        const endTime = quizStartTime + (currentQuiz.timeLimit * 1000);

        const updateTimer = () => {
            const timeElapsed = Math.floor((Date.now() - quizStartTime) / 1000);
            secondsLeft = currentQuiz.timeLimit - timeElapsed;

            if (secondsLeft <= 0) {
                clearInterval(quizTimerInterval);
                alert('Time\'s up! Submitting exam.');
                endQuiz(true); // Forced submission
                return;
            }

            const minutes = Math.floor(secondsLeft / 60);
            const seconds = secondsLeft % 60;
            DOM.timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        };

        updateTimer();
        quizTimerInterval = setInterval(updateTimer, 1000);
        
    } else {
        // Practice mode elapsed time display (optional, keep it simple for now)
        DOM.timerDisplay.textContent = ''; 
    }
}

function handleNextQuestion() {
    // Save state before moving
    saveCurrentQuestionState();

    if (currentQuestionIndex < currentQuizData.length - 1) {
        currentQuestionIndex++;
        renderQuestion(currentQuestionIndex);
    } else if (quizMode === 'exam') {
        // Last question in Exam mode
        handleSubmitExam();
    } else {
        // Last question in Practice mode, submit automatically
        endQuiz(false);
    }
}

function handlePrevQuestion() {
    saveCurrentQuestionState();
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        renderQuestion(currentQuestionIndex);
    }
}

function handleFlagQuestion() {
    const qState = currentQuiz.questions[currentQuestionIndex];
    qState.flagged = !qState.flagged;
    DOM.flagBtn.classList.toggle('btn-primary', qState.flagged);
    DOM.flagBtn.innerHTML = qState.flagged ? '<i class="fas fa-flag"></i> Unflag' : '<i class="fas fa-flag"></i> Flag';
}

function handleAnswerSelection(e) {
    const selectedAnswer = e.target.value;
    const qState = currentQuiz.questions[currentQuestionIndex];
    const question = currentQuizData[currentQuestionIndex];

    // Log user answer and check correctness
    qState.userAnswer = selectedAnswer;
    qState.isCorrect = selectedAnswer === question.correctAnswer;
    
    // For Exam mode, don't show feedback
    if (quizMode === 'exam') {
        // Exam mode: Auto-save, no feedback, enable Next/Submit
        updateQuestionFormDisplay(qState.userAnswer, null);
        DOM.nextBtn.disabled = false;
        DOM.submitExamBtn.disabled = false;
        return;
    }

    // Practice mode: Show instant feedback and rationale
    updateQuestionFormDisplay(qState.userAnswer, question.correctAnswer);
    
    DOM.feedbackText.textContent = qState.isCorrect ? 'Correct! 🎉' : 'Incorrect. 😟';
    DOM.feedbackText.className = qState.isCorrect ? 'feedback feedback-correct' : 'feedback feedback-incorrect';
    DOM.rationaleText.textContent = question.rationale;
    DOM.feedbackRationale.classList.remove('hidden');

    // Disable further changes
    Array.from(DOM.questionForm.elements).forEach(el => el.disabled = true);
    DOM.nextBtn.disabled = false; // Always allow moving to the next question
}

function saveCurrentQuestionState() {
    const qState = currentQuiz.questions[currentQuestionIndex];
    const selectedRadio = DOM.questionForm.querySelector('input[name="answer"]:checked');

    // Only update if not in exam mode and an answer was selected
    if (selectedRadio && quizMode === 'practice') {
        // The answer was already logged in handleAnswerSelection
        // For practice mode, we ensure the time is logged and then proceed
        
    } else if (selectedRadio && quizMode === 'exam') {
        // Exam mode: Capture the answer and correctness
        const selectedAnswer = selectedRadio.value;
        const question = currentQuizData[currentQuestionIndex];

        qState.userAnswer = selectedAnswer;
        qState.isCorrect = selectedAnswer === question.correctAnswer;
    }
    
    // Time spent calculation (simple, total time for the session is more accurate for simplicity)
    // We'll calculate total time at the end.
}

function renderQuestion(index) {
    const question = currentQuizData[index];
    const qState = currentQuiz.questions[index];
    
    // --- Update Header & Progress ---
    DOM.questionCounter.textContent = `Question ${index + 1} of ${currentQuizData.length}`;
    const percent = ((index + 1) / currentQuizData.length) * 100;
    DOM.quizProgressBar.style.width = `${percent}%`;
    
    // --- Populate Question Content ---
    DOM.questionCategory.textContent = qState.category;
    DOM.questionStem.innerHTML = `${index + 1}. ${question.question}`;
    DOM.questionForm.reset();
    
    document.getElementById('textA').textContent = question.optionA;
    document.getElementById('textB').textContent = question.optionB;
    document.getElementById('textC').textContent = question.optionC;
    document.getElementById('textD').textContent = question.optionD;

    // --- Control Buttons ---
    DOM.prevBtn.disabled = index === 0;
    DOM.nextBtn.classList.toggle('hidden', quizMode === 'exam');
    DOM.submitExamBtn.classList.toggle('hidden', quizMode === 'practice' || index < currentQuizData.length - 1);
    
    // --- Restore State & Check Feedback Visibility ---
    DOM.feedbackRationale.classList.add('hidden');
    Array.from(DOM.questionForm.elements).forEach(el => el.disabled = false);
    DOM.flagBtn.classList.remove('btn-primary'); // Reset flag style
    DOM.flagBtn.innerHTML = '<i class="fas fa-flag"></i> Flag'; // Reset flag text
    
    if (qState.flagged) {
        handleFlagQuestion(); // Apply flag style
    }

    if (qState.userAnswer) {
        // Restore user answer
        const answeredRadio = document.getElementById(`option${qState.userAnswer}`);
        if (answeredRadio) answeredRadio.checked = true;
        
        // Disable form and show feedback if in practice mode OR if in exam review mode (after submission)
        if (currentQuiz.showRationales || (quizMode === 'exam' && currentQuiz.isFinished)) {
            updateQuestionFormDisplay(qState.userAnswer, question.correctAnswer);
            Array.from(DOM.questionForm.elements).forEach(el => el.disabled = true);
            
            DOM.feedbackText.textContent = qState.isCorrect ? 'Correct! 🎉' : 'Incorrect. 😟';
            DOM.feedbackText.className = qState.isCorrect ? 'feedback feedback-correct' : 'feedback feedback-incorrect';
            DOM.rationaleText.textContent = question.rationale;
            DOM.feedbackRationale.classList.remove('hidden');
        } else if (quizMode === 'practice' && !currentQuiz.showRationales) {
            // In timed practice, just show selection
             updateQuestionFormDisplay(qState.userAnswer, null);
        } else if (quizMode === 'exam') {
            // In exam, no feedback until submit
             updateQuestionFormDisplay(qState.userAnswer, null);
        }
        
    } else {
        // No answer selected, disable Next in practice mode (until answer is selected)
        DOM.nextBtn.disabled = quizMode === 'practice' && !currentQuiz.showRationales;
        // Exam mode doesn't disable Next
    }
}

function updateQuestionFormDisplay(userAnswer, correctAnswer) {
    const options = ['A', 'B', 'C', 'D'];
    options.forEach(opt => {
        const label = document.querySelector(`label[for=option${opt}]`);
        label.classList.remove('option-correct', 'option-incorrect');

        if (correctAnswer && opt === correctAnswer) {
            label.classList.add('option-correct');
        } else if (userAnswer && opt === userAnswer && userAnswer !== correctAnswer) {
            label.classList.add('option-incorrect');
        }
    });
}

function handleSubmitExam() {
    saveCurrentQuestionState();
    if (confirm('Are you sure you want to submit the exam? You will not be able to change your answers.')) {
        endQuiz(false);
    }
}

// --- QUIZ END & RESULTS ---

function endQuiz(timeOut) {
    clearInterval(quizTimerInterval);
    currentQuiz.endTime = Date.now();
    currentQuiz.durationSeconds = Math.floor((currentQuiz.endTime - currentQuiz.startTime) / 1000);
    currentQuiz.isFinished = true;
    
    // Calculate results
    const totalQ = currentQuiz.questions.length;
    const correctQ = currentQuiz.questions.filter(q => q.isCorrect === true).length;
    const scorePercent = (correctQ / totalQ) * 100;
    
    currentQuiz.score = correctQ;
    currentQuiz.percent = scorePercent.toFixed(1);

    // Update Lifetime Attempted Qs and Missed Qs
    const missedQTracker = loadMissedQ();
    currentQuiz.questions.forEach(q => {
        user.lifetimeQ.add(q.id); // Add to lifetime count
        if (q.isCorrect === false) {
            missedQTracker[q.id] = (missedQTracker[q.id] || 0) + 1;
        }
    });
    user.missedQ = missedQTracker;
    
    // Save session and user data
    user.sessions.unshift({
        id: Date.now(),
        date: new Date().toLocaleDateString(),
        mode: currentQuiz.mode,
        total: totalQ,
        score: correctQ,
        percent: currentQuiz.percent,
        duration: currentQuiz.durationSeconds,
        categoryBreakdown: calculateCategoryBreakdown(currentQuiz.questions)
    });
    saveUser();
    
    renderResults();
    showView('results-view');
}

function calculateCategoryBreakdown(questions) {
    const breakdown = {};
    questions.forEach(q => {
        if (!breakdown[q.category]) {
            breakdown[q.category] = { total: 0, correct: 0 };
        }
        breakdown[q.category].total++;
        if (q.isCorrect) {
            breakdown[q.category].correct++;
        }
    });
    return breakdown;
}

function renderResults() {
    const totalQ = currentQuiz.questions.length;
    
    DOM.resultsTitle.textContent = `${currentQuiz.mode === 'exam' ? 'Exam' : 'Quiz'} Results (${currentQuiz.mode === 'exam' ? 'Simulated' : 'Practice'})`;
    DOM.scoreDisplay.textContent = currentQuiz.score;
    DOM.totalQuestionsDisplay.textContent = totalQ;
    DOM.percentDisplay.textContent = currentQuiz.percent + '%';
    DOM.timeSpentDisplay.textContent = formatTime(currentQuiz.durationSeconds);
    DOM.avgTimeDisplay.textContent = (currentQuiz.durationSeconds / totalQ).toFixed(1);

    // Retake Missed Qs button visible only if missed questions exist
    const hasMissed = currentQuiz.score !== totalQ;
    DOM.retakeMissedBtn.classList.toggle('hidden', !hasMissed);

    // Category Chart
    const breakdown = currentQuiz.categoryBreakdown;
    const labels = Object.keys(breakdown);
    const correctData = labels.map(cat => breakdown[cat].correct);
    const incorrectData = labels.map(cat => breakdown[cat].total - breakdown[cat].correct);
    
    renderChart(DOM.categoryChartCanvas, labels, correctData, incorrectData, 'bar');

    // Reset Review List
    DOM.reviewList.classList.add('hidden');
    DOM.reviewList.innerHTML = '<h3>Incorrectly Answered Questions:</h3>';
}

function showReviewList() {
    DOM.reviewList.classList.toggle('hidden');
    if (!DOM.reviewList.classList.contains('hidden')) {
        renderReviewQuestions();
    }
}

function renderReviewQuestions() {
    DOM.reviewList.innerHTML = '<h3>Incorrectly Answered Questions:</h3>';
    const incorrectQuestions = currentQuiz.questions.filter(q => q.isCorrect === false);
    
    incorrectQuestions.forEach(qState => {
        const question = allQuestions.find(q => q.id === qState.id);
        if (!question) return;

        const reviewItem = document.createElement('div');
        reviewItem.className = 'review-item';
        reviewItem.innerHTML = `
            <h4>${qState.category} - Question ${question.id}</h4>
            <p>${question.question}</p>
            <div class="review-incorrect-details">
                <p><strong>Your Answer:</strong> ${qState.userAnswer}</p>
                <p><strong>Correct Answer:</strong> ${question.correctAnswer}</p>
            </div>
            <div class="rationale-box">
                <h4>Rationale:</h4>
                <p>${question.rationale}</p>
            </div>
        `;
        DOM.reviewList.appendChild(reviewItem);
    });
}

function handleRetakeMissed() {
    const missedQIds = currentQuiz.questions.filter(q => q.isCorrect === false).map(q => q.id);
    if (missedQIds.length === 0) {
        alert('All questions were answered correctly! Start a new quiz.');
        return;
    }

    // Set up a new quiz session with only the missed questions
    currentQuizData = allQuestions.filter(q => missedQIds.includes(q.id));
    
    currentQuiz = {
        startTime: Date.now(),
        mode: 'practice',
        showRationales: true,
        timeLimit: null,
        questions: currentQuizData.map(q => ({
            id: q.id,
            category: q.category,
            userAnswer: null,
            isCorrect: null,
            timeSpent: 0,
            flagged: false
        }))
    };
    currentQuestionIndex = 0;
    quizStartTime = Date.now();
    startQuizTimer();
    renderQuestion(currentQuestionIndex);
    showView('quiz-player-view');
}

// --- PROGRESS DASHBOARD ---

function renderProgressDashboard() {
    const allSessions = user.sessions;
    
    if (allSessions.length === 0) {
        DOM.noProgressMsg.classList.remove('hidden');
        DOM.totalAttemptsStat.textContent = 0;
        DOM.lifetimeAccuracyStat.textContent = '0%';
        DOM.avgTimeStat.textContent = '0s';
        DOM.weakestAreaStat.textContent = 'N/A';
        DOM.recentSessionsList.innerHTML = '';
        renderChart(DOM.lifetimeCategoryChartCanvas, [], [], [], 'bar'); // Clear chart
        return;
    }
    DOM.noProgressMsg.classList.add('hidden');

    // 1. Lifetime Stats
    const totalAttempts = allSessions.length;
    const totalQAttempted = allSessions.reduce((sum, s) => sum + s.total, 0);
    const totalQCorrect = allSessions.reduce((sum, s) => sum + s.score, 0);
    const totalDuration = allSessions.reduce((sum, s) => sum + s.duration, 0);

    const lifetimeAccuracy = totalQAttempted > 0 ? ((totalQCorrect / totalQAttempted) * 100).toFixed(1) : 0;
    const avgTimePerQ = totalQAttempted > 0 ? (totalDuration / totalQAttempted).toFixed(1) : 0;
    
    DOM.totalAttemptsStat.textContent = totalAttempts;
    DOM.lifetimeAccuracyStat.textContent = lifetimeAccuracy + '%';
    DOM.avgTimeStat.textContent = avgTimePerQ + 's';

    // 2. Category Performance & Weakest Area
    const lifetimeBreakdown = {};
    allSessions.forEach(session => {
        for (const category in session.categoryBreakdown) {
            if (!lifetimeBreakdown[category]) {
                lifetimeBreakdown[category] = { total: 0, correct: 0 };
            }
            lifetimeBreakdown[category].total += session.categoryBreakdown[category].total;
            lifetimeBreakdown[category].correct += session.categoryBreakdown[category].correct;
        }
    });

    let lowestAccuracy = 101;
    let weakestArea = 'N/A';

    const labels = Object.keys(lifetimeBreakdown);
    const correctData = [];
    const incorrectData = [];
    
    labels.forEach(cat => {
        const total = lifetimeBreakdown[cat].total;
        const correct = lifetimeBreakdown[cat].correct;
        const accuracy = (correct / total) * 100;

        correctData.push(correct);
        incorrectData.push(total - correct);
        
        if (accuracy < lowestAccuracy && total >= 5) { // Only count areas with >5 attempts
            lowestAccuracy = accuracy;
            weakestArea = cat;
        }
    });
    
    DOM.weakestAreaStat.textContent = weakestArea;

    // 3. Recent Sessions List
    DOM.recentSessionsList.innerHTML = allSessions.map(s => `
        <div class="card card-session">
            <p><strong>${s.mode === 'exam' ? 'Exam Simulation' : 'Practice Quiz'}</strong> - ${s.date}</p>
            <p>Score: ${s.score} / ${s.total} | Accuracy: <span style="color:${s.percent > 70 ? varToCss('success-color') : varToCss('danger-color')}">${s.percent}%</span></p>
            <p>Duration: ${formatTime(s.duration)}</p>
            <button class="btn btn-sm btn-secondary" data-session-id="${s.id}" onclick="viewSessionReview(${s.id})">Review Session</button>
        </div>
    `).join('');

    // 4. Lifetime Category Chart
    renderChart(DOM.lifetimeCategoryChartCanvas, labels, correctData, incorrectData, 'bar');
}

function viewSessionReview(sessionId) {
    const session = user.sessions.find(s => s.id === sessionId);
    if (!session) {
        alert('Session not found.');
        return;
    }
    
    // For simplicity, we can't fully reconstruct the *questions* here (they aren't saved with the session), 
    // but we can show the results summary. For a full review, the full question text needs to be saved with the session.
    // For this static app, we'll only show the summary and the category breakdown.
    
    // Set currentQuiz to the session for results rendering logic
    currentQuiz = {
        mode: session.mode,
        score: session.score,
        percent: session.percent,
        durationSeconds: session.duration,
        categoryBreakdown: session.categoryBreakdown,
        questions: [] // Cannot reconstruct full questions without saving them to LS
    };
    
    DOM.resultsTitle.textContent = `${session.mode === 'exam' ? 'Exam' : 'Quiz'} Review - ${session.date}`;
    DOM.scoreDisplay.textContent = session.score;
    DOM.totalQuestionsDisplay.textContent = session.total;
    DOM.percentDisplay.textContent = session.percent + '%';
    DOM.timeSpentDisplay.textContent = formatTime(session.duration);
    DOM.avgTimeDisplay.textContent = (session.duration / session.total).toFixed(1);

    // Re-render chart
    const breakdown = session.categoryBreakdown;
    const labels = Object.keys(breakdown);
    const correctData = labels.map(cat => breakdown[cat].correct);
    const incorrectData = labels.map(cat => breakdown[cat].total - breakdown[cat].correct);
    renderChart(DOM.categoryChartCanvas, labels, correctData, incorrectData, 'bar');
    
    DOM.reviewIncorrectBtn.classList.add('hidden'); // Cannot review questions without full data
    DOM.retakeMissedBtn.classList.add('hidden');
    DOM.reviewList.classList.add('hidden');
    
    showView('results-view');
}

// --- MISSED QUESTIONS VIEW ---

function renderMissedQuestionsList() {
    const missedQTracker = user.missedQ;
    const missedQIds = Object.keys(missedQTracker).map(Number).filter(id => missedQTracker[id] > 0);

    if (missedQIds.length === 0) {
        DOM.noMissedMsg.classList.remove('hidden');
        DOM.missedQList.innerHTML = '';
        return;
    }
    DOM.noMissedMsg.classList.add('hidden');

    const missedQuestions = allQuestions.filter(q => missedQIds.includes(q.id));
    
    // Group by category
    const grouped = missedQuestions.reduce((acc, q) => {
        if (!acc[q.category]) acc[q.category] = [];
        acc[q.category].push(q);
        return acc;
    }, {});

    DOM.missedQList.innerHTML = '';
    
    for (const category in grouped) {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'category-missed-group';
        groupDiv.innerHTML = `<h3>${category} (${grouped[category].length} Missed Qs)</h3>`;
        
        grouped[category].forEach(q => {
            const qItem = document.createElement('div');
            qItem.className = 'card missed-q-item';
            qItem.innerHTML = `
                <p><strong>Q${q.id}:</strong> ${q.question}</p>
                <p class="mt-1">Times missed: <span style="color:${varToCss('danger-color')}">${missedQTracker[q.id]}</span></p>
                <div class="rationale-box">
                    <h4>Rationale:</h4>
                    <p>Correct Answer: ${q.correctAnswer}</p>
                    <p>${q.rationale}</p>
                </div>
            `;
            groupDiv.appendChild(qItem);
        });
        
        DOM.missedQList.appendChild(groupDiv);
    }
}

// --- SETTINGS ---

function handleResetProgress() {
    if (confirm('WARNING: This will permanently delete ALL saved quiz results, progress, and settings (including your premium status) from this browser. Are you absolutely sure you want to proceed?')) {
        localStorage.clear();
        alert('All progress has been reset. Reloading app.');
        window.location.reload();
    }
}

function renderSettings() {
    DOM.settingsEmailDisplay.textContent = user.email;
    DOM.settingsPremiumStatus.textContent = user.isPremium ? 'Premium (Full Access)' : 'Basic';
}


// --- PAYMENT LOGIC (Stripe Simulation) ---

function handleStripeCheckout() {
    // In a real application, you would create a Checkout Session on your server
    // and redirect the user to Stripe. This is a client-side simulation.
    
    // SIMULATION: Create a mock session object
    const mockSession = {
        id: 'cs_test_a1b2c3d4e5f6g7h8i9j0',
        url: 'https://checkout.stripe.com/pay/mock_session_id'
    };
    
    if (confirm(`SIMULATION: Initiating one-time payment of $29.99.\n\nClick OK to simulate a successful payment and unlock Premium.`)) {
        // Simulate success immediately
        handleStripeSuccess();
    } else {
        alert('Payment cancelled or failed (simulation).');
    }
}

function handleStripeSuccess() {
    user.isPremium = true;
    saveUser();
    alert('🎉 Premium Access Unlocked! Thank you for your purchase.');
    // Check if free limit was reached, if so, go home now that it's unlocked
    if (getLifetimeAttemptedCount() >= FREE_Q_LIMIT) {
        showView('home-view');
    } else {
        showView('paywall-view'); // Re-render the paywall view to show the status change
    }
    updateUI();
}

function handleRestorePurchase() {
    const restoreEmail = prompt('Enter the email used for your Premium purchase to restore access:');
    if (!restoreEmail || !restoreEmail.includes('@')) {
        alert('Invalid email. Restoration failed.');
        return;
    }
    
    // SIMULATION: In a real app, this would check a backend database.
    // Here, we simulate success if the email is provided and matches a known flag.
    if (user.email === restoreEmail.toLowerCase() && user.isPremium) {
        alert('Purchase restored successfully!');
    } else if (confirm('SIMULATION: Purchase could not be verified automatically. Click OK to forcibly restore Premium status in this browser (for testing/sim purposes).')) {
        handleStripeSuccess();
    } else {
        alert('Purchase restoration failed. Please contact support.');
    }
}

// --- UTILITY FUNCTIONS ---

function showView(viewId) {
    DOM.views.forEach(view => {
        view.classList.add('hidden');
    });
    document.getElementById(viewId).classList.remove('hidden');
    window.scrollTo(0, 0);
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    } else {
        return `${seconds}s`;
    }
}

function varToCss(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(`--${varName}`).trim();
}

// --- CHART.JS RENDERING ---
let chartInstance = null;
let lifetimeChartInstance = null;

function renderChart(canvas, labels, correctData, incorrectData, type) {
    // Destroy previous chart instance if it exists
    if (canvas.id === 'category-chart' && chartInstance) {
        chartInstance.destroy();
    } else if (canvas.id === 'lifetime-category-chart' && lifetimeChartInstance) {
        lifetimeChartInstance.destroy();
    }
    
    const ctx = canvas.getContext('2d');
    
    const newChart = new Chart(ctx, {
        type: type,
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Correct',
                    data: correctData,
                    backgroundColor: varToCss('success-color'),
                    stack: 'Stack 0',
                },
                {
                    label: 'Incorrect',
                    data: incorrectData,
                    backgroundColor: varToCss('danger-color'),
                    stack: 'Stack 0',
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                x: {
                    stacked: true,
                },
                y: {
                    stacked: true,
                    beginAtZero: true
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                }
            }
        }
    });
    
    if (canvas.id === 'category-chart') {
        chartInstance = newChart;
    } else if (canvas.id === 'lifetime-category-chart') {
        lifetimeChartInstance = newChart;
    }
}