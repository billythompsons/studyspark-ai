var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var MODEL = "@cf/qwen/qwen3-30b-a3b-fp8";
var MAX_TOKENS = 1024;
var hits = /* @__PURE__ */ new Map();
function rateLimited(ip) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1e3;
  const limit = 40;
  let rec = hits.get(ip);
  if (!rec || now - rec.start > windowMs) {
    rec = { start: now, count: 0 };
    hits.set(ip, rec);
  }
  rec.count += 1;
  return rec.count > limit;
}
__name(rateLimited, "rateLimited");
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}
__name(json, "json");
function extractText(res) {
  if (typeof res === "string") return res;
  if (!res || typeof res !== "object") return "";
  if (typeof res.response === "string") return res.response;
  const ch = res.choices && res.choices[0];
  if (ch && ch.message && typeof ch.message.content === "string") return ch.message.content;
  if (ch && typeof ch.text === "string") return ch.text;
  return "";
}
__name(extractText, "extractText");
async function aiChat(env, system, userMessages, opts = {}) {
  const messages = [{ role: "system", content: system }, ...userMessages];
  const res = await env.AI.run(MODEL, {
    messages,
    max_tokens: opts.maxTokens || MAX_TOKENS,
    temperature: opts.temperature ?? 0.7,
    ...opts.responseFormat ? { response_format: opts.responseFormat } : {}
  });
  return extractText(res).trim();
}
__name(aiChat, "aiChat");
var TUTOR_SYSTEM = `You are StudySpark, a friendly expert tutor for high school and college students.
Rules:
- Explain concepts clearly and simply, using examples and analogies.
- Break hard ideas into small steps. Ask a short check-in question at the end of each explanation.
- If the student is stuck, give hints before revealing the answer.
- Keep answers focused and reasonably concise (under 250 words unless the topic needs more).
- Never do the student's graded exam or assignment for them; teach instead.`;
async function handleTutor(env, body) {
  const messages = (body.messages || []).filter((m) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant")).slice(-20).map((m) => ({ role: m.role, content: m.content.slice(0, 4e3) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return json({ error: "Send at least one user message." }, 400);
  }
  const reply = await aiChat(env, TUTOR_SYSTEM, messages);
  return json({ reply });
}
__name(handleTutor, "handleTutor");
var QUIZ_SYSTEM = `You generate study quizzes for students. You MUST respond with ONLY a valid JSON object, no other text.
The JSON object has exactly this shape:
{"questions": [{"q": "question text", "options": ["option A", "option B", "option C", "option D"], "answer": 0, "explanation": "why the answer is correct"}]}
Rules:
- "answer" is the 0-based index of the correct option.
- Each question has exactly 4 options.
- Explanations are 1-2 sentences.
- Questions must test understanding, not just memorization.
- Match the requested difficulty: easy = definitions and basics, medium = application, hard = analysis and edge cases.`;
function validQuiz(obj, count) {
  if (!obj || !Array.isArray(obj.questions) || obj.questions.length === 0) return false;
  if (obj.questions.length > count + 2) return false;
  return obj.questions.every(
    (q) => q && typeof q.q === "string" && q.q.length > 3 && Array.isArray(q.options) && q.options.length === 4 && q.options.every((o) => typeof o === "string") && Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3 && typeof q.explanation === "string"
  );
}
__name(validQuiz, "validQuiz");
async function handleQuiz(env, body) {
  const topic = String(body.topic || "").slice(0, 200).trim();
  const count = Math.min(Math.max(parseInt(body.count, 10) || 5, 1), 10);
  const difficulty = ["easy", "medium", "hard"].includes(body.difficulty) ? body.difficulty : "medium";
  if (!topic) return json({ error: "Topic is required." }, 400);
  const userMsg = `Create a ${count}-question ${difficulty} quiz about: ${topic}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await aiChat(env, QUIZ_SYSTEM, [{ role: "user", content: userMsg }], {
      maxTokens: 2048,
      temperature: 0.8,
      responseFormat: { type: "json_object" }
    });
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const obj = JSON.parse(cleaned);
      if (validQuiz(obj, count)) return json({ quiz: obj.questions.slice(0, count) });
    } catch (_) {
    }
  }
  return json({ error: "Quiz generation failed. Please try again." }, 502);
}
__name(handleQuiz, "handleQuiz");
var PLAN_SYSTEM = `You are StudySpark, an expert study coach. Create a practical day-by-day study plan.
Rules:
- Output plain Markdown. Start with a one-line overview, then one section per day: "## Day N \u2014 <date or weekday>: <focus>".
- Under each day: 2-4 bullet tasks with suggested minutes, and one active-recall activity (quiz, flashcards, teach-back).
- Order topics from foundations to advanced; schedule a review day before the exam.
- Be realistic about daily time (assume 1-2 hours/day unless told otherwise).
- End with 3 exam-day tips.`;
async function handlePlan(env, body) {
  const subjects = String(body.subjects || "").slice(0, 800).trim();
  const examDate = String(body.examDate || "").slice(0, 40).trim();
  const hours = Math.min(Math.max(parseFloat(body.hoursPerDay) || 1.5, 0.5), 8);
  if (!subjects) return json({ error: "Subjects/topics are required." }, 400);
  const userMsg = `Create a study plan for these subjects/topics:
${subjects}
` + (examDate ? `Exam date: ${examDate}.
` : "") + `Available study time: about ${hours} hour(s) per day.`;
  const plan = await aiChat(env, PLAN_SYSTEM, [{ role: "user", content: userMsg }], { maxTokens: 2048, temperature: 0.7 });
  return json({ plan });
}
__name(handlePlan, "handlePlan");
var INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>StudySpark AI \u2014 Your AI Study Copilot</title>
<meta name="description" content="StudySpark AI: an AI tutor, quiz generator, and study planner for students. Built for the ML Empowerment Build Challenge 3.0.">
<style>
  :root{
    --bg:#0b1020; --bg2:#111832; --card:#151d3a; --line:#263059;
    --ink:#eef1ff; --muted:#9aa5cc; --acc:#6c8cff; --acc2:#22d3a5; --warn:#f5a524; --bad:#f0526a;
  }
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:radial-gradient(1200px 600px at 80% -10%,#1b2560 0%,var(--bg) 55%);color:var(--ink);min-height:100vh}
  header{max-width:1080px;margin:0 auto;padding:28px 20px 8px;display:flex;align-items:center;gap:14px}
  .logo{width:46px;height:46px;border-radius:14px;background:linear-gradient(135deg,var(--acc),var(--acc2));display:grid;place-items:center;font-size:24px;font-weight:800;color:#0b1020}
  h1{font-size:24px;margin:0} h1 small{display:block;font-size:13px;color:var(--muted);font-weight:500}
  main{max-width:1080px;margin:0 auto;padding:12px 20px 60px}
  nav.tabs{display:flex;gap:8px;margin:18px 0 22px;flex-wrap:wrap}
  nav.tabs button{border:1px solid var(--line);background:var(--bg2);color:var(--ink);padding:10px 18px;border-radius:999px;font-size:15px;cursor:pointer}
  nav.tabs button[aria-selected="true"]{background:linear-gradient(135deg,var(--acc),#4f63d8);border-color:transparent;font-weight:700}
  .panel{display:none} .panel.active{display:block}
  .card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px;margin-bottom:16px}
  .card h2{margin:0 0 6px;font-size:19px} .card p.sub{color:var(--muted);margin:0 0 14px;font-size:14px}
  label{display:block;font-size:13px;color:var(--muted);margin:10px 0 6px}
  input[type=text],input[type=date],input[type=number],textarea,select{width:100%;background:var(--bg2);border:1px solid var(--line);color:var(--ink);border-radius:10px;padding:11px 12px;font-size:15px}
  textarea{min-height:90px;resize:vertical}
  .row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  @media(max-width:640px){.row{grid-template-columns:1fr}}
  button.primary{background:linear-gradient(135deg,var(--acc),#4f63d8);border:0;color:#fff;font-weight:700;font-size:15px;padding:12px 22px;border-radius:12px;cursor:pointer;margin-top:14px}
  button.primary:disabled{opacity:.55;cursor:wait}
  button.ghost{background:transparent;border:1px solid var(--line);color:var(--ink);padding:8px 14px;border-radius:10px;cursor:pointer;font-size:14px}
  .chatlog{display:flex;flex-direction:column;gap:10px;max-height:420px;overflow:auto;margin:6px 0 4px;padding:4px}
  .msg{max-width:85%;padding:11px 14px;border-radius:14px;line-height:1.5;font-size:15px;white-space:pre-wrap}
  .msg.user{align-self:flex-end;background:linear-gradient(135deg,#4f63d8,#3a4da8)}
  .msg.ai{align-self:flex-start;background:var(--bg2);border:1px solid var(--line)}
  .msg.typing{color:var(--muted);font-style:italic}
  .composer{display:flex;gap:8px;margin-top:10px}
  .composer input{flex:1}
  .composer button{margin-top:0}
  .q{border:1px solid var(--line);border-radius:12px;padding:14px;margin:12px 0;background:var(--bg2)}
  .q h3{margin:0 0 10px;font-size:16px}
  .opt{display:block;width:100%;text-align:left;background:var(--card);border:1px solid var(--line);color:var(--ink);padding:10px 12px;border-radius:10px;margin:6px 0;cursor:pointer;font-size:15px}
  .opt:hover:not(:disabled){border-color:var(--acc)}
  .opt.right{border-color:var(--acc2);background:#0f2f28}
  .opt.wrong{border-color:var(--bad);background:#33141c}
  .opt:disabled{cursor:default;opacity:.85}
  .expl{font-size:14px;color:var(--muted);margin-top:8px;border-top:1px dashed var(--line);padding-top:8px}
  .score{font-size:18px;font-weight:700;margin:14px 0}
  .plan h2{font-size:17px;margin:18px 0 6px;color:var(--acc2)}
  .plan ul{margin:6px 0 12px;padding-left:20px;line-height:1.6}
  .plan p{line-height:1.65}
  .err{color:var(--bad);font-size:14px;margin-top:10px}
  footer{max-width:1080px;margin:0 auto;padding:0 20px 40px;color:var(--muted);font-size:13px}
  footer a{color:var(--acc)}
  .spin{display:inline-block;width:16px;height:16px;border:2px solid var(--line);border-top-color:var(--acc);border-radius:50%;animation:sp 1s linear infinite;vertical-align:-3px;margin-right:8px}
  @keyframes sp{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<header>
  <div class="logo" aria-hidden="true">S</div>
  <h1>StudySpark AI<small>Your AI study copilot \u2014 tutor, quizzes &amp; study plans. Built for the ML Empowerment Build Challenge 3.0.</small></h1>
</header>
<main>
  <nav class="tabs" role="tablist">
    <button role="tab" aria-selected="true" data-tab="tutor">AI Tutor</button>
    <button role="tab" aria-selected="false" data-tab="quiz">Quiz Generator</button>
    <button role="tab" aria-selected="false" data-tab="planner">Study Planner</button>
  </nav>

  <section class="panel active" id="panel-tutor" role="tabpanel">
    <div class="card">
      <h2>Ask your AI tutor anything</h2>
      <p class="sub">Stuck on photosynthesis? Confused by quadratic equations? Ask \u2014 StudySpark explains step by step and checks your understanding.</p>
      <div class="chatlog" id="chatlog" aria-live="polite"></div>
      <div class="composer">
        <input type="text" id="chatinput" placeholder="e.g. Explain how photosynthesis works, simply" maxlength="4000" aria-label="Your question">
        <button class="primary" id="sendbtn">Ask</button>
      </div>
      <div class="err" id="chaterr"></div>
    </div>
  </section>

  <section class="panel" id="panel-quiz" role="tabpanel">
    <div class="card">
      <h2>Generate a practice quiz</h2>
      <p class="sub">Pick any topic. StudySpark writes multiple-choice questions with answers and explanations \u2014 then grades you instantly.</p>
      <label for="qtopic">Topic</label>
      <input type="text" id="qtopic" placeholder="e.g. The French Revolution, Cell biology, Python loops" maxlength="200">
      <div class="row">
        <div><label for="qdiff">Difficulty</label>
          <select id="qdiff"><option>easy</option><option selected>medium</option><option>hard</option></select></div>
        <div><label for="qcount">Questions</label>
          <input type="number" id="qcount" value="5" min="1" max="10"></div>
      </div>
      <button class="primary" id="quizbtn">Generate quiz</button>
      <div class="err" id="quizerr"></div>
    </div>
    <div id="quizout"></div>
  </section>

  <section class="panel" id="panel-planner" role="tabpanel">
    <div class="card">
      <h2>Build your study plan</h2>
      <p class="sub">Tell StudySpark what you need to learn and when the exam is. Get a day-by-day plan with active-recall practice built in.</p>
      <label for="psubjects">Subjects / topics to cover</label>
      <textarea id="psubjects" placeholder="e.g. Biology: cell structure, photosynthesis, genetics. Math: quadratics, trigonometry." maxlength="800"></textarea>
      <div class="row">
        <div><label for="pdate">Exam date (optional)</label><input type="date" id="pdate"></div>
        <div><label for="phours">Study hours per day</label><input type="number" id="phours" value="1.5" min="0.5" max="8" step="0.5"></div>
      </div>
      <button class="primary" id="planbtn">Create my plan</button>
      <div class="err" id="planerr"></div>
    </div>
    <div class="card plan" id="planout" style="display:none"></div>
  </section>
</main>
<footer>
  StudySpark AI \xB7 solo entry by Jonathan Willis for the <a href="https://ml-build-challenge-3.devpost.com" target="_blank" rel="noopener">ML Empowerment Build Challenge 3.0</a>.
  Powered by Qwen3 on Cloudflare Workers AI. No account, no cost, no data stored.
</footer>

<script>
"use strict";
const $ = (id) => document.getElementById(id);

// ---- tabs ----
document.querySelectorAll("nav.tabs button").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll("nav.tabs button").forEach((x) => x.setAttribute("aria-selected", "false"));
    b.setAttribute("aria-selected", "true");
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    $("panel-" + b.dataset.tab).classList.add("active");
  });
});

async function postJSON(path, body) {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || ("Request failed (" + r.status + ")"));
  return data;
}
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

// ---- tutor ----
const history = [];
function addMsg(role, text, isHtml) {
  const d = document.createElement("div");
  d.className = "msg " + role;
  if (isHtml) d.innerHTML = text; else d.textContent = text;
  $("chatlog").appendChild(d);
  $("chatlog").scrollTop = $("chatlog").scrollHeight;
  return d;
}
addMsg("ai", "Hi! I'm StudySpark, your AI tutor. Ask me anything you're learning \u2014 I'll explain it step by step.");
async function sendChat() {
  const input = $("chatinput");
  const text = input.value.trim();
  if (!text) return;
  $("chaterr").textContent = "";
  input.value = "";
  addMsg("user", text);
  history.push({ role: "user", content: text });
  const typing = addMsg("ai", "");
  typing.classList.add("typing");
  typing.innerHTML = '<span class="spin"></span>Thinking\u2026';
  $("sendbtn").disabled = true;
  try {
    const data = await postJSON("/api/tutor", { messages: history });
    typing.classList.remove("typing");
    typing.innerHTML = md(data.reply);
    history.push({ role: "assistant", content: data.reply });
  } catch (e) {
    typing.remove();
    $("chaterr").textContent = e.message;
  } finally {
    $("sendbtn").disabled = false;
  }
}
$("sendbtn").addEventListener("click", sendChat);
$("chatinput").addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });

// ---- quiz ----
let quizState = null;
$("quizbtn").addEventListener("click", async () => {
  const topic = $("qtopic").value.trim();
  $("quizerr").textContent = "";
  $("quizout").innerHTML = "";
  if (!topic) { $("quizerr").textContent = "Please enter a topic."; return; }
  const btn = $("quizbtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>Writing your quiz\u2026';
  try {
    const data = await postJSON("/api/quiz", {
      topic, difficulty: $("qdiff").value, count: parseInt($("qcount").value, 10) || 5,
    });
    quizState = { questions: data.quiz, answers: new Array(data.quiz.length).fill(null) };
    renderQuiz();
  } catch (e) {
    $("quizerr").textContent = e.message;
  } finally {
    btn.disabled = false; btn.textContent = "Generate quiz";
  }
});
function renderQuiz() {
  const out = $("quizout");
  out.innerHTML = "";
  quizState.questions.forEach((q, qi) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = "<h2>Question " + (qi + 1) + " of " + quizState.questions.length + "</h2><p style='font-size:16px'>" + esc(q.q) + "</p>";
    q.options.forEach((opt, oi) => {
      const b = document.createElement("button");
      b.className = "opt";
      b.textContent = opt;
      b.addEventListener("click", () => {
        if (quizState.answers[qi] !== null) return;
        quizState.answers[qi] = oi;
        const btns = card.querySelectorAll(".opt");
        btns.forEach((x, xi) => {
          x.disabled = true;
          if (xi === q.answer) x.classList.add("right");
          else if (xi === oi) x.classList.add("wrong");
        });
        const ex = document.createElement("div");
        ex.className = "expl";
        ex.innerHTML = (oi === q.answer ? "<b>Correct!</b> " : "<b>Not quite.</b> ") + esc(q.explanation);
        card.appendChild(ex);
        maybeScore();
      });
      card.appendChild(b);
    });
    out.appendChild(card);
  });
}
function maybeScore() {
  if (quizState.answers.some((a) => a === null)) return;
  const correct = quizState.answers.filter((a, i) => a === quizState.questions[i].answer).length;
  const d = document.createElement("div");
  d.className = "card score";
  d.textContent = "You scored " + correct + " / " + quizState.questions.length +
    (correct === quizState.questions.length ? " \u2014 perfect!" : correct >= quizState.questions.length / 2 ? " \u2014 nice work!" : " \u2014 keep practicing!");
  $("quizout").appendChild(d);
}

// ---- planner ----
$("planbtn").addEventListener("click", async () => {
  const subjects = $("psubjects").value.trim();
  $("planerr").textContent = "";
  $("planout").style.display = "none";
  if (!subjects) { $("planerr").textContent = "Please list your subjects or topics."; return; }
  const btn = $("planbtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>Building your plan\u2026';
  try {
    const data = await postJSON("/api/plan", {
      subjects, examDate: $("pdate").value, hoursPerDay: parseFloat($("phours").value) || 1.5,
    });
    $("planout").innerHTML = md(data.plan);
    $("planout").style.display = "block";
  } catch (e) {
    $("planerr").textContent = e.message;
  } finally {
    btn.disabled = false; btn.textContent = "Create my plan";
  }
});
// minimal markdown renderer: ## headings, - bullets, **bold**, paragraphs
function md(src) {
  const lines = String(src).split("\\n");
  let html = "", inList = false;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("## ")) {
      if (inList) { html += "</ul>"; inList = false; }
      html += "<h2>" + esc(t.slice(3)) + "</h2>";
    } else if (t.startsWith("# ")) {
      if (inList) { html += "</ul>"; inList = false; }
      html += "<h2>" + esc(t.slice(2)) + "</h2>";
    } else if (/^[-*] /.test(t) || /^\\d+\\.\\s/.test(t)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += "<li>" + inline(t.replace(/^\\d+\\.\\s/, "").replace(/^[-*]\\s/, "")) + "</li>";
    } else if (t === "") {
      if (inList) { html += "</ul>"; inList = false; }
    } else {
      if (inList) { html += "</ul>"; inList = false; }
      html += "<p>" + inline(t) + "</p>";
    }
  }
  if (inList) html += "</ul>";
  return html;
}
function inline(s) { return esc(s).replace(/\\*\\*(.+?)\\*\\*/g, "<b>$1</b>"); }
<\/script>
</body>
</html>
`;
var src_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ip = request.headers.get("cf-connecting-ip") || "local";
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(INDEX_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (url.pathname === "/api/health") {
      return json({ ok: true, model: MODEL });
    }
    if (url.pathname.startsWith("/api/")) {
      if (request.method !== "POST") return json({ error: "POST only." }, 405);
      if (rateLimited(ip)) return json({ error: "Rate limit reached. Try again in an hour." }, 429);
      let body = {};
      try {
        body = await request.json();
      } catch (_) {
        return json({ error: "Invalid JSON body." }, 400);
      }
      try {
        if (url.pathname === "/api/tutor") return await handleTutor(env, body);
        if (url.pathname === "/api/quiz") return await handleQuiz(env, body);
        if (url.pathname === "/api/plan") return await handlePlan(env, body);
        return json({ error: "Unknown endpoint." }, 404);
      } catch (e) {
        return json({ error: "AI service error. Please try again." }, 502);
      }
    }
    return new Response("Not found", { status: 404 });
  }
};

// ../../../../.local/lib/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../.local/lib/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-zUr3vW/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../../../.local/lib/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-zUr3vW/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
