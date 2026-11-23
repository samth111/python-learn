"use strict";

/* ================= 状态 ================= */
let currentIndex = 0;          // 当前题目在 QUESTIONS 中的下标
let diffFilter = "all";        // "all" | "1" | "2" | "3" | "4"
let favoritesOnly = false;     // 是否只看收藏夹
let pyodideInstance = null;
let pyodidePromise = null;
const edits = {};              // 题目 id -> 用户编辑后的代码（仅内存）

const SOLVED_KEY = "pyquest.solved.v1";
const FAV_KEY = "pyquest.favorites.v1";
let solved = new Set(loadList(SOLVED_KEY));
let favorites = new Set(loadList(FAV_KEY));

function loadList(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch (e) {
    return [];
  }
}
function saveSolved() {
  localStorage.setItem(SOLVED_KEY, JSON.stringify([...solved]));
}
function saveFavorites() {
  localStorage.setItem(FAV_KEY, JSON.stringify([...favorites]));
}

/* ================= DOM ================= */
const $ = (id) => document.getElementById(id);
const els = {
  progressText: $("progress-text"),
  progressBar: $("progress-bar"),
  resetBtn: $("reset-btn"),
  favToggle: $("fav-toggle"),
  favCount: $("fav-count"),
  chapterList: $("chapter-list"),
  diffFilter: $("difficulty-filter"),
  questionCard: $("question-card"),
  questionNumber: $("question-number"),
  chapterLabel: $("chapter-label"),
  difficultyBadge: $("difficulty-badge"),
  questionTitle: $("question-title"),
  favBtn: $("fav-btn"),
  prompt: $("prompt"),
  gutter: $("gutter"),
  editor: $("editor"),
  runBtn: $("run-btn"),
  hintBtn: $("hint-btn"),
  solutionBtn: $("solution-btn"),
  resetQBtn: $("reset-q-btn"),
  hintBox: $("hint-box"),
  resultBanner: $("result-banner"),
  clearOutput: $("clear-output"),
  outputPre: $("output-pre"),
  explanationPanel: $("explanation-panel"),
  toggleExplanation: $("toggle-explanation"),
  explanationText: $("explanation-text"),
  solutionCode: $("solution-code"),
  copySolution: $("copy-solution"),
  prevBtn: $("prev-btn"),
  nextBtn: $("next-btn"),
  pagerInfo: $("pager-info"),
  pager: $("pager"),
  jumpInput: $("jump-input"),
  jumpBtn: $("jump-btn"),
  emptyState: $("empty-state"),
  emptyBackBtn: $("empty-back-btn"),
  pyOverlay: $("py-overlay")
};

/* ================= 工具 ================= */
function getFiltered() {
  return QUESTIONS.filter((q) => {
    if (diffFilter !== "all" && String(q.difficulty) !== diffFilter) return false;
    if (favoritesOnly && !favorites.has(q.id)) return false;
    return true;
  });
}

function getCode(q) {
  return edits[q.id] !== undefined ? edits[q.id] : q.code;
}

function b64utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/* ================= 渲染 ================= */
function updateProgress() {
  const total = QUESTIONS.length;
  const done = solved.size;
  els.progressText.textContent = `已完成 ${done} / ${total}`;
  els.progressBar.style.width = `${Math.round((done / total) * 100)}%`;
}

function updateFavUI() {
  els.favCount.textContent = favorites.size;
  els.favToggle.classList.toggle("active", favoritesOnly);
}

function renderSidebar() {
  updateFavUI();
  const list = getFiltered();
  const counts = {};
  CHAPTERS.forEach((c) => (counts[c] = 0));
  list.forEach((q) => (counts[q.chapter] = (counts[q.chapter] || 0) + 1));

  els.chapterList.innerHTML = "";
  CHAPTERS.forEach((ch) => {
    const count = counts[ch];
    const item = document.createElement("div");
    item.className = "chapter-item" + (count === 0 ? " disabled" : "");
    const cur = QUESTIONS[currentIndex];
    if (cur && cur.chapter === ch) item.classList.add("active");
    item.innerHTML = `<span>${ch}</span><span class="chapter-count">${count}</span>`;
    if (count > 0) {
      item.addEventListener("click", () => {
        const first = list.find((q) => q.chapter === ch);
        currentIndex = QUESTIONS.indexOf(first);
        renderQuestion();
      });
    }
    els.chapterList.appendChild(item);
  });

  els.diffFilter.innerHTML = "";
  [["all", "全部"], ["1", "入门"], ["2", "基础"], ["3", "进阶"], ["4", "挑战"]].forEach(
    ([val, label]) => {
      const chip = document.createElement("button");
      chip.className = "diff-chip" + (diffFilter === val ? " active" : "");
      chip.textContent = label;
      chip.addEventListener("click", () => {
        diffFilter = val;
        renderSidebar();
        renderQuestion();
      });
      els.diffFilter.appendChild(chip);
    }
  );
}

function updateGutter() {
  const lines = els.editor.value.split("\n").length;
  let html = "";
  for (let i = 1; i <= lines; i++) html += i + "<br>";
  els.gutter.innerHTML = html;
}

function resetResultUI() {
  els.resultBanner.classList.add("hidden");
  els.hintBox.classList.add("hidden");
  els.outputPre.textContent = "— 点击「运行代码」后，这里会显示程序输出与判分结果 —";
  els.explanationPanel.classList.remove("open");
  els.toggleExplanation.textContent = "展开";
}

function renderPager() {
  const q = QUESTIONS[currentIndex];
  const pos = getFiltered().findIndex((x) => x.id === q.id) + 1;
  const filteredTotal = getFiltered().length;
  const labels = [];
  if (favoritesOnly) labels.push("收藏夹");
  if (diffFilter !== "all") labels.push(DIFFICULTY[diffFilter]);
  const suffix = labels.length ? `（${labels.join("·")} ${filteredTotal} 题）` : "";
  els.pagerInfo.textContent = `第 ${q.id} 题 / 共 ${QUESTIONS.length} 题${suffix}`;
  els.prevBtn.disabled = pos <= 1;
  els.nextBtn.disabled = pos >= filteredTotal;
}

function updateFavButton() {
  const q = QUESTIONS[currentIndex];
  const active = favorites.has(q.id);
  els.favBtn.textContent = active ? "★" : "☆";
  els.favBtn.classList.toggle("active", active);
  els.favBtn.setAttribute("aria-pressed", String(active));
  els.favBtn.title = active ? "取消收藏" : "收藏本题";
}

function showEmptyState() {
  els.questionCard.classList.add("hidden");
  els.pager.classList.add("hidden");
  els.emptyState.classList.remove("hidden");
}

function hideEmptyState() {
  els.questionCard.classList.remove("hidden");
  els.pager.classList.remove("hidden");
  els.emptyState.classList.add("hidden");
}

function renderQuestion() {
  const list = getFiltered();
  if (!list.length) {
    showEmptyState();
    renderSidebar();
    return;
  }
  hideEmptyState();
  const cur = QUESTIONS[currentIndex];
  if (!list.includes(cur)) {
    currentIndex = QUESTIONS.indexOf(list[0]);
  }
  const q = QUESTIONS[currentIndex];

  els.questionNumber.textContent = `第 ${q.id} 题`;
  els.chapterLabel.textContent = q.chapter;
  els.difficultyBadge.textContent = DIFFICULTY[q.difficulty];
  els.difficultyBadge.className = "badge d" + q.difficulty;
  els.questionTitle.textContent = q.title;
  els.prompt.textContent = q.prompt;
  updateFavButton();

  els.editor.value = getCode(q);
  els.explanationText.innerHTML = q.explanation;
  els.solutionCode.textContent = q.solution;

  updateGutter();
  resetResultUI();
  renderSidebar();
  renderPager();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showResult(type, title, sub) {
  const icons = { pass: "✅", fail: "❌", error: "⚠️", warn: "ℹ️" };
  els.resultBanner.classList.remove("hidden", "pass", "fail", "error", "warn");
  els.resultBanner.classList.add(type);
  els.resultBanner.innerHTML =
    `<span class="icon">${icons[type] || "ℹ️"}</span>` +
    `<div><div>${title}</div><div class="result-sub">${sub}</div></div>`;
}

function openExplanation() {
  els.explanationPanel.classList.add("open");
  els.toggleExplanation.textContent = "收起";
}

/* ================= Pyodide 运行器 ================= */
const PYODIDE_VERSION = "0.26.4";
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("无法加载 " + src));
    document.head.appendChild(s);
  });
}

async function ensurePyodide() {
  if (pyodideInstance) return pyodideInstance;
  if (pyodidePromise) return pyodidePromise;
  pyodidePromise = (async () => {
    if (!window.loadPyodide) await loadScript(PYODIDE_BASE + "pyodide.js");
    const py = await window.loadPyodide({ indexURL: PYODIDE_BASE });
    pyodideInstance = py;
    return py;
  })();
  return pyodidePromise;
}

function buildProgram(userCode, testCode) {
  const ub = JSON.stringify(b64utf8(userCode));
  const tb = JSON.stringify(b64utf8(testCode));
  return [
    "import sys, io, base64, textwrap",
    "_ns = {}",
    "_out = io.StringIO()",
    "_old = sys.stdout",
    "_err = None",
    "sys.stdout = _out",
    "try:",
    "    exec(base64.b64decode(" + ub + ").decode('utf-8'), _ns)",
    "except Exception as _e:",
    "    _err = _e",
    "finally:",
    "    sys.stdout = _old",
    "_user_output = _out.getvalue()",
    "_ns['_user_output'] = _user_output",
    "if _err is not None:",
    "    _dsh_out = _user_output + chr(10) + '[运行错误] ' + repr(_err)",
    "else:",
    "    _t_out = io.StringIO()",
    "    sys.stdout = _t_out",
    "    _test_code = textwrap.dedent(base64.b64decode(" + tb + ").decode('utf-8'))",
    "    try:",
    "        exec(_test_code, _ns)",
    "        _marker = '__DSH_RESULT__:PASS'",
    "    except Exception as _e:",
    "        _marker = '__DSH_RESULT__:FAIL' + chr(10) + '[测试未通过] ' + repr(_e)",
    "    finally:",
    "        sys.stdout = _old",
    "    _dsh_out = _user_output + _t_out.getvalue() + _marker"
  ].join("\n");
}

function handleOutput(text) {
  const isPass = text.includes("__DSH_RESULT__:PASS");
  const isFail = text.includes("__DSH_RESULT__:FAIL");
  const isRunErr = text.includes("[运行错误]");
  const display = text
    .split("\n")
    .filter((l) => l.indexOf("__DSH_RESULT__") === -1)
    .join("\n");
  els.outputPre.textContent = display || "(无输出)";

  if (isPass) {
    showResult("pass", "回答正确！", "测试全部通过，你已经掌握了这个知识点 🎉");
    markSolved(QUESTIONS[currentIndex].id);
  } else if (isFail) {
    showResult("fail", "未通过测试", "运行结果与预期不符，看看下方输出与知识点详解再试试。");
  } else if (isRunErr) {
    showResult("error", "运行出错", "代码在运行时抛出了异常，请查看下面的错误提示。");
  } else {
    showResult("warn", "没有判分结果", "程序结束了，但没有触发测试。");
  }
  openExplanation();
}

async function handleRun() {
  const q = QUESTIONS[currentIndex];
  const code = els.editor.value;

  if (code.includes("___")) {
    showResult("warn", "还有未补全的代码", "请把代码中所有的 ___ 都替换成你的答案后再运行。");
    els.outputPre.textContent = "代码里仍存在 ___ 空白占位符。";
    return;
  }

  els.runBtn.disabled = true;
  els.runBtn.textContent = "运行中…";
  els.pyOverlay.classList.remove("hidden");

  try {
    const py = await ensurePyodide();
    const program = buildProgram(code, q.test);
    py.runPython(program);
    const result = py.runPython("_dsh_out");
    handleOutput(typeof result === "string" ? result : String(result));
  } catch (e) {
    els.outputPre.textContent =
      "【环境加载失败】" + (e && e.message ? e.message : e) +
      "\n\n请检查网络连接后重试（首次运行需要联网加载 Python 环境）。";
    showResult("error", "运行环境不可用", "无法加载 Python 运行时，请确认网络后重试。");
  } finally {
    els.runBtn.disabled = false;
    els.runBtn.textContent = "▶ 运行代码";
    els.pyOverlay.classList.add("hidden");
  }
}

function markSolved(id) {
  if (solved.has(id)) return;
  solved.add(id);
  saveSolved();
  updateProgress();
  renderSidebar();
}

function toggleFavorite(id) {
  if (favorites.has(id)) {
    favorites.delete(id);
  } else {
    favorites.add(id);
  }
  saveFavorites();
  updateFavButton();
  updateFavUI();
  // 收藏夹模式下取消收藏后，需要刷新题目列表
  if (favoritesOnly) {
    renderSidebar();
    renderQuestion();
  }
}

/* ================= 事件绑定 ================= */
function bindEvents() {
  els.runBtn.addEventListener("click", handleRun);
  els.favBtn.addEventListener("click", () => {
    toggleFavorite(QUESTIONS[currentIndex].id);
  });
  els.favToggle.addEventListener("click", () => {
    favoritesOnly = !favoritesOnly;
    renderSidebar();
    renderQuestion();
  });
  els.emptyBackBtn.addEventListener("click", () => {
    favoritesOnly = false;
    renderSidebar();
    renderQuestion();
  });
  els.editor.addEventListener("input", () => {
    edits[QUESTIONS[currentIndex].id] = els.editor.value;
    updateGutter();
  });
  els.editor.addEventListener("scroll", () => {
    els.gutter.scrollTop = els.editor.scrollTop;
  });
  els.editor.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const s = els.editor.selectionStart;
      const en = els.editor.selectionEnd;
      els.editor.value =
        els.editor.value.substring(0, s) + "    " + els.editor.value.substring(en);
      els.editor.selectionStart = els.editor.selectionEnd = s + 4;
      edits[QUESTIONS[currentIndex].id] = els.editor.value;
      updateGutter();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleRun();
    }
  });

  els.hintBtn.addEventListener("click", () => {
    els.hintBox.textContent = "💡 " + QUESTIONS[currentIndex].hint;
    els.hintBox.classList.remove("hidden");
  });

  els.solutionBtn.addEventListener("click", () => {
    const q = QUESTIONS[currentIndex];
    els.editor.value = q.solution;
    edits[q.id] = q.solution;
    updateGutter();
    openExplanation();
  });

  els.resetQBtn.addEventListener("click", () => {
    const q = QUESTIONS[currentIndex];
    delete edits[q.id];
    els.editor.value = q.code;
    updateGutter();
    resetResultUI();
  });

  els.clearOutput.addEventListener("click", () => {
    els.outputPre.textContent = "— 输出已清空 —";
  });

  els.toggleExplanation.addEventListener("click", () => {
    const open = els.explanationPanel.classList.toggle("open");
    els.toggleExplanation.textContent = open ? "收起" : "展开";
  });

  els.copySolution.addEventListener("click", () => {
    const code = QUESTIONS[currentIndex].solution;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(() => {
        els.copySolution.textContent = "已复制";
        setTimeout(() => (els.copySolution.textContent = "复制"), 1200);
      });
    }
  });

  els.prevBtn.addEventListener("click", () => goStep(-1));
  els.nextBtn.addEventListener("click", () => goStep(1));

  els.jumpBtn.addEventListener("click", () => jumpToQuestion(els.jumpInput.value));
  els.jumpInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      jumpToQuestion(els.jumpInput.value);
    }
  });
  els.jumpInput.addEventListener("input", () => {
    els.jumpInput.classList.remove("invalid");
  });

  els.resetBtn.addEventListener("click", () => {
    if (!confirm("确定要清空所有本地进度吗？")) return;
    solved = new Set();
    saveSolved();
    Object.keys(edits).forEach((k) => delete edits[k]);
    updateProgress();
    renderSidebar();
    renderQuestion();
  });
}

function goStep(delta) {
  const list = getFiltered();
  const idx = list.findIndex((q) => q.id === QUESTIONS[currentIndex].id);
  if (idx === -1) return;
  const next = idx + delta;
  if (next < 0 || next >= list.length) return;
  currentIndex = QUESTIONS.indexOf(list[next]);
  renderQuestion();
}

function jumpToQuestion(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1 || n > QUESTIONS.length) {
    els.jumpInput.classList.add("invalid");
    els.jumpInput.focus();
    return;
  }
  els.jumpInput.classList.remove("invalid");
  // 直接跳到指定题号：重置筛选，保证目标题可见、上一题/下一题按全量顺序走
  favoritesOnly = false;
  diffFilter = "all";
  const idx = QUESTIONS.findIndex((q) => q.id === n);
  if (idx !== -1) currentIndex = idx;
  els.jumpInput.value = "";
  renderQuestion();
}

/* ================= 初始化 ================= */
function init() {
  els.jumpInput.max = QUESTIONS.length;
  updateProgress();
  renderSidebar();
  renderQuestion();
  bindEvents();
}

init();
