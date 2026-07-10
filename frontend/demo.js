'use strict';

// ---------------------------------------------------------------------------
// Opt-in guided demo / auto-tour — for screen recordings.
//
// Does NOTHING to the normal experience except add a small floating "▶ Demo"
// button in the corner. Click it (or load the page with ?demo=1 / #demo) and
// the dashboard drives itself: it scrolls through each section, spotlights it,
// shows a caption, and exercises the real filters & search so you can just hit
// record and watch. Press Esc (or the Stop button) to stop at any time.
//
// Self-contained: injects its own CSS, talks only to existing DOM + the same
// event handlers app.js already listens for. No app.js changes required.
// ---------------------------------------------------------------------------

(function () {
  // -------------------------------------------------------------------------
  // The script. Each step spotlights an element and shows a caption; some
  // steps also perform an action (set a filter, type a search, click a button).
  // `ms` is how long to dwell on the step before moving on.
  // -------------------------------------------------------------------------
  const STEPS = [
    {
      sel: '.site-header',
      ms: 6000,
      caption:
        'Developer Feedback Dashboard — a local, zero-dependency app that ' +
        'monitors PUBLIC developer feedback about six AI / ML providers.',
    },
    {
      sel: '#exec-summary-body',
      ms: 6500,
      caption:
        'The Executive Summary is generated from the data: total items, how ' +
        'many are complaints, and the top issues — refreshed daily.',
    },
    {
      sel: '#stat-cards',
      ms: 4500,
      caption: 'Headline stat cards: total feedback, broken down per provider.',
    },
    {
      sel: '#chart-type',
      ms: 4500,
      caption: 'Feedback by type — complaints vs. questions, requests and praise.',
    },
    {
      sel: '#tc-type',
      ms: 6000,
      action: { type: 'select', value: 'question' },
      caption:
        'Pick a feedback type — here, Questions — and the chart re-renders to ' +
        'show what THAT type is about, broken down by issue category.',
    },
    {
      sel: '#chart-type-category',
      ms: 4000,
      caption: 'Each bar is an issue category for the selected feedback type.',
    },
    {
      sel: '#filters-heading',
      ms: 5000,
      caption:
        'The Explore area — filter the whole dataset by platform, type, source, ' +
        'sentiment, verification, date or keyword.',
    },
    {
      sel: '#filter-platform',
      ms: 4500,
      action: { type: 'select', value: 'openai' },
      caption:
        'Pick a product — say OpenAI — and the chart, stats and list below all ' +
        'update instantly.',
    },
    {
      sel: '#fv-chart',
      ms: 5500,
      caption:
        'The live chart shows the selected product broken down by issue category ' +
        '(or a product-by-product comparison when "All platforms" is selected).',
    },
    {
      sel: '#fv-stats',
      ms: 5500,
      caption:
        'Per-product stats: total, complaints, verified count, top category, and ' +
        'a heuristic concern score.',
    },
    {
      sel: '#filter-q',
      ms: 5500,
      action: { type: 'type', value: 'rate limit' },
      caption: 'Full-text search runs across both the summary and the original text.',
    },
    {
      sel: '#trend-breakdown',
      ms: 6000,
      action: { type: 'select', value: 'category' },
      caption:
        'In Trends over time, switch the breakdown from Provider to Category — ' +
        'the lines re-render to show which KIND of problem is trending.',
    },
    {
      sel: '#chart-breakdown',
      ms: 4000,
      caption: 'Each line is one issue category, charted month over month.',
    },
    {
      sel: '#comparison-table',
      ms: 5000,
      caption:
        'Provider comparison — complaint counts per category, side by side.',
    },
    {
      sel: '#health-cards',
      ms: 5500,
      caption:
        'Provider health — a concern score per provider from feedback volume, ' +
        'verified downtime and recent momentum, with a spike marker.',
    },
    {
      sel: '#chart-sentiment',
      ms: 4500,
      caption: 'Sentiment over time — how the tone of feedback shifts each month.',
    },
    {
      sel: '#card-grid .card',
      ms: 6000,
      waitBefore: 900,
      caption:
        'Every result is a card: summary, category & verified badges, and a ' +
        'link to the PUBLIC source — every claim is cited.',
    },
    {
      sel: '.feedback-actions',
      ms: 4500,
      caption: 'Export the current, filtered view as CSV or JSON for reporting.',
    },
    {
      sel: '#reset-filters',
      ms: 3500,
      action: { type: 'click' },
      caption: 'Reset clears every filter and brings back the full dataset.',
    },
    {
      sel: '.site-header',
      ms: 6000,
      caption:
        'All running locally, zero dependencies, with a full test suite. ' +
        'Thanks for watching!',
    },
  ];

  // -------------------------------------------------------------------------
  // Tiny helpers
  // -------------------------------------------------------------------------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const qs = (sel) => document.querySelector(sel);
  let running = false;
  let stopRequested = false;

  function injectStyles() {
    if (document.getElementById('demo-styles')) return;
    const css = `
      #demo-launch {
        position: fixed; right: 18px; bottom: 18px; z-index: 9998;
        font: 600 14px/1 system-ui, sans-serif; color: #fff;
        background: #6c8cff; border: none; border-radius: 999px;
        padding: 11px 16px; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.25);
        transition: transform .15s ease, background .15s ease;
      }
      #demo-launch:hover { background: #5878f0; transform: translateY(-1px); }
      #demo-launch[hidden] { display: none; }

      #demo-record {
        position: fixed; right: 18px; bottom: 62px; z-index: 9998;
        font: 600 14px/1 system-ui, sans-serif; color: #fff;
        background: #ef4444; border: none; border-radius: 999px;
        padding: 11px 16px; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.25);
        transition: transform .15s ease, background .15s ease;
      }
      #demo-record:hover { background: #dc2626; transform: translateY(-1px); }
      #demo-record[hidden] { display: none; }

      #demo-overlay {
        position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%);
        z-index: 10000; width: min(760px, calc(100vw - 40px));
        background: rgba(17, 24, 39, .96); color: #f8fafc;
        border: 1px solid rgba(255,255,255,.12); border-radius: 14px;
        box-shadow: 0 12px 40px rgba(0,0,0,.45);
        padding: 16px 18px 14px; backdrop-filter: blur(4px);
        font: 15px/1.5 system-ui, sans-serif;
      }
      #demo-overlay .demo-row {
        display: flex; align-items: center; gap: 12px; margin-bottom: 9px;
      }
      #demo-overlay .demo-step { font: 700 12px/1 system-ui; letter-spacing:.04em;
        text-transform: uppercase; color: #93a4c8; white-space: nowrap; }
      #demo-overlay .demo-stop {
        margin-left: auto; border: 1px solid rgba(255,255,255,.25);
        background: transparent; color: #f8fafc; border-radius: 8px;
        font: 600 12px/1 system-ui; padding: 6px 11px; cursor: pointer;
      }
      #demo-overlay .demo-stop:hover { background: rgba(255,255,255,.12); }
      #demo-caption { margin: 0; }
      #demo-caption strong { color: #fff; }
      #demo-progress { height: 4px; border-radius: 4px; margin-top: 12px;
        background: rgba(255,255,255,.14); overflow: hidden; }
      #demo-progress > span { display: block; height: 100%; width: 0;
        background: #6c8cff; transition: width .4s ease; }

      .demo-spotlight {
        position: relative; z-index: 9997 !important;
        box-shadow: 0 0 0 3px #6c8cff, 0 0 0 9px rgba(108,140,255,.28),
                    0 0 28px rgba(108,140,255,.5) !important;
        border-radius: 10px !important;
        transition: box-shadow .35s ease; scroll-margin: 120px;
      }

      #demo-countdown {
        position: fixed; inset: 0; z-index: 10001; display: flex;
        align-items: center; justify-content: center;
        background: rgba(8, 12, 22, .72); color: #fff;
        font: 800 120px/1 system-ui, sans-serif; backdrop-filter: blur(2px);
      }
      #demo-toast {
        position: fixed; left: 50%; bottom: 110px;
        transform: translateX(-50%) translateY(10px);
        z-index: 10002; max-width: min(560px, calc(100vw - 40px));
        background: #111827; color: #f8fafc;
        border: 1px solid rgba(255,255,255,.16); border-radius: 10px;
        padding: 12px 16px; font: 14px/1.5 system-ui, sans-serif;
        box-shadow: 0 10px 30px rgba(0,0,0,.45);
        opacity: 0; pointer-events: none;
        transition: opacity .2s ease, transform .2s ease;
      }
      #demo-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
      @media (prefers-reduced-motion: reduce) {
        .demo-spotlight { transition: none; }
        #demo-progress > span { transition: none; }
      }
    `;
    const style = document.createElement('style');
    style.id = 'demo-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // -------------------------------------------------------------------------
  // Overlay (caption bar) lifecycle
  // -------------------------------------------------------------------------
  let overlay, captionEl, stepEl, progressEl;

  function buildOverlay() {
    overlay = document.createElement('div');
    overlay.id = 'demo-overlay';
    overlay.setAttribute('role', 'status');
    overlay.innerHTML = `
      <div class="demo-row">
        <span class="demo-step" id="demo-step">Step 1</span>
        <button type="button" class="demo-stop" id="demo-stop">■ Stop (Esc)</button>
      </div>
      <p id="demo-caption"></p>
      <div id="demo-progress"><span></span></div>`;
    document.body.appendChild(overlay);
    captionEl = qs('#demo-caption');
    stepEl = qs('#demo-step');
    progressEl = qs('#demo-progress > span');
    qs('#demo-stop').addEventListener('click', stop);
  }

  function teardownOverlay() {
    if (overlay) overlay.remove();
    overlay = captionEl = stepEl = progressEl = null;
  }

  function clearSpotlight() {
    document.querySelectorAll('.demo-spotlight').forEach((el) =>
      el.classList.remove('demo-spotlight'),
    );
  }

  // -------------------------------------------------------------------------
  // Step actions — all go through the SAME events app.js already listens for.
  // -------------------------------------------------------------------------
  function setSelect(el, value) {
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function typeInto(el, text) {
    el.focus();
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    for (const ch of text) {
      if (stopRequested) return;
      el.value += ch;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(85);
    }
  }

  async function runAction(action, el) {
    if (!action) return;
    if (action.type === 'select') setSelect(el, action.value);
    else if (action.type === 'type') await typeInto(el, action.value);
    else if (action.type === 'click') el.click();
  }

  function spotlight(el) {
    clearSpotlight();
    el.classList.add('demo-spotlight');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // -------------------------------------------------------------------------
  // Runner
  // -------------------------------------------------------------------------
  async function countdown() {
    const c = document.createElement('div');
    c.id = 'demo-countdown';
    document.body.appendChild(c);
    for (const n of [3, 2, 1]) {
      if (stopRequested) break;
      c.textContent = String(n);
      await sleep(750);
    }
    c.remove();
  }

  async function start() {
    if (running) return;
    running = true;
    stopRequested = false;
    qs('#demo-launch').hidden = true;
    const recBtn = qs('#demo-record');
    if (recBtn) recBtn.hidden = true;
    document.addEventListener('keydown', onKey, true);

    buildOverlay();
    captionEl.innerHTML = 'Get ready — recording tip: start your recorder now.';
    await countdown();

    for (let i = 0; i < STEPS.length && !stopRequested; i++) {
      const step = STEPS[i];
      stepEl.textContent = `Step ${i + 1} / ${STEPS.length}`;
      captionEl.innerHTML = step.caption;
      progressEl.style.width = `${Math.round(((i + 1) / STEPS.length) * 100)}%`;

      if (step.waitBefore) await sleep(step.waitBefore);
      if (stopRequested) break;

      const el = qs(step.sel);
      if (el) {
        spotlight(el);
        await sleep(650); // let the smooth-scroll settle before acting
        if (stopRequested) break;
        await runAction(step.action, el);
      }
      await sleep(step.ms);
    }

    finish();
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      stop();
    }
  }

  function stop() {
    stopRequested = true;
  }

  function finish() {
    document.removeEventListener('keydown', onKey, true);
    clearSpotlight();
    teardownOverlay();
    // Restore a clean default state.
    const reset = qs('#reset-filters');
    if (reset) reset.click();
    const breakdown = qs('#trend-breakdown');
    if (breakdown && breakdown.value !== 'platform') setSelect(breakdown, 'platform');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const launch = qs('#demo-launch');
    if (launch) launch.hidden = false;
    const recBtn = qs('#demo-record');
    if (recBtn) recBtn.hidden = false;
    running = false;
  }

  // -------------------------------------------------------------------------
  // Optional screen recording — captures the guided tour to a .webm the browser
  // downloads at the end. Uses getDisplayMedia (needs a user gesture + the
  // browser's "choose what to share" prompt) + MediaRecorder. If the user
  // cancels the share prompt, nothing happens.
  // -------------------------------------------------------------------------
  let mediaRecorder = null;
  let recordedChunks = [];

  // On-page message that works even where alert() is suppressed (e.g. embedded
  // preview panes). Auto-dismisses.
  function showToast(msg, ms = 5000) {
    let t = document.getElementById('demo-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'demo-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), ms);
  }

  function pickRecorderOptions() {
    const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (const m of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return { mimeType: m };
    }
    return undefined;
  }

  function timestamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function startWithRecording() {
    if (running) return;

    // Immediate feedback so a click is never "nothing happening".
    showToast('Starting recording… choose a source and click “Share”.', 8000);

    // Feature / context checks with clear feedback instead of failing silently.
    if (!window.isSecureContext) {
      showToast('Recording needs a secure page. Open http://localhost:3000 in a real browser (not a preview pane).', 9000);
      return;
    }
    if (!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)) {
      showToast('This view can’t record the screen. Open http://localhost:3000 in Chrome, Edge or Firefox — not the VS Code preview.', 9000);
      return;
    }

    // One call, minimal options. `preferCurrentTab` pre-selects this tab on
    // Chromium and is harmlessly ignored elsewhere. A single call keeps the
    // user gesture valid (a retry after an await can lose it).
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
        preferCurrentTab: true,
      });
    } catch (err) {
      // NotAllowedError = the user dismissed/denied the picker: stay silent.
      if (err && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
        showToast('Recording cancelled.', 3000);
        return;
      }
      console.error('[demo] recording failed:', err);
      showToast('Could not start recording: ' + (err && err.message ? err.message : String(err)), 9000);
      return;
    }

    showToast('Recording… the demo is playing. Your video downloads when it finishes.', 6000);

    recordedChunks = [];
    try {
      mediaRecorder = new MediaRecorder(stream, pickRecorderOptions());
    } catch (err) {
      mediaRecorder = new MediaRecorder(stream);
    }

    mediaRecorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size) recordedChunks.push(ev.data);
    };
    mediaRecorder.onstop = () => {
      const type = (mediaRecorder && mediaRecorder.mimeType) || 'video/webm';
      const blob = new Blob(recordedChunks, { type });
      if (blob.size) downloadBlob(blob, `dashboard-demo-${timestamp()}.webm`);
      stream.getTracks().forEach((t) => t.stop());
      mediaRecorder = null;
    };

    // If the user ends screen-sharing from the browser's own UI, stop the tour.
    const vtrack = stream.getVideoTracks()[0];
    if (vtrack) vtrack.addEventListener('ended', () => { if (running) stop(); });

    mediaRecorder.start();
    await start(); // runs the tour; resolves when it finishes or is stopped
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  }

  // -------------------------------------------------------------------------
  // Bootstrap: add the launcher button; auto-start on ?demo=1 / #demo.
  // -------------------------------------------------------------------------
  function bootstrap() {
    injectStyles();
    const btn = document.createElement('button');
    btn.id = 'demo-launch';
    btn.type = 'button';
    btn.textContent = '▶ Demo';
    btn.title = 'Play the guided auto-tour (great for screen recordings)';
    btn.addEventListener('click', start);
    document.body.appendChild(btn);

    // Add a "Record" button only where screen capture + MediaRecorder exist.
    if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia && window.MediaRecorder) {
      const rec = document.createElement('button');
      rec.id = 'demo-record';
      rec.type = 'button';
      rec.textContent = '⏺ Record';
      rec.title = 'Record the whole dashboard: click, then choose “This tab” and Share. The demo plays and a .webm downloads at the end.';
      rec.addEventListener('click', startWithRecording);
      document.body.appendChild(rec);
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === '1' || window.location.hash === '#demo') {
      // Small delay so the dashboard has finished its first data load.
      setTimeout(start, 1200);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
