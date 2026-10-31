/* YKI Exam Mirror – dialog practice. Plain JS, no build step. */
(function () {
  'use strict';
  var DATA = window.YKI_DATA;
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
  function home() {
    stopSpeech(); releaseMic(); location.hash = '';
    var total = allDialogs().length, done = Object.keys(DONE).length;
    h('<h1>YKI Swedish – Exam Mirror</h1>' +
      '<p class="muted">Practise the speaking test of the YKI intermediate level (mellannivå) like in the real exam: you listen, you answer, you are recorded – then you compare.</p>' +
      '<h2>Choose a task</h2><div class="grid">' +
      '<button class="card task" id="goDlg"><span class="badge">' + done + ' / ' + total + ' done</span><b>Dialoger</b><span class="muted small">Listen to the other person and answer each line.</span></button>' +
      '<button class="card task" disabled><span class="badge">soon</span><b>Reagera</b><span class="muted small">React to short situations.</span></button>' +
      '<button class="card task" disabled><span class="badge">soon</span><b>Berätta</b><span class="muted small">Tell about a topic.</span></button>' +
      '<button class="card task" disabled><span class="badge">soon</span><b>Din åsikt</b><span class="muted small">Give your opinion.</span></button>' +
      '</div>' +
      '<div class="notice">Works best in Chrome, Edge or Safari. Allow the microphone when asked. Your recordings stay in your browser – nothing is uploaded.</div>');
    $('#goDlg').onclick = function () { location.hash = '#dialogs'; };
  }

  function dialogList() {
    stopSpeech(); releaseMic();
    var html = '<h1>Dialoger</h1><p class="muted">' + allDialogs().length + ' dialogs in 7 themes. Pick one, or let chance decide.</p>' +
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
    $('#back').onclick = function () { location.hash = '#dialogs'; };
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
        '<div class="model hidden" id="m' + i + '"><div class="sv">' + esc(turn.answer_sv) + ' <button class="btn small say" data-t="' + esc(turn.answer_sv) + '" aria-label="Listen">🔊</button></div>' + en(turn.answer_en) +
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
    $('#list').onclick = function () { location.hash = '#dialogs'; };
    $('#nextD').onclick = function () { var a = allDialogs(), k = a.findIndex(function (x) { return x.d.id === d.id; }); location.hash = '#d/' + a[(k + 1) % a.length].d.id; };
  }

  /* ---------------- router ---------------- */
  function route() {
    var hsh = location.hash;
    if (hsh === '#dialogs') dialogList();
    else if (hsh.indexOf('#d/') === 0) intro(hsh.slice(3));
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
