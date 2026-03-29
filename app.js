const BEST_SCORE_KEY = "mathGameBestScore";
const MUTED_KEY = "mathGameMuted";
const HISTORY_KEY = "mathGameHistory";
const STREAK_MILESTONES = [
  { value: 3, message: "Серия 3! Отлично!" },
  { value: 5, message: "Серия 5! Супер!" },
  { value: 10, message: "Серия 10! Ух ты!" },
];
const ZERO_KEEP_CHANCE = 0.12;

const MODES = {
  easy: {
    id: "easy",
    label: "Легкий",
    durationSec: 60,
    operations: ["add"],
  },
  medium: {
    id: "medium",
    label: "Средний",
    durationSec: 60,
    operations: ["add", "sub"],
  },
  fast: {
    id: "fast",
    label: "Быстрый",
    durationSec: 30,
    operations: ["add", "sub"],
  },
};

const screens = {
  start: document.getElementById("start-screen"),
  game: document.getElementById("game-screen"),
  result: document.getElementById("result-screen"),
};

const startButton = document.getElementById("start-button");
const restartButton = document.getElementById("restart-button");
const answerForm = document.getElementById("answer-form");
const answerInput = document.getElementById("answer-input");
const feedbackElement = document.getElementById("feedback");
const modeSelect = document.getElementById("mode-select");

const timerElement = document.getElementById("timer");
const problemElement = document.getElementById("problem");
const streakValueElement = document.getElementById("streak-value");
const streakToastElement = document.getElementById("streak-toast");
const correctCountElement = document.getElementById("correct-count");
const wrongCountElement = document.getElementById("wrong-count");
const gameModeLabelElement = document.getElementById("game-mode-label");

const resultModeElement = document.getElementById("result-mode");
const resultCorrectElement = document.getElementById("result-correct");
const resultWrongElement = document.getElementById("result-wrong");
const resultAccuracyElement = document.getElementById("result-accuracy");
const resultMaxStreakElement = document.getElementById("result-max-streak");
const bestScoreValueElement = document.getElementById("best-score-value");
const resultBestScoreElement = document.getElementById("result-best-score");

const historyBodyElement = document.getElementById("history-body");
const historyEmptyElement = document.getElementById("history-empty");
const historyTableElement = document.getElementById("history-table");

const soundButtons = [
  document.getElementById("start-sound-toggle"),
  document.getElementById("game-sound-toggle"),
].filter(Boolean);

let timerId = null;
let audioContext = null;
let streakToastTimerId = null;

const gameState = {
  timeLeft: MODES.medium.durationSec,
  correct: 0,
  wrong: 0,
  currentStreak: 0,
  maxStreak: 0,
  currentProblem: null,
  bestScore: readBestScore(),
  isRunning: false,
  currentModeId: "medium",
  awardedMilestones: new Set(),
  muted: readMuted(),
  history: readHistory(),
};

function readBestScore() {
  const storedValue = Number(localStorage.getItem(BEST_SCORE_KEY));
  return Number.isFinite(storedValue) && storedValue > 0 ? storedValue : 0;
}

function writeBestScore(value) {
  localStorage.setItem(BEST_SCORE_KEY, String(value));
}

function readMuted() {
  return localStorage.getItem(MUTED_KEY) === "true";
}

function writeMuted(value) {
  localStorage.setItem(MUTED_KEY, String(Boolean(value)));
}

function readHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .slice(0, 10)
      .map((item) => {
        const isValid =
          item &&
          typeof item.playedAtISO === "string" &&
          typeof item.modeId === "string" &&
          typeof item.modeLabel === "string" &&
          Number.isInteger(item.correct) &&
          Number.isInteger(item.wrong) &&
          Number.isInteger(item.accuracy);

        if (!isValid) {
          return null;
        }

        const maxStreak = Number.isInteger(item.maxStreak) && item.maxStreak > 0 ? item.maxStreak : 0;
        return {
          playedAtISO: item.playedAtISO,
          modeId: item.modeId,
          modeLabel: item.modeLabel,
          correct: item.correct,
          wrong: item.wrong,
          accuracy: item.accuracy,
          maxStreak,
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function writeHistory(historyItems) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(historyItems.slice(0, 10)));
}

function getMode(modeId) {
  return MODES[modeId] || MODES.medium;
}

function getCurrentMode() {
  return getMode(gameState.currentModeId);
}

function setScreen(activeScreenKey) {
  Object.entries(screens).forEach(([key, screen]) => {
    if (key === activeScreenKey) {
      screen.classList.remove("hidden");
      screen.classList.remove("screen-enter");
      void screen.offsetWidth;
      screen.classList.add("screen-enter");
      return;
    }

    screen.classList.add("hidden");
  });
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function randomInt(maxInclusive) {
  return Math.floor(Math.random() * (maxInclusive + 1));
}

function randomFromRange(minInclusive, maxInclusive) {
  return minInclusive + randomInt(maxInclusive - minInclusive);
}

function randomOperand(maxInclusive) {
  if (maxInclusive <= 0) {
    return 0;
  }

  const value = randomInt(maxInclusive);
  if (value !== 0) {
    return value;
  }

  return Math.random() < ZERO_KEEP_CHANCE ? 0 : randomFromRange(1, maxInclusive);
}

function generateAddition() {
  const a = randomOperand(10);
  const b = randomOperand(10 - a);
  return { a, b, op: "+", answer: a + b };
}

function generateSubtraction() {
  const a = randomOperand(10);
  const b = randomOperand(a);
  return { a, b, op: "-", answer: a - b };
}

function nextProblem() {
  const mode = getCurrentMode();
  const opKind = mode.operations[randomInt(mode.operations.length - 1)];
  const baseProblem = opKind === "sub" ? generateSubtraction() : generateAddition();

  gameState.currentProblem = {
    ...baseProblem,
    text: `${baseProblem.a} ${baseProblem.op} ${baseProblem.b} = ?`,
  };

  problemElement.textContent = gameState.currentProblem.text;
}

function renderHud() {
  timerElement.textContent = formatTime(gameState.timeLeft);
  correctCountElement.textContent = String(gameState.correct);
  wrongCountElement.textContent = String(gameState.wrong);
  bestScoreValueElement.textContent = String(gameState.bestScore);
  gameModeLabelElement.textContent = getCurrentMode().label;
}

function renderStreak() {
  streakValueElement.textContent = String(gameState.currentStreak);
}

function clearFeedback() {
  feedbackElement.textContent = "";
  feedbackElement.classList.remove("ok", "error", "feedback-pop");
}

function clearStreakToast() {
  clearTimeout(streakToastTimerId);
  streakToastTimerId = null;
  streakToastElement.textContent = "";
  streakToastElement.classList.remove("show");
}

function showStreakToast(message) {
  clearTimeout(streakToastTimerId);
  streakToastElement.textContent = message;
  streakToastElement.classList.remove("show");
  void streakToastElement.offsetWidth;
  streakToastElement.classList.add("show");

  streakToastTimerId = setTimeout(() => {
    streakToastElement.classList.remove("show");
  }, 900);
}

function showFeedback(message, type) {
  feedbackElement.textContent = message;
  feedbackElement.classList.remove("ok", "error", "feedback-pop");
  feedbackElement.classList.add(type);
  void feedbackElement.offsetWidth;
  feedbackElement.classList.add("feedback-pop");
}

function ensureAudioContext() {
  if (!audioContext) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }

    audioContext = new AudioContextCtor();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
}

function playTone(frequency, durationSec, volume, startOffsetSec = 0) {
  if (!audioContext || gameState.muted) {
    return;
  }

  const startAt = audioContext.currentTime + startOffsetSec;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startAt);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);

  oscillator.start(startAt);
  oscillator.stop(startAt + durationSec);
}

function playSound(type) {
  if (gameState.muted) {
    return;
  }

  ensureAudioContext();

  if (type === "ok") {
    playTone(880, 0.09, 0.05);
    playTone(1175, 0.08, 0.045, 0.08);
    return;
  }

  if (type === "error") {
    playTone(220, 0.12, 0.06);
    return;
  }

  if (type === "finish") {
    playTone(523.25, 0.14, 0.05);
    playTone(659.25, 0.16, 0.05, 0.1);
    playTone(783.99, 0.18, 0.05, 0.22);
  }
}

function updateSoundButtons() {
  const label = gameState.muted ? "Звук: Выкл" : "Звук: Вкл";
  soundButtons.forEach((button) => {
    button.textContent = label;
    button.setAttribute("aria-pressed", String(gameState.muted));
  });
}

function toggleMute() {
  gameState.muted = !gameState.muted;
  writeMuted(gameState.muted);
  updateSoundButtons();

  if (!gameState.muted) {
    playSound("ok");
  }
}

function formatPlayedAt(playedAtISO) {
  const date = new Date(playedAtISO);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderHistory() {
  historyBodyElement.innerHTML = "";

  if (gameState.history.length === 0) {
    historyEmptyElement.classList.remove("hidden");
    historyTableElement.classList.add("hidden");
    return;
  }

  historyEmptyElement.classList.add("hidden");
  historyTableElement.classList.remove("hidden");

  gameState.history.forEach((item) => {
    const row = document.createElement("tr");

    const dateCell = document.createElement("td");
    const modeCell = document.createElement("td");
    const scoreCell = document.createElement("td");
    const accuracyCell = document.createElement("td");

    dateCell.textContent = formatPlayedAt(item.playedAtISO);
    modeCell.textContent = item.modeLabel;
    scoreCell.textContent = `${item.correct}/${item.wrong}`;
    accuracyCell.textContent = `${item.accuracy}%`;

    row.append(dateCell, modeCell, scoreCell, accuracyCell);
    historyBodyElement.appendChild(row);
  });
}

function handleStreakMilestone() {
  const milestone = STREAK_MILESTONES.find((entry) => entry.value === gameState.currentStreak);
  if (!milestone || gameState.awardedMilestones.has(milestone.value)) {
    return;
  }

  gameState.awardedMilestones.add(milestone.value);
  showStreakToast(milestone.message);
}

function startRound() {
  gameState.currentModeId = getMode(modeSelect.value).id;
  const mode = getCurrentMode();

  gameState.timeLeft = mode.durationSec;
  gameState.correct = 0;
  gameState.wrong = 0;
  gameState.currentStreak = 0;
  gameState.maxStreak = 0;
  gameState.awardedMilestones = new Set();
  gameState.isRunning = true;

  setScreen("game");
  clearFeedback();
  clearStreakToast();
  renderHud();
  renderStreak();
  nextProblem();
  answerInput.value = "";
  answerInput.focus();

  clearInterval(timerId);
  timerId = setInterval(() => {
    gameState.timeLeft -= 1;
    renderHud();

    if (gameState.timeLeft <= 0) {
      finishRound();
    }
  }, 1000);
}

function finishRound() {
  clearInterval(timerId);
  timerId = null;
  gameState.isRunning = false;

  if (gameState.correct > gameState.bestScore) {
    gameState.bestScore = gameState.correct;
    writeBestScore(gameState.bestScore);
  }

  const attempts = gameState.correct + gameState.wrong;
  const accuracy = attempts === 0 ? 0 : Math.round((gameState.correct / attempts) * 100);
  const mode = getCurrentMode();

  gameState.history = [
    {
      playedAtISO: new Date().toISOString(),
      modeId: mode.id,
      modeLabel: mode.label,
      correct: gameState.correct,
      wrong: gameState.wrong,
      accuracy,
      maxStreak: gameState.maxStreak,
    },
    ...gameState.history,
  ].slice(0, 10);
  writeHistory(gameState.history);

  resultModeElement.textContent = mode.label;
  resultCorrectElement.textContent = String(gameState.correct);
  resultWrongElement.textContent = String(gameState.wrong);
  resultAccuracyElement.textContent = `${accuracy}%`;
  resultMaxStreakElement.textContent = String(gameState.maxStreak);
  resultBestScoreElement.textContent = String(gameState.bestScore);
  bestScoreValueElement.textContent = String(gameState.bestScore);

  renderHistory();
  setScreen("result");
  playSound("finish");
}

function handleSubmit(event) {
  event.preventDefault();

  if (!gameState.isRunning || !gameState.currentProblem) {
    return;
  }

  const rawValue = answerInput.value.trim();
  if (rawValue === "") {
    showFeedback("Введи ответ", "error");
    return;
  }

  const answer = Number(rawValue);
  if (!Number.isInteger(answer)) {
    showFeedback("Нужна целая цифра", "error");
    return;
  }

  if (answer < 0 || answer > 10) {
    showFeedback("Ответ должен быть от 0 до 10", "error");
    return;
  }

  if (answer === gameState.currentProblem.answer) {
    gameState.correct += 1;
    gameState.currentStreak += 1;
    gameState.maxStreak = Math.max(gameState.maxStreak, gameState.currentStreak);
    showFeedback("Верно!", "ok");
    handleStreakMilestone();
    playSound("ok");
    nextProblem();
  } else {
    gameState.wrong += 1;
    gameState.currentStreak = 0;
    clearStreakToast();
    showFeedback("Неверно, попробуй еще раз", "error");
    playSound("error");
  }

  renderHud();
  renderStreak();
  answerInput.value = "";
  answerInput.focus();
}

function init() {
  modeSelect.value = gameState.currentModeId;

  startButton.addEventListener("click", startRound);
  restartButton.addEventListener("click", startRound);
  answerForm.addEventListener("submit", handleSubmit);
  soundButtons.forEach((button) => {
    button.addEventListener("click", toggleMute);
  });

  updateSoundButtons();
  renderHud();
  renderStreak();
  renderHistory();
  setScreen("start");
}

init();
