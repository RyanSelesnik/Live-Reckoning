(() => {
  "use strict";

  const data = window.OPTIMIZATION_DATA;
  const slider = document.querySelector("#optimizer-allowance");
  if (!data || !slider) return;

  const NS = "http://www.w3.org/2000/svg";
  const ink = "#182126";
  const blue = "#426b78";
  const muted = "#788085";
  const pale = "#d8dddf";
  const paper = "#ffffff";
  const $ = (selector) => document.querySelector(selector);
  const path = (points) => points.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");
  const el = (name, attrs = {}, text = "") => {
    const node = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    if (text) node.textContent = text;
    return node;
  };
  const clear = (svg) => { while (svg.lastChild) svg.lastChild.remove(); };

  const trajectorySvg = $("#optimizer-trajectory");
  const covarianceSvg = $("#optimizer-covariance");
  const frontierSvg = $("#optimizer-frontier");
  const allowance = $("#optimizer-allowance-value");
  const meanValue = $("#optimizer-mean-value");
  const motionValue = $("#optimizer-motion-value");
  const baseline = data.cases[0];

  function trajectory(caseData) {
    clear(trajectorySvg);
    const W = 720, H = 380, m = { l: 48, r: 25, t: 25, b: 42 };
    const sx = (x) => m.l + (x + 0.45) / 12.0 * (W - m.l - m.r);
    const sy = (y) => H - m.b - (y + 1.45) / 3.05 * (H - m.t - m.b);

    [-1, 0, 1].forEach((y) => trajectorySvg.append(el("line", { x1: m.l, x2: W-m.r, y1: sy(y), y2: sy(y), class: "optimizer-gridline" })));
    [0, 5, 10].forEach((x) => {
      trajectorySvg.append(el("line", { x1: sx(x), x2: sx(x), y1: m.t, y2: H-m.b, class: "optimizer-gridline" }));
      trajectorySvg.append(el("text", { x: sx(x), y: H-16, class: "optimizer-tick", "text-anchor": "middle" }, `${x}`));
    });
    [-1, 0, 1].forEach((y) => trajectorySvg.append(el("text", { x: 37, y: sy(y)+4, class: "optimizer-tick", "text-anchor": "end" }, `${y}`)));
    trajectorySvg.append(el("text", { x: (m.l + W-m.r)/2, y: H-5, class: "optimizer-axis", "text-anchor": "middle" }, "x_W [m]"));
    trajectorySvg.append(el("text", { x: 15, y: 20, class: "optimizer-axis" }, "y_W [m]"));

    const basePoints = baseline.trajectory.map((d) => [sx(d[1]), sy(d[2])]);
    const activePoints = caseData.trajectory.map((d) => [sx(d[1]), sy(d[2])]);
    trajectorySvg.append(el("path", { d: path(basePoints), class: "optimizer-path baseline" }));

    const landmark = [sx(data.landmark[0]), sy(data.landmark[1])];
    [20, 40, 60, 80].forEach((index) => {
      const d = caseData.trajectory[index];
      trajectorySvg.append(el("line", { x1: sx(d[1]), y1: sy(d[2]), x2: landmark[0], y2: landmark[1], class: "optimizer-sightline" }));
      const length = 10;
      trajectorySvg.append(el("line", {
        x1: sx(d[1]) - Math.cos(d[3]) * length,
        y1: sy(d[2]) + Math.sin(d[3]) * length,
        x2: sx(d[1]) + Math.cos(d[3]) * length,
        y2: sy(d[2]) - Math.sin(d[3]) * length,
        class: "optimizer-heading-tick"
      }));
    });
    trajectorySvg.append(el("path", { d: path(activePoints), class: "optimizer-path active" }));
    trajectorySvg.append(el("circle", { cx: activePoints[0][0], cy: activePoints[0][1], r: 4, class: "optimizer-start" }));
    trajectorySvg.append(el("circle", { cx: activePoints.at(-1)[0], cy: activePoints.at(-1)[1], r: 4, class: "optimizer-goal" }));
    trajectorySvg.append(el("circle", { cx: landmark[0], cy: landmark[1], r: 6, class: "optimizer-landmark" }));
    trajectorySvg.append(el("text", { x: landmark[0]-8, y: landmark[1]-13, class: "optimizer-direct-label", "text-anchor": "end" }, "front landmark"));
  }

  function covariance(caseData) {
    clear(covarianceSvg);
    const W = 500, H = 225, m = { l: 51, r: 16, t: 18, b: 34 };
    const sx = (t) => m.l + t / data.horizon * (W-m.l-m.r);
    const lo = Math.log10(0.001), hi = Math.log10(1.2);
    const sy = (v) => H-m.b - (Math.log10(v)-lo)/(hi-lo)*(H-m.t-m.b);
    [0.001, 0.01, 0.1, 1].forEach((v) => {
      covarianceSvg.append(el("line", { x1:m.l, x2:W-m.r, y1:sy(v), y2:sy(v), class:"optimizer-gridline" }));
      covarianceSvg.append(el("text", { x:m.l-8, y:sy(v)+4, class:"optimizer-tick", "text-anchor":"end" }, v.toString()));
    });
    [0, 2.5, 5].forEach((t) => covarianceSvg.append(el("text", { x:sx(t), y:H-11, class:"optimizer-tick", "text-anchor":"middle" }, `${t}`)));
    covarianceSvg.append(el("text", { x:(m.l+W-m.r)/2, y:H-2, class:"optimizer-axis", "text-anchor":"middle" }, "t [s]"));
    covarianceSvg.append(el("text", { x:6, y:12, class:"optimizer-axis" }, "Pxx + Pyy [m²]"));
    const basePoints = baseline.covariance.map((d) => [sx(d[0]),sy(d[1])]);
    const activePoints = caseData.covariance.map((d) => [sx(d[0]),sy(d[1])]);
    covarianceSvg.append(el("path", { d:path(basePoints), class:"optimizer-path baseline" }));
    covarianceSvg.append(el("path", { d:path(activePoints), class:"optimizer-path active" }));
    activePoints.forEach((p) => covarianceSvg.append(el("circle", { cx:p[0], cy:p[1], r:1.5, class:"optimizer-sample" })));
  }

  function frontier(caseData) {
    clear(frontierSvg);
    const W=500,H=205,m={l:51,r:16,t:18,b:35};
    const sx=(v)=>m.l+v/300*(W-m.l-m.r);
    const sy=(v)=>H-m.b-(v-0.02)/(0.30-0.02)*(H-m.t-m.b);
    [0.05,0.15,0.25].forEach((v)=>{
      frontierSvg.append(el("line",{x1:m.l,x2:W-m.r,y1:sy(v),y2:sy(v),class:"optimizer-gridline"}));
      frontierSvg.append(el("text",{x:m.l-8,y:sy(v)+4,class:"optimizer-tick","text-anchor":"end"},v.toFixed(2)));
    });
    [0,100,200,300].forEach((v)=>frontierSvg.append(el("text",{x:sx(v),y:H-11,class:"optimizer-tick","text-anchor":"middle"},`${v}`)));
    frontierSvg.append(el("text",{x:(m.l+W-m.r)/2,y:H-2,class:"optimizer-axis","text-anchor":"middle"},"motion-cost increase [%]"));
    frontierSvg.append(el("text",{x:6,y:12,class:"optimizer-axis"},"mean covariance [m²]"));
    const points=data.cases.map((d)=>[sx(d.motionIncrease),sy(d.savedMeanCovariance)]);
    frontierSvg.append(el("path",{d:path(points),class:"optimizer-frontier-line"}));
    data.cases.forEach((d,i)=>frontierSvg.append(el("circle",{cx:points[i][0],cy:points[i][1],r:d===caseData?5:2.4,class:d===caseData?"optimizer-frontier-active":"optimizer-frontier-point"})));
    if(caseData.epsilon!==null){
      const x=sx(caseData.epsilon*100);
      frontierSvg.append(el("line",{x1:x,x2:x,y1:m.t,y2:H-m.b,class:"optimizer-budget"}));
    }
  }

  function render() {
    const selected = data.cases[Number(slider.value)];
    allowance.textContent = selected.epsilon === null ? "motion-only" : `ε = ${selected.epsilon.toFixed(selected.epsilon < .1 ? 2 : 1)}`;
    meanValue.textContent = `${selected.savedMeanCovariance.toFixed(selected.savedMeanCovariance < .1 ? 4 : 3)} m²`;
    motionValue.textContent = `${selected.motionIncrease.toFixed(selected.motionIncrease < 10 ? 0 : 0)}%`;
    trajectory(selected); covariance(selected); frontier(selected);
  }

  slider.max = data.cases.length - 1;
  slider.addEventListener("input", render);
  render();
})();
