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
    running = false;
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
