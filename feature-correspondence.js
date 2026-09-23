(() => {
  "use strict";

  const dataset = window.EXPERIMENT_DATA;
  if (!dataset) return;

  const cases = [
    {key: "straight", title: "Nominal cruise", subtitle: "straight-flight reference"},
    {key: "weave_3d", title: "3D oscillation", subtitle: "oscillatory condition"}
  ];
  const highlight = ["#176f8a", "#b34a36", "#8a6b16"];
  const rows = document.querySelector("#feature-rows");
  const slider = document.querySelector("#feature-time");
  const clock = document.querySelector("#feature-clock");
  const play = document.querySelector("#feature-play");
  const heroSlider = document.querySelector("#hero-feature-time");
  const heroClock = document.querySelector("#hero-feature-clock");
  const heroPlay = document.querySelector("#hero-feature-play");
  let playing = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  let previous = performance.now();

  function setPlaying(value) {
    playing = value;
    play.textContent = value ? "Pause" : "Play";
    play.setAttribute("aria-label", `${value ? "Pause" : "Play"} feature playback`);
    if (heroPlay) {
      heroPlay.textContent = value ? "Pause" : "Play";
      heroPlay.setAttribute("aria-label", `${value ? "Pause" : "Play"} 3D playback`);
    }
  }

  const nearest = (values, time) => {
    let lo = 0, hi = values.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (values[mid] < time) lo = mid + 1; else hi = mid;
    }
    return lo && Math.abs(values[lo - 1] - time) < Math.abs(values[lo] - time) ? lo - 1 : lo;
  };

  function context(canvas) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const box = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(box.width * dpr));
    const h = Math.max(1, Math.round(box.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [ctx, box.width, box.height];
  }

  function build() {
    for (const item of cases) {
      const article = document.createElement("article");
      article.className = "feature-row";
      article.innerHTML = `
        <header><h3>${item.title}</h3><p>${item.subtitle}</p></header>
        <figure><canvas aria-label="${item.title}: fixed landmark map and current tracked features"></canvas></figure>
        <figure><canvas aria-label="${item.title}: matching features in the image plane"></canvas></figure>`;
      rows.appendChild(article);
      item.motion = dataset.motions[item.key];
      item.map = article.querySelector("figure:first-of-type canvas");
      item.image = article.querySelector("figure:last-of-type canvas");
    }
  }

  function mapPoint(p, w, h) {
    return [26 + (p[0] + 5) / 44 * (w - 52), 22 + (10 - p[1]) / 20 * (h - 44)];
  }

  function persistentFeatures(motion, frame) {
    const current = motion.features[frame];
    return current.map(f => {
      let age = 0;
      for (let k = frame; k >= Math.max(0, frame - 7); k--) {
        if (motion.features[k].some(x => x[0] === f[0])) age++; else break;
      }
      return {id: f[0], age};
    }).sort((a, b) => b.age - a.age || a.id - b.id).slice(0, 3);
  }

  function drawMap(item, time, selected) {
    const [ctx, w, h] = context(item.map);
    const motion = item.motion;
    const ti = nearest(motion.trajectory.map(r => r[0]), time);
    const fi = nearest(motion.featureTimes, time);
    const active = motion.features[fi];
    const p = mapPoint(motion.trajectory[ti].slice(1), w, h);
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = "rgba(24, 31, 35, .28)";
    dataset.landmarks.forEach(landmark => {
      const q = mapPoint(landmark, w, h);
      ctx.beginPath(); ctx.arc(q[0], q[1], 1.25, 0, Math.PI * 2); ctx.fill();
    });

    ctx.strokeStyle = "rgba(24,31,35,.16)"; ctx.lineWidth = 1.2; ctx.beginPath();
    motion.trajectory.forEach((r, i) => { const q = mapPoint(r.slice(1), w, h); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
    ctx.stroke();
    ctx.strokeStyle = "#1c252a"; ctx.lineWidth = 2; ctx.beginPath();
    motion.trajectory.slice(0, ti + 1).forEach((r, i) => { const q = mapPoint(r.slice(1), w, h); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); });
    ctx.stroke();

    active.forEach(f => {
      const q = mapPoint(dataset.landmarks[f[0]], w, h);
      const rank = selected.findIndex(x => x.id === f[0]);
      ctx.fillStyle = rank < 0 ? "#74878d" : highlight[rank];
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(q[0], q[1], rank < 0 ? 4.5 : 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (rank >= 0) {
        ctx.globalAlpha = .32; ctx.strokeStyle = highlight[rank]; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); ctx.globalAlpha = 1;
      }
    });

    ctx.fillStyle = "#fff"; ctx.strokeStyle = "#1c252a"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(p[0], p[1], 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  function drawImage(item, time, selected) {
    const [ctx, w, h] = context(item.image);
    const motion = item.motion;
    const frame = nearest(motion.featureTimes, time);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(24,31,35,.1)"; ctx.lineWidth = 1;
    [0.25, .5, .75].forEach(x => { ctx.beginPath(); ctx.moveTo(w*x, 0); ctx.lineTo(w*x, h); ctx.stroke(); });
    [0.25, .5, .75].forEach(y => { ctx.beginPath(); ctx.moveTo(0, h*y); ctx.lineTo(w, h*y); ctx.stroke(); });

    const tracks = new Map();
    for (let k = Math.max(0, frame - 7); k <= frame; k++) {
      motion.features[k].forEach(f => {
        if (!tracks.has(f[0])) tracks.set(f[0], []);
        tracks.get(f[0]).push([f[1] / 640 * w, f[2] / 480 * h, k]);
      });
    }
    tracks.forEach((track, id) => {
      const rank = selected.findIndex(x => x.id === id);
      const current = track[track.length - 1][2] === frame;
      if (rank >= 0 && track.length > 1) {
        ctx.strokeStyle = highlight[rank]; ctx.globalAlpha = .45; ctx.lineWidth = 1.5; ctx.beginPath();
        track.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); ctx.globalAlpha = 1;
      }
      if (current) {
        const p = track[track.length - 1];
        ctx.fillStyle = rank < 0 ? "#74878d" : highlight[rank];
        ctx.beginPath(); ctx.arc(p[0], p[1], rank < 0 ? 4 : 6.5, 0, Math.PI * 2); ctx.fill();
        if (rank >= 0) {
          ctx.fillStyle = "#fff"; ctx.font = "10px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(String(rank + 1), p[0], p[1] + .4);
        }
      }
    });
  }

  function draw() {
    const time = Number(slider.value);
    clock.value = `${time.toFixed(1)} s`;
    if (heroSlider) heroSlider.value = slider.value;
    if (heroClock) heroClock.value = clock.value;
    for (const item of cases) {
      const frame = nearest(item.motion.featureTimes, time);
      const selected = persistentFeatures(item.motion, frame);
      drawMap(item, time, selected);
      drawImage(item, time, selected);
    }
  }

  function animate(now) {
    if (playing) {
      const dt = Math.min(.1, (now - previous) / 1000);
      let t = Number(slider.value) + dt * 3;
      if (t > Number(slider.max)) t = Number(slider.min);
      slider.value = t; draw();
    }
    previous = now; requestAnimationFrame(animate);
  }

  play.addEventListener("click", () => setPlaying(!playing));
  heroPlay?.addEventListener("click", () => setPlaying(!playing));
  slider.addEventListener("input", () => { setPlaying(false); draw(); });
  heroSlider?.addEventListener("input", () => {
    slider.value = heroSlider.value;
    setPlaying(false);
    draw();
  });
  addEventListener("resize", draw);
  setPlaying(playing);
  build(); draw(); requestAnimationFrame(animate);
})();
