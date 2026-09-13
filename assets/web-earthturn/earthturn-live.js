// EarthTurn, drawn live in the browser for worldclockwatch.com.
// It follows earthturn.json (written by tools/web.ps1 from the face generator), so the geometry,
// colours and the date-line label's placement table are the watch's own. Face as of 2026-09-13:
// red hatch under the night, orange zone dots and red home dot, 30 px numerals (vintage night half
// in ocean blue over black), a red rim pointer, paper zone text over black, the label pinned by the
// time block and the zone blocks.
//
// <earthturn-live map-style="vintage|dark" zone1="nyc" zone2="syd|off" home="mtx|off" at="ISO time" tz="IANA zone">
(function () {
  const P = 'assets/web-earthturn/';
  const G = 450, C = 225;
  const rad = d => d * Math.PI / 180;
  const HALO8 = [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  const HALO4 = [[-2, 0], [2, 0], [0, -2], [0, 2]];
  const HALO2 = [[-1, -1], [1, 1]];
  const FONT = "Barlow, 'Barlow Semi Condensed', sans-serif";
  const MONO = "'IBM Plex Mono',monospace";
  // canvas 'middle' sits text about 2 px higher than the watch's PartText boxes (checked against the reference captures)
  const DY = 2;

  class EarthTurnLive extends HTMLElement {
    connectedCallback() {
      if (this.built) return;
      this.built = true;
      this.style.display = 'block';
      this.styleName = this.getAttribute('map-style') || 'vintage';
      this.fixedAt = this.getAttribute('at') || null;
      this.fixedTz = this.getAttribute('tz') || null;
      this.zone1 = this.getAttribute('zone1') || 'nyc';
      this.zone2 = this.getAttribute('zone2') || 'syd';
      this.home = this.getAttribute('home') || 'mtx';
      this.hourOffset = 0;
      this.dayOffset = 0;
      const pill = "cursor:pointer; border:1px solid #2B3D49; background:#0E1720; color:#EAF2F5; padding:7px 14px; border-radius:999px; font:inherit; white-space:nowrap";
      const ghost = "cursor:pointer; border:1px solid #2B3D49; background:transparent; color:#93A2AD; padding:6px 12px; border-radius:6px; font:inherit";
      this.innerHTML = '<div style="display:grid; justify-items:center; gap:16px">'
        + '<canvas role="img" aria-label="EarthTurn watch face, drawn live" style="width:min(340px,84vw); aspect-ratio:1; border-radius:50%; display:block; background:#1A2530"></canvas>'
        + '<div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:center; font-family:' + MONO + '; font-size:12px">'
        + '<button data-act="vintage" style="' + pill + '">Vintage atlas</button>'
        + '<button data-act="dark" style="' + pill + '">Dark</button>'
        + '</div>'
        + '<div style="display:grid; gap:12px; justify-items:stretch; width:min(340px,84vw); font-family:' + MONO + '; font-size:11.5px; color:#7E8D97">'
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
      fetch(P + 'earthturn.json').then(r => r.json()).then(cfg => {
        this.cfg = cfg;
        const jobs = [img(P + 'map-vintage.png'), img(P + 'map-dark.png')];
        for (let n = 0; n < 24; n++) jobs.push(img(P + 'night-' + String(n).padStart(2, '0') + '.png'));
        return Promise.all(jobs);
      }).then(all => {
        this.maps = { vintage: all[0], dark: all[1] };
        this.nights = all.slice(2);
        if (!this.maps.vintage || !this.maps.dark || this.nights.some(n => !n)) { this.fallback(); return; }
        const go = () => {
          this.draw();
          this.timer = setInterval(() => { if (!this.spin) this.draw(); }, 1000);
          window.addEventListener('resize', () => this.draw());
          if (window.ResizeObserver) { this.ro = new ResizeObserver(() => this.draw()); this.ro.observe(this.canvas); }
        };
        // draw once the face's font is ready, so the first frame is not in a fallback font
        if (document.fonts && document.fonts.load) {
          Promise.all(['700 30px Barlow', '600 22px Barlow'].map(f => document.fonts.load(f))).then(go, go);
        } else go();
      }).catch(() => this.fallback());
    }

    fallback() {
      const c = this.querySelector('canvas');
      if (!c) return;
      const img = document.createElement('img');
      img.src = P + 'reference/vintage.png';
      img.alt = 'EarthTurn watch face';
      img.style.cssText = 'width:min(340px,84vw); aspect-ratio:1; border-radius:50%; display:block';
      c.replaceWith(img);
      const note = document.createElement('p');
      note.textContent = 'The live view could not load, so this is a photograph of the face.';
      note.style.cssText = "font-family:" + MONO + "; font-size:12px; color:#7E8D97; margin:0; text-align:center";
      img.parentNode.appendChild(note);
      for (const b of this.querySelectorAll('button,input')) b.disabled = true;
      clearInterval(this.timer);
      this.stopSpin();
    }

    tzOffset(tz, date) {
      const s = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).format(date);
      const m = s.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
      if (!m) return 0;
      return (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3] || '0', 10));
    }
    dayNo(tz, date) {
      const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
      return Date.parse(p.replace(/\//g, '-') + 'T00:00:00Z') / 86400000;
    }

    // Text drawn over outline copies, as the face's PartText stacks.
    outlined(ctx, text, x, y, ink, halo, copies) {
      y += DY;
      ctx.fillStyle = halo;
      for (const d of copies) ctx.fillText(text, x + d[0], y + d[1]);
      ctx.fillStyle = ink;
      ctx.fillText(text, x, y);
    }

    // The label's place from dateLine.label.branches: {pin: screen angle} or {frame: radius}.
    labelPlace(side, m) {
      const br = this.cfg.dateLine.label.branches[side < 0 ? '-1d' : '+1d'];
      for (const e of br.list) {
        const hit = e.wrapsMidnight ? (m > e.afterMinute || m <= e.upToMinute) : (m > e.afterMinute && m <= e.upToMinute);
        if (hit) return e.pinScreenAngle === null ? { frameAngle: br.frameAngle, radius: this.cfg.dateLine.label.innerRadius } : { pin: e.pinScreenAngle };
      }
      return { frameAngle: br.frameAngle, radius: 165 };
    }

    draw() {
      const cv = this.canvas, cfg = this.cfg;
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
      const mapAngle = 180 - 360 * (utcMin / 1440);
      const localTz = this.fixedTz || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const localOff = this.tzOffset(localTz, date);
      const twoZones = this.zone2 !== 'off' && zones[this.zone2];

      this.readouts(date, localTz);

      ctx.save();
      ctx.beginPath(); ctx.arc(C, C, C, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = Cs.paper; ctx.fillRect(0, 0, G, G);

      // 1. the map, turning
      ctx.save();
      ctx.translate(C, C); ctx.rotate(rad(mapAngle)); ctx.translate(-C, -C);
      ctx.drawImage(this.maps[this.styleName], 0, 0, G, G);
      ctx.restore();

      // 2. the other-date region hatched with red slashes, under the night
      const inWedge = Math.floor((date.getTime() + 720 * 60000) / 86400000) === Math.floor((date.getTime() + localOff * 60000) / 86400000);
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

      // 4. the +1d / -1d label, placed by the face's own table
      const side = inWedge ? -1 : 1, labelText = inWedge ? '-1d' : '+1d';
      const place = this.labelPlace(side, utcMin);
      const th = place.pin !== undefined ? place.pin : place.frameAngle + mapAngle;
      const r = place.pin !== undefined ? 165 : place.radius;
      ctx.font = '700 26px ' + FONT;
      this.outlined(ctx, labelText, C + r * Math.sin(rad(th)), C - r * Math.cos(rad(th)), Cs.dateLabel, Cs.dateLabelOutline, HALO8);

      // 5. the time block under the 12
      const tStr = new Intl.DateTimeFormat('en-US', { timeZone: localTz, hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
      const dStr = new Intl.DateTimeFormat('en-US', { timeZone: localTz, weekday: 'short', month: 'short', day: 'numeric' }).format(date);
      ctx.font = '700 48px ' + FONT;
      this.outlined(ctx, tStr, C, 71, Cs.timeText, Cs.outline, HALO8);
      ctx.font = '600 22px ' + FONT;
      this.outlined(ctx, dStr, C, 113, Cs.timeText, Cs.outline, HALO8);

      // 6. the pointer: a red bar on the rim at your hour, over a paper bar
      const localMin = ((date.getTime() / 60000 + localOff) % 1440 + 1440) % 1440;
      ctx.save();
      ctx.translate(C, C); ctx.rotate(rad(180 - 360 * (localMin / 1440)));
      ctx.lineCap = 'butt';
      ctx.strokeStyle = Cs.paper; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(0, 0, C - 3.5, rad(-90 - 6.5), rad(-90 + 6.5)); ctx.stroke();
      ctx.strokeStyle = S.dotRed; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, C - 2.5, rad(-90 - 6), rad(-90 + 6)); ctx.stroke();
      ctx.restore();

      // 7. the numerals, all 30 px
      const hours = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].concat(twoZones ? [24] : [22, 23, 1, 2]);
      ctx.font = '700 30px ' + FONT;
      for (const h of hours) {
        const a = rad(180 - h * 15);
        const x = C + 204 * Math.sin(a), y = C - 204 * Math.cos(a);
        const nightHalf = vintage && (h >= 18 || h <= 6);
        if (nightHalf) this.outlined(ctx, String(h), x, y, Cs.numeralsNight, Cs.numeralsNightOutline, HALO4);
        else this.outlined(ctx, String(h), x, y, Cs.numerals, Cs.paper, HALO2);
      }

      // 8. the dots, turning with the map, above everything else on it
      ctx.save();
      ctx.translate(C, C); ctx.rotate(rad(mapAngle)); ctx.translate(-C, -C);
      for (const [id, fill] of [[this.zone1, S.zoneOrange], [twoZones ? this.zone2 : null, S.zoneOrange], [this.home, S.dotRed]]) {
        const z = id && zones[id]; if (!z) continue;
        ctx.beginPath(); ctx.arc(z.x, z.y, 7, 0, Math.PI * 2); ctx.fillStyle = S.dotRing; ctx.fill();
        ctx.beginPath(); ctx.arc(z.x, z.y, 5, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
      }
      ctx.restore();
      ctx.restore();

      // 9. the zones at the bottom, paper over black
      const localDay = this.dayNo(localTz, date);
      const blocks = twoZones
        ? [[this.zone1, 100, 352, 120, 32, 84, 26, 40, 28, 20], [this.zone2, 230, 352, 120, 32, 84, 26, 40, 28, 20]]
        : [[this.zone1, 95, 376, 260, 32, 158, 35, 38, 30, 22]];
      for (const [id, bx, by, bw, hourSize, markX, markSize, nameY, nameH, nameSize] of blocks) {
        const z = zones[id]; if (!z) continue;
        const hh = new Intl.DateTimeFormat('en-GB', { timeZone: z.tz, hour: '2-digit', hourCycle: 'h23' }).format(date);
        ctx.font = '700 ' + hourSize + 'px ' + FONT;
        this.outlined(ctx, hh, bx + bw / 2, by + 20, S.zoneInk, S.zoneOutline, HALO4);
        const dd = this.dayNo(z.tz, date) - localDay;
        if (dd !== 0) {
          ctx.font = '700 ' + markSize + 'px ' + FONT;
          ctx.textAlign = 'left';
          this.outlined(ctx, dd > 0 ? '+1d' : '-1d', bx + markX, by + 20, S.zoneInk, S.zoneOutline, HALO2);
          ctx.textAlign = 'center';
        }
        const mm = (((this.tzOffset(z.tz, date) - localOff) % 60) + 60) % 60;
        const mk = (mm === 30 || mm === 45 || mm === 15) ? '+' + mm + 'm' : '';
        ctx.font = '700 ' + nameSize + 'px ' + FONT;
        this.outlined(ctx, id.toUpperCase() + ' ' + mk, bx + bw / 2, by + nameY + nameH / 2, S.zoneInk, S.zoneOutline, HALO4);
      }
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
  if (!customElements.get('earthturn-live')) customElements.define('earthturn-live', EarthTurnLive);
})();
