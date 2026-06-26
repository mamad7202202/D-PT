/* ============================================================
   D-PT App Controller
   Handles theme, navigation, quiz flow, rendering, persistence,
   charts (radar/rings/bars) and sharing.
   ============================================================ */

(() => {
  "use strict";

  const LS = {
    theme: "dpt_theme",
    progress: "dpt_progress",
    results: "dpt_results",
  };

  const state = {
    index: 0,
    answers: {},
    report: null,
  };

  // ---------- DOM ----------
  const $ = (s, r = document) => r.querySelector(s);
  const screens = {
    landing: $("#screen-landing"),
    quiz: $("#screen-quiz"),
    loading: $("#screen-loading"),
    results: $("#screen-results"),
  };

  /* ============================================================ THEME */
  function initTheme() {
    const saved = localStorage.getItem(LS.theme);
    const sys = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme(saved || sys);
    $("#themeToggle").addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme");
      setTheme(cur === "dark" ? "light" : "dark");
    });
  }
  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem(LS.theme, t);
    $('meta[name="theme-color"]').setAttribute("content", t === "dark" ? "#070a1f" : "#eef1fb");
  }

  /* ============================================================ NAV */
  function show(name) {
    Object.values(screens).forEach(s => s.classList.remove("active"));
    screens[name].classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ============================================================ PERSIAN NUM */
  const faNum = (s) => String(s).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[d]);

  /* ============================================================ INIT */
  function init() {
    initTheme();
    $("#qTotal").textContent = faNum(QUESTIONS.length);
    $("#qCount").textContent = faNum(QUESTIONS.length);

    // Resume detection
    const prog = loadProgress();
    if (prog && Object.keys(prog.answers).length > 0) {
      $("#resumeBtn").hidden = false;
      $("#resumeBtn").addEventListener("click", () => {
        state.answers = prog.answers;
        state.index = prog.index || 0;
        startQuiz(false);
      });
    }

    $("#startBtn").addEventListener("click", () => {
      state.answers = {};
      state.index = 0;
      localStorage.removeItem(LS.progress);
      startQuiz(true);
    });

    $("#prevBtn").addEventListener("click", () => go(-1));
    $("#nextBtn").addEventListener("click", () => go(1));

    document.addEventListener("keydown", onKey);

    // Restore completed results if present
    const saved = loadResults();
    if (saved) {
      // user has finished before; landing keeps default but they can re-take
    }
  }

  /* ============================================================ QUIZ */
  function startQuiz() {
    show("quiz");
    renderQuestion();
  }

  function renderQuestion() {
    const q = QUESTIONS[state.index];
    const area = $("#questionArea");
    const total = QUESTIONS.length;

    // Progress
    const pct = Math.round((state.index) / total * 100);
    $("#progressBar").style.width = pct + "%";
    $("#qIndex").textContent = faNum(state.index + 1);
    $(".progress-track").setAttribute("aria-valuenow", pct);

    let html = `<div class="q-card">
      <span class="q-dim-tag">${q.dim}</span>
      <h2 class="q-text">${q.text}</h2>
      <div class="options" role="radiogroup" aria-label="گزینه‌ها">`;

    if (q.type === "likert") {
      LIKERT_LABELS.forEach((label, i) => {
        const val = i + 1;
        const sel = state.answers[q.id] === val ? "selected" : "";
        html += optionHTML(label, val, sel, val);
      });
    } else {
      q.options.forEach((opt, i) => {
        const sel = state.answers[q.id] === i ? "selected" : "";
        html += optionHTML(opt.label, i, sel, i + 1);
      });
    }
    html += `</div></div>`;
    area.innerHTML = html;

    // Bind options
    area.querySelectorAll(".option").forEach(el => {
      el.addEventListener("click", () => selectOption(q, Number(el.dataset.val)));
    });

    // Nav buttons
    $("#prevBtn").disabled = state.index === 0;
    updateNextBtn(q);
  }

  function optionHTML(label, val, sel, keyNum) {
    return `<button class="option ${sel}" role="radio" aria-checked="${sel ? "true":"false"}" data-val="${val}">
      <span class="dot"></span>
      <span class="label">${label}</span>
      <span class="key">${faNum(keyNum)}</span>
    </button>`;
  }

  function selectOption(q, val) {
    state.answers[q.id] = val;
    saveProgress();
    renderQuestion();
    // Auto-advance for snappy feel (small delay so selection is visible)
    setTimeout(() => {
      if (state.index < QUESTIONS.length - 1) go(1);
      else updateNextBtn(q);
    }, 240);
  }

  function updateNextBtn(q) {
    const answered = state.answers[q.id] !== undefined;
    const last = state.index === QUESTIONS.length - 1;
    const btn = $("#nextBtn");
    btn.disabled = !answered;
    btn.textContent = last ? "دیدن نتیجه" : "بعدی";
  }

  function go(dir) {
    const ni = state.index + dir;
    if (ni < 0) return;
    if (ni >= QUESTIONS.length) { finish(); return; }
    state.index = ni;
    saveProgress();
    renderQuestion();
  }

  function onKey(e) {
    if (!screens.quiz.classList.contains("active")) return;
    const q = QUESTIONS[state.index];
    const maxKey = q.type === "likert" ? 5 : q.options.length;
    if (e.key >= "1" && e.key <= String(maxKey)) {
      const idx = Number(e.key);
      selectOption(q, q.type === "likert" ? idx : idx - 1);
    } else if (e.key === "Enter") {
      if (!$("#nextBtn").disabled) go(1);
    } else if (e.key === "ArrowLeft") { // RTL: left = next
      if (!$("#nextBtn").disabled) go(1);
    } else if (e.key === "ArrowRight") {
      if (state.index > 0) go(-1);
    }
  }

  /* ============================================================ FINISH */
  function finish() {
    if (Object.keys(state.answers).length < QUESTIONS.length) {
      // jump to first unanswered
      const miss = QUESTIONS.findIndex(q => state.answers[q.id] === undefined);
      if (miss !== -1) { state.index = miss; renderQuestion(); show("quiz"); return; }
    }
    show("loading");
    $("#progressBar").style.width = "100%";

    const texts = ["در حال تحلیل الگوهای رفتاری…","محاسبهٔ ابعاد شخصیتی…","ساختن گزارش اختصاصی…"];
    let ti = 0;
    const tInt = setInterval(() => {
      ti = (ti + 1) % texts.length;
      $("#loadingText").textContent = texts[ti];
    }, 700);

    setTimeout(() => {
      clearInterval(tInt);
      const scores = Engine.computeScores(state.answers);
      state.report = Analysis.build(scores);
      saveResults();
      localStorage.removeItem(LS.progress);
      renderResults();
      show("results");
    }, 2100);
  }

  /* ============================================================ RESULTS RENDER */
  function renderResults() {
    const r = state.report;
    const n = r.scores;
    const root = $("#resultsRoot");

    const radarDims = ["CR","DI","SE","CU","L","AD"];
    const ringDims = ["O","C","S","R"];

    root.innerHTML = `
      <div class="result-hero glass-panel" id="shareCard">
        <p class="result-eyebrow">نوع شناختی شما: <strong>${r.type}</strong></p>
        <h1 class="result-title">${r.archetype}</h1>
        <p class="result-archetype">${r.summary}</p>
      </div>

      <div class="grid-2">
        <div class="card glass-panel">
          <h3>نمودار شخصیت</h3>
          <div class="radar-wrap">${radarSVG(radarDims, n)}</div>
        </div>
        <div class="card glass-panel">
          <h3>شاخص‌های کلیدی</h3>
          <div class="rings">${ringDims.map(d => ringSVG(d, n[d])).join("")}</div>
        </div>
      </div>

      <div class="card glass-panel">
        <h3>تمام ابعاد شخصیتی</h3>
        ${Object.keys(DIMENSIONS).map(k => traitBar(DIMENSIONS[k].fa, n[k])).join("")}
      </div>

      <div class="grid-2">
        <div class="card glass-panel">
          <h3>نقاط قوت کلیدی</h3>
          <ul>${r.strengths.map(s => `<li>${s}</li>`).join("")}</ul>
        </div>
        <div class="card glass-panel">
          <h3>فرصت‌های رشد</h3>
          <ul>${r.growth.map(s => `<li>${s}</li>`).join("")}</ul>
        </div>
      </div>

      <div class="card glass-panel"><h3>سبک کاری</h3><p>${r.workStyle}</p></div>
      <div class="card glass-panel"><h3>سبک یادگیری</h3><p>${r.learningStyle}</p></div>
      <div class="card glass-panel"><h3>پروفایل تصمیم‌گیری</h3><p>${r.decision}</p></div>

      <div class="card glass-panel funny-card">
        <h3>🐉 تحلیل طنزآمیز (بر پایهٔ نتایج واقعی)</h3>
        <ul class="funny-list">${r.funny.map(f => `<li>${f}</li>`).join("")}</ul>
      </div>

      <div class="share-bar">
        <button class="btn btn-primary" id="dlBtn">دانلود کارت نتیجه</button>
        <button class="btn btn-ghost" id="copyBtn">کپی خلاصه</button>
        <button class="btn btn-ghost" id="retakeBtn">انجام دوباره</button>
      </div>
    `;

    // Animate bars & rings after paint
    requestAnimationFrame(() => requestAnimationFrame(animateResults));

    $("#retakeBtn").addEventListener("click", () => {
      state.answers = {}; state.index = 0;
      localStorage.removeItem(LS.results);
      show("landing");
    });
    $("#copyBtn").addEventListener("click", copySummary);
    $("#dlBtn").addEventListener("click", downloadCard);
  }

  function traitBar(name, val) {
    return `<div class="trait">
      <div class="trait-top"><span>${name}</span><span class="val">${faNum(val)}٪ · ${Engine.band(val)}</span></div>
      <div class="trait-bar"><i data-w="${val}"></i></div>
    </div>`;
  }

  function animateResults() {
    document.querySelectorAll(".trait-bar > i").forEach(el => {
      el.style.width = el.dataset.w + "%";
    });
    document.querySelectorAll(".ring-fill").forEach(el => {
      el.style.strokeDashoffset = el.dataset.offset;
    });
  }

  /* ---------- Radar chart (pure SVG) ---------- */
  function radarSVG(dims, n) {
    const size = 280, cx = size/2, cy = size/2, R = 105, steps = dims.length;
    const angle = i => (-Math.PI/2) + (i * 2*Math.PI/steps);
    const point = (i, r) => [cx + r*Math.cos(angle(i)), cy + r*Math.sin(angle(i))];

    // grid rings
    let grid = "";
    [0.25,0.5,0.75,1].forEach(f => {
      const pts = dims.map((_,i)=>point(i, R*f).join(",")).join(" ");
      grid += `<polygon points="${pts}" fill="none" stroke="var(--border)" stroke-width="1"/>`;
    });
    // axes + labels
    let axes = "", labels = "";
    dims.forEach((d,i) => {
      const [x,y] = point(i, R);
      axes += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--border)" stroke-width="1"/>`;
      const [lx,ly] = point(i, R+22);
      labels += `<text x="${lx}" y="${ly}" fill="var(--text-dim)" font-size="11" text-anchor="middle" dominant-baseline="middle">${DIMENSIONS[d].fa}</text>`;
    });
    // data polygon
    const dataPts = dims.map((d,i)=>point(i, R*(n[d]/100)).join(",")).join(" ");

    return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="نمودار رادار شخصیت">
      <defs>
        <linearGradient id="radarFill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="rgba(124,92,255,.5)"/>
          <stop offset="1" stop-color="rgba(54,197,240,.4)"/>
        </linearGradient>
      </defs>
      ${grid}${axes}
      <polygon points="${dataPts}" fill="url(#radarFill)" stroke="#7c5cff" stroke-width="2"/>
      ${dims.map((d,i)=>{const[x,y]=point(i,R*(n[d]/100));return `<circle cx="${x}" cy="${y}" r="3.5" fill="#36c5f0"/>`}).join("")}
      ${labels}
    </svg>`;
  }

  /* ---------- Circular ring indicator ---------- */
  function ringSVG(dim, val) {
    const r = 42, c = 2*Math.PI*r, off = c * (1 - val/100);
    return `<div class="ring">
      <svg width="110" height="110" viewBox="0 0 110 110">
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#36c5f0"/>
          </linearGradient>
        </defs>
        <circle class="ring-track" cx="55" cy="55" r="${r}" fill="none" stroke-width="9"/>
        <circle class="ring-fill" cx="55" cy="55" r="${r}" fill="none" stroke-width="9"
          stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${c.toFixed(1)}" data-offset="${off.toFixed(1)}"/>
        <text x="55" y="55" class="ring-pct" text-anchor="middle" dominant-baseline="central" transform="rotate(90 55 55)">${faNum(val)}</text>
      </svg>
      <div class="ring-label">${DIMENSIONS[dim].fa}</div>
    </div>`;
  }

  /* ============================================================ SHARE */
  function copySummary() {
    const r = state.report;
    const text = `🐉 نتیجهٔ تست شخصیتی D-PT\n\n«${r.archetype}»\nنوع شناختی: ${r.type}\n\n${r.summary}\n\nنقاط قوت:\n- ${r.strengths.join("\n- ")}\n\nتست خودت را انجام بده!`;
    navigator.clipboard.writeText(text)
      .then(() => toast("خلاصه کپی شد ✓"))
      .catch(() => toast("کپی ناموفق بود"));
  }

  /** Download result card as PNG using canvas (no external libs). */
  function downloadCard() {
    const r = state.report;
    const W = 1080, H = 1080;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d");

    // Background gradient
    const g = ctx.createLinearGradient(0,0,W,H);
    g.addColorStop(0,"#0a0e27"); g.addColorStop(.5,"#1a1145"); g.addColorStop(1,"#0c2340");
    ctx.fillStyle = g; ctx.fillRect(0,0,W,H);

    // Glow blobs
    radialGlow(ctx, 250, 250, 360, "rgba(124,92,255,.45)");
    radialGlow(ctx, 850, 820, 380, "rgba(54,197,240,.35)");

    ctx.textAlign = "center"; ctx.direction = "rtl";

    ctx.fillStyle = "#36c5f0"; ctx.font = "bold 40px Vazirmatn, sans-serif";
    ctx.fillText("D-PT · تست شخصیتی اژدها", W/2, 130);

    ctx.fillStyle = "#a8b0d8"; ctx.font = "28px Vazirmatn, sans-serif";
    ctx.fillText("نوع شناختی: " + r.type, W/2, 210);

    // Archetype (wrapped)
    ctx.fillStyle = "#ffffff"; ctx.font = "bold 56px Vazirmatn, sans-serif";
    wrapText(ctx, r.archetype, W/2, 330, W-160, 70);

    // Top dimensions
    const n = r.scores;
    const top = Object.keys(DIMENSIONS)
      .map(k => ({k, v:n[k]})).sort((a,b)=>b.v-a.v).slice(0,5);
    let y = 560;
    ctx.font = "30px Vazirmatn, sans-serif"; ctx.textAlign = "right";
    top.forEach(t => {
      ctx.fillStyle = "#a8b0d8";
      ctx.fillText(DIMENSIONS[t.k].fa, W-130, y);
      // bar
      const bx = 130, bw = 520, bh = 22, by = y-22;
      ctx.fillStyle = "rgba(255,255,255,.1)";
      roundRect(ctx, bx, by, bw, bh, 11); ctx.fill();
      const fg = ctx.createLinearGradient(bx,0,bx+bw,0);
      fg.addColorStop(0,"#7c5cff"); fg.addColorStop(1,"#36c5f0");
      ctx.fillStyle = fg;
      roundRect(ctx, bx, by, bw*(t.v/100), bh, 11); ctx.fill();
      y += 80;
    });

    // Footer
    ctx.textAlign = "center"; ctx.fillStyle = "#6b739f"; ctx.font = "26px Vazirmatn, sans-serif";
    ctx.fillText("نتیجهٔ خودت را بگیر — D-PT", W/2, H-70);

    // Export
    cv.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "D-PT-result.png"; a.click();
      URL.revokeObjectURL(url);
      toast("کارت نتیجه دانلود شد ✓");
    }, "image/png");
  }

  function radialGlow(ctx, x, y, r, color) {
    const g = ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,color); g.addColorStop(1,"transparent");
    ctx.fillStyle = g; ctx.fillRect(0,0,1080,1080);
  }
  function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  function wrapText(ctx, text, x, y, maxW, lh) {
    const words = text.split(" "); let line = ""; const lines = [];
    for (const w of words) {
      const test = line ? line+" "+w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
      else line = test;
    }
    lines.push(line);
    lines.forEach((l,i) => ctx.fillText(l, x, y + i*lh));
  }

  /* ============================================================ TOAST */
  let toastTimer;
  function toast(msg) {
    let el = $(".toast");
    if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
  }

  /* ============================================================ STORAGE */
  function saveProgress() {
    localStorage.setItem(LS.progress, JSON.stringify({ index: state.index, answers: state.answers }));
  }
  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(LS.progress)); } catch { return null; }
  }
  function saveResults() {
    localStorage.setItem(LS.results, JSON.stringify({ answers: state.answers, report: state.report }));
  }
  function loadResults() {
    try { return JSON.parse(localStorage.getItem(LS.results)); } catch { return null; }
  }

  /* ============================================================ BOOT */
  document.addEventListener("DOMContentLoaded", init);
})();
    
