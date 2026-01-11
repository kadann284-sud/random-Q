let QUESTIONS = [];
let METHODS = [];

const state = {
  activeCats: new Set(), // 何も選ばない = 全部
  search: "",
  lastId: null,
  lastMethodId: null
};

// DOM
const catChips = document.getElementById("catChips");
const searchBox = document.getElementById("searchBox");
const btnNext = document.getElementById("btnNext");
const btnAnother = document.getElementById("btnAnother");
const btnCopy = document.getElementById("btnCopy");
const btnReset = document.getElementById("btnReset");
const qText = document.getElementById("qText");
const qMeta = document.getElementById("qMeta");
const myAnswer = document.getElementById("myAnswer");
const myMemo = document.getElementById("myMemo");
const statusText = document.getElementById("statusText");
const errBox = document.getElementById("errBox");

const methodName = document.getElementById("methodName");
const methodHow = document.getElementById("methodHow");
const methodExample = document.getElementById("methodExample");

// utils
const uniq = (arr) => Array.from(new Set(arr));
const shufflePick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const includesLoose = (s, q) => (s || "").toLowerCase().includes((q || "").toLowerCase());

function showError(msg, detail = "") {
  errBox.style.display = "block";
  errBox.innerHTML = `${msg}${detail ? `<br><br><code>${detail}</code>` : ""}`;
}

function disableAll(disabled) {
  btnNext.disabled = disabled;
  btnAnother.disabled = disabled;
  btnCopy.disabled = disabled;
  btnReset.disabled = disabled;
  searchBox.disabled = disabled;
}

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} の読み込みに失敗: ${res.status}`);
  return res.json();
}

function normalizeQuestion(q) {
  // 旧形式 category: "近況" も受け入れて categories に寄せる（移行ラク）
  let categories = [];
  if (Array.isArray(q.categories)) categories = q.categories;
  else if (typeof q.category === "string" && q.category.trim()) categories = [q.category.trim()];

  // 文字列の空白除去 & 重複除去
  categories = uniq(categories.map(x => String(x).trim()).filter(Boolean));

  return {
    id: q.id,
    q: q.q,
    categories
  };
}

async function initData() {
  const [qData, aData, mData] = await Promise.all([
    loadJSON("./data/questions.json"),
    loadJSON("./data/self_answers.json"),
    loadJSON("./data/methods.json")
  ]);

  const rawQuestions = qData.questions || [];
  const selfAnswers = aData.selfAnswers || [];
  METHODS = mData.methods || [];

  const answerMap = new Map(selfAnswers.map(x => [x.questionId, x.myAnswer]));

  QUESTIONS = rawQuestions.map(normalizeQuestion).map(q => ({
    ...q,
    myAnswer: answerMap.get(q.id) ?? "（未設定）"
  }));

  // バリデーション
  const invalid = QUESTIONS.find(x => !x.id || !x.q);
  if (invalid) {
    showError("questions.json の形式が不正です。", "各質問に id と q が必要です。categories は配列（複数OK）。");
    setPlaceholders("質問データ不正");
    disableAll(true);
    return;
  }

  if (QUESTIONS.length === 0) {
    showError("質問データが0件です。", "data/questions.json の questions に配列を入れてください。");
    setPlaceholders("質問データがありません");
    disableAll(true);
    return;
  }

  if (METHODS.length === 0) {
    showError("会話法データが0件です。", "data/methods.json の methods に配列を入れてください。");
    // 質問だけは動かす
  }

  renderCats();
  updateStatus();

  const item = pickRandom(false);
  if (item) showQuestion(item);
  showMethod(pickMethod(false));
}

function setPlaceholders(msg) {
  qText.textContent = msg;
  myAnswer.textContent = "—";
  methodName.textContent = "—";
  methodHow.textContent = "";
  methodExample.textContent = "";
}

function getAllCategories() {
  return uniq(
    QUESTIONS.flatMap(q => q.categories || [])
  ).sort((a,b)=>a.localeCompare(b,'ja'));
}

function filteredQuestions() {
  let list = QUESTIONS.slice();

  // category filter（選択中カテゴリのどれかに一致すればOK）
  if (state.activeCats.size > 0) {
    list = list.filter(q =>
      (q.categories || []).some(cat => state.activeCats.has(cat))
    );
  }

  // search filter
  if (state.search.trim()) {
    const s = state.search.trim();
    list = list.filter(q =>
      includesLoose(q.q, s) ||
      (q.categories || []).some(c => includesLoose(c, s)) ||
      includesLoose(q.myAnswer, s)
    );
  }

  return list;
}

function renderCats() {
  const cats = getAllCategories();
  catChips.innerHTML = "";

  // "全部"
  const allChip = document.createElement("button");
  allChip.className = "chip";
  allChip.type = "button";
  allChip.textContent = "全部";
  allChip.setAttribute("aria-pressed", state.activeCats.size === 0 ? "true" : "false");
  allChip.addEventListener("click", () => {
    state.activeCats.clear();
    renderCats();
    updateStatus();
  });
  catChips.appendChild(allChip);

  cats.forEach(cat => {
    const b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.textContent = cat;
    b.setAttribute("aria-pressed", state.activeCats.has(cat) ? "true" : "false");
    b.addEventListener("click", () => {
      if (state.activeCats.has(cat)) state.activeCats.delete(cat);
      else state.activeCats.add(cat);
      renderCats();
      updateStatus();
    });
    catChips.appendChild(b);
  });
}

function updateStatus() {
  const total = QUESTIONS.length;
  const f = filteredQuestions().length;

  statusText.textContent =
    `対象：${f} / ${total} 件（カテゴリ${state.activeCats.size === 0 ? "：全部" : `：${Array.from(state.activeCats).join("・")}`}）`;

  const noHit = (f === 0);
  btnAnother.disabled = noHit;
  btnNext.disabled = noHit;
  btnCopy.disabled = (state.lastId === null);
}

function showQuestion(item) {
  state.lastId = item.id;
  qText.textContent = item.q;

  // バッジ（カテゴリ複数）
  qMeta.innerHTML = "";
  (item.categories || []).forEach(cat => {
    const b = document.createElement("span");
    b.className = "badge";
    b.textContent = `カテゴリ：${cat}`;
    qMeta.appendChild(b);
  });

  myAnswer.textContent = item.myAnswer || "（未設定）";
  myMemo.value = "";

  updateStatus();
}

// random question
function pickRandom(excludeLast = true) {
  const list = filteredQuestions();
  if (list.length === 0) return null;

  if (!excludeLast || !state.lastId) return shufflePick(list);

  const withoutLast = list.filter(x => x.id !== state.lastId);
  if (withoutLast.length === 0) return shufflePick(list);

  return shufflePick(withoutLast);
}

// random method
function pickMethod(excludeLast = true) {
  if (!METHODS || METHODS.length === 0) return null;

  if (!excludeLast || !state.lastMethodId) return shufflePick(METHODS);

  const withoutLast = METHODS.filter(m => m.id !== state.lastMethodId);
  if (withoutLast.length === 0) return shufflePick(METHODS);

  return shufflePick(withoutLast);
}

function showMethod(m) {
  if (!m) {
    methodName.textContent = "（会話法 未設定）";
    methodHow.textContent = "";
    methodExample.textContent = "";
    return;
  }
  state.lastMethodId = m.id;
  methodName.textContent = `✅ ${m.name}`;
  methodHow.textContent = `やり方：${m.how || ""}`;
  methodExample.textContent = `例：${m.example || ""}`;
}

// copy
async function copyCurrent() {
  const item = QUESTIONS.find(x => x.id === state.lastId);
  const m = METHODS.find(x => x.id === state.lastMethodId);
  if (!item) return;

  const memo = (myMemo.value || "").trim();
  const cats = (item.categories || []).join(" / ");

  const text =
`【質問】
${item.q}

【カテゴリ】
${cats || "（なし）"}

【自己開示（自分の答え例）】
${item.myAnswer || ""}

【自己開示（自分用）】
${memo ? memo : "（未入力）"}

【会話法（切り口）】
${m ? m.name : "（未設定）"}
${m?.how ? "やり方：" + m.how : ""}
${m?.example ? "例：" + m.example : ""}`;

  try {
    await navigator.clipboard.writeText(text);
    statusText.textContent = "コピーしました！";
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    statusText.textContent = "コピーしました！（互換モード）";
  }
}

// reset
function resetAll() {
  state.activeCats.clear();
  state.search = "";
  state.lastId = null;
  state.lastMethodId = null;

  searchBox.value = "";
  qText.textContent = "🎲 ランダムで出す を押してね";
  qMeta.innerHTML = "";
  myAnswer.textContent = "—";
  myMemo.value = "";

  methodName.textContent = "—";
  methodHow.textContent = "";
  methodExample.textContent = "";

  renderCats();
  updateStatus();
}

// events
searchBox.addEventListener("input", () => {
  state.search = searchBox.value;
  updateStatus();
});

btnNext.addEventListener("click", () => {
  const item = pickRandom(true);
  if (item) showQuestion(item);
  showMethod(pickMethod(true));
});

btnAnother.addEventListener("click", () => {
  const item = pickRandom(true);
  if (item) showQuestion(item);
  showMethod(pickMethod(true));
});

btnCopy.addEventListener("click", copyCurrent);
btnReset.addEventListener("click", resetAll);

// boot
document.addEventListener("DOMContentLoaded", () => {
  disableAll(true);
  qText.textContent = "読み込み中...";
  myAnswer.textContent = "読み込み中...";
  methodName.textContent = "読み込み中...";
  methodHow.textContent = "";
  methodExample.textContent = "";
  statusText.textContent = "";

  initData()
    .then(() => disableAll(false))
    .catch(err => {
      console.error(err);
      showError(
        "データ読み込みに失敗しました。GitHub Pages か ローカルサーバで開いてください。",
        String(err?.message || err)
      );
      setPlaceholders("読み込み失敗");
      disableAll(true);
    });
});
