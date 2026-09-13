(() => {
  const visual = document.querySelector(".uncertainty-visual");
  if (!visual) return;

  const svg = visual.querySelector("svg");
  const pathPlan = svg.querySelector(".path-plan");
  const pathTruth = svg.querySelector(".path-truth");
  const pathEstimate = svg.querySelector(".path-estimate");
  const covariance = svg.querySelector(".estimate-covariance");
  const status = visual.querySelector(".uncertainty-status");
  const playButton = visual.querySelector("[data-uncertainty-play]");
  const modeButtons = [...visual.querySelectorAll("[data-uncertainty-mode]")];

  const elements = {
    plan: {
      point: svg.querySelector(".point-plan"),
      label: svg.querySelector(".label-plan")
    },
    estimate: {
      point: svg.querySelector(".point-estimate"),
      label: svg.querySelector(".label-estimate")
    },
    truth: {
      point: svg.querySelector(".point-truth"),
      label: svg.querySelector(".label-truth")
    },
    combinedLabel: svg.querySelector(".label-combined"),
    controlEdge: svg.querySelector(".edge-control"),
    estimationEdge: svg.querySelector(".edge-estimation"),
    totalEdge: svg.querySelector(".edge-total"),
    controlLabel: svg.querySelector(".label-control"),
    estimationLabel: svg.querySelector(".label-estimation"),
    totalLabel: svg.querySelector(".label-total"),
    timeGuide: svg.querySelector(".time-guide")
  };

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let progress = 0.18;
  let modeMix = 0;
  let targetMix = 0;
  let playing = !reducedMotion;
  let lastTime = performance.now();
  let visible = true;

  function pointAt(t, mix) {
    const x = 80 + 710 * t;
    const planY = 245 - 76 * Math.sin(Math.PI * t) + 13 * Math.sin(2 * Math.PI * t);
    const truthOffsetX = (1 - mix) * (18 + 9 * Math.sin(2.4 * Math.PI * t));
    const truthOffsetY = (1 - mix) * (54 + 27 * Math.sin(1.6 * Math.PI * t + 0.45));
    const estimateOffsetX = -17 + 7 * Math.sin(2 * Math.PI * t + 0.8);
    const estimateOffsetY = -47 - 22 * Math.sin(1.45 * Math.PI * t + 0.25);

    return {
      plan: { x, y: planY },
      truth: { x: x + truthOffsetX, y: planY + truthOffsetY },
      estimate: { x: x + estimateOffsetX, y: planY + estimateOffsetY }
    };
  }

  function makePath(key, mix) {
    const points = [];
    for (let i = 0; i <= 90; i += 1) {
      const p = pointAt(i / 90, mix)[key];
      points.push(`${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    }
    return points.join(" ");
  }

  function setPoint(element, point) {
    element.setAttribute("cx", point.x);
    element.setAttribute("cy", point.y);
  }

  function setLine(element, a, b) {
    element.setAttribute("x1", a.x);
    element.setAttribute("y1", a.y);
    element.setAttribute("x2", b.x);
    element.setAttribute("y2", b.y);
  }

  function setText(element, point, dx, dy) {
    element.setAttribute("x", point.x + dx);
    element.setAttribute("y", point.y + dy);
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function draw() {
    const points = pointAt(progress, modeMix);

    pathPlan.setAttribute("d", makePath("plan", modeMix));
    pathTruth.setAttribute("d", makePath("truth", modeMix));
    pathEstimate.setAttribute("d", makePath("estimate", modeMix));

    setPoint(elements.plan.point, points.plan);
    setPoint(elements.estimate.point, points.estimate);
    setPoint(elements.truth.point, points.truth);

    setLine(elements.controlEdge, points.plan, points.estimate);
    setLine(elements.estimationEdge, points.estimate, points.truth);
    setLine(elements.totalEdge, points.plan, points.truth);

    setText(elements.plan.label, points.plan, -25, 24);
    setText(elements.estimate.label, points.estimate, -25, -14);
    setText(elements.truth.label, points.truth, 12, 24);
    setText(elements.combinedLabel, points.plan, 13, 25);
    setText(elements.controlLabel, midpoint(points.plan, points.estimate), -38, -7);
    setText(elements.estimationLabel, midpoint(points.estimate, points.truth), 9, -5);
    setText(elements.totalLabel, midpoint(points.plan, points.truth), 10, 17);

    const covarianceX = 27 + 9 * (0.5 + 0.5 * Math.sin(2 * Math.PI * progress));
    const covarianceY = 17 + 5 * (0.5 + 0.5 * Math.cos(2.4 * Math.PI * progress));
    covariance.setAttribute("cx", points.estimate.x);
    covariance.setAttribute("cy", points.estimate.y);
    covariance.setAttribute("rx", covarianceX);
    covariance.setAttribute("ry", covarianceY);
    covariance.setAttribute("transform", `rotate(${-14 + 18 * Math.sin(Math.PI * progress)} ${points.estimate.x} ${points.estimate.y})`);

    elements.timeGuide.setAttribute("x1", points.plan.x);
    elements.timeGuide.setAttribute("x2", points.plan.x);
  }

  function updateMode(mode) {
    const experiment = mode === "experiment";
    targetMix = experiment ? 1 : 0;
    visual.dataset.mode = mode;
    modeButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.uncertaintyMode === mode));
    });
    status.textContent = experiment
      ? "x ≡ x̄ · prescribed motion · no controller simulated"
      : "controller uses x̂ − x̄ · truth remains unknown";
  }

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => updateMode(button.dataset.uncertaintyMode));
  });

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
    modeMix += (targetMix - modeMix) * Math.min(1, delta / 240);
    if (playing && visible) progress = (progress + delta / 8200) % 1;
    draw();
    window.requestAnimationFrame(tick);
  }

  draw();
  window.requestAnimationFrame(tick);
})();
