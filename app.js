/* YKI Exam Mirror – dialog practice. Plain JS, no build step. */
(function () {
  'use strict';
  var DATA = window.YKI_DATA, TK = window.YKI_TOOLKIT, TASKS = window.YKI_TASKS;
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
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function en(text) { return S.english && text ? '<div class="en">' + esc(text) + '</div>' : ''; }

  /* ---------------- speech ---------------- */
  var voices = [];
  function loadVoices() {
    if (!('speechSynthesis' in window)) return;
    voices = speechSynthesis.getVoices().filter(function (v) { return /^sv/i.test(v.lang); });
    var sel = $('#setVoice'); if (!sel) return;
    sel.innerHTML = voices.length ? voices.map(function (v) { return '<option value="' + esc(v.name) + '">' + esc(v.name + ' (' + v.lang + ')') + '</option>'; }).join('')
      : '<option value="">No Swedish voice on this device</option>';
    if (S.voice) sel.value = S.voice;
    $('#voiceNote').textContent = voices.length ? '' : 'Your device has no Swedish voice. Add one in your system settings (Speech / Text-to-speech, language Swedish) and reload the page.';
  }
  if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  function pickVoice() { return voices.filter(function (v) { return v.name === S.voice; })[0] || voices.filter(function (v) { return /sv-SE/i.test(v.lang); })[0] || voices[0] || null; }

  function speak(text) {
    return new Promise(function (resolve) {
      if (!('speechSynthesis' in window) || !text) { resolve(); return; }
      speechSynthesis.cancel();
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

  function home() {
    stopSpeech(); releaseMic();
    h('<h1>YKI Swedish – Exam Mirror</h1>' +
      '<p class="muted">Practise the speaking test of the YKI intermediate level (mellannivå) like in the real exam: you listen, you answer, you are recorded – then you compare with a model answer.</p>' +
      '<h2>Choose a task</h2><div class="grid">' +
      Object.keys(TASKDEF).map(function (k) {
        var t = TASKDEF[k];
        return '<button class="card task" data-k="' + k + '"><span class="badge">' + taskCount(k) + '</span><b>' + t.name + '</b><span class="muted small">' + t.desc + '</span></button>';
      }).join('') + '</div>' +
      '<div class="notice">Every task has a <b>Words &amp; toolkit</b> page: the words you will see in the instructions and ready-made sentences. All model answers are built from that toolkit, so learn it first, then practise.</div>' +
      '<div class="notice">Works best in Chrome, Edge or Safari. Allow the microphone when asked. Your recordings stay in your browser – nothing is uploaded.</div>');
    view.querySelectorAll('.task').forEach(function (b) { b.onclick = function () { location.hash = '#' + b.dataset.k; }; });
  }

  function hub(key) {
    stopSpeech(); releaseMic();
    var t = TASKDEF[key];
    var n = key === 'dialogs' ? allDialogs().length + ' dialogs' : TASKS[key].length + ' tasks';
    h('<p><button class="btn" id="back">← Home</button></p><h1>' + t.name + '</h1><p class="muted">' + t.desc + '</p>' +
      '<div class="grid">' +
      '<button class="card task" id="goWords"><span class="badge">learn first</span><b>📘 Words &amp; toolkit</b><span class="muted small">The words in the instructions and the ready answers to memorise.</span></button>' +
      '<button class="card task" id="goPractice"><span class="badge">' + taskCount(key) + '</span><b>🎙 Exercises</b><span class="muted small">' + n + ' – answer, get recorded, compare with the model answer.</span></button>' +
      '</div>');
    $('#back').onclick = function () { location.hash = ''; };
    $('#goWords').onclick = function () { location.hash = '#' + key + '/words'; };
    $('#goPractice').onclick = function () { location.hash = '#' + key + '/list'; };
  }

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
    $('#back').onclick = function () { location.hash = '#' + key; };
    $('#toEx').onclick = function () { location.hash = '#' + key + '/list'; };
  }

  function dialogList() {
    stopSpeech(); releaseMic();
    var html = '<p><button class="btn" id="back">← Dialoger</button></p><h1>Dialoger – exercises</h1><p class="muted">' + allDialogs().length + ' dialogs in 7 themes. Pick one, or let chance decide.</p>' +
      '<div class="row"><button class="btn primary" id="rand">🎲 Random dialog</button><button class="btn" id="randNew">Random – not done yet</button></div>';
    DATA.themes.forEach(function (t, i) {
      var done = t.dialogs.filter(function (d) { return DONE[d.id]; }).length;
      html += '<details class="theme"' + (i === 0 ? ' open' : '') + '><summary>' + t.id + '. ' + esc(t.sv) + ' <span class="muted small">– ' + esc(t.en) + ' · ' + done + '/' + t.dialogs.length + '</span></summary>';
      t.dialogs.forEach(function (d) {
        html += '<button class="dlg-link" data-id="' + d.id + '"><span><b>Dialog ' + d.n + '.</b> ' + esc(d.situation_sv) + (S.english ? '<br><span class="en">' + esc(d.title_en) + '</span>' : '') + '</span><span class="done">' + (DONE[d.id] ? '✓' : '') + '</span></button>';
      });
      html += '</details>';
    });
    h(html);
    $('#back').onclick = function () { location.hash = '#dialogs'; };
    view.querySelectorAll('.dlg-link').forEach(function (b) { b.onclick = function () { location.hash = '#d/' + b.dataset.id; }; });
    $('#rand').onclick = function () { var a = allDialogs(); location.hash = '#d/' + a[Math.floor(Math.random() * a.length)].d.id; };
    $('#randNew').onclick = function () { var a = allDialogs().filter(function (x) { return !DONE[x.d.id]; }); if (!a.length) a = allDialogs(); location.hash = '#d/' + a[Math.floor(Math.random() * a.length)].d.id; };
  }

  function examHead(t, d) { return '<div class="head"><span>Dialog ' + d.n + '. ' + esc(t.sv) + '</span><span>' + d.speaker + ' / Du</span></div>'; }

  function intro(id) {
    var x = findDialog(id); if (!x) { dialogList(); return; }
    var t = x.t, d = x.d;
    h('<p><button class="btn" id="back">← All dialogs</button></p>' +
      '<div class="exam">' + examHead(t, d) + '<div class="body">' +
      '<div class="sit">' + esc(d.situation_sv) + '</div>' + en(d.situation_en) +
      '<p class="muted small">' + d.turns.length + ' lines. For each line: you hear <b>' + esc(d.speaker) + '</b>, then you see what to do in brackets, then you have time to answer (recording).</p>' +
      '<div class="row"><button class="btn primary" id="start">Start the dialog</button><button class="btn" id="peek">Just read the model answers</button></div>' +
      '<p class="muted small" id="micNote"></p></div></div>');
    $('#back').onclick = function () { location.hash = '#dialogs/list'; };
    $('#start').onclick = function () { run(t, d); };
    $('#peek').onclick = function () { review(t, d, []); };
  }

  function run(t, d) {
    var recs = [], cancelled = false, idx = 0;
    var mr = null, chunks = [], stopTimer = null;
    function stopRecording() { if (mr && mr.state === 'recording') mr.stop(); }

    function render(i, phase) {
      var turn = d.turns[i];
      var steps = d.turns.map(function (_, k) { return '<i class="' + (k < i ? 'on' : k === i ? 'cur' : '') + '"></i>'; }).join('');
      h('<div class="exam">' + examHead(t, d) + '<div class="body">' +
        '<div class="small muted">' + esc(d.situation_sv) + '</div><div class="steps">' + steps + '</div>' +
        '<div class="stage" id="stage"></div>' +
        '<div class="row end"><button class="btn" id="quit">Stop</button></div></div></div>');
      $('#quit').onclick = function () { cancelled = true; stopSpeech(); stopRecording(); clearInterval(stopTimer); location.hash = '#d/' + d.id; intro(d.id); };
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
      if (cancelled) return;
      if (idx >= d.turns.length) { DONE[d.id] = 1; save('yki_done', DONE); review(t, d, recs); return; }
      var turn = d.turns[idx], stage = render(idx);
      listen(stage, turn).then(function () { if (cancelled) return; return answer(stage, turn); }).then(function () { if (cancelled) return; idx++; next(); });
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
        (recs[i] ? '<div class="small muted">Your answer:</div><audio controls src="' + recs[i] + '"></audio>' : (recs.length ? '<div class="small muted">(no recording)</div>' : '')) +
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
    $('#list').onclick = function () { location.hash = '#dialogs/list'; };
    $('#nextD').onclick = function () { var a = allDialogs(), k = a.findIndex(function (x) { return x.d.id === d.id; }); location.hash = '#d/' + a[(k + 1) % a.length].d.id; };
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
        '<div class="row"><button class="btn primary" id="rand">🎲 Random set of 5</button><button class="btn" id="randNew">5 not done yet</button></div>';
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
        html += '<button class="dlg-link" data-id="' + x.id + '"><span>' + (x.n ? '<b>' + x.n + '.</b> ' : '') + esc(x.sv) + (S.english ? '<br><span class="en">' + esc(x.en) + '</span>' : '') + '</span><span class="done">' + (DONE[x.id] ? '✓' : '') + '</span></button>';
      });
      html += '</details>';
    });
    h(html);
    $('#back').onclick = function () { location.hash = '#' + key; };
    if (key === 'reagera') {
      $('#rand').onclick = function () { runTasks(key, shuffle(items).slice(0, 5)); };
      $('#randNew').onclick = function () { var a = items.filter(function (x) { return !DONE[x.id]; }); if (a.length < 5) a = items; runTasks(key, shuffle(a).slice(0, 5)); };
      view.querySelectorAll('.setBtn').forEach(function (b) { b.onclick = function () { runTasks(key, items.filter(function (x) { return x.theme === +b.dataset.th; })); }; });
      view.querySelectorAll('.dlg-link').forEach(function (b) { b.onclick = function () { runTasks(key, [findTask(key, b.dataset.id)]); }; });
    } else {
      var go = function (x) { location.hash = '#' + PREFIX[key] + '/' + x.id; };
      $('#rand').onclick = function () { go(items[Math.floor(Math.random() * items.length)]); };
      $('#randNew').onclick = function () { var a = items.filter(function (x) { return !DONE[x.id]; }); if (!a.length) a = items; go(a[Math.floor(Math.random() * a.length)]); };
      view.querySelectorAll('.dlg-link').forEach(function (b) { b.onclick = function () { go(findTask(key, b.dataset.id)); }; });
    }
  }

  function taskHead(key, x) { return '<div class="head"><span>' + TASKDEF[key].name + ' · ' + esc(themeName(x.theme)) + '</span><span>Du</span></div>'; }
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
      '<div class="row"><button class="btn primary" id="start">Start</button><button class="btn" id="peek">Just read the model answer</button><button class="btn" id="tk">📘 Toolkit</button></div></div></div>');
    $('#back').onclick = function () { location.hash = '#' + key + '/list'; };
    $('#start').onclick = function () { runTasks(key, [x]); };
    $('#peek').onclick = function () { taskReview(key, [x], []); };
    $('#tk').onclick = function () { location.hash = '#' + key + '/words'; };
  }

  /* one generic recorder: returns a Promise of a blob URL (or null) */
  function recordFor(stage, secs, topHtml, btnLabel) {
    return beep().then(function () {
      return new Promise(function (resolve) {
        var startT = Date.now(), chunks = [], mr = null, finished = false, timer;
        stage.innerHTML = '<div class="status"><span class="dot"></span> Svara nu – <span id="left">' + secs + '</span> s</div>' + topHtml +
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
    var t = TASKDEF[key], recs = [], idx = 0, cancelled = false;
    function render(i) {
      var x = items[i];
      var steps = items.length > 1 ? '<div class="steps">' + items.map(function (_, k) { return '<i class="' + (k < i ? 'on' : k === i ? 'cur' : '') + '"></i>'; }).join('') + '</div>' : '';
      h('<div class="exam">' + taskHead(key, x) + '<div class="body">' + steps +
        '<div class="stage" id="stage"></div><div class="row end"><button class="btn" id="quit">Stop</button></div></div></div>');
      $('#quit').onclick = function () { cancelled = true; stopSpeech(); if (activeStop) activeStop(); location.hash = '#' + key + '/list'; taskList(key); };
      return $('#stage');
    }
    function top(x) { return '<div class="sit">' + esc(x.sv) + '</div>' + en(x.en) + (x.qs ? questions(x) : ''); }
    function next() {
      if (cancelled) return;
      if (idx >= items.length) { items.forEach(function (x) { DONE[x.id] = 1; }); save('yki_done', DONE); taskReview(key, items, recs); return; }
      var x = items[idx], stage = render(idx), p;
      if (key === 'reagera') {
        stage.innerHTML = '<div class="status"><span class="wave"><i></i><i></i><i></i><i></i></span> Situation ' + (idx + 1) + ' / ' + items.length + '</div>' + top(x);
        p = sleep(400).then(function () { return speak(x.sv); }).then(function () { return cancelled ? null : sleep(t.prep * 1000); });
      } else {
        p = prepFor(stage, t.prep, top(x));
      }
      p.then(function () { if (cancelled) return; return recordFor(stage, t.secs, top(x), idx < items.length - 1 ? 'Klar – next ›' : 'Klar ›'); })
       .then(function (url) { if (cancelled) return; recs.push(url); idx++; next(); });
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
      html += '<div class="turn"><div class="sit">' + esc(x.sv) + say(x.sv) + '</div>' + en(x.en) + (x.qs ? questions(x) : '') +
        (recs[i] ? '<div class="small muted">Your answer:</div><audio controls src="' + recs[i] + '"></audio>' : (recs.length ? '<div class="small muted">(no recording)</div>' : '')) +
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
      html += '</div></div>';
    });
    var single = items.length === 1 && key !== 'reagera';
    html += '<div class="row" style="margin-top:14px"><button class="btn primary" id="again">Try again</button>' +
      '<button class="btn" id="nextT">' + (key === 'reagera' ? 'New set of 5 ›' : 'Next topic ›') + '</button><button class="btn" id="list">All ' + (key === 'reagera' ? 'situations' : 'topics') + '</button></div></div></div>';
    h(html);
    bindSay();
    view.querySelectorAll('.reveal').forEach(function (b) { b.onclick = function () { $('#m' + b.dataset.i).classList.remove('hidden'); b.classList.add('hidden'); }; });
    $('#showAll').onclick = function () { view.querySelectorAll('.model').forEach(function (m) { m.classList.remove('hidden'); }); view.querySelectorAll('.reveal').forEach(function (b) { b.classList.add('hidden'); }); };
    $('#enT').onclick = function () { S.english = !S.english; save('yki_settings', S); taskReview(key, items, recs); };
    $('#again').onclick = function () { if (single) taskIntro(key, items[0].id); else runTasks(key, items); };
    $('#list').onclick = function () { location.hash = '#' + key + '/list'; };
    $('#nextT').onclick = function () {
      var all = TASKS[key];
      if (key === 'reagera') { runTasks(key, shuffle(all).slice(0, 5)); return; }
      var k = all.indexOf(items[0]); location.hash = '#' + PREFIX[key] + '/' + all[(k + 1) % all.length].id;
    };
  }

  /* ---------------- router ---------------- */
  function route() {
    var hsh = location.hash.replace(/^#/, ''), m;
    if (TASKDEF[hsh]) hub(hsh);
    else if ((m = hsh.match(/^(dialogs|reagera|beratta|asikt)\/words$/))) words(m[1]);
    else if (hsh === 'dialogs/list') dialogList();
    else if ((m = hsh.match(/^(reagera|beratta|asikt)\/list$/))) taskList(m[1]);
    else if (hsh.indexOf('d/') === 0) intro(hsh.slice(2));
    else if (hsh.indexOf('b/') === 0) taskIntro('beratta', hsh.slice(2));
    else if (hsh.indexOf('a/') === 0) taskIntro('asikt', hsh.slice(2));
    else home();
  }
  window.addEventListener('hashchange', route);
  $('#homeBtn').onclick = function () { location.hash = ''; home(); };

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
