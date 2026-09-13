(() => {
  const visual = document.querySelector(".dead-reckoning-visual");
  if (!visual) return;

  const svg = visual.querySelector("svg");
  const truePath = svg.querySelector(".true-guide");
  const estimatePath = svg.querySelector(".estimate-guide");
  const ribbon = svg.querySelector(".dead-reckoning-ribbon");
  const uncertainty = svg.querySelector(".dead-reckoning-uncertainty");
  const errorLine = svg.querySelector(".dead-reckoning-error");
  const correctionLine = svg.querySelector(".dead-reckoning-correction");
  const rayGroup = svg.querySelector(".dead-reckoning-rays");
  const rays = [...rayGroup.querySelectorAll("line")];
  const trueMarker = svg.querySelector(".dead-reckoning-true");
  const estimateMarker = svg.querySelector(".dead-reckoning-estimate");
  const steps = svg.querySelector(".dead-reckoning-steps");
  const status = visual.querySelector(".dead-reckoning-status");
  const playButton = visual.querySelector("[data-dead-reckoning-play]");

  const trueLength = truePath.getTotalLength();
  const estimateLength = estimatePath.getTotalLength();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let playing = !reducedMotion;
  let phase = reducedMotion ? 0.7 : 0;
  let lastTime = performance.now();
  let visible = true;
  let lastMessage = "";

  // Reveal from the path origin. A shifted full-length dash can wrap and show
  // the far end of the curve while progress is still zero.
  truePath.style.strokeDasharray = "0 1";
  estimatePath.style.strokeDasharray = "0 1";
  truePath.style.strokeDashoffset = "0";
  estimatePath.style.strokeDashoffset = "0";

  function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
  }

  function smooth(value) {
    const x = clamp(value);
    return x * x * (3 - 2 * x);
  }

  function point(path, length, progress) {
    return path.getPointAtLength(clamp(progress) * length);
  }

  function mixPoint(a, b, amount) {
    return {
      x: a.x + (b.x - a.x) * amount,
      y: a.y + (b.y - a.y) * amount
    };
  }

  function positionGroup(group, p) {
    group.setAttribute("transform", `translate(${p.x} ${p.y})`);
    const label = group.querySelector("text");
    label.setAttribute("x", 12);
    label.setAttribute("y", -12);
  }

  function lineBetween(line, a, b) {
    line.setAttribute("x1", a.x);
    line.setAttribute("y1", a.y);
    line.setAttribute("x2", b.x);
    line.setAttribute("y2", b.y);
  }

  function ribbonFor(progress, fade) {
    if (progress <= 0.01) return "";
    const upper = [];
    const lower = [];
    const count = 30;

    for (let i = 0; i <= count; i += 1) {
      const u = progress * i / count;
      const length = u * estimateLength;
      const p = estimatePath.getPointAtLength(length);
      const before = estimatePath.getPointAtLength(Math.max(0, length - 1));
      const after = estimatePath.getPointAtLength(Math.min(estimateLength, length + 1));
      const dx = after.x - before.x;
      const dy = after.y - before.y;
      const magnitude = Math.hypot(dx, dy) || 1;
      const width = (2 + 29 * u) * fade;
      const nx = -dy / magnitude;
      const ny = dx / magnitude;
      upper.push({ x: p.x + nx * width, y: p.y + ny * width });
      lower.push({ x: p.x - nx * width, y: p.y - ny * width });
    }

    const points = upper.concat(lower.reverse());
    return points.map((p, index) => `${index ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z";
  }

  function drawSteps(progress) {
    const count = Math.floor(progress * 8);
    const lines = [];
    for (let i = 1; i <= count; i += 1) {
      const u = i / 8;
      const p = point(estimatePath, estimateLength, u);
      const q = point(estimatePath, estimateLength, Math.min(1, u + 0.018));
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const magnitude = Math.hypot(dx, dy) || 1;
      const nx = -dy / magnitude;
      const ny = dx / magnitude;
      lines.push(`<line x1="${p.x - nx * 5}" y1="${p.y - ny * 5}" x2="${p.x + nx * 5}" y2="${p.y + ny * 5}" />`);
    }
    steps.innerHTML = lines.join("");
  }

  function setStatus(message) {
    if (message === lastMessage) return;
    lastMessage = message;
    status.textContent = message;
  }

  function draw() {
    const travel = smooth((phase - 0.08) / 0.58);
    const correction = smooth((phase - 0.72) / 0.13);
    const truePoint = point(truePath, trueLength, travel);
    const rawEstimate = point(estimatePath, estimateLength, travel);
    const correctedEstimate = mixPoint(rawEstimate, truePoint, correction);
    const uncertaintyScale = Math.max(0.15, travel * (1 - 0.72 * correction));

    truePath.style.strokeDasharray = `${travel} 1`;
    estimatePath.style.strokeDasharray = `${travel} 1`;
    truePath.style.opacity = travel > 0.001 ? 1 : 0;
    estimatePath.style.opacity = travel > 0.001 ? 1 : 0;
    ribbon.setAttribute("d", ribbonFor(travel, 1 - 0.58 * correction));
    drawSteps(travel);

    positionGroup(trueMarker, truePoint);
    positionGroup(estimateMarker, correctedEstimate);
    lineBetween(errorLine, truePoint, correctedEstimate);
    errorLine.style.opacity = 0.25 + 0.75 * (1 - correction);

    uncertainty.setAttribute("cx", correctedEstimate.x);
    uncertainty.setAttribute("cy", correctedEstimate.y);
    uncertainty.setAttribute("rx", 10 + 31 * uncertaintyScale);
    uncertainty.setAttribute("ry", 7 + 20 * uncertaintyScale);
    uncertainty.setAttribute("transform", `rotate(-18 ${correctedEstimate.x} ${correctedEstimate.y})`);

    lineBetween(correctionLine, rawEstimate, truePoint);
    correctionLine.style.opacity = correction > 0.02 && correction < 0.98 ? 1 : 0;

    rays.forEach((ray, index) => {
      ray.setAttribute("x1", truePoint.x);
      ray.setAttribute("y1", truePoint.y);
      if (index === 0) {
        ray.setAttribute("x2", 830);
        ray.setAttribute("y2", 70);
      } else {
        ray.setAttribute("x2", 856);
        ray.setAttribute("y2", 218);
      }
    });
    rayGroup.style.opacity = correction;

    if (phase < 0.13) setStatus("Begin from a known position.");
    else if (phase < 0.48) setStatus("Measured motion advances the previous estimate.");
    else if (phase < 0.72) setStatus("A small heading error accumulates into position drift.");
    else if (phase < 0.87) setStatus("A visual observation constrains the drift.");
    else setStatus("The corrected estimate becomes the next starting point.");
  }

  playButton.addEventListener("click", () => {
    playing = !playing;
    playButton.textContent = playing ? "Pause" : "Play";
    lastTime = performance.now();
  });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      lastTime = performance.now();
    }, { threshold: 0.05 });
    observer.observe(visual);
  }

  function tick(now) {
    const delta = Math.min(50, now - lastTime);
    lastTime = now;
    if (playing && visible) phase = (phase + delta / 9000) % 1;
    draw();
    window.requestAnimationFrame(tick);
  }

  draw();
  window.requestAnimationFrame(tick);
})();
