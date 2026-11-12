/* YKI Exam Mirror – dialog practice. Plain JS, no build step. */
(function () {
  'use strict';
  var DATA = window.YKI_DATA, TK = window.YKI_TOOLKIT, TASKS = window.YKI_TASKS, LISTEN = window.YKI_LISTEN || [];
  var view = document.getElementById('view');

  /* ---------------- settings & progress (browser storage) ---------------- */
  var DEF = { rate: 0.85, seconds: 20, showLine: false, english: false, voice: '' };
  function load(key, def) { try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? def : v; } catch (e) { return def; } }
  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
  var S = Object.assign({}, DEF, load('yki_settings', {}));
  var DONE = load('yki_done', {});

  /* ---------------- helpers ---------------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function h(html) { view.innerHTML = html; view.focus({ preventScroll: true }); window.scrollTo(0, 0); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function allDialogs() { var a = []; DATA.themes.forEach(function (t) { t.dialogs.forEach(function (d) { a.push({ t: t, d: d }); }); }); return a; }
  function findDialog(id) { return allDialogs().filter(function (x) { return x.d.id === id; })[0]; }
  var RUN = 0, dlgStop = null;
  function go(hsh) { if ((location.hash || '') === hsh || (hsh === '' && location.hash === '#')) route(); else location.hash = hsh; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function en(text) { return S.english && text ? '<div class="en">' + esc(text) + '</div>' : ''; }

  /* ---------------- speech ---------------- */
  var voices = [];
  function loadVoices() {
    if (!('speechSynthesis' in window)) return;
    voices = speechSynthesis.getVoices().filter(function (v) { return /^sv/i.test(v.lang); });
    var sel = $('#setVoice'); if (!sel) return;
    sel.innerHTML = voices.length ? voices.map(function (v) { return '<option value="' + esc(v.name) + '">' + esc(v.name + ' (' + v.lang + ')' + (v.localService ? '' : ' – online, can be slow')) + '</option>'; }).join('')
      : '<option value="">No Swedish voice on this device</option>';
    var pv = pickVoice(); if (pv) sel.value = pv.name;
    $('#voiceNote').textContent = voices.length ? '' : 'Your device has no Swedish voice. Add one in your system settings (Speech / Text-to-speech, language Swedish) and reload the page.';
  }
  if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  function pickVoice() { return voices.filter(function (v) { return v.name === S.voice; })[0] || voices.filter(function (v) { return /sv-SE/i.test(v.lang) && v.localService; })[0] || voices.filter(function (v) { return v.localService; })[0] || voices.filter(function (v) { return /sv-SE/i.test(v.lang); })[0] || voices[0] || null; }

  function speak(text) {
    return new Promise(function (resolve) {
      if (!('speechSynthesis' in window) || !text) { resolve(); return; }
      if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
      text = String(text).replace(/\[|\]/g, '').replace(/…/g, ',');
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'sv-SE'; u.rate = S.rate; var v = pickVoice(); if (v) u.voice = v;
      var done = false; function fin() { if (!done) { done = true; clearTimeout(guard); resolve(); } }
      u.onend = fin; u.onerror = fin;
      var guard = setTimeout(fin, 2500 + text.length * 120 / S.rate);   // some browsers never fire onend
      speechSynthesis.speak(u);
    });
  }
  function stopSpeech() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }

  /* ---------------- beep ---------------- */
  var actx = null;
  function beep() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + 0.18);
    } catch (e) {}
    return sleep(250);
  }

  /* ---------------- microphone ---------------- */
  var stream = null;
  function getMic() {
    try { AU.pause(); } catch (e) {}
    if (stream) return Promise.resolve(stream);
    if (!navigator.mediaDevices || !window.MediaRecorder) return Promise.resolve(null);
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) { stream = s; return s; }).catch(function () { return null; });
  }
  function releaseMic() { if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; } }

  /* ---------------- views ---------------- */
  var TASKDEF = {
    dialogs: { name: 'Dialoger', en: 'Dialogues', desc: 'Listen to the other person and answer each line.' },
    reagera: { name: 'Reagera', en: 'React', desc: 'React to short everyday situations (about 30 s).', prep: 5, secs: 30 },
    beratta: { name: 'Berätta', en: 'Tell', desc: 'Tell about a topic (about 1 min 20 s).', prep: 40, secs: 80 },
    asikt: { name: 'Din åsikt', en: 'Your opinion', desc: 'Give and explain your opinion (about 1 min 30 s).', prep: 40, secs: 90 }
  };
  function countDone(list) { return list.filter(function (x) { return DONE[x.id]; }).length; }
  function taskCount(key) {
    if (key === 'dialogs') { var a = allDialogs().map(function (x) { return x.d; }); return countDone(a) + ' / ' + a.length + ' done'; }
    return countDone(TASKS[key]) + ' / ' + TASKS[key].length + ' done';
  }

  function catCard(k, icon, name, sub, desc, badge) {
    return '<button class="card task cat" data-k="' + k + '"><span class="badge">' + badge + '</span><b>' + icon + ' ' + name + ' <span class="muted small">' + sub + '</span></b><span class="muted small">' + desc + '</span></button>';
  }
  function home() {
    stopSpeech(); releaseMic();
    var sp = 0, spAll = 0;
    Object.keys(TASKDEF).forEach(function (k) { var l = k === 'dialogs' ? allDialogs().map(function (x) { return x.d; }) : TASKS[k]; sp += countDone(l); spAll += l.length; });
    var W = window.YKI_WRITE || [], M = window.YKI_MAT || [];
    h('<h1>YKI Swedish – Exam Mirror</h1>' +
      '<p class="muted">Practise for the YKI Swedish test, intermediate level (mellannivå): speaking, listening, writing and reading – plus all the study material.</p>' +
      '<div class="card glance"><b style="font-size:18px">📋 The exam at a glance</b>' +
      '<div class="tblwrap"><table class="gtbl"><tr><th>Part</th><th>Time</th><th>What</th></tr>' +
      '<tr><td>Textförståelse <span class="muted">reading</span></td><td>60 min</td><td>A/B/C, rätt/fel, open questions</td></tr>' +
      '<tr><td>Skriftlig framställning <span class="muted">writing</span></td><td>~55 min</td><td>3 texts: message, opinion text, formal message</td></tr>' +
      '<tr><td>Talförståelse <span class="muted">listening</span></td><td>~30 + 10 min</td><td>every recording is played twice</td></tr>' +
      '<tr><td>Muntlig framställning <span class="muted">speaking</span></td><td>~20–25 min</td><td>berätta, dialogues, situations, opinion</td></tr></table></div>' +
      '<p class="small" style="margin:8px 0 0">Bring your <b>passport or ID card</b> (not a driving licence). Phones are collected. Late = no test. Grade 3 or 4 = pass. Never leave a question blank – wrong answers don\'t lose points.</p>' +
      '<div class="row" style="margin-top:10px"><button class="btn primary" id="toGuide">Read the full exam guide ›</button></div></div>' +
      '<div class="grid">' +
      catCard('tala', '🗣', 'Tala', 'Speaking', 'Dialoger, Reagera, Berätta, Din åsikt – answer, get recorded, compare.', sp + ' / ' + spAll + ' done') +
      catCard('listen', '🎧', 'Lyssna', 'Listening', 'Swedish → English → Swedish playlist. Keeps playing in your pocket.', LISTEN.length + ' episodes') +
      catCard('skriva', '✍️', 'Skriva', 'Writing', 'Write the message, e-mail or opinion text, then compare with a model text.', countDone(W) + ' / ' + W.length + ' done') +
      catCard('lasa', '📖', 'Läsa', 'Reading', 'Short texts with questions. Tap a sentence to hear it.', LISTEN.filter(function (x) { return DONE['rd-' + x.id]; }).length + ' / ' + LISTEN.length + ' done') +
      catCard('material', '📚', 'Material', 'Study material', 'The guide, toolkits, key words and memory sheet – as PDF and as talking pages.', M.length + ' items') +
      '</div>' +
      '<div class="notice">Works best in Chrome, Edge or Safari. Allow the microphone when asked. Your recordings and texts stay in your browser – nothing is uploaded.</div>');
    view.querySelectorAll('.task').forEach(function (b) { b.onclick = function () { go('#' + b.dataset.k); }; });
    $('#toGuide').onclick = function () { go('#guide'); };
  }

  function guideView() {
    stopSpeech(); releaseMic();
    h('<p><button class="btn" id="back">← Home</button></p><h1>📋 YKI Swedish – mellannivå: exam guide</h1><div class="card guide">' + (window.YKI_GUIDE || '') + '</div>');
    $('#back').onclick = function () { go(''); };
  }

  function tala() {
    stopSpeech(); releaseMic();
    h('<p><button class="btn" id="back">← Home</button></p><h1>🗣 Tala – Speaking</h1>' +
      '<p class="muted">The four parts of the speaking test. Each part has a <b>Words &amp; toolkit</b> page and exercises. All model answers are built from the toolkit, so learn it first, then practise.</p><div class="grid">' +
      Object.keys(TASKDEF).map(function (k) {
        var t = TASKDEF[k];
        return '<button class="card task" data-k="' + k + '"><span class="badge">' + taskCount(k) + '</span><b>' + t.name + '</b><span class="muted small">' + t.desc + '</span></button>';
      }).join('') + '</div>');
    $('#back').onclick = function () { go(''); };
    view.querySelectorAll('.task').forEach(function (b) { b.onclick = function () { go('#' + b.dataset.k); }; });
  }

  function hub(key) {
    stopSpeech(); releaseMic();
    var t = TASKDEF[key];
    var n = key === 'dialogs' ? allDialogs().length + ' dialogs' : TASKS[key].length + ' tasks';
    h('<p><button class="btn" id="back">← Tala</button></p><h1>' + t.name + '</h1><p class="muted">' + t.desc + '</p>' +
      '<div class="grid">' +
      '<button class="card task" id="goWords"><span class="badge">learn first</span><b>📘 Words &amp; toolkit</b><span class="muted small">The words in the instructions and the ready answers to memorise.</span></button>' +
      '<button class="card task" id="goPractice"><span class="badge">' + taskCount(key) + '</span><b>🎙 Exercises</b><span class="muted small">' + n + ' – answer, get recorded, compare with the model answer.</span></button>' +
      '</div>');
    $('#back').onclick = function () { go('#tala'); };
    $('#goWords').onclick = function () { go('#' + key + '/words'); };
    $('#goPractice').onclick = function () { go('#' + key + '/list'); };
  }

  function bookRef(p) { return p ? ' <span class="pg" title="Page in the book">📖 s. ' + esc(p) + '</span>' : ''; }
  function say(text) { return ' <button class="btn small say" data-t="' + esc(text) + '" aria-label="Listen">🔊</button>'; }
  function hl(text) { return esc(text).replace(/\[([^\]]*)\]/g, '<span class="slot">$1</span>'); }
  function chip(p) { return p ? '<div class="chip">🧰 <span>' + esc(p.l) + (S.english ? ' <i>(' + esc(p.le) + ')</i>' : '') + '</span> → <b>' + hl(p.t) + '</b></div>' : ''; }
  function bindSay() { view.querySelectorAll('.say').forEach(function (b) { b.onclick = function () { speak(b.dataset.t); }; }); }

  function words(key) {
    stopSpeech(); releaseMic();
    var pg = TK.pages[key], t = TASKDEF[key];
    var html = '<p><button class="btn" id="back">← ' + t.name + '</button></p><h1>' + t.name + ' – words &amp; toolkit</h1>' +
      '<p class="muted">' + esc(pg.intro) + '</p>';
    if (pg.steps) {
      html += '<div class="card"><h2 style="margin-top:0">The frame – learn it by heart</h2><ol class="frame">' + pg.steps.map(function (s) {
        return '<li><span class="small muted">' + esc(s[0]) + '</span><div class="sv">' + hl(s[1]) + say(s[1]) + '</div><div class="en">' + esc(s[2]) + '</div></li>';
      }).join('') + '</ol></div>';
    }
    if (pg.rules) html += '<div class="notice"><ul class="tight">' + pg.rules.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul></div>';
    pg.sections.forEach(function (sec, i) {
      html += '<details class="theme"' + (i < 2 ? ' open' : '') + '><summary>' + esc(sec.h) + ' <span class="muted small">– ' + esc(sec.he) + '</span></summary><div class="tk">';
      if (sec.patterns || sec.types) {
        var src = sec.patterns ? TK.patterns : TK.rtypes;
        Object.keys(src).forEach(function (k) {
          var p = src[k];
          html += '<div class="tkrow"><div class="cue">' + esc(p.l) + ' <span class="en">' + esc(p.le) + '</span></div><div class="sv">' + hl(p.t) + say(p.t) + '</div><div class="en">' + esc(p.te) + '</div></div>';
        });
      } else {
        sec.rows.forEach(function (r) { html += '<div class="tkrow"><div class="sv">' + hl(r[0]) + say(r[0].replace(/^Task: /, '')) + '</div><div class="en">' + esc(r[1]) + '</div></div>'; });
      }
      html += '</div></details>';
    });
    html += '<div class="row" style="margin-top:16px"><button class="btn primary" id="toEx">Go to the exercises ›</button></div>';
    h(html);
    bindSay();
    $('#back').onclick = function () { go('#' + key); };
    $('#toEx').onclick = function () { go('#' + key + '/list'); };
  }

  function dialogList() {
    stopSpeech(); releaseMic();
    var html = '<p><button class="btn" id="back">← Dialoger</button></p><h1>Dialoger – exercises</h1><p class="muted">' + allDialogs().length + ' dialogs in 7 themes. Pick one, or let chance decide.</p>' +
      '<div class="row"><button class="btn primary" id="rand">🎲 Random dialog</button><button class="btn" id="randNew">Random – not done yet</button></div>';
    DATA.themes.forEach(function (t, i) {
      var done = t.dialogs.filter(function (d) { return DONE[d.id]; }).length;
      html += '<details class="theme"' + (i === 0 ? ' open' : '') + '><summary>' + t.id + '. ' + esc(t.sv) + ' <span class="muted small">– ' + esc(t.en) + ' · ' + done + '/' + t.dialogs.length + '</span></summary>';
      t.dialogs.forEach(function (d) {
        html += '<button class="dlg-link" data-id="' + d.id + '"><span><b>Dialog ' + d.n + '.</b> ' + esc(d.situation_sv) + (S.english ? '<br><span class="en">' + esc(d.title_en) + '</span>' : '') + '</span><span class="done">' + bookRef(d.page) + ' ' + (DONE[d.id] ? '✓' : '') + '</span></button>';
      });
      html += '</details>';
    });
    h(html);
    $('#back').onclick = function () { go('#dialogs'); };
    view.querySelectorAll('.dlg-link').forEach(function (b) { b.onclick = function () { go('#d/' + b.dataset.id); }; });
    $('#rand').onclick = function () { var a = allDialogs(); go('#d/' + a[Math.floor(Math.random() * a.length)].d.id); };
    $('#randNew').onclick = function () { var a = allDialogs().filter(function (x) { return !DONE[x.d.id]; }); if (!a.length) a = allDialogs(); go('#d/' + a[Math.floor(Math.random() * a.length)].d.id); };
  }

  function examHead(t, d) { return '<div class="head"><span>Dialog ' + d.n + '. ' + esc(t.sv) + '</span><span>' + d.speaker + ' / Du' + bookRef(d.page) + '</span></div>'; }

  function intro(id) {
    var x = findDialog(id); if (!x) { dialogList(); return; }
    var t = x.t, d = x.d;
    h('<p><button class="btn" id="back">← All dialogs</button></p>' +
      '<div class="exam">' + examHead(t, d) + '<div class="body">' +
      '<div class="sit">' + esc(d.situation_sv) + '</div>' + en(d.situation_en) +
      '<p class="muted small">' + d.turns.length + ' lines. For each line: you hear <b>' + esc(d.speaker) + '</b>, then you see what to do in brackets, then you have time to answer (recording).</p>' +
      '<div class="row"><button class="btn primary" id="start">Start the dialog</button><button class="btn" id="peek">Just read the model answers</button></div>' +
      '<p class="muted small" id="micNote"></p></div></div>');
    $('#back').onclick = function () { go('#dialogs/list'); };
    $('#start').onclick = function () { run(t, d); };
    $('#peek').onclick = function () { review(t, d, []); };
  }

  function run(t, d) {
    var recs = [], cancelled = false, idx = 0, myRun = RUN;
    dlgStop = function () { cancelled = true; stopSpeech(); try { stopRecording(); } catch (e) {} clearInterval(stopTimer); };
    var mr = null, chunks = [], stopTimer = null;
    function stopRecording() { if (mr && mr.state === 'recording') mr.stop(); }

    function render(i, phase) {
      var turn = d.turns[i];
      var steps = d.turns.map(function (_, k) { return '<i class="' + (k < i ? 'on' : k === i ? 'cur' : '') + '"></i>'; }).join('');
      h('<div class="exam">' + examHead(t, d) + '<div class="body">' +
        '<div class="small muted">' + esc(d.situation_sv) + '</div><div class="steps">' + steps + '</div>' +
        '<div class="stage" id="stage"></div>' +
        '<div class="row end"><button class="btn" id="quit">Stop</button></div></div></div>');
      $('#quit').onclick = function () { cancelled = true; stopSpeech(); stopRecording(); clearInterval(stopTimer); go('#d/' + d.id); intro(d.id); };
      return $('#stage');
    }

    function listen(stage, turn) {
      if (!turn.other_sv) { stage.innerHTML = '<div class="instr">Du börjar.</div><div class="instr">' + esc(turn.task_sv) + '</div>' + en(turn.task_en); return sleep(1800); }
      stage.innerHTML = '<div class="status"><span class="wave"><i></i><i></i><i></i><i></i></span> Lyssna … <span class="who">' + esc(d.speaker) + '</span></div>' +
        (S.showLine ? '<div class="line">' + esc(turn.other_sv) + '</div>' + en(turn.other_en) : '<div class="line muted">***</div>') +
        '<div class="instr">Du: ' + esc(turn.task_sv) + '</div>' + en(turn.task_en);
      return sleep(400).then(function () { return speak(turn.other_sv); });
    }

    function answer(stage, turn) {
      var secs = turn.seconds || S.seconds;
      return beep().then(function () {
        return new Promise(function (resolve) {
          if (cancelled || myRun !== RUN || !document.body.contains(stage)) { resolve(); return; }
          var left = secs, startT = Date.now();
          stage.innerHTML = '<div class="status"><span class="dot"></span> Svara nu – <span id="left">' + secs + '</span> s</div>' +
            '<div class="instr">Du: ' + esc(turn.task_sv) + '</div>' + en(turn.task_en) +
            '<div class="bar rec"><i id="fill"></i></div>' +
            '<div class="row"><button class="btn primary" id="doneBtn">Klar – next ›</button></div>' +
            (stream ? '' : '<p class="muted small">No microphone – just say your answer aloud.</p>');
          chunks = [];
          if (stream) {
            try { mr = new MediaRecorder(stream); } catch (e) { mr = null; }
          } else mr = null;
          var finished = false;
          function finish() {
            if (finished) return; finished = true; clearInterval(stopTimer);
            if (mr && mr.state === 'recording') {
              mr.onstop = function () { recs.push(chunks.length ? URL.createObjectURL(new Blob(chunks, { type: mr.mimeType || 'audio/webm' })) : null); resolve(); };
              mr.stop();
            } else { recs.push(null); resolve(); }
          }
          if (mr) { mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); }; mr.start(); }
          stopTimer = setInterval(function () {
            var el = (Date.now() - startT) / 1000; left = Math.max(0, Math.ceil(secs - el));
            var l = $('#left'), f = $('#fill'); if (l) l.textContent = left; if (f) f.style.width = Math.min(100, el / secs * 100) + '%';
            if (el >= secs) finish();
          }, 200);
          $('#doneBtn').onclick = finish;
        });
      });
    }

    function next() {
      if (cancelled || myRun !== RUN) return;
      if (idx >= d.turns.length) { DONE[d.id] = 1; save('yki_done', DONE); review(t, d, recs); return; }
      var turn = d.turns[idx], stage = render(idx);
      listen(stage, turn).then(function () { if (cancelled || myRun !== RUN) return; return answer(stage, turn); }).then(function () { if (cancelled || myRun !== RUN) return; idx++; next(); });
    }

    getMic().then(function () {
      var stage = render(0);
      stage.innerHTML = '<div class="sit">' + esc(d.situation_sv) + '</div>' + en(d.situation_en) + '<div class="status muted">Get ready …</div>';
      return sleep(2500);
    }).then(next);
  }

  function review(t, d, recs) {
    stopSpeech(); releaseMic();
    var html = '<div class="exam">' + examHead(t, d) + '<div class="body review">' +
      '<div class="sit">' + esc(d.situation_sv) + '</div>' + en(d.situation_en) +
      '<div class="row" style="margin:12px 0"><button class="btn primary" id="showAll">Show all model answers</button><button class="btn" id="enT">' + (S.english ? 'Hide' : 'Show') + ' English</button></div>';
    d.turns.forEach(function (turn, i) {
      html += '<div class="turn">' +
        (turn.other_sv ? '<div class="line"><span class="who">' + esc(d.speaker) + ':</span> ' + esc(turn.other_sv) + ' <button class="btn small say" data-t="' + esc(turn.other_sv) + '" aria-label="Listen">🔊</button></div>' + en(turn.other_en) : '') +
        '<div class="line"><b>Du:</b> ' + esc(turn.task_sv) + '</div>' + en(turn.task_en) +
        (recs[i] ? '<div class="small muted">🎧 Your answer – listen to yourself:</div><audio controls src="' + recs[i] + '"></audio>' : (recs.length ? '<div class="small muted">(no recording)</div>' : '')) +
        '<div><button class="btn small reveal" data-i="' + i + '">Show model answer</button></div>' +
        '<div class="model hidden" id="m' + i + '"><div class="sv">' + esc(turn.answer_sv) + ' <button class="btn small say" data-t="' + esc(turn.answer_sv) + '" aria-label="Listen">🔊</button></div>' + en(turn.answer_en) + chip(TK.patterns[turn.pattern]) +
        turn.alts.map(function (a) { return '<div class="small" style="margin-top:6px">eller: <b>' + esc(a.sv) + '</b> <button class="btn small say" data-t="' + esc(a.sv) + '">🔊</button></div>' + en(a.en); }).join('') +
        '</div></div>';
    });
    html += '<div class="row" style="margin-top:14px"><button class="btn primary" id="again">Try again</button><button class="btn" id="nextD">Next dialog ›</button><button class="btn" id="list">All dialogs</button></div></div></div>';
    h(html);
    view.querySelectorAll('.reveal').forEach(function (b) { b.onclick = function () { $('#m' + b.dataset.i).classList.remove('hidden'); b.classList.add('hidden'); }; });
    view.querySelectorAll('.say').forEach(function (b) { b.onclick = function () { speak(b.dataset.t); }; });
    $('#showAll').onclick = function () { view.querySelectorAll('.model').forEach(function (m) { m.classList.remove('hidden'); }); view.querySelectorAll('.reveal').forEach(function (b) { b.classList.add('hidden'); }); };
    $('#enT').onclick = function () { S.english = !S.english; save('yki_settings', S); review(t, d, recs); };
    $('#again').onclick = function () { intro(d.id); };
    $('#list').onclick = function () { go('#dialogs/list'); };
    $('#nextD').onclick = function () { var a = allDialogs(), k = a.findIndex(function (x) { return x.d.id === d.id; }); go('#d/' + a[(k + 1) % a.length].d.id); };
  }

  /* ---------------- Reagera / Berätta / Din åsikt ---------------- */
  function themeName(id) { var t = DATA.themes.filter(function (x) { return x.id === id; })[0]; return t ? t.sv : ''; }
  function themeEn(id) { var t = DATA.themes.filter(function (x) { return x.id === id; })[0]; return t ? t.en : ''; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  function findTask(key, id) { return TASKS[key].filter(function (x) { return x.id === id; })[0]; }
  var PREFIX = { reagera: 'r', beratta: 'b', asikt: 'a' };

  function taskList(key) {
    stopSpeech(); releaseMic();
    var t = TASKDEF[key], items = TASKS[key];
    var html = '<p><button class="btn" id="back">← ' + t.name + '</button></p><h1>' + t.name + ' – exercises</h1>';
    if (key === 'reagera') {
      html += '<p class="muted">' + items.length + ' situations. A set is 5 situations, like in the exam: you read and hear the situation, then you have 30 seconds to react.</p>' +
        '<div class="row"><button class="btn primary" id="rand">🎲 Random set of 5</button><button class="btn" id="randNew">5 not done yet</button></div>' +
        '<label class="check" style="display:flex;gap:8px;margin-top:10px"><input type="checkbox" id="reagRead"' + (S.reagRead !== false ? ' checked' : '') + '> Read the situation aloud (turn off to go faster – you read it yourself)</label>';
    } else {
      html += '<p class="muted">' + items.length + ' topics. You get ' + t.prep + ' s to prepare (you can skip), then ' + t.secs + ' s to speak.</p>' +
        '<div class="row"><button class="btn primary" id="rand">🎲 Random topic</button><button class="btn" id="randNew">Random – not done yet</button></div>';
    }
    DATA.themes.forEach(function (th, i) {
      var list = items.filter(function (x) { return x.theme === th.id; });
      if (!list.length) return;
      html += '<details class="theme"' + (i === 0 ? ' open' : '') + '><summary>' + th.id + '. ' + esc(th.sv) + ' <span class="muted small">– ' + esc(th.en) + ' · ' + countDone(list) + '/' + list.length + '</span></summary>';
      if (key === 'reagera') html += '<div class="row" style="margin:6px 0 10px"><button class="btn small primary setBtn" data-th="' + th.id + '">Practise this theme (' + list.length + ')</button></div>';
      list.forEach(function (x) {
        html += '<button class="dlg-link" data-id="' + x.id + '"><span>' + (x.n ? '<b>' + x.n + '.</b> ' : '') + esc(x.sv) + (S.english ? '<br><span class="en">' + esc(x.en) + '</span>' : '') + '</span><span class="done">' + bookRef(x.page) + ' ' + (DONE[x.id] ? '✓' : '') + '</span></button>';
      });
      html += '</details>';
    });
    h(html);
    $('#back').onclick = function () { go('#' + key); };
    if (key === 'reagera') {
      $('#reagRead').onchange = function () { S.reagRead = this.checked; save('yki_settings', S); };
      $('#rand').onclick = function () { runTasks(key, shuffle(items).slice(0, 5)); };
      $('#randNew').onclick = function () { var a = items.filter(function (x) { return !DONE[x.id]; }); if (a.length < 5) a = items; runTasks(key, shuffle(a).slice(0, 5)); };
      view.querySelectorAll('.setBtn').forEach(function (b) { b.onclick = function () { runTasks(key, items.filter(function (x) { return x.theme === +b.dataset.th; })); }; });
      view.querySelectorAll('.dlg-link').forEach(function (b) { b.onclick = function () { runTasks(key, [findTask(key, b.dataset.id)]); }; });
    } else {
      var openT = function (x) { go('#' + PREFIX[key] + '/' + x.id); };
      $('#rand').onclick = function () { openT(items[Math.floor(Math.random() * items.length)]); };
      $('#randNew').onclick = function () { var a = items.filter(function (x) { return !DONE[x.id]; }); if (!a.length) a = items; openT(a[Math.floor(Math.random() * a.length)]); };
      view.querySelectorAll('.dlg-link').forEach(function (b) { b.onclick = function () { openT(findTask(key, b.dataset.id)); }; });
    }
  }

  function kwChips(x) { return x.kw && x.kw.length ? '<div class="kw"><span class="small muted">📌 Book words:</span> ' + x.kw.map(function (k) { return '<span class="kwc"><b>' + esc(k[0]) + '</b> <i>' + esc(k[1]) + '</i></span>'; }).join(' ') + '</div>' : ''; }
  function taskHead(key, x) { return '<div class="head"><span>' + TASKDEF[key].name + ' · ' + esc(themeName(x.theme)) + (x.n ? ' · ' + x.n : '') + '</span><span>' + bookRef(x.page) + '</span></div>'; }
  function questions(x) {
    return '<ul class="qs">' + x.qs.map(function (q, i) { return '<li>' + esc(q) + (S.english ? ' <span class="en">' + esc(x.qs_en[i]) + '</span>' : '') + '</li>'; }).join('') + '</ul>';
  }

  function taskIntro(key, id) {
    var x = findTask(key, id); if (!x) { taskList(key); return; }
    var t = TASKDEF[key];
    h('<p><button class="btn" id="back">← All topics</button></p>' +
      '<div class="exam">' + taskHead(key, x) + '<div class="body">' +
      '<div class="sit">' + esc(x.sv) + '</div>' + en(x.en) + questions(x) +
      '<p class="muted small">You get <b>' + t.prep + ' s</b> to prepare (write 5 key words), then <b>' + t.secs + ' s</b> to speak. Use the frame from the toolkit.</p>' +
      '<div class="row"><button class="btn primary" id="start">Start (timer + recording)</button><button class="btn" id="peek">Just read the model answer</button><button class="btn" id="tk">📘 Toolkit</button></div>' + recBox() + '</div></div>');
    bindRec();
    $('#back').onclick = function () { go('#' + key + '/list'); };
    $('#start').onclick = function () { runTasks(key, [x]); };
    $('#peek').onclick = function () { taskReview(key, [x], []); };
    $('#tk').onclick = function () { go('#' + key + '/words'); };
  }

  /* manual recorder: record yourself any time and listen back */
  function recBox() {
    return '<div class="card recbox" style="margin-top:12px"><b>🎙 Record yourself</b><div class="small muted">Speak your answer, then listen to yourself and compare with the model answer.</div>' +
      '<div class="row" style="margin-top:8px"><button class="btn primary recGo">● Record</button><span class="small recState"></span></div><div class="recOut"></div></div>';
  }
  function bindRec(root) {
    (root || view).querySelectorAll('.recbox').forEach(function (box) {
      var go = box.querySelector('.recGo'), st = box.querySelector('.recState'), out = box.querySelector('.recOut'), mr = null, chunks = [], t0 = 0, iv = null;
      go.onclick = function () {
        if (mr && mr.state === 'recording') { mr.stop(); return; }
        stopSpeech();
        getMic().then(function (s) {
          if (!s) { st.textContent = 'No microphone – allow the microphone for this site in your browser settings.'; return; }
          try { mr = new MediaRecorder(s); } catch (e) { st.textContent = 'Recording is not supported in this browser.'; return; }
          chunks = []; mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
          mr.onstop = function () {
            clearInterval(iv); go.textContent = '● Record again'; go.classList.add('primary'); st.textContent = '';
            var url = URL.createObjectURL(new Blob(chunks, { type: mr.mimeType || 'audio/webm' }));
            out.innerHTML = '<div class="small muted" style="margin-top:6px">Your recording:</div><audio controls src="' + url + '"></audio>';
            var a = out.querySelector('audio'); try { a.play(); } catch (e) {}
            releaseMic();
          };
          mr.start(); t0 = Date.now(); go.textContent = '■ Stop'; go.classList.remove('primary');
          iv = setInterval(function () { st.innerHTML = '<span class="dot"></span> Recording … ' + Math.floor((Date.now() - t0) / 1000) + ' s'; }, 250);
        });
      };
    });
  }

  /* one generic recorder: returns a Promise of a blob URL (or null) */
  function recordFor(stage, secs, topHtml, btnLabel) {
    return beep().then(function () {
      return new Promise(function (resolve) {
        if (!document.body.contains(stage)) { resolve(null); return; }
        var startT = Date.now(), chunks = [], mr = null, finished = false, timer;
        stage.innerHTML = '<div class="status"><span class="dot"></span> ' + (stream ? '🎙 Recording – ' : '') + 'Svara nu – <span id="left">' + secs + '</span> s</div>' + topHtml +
          '<div class="bar rec"><i id="fill"></i></div>' +
          '<div class="row"><button class="btn primary" id="doneBtn">' + (btnLabel || 'Klar – next ›') + '</button></div>' +
          (stream ? '' : '<p class="muted small">No microphone – just say your answer aloud.</p>');
        if (stream) { try { mr = new MediaRecorder(stream); } catch (e) { mr = null; } }
        function finish() {
          if (finished) return; finished = true; clearInterval(timer); activeStop = null;
          if (mr && mr.state === 'recording') {
            mr.onstop = function () { resolve(chunks.length ? URL.createObjectURL(new Blob(chunks, { type: mr.mimeType || 'audio/webm' })) : null); };
            mr.stop();
          } else resolve(null);
        }
        activeStop = function () { finished = true; clearInterval(timer); if (mr && mr.state === 'recording') mr.stop(); };
        if (mr) { mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); }; mr.start(); }
        timer = setInterval(function () {
          var el = (Date.now() - startT) / 1000;
          var l = $('#left'), f = $('#fill'); if (l) l.textContent = Math.max(0, Math.ceil(secs - el)); if (f) f.style.width = Math.min(100, el / secs * 100) + '%';
          if (el >= secs) finish();
        }, 200);
        $('#doneBtn').onclick = finish;
      });
    });
  }
  var activeStop = null;

  function prepFor(stage, secs, topHtml) {
    return new Promise(function (resolve) {
      if (!document.body.contains(stage)) { resolve(); return; }
      var startT = Date.now(), timer, done = false;
      stage.innerHTML = '<div class="status">⏳ Förbered dig – <span id="left">' + secs + '</span> s</div>' + topHtml +
        '<div class="bar"><i id="fill"></i></div><div class="row"><button class="btn primary" id="skip">I\'m ready – start speaking ›</button></div>';
      function fin() { if (done) return; done = true; clearInterval(timer); resolve(); }
      timer = setInterval(function () {
        var el = (Date.now() - startT) / 1000;
        var l = $('#left'), f = $('#fill'); if (!l) { fin(); return; }
        l.textContent = Math.max(0, Math.ceil(secs - el)); f.style.width = Math.min(100, el / secs * 100) + '%';
        if (el >= secs) fin();
      }, 200);
      $('#skip').onclick = fin;
    });
  }

  function runTasks(key, items) {
    var t = TASKDEF[key], recs = [], idx = 0, cancelled = false, myRun = RUN;
    function render(i) {
      var x = items[i];
      var steps = items.length > 1 ? '<div class="steps">' + items.map(function (_, k) { return '<i class="' + (k < i ? 'on' : k === i ? 'cur' : '') + '"></i>'; }).join('') + '</div>' : '';
      h('<div class="exam">' + taskHead(key, x) + '<div class="body">' + steps +
        '<div class="stage" id="stage"></div><div class="row end"><button class="btn" id="quit">Stop</button></div></div></div>');
      $('#quit').onclick = function () { cancelled = true; stopSpeech(); if (activeStop) activeStop(); go('#' + key + '/list'); taskList(key); };
      return $('#stage');
    }
    function top(x) { return '<div class="sit">' + esc(x.sv) + '</div>' + en(x.en) + kwChips(x) + (x.qs ? questions(x) : ''); }
    function next() {
      if (cancelled || myRun !== RUN) return;
      if (idx >= items.length) { items.forEach(function (x) { DONE[x.id] = 1; }); save('yki_done', DONE); taskReview(key, items, recs); return; }
      var x = items[idx], stage = render(idx), p;
      if (key === 'reagera') {
        var readIt = S.reagRead !== false;
        stage.innerHTML = '<div class="status">' + (readIt ? '<span class="wave"><i></i><i></i><i></i><i></i></span> ' : '📄 ') + 'Situation ' + (idx + 1) + ' / ' + items.length + '</div>' + top(x) +
          '<div class="row"><button class="btn primary" id="skipRead">' + (readIt ? 'Skip reading – answer now ›' : 'Start answering ›') + '</button></div>';
        p = new Promise(function (res) {
          var done = false; function go() { if (done) return; done = true; stopSpeech(); res(); }
          $('#skipRead').onclick = go;
          var w = readIt ? sleep(400).then(function () { return done ? null : speak(x.sv); }) : Promise.resolve();
          w.then(function () { if (!done && !cancelled && myRun === RUN) return sleep((readIt ? t.prep : 8) * 1000); }).then(go);
        });
      } else {
        p = prepFor(stage, t.prep, top(x));
      }
      p.then(function () { if (cancelled || myRun !== RUN) return; return recordFor(stage, t.secs, top(x), idx < items.length - 1 ? 'Klar – next ›' : 'Klar ›'); })
       .then(function (url) { if (cancelled || myRun !== RUN) return; recs.push(url); idx++; next(); });
    }
    getMic().then(function () {
      var stage = render(0);
      stage.innerHTML = '<div class="sit">' + (items.length > 1 ? items.length + ' situations' : esc(items[0].sv)) + '</div><div class="status muted">Get ready …</div>';
      return sleep(2000);
    }).then(next);
  }

  function sentences(text) { return text.match(/[^.!?]+[.!?]+/g) || [text]; }

  function taskReview(key, items, recs) {
    stopSpeech(); releaseMic();
    var t = TASKDEF[key], pg = TK.pages[key];
    var html = '<div class="exam"><div class="head"><span>' + t.name + ' – compare</span><span>' + items.length + (items.length > 1 ? ' tasks' : ' task') + '</span></div><div class="body review">' +
      '<div class="row" style="margin:0 0 12px"><button class="btn primary" id="showAll">Show ' + (items.length > 1 ? 'all model answers' : 'model answer') + '</button><button class="btn" id="enT">' + (S.english ? 'Hide' : 'Show') + ' English</button></div>';
    items.forEach(function (x, i) {
      html += '<div class="turn"><div class="small muted">' + esc(themeName(x.theme)) + (x.n ? ' · ' + x.n : '') + bookRef(x.page) + '</div><div class="sit">' + esc(x.sv) + say(x.sv) + '</div>' + en(x.en) + kwChips(x) + (x.qs ? questions(x) : '') +
        (recs[i] ? '<div class="small muted">🎧 Your answer – listen to yourself:</div><audio controls src="' + recs[i] + '"></audio>' : (recs.length ? '<div class="small muted">(no recording)</div>' : '')) +
        '<div><button class="btn small reveal" data-i="' + i + '">Show model answer</button></div><div class="model hidden" id="m' + i + '">';
      if (key === 'reagera') {
        html += '<div class="sv">' + esc(x.answer_sv) + say(x.answer_sv) + '</div>' + en(x.answer_en) + chip(TK.rtypes[x.type]);
      } else {
        var sv = sentences(x.answer_sv), ev = sentences(x.answer_en);
        html += '<div class="small muted">Model answer – sentence by sentence (built on the frame):</div><ol class="sents">' + sv.map(function (s, k) {
          return '<li><span class="sv">' + esc(s.trim()) + '</span>' + say(s.trim()) + (S.english && ev[k] ? '<div class="en">' + esc(ev[k].trim()) + '</div>' : '') + '</li>';
        }).join('') + '</ol><div class="row"><button class="btn small say" data-t="' + esc(x.answer_sv) + '">🔊 Listen to it all</button></div>' +
          '<details class="frameBox"><summary>🧰 The frame</summary><ol class="frame">' + pg.steps.map(function (s) { return '<li><span class="small muted">' + esc(s[0]) + ':</span> <span class="sv">' + hl(s[1]) + '</span></li>'; }).join('') + '</ol></details>';
      }
      html += '</div>' + recBox() + '</div>';
    });
    var single = items.length === 1 && key !== 'reagera';
    html += '<div class="row" style="margin-top:14px"><button class="btn primary" id="again">Try again</button>' +
      '<button class="btn" id="nextT">' + (key === 'reagera' ? 'Next situation ›' : 'Next topic ›') + '</button><button class="btn" id="list">All ' + (key === 'reagera' ? 'situations' : 'topics') + '</button></div></div></div>';
    h(html);
    bindSay(); bindRec();
    view.querySelectorAll('.reveal').forEach(function (b) { b.onclick = function () { $('#m' + b.dataset.i).classList.remove('hidden'); b.classList.add('hidden'); }; });
    $('#showAll').onclick = function () { view.querySelectorAll('.model').forEach(function (m) { m.classList.remove('hidden'); }); view.querySelectorAll('.reveal').forEach(function (b) { b.classList.add('hidden'); }); };
    $('#enT').onclick = function () { S.english = !S.english; save('yki_settings', S); taskReview(key, items, recs); };
    $('#again').onclick = function () { if (single) taskIntro(key, items[0].id); else runTasks(key, items); };
    $('#list').onclick = function () { go('#' + key + '/list'); };
    $('#nextT').onclick = function () {
      var all = TASKS[key];
      if (key === 'reagera') { var j = all.indexOf(items[items.length - 1]); runTasks(key, [all[(j + 1) % all.length]]); return; }
      var k = all.indexOf(items[0]); go('#' + PREFIX[key] + '/' + all[(k + 1) % all.length].id);
    };
  }

  /* ---------------- Lyssna: playlist (Swedish → English → Swedish) ---------------- */
  var AU = new Audio(); AU.preload = 'metadata';
  var LS = Object.assign({ idx: 0, rate: 1, loop: 'all', showEn: true, mode: 'mix' }, load('yki_listen', {}));
  if (LS.idx >= LISTEN.length) LS.idx = 0;
  function saveLS() { save('yki_listen', LS); }
  function fmt(t) { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ':' + ('0' + t % 60).slice(-2); }
  function curEp() { return LISTEN[LS.idx]; }
  var COMB = window.YKI_LISTEN_ALL || null, SW = false;
  function comb() { return LS.loop === 'all' && COMB; }
  function base(i) { return comb() ? (LS.mode === 'sv' ? COMB.off_sv : COMB.off)[i] : 0; }
  function epAt(t) { var o = LS.mode === 'sv' ? COMB.off_sv : COMB.off, k = 0; for (var i = 0; i < o.length; i++) if (o[i] <= t + 0.05) k = i; return k; }
  function epSrc(ep) { if (comb()) return LS.mode === 'sv' ? COMB.src_sv : COMB.src; return LS.mode === 'sv' && ep.src_sv ? ep.src_sv : ep.src; }
  function localT() { return AU.currentTime - base(LS.idx); }
  function setMeta(ep) {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: ep.title_sv, artist: 'YKI svenska – Lyssna', album: themeName(ep.theme),
        artwork: [{ src: 'icon-512.png', sizes: '512x512', type: 'image/png' }] });
    }
  }
  function lt(l) { return LS.mode === 'sv' && l.t2 != null ? l.t2 : l.t; }
  function epDur(ep) { return LS.mode === 'sv' && ep.dur_sv ? ep.dur_sv : ep.dur; }
  function loadEp(i, autoplay, at) {
    LS.idx = (i + LISTEN.length) % LISTEN.length; saveLS();
    var ep = curEp();
    var target = base(LS.idx) + (at || 0);
    if (AU.getAttribute('src') !== epSrc(ep)) {
      SW = !!target; AU.src = epSrc(ep);
      if (target) AU.addEventListener('loadedmetadata', function f() { AU.removeEventListener('loadedmetadata', f); AU.currentTime = target; SW = false; });
    } else if (comb() || at) AU.currentTime = target;
    AU.playbackRate = LS.rate;
    if (autoplay) AU.play().catch(function () {});
    setMeta(ep);
    paintListen();
  }
  function lineAt(t) { t = t - base(LS.idx); var ls = curEp().lines, k = 0; for (var i = 0; i < ls.length; i++) if (lt(ls[i]) <= t + 0.05) k = i; return k; }
  function jumpLine(d) {
    var ls = curEp().lines, k = lineAt(AU.currentTime) + d;
    if (k < 0) { loadEp(LS.idx - 1, !AU.paused); return; }
    if (k >= ls.length) { loadEp(LS.idx + 1, !AU.paused); return; }
    AU.currentTime = base(LS.idx) + lt(ls[k]);
  }
  AU.addEventListener('ended', function () {
    if (LS.loop === 'one') { AU.currentTime = 0; AU.play(); }
    else if (comb()) { LS.idx = 0; AU.currentTime = 0; AU.play(); setMeta(curEp()); paintListen(); }
    else if (LS.loop === 'all') loadEp(LS.idx + 1, true);
  });
  AU.addEventListener('timeupdate', function () {
    if (comb() && !SW) { var k = epAt(AU.currentTime); if (k !== LS.idx) { LS.idx = k; saveLS(); setMeta(curEp()); paintListen(); } }
    tickListen(); try { LS.pos = localT(); } catch (e) {} });
  AU.addEventListener('play', paintListen); AU.addEventListener('pause', function () { saveLS(); paintListen(); });
  if ('mediaSession' in navigator) {
    var ms = navigator.mediaSession;
    try {
      ms.setActionHandler('play', function () { AU.play(); });
      ms.setActionHandler('pause', function () { AU.pause(); });
      ms.setActionHandler('previoustrack', function () { jumpLine(-1); });
      ms.setActionHandler('nexttrack', function () { jumpLine(1); });
      ms.setActionHandler('seekbackward', function () { AU.currentTime = Math.max(0, AU.currentTime - 10); });
      ms.setActionHandler('seekforward', function () { AU.currentTime = AU.currentTime + 10; });
    } catch (e) {}
  }

  var lastLine = -1;
  function tickListen() {
    var seek = $('#lseek'); if (!seek) return;
    var d = epDur(curEp()), ct = localT();
    if (!comb() && AU.duration) d = AU.duration;
    if (!seek.dataset.drag) seek.value = d ? Math.min(1000, ct / d * 1000) : 0;
    $('#lcur').textContent = fmt(ct); $('#ldur').textContent = fmt(d);
    var k = lineAt(AU.currentTime);
    if (k !== lastLine) {
      lastLine = k;
      view.querySelectorAll('.lines .ln').forEach(function (el, i) { el.classList.toggle('on', i === k); });
      var on = view.querySelector('.lines .ln.on');
      if (on && !AU.paused && $('#follow') && $('#follow').checked) on.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
  function paintListen() {
    var pb = $('#lplay'); if (!pb) return;
    pb.textContent = AU.paused ? '▶' : '❚❚'; pb.setAttribute('aria-label', AU.paused ? 'Play' : 'Pause');
    var ep = curEp();
    $('#lnow').textContent = ep.title_sv; $('#lnowen').textContent = ep.title_en + ' · ' + themeName(ep.theme);
    view.querySelectorAll('.eplist .dlg-link').forEach(function (b) { b.classList.toggle('cur', +b.dataset.i === LS.idx); });
    var tr = $('#ltrans');
    if (tr && tr.dataset.ep !== ep.id) {
      tr.dataset.ep = ep.id; lastLine = -1;
      tr.innerHTML = ep.lines.map(function (l, i) {
        return '<div class="ln" data-i="' + i + '"><div class="sv">' + (ep.lines.some(function (z) { return z.p === 'B'; }) ? '<span class="spk sp' + l.p + '">' + (l.p === 'A' ? '●' : '○') + '</span> ' : '') + esc(l.sv) + '</div>' + (LS.showEn ? '<div class="en">' + esc(l.en) + '</div>' : '') + '</div>';
      }).join('');
      tr.querySelectorAll('.ln').forEach(function (el) { el.onclick = function () { AU.currentTime = base(LS.idx) + lt(ep.lines[+el.dataset.i]); if (AU.paused) AU.play(); }; });
    }
    tickListen();
  }

  function listenView() {
    stopSpeech(); releaseMic();
    if (!LISTEN.length) { h('<p>No episodes yet.</p>'); return; }
    if (!AU.getAttribute('src')) { loadEp(LS.idx, false, LS.pos || 0); }
    var html = '<p><button class="btn" id="back">← Home</button></p><h1>🎧 Lyssna</h1>' +
      '<button class="card task" id="toHF" style="margin-bottom:6px"><span class="badge">' + HF.length + ' tasks</span><b>🎯 Exam practice – Hörförståelse</b><span class="muted small">Announcements, news, voicemails and ads at exam speed. Questions first, the text plays two times.</span></button>' +
      '<button class="card task" id="toHFT" style="margin-bottom:6px"><span class="badge">' + (window.YKI_HFT || []).length + ' tests</span><b>🧪 Provtest – like the YKI sample test</b><span class="muted small">3 tasks per test: flerval, rätt/fel, öppna frågor. Timer and two listenings, like the real test. Finland-Swedish melody option.</span></button>' +
      '<h2>Playlist – Svenska → English → Svenska</h2>' +
      '<p class="muted">Each sentence comes three times: <b>Swedish → English → Swedish</b>. Press play and put the phone in your pocket – it keeps going from episode to episode. The headphone buttons skip to the next or previous sentence.</p>' +
      '<div class="player"><div class="now" id="lnow"></div><div class="en" id="lnowen"></div>' +
      '<input type="range" class="seek" id="lseek" min="0" max="1000" value="0" aria-label="Position"><div class="times"><span id="lcur">0:00</span><span id="ldur">0:00</span></div>' +
      '<div class="row"><button class="pbtn" id="lprevE" aria-label="Previous episode">⏮</button><button class="pbtn" id="lprev" aria-label="Previous sentence">↺</button>' +
      '<button class="pbtn big" id="lplay" aria-label="Play">▶</button><button class="pbtn" id="lnext" aria-label="Next sentence">↻</button><button class="pbtn" id="lnextE" aria-label="Next episode">⏭</button></div>' +
      '<div class="opts"><label>Speed <select id="lrate"><option value="0.8">0.8×</option><option value="0.9">0.9×</option><option value="1">1×</option><option value="1.1">1.1×</option></select></label>' +
      '<label>Mode <select id="lmode"><option value="mix">Svenska → English → Svenska</option><option value="sv">Bara svenska</option></select></label>' +
      '<label>Repeat <select id="lloop"><option value="all">all episodes</option><option value="one">this episode</option><option value="off">off</option></select></label>' +
      '<label><input type="checkbox" id="lshowEn"' + (LS.showEn ? ' checked' : '') + '> English text</label>' +
      '<label><input type="checkbox" id="follow" checked> Follow</label></div></div>' +
      '<h2>Text</h2><div class="card lines" id="ltrans"></div>' +
      '<h2>Episodes</h2><div class="card eplist">' + LISTEN.map(function (ep, i) {
        return '<button class="dlg-link" data-i="' + i + '"><span><b>' + (i + 1) + '.</b> ' + esc(ep.title_sv) + '<br><span class="en">' + esc(ep.kind || '') + ' · ' + esc(ep.title_en) + ' · ' + esc(themeName(ep.theme)) + '</span></span><span class="done">' + fmt(epDur(ep)) + '</span></button>';
      }).join('') + '</div>';
    h(html);
    $('#back').onclick = function () { go(''); };
    $('#toHF').onclick = function () { go('#hf'); };
    $('#toHFT').onclick = function () { go('#hft'); };
    $('#lplay').onclick = function () { if (AU.paused) AU.play().catch(function () {}); else AU.pause(); };
    $('#lprev').onclick = function () { jumpLine(-1); };
    $('#lnext').onclick = function () { jumpLine(1); };
    $('#lprevE').onclick = function () { loadEp(LS.idx - 1, !AU.paused); };
    $('#lnextE').onclick = function () { loadEp(LS.idx + 1, !AU.paused); };
    $('#lrate').value = String(LS.rate); $('#lrate').onchange = function () { LS.rate = +this.value; AU.playbackRate = LS.rate; saveLS(); };
    $('#lmode').value = LS.mode; $('#lmode').onchange = function () {
      var line = lineAt(AU.currentTime), was = !AU.paused; LS.mode = this.value; saveLS();
      SW = true; AU.src = epSrc(curEp()); AU.playbackRate = LS.rate;
      AU.addEventListener('loadedmetadata', function f() { AU.removeEventListener('loadedmetadata', f); AU.currentTime = base(LS.idx) + lt(curEp().lines[line]); SW = false; if (was) AU.play(); });
      $('#ltrans').dataset.ep = ''; paintListen();
    };
    $('#lloop').value = LS.loop; $('#lloop').onchange = function () {
      var pos = localT(), was = !AU.paused, before = epSrc(curEp()); LS.loop = this.value; saveLS();
      if (epSrc(curEp()) !== before) { SW = true; AU.src = epSrc(curEp()); AU.playbackRate = LS.rate; AU.addEventListener('loadedmetadata', function f() { AU.removeEventListener('loadedmetadata', f); AU.currentTime = base(LS.idx) + pos; SW = false; if (was) AU.play(); }); }
    };
    $('#lshowEn').onchange = function () { LS.showEn = this.checked; saveLS(); $('#ltrans').dataset.ep = ''; paintListen(); };
    var sk = $('#lseek');
    sk.oninput = function () { sk.dataset.drag = 1; };
    sk.onchange = function () { delete sk.dataset.drag; var d = comb() ? epDur(curEp()) : (AU.duration || epDur(curEp())); AU.currentTime = base(LS.idx) + sk.value / 1000 * d; };
    view.querySelectorAll('.eplist .dlg-link').forEach(function (b) { b.onclick = function () { loadEp(+b.dataset.i, true); window.scrollTo({ top: 0, behavior: 'smooth' }); }; });
    paintListen();
  }


  /* ---------------- Skriva ---------------- */
  var WR = window.YKI_WRITE || [], WTPL = window.YKI_WTPL || {};
  function wordCount(t) { return (t.trim().match(/\S+/g) || []).length; }
  function writeList() {
    stopSpeech(); releaseMic();
    var html = '<p><button class="btn" id="back">← Home</button></p><h1>✍️ Skriva – Writing</h1>' +
      '<p class="muted">' + WR.length + ' writing tasks, 3 per theme. Read the task, write your text, then compare with the model text. Your text is saved in this browser.</p>' +
      '<div class="notice">In the exam: answer <b>every point</b> of the task, start and end the right way (Hej … / Hälsningar …), and use short, correct sentences. Use the template if you get stuck.</div>';
    DATA.themes.forEach(function (th, i) {
      var list = WR.filter(function (x) { return x.theme === th.id; });
      if (!list.length) return;
      html += '<details class="theme"' + (i === 0 ? ' open' : '') + '><summary>' + th.id + '. ' + esc(th.sv) + ' <span class="muted small">– ' + esc(th.en) + ' · ' + countDone(list) + '/' + list.length + '</span></summary>';
      list.forEach(function (x) {
        html += '<button class="dlg-link" data-id="' + x.id + '"><span><b>' + x.n + '.</b> <span class="badge">' + esc(x.type) + '</span> ' + esc(x.sv) + (S.english ? '<br><span class="en">' + esc(x.en) + '</span>' : '') + '</span><span class="done">' + bookRef(x.page) + ' ' + (DONE[x.id] ? '✓' : '') + '</span></button>';
      });
      html += '</details>';
    });
    h(html);
    $('#back').onclick = function () { go(''); };
    view.querySelectorAll('.dlg-link').forEach(function (b) { b.onclick = function () { go('#w/' + b.dataset.id); }; });
  }
  function writeTask(id) {
    stopSpeech(); releaseMic();
    var k = WR.map(function (x) { return x.id; }).indexOf(id), x = WR[k]; if (!x) { writeList(); return; }
    var key = 'yki_w_' + id, draft = ''; try { draft = localStorage.getItem(key) || ''; } catch (e) {}
    var tpl = WTPL[x.type];
    h('<p><button class="btn" id="back">← All writing tasks</button></p>' +
      '<div class="exam"><div class="head"><span>Skriva · ' + esc(themeName(x.theme)) + ' · ' + x.n + '</span><span>' + esc(x.type) + bookRef(x.page) + '</span></div><div class="body">' +
      '<div class="sit">' + esc(x.sv) + '</div>' + en(x.en) +
      '<p>' + esc(x.task_sv) + '</p>' + en(x.task_en) +
      '<p class="small muted" style="margin-bottom:2px">Skriv om:</p><ul class="qs">' + x.check.map(function (c, i) { return '<li>' + esc(c) + (S.english ? ' <span class="en">' + esc(x.check_en[i]) + '</span>' : '') + '</li>'; }).join('') + '</ul>' +
      '<p class="small muted">About <b>' + x.words + ' words</b>.</p>' +
      '<textarea id="wtext" class="wtext" placeholder="Skriv här …" spellcheck="false">' + esc(draft) + '</textarea>' +
      '<div class="row" style="justify-content:space-between"><span class="small muted"><span id="wc">0</span> words</span><span class="small muted" id="wtimer"></span></div>' +
      '<div class="row" style="margin-top:8px"><button class="btn" id="tplBtn">🧰 Template</button><button class="btn" id="timerBtn">⏱ 20 min timer</button><button class="btn" id="clr">Clear</button></div>' +
      (tpl ? '<div class="model hidden" id="tplBox"><div class="small muted">Template – ' + esc(x.type) + ':</div><pre class="tpl">' + hl(tpl.sv) + '</pre><div class="en">' + esc(tpl.en) + '</div></div>' : '') +
      '<div class="row" style="margin-top:12px"><button class="btn primary" id="showM">Show model text</button><button class="btn" id="enT">' + (S.english ? 'Hide' : 'Show') + ' English</button></div>' +
      '<div class="model hidden" id="mBox"><div class="small muted">Model text:</div>' + x.model.map(function (m) { return '<div class="mline"><span class="sv">' + esc(m.sv) + '</span>' + say(m.sv) + en(m.en) + '</div>'; }).join('') + '</div>' +
      '<div class="row" style="margin-top:14px"><button class="btn" id="prevW">‹ Previous</button><button class="btn" id="nextW">Next task ›</button></div>' +
      '</div></div>');
    bindSay();
    var ta = $('#wtext'), wc = $('#wc');
    function upd() { wc.textContent = wordCount(ta.value); try { localStorage.setItem(key, ta.value); } catch (e) {} }
    ta.oninput = upd; upd();
    $('#back').onclick = function () { go('#skriva'); };
    if (tpl) $('#tplBtn').onclick = function () { $('#tplBox').classList.toggle('hidden'); };
    $('#clr').onclick = function () { if (ta.value && !window.confirm('Delete your text?')) return; ta.value = ''; upd(); };
    $('#showM').onclick = function () { $('#mBox').classList.remove('hidden'); this.classList.add('hidden'); DONE[x.id] = 1; save('yki_done', DONE); };
    $('#enT').onclick = function () { S.english = !S.english; save('yki_settings', S); writeTask(id); };
    $('#prevW').onclick = function () { go('#w/' + WR[(k - 1 + WR.length) % WR.length].id); };
    $('#nextW').onclick = function () { go('#w/' + WR[(k + 1) % WR.length].id); };
    var tmr = null;
    $('#timerBtn').onclick = function () {
      if (tmr) { clearInterval(tmr); tmr = null; $('#wtimer').textContent = ''; this.textContent = '⏱ 20 min timer'; return; }
      var end = Date.now() + 20 * 60000, btn = this; btn.textContent = '⏹ Stop timer';
      tmr = setInterval(function () {
        var el = $('#wtimer'); if (!el) { clearInterval(tmr); return; }
        var left = Math.max(0, Math.round((end - Date.now()) / 1000));
        el.textContent = '⏱ ' + Math.floor(left / 60) + ':' + ('0' + left % 60).slice(-2);
        if (!left) { clearInterval(tmr); tmr = null; beep(); el.textContent = '⏱ Time is up!'; btn.textContent = '⏱ 20 min timer'; }
      }, 500);
    };
  }

  /* ---------------- Läsa ---------------- */
  function readList() {
    stopSpeech(); releaseMic();
    var html = '<p><button class="btn" id="back">← Home</button></p><h1>📖 Läsa – Reading</h1>' +
      '<button class="card task" id="toLF" style="margin-bottom:6px"><span class="badge">' + LF.length + ' sets</span><b>🎯 Exam practice – Läsförståelse</b><span class="muted small">Like the YKI test: article (A/B/C), notice or ad (rätt/fel) and news (open questions).</span></button>' +
      '<h2>Easy texts</h2>' +
      '<p class="muted">' + LISTEN.length + ' short texts with questions. Read the text, answer the questions, then check. Tap a sentence to hear it. The same texts are in 🎧 Lyssna – read first, then listen on the bike.</p>';
    DATA.themes.forEach(function (th, i) {
      var list = LISTEN.filter(function (x) { return x.theme === th.id; });
      if (!list.length) return;
      html += '<details class="theme"' + (i === 0 ? ' open' : '') + '><summary>' + th.id + '. ' + esc(th.sv) + ' <span class="muted small">– ' + esc(th.en) + ' · ' + list.filter(function (x) { return DONE['rd-' + x.id]; }).length + '/' + list.length + '</span></summary>';
      list.forEach(function (x) {
        html += '<button class="dlg-link" data-id="' + x.id + '"><span><span class="badge">' + esc(x.kind) + '</span> ' + esc(x.title_sv) + (S.english ? '<br><span class="en">' + esc(x.title_en) + '</span>' : '') + '</span><span class="done">' + (DONE['rd-' + x.id] ? '✓' : '') + '</span></button>';
      });
      html += '</details>';
    });
    h(html);
    $('#back').onclick = function () { go(''); };
    $('#toLF').onclick = function () { go('#lf'); };
    view.querySelectorAll('.dlg-link').forEach(function (b) { b.onclick = function () { go('#r/' + b.dataset.id); }; });
  }
  function readTask(id) {
    stopSpeech(); releaseMic();
    var k = LISTEN.map(function (x) { return x.id; }).indexOf(id), x = LISTEN[k]; if (!x) { readList(); return; }
    var dlg = x.lines.some(function (l) { return l.p === 'B'; });
    var names = {};
    h('<p><button class="btn" id="back">← All texts</button></p>' +
      '<div class="exam"><div class="head"><span>Läsa · ' + esc(themeName(x.theme)) + '</span><span>' + esc(x.kind) + '</span></div><div class="body">' +
      '<div class="sit">' + esc(x.title_sv) + '</div>' + en(x.title_en) +
      '<div class="rtext">' + x.lines.map(function (l) {
        return '<p class="rl' + (dlg ? ' sp' + l.p : '') + '" data-t="' + esc(l.sv) + '">' + (dlg ? '<b class="spk">' + (l.p === 'A' ? '–' : '–') + '</b> ' : '') + esc(l.sv) + (S.english ? '<span class="en"> ' + esc(l.en) + '</span>' : '') + '</p>';
      }).join('') + '</div>' +
      '<h2>Frågor</h2>' + (x.q || []).map(function (q, i) {
        return '<div class="rq" data-i="' + i + '"><div class="rqq"><b>' + (i + 1) + '.</b> ' + esc(q.sv) + (S.english ? ' <span class="en">' + esc(q.en) + '</span>' : '') + '</div>' +
          q.o.map(function (o, j) { return '<label class="ropt"><input type="radio" name="q' + i + '" value="' + j + '"> ' + esc(o) + '</label>'; }).join('') + '</div>';
      }).join('') +
      '<div class="row" style="margin-top:12px"><button class="btn primary" id="check">Check answers</button><button class="btn" id="enT">' + (S.english ? 'Hide' : 'Show') + ' English</button><button class="btn" id="toL">🎧 Listen to this text</button></div>' +
      '<p id="score" class="sit"></p>' +
      '<div class="row" style="margin-top:8px"><button class="btn" id="prevR">‹ Previous</button><button class="btn" id="nextR">Next text ›</button></div>' +
      '</div></div>');
    view.querySelectorAll('.rl').forEach(function (p) { p.onclick = function () { speak(p.dataset.t); }; });
    $('#back').onclick = function () { go('#lasa'); };
    $('#enT').onclick = function () { S.english = !S.english; save('yki_settings', S); readTask(id); };
    $('#toL').onclick = function () { loadEp(k, true); go('#listen'); };
    $('#prevR').onclick = function () { go('#r/' + LISTEN[(k - 1 + LISTEN.length) % LISTEN.length].id); };
    $('#nextR').onclick = function () { go('#r/' + LISTEN[(k + 1) % LISTEN.length].id); };
    $('#check').onclick = function () {
      var ok = 0;
      (x.q || []).forEach(function (q, i) {
        var box = view.querySelector('.rq[data-i="' + i + '"]'), sel = box.querySelector('input:checked');
        box.querySelectorAll('.ropt').forEach(function (lab, j) { lab.classList.remove('good', 'bad'); if (j === q.a) lab.classList.add('good'); else if (sel && +sel.value === j) lab.classList.add('bad'); });
        if (sel && +sel.value === q.a) ok++;
      });
      $('#score').textContent = ok + ' / ' + (x.q || []).length + (ok === (x.q || []).length ? ' – Bra jobbat! 🎉' : ' – the right answers are green.');
      if (x.q && ok === x.q.length) { DONE['rd-' + x.id] = 1; save('yki_done', DONE); }
    };
  }

  /* ---------------- Material ---------------- */
  function materialView() {
    stopSpeech(); releaseMic();
    var M = window.YKI_MAT || [];
    h('<p><button class="btn" id="back">← Home</button></p><h1>📚 Material</h1>' +
      '<p class="muted">All the study material. <b>Talking version</b>: open it in the browser and tap any blue Swedish text to hear it. <b>PDF</b>: download or print.</p>' +
      M.map(function (m) {
        return '<div class="card"><b style="font-size:18px">' + m.icon + ' ' + esc(m.title) + '</b><div class="muted small">' + esc(m.desc) + ' · ' + m.pages + ' pages</div>' +
          '<div class="row" style="margin-top:10px"><a class="btn primary" href="' + m.html + '" target="_blank" rel="noopener">🔊 Talking version</a><a class="btn" href="' + m.pdf + '" target="_blank" rel="noopener" download>⬇ PDF</a></div></div>';
      }).join(''));
    $('#back').onclick = function () { go(''); };
  }

  /* ---------------- Exam practice: Hörförståelse & Läsförståelse ---------------- */
  var HF = window.YKI_HF || [], LF = window.YKI_LF || [];
  function norm(t) { return String(t).toLowerCase().replace(/[^a-zåäöé0-9 ]/g, ' '); }
  function qBlock(q, i, pfx) {
    var h = '<div class="rq" data-i="' + i + '"><div class="rqq"><b>' + (i + 1) + '.</b> ' + esc(q.q) + '</div>';
    if (q.t === 'mc') h += q.o.map(function (o, j) { return '<label class="ropt"><input type="radio" name="' + pfx + i + '" value="' + j + '"> <b>' + 'ABC'[j] + '</b> ' + esc(o) + '</label>'; }).join('');
    else if (q.t === 'rf') h += '<label class="ropt"><input type="radio" name="' + pfx + i + '" value="1"> <b>A</b> Rätt</label><label class="ropt"><input type="radio" name="' + pfx + i + '" value="0"> <b>B</b> Fel</label>';
    else h += '<textarea class="wtext op" rows="2" placeholder="Svara på svenska …" style="min-height:70px"></textarea>';
    return h + '<div class="fb small"></div></div>';
  }
  function checkQs(root, qs) {
    var ok = 0;
    qs.forEach(function (q, i) {
      var box = root.querySelector('.rq[data-i="' + i + '"]'), fb = box.querySelector('.fb');
      if (q.t === 'op') {
        var txt = norm(box.querySelector('textarea').value);
        var good = q.k.every(function (grp) { return grp.some(function (w) { return txt.indexOf(norm(w).trim()) >= 0; }); });
        if (good) ok++;
        fb.innerHTML = (good ? '✅ ' : '❌ ') + '<span class="muted">Model answer:</span> <b>' + esc(q.m) + '</b>';
        return;
      }
      var sel = box.querySelector('input:checked'), right = q.t === 'mc' ? q.a : (q.a ? 1 : 0);
      box.querySelectorAll('.ropt').forEach(function (lab) {
        var v = +lab.querySelector('input').value; lab.classList.remove('good', 'bad');
        if (v === right) lab.classList.add('good'); else if (sel && +sel.value === v) lab.classList.add('bad');
      });
      if (sel && +sel.value === right) ok++;
    });
    return ok;
  }
  var INSTR = {
    mc: 'Läs texten och frågorna. Välj rätt alternativ (A, B eller C).',
    rf: 'Läs texten och påståendena. Är påståendet rätt (A) eller fel (B)?',
    op: 'Läs texten och svara kort på svenska.'
  };

  function hfList() {
    stopSpeech(); releaseMic();
    var html = '<p><button class="btn" id="back">← Lyssna</button></p><h1>🎯 Hörförståelse – exam practice</h1>' +
      '<p class="muted">Like the YKI listening test: read the questions first, then you hear the text <b>two times</b>. The text is hidden until you check your answers. ' + HF.length + ' tasks: announcements, news, voicemails, ads.</p>' +
      '<div class="card">' + HF.map(function (x, i) {
        return '<button class="dlg-link" data-id="' + x.id + '"><span><b>' + (i + 1) + '.</b> <span class="badge">' + esc(x.kind) + '</span> ' + esc(x.title) + (S.english ? '<br><span class="en">' + esc(x.title_en) + '</span>' : '') + '</span><span class="done">' + (DONE['hf-' + x.id] ? '✓' : '') + '</span></button>';
      }).join('') + '</div>';
    h(html);
    $('#back').onclick = function () { go('#listen'); };
    view.querySelectorAll('.dlg-link').forEach(function (b) { b.onclick = function () { go('#hf/' + b.dataset.id); }; });
  }
  function hfTask(id) {
    stopSpeech(); releaseMic(); try { AU.pause(); } catch (e) {}
    var k = HF.map(function (x) { return x.id; }).indexOf(id), x = HF[k]; if (!x) { hfList(); return; }
    var au = new Audio(x.src), round = 0, slow = false, gapT = null;
    h('<p><button class="btn" id="back">← All listening tasks</button></p>' +
      '<div class="exam"><div class="head"><span>Hörförståelse · ' + (k + 1) + '</span><span>' + esc(x.kind) + '</span></div><div class="body">' +
      '<div class="sit">' + esc(x.title) + '</div>' + en(x.title_en) +
      '<p class="small muted">Läs frågorna först. Du hör texten två gånger.</p>' +
      '<div class="player" style="position:static"><div class="status" id="hstat">Ready – press play</div>' +
      '<div class="bar"><i id="hfill"></i></div>' +
      '<div class="row"><button class="pbtn big" id="hplay" aria-label="Play">▶</button></div>' +
      '<div class="opts"><label><input type="checkbox" id="hslow"> Slower (practice)</label></div></div>' +
      x.qs.map(function (q, i) { return (i === 0 || q.t !== x.qs[i - 1].t ? '<p class="small muted" style="margin:14px 0 0">' + INSTR[q.t] + '</p>' : '') + qBlock(q, i, 'h'); }).join('') +
      '<div class="row" style="margin-top:12px"><button class="btn primary" id="check">Check answers</button></div><p id="score" class="sit"></p>' +
      '<div class="model hidden" id="htext"><div class="small muted">Texten (tap a sentence to hear it):</div>' + x.text.map(function (s) { return '<p class="rl" data-t="' + esc(s) + '">' + esc(s) + '</p>'; }).join('') + '</div>' +
      '<div class="row" style="margin-top:12px"><button class="btn" id="prevH">‹ Previous</button><button class="btn" id="nextH">Next task ›</button></div>' +
      '</div></div>');
    function stopAll() { clearTimeout(gapT); au.pause(); }
    activeStop = stopAll;
    function paint() { $('#hplay').textContent = au.paused ? '▶' : '❚❚'; }
    au.addEventListener('timeupdate', function () { var f = $('#hfill'); if (f && au.duration) f.style.width = (au.currentTime / au.duration * 100) + '%'; });
    au.addEventListener('play', function () { var s = $('#hstat'); if (s) s.innerHTML = '<span class="wave"><i></i><i></i><i></i><i></i></span> Lyssning ' + round + ' / 2'; paint(); });
    au.addEventListener('pause', paint);
    au.addEventListener('ended', function () {
      var s = $('#hstat'); if (!s) return;
      if (round === 1) { s.textContent = '⏸ Pause – the text comes again in 5 seconds'; gapT = setTimeout(function () { round = 2; au.currentTime = 0; au.play(); }, 5000); }
      else { s.textContent = '✔ Done – answer the questions, then check. (Press ▶ to hear it again.)'; round = 0; }
      paint();
    });
    $('#hplay').onclick = function () {
      if (!au.paused) { au.pause(); return; }
      if (round === 0) { round = 1; au.currentTime = 0; }
      au.playbackRate = slow ? 0.85 : 1; au.play().catch(function () {});
    };
    $('#hslow').onchange = function () { slow = this.checked; au.playbackRate = slow ? 0.85 : 1; };
    $('#back').onclick = function () { stopAll(); go('#hf'); };
    $('#prevH').onclick = function () { stopAll(); go('#hf/' + HF[(k - 1 + HF.length) % HF.length].id); };
    $('#nextH').onclick = function () { stopAll(); go('#hf/' + HF[(k + 1) % HF.length].id); };
    view.querySelectorAll('#htext .rl').forEach(function (p) { p.onclick = function () { au.pause(); speak(p.dataset.t); }; });
    $('#check').onclick = function () {
      var ok = checkQs(view, x.qs);
      $('#score').textContent = ok + ' / ' + x.qs.length + (ok === x.qs.length ? ' – Bra jobbat! 🎉' : '');
      $('#htext').classList.remove('hidden');
      DONE['hf-' + x.id] = 1; save('yki_done', DONE);
    };
  }

  function lfList() {
    stopSpeech(); releaseMic();
    h('<p><button class="btn" id="back">← Läsa</button></p><h1>🎯 Läsförståelse – exam practice</h1>' +
      '<p class="muted">Like the YKI reading test. Each set has 3 texts: an article with multiple-choice questions, a notice or ad with rätt/fel, and a short news text with open questions. Try to finish a set in about 20 minutes.</p>' +
      '<div class="card">' + LF.map(function (x, i) {
        return '<button class="dlg-link" data-id="' + x.id + '"><span><b>' + esc(x.title) + '</b><br><span class="en">' + x.texts.map(function (t) { return esc(t.title); }).join(' · ') + '</span></span><span class="done">' + (DONE['lf-' + x.id] ? '✓' : '') + '</span></button>';
      }).join('') + '</div>');
    $('#back').onclick = function () { go('#lasa'); };
    view.querySelectorAll('.dlg-link').forEach(function (b) { b.onclick = function () { go('#lf/' + b.dataset.id); }; });
  }
  function lfSet(id) {
    stopSpeech(); releaseMic();
    var k = LF.map(function (x) { return x.id; }).indexOf(id), x = LF[k]; if (!x) { lfList(); return; }
    var html = '<p><button class="btn" id="back">← All reading sets</button></p>' +
      '<div class="row" style="justify-content:space-between"><h1 style="margin:0">Läsförståelse · ' + esc(x.title) + '</h1><span class="small muted" id="ltime"></span></div>';
    x.texts.forEach(function (t, ti) {
      html += '<div class="exam" style="margin-top:14px"><div class="head"><span>Text ' + (ti + 1) + '</span><span>' + esc(t.kind) + '</span></div><div class="body" data-t="' + ti + '">' +
        '<p class="small muted">' + INSTR[t.qs[0].t] + '</p>' +
        '<div class="sit">' + esc(t.title) + '</div><div class="rtext">' + t.body.map(function (p) { return '<p class="rl" data-t="' + esc(p) + '">' + esc(p) + '</p>'; }).join('') + '</div>' +
        t.qs.map(function (q, i) { return qBlock(q, i, 'l' + ti + '_'); }).join('') + '</div></div>';
    });
    html += '<div class="row" style="margin-top:14px"><button class="btn primary" id="check">Check answers</button><button class="btn" id="nextL">Next set ›</button></div><p id="score" class="sit"></p>';
    h(html);
    var start = Date.now(), tmr = setInterval(function () { var el = $('#ltime'); if (!el) { clearInterval(tmr); return; } var s = Math.floor((Date.now() - start) / 1000); el.textContent = '⏱ ' + Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }, 1000);
    view.querySelectorAll('.rtext .rl').forEach(function (p) { p.onclick = function () { speak(p.dataset.t); }; });
    $('#back').onclick = function () { go('#lf'); };
    $('#nextL').onclick = function () { go('#lf/' + LF[(k + 1) % LF.length].id); };
    $('#check').onclick = function () {
      var ok = 0, all = 0;
      x.texts.forEach(function (t, ti) { ok += checkQs(view.querySelector('.body[data-t="' + ti + '"]'), t.qs); all += t.qs.length; });
      clearInterval(tmr);
      $('#score').textContent = ok + ' / ' + all + ' rätt' + (ok === all ? ' – Bra jobbat! 🎉' : '');
      DONE['lf-' + x.id] = 1; save('yki_done', DONE);
    };
  }

  /* ---------------- router ---------------- */
  /* ---------------- Provtest: JYU-style listening mock tests ---------------- */
  var HFT = window.YKI_HFT || [];
  var HS = Object.assign({ dev: false, intro: true }, load('yki_hft', {}));
  function hftList() {
    stopSpeech(); releaseMic();
    h('<p><button class="btn" id="back">← Lyssna</button></p><h1>🧪 Provtest – Talförståelse</h1>' +
      '<p class="muted">Built like the sample test on the YKI website (Jyväskylä): <b>task 1</b> multiple choice – the message plays twice without a pause; <b>task 2</b> rätt/fel – two short messages, each plays twice; <b>task 3</b> open questions – a discussion plays in full, then in two parts, and you answer in Swedish after each part. The page runs the timer for you, like in the real test.</p>' +
      '<div class="card">' + HFT.map(function (s, i) {
        return '<button class="dlg-link" data-id="' + s.id + '"><span><b>' + esc(s.title) + '</b><br><span class="en">' + s.tasks.map(function (t) { return esc(t.title); }).join(' · ') + '</span></span><span class="done">' + (DONE['hft-' + s.id] ? '✓' : '') + '</span></button>';
      }).join('') + '</div>' +
      '<div class="card"><b>🔊 About the voices</b><p class="small">The recorded voices are computer voices (a man and a woman). If your phone has a good Swedish voice (iPhone: <i>Alva</i>, Android: Google Swedish), tick <b>“Use my phone’s Swedish voice”</b> in the test – it often sounds more natural. For real Finland-Swedish speakers, listen to Yle:</p>' +
      '<p class="small"><a href="https://arenan.yle.fi/1-50362086" target="_blank" rel="noopener">Yle – Nyheter på lätt svenska</a> – short news in easy Swedish with sound and text, every weekday, read by Finland-Swedish speakers.<br><a href="https://ll-bladet.fi/" target="_blank" rel="noopener">LL-Bladet</a> – easy-to-read news from Finland.<br>' +
      '<a href="https://ykitesti.solki.jyu.fi/en/tutustu-testiin/svenska/mellanniva-talforstaelse/" target="_blank" rel="noopener">YKI sample test – Svenska, mellannivå, talförståelse</a> (the official one).</p></div>');
    $('#back').onclick = function () { go('#listen'); };
    view.querySelectorAll('.dlg-link').forEach(function (b) { b.onclick = function () { go('#hft/' + b.dataset.id); }; });
  }
  function hftSet(id) {
    stopSpeech(); releaseMic(); try { AU.pause(); } catch (e) {}
    var k = HFT.map(function (s) { return s.id; }).indexOf(id), st = HFT[k]; if (!st) { hftList(); return; }
    var au = new Audio(), tok = 0, skipFn = null, cur = -1;
    var html = '<p><button class="btn" id="back">← All mock tests</button></p>' +
      '<h1 style="margin:0">Talförståelse · ' + esc(st.title) + '</h1>' +
      '<div class="opts" style="margin:8px 0"><label><input type="checkbox" id="hdev"' + (HS.dev ? ' checked' : '') + '> 📱 Use my phone’s Swedish voice</label>' +
      '<label><input type="checkbox" id="hin"' + (HS.intro ? ' checked' : '') + '> Read the instructions aloud</label></div>' +
      '<div class="player" style="position:sticky"><div class="status" id="tstat">Press ▶ Start at task 1. The test then runs by itself.</div><div class="bar"><i id="tfill"></i></div>' +
      '<div class="row"><button class="btn" id="tskip">Skip ⏭</button><button class="btn" id="tstop">■ Stop</button></div></div>';
    st.tasks.forEach(function (t, ti) {
      html += '<div class="exam" style="margin-top:14px" id="task' + ti + '"><div class="head"><span>Uppgift ' + t.n + ' · ' + esc(t.name) + '</span><span>' + esc(t.kind) + '</span></div><div class="body">' +
        '<div class="sit">' + esc(t.title) + '</div>' + en(t.title_en) + '<p class="small muted">' + esc(t.instr) + '</p>' +
        '<div class="row"><button class="btn primary" data-start="' + ti + '">▶ Start uppgift ' + t.n + '</button></div>';
      t.parts.forEach(function (p, pi) {
        html += '<div class="tpart" data-t="' + ti + '" data-p="' + pi + '">' + (t.parts.length > 1 ? '<p class="small muted" style="margin:12px 0 0"><b>Del ' + (pi + 1) + '</b></p>' : '') +
          p.qs.map(function (q, i) { var off = t.parts.slice(0, pi).reduce(function (n, pp) { return n + pp.qs.length; }, 0); return qBlock(q, i, 'x' + ti + '_' + pi + '_').replace('<b>' + (i + 1) + '.</b>', '<b>' + (off + i + 1) + '.</b>'); }).join('') +
          '<div class="model hidden tx"><div class="small muted">Texten – tap a sentence to hear it again:</div>' + p.lines.map(function (l, li) { return '<p class="rl" data-ti="' + ti + '" data-pi="' + pi + '" data-li="' + li + '" style="cursor:pointer"><b>' + (l.s === 'f' ? '♀' : '♂') + '</b> ' + esc(l.sv) + ' 🔊<br><span class="en">' + esc(l.en) + '</span></p>'; }).join('') + '</div></div>';
      });
      html += '</div></div>';
    });
    html += '<div class="row" style="margin-top:14px"><button class="btn primary" id="check">Rätta – check answers</button><button class="btn" id="nextS">Next mock test ›</button></div><p id="score" class="sit"></p>';
    h(html);
    function devVoices() {
      var vs = (window.speechSynthesis ? speechSynthesis.getVoices() : []).filter(function (v) { return /^sv/i.test(v.lang); });
      var a = pickVoice(), b = vs.filter(function (v) { return v !== a; })[0] || a;
      return { m: a, n: a, f: b, same: b === a };
    }
    function sayLines(lines, my) {
      var V = devVoices(), i = 0;
      return new Promise(function (res, rej) {
        function next() {
          if (my !== tok) return rej();
          if (i >= lines.length) { skipFn = null; return res(); }
          var l = lines[i++], u = new SpeechSynthesisUtterance(l.sv);
          u.lang = 'sv-SE'; u.rate = S.rate; u.voice = V[l.s || 'n'] || null; if (V.same && l.s === 'f') u.pitch = 1.25;
          var done = false; function fin() { if (!done) { done = true; clearTimeout(g); setTimeout(next, 350); } }
          var g = setTimeout(fin, 3000 + l.sv.length * 120 / S.rate);
          u.onend = fin; u.onerror = fin; speechSynthesis.speak(u);
        }
        skipFn = function () { speechSynthesis.cancel(); skipFn = null; i = lines.length; res(); };
        speechSynthesis.cancel(); next();
      });
    }
    function stat(t, f) { var s = $('#tstat'); if (s) s.innerHTML = t; var b = $('#tfill'); if (b) b.style.width = (f == null ? 0 : f * 100) + '%'; }
    function stopAll() { tok++; au.ontimeupdate = null; au.pause(); skipFn = null; stopSpeech(); }
    activeStop = stopAll;
    function play(o, lines, label, my) {
      if (HS.dev && window.speechSynthesis) { stat('🗣 ' + label, 0); return sayLines(lines, my); }
      return new Promise(function (res, rej) {
        if (my !== tok) return rej();
        au.src = o; au.currentTime = 0; au.onpause = null;
        stat('<span class="wave"><i></i><i></i><i></i><i></i></span> ' + label, 0);
        au.ontimeupdate = function () { if (au.duration) stat('<span class="wave"><i></i><i></i><i></i><i></i></span> ' + label, au.currentTime / au.duration); };
        au.onended = function () { au.ontimeupdate = null; skipFn = null; my === tok ? res() : rej(); };
        skipFn = function () { au.ontimeupdate = null; au.pause(); skipFn = null; res(); };
        au.play().catch(function () { stat('Tap ▶ Start again (the browser blocked the sound).'); rej(); });
      });
    }
    function wait(sec, label, my) {
      return new Promise(function (res, rej) {
        if (my !== tok) return rej();
        var left = sec, iv = setInterval(tick, 1000);
        function tick() { if (my !== tok) { clearInterval(iv); return rej(); } stat('⏱ ' + label + ' – ' + left + ' s', 1 - left / sec); if (left-- <= 0) { clearInterval(iv); skipFn = null; res(); } }
        skipFn = function () { clearInterval(iv); skipFn = null; res(); };
        tick();
      });
    }
    function seq(ti) {
      stopAll(); var my = tok, t = st.tasks[ti]; cur = ti;
      var box = $('#task' + ti); if (box) box.scrollIntoView({ block: 'start', behavior: 'smooth' });
      var p = Promise.resolve();
      if (HS.intro) p = p.then(function () { return play(t.intro, [{ s: 'n', sv: t.intro_txt }], 'Instruktion', my); });
      if (t.fmt === 'mc') {
        p = p.then(function () { return wait(t.read, 'Läs frågorna', my); })
          .then(function () { return play(t.parts[0].src, t.parts[0].lines, 'Lyssning 1 / 2', my); })
          .then(function () { return play(t.parts[0].src, t.parts[0].lines, 'Lyssning 2 / 2', my); })
          .then(function () { return wait(t.ans, 'Svara', my); });
      } else if (t.fmt === 'rf') {
        t.parts.forEach(function (pt, pi) {
          p = p.then(function () { return wait(t.read, 'Del ' + (pi + 1) + ': läs påståendena', my); })
            .then(function () { return play(pt.src, pt.lines, 'Del ' + (pi + 1) + ' – lyssning 1 / 2', my); })
            .then(function () { return wait(2, 'Snart igen', my); })
            .then(function () { return play(pt.src, pt.lines, 'Del ' + (pi + 1) + ' – lyssning 2 / 2', my); })
            .then(function () { return wait(t.ans, 'Del ' + (pi + 1) + ': svara', my); });
        });
      } else {
        p = p.then(function () { return wait(t.read, 'Läs frågorna', my); })
          .then(function () { return play(t.full, t.parts.reduce(function (a, pp) { return a.concat(pp.lines); }, []), 'Hela diskussionen', my); });
        t.parts.forEach(function (pt, pi) {
          p = p.then(function () { return play(pt.src, pt.lines, 'Del ' + (pi + 1), my); })
            .then(function () { return wait(pt.ans, 'Del ' + (pi + 1) + ': svara på svenska', my); });
        });
      }
      p.then(function () {
        if (ti + 1 < st.tasks.length) { return wait(5, '✔ Uppgift ' + t.n + ' klar – nästa uppgift börjar', my).then(function () { seq(ti + 1); }); }
        stat('✔ Provet är slut. Press “Rätta” to check your answers.'); var c = $('#check'); if (c) c.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }).catch(function () {});
    }
    view.querySelectorAll('[data-start]').forEach(function (b) { b.onclick = function () { seq(+b.dataset.start); }; });
    $('#tskip').onclick = function () { if (skipFn) skipFn(); };
    $('#tstop').onclick = function () { stopAll(); stat('Stopped. Press ▶ Start to begin a task again.'); };
    $('#hdev').onchange = function () { HS.dev = this.checked; save('yki_hft', HS); };
    var rp = new Audio(), rpEnd = 0;
    rp.ontimeupdate = function () { if (rpEnd && rp.currentTime >= rpEnd) { rp.pause(); rpEnd = 0; } };
    view.querySelectorAll('.tx .rl').forEach(function (el) {
      el.onclick = function () {
        stopAll(); rp.pause();
        var pt = st.tasks[+el.dataset.ti].parts[+el.dataset.pi], l = pt.lines[+el.dataset.li];
        view.querySelectorAll('.tx .rl').forEach(function (x) { x.style.background = ''; }); el.style.background = 'rgba(255,200,0,.18)';
        if (HS.dev || l.t == null) { var my = tok; sayLines([l], my).catch(function () {}); return; }
        if (rp.getAttribute('src') !== pt.src) rp.src = pt.src;
        rpEnd = l.e + 0.15; rp.currentTime = Math.max(0, l.t - 0.05); rp.play().catch(function () {});
      };
    });
    $('#hin').onchange = function () { HS.intro = this.checked; save('yki_hft', HS); };
    $('#back').onclick = function () { stopAll(); go('#hft'); };
    $('#nextS').onclick = function () { stopAll(); go('#hft/' + HFT[(k + 1) % HFT.length].id); };
    $('#check').onclick = function () {
      var ok = 0, all = 0;
      st.tasks.forEach(function (t, ti) { t.parts.forEach(function (p, pi) {
        var root = view.querySelector('.tpart[data-t="' + ti + '"][data-p="' + pi + '"]');
        ok += checkQs(root, p.qs); all += p.qs.length; root.querySelector('.tx').classList.remove('hidden');
      }); });
      $('#score').textContent = ok + ' / ' + all + ' rätt' + (ok === all ? ' – Bra jobbat! 🎉' : '');
      DONE['hft-' + st.id] = 1; save('yki_done', DONE);
    };
  }

  function route() {
    RUN++; stopSpeech(); if (activeStop) { try { activeStop(); } catch (e) {} activeStop = null; } if (dlgStop) { dlgStop(); dlgStop = null; }
    var hsh = location.hash.replace(/^#/, ''), m;
    if (hsh === 'guide') guideView();
    else if (hsh === 'listen') listenView();
    else if (hsh === 'hft') hftList();
    else if (hsh.indexOf('hft/') === 0) hftSet(hsh.slice(4));
    else if (hsh === 'hf') hfList();
    else if (hsh.indexOf('hf/') === 0) hfTask(hsh.slice(3));
    else if (hsh === 'lf') lfList();
    else if (hsh.indexOf('lf/') === 0) lfSet(hsh.slice(3));
    else if (hsh === 'tala') tala();
    else if (hsh === 'skriva') writeList();
    else if (hsh.indexOf('w/') === 0) writeTask(hsh.slice(2));
    else if (hsh === 'lasa') readList();
    else if (hsh.indexOf('r/') === 0) readTask(hsh.slice(2));
    else if (hsh === 'material') materialView();
    else if (TASKDEF[hsh]) hub(hsh);
    else if ((m = hsh.match(/^(dialogs|reagera|beratta|asikt)\/words$/))) words(m[1]);
    else if (hsh === 'dialogs/list') dialogList();
    else if ((m = hsh.match(/^(reagera|beratta|asikt)\/list$/))) taskList(m[1]);
    else if (hsh.indexOf('d/') === 0) intro(hsh.slice(2));
    else if (hsh.indexOf('b/') === 0) taskIntro('beratta', hsh.slice(2));
    else if (hsh.indexOf('a/') === 0) taskIntro('asikt', hsh.slice(2));
    else home();
  }
  window.addEventListener('hashchange', route);
  $('#homeBtn').onclick = function () { go(''); home(); };

  /* ---------------- settings dialog ---------------- */
  var dlg = $('#settings');
  $('#settingsBtn').onclick = function () {
    loadVoices();
    $('#setRate').value = String(S.rate); $('#setSeconds').value = String(S.seconds);
    $('#setShowLine').checked = !!S.showLine; $('#setEnglish').checked = !!S.english;
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  };
  dlg.addEventListener('close', function () {
    S.rate = +$('#setRate').value; S.seconds = +$('#setSeconds').value;
    S.showLine = $('#setShowLine').checked; S.english = $('#setEnglish').checked;
    S.voice = $('#setVoice').value || '';
    save('yki_settings', S); route();
  });

  route();
})();
