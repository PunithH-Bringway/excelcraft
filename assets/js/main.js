/* ============================================================
   Excel Craft — main.js
   The L&W scroll-journey engine, matched to Excel Craft, plus
   hold-to-draw, lightbox and client filter. Null-safe for sub-pages.
   ============================================================ */
(function () {
  'use strict';

  var reducedMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function smoothstep(p, e0, e1) { var t = clamp((p - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }

  /* ---------- split text for the hero bands ---------- */
  var ENTRANCE_CLASS = { rise: 'e-rise', scatter: 'e-scatter', grid: 'e-grid', blur: 'e-blur', settle: 'e-settle' };
  function splitBand(band, index) {
    var el = band.querySelector('[data-split]');
    if (!el) return;
    var mode = band.getAttribute('data-entrance') || 'rise';
    var text = el.textContent.trim();
    var r = rng(97 + index * 131);
    el.textContent = '';
    el.classList.add(ENTRANCE_CLASS[mode] || 'e-rise');
    var sr = document.createElement('span'); sr.className = 'sr-only'; sr.textContent = text; el.appendChild(sr);
    var vis = document.createElement('span'); vis.setAttribute('aria-hidden', 'true'); el.appendChild(vis);
    if (mode === 'blur') {
      var soft = document.createElement('span'); soft.className = 'soft'; soft.setAttribute('aria-hidden', 'true'); soft.textContent = text;
      var sharp = document.createElement('span'); sharp.className = 'sharp'; sharp.textContent = text;
      vis.appendChild(sharp); el.appendChild(soft);
      return;
    }
    var words = text.split(' ');
    var totalChars = text.replace(/ /g, '').length;
    var ci = 0;
    words.forEach(function (word, wi) {
      var w = document.createElement('span'); w.className = 'w';
      if (mode === 'rise' || mode === 'settle') w.style.setProperty('--th', (wi / Math.max(1, words.length) * 0.5 + r() * 0.05).toFixed(3));
      for (var i = 0; i < word.length; i++) {
        var c = document.createElement('span'); c.className = 'c'; c.textContent = word.charAt(i);
        if (mode === 'scatter') {
          c.style.setProperty('--th', (r() * 0.55).toFixed(3));
          c.style.setProperty('--jx', ((r() - 0.5) * 90).toFixed(1) + 'px');
          c.style.setProperty('--jy', ((r() - 0.5) * 70).toFixed(1) + 'px');
          c.style.setProperty('--jr', ((r() - 0.5) * 24).toFixed(1) + 'deg');
        } else if (mode === 'grid') {
          c.style.setProperty('--th', (ci / Math.max(1, totalChars) * 0.5 + r() * 0.06).toFixed(3));
          c.style.setProperty('--jx', ((r() - 0.5) * 120).toFixed(1) + 'px');
        }
        w.appendChild(c); ci++;
      }
      vis.appendChild(w);
      if (wi < words.length - 1) vis.appendChild(document.createTextNode(' '));
    });
  }

  /* ---------- hero scrub engine: camera travels down the drawing line ---------- */
  var hero = $('.hero'), cam = $('.cam'), cue = $('.cue');
  var stepsEls = $$('.hero-steps span');
  var bands = $$('.band').map(function (el, i) {
    splitBand(el, i);
    return { el: el, a: parseFloat(el.getAttribute('data-a')), b: parseFloat(el.getAttribute('data-b')), op: -1, k: -1, ks: -1, kb: -1, first: i === 0, last: el.classList.contains('band-5') };
  });
  var target = 0, shown = 0, rafId = null, lastTick = 0;
  var heroOnScreen = true, scrubOn = false, heroRange = 1;
  var loadK = 0, loadStart = 0;
  var camScale = -1, litSteps = -1, cueHidden = false, navSolid = false;
  var nav = document.getElementById('nav');
  if (nav.hasAttribute('data-solid')) nav.classList.add('solid');

  function measure() { if (hero) heroRange = Math.max(1, hero.offsetHeight - window.innerHeight); }
  function heroProgress() { return clamp(window.scrollY / heroRange, 0, 1); }

  function updateCaptions(p, now) {
    if (loadStart && loadK < 1) { loadK = clamp((now - loadStart) / 1400, 0, 1); loadK = loadK * loadK * (3 - 2 * loadK); }
    for (var i = 0; i < bands.length; i++) {
      var bd = bands[i];
      var f = Math.min(0.02, (bd.b - bd.a) / 3);
      var op = smoothstep(p, bd.a, bd.a + f) * (1 - smoothstep(p, bd.b - f, bd.b));
      if (bd.first) op = 1 - smoothstep(p, bd.b - f, bd.b);
      if (bd.last) op = smoothstep(p, bd.a, bd.a + f);
      var ramp = Math.min(0.025, (bd.b - bd.a) * 0.35);
      var k = clamp((p - bd.a) / ramp, 0, 1);
      if (bd.first) k = Math.max(k, loadK);
      if (Math.abs(op - bd.op) > 0.015 || (op > 0) !== (bd.op > 0)) { bd.op = op; bd.el.style.opacity = op.toFixed(3); }
      var on = op > 0.04;
      if (on !== bd.on) { bd.on = on; bd.el.classList.toggle('on', on); }
      if (Math.abs(k - bd.k) > 0.008 || (k === 1) !== (bd.k === 1) || (k === 0) !== (bd.k === 0)) {
        bd.k = k;
        bd.el.style.setProperty('--k', k.toFixed(3));
        if (bd.last) {
          var ks = clamp((k - 0.55) * 3.2, 0, 1), kb = clamp((k - 0.72) * 4, 0, 1);
          if (Math.abs(ks - bd.ks) > 0.008) { bd.ks = ks; bd.el.style.setProperty('--ks', ks.toFixed(3)); }
          if (Math.abs(kb - bd.kb) > 0.008) { bd.kb = kb; bd.el.style.setProperty('--kb', kb.toFixed(3)); }
        }
      }
    }
    var s = 1.04 + p * 0.42; /* push toward the vanishing point of the line */
    if (Math.abs(s - camScale) > 0.0008) { camScale = s; cam.style.transform = 'translate3d(' + (p * 2).toFixed(2) + '%,0,0) scale(' + s.toFixed(4) + ')'; }
    var lit = Math.min(5, Math.floor(p * 5.999));
    if (lit !== litSteps) { litSteps = lit; for (var j = 0; j < stepsEls.length; j++) stepsEls[j].classList.toggle('lit', j < lit); }
    var hide = p > 0.03;
    if (hide !== cueHidden) { cueHidden = hide; if (cue) cue.style.opacity = hide ? '0' : ''; }
    var solid = p > 0.9 || window.scrollY > hero.offsetHeight - window.innerHeight * 1.2;
    if (solid !== navSolid) { navSolid = solid; nav.classList.toggle('solid', solid); }
  }
  function tick(now) {
    var dt = Math.min(100, now - (lastTick || now));
    lastTick = now;
    shown += (target - shown) * (1 - Math.pow(1 - 0.16, dt / 16.667));
    if (Math.abs(target - shown) < 0.0005 && loadK >= 1) { shown = target; rafId = null; lastTick = 0; }
    else rafId = requestAnimationFrame(tick);
    updateCaptions(shown, now);
  }
  function kick() { if (rafId === null && heroOnScreen && scrubOn) rafId = requestAnimationFrame(tick); }
  function onScroll() { target = heroProgress(); kick(); }
  function onScrollStatic() {
    if (nav.hasAttribute('data-solid')) return;
    var solid = window.scrollY > window.innerHeight * 0.6;
    if (solid !== navSolid) { navSolid = solid; nav.classList.toggle('solid', solid); }
  }
  if (hero) new IntersectionObserver(function (en) { heroOnScreen = en[en.length - 1].isIntersecting; if (heroOnScreen) kick(); }).observe(hero);

  var GATES = ['(max-width: 720px)', '(orientation: portrait) and (max-width: 1024px)', '(orientation: portrait) and (pointer: coarse)',
    '(orientation: landscape) and (pointer: coarse) and (max-height: 560px)', '(prefers-reduced-motion: reduce)'];
  var MQLS = GATES.map(function (q) { return window.matchMedia(q); });
  function enableScrub() {
    if (scrubOn) return;
    scrubOn = true;
    window.removeEventListener('scroll', onScrollStatic);
    window.addEventListener('scroll', onScroll, { passive: true });
    measure();
    bands.forEach(function (bd) { bd.op = -1; bd.k = -1; bd.ks = -1; bd.kb = -1; bd.on = null; });
    camScale = -1; litSteps = -1; cueHidden = false;
    if (!loadStart) loadStart = performance.now();
    target = shown = heroProgress();
    updateCaptions(shown, performance.now());
    kick();
  }
  function disableScrub() {
    if (!scrubOn) { window.addEventListener('scroll', onScrollStatic, { passive: true }); onScrollStatic(); return; }
    scrubOn = false;
    window.removeEventListener('scroll', onScroll);
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; lastTick = 0; }
    window.addEventListener('scroll', onScrollStatic, { passive: true });
    onScrollStatic();
  }
  function applyHeroMode() {
    if (!hero) { window.addEventListener('scroll', onScrollStatic, { passive: true }); onScrollStatic(); return; }
    if (MQLS.some(function (m) { return m.matches; })) disableScrub(); else enableScrub();
  }
  MQLS.forEach(function (m) { if (m.addEventListener) m.addEventListener('change', applyHeroMode); else m.addListener(applyHeroMode); });
  window.addEventListener('resize', function () { measure(); if (scrubOn) onScroll(); });

  /* ---------- reveal with stagger retirement ---------- */
  var revealIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      var el = en.target;
      el.classList.add('in');
      revealIO.unobserve(el);
      if (el.classList.contains('stagger')) setTimeout(function () { el.classList.add('done'); }, el.children.length * 100 + 900);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  $$('.reveal,.stagger').forEach(function (el) { revealIO.observe(el); });

  /* ---------- counters ---------- */
  function animateCounter(el) {
    var raw = el.getAttribute('data-count');
    var end = parseFloat(raw), dec = (raw.split('.')[1] || '').length;
    var plain = el.hasAttribute('data-plain');
    var unit = el.querySelector('small'), unitHTML = unit ? unit.outerHTML : '';
    function fmt(v) { return (plain ? String(v) : v.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec })) + unitHTML; }
    if (plain || reducedMQ.matches) { el.innerHTML = fmt(end); return; }
    var t0 = performance.now(), last = '';
    function step(now) {
      var t = clamp((now - t0) / 1400, 0, 1);
      var v = end * (1 - Math.pow(1 - t, 3));
      v = dec ? Number(v.toFixed(dec)) : Math.round(v);
      var h = fmt(v);
      if (h !== last) { last = h; el.innerHTML = h; }
      if (t < 1) requestAnimationFrame(step); else el.innerHTML = fmt(end);
    }
    requestAnimationFrame(step);
  }
  var statsBox = document.getElementById('stats'), countersRun = false;
  function runCounters() { if (countersRun) return; countersRun = true; $$('[data-count]', statsBox).forEach(animateCounter); }
  if (statsBox) {
    var statIO = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { runCounters(); statIO.disconnect(); } }, { threshold: 0.3 });
    statIO.observe(statsBox);
  }

  /* ---------- timeline arrows ---------- */
  var tlScroll = document.getElementById('tl-scroll');
  if (tlScroll) {
    var tlStep = function () { return Math.min(tlScroll.clientWidth * 0.8, 560); };
    $('#tl-prev').addEventListener('click', function () { tlScroll.scrollBy({ left: -tlStep(), behavior: reducedMQ.matches ? 'auto' : 'smooth' }); });
    $('#tl-next').addEventListener('click', function () { tlScroll.scrollBy({ left: tlStep(), behavior: reducedMQ.matches ? 'auto' : 'smooth' }); });
  }

  /* ---------- nav: dropdowns, burger, mobile menu ---------- */
  function closeDrops(except) {
    $$('.has-drop.open').forEach(function (li) {
      if (li === except) return;
      li.classList.remove('open');
      li.querySelector('.menu-top').setAttribute('aria-expanded', 'false');
    });
  }
  $$('.has-drop').forEach(function (li) {
    var btn = li.querySelector('.menu-top');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = li.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      closeDrops(li);
    });
    li.addEventListener('mouseenter', function () { btn.setAttribute('aria-expanded', 'true'); });
    li.addEventListener('mouseleave', function () { li.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); });
  });
  document.addEventListener('click', function () { closeDrops(null); });
  $$('.drop a').forEach(function (a) { a.addEventListener('click', function () { closeDrops(null); a.blur(); }); });

  var burger = document.getElementById('burger'), mobileMenu = document.getElementById('mobile-menu');
  function closeMobile() {
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Open menu');
    mobileMenu.hidden = true;
    document.body.style.overflow = '';
  }
  burger.addEventListener('click', function () {
    if (burger.getAttribute('aria-expanded') === 'true') { closeMobile(); burger.focus(); return; }
    burger.setAttribute('aria-expanded', 'true');
    burger.setAttribute('aria-label', 'Close menu');
    mobileMenu.hidden = false;
    document.body.style.overflow = 'hidden';
    var first = mobileMenu.querySelector('summary, a');
    if (first) first.focus();
  });
  var desktopMQ = window.matchMedia('(min-width: 1121px)');
  function onDesktopChange(e) { if (e.matches) closeMobile(); }
  if (desktopMQ.addEventListener) desktopMQ.addEventListener('change', onDesktopChange); else desktopMQ.addListener(onDesktopChange);
  $$('a', mobileMenu).forEach(function (a) { a.addEventListener('click', closeMobile); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeMobile(); closeDrops(null); } });

  /* ---------- the interactive moment: hold to draw the wire ----------
     8 passes, 14 mm rod to 0.6 mm wire. Volume constancy gives the
     exit speed: v = 30 m/s x (0.6 / d)^2. */
  var holdBtn = document.getElementById('hold-btn');
  var rig = document.getElementById('draw-svg');
  var PASSES = 8, D0 = 14, D1 = 0.6, VMAX = 30;
  var caps = rig ? $$('.cap', rig) : [], rots = rig ? $$('.rot', rig) : [], segs = rig ? $$('.wire', rig) : [];
  var facts = $$('#draw-facts li');
  var outD = document.getElementById('read-d'), outV = document.getElementById('read-v'), outR = document.getElementById('read-r');
  var holding = false, holdP = 0, holdRaf = null, holdLast = 0, holdDone = false, spin = 0;
  var shownD = '', shownV = '', shownR = '';
  function diaAt(x) { return D0 * Math.pow(D1 / D0, x); }
  function paintRig(p) {
    var d = diaAt(p), v = p <= 0 ? 0 : VMAX * Math.pow(D1 / d, 2), red = (1 - Math.pow(d / D0, 2)) * 100;
    var sd = d.toFixed(d < 1 ? 2 : 1), sv = v.toFixed(v < 1 ? 2 : 1), sr = red.toFixed(1);
    if (sd !== shownD) { shownD = sd; outD.textContent = sd; }
    if (sv !== shownV) { shownV = sv; outV.textContent = sv; }
    if (sr !== shownR) { shownR = sr; outR.textContent = sr; }
    var edge = p * segs.length; /* rod in, 7 gaps, wire out */
    segs.forEach(function (sg, i) { sg.style.strokeDashoffset = (1 - clamp(edge - i, 0, 1)).toFixed(3); });
    caps.forEach(function (c, i) { c.classList.toggle('hot', edge > i + 1); });
  }
  function drawComplete() {
    holdDone = true; holdP = 1;
    holdBtn.classList.add('done');
    holdBtn.querySelector('.hold-label').textContent = 'Drawn. 14 mm to 0.6 mm';
    holdBtn.style.setProperty('--hd', 0);
    paintRig(1);
    facts.forEach(function (li, i) { setTimeout(function () { li.classList.add('lit'); }, reducedMQ.matches ? 0 : i * 140); });
  }
  function holdFrame(now) {
    var dt = Math.min(80, now - (holdLast || now));
    holdLast = now;
    if (!holdDone) holdP = clamp(holdP + (holding ? dt / 3200 : -dt / 1100), 0, 1);
    spin += dt * 0.02;
    rots.forEach(function (r, i) { /* downstream capstans turn faster, as they must */
      var sp = holdP * PASSES > i ? Math.pow(D1 / diaAt(i / PASSES), 2) : 0;
      r.style.transform = 'rotate(' + ((spin * (0.6 + sp * 1.5)) % 360).toFixed(1) + 'deg)';
    });
    if (!holdDone) {
      paintRig(holdP);
      holdBtn.style.setProperty('--hd', Math.round(126 * (1 - holdP)));
      if (holdP >= 1) drawComplete();
    }
    if ((holdP <= 0 && !holding) || document.hidden || reducedMQ.matches) { holdRaf = null; holdLast = 0; return; }
    holdRaf = requestAnimationFrame(holdFrame);
  }
  function holdStart(e) {
    if (holdDone) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    if (e.type === 'keydown' && e.repeat) return;
    if (e.type === 'keydown' || e.type === 'pointerdown') e.preventDefault();
    holding = true;
    if (holdRaf === null) holdRaf = requestAnimationFrame(holdFrame);
  }
  function holdEnd(e) { if (e && e.type === 'keyup' && e.key !== 'Enter' && e.key !== ' ') return; holding = false; }
  if (holdBtn && rig) {
    segs.forEach(function (sg) { sg.style.strokeDasharray = '1 1'; sg.style.strokeDashoffset = '1'; });
    paintRig(0);
    if (reducedMQ.matches) drawComplete();
    holdBtn.addEventListener('pointerdown', holdStart);
    window.addEventListener('pointerup', holdEnd);
    holdBtn.addEventListener('pointerleave', holdEnd);
    holdBtn.addEventListener('keydown', holdStart);
    holdBtn.addEventListener('keyup', holdEnd);
    holdBtn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  /* ---------- lightbox (gallery + machine photos) ---------- */
  var lb = document.getElementById('lightbox');
  if (lb) {
    var items = $$('[data-full]'), lbImg = $('img', lb), lbCap = $('p', lb), cur = 0;
    function openLb(i) {
      cur = (i + items.length) % items.length;
      lbImg.src = items[cur].getAttribute('data-full');
      lbImg.alt = items[cur].getAttribute('data-alt') || '';
      lbCap.textContent = (items[cur].getAttribute('data-alt') || '') + '  ·  ' + (cur + 1) + ' / ' + items.length;
      if (!lb.open) lb.showModal();
    }
    items.forEach(function (b, i) { b.addEventListener('click', function () { openLb(i); }); });
    $('.lb-close', lb).addEventListener('click', function () { lb.close(); });
    $('.lb-prev', lb).addEventListener('click', function () { openLb(cur - 1); });
    $('.lb-next', lb).addEventListener('click', function () { openLb(cur + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) lb.close(); });
    lb.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft') openLb(cur - 1); if (e.key === 'ArrowRight') openLb(cur + 1); });
  }

  /* ---------- client table filter ---------- */
  var filterBtns = $$('[data-filter]');
  filterBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      var f = b.getAttribute('data-filter');
      filterBtns.forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
      $$('[data-kind]').forEach(function (row) { row.hidden = f !== 'all' && row.getAttribute('data-kind').split(' ').indexOf(f) === -1; });
    });
  });

  /* ---------- embers: drifting sparks from the drawing floor ---------- */
  var canvas = document.getElementById('motes');
  var ctx = canvas ? canvas.getContext('2d') : null;
  var motesOn = false, motesRaf = null, motes = [], moteLast = 0;
  function sizeCanvas() {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function initMotes() {
    var r = rng(7); motes = [];
    var n = Math.round(Math.min(40, window.innerWidth / 36));
    for (var i = 0; i < n; i++) motes.push({ x: r() * 100, y: r() * 100, vx: (r() - 0.5) * 0.012, vy: -(0.005 + r() * 0.018), s: 0.6 + r() * 1.5, a: 0.05 + r() * 0.18, ph: r() * Math.PI * 2 });
  }
  function moteFrame(now) {
    if (!motesOn) { motesRaf = null; return; }
    var dt = Math.min(80, now - (moteLast || now));
    moteLast = now;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i];
      m.x += m.vx * dt; m.y += m.vy * dt;
      if (m.y < -2) { m.y = 102; m.x = (m.x + 37) % 100; }
      if (m.x < -2) m.x = 102;
      if (m.x > 102) m.x = -2;
      var tw = 0.62 + 0.38 * Math.sin(now / 1600 + m.ph);
      ctx.beginPath();
      ctx.arc(m.x / 100 * w, m.y / 100 * h, m.s, 0, 6.2832);
      ctx.fillStyle = 'rgba(255,92,64,' + (m.a * tw).toFixed(3) + ')';
      ctx.fill();
    }
    motesRaf = requestAnimationFrame(moteFrame);
  }
  function startMotes() {
    if (!ctx || reducedMQ.matches || document.hidden || motesOn) return;
    motesOn = true; sizeCanvas();
    if (!motes.length) initMotes();
    if (motesRaf === null) motesRaf = requestAnimationFrame(moteFrame);
  }
  function stopMotes() {
    motesOn = false; moteLast = 0;
    if (motesRaf !== null) { cancelAnimationFrame(motesRaf); motesRaf = null; }
    if (ctx) ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  }
  if (canvas) window.addEventListener('resize', function () { if (motesOn) sizeCanvas(); });
  document.addEventListener('visibilitychange', function () {
    document.body.classList.toggle('paused', document.hidden);
    if (document.hidden) stopMotes(); else startMotes();
  });

  /* ---------- reduced motion, honored live ---------- */
  function pinToFinalStates() {
    stopMotes();
    $$('.reveal,.stagger').forEach(function (el) { el.classList.add('in', 'done'); });
    if (statsBox) runCounters();
    if (holdBtn && rig && !holdDone) drawComplete();
  }
  function onReducedChange(e) { if (e.matches) { pinToFinalStates(); applyHeroMode(); } else { applyHeroMode(); startMotes(); } }
  if (reducedMQ.addEventListener) reducedMQ.addEventListener('change', onReducedChange); else reducedMQ.addListener(onReducedChange);

  /* ---------- enquiry form: honest mailto composer ---------- */
  var ENQUIRY_TO = 'bgm@excelcraft.in';
  var form = document.getElementById('enquiry');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('#f-name', form).value.trim(), org = $('#f-org', form).value.trim();
      var phone = $('#f-phone', form).value.trim(), machine = $('#f-machine', form).value;
      var msg = $('#f-msg', form).value.trim(), note = document.getElementById('form-note');
      if (!name || !msg) {
        note.textContent = 'Add your name and a line about the wire or cable you need to make, then press send.';
        (!name ? $('#f-name', form) : $('#f-msg', form)).focus();
        return;
      }
      var subject = 'Machinery enquiry' + (machine ? ': ' + machine : '') + ' from ' + name + (org ? ' (' + org + ')' : '');
      var body = msg + '\n\n' + name + (org ? '\n' + org : '') + (phone ? '\n' + phone : '');
      window.location.href = 'mailto:' + ENQUIRY_TO + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      note.textContent = 'Your email app should now be open with the enquiry drafted. Press send there and it reaches ' + ENQUIRY_TO + '.';
      note.classList.add('sent');
    });
  }

  var yr = document.getElementById('year');
  if (yr) yr.textContent = String(new Date().getFullYear());
  function boot() {
    document.body.classList.add('ready');
    applyHeroMode();
    startMotes();
    if (reducedMQ.matches) pinToFinalStates();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
