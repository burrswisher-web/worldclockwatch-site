// Terra Firma, drawn live in the browser for worldclockwatch.com.
// EarthTurn's picture turned so the Home meridian points straight down and held there, while the 24-hour ring, the
// office-hours band and the night turn round it. It follows terrafirma.json (the frames, ring, band, moon spots, time
// block and rim marks) and earthturn.json (the projection, night masks, city dots, hatch and colours), both written by
// tools/web.ps1 from the face generators, so the geometry and colours are the watch's own. Face as of 2026-11-05:
// Old Standard lettering, bottle-green bold numerals and time on the vintage map, light blue on the dark map, a white
// home dot, plum and orange zone dots with no zone text, the moon at one of nineteen spots, a gold band from the 9 to
// the 17, a flat rim bar in each dot's colour at that place's clock time. Eclipse paths are not drawn here.
//
// <terrafirma-live map-style="dark|vintage" home="mtx|off" zone1="ind|off" zone2="off|nyc" datechange="line|tint|labels"
//                  moon="h15..h9|off" office="w917|w818|off" at="ISO time" tz="IANA zone">
(function () {
  const PT = 'assets/web-terrafirma/', PE = 'assets/web-earthturn/';
  const G = 450, C = 225;
  const rad = d => d * Math.PI / 180;
  const HALO8 = [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  const HALO_OUTER = [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, -2], [-2, 2], [2, 2]];
  const BOLD = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  const ONE = [[0, 0]];
  const FONT = "'Old Standard', 'Old Standard TT', Georgia, serif";
  const MONO = "'IBM Plex Mono',monospace";
  // canvas 'middle' sits text about 2 px higher than the watch's PartText boxes (checked against the EarthTurn captures)
  const DY = 2;
  const SYNODIC = 29.530588853;
  const MOON_HOURS = [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  class TerraFirmaLive extends HTMLElement {
    connectedCallback() {
      if (this.built) return;
      this.built = true;
      this.style.display = 'block';
      this.styleName = this.getAttribute('map-style') || 'dark';
      this.fixedAt = this.getAttribute('at') || null;
      this.fixedTz = this.getAttribute('tz') || null;
      this.home = this.getAttribute('home') || 'mtx';
      this.zone1 = this.getAttribute('zone1') || 'ind';
      this.zone2 = this.getAttribute('zone2') || 'off';
      this.datechange = this.getAttribute('datechange') || 'line';
      this.moon = this.getAttribute('moon') || 'h15';
      this.office = this.getAttribute('office') || 'w917';
      this.hourOffset = 0;
      this.dayOffset = 0;
      const pill = "cursor:pointer; border:1px solid #2B3D49; background:#0E1720; color:#EAF2F5; padding:7px 14px; border-radius:999px; font:inherit";
      const ghost = "cursor:pointer; border:1px solid #2B3D49; background:transparent; color:#93A2AD; padding:6px 12px; border-radius:6px; font:inherit";
      const select = "cursor:pointer; border:1px solid #2B3D49; background:#0E1720; color:#EAF2F5; padding:6px 10px; border-radius:6px; font:inherit; max-width:100%";
      this.innerHTML = '<div style="display:grid; justify-items:center; gap:16px">'
        + '<canvas role="img" aria-label="Terra Firma watch face, drawn live" style="width:min(340px,84vw); aspect-ratio:1; border-radius:50%; display:block; background:#1A2530"></canvas>'
        + '<div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center; font-family:' + MONO + '; font-size:12px">'
        + '<button data-act="dark" style="' + pill + '">Dark</button>'
        + '<button data-act="vintage" style="' + pill + '">Vintage atlas</button>'
        + '</div>'
        + '<div style="display:grid; gap:12px; justify-items:stretch; width:min(340px,84vw); font-family:' + MONO + '; font-size:11.5px; color:#7E8D97">'
        + '<label style="display:grid; gap:5px"><span style="display:flex; justify-content:space-between; gap:8px"><span>Home, at the bottom</span></span>'
        + '<select data-act="home" style="' + select + '"></select></label>'
        + '<label style="display:grid; gap:5px"><span style="display:flex; justify-content:space-between; gap:8px"><span>Spin the day</span><span data-out="hour" style="color:#B9C6CD"></span></span>'
        + '<input data-act="hour" type="range" min="-12" max="12" step="0.25" value="0" style="width:100%; accent-color:#68D5C0"></label>'
        + '<label style="display:grid; gap:5px"><span style="display:flex; justify-content:space-between; gap:8px"><span>Seasonal sun</span><span data-out="day" style="color:#B9C6CD"></span></span>'
        + '<input data-act="day" type="range" min="-182" max="182" step="1" value="0" style="width:100%; accent-color:#68D5C0"></label>'
        + '<div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center">'
        + '<button data-act="spinDay" style="' + ghost + '">Play a day</button>'
        + '<button data-act="spinYear" style="' + ghost + '">Play a year</button>'
        + '<button data-act="reset" style="' + ghost + '">Back to now</button>'
        + '</div></div></div>';
      this.canvas = this.querySelector('canvas');
      this.addEventListener('input', e => {
        const a = e.target.getAttribute('data-act');
        if (a === 'hour' || a === 'day') this.stopSpin();
        if (a === 'hour') this.hourOffset = Number(e.target.value);
        if (a === 'day') this.dayOffset = Number(e.target.value);
        if (a === 'home') this.home = e.target.value;
        this.draw();
      });
      this.addEventListener('click', e => {
        const a = e.target.getAttribute && e.target.getAttribute('data-act');
        if (a === 'vintage' || a === 'dark') { this.styleName = a; this.markButtons(); this.draw(); }
        if (a === 'spinDay') this.toggleSpin('day');
        if (a === 'spinYear') this.toggleSpin('year');
        if (a === 'reset') {
          this.stopSpin();
          this.hourOffset = 0; this.dayOffset = 0;
          this.syncSliders();
          this.draw();
        }
      });
      this.markButtons();
      this.load();
    }
    disconnectedCallback() { clearInterval(this.timer); this.stopSpin(); }

    markButtons() {
      for (const b of this.querySelectorAll('button[data-act="vintage"],button[data-act="dark"]')) {
        const on = b.getAttribute('data-act') === this.styleName;
        b.style.background = on ? '#68D5C0' : '#0E1720';
        b.style.color = on ? '#08131A' : '#EAF2F5';
        b.style.borderColor = on ? '#68D5C0' : '#2B3D49';
      }
      for (const b of this.querySelectorAll('button[data-act="spinDay"],button[data-act="spinYear"]')) {
        const on = this.spin && this.spin.kind === (b.getAttribute('data-act') === 'spinDay' ? 'day' : 'year');
        b.textContent = (on ? 'Stop' : (b.getAttribute('data-act') === 'spinDay' ? 'Play a day' : 'Play a year'));
        b.style.color = on ? '#68D5C0' : '#93A2AD';
        b.style.borderColor = on ? '#68D5C0' : '#2B3D49';
      }
    }

    // The Home list in the watch's picker order, Off first, the current Home chosen.
    fillHomes() {
      const sel = this.querySelector('select[data-act="home"]');
      if (!sel || !this.cfg) return;
      const zones = this.cfg.cityDots.zones;
      const ids = ['off'].concat(this.cfg.cityDots.pickerOrder || Object.keys(zones));
      sel.innerHTML = '';
      for (const id of ids) {
        const o = document.createElement('option');
        o.value = id;
        o.textContent = id === 'off' ? 'Off (Greenwich at the bottom)' : zones[id].name + ' (' + id.toUpperCase() + ')';
        if (id === this.home) o.selected = true;
        sel.appendChild(o);
      }
    }

    syncSliders() {
      this.querySelector('[data-act="hour"]').value = this.hourOffset;
      this.querySelector('[data-act="day"]').value = this.dayOffset;
    }

    // A day in 20 s, a year in 30 s, looping; the sliders follow.
    toggleSpin(kind) {
      if (this.spin && this.spin.kind === kind) { this.stopSpin(); return; }
      this.stopSpin();
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const span = kind === 'day' ? 24 : 365, secs = (kind === 'day' ? 20 : 30) * (reduce ? 3 : 1);
      const spin = { kind, last: performance.now() };
      const step = now => {
        if (this.spin !== spin) return;
        const dt = Math.min(0.1, (now - spin.last) / 1000); spin.last = now;
        if (kind === 'day') this.hourOffset = ((this.hourOffset + 12 + span * dt / secs) % 24) - 12;
        else this.dayOffset = ((this.dayOffset + 182 + span * dt / secs) % 365) - 182;
        this.syncSliders();
        this.draw();
        spin.raf = requestAnimationFrame(step);
      };
      this.spin = spin;
      spin.raf = requestAnimationFrame(step);
      this.markButtons();
    }
    stopSpin() {
      if (this.spin) cancelAnimationFrame(this.spin.raf);
      this.spin = null;
      if (this.canvas) this.markButtons();
    }

    load() {
      const img = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
      // the face's own font, registered here so the page need not declare it
      if (window.FontFace && document.fonts) {
        const f = new FontFace('Old Standard', 'url(' + PT + 'fonts/old_standard.ttf)');
        this.fontReady = f.load().then(() => { document.fonts.add(f); }, () => {});
      } else this.fontReady = Promise.resolve();
      Promise.all([fetch(PE + 'earthturn.json').then(r => r.json()), fetch(PT + 'terrafirma.json').then(r => r.json())]).then(([cfg, tf]) => {
        this.cfg = cfg; this.tf = tf;
        const jobs = [img(PT + 'map-vintage.png'), img(PT + 'map-dark.png')];
        for (let n = 0; n < 24; n++) jobs.push(img(PE + 'night-' + String(n).padStart(2, '0') + '.png'));
        for (let p = 0; p < 30; p++) jobs.push(img(PT + 'moon/moon_p' + p + '.png'));
        return Promise.all(jobs);
      }).then(all => {
        this.maps = { vintage: all[0], dark: all[1] };
        this.nights = all.slice(2, 26);
        this.moons = all.slice(26);
        if (!this.maps.vintage || !this.maps.dark || this.nights.some(n => !n)) { this.fallback(); return; }
        this.fillHomes();
        const go = () => {
          this.draw();
          this.timer = setInterval(() => { if (!this.spin) this.draw(); }, 1000);
          window.addEventListener('resize', () => this.draw());
          if (window.ResizeObserver) { this.ro = new ResizeObserver(() => this.draw()); this.ro.observe(this.canvas); }
        };
        this.fontReady.then(go, go);
      }).catch(() => this.fallback());
    }

    fallback() {
      const c = this.querySelector('canvas');
      if (!c) return;
      const img = document.createElement('img');
      img.src = 'assets/terrafirma.png';
      img.alt = 'Terra Firma watch face';
      img.style.cssText = 'width:min(340px,84vw); aspect-ratio:1; border-radius:50%; display:block';
      c.replaceWith(img);
      const note = document.createElement('p');
      note.textContent = 'The live view could not load, so this is a photograph of the face.';
      note.style.cssText = "font-family:" + MONO + "; font-size:12px; color:#7E8D97; margin:0; text-align:center";
      img.parentNode.appendChild(note);
      for (const b of this.querySelectorAll('button,input,select')) b.disabled = true;
      clearInterval(this.timer);
      this.stopSpin();
    }

    tzOffset(tz, date) {
      const s = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).format(date);
      const m = s.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
      if (!m) return 0;
      return (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3] || '0', 10));
    }

    // Text drawn over halo copies, as the face's PartText stacks: the ink at inkSpots (nine on the bold vintage lettering).
    outlined(ctx, text, x, y, ink, halo, haloSpots, inkSpots) {
      y += DY;
      ctx.fillStyle = halo;
      for (const d of haloSpots) ctx.fillText(text, x + d[0], y + d[1]);
      ctx.fillStyle = ink;
      for (const d of inkSpots || ONE) ctx.fillText(text, x + d[0], y + d[1]);
    }

    // A stroked arc whose outer edge is the rim, from WFF angle a0 to a1 clockwise (degrees from straight up), in the current frame.
    rimArc(ctx, colour, width, a0, a1) {
      ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.arc(0, 0, C - width / 2, rad(a0 - 90), rad(a1 - 90)); ctx.stroke();
    }

    draw() {
      const cv = this.canvas, cfg = this.cfg, tf = this.tf;
      if (!cv || !cfg || !this.maps) return;
      const vintage = this.styleName === 'vintage';
      const Cs = cfg.colors[this.styleName], S = cfg.colors.shared;
      const zones = cfg.cityDots.zones;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (!cv.clientWidth) { requestAnimationFrame(() => this.draw()); return; }
      const w = Math.max(1, Math.round(cv.clientWidth * dpr));
      if (cv.width !== w) { cv.width = w; cv.height = w; }
      const ctx = cv.getContext('2d');
      const k = cv.width / G;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.clearRect(0, 0, G, G);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const base = this.fixedAt ? Date.parse(this.fixedAt) : Date.now();
      const date = new Date(base + this.hourOffset * 3600000 + Math.round(this.dayOffset) * 86400000);
      const utcMin = ((date.getTime() / 60000) % 1440 + 1440) % 1440;
      const homeZone = zones[this.home] || null;
      const homeLon = homeZone ? homeZone.lon : 0;
      // the two frames: EarthTurn's whole picture turned clockwise by sunAngle holds the map still at 180 + homeLon
      const sunAngle = homeLon + utcMin / 4;
      const etMapAngle = 180 - 360 * (utcMin / 1440);
      const localTz = this.fixedTz || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const localOff = this.tzOffset(localTz, date);
      const twoZones = this.zone2 !== 'off' && zones[this.zone2];
      const paper = Cs.paper;
      const letterInk = vintage ? tf.ring.colours.vintage : tf.ring.colours.dark;
      const timeInk = vintage ? tf.timeBlock.ink.vintage : tf.timeBlock.ink.dark;
      const haloSpots = vintage ? HALO8.concat(HALO_OUTER) : HALO8;
      const inkSpots = vintage ? BOLD : ONE;

      this.readouts(date, localTz);

      ctx.save();
      ctx.beginPath(); ctx.arc(C, C, C, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = paper; ctx.fillRect(0, 0, G, G);

      // ---- EarthTurn's map layers, the whole frame turned by sunAngle ----
      ctx.save();
      ctx.translate(C, C); ctx.rotate(rad(sunAngle)); ctx.translate(-C, -C);

      // 1. the map, held still on screen (turned by etMapAngle inside the turned frame: 180 + homeLon in all)
      ctx.save();
      ctx.translate(C, C); ctx.rotate(rad(etMapAngle)); ctx.translate(-C, -C);
      ctx.drawImage(this.maps[this.styleName], 0, 0, G, G);
      ctx.restore();

      // 2. the other-date region hatched with red slashes under the night (Tint only, Tint and +1d)
      const inWedge = Math.floor((date.getTime() + 720 * 60000) / 86400000) === Math.floor((date.getTime() + localOff * 60000) / 86400000);
      if (this.datechange !== 'line') {
        const lineA = 180 - (((360 * utcMin / 1440) + 180) % 360);
        const hatch = cfg.dateLine.wedge.hatch;
        ctx.save();
        ctx.beginPath(); ctx.moveTo(C, C);
        if (inWedge) ctx.arc(C, C, C + 2, rad(90), rad(lineA + 360 - 90), false);
        else ctx.arc(C, C, C + 2, rad(lineA - 90), rad(90), false);
        ctx.closePath(); ctx.clip();
        ctx.globalAlpha = hatch.alpha / 255;
        ctx.strokeStyle = hatch.colour; ctx.lineWidth = hatch.strokePx; ctx.lineCap = 'butt';
        ctx.beginPath();
        for (let s = 0; s <= 2 * G; s += hatch.periodPx) { ctx.moveTo(s, 0); ctx.lineTo(0, s); }
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // 3. the night, the mask for today's declination, nudged by the equation of time
      const day = (((Math.floor(date.getTime() / 86400000) - 20454) % 365.25) + 365.25) % 365.25;
      const decl = -23.44 * Math.cos(rad(360 * (day + 11) / 365));
      const idx = Math.max(0, Math.min(23, Math.round((decl + 23.44) / 46.88 * 23)));
      const B = rad(360 * (day - 80) / 365);
      const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
      const night = this.nights[idx];
      if (night) {
        if (!this.off) { this.off = document.createElement('canvas'); this.off.width = G; this.off.height = G; }
        const o = this.off.getContext('2d');
        o.setTransform(1, 0, 0, 1, 0, 0);
        o.globalCompositeOperation = 'source-over';
        o.clearRect(0, 0, G, G);
        o.save(); o.translate(C, C); o.rotate(rad(eot / 4)); o.translate(-C, -C);
        o.drawImage(night, 0, 0, G, G); o.restore();
        o.globalCompositeOperation = 'source-in';
        o.fillStyle = Cs.night; o.fillRect(0, 0, G, G);
        ctx.globalAlpha = Cs.nightAlpha / 255;
        ctx.drawImage(this.off, 0, 0, G, G);
        ctx.globalAlpha = 1;
      }

      // 4. the dots, still with the map: over the night, under everything lettered
      ctx.save();
      ctx.translate(C, C); ctx.rotate(rad(etMapAngle)); ctx.translate(-C, -C);
      for (const [id, fill, ring] of [[this.zone1, S.zone1Dot, S.zone1Ring], [twoZones ? this.zone2 : null, S.zoneOrange, S.dotRing], [this.home, S.homeDot, S.homeRing]]) {
        const z = id && zones[id]; if (!z) continue;
        ctx.beginPath(); ctx.arc(z.x, z.y, 7, 0, Math.PI * 2); ctx.fillStyle = ring; ctx.fill();
        ctx.beginPath(); ctx.arc(z.x, z.y, 5, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
      }
      ctx.restore();
      ctx.restore();   // back to the screen frame

      // 5. the moon at its spot: a paper ring, a night-blue disc, the phase art
      const spotA = tf.moon.spots[this.moon];
      if (spotA !== undefined) {
        const mx = C + tf.moon.radius * Math.sin(rad(spotA)), my = C - tf.moon.radius * Math.cos(rad(spotA));
        const d = tf.moon.diameterPx, box = tf.moon.boxPx;
        ctx.fillStyle = 'rgba(241,230,200,0.565)';
        ctx.beginPath(); ctx.arc(mx, my, d / 2 + 1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = cfg.colors.vintage.night;
        ctx.beginPath(); ctx.arc(mx, my, d / 2, 0, Math.PI * 2); ctx.fill();
        const jd = date.getTime() / 86400000 + 2440587.5;
        const age = (((jd - 2451550.1) % SYNODIC) + SYNODIC) % SYNODIC;
        const ph = this.moons[Math.min(29, Math.floor(age))];
        if (ph) ctx.drawImage(ph, mx - box / 2, my - box / 2, box, box);
      }

      // 6. the +1d / -1d label beside the midnight meridian in the sun frame (Tint and +1d only)
      if (this.datechange === 'labels') {
        const text = inWedge ? '-1d' : '+1d';
        const th = sunAngle + tf.dateLine.labelAngleDeg[text], r = tf.dateLine.labelRadius;
        ctx.font = '26px ' + FONT;
        const ink = vintage ? paper : Cs.accent, halo = vintage ? '#000000' : paper;
        this.outlined(ctx, text, C + r * Math.sin(rad(th)), C - r * Math.cos(rad(th)), ink, halo, HALO8, ONE);
      }

      // 7. the time block: the time end-aligned with a small AM/PM beside it, the date under
      const tb = tf.timeBlock, bx = tb.box[0], by = tb.box[1];
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: localTz, hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(date);
      const hm = parts.filter(p => p.type === 'hour' || p.type === 'minute' || p.type === 'literal').map(p => p.value).join('').trim();
      const ampm = (parts.find(p => p.type === 'dayPeriod') || { value: '' }).value;
      const dStr = new Intl.DateTimeFormat('en-US', { timeZone: localTz, weekday: 'short', month: 'short', day: 'numeric' }).format(date);
      ctx.font = tb.time12.size + 'px ' + FONT;
      ctx.textAlign = 'right';
      this.outlined(ctx, hm, bx + tb.time12.box[0] + tb.time12.box[2], by + tb.time12.box[1] + tb.time12.box[3] / 2, timeInk, paper, haloSpots, inkSpots);
      ctx.font = tb.time12.period.size + 'px ' + FONT;
      ctx.textAlign = 'left';
      this.outlined(ctx, ampm, bx + tb.time12.period.box[0], by + tb.time12.period.box[1] + tb.time12.period.box[3] / 2, timeInk, paper, haloSpots, inkSpots);
      ctx.textAlign = 'center';
      ctx.font = tb.date.size + 'px ' + FONT;
      this.outlined(ctx, dStr, bx + tb.date.box[0] + tb.date.box[2] / 2, by + tb.date.box[1] + tb.date.box[3] / 2, timeInk, paper, haloSpots, inkSpots);

      // 8. the ring in the sun frame: the office-hours band on the rim, then the 24 numerals, each upright
      ctx.save();
      ctx.translate(C, C); ctx.rotate(rad(sunAngle));
      const span = tf.band.spans[this.office];
      if (span) {
        const a0 = 180 - 15 * span[1], a1 = 180 - 15 * span[0];
        this.rimArc(ctx, vintage ? cfg.colors.vintage.ink : paper, 5, a0 - 1, a1 + 1);
        this.rimArc(ctx, vintage ? tf.band.colours.vintage : tf.band.colours.dark, 3, a0, a1);
      }
      ctx.restore();
      ctx.font = '30px ' + FONT;
      for (let h = 1; h <= 24; h++) {
        const a = rad(sunAngle + 180 - 15 * h);
        this.outlined(ctx, String(h), C + tf.ring.radius * Math.sin(a), C - tf.ring.radius * Math.cos(a), letterInk, paper, haloSpots, inkSpots);
      }

      // 9. the rim marks: a flat bar in each dot's colours where the ring reads that place's clock time
      ctx.save();
      ctx.translate(C, C); ctx.rotate(rad(sunAngle));
      const mk = tf.marks;
      for (const [id, half, fill, ring] of [[this.zone1, mk.halfSpanDeg.zone1, S.zone1Dot, S.zone1Ring], [twoZones ? this.zone2 : null, mk.halfSpanDeg.zone2, S.zoneOrange, S.dotRing], [this.home, mk.halfSpanDeg.home, S.homeDot, S.homeRing]]) {
        const z = id && zones[id]; if (!z) continue;
        const zm = ((utcMin + this.tzOffset(z.tz, date)) % 1440 + 1440) % 1440;
        const at = 180 - zm / 4;
        this.rimArc(ctx, ring, mk.widthPx[0], at - half - mk.haloDeg, at + half + mk.haloDeg);
        this.rimArc(ctx, fill, mk.widthPx[1], at - half, at + half);
        if (id !== this.home) {
          this.rimArc(ctx, S.homeDot, mk.widthPx[1], at - half, at - half / 3);
          this.rimArc(ctx, S.homeDot, mk.widthPx[1], at + half / 3, at + half);
        }
      }
      ctx.restore();

      ctx.restore();
    }

    readouts(date, tz) {
      const ho = this.querySelector('[data-out="hour"]'), dy = this.querySelector('[data-out="day"]');
      if (ho) {
        const h = this.hourOffset, sign = h < 0 ? '−' : '+', a = Math.abs(h);
        const hh = Math.floor(a), mm = Math.round((a - hh) * 60);
        ho.textContent = h === 0 ? 'now' : sign + hh + ' h' + (mm ? ' ' + mm + ' min' : '');
      }
      if (dy) {
        dy.textContent = Math.round(this.dayOffset) === 0 ? 'today'
          : new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric' }).format(date);
      }
    }
  }
  if (!customElements.get('terrafirma-live')) customElements.define('terrafirma-live', TerraFirmaLive);
})();
