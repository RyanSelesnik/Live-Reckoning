(() => {
  "use strict";

  const data = window.MONTE_CARLO_DATA;
  const mseSvg = document.querySelector("#validation-mse");
  if (!data || !mseSvg) return;

  const NS = "http://www.w3.org/2000/svg";
  const neesSvg = document.querySelector("#validation-nees");
  const reductionValue = document.querySelector("#validation-reduction");
  const neesValue = document.querySelector("#validation-nees-value");
  const buttons = [...document.querySelectorAll("[data-validation-case]")];
  let selectedIndex = 4;

  const element = (name, attrs = {}, text = "") => {
    const node = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    if (text) node.textContent = text;
    return node;
  };
  const clear = (svg) => { while (svg.lastChild) svg.lastChild.remove(); };
  const path = (points) => points.map((point, index) => `${index ? "L" : "M"}${point[0].toFixed(2)},${point[1].toFixed(2)}`).join(" ");

  function timeAxis(svg, W, H, margins, sx) {
    [0, 2.5, 5].forEach((value) => {
      svg.append(element("text", { x:sx(value), y:H-13, class:"validation-tick", "text-anchor":"middle" }, `${value}`));
    });
    svg.append(element("text", { x:(margins.l+W-margins.r)/2, y:H-2, class:"validation-axis", "text-anchor":"middle" }, "t [s]"));
  }

  function drawMse() {
    clear(mseSvg);
    const current = data.cases[selectedIndex];
    const baseline = data.cases[0];
    const W=760,H=300,m={l:55,r:72,t:22,b:36};
    const sx=(t)=>m.l+t/data.horizon*(W-m.l-m.r);
    const lo=Math.log10(.0015),hi=Math.log10(1.2);
    const sy=(v)=>H-m.b-(Math.log10(v)-lo)/(hi-lo)*(H-m.t-m.b);
    [0.002,0.01,0.1,1].forEach((value) => {
      mseSvg.append(element("line", { x1:m.l,x2:W-m.r,y1:sy(value),y2:sy(value),class:"validation-gridline" }));
      mseSvg.append(element("text", { x:m.l-9,y:sy(value)+4,class:"validation-tick","text-anchor":"end" }, `${value}`));
    });
    timeAxis(mseSvg,W,H,m,sx);
    mseSvg.append(element("text", { x:7,y:13,class:"validation-axis" }, "horizontal error [m²] · log scale"));

    if (selectedIndex !== 0) {
      mseSvg.append(element("path", { d:path(data.times.map((t,i)=>[sx(t),sy(baseline.empiricalMse[i])])),class:"validation-line reference realised" }));
      mseSvg.append(element("path", { d:path(data.times.map((t,i)=>[sx(t),sy(baseline.predictedCovariance[i])])),class:"validation-line reference predicted" }));
    }
    const empirical = data.times.map((t,i)=>[sx(t),sy(current.empiricalMse[i])]);
    const predicted = data.times.map((t,i)=>[sx(t),sy(current.predictedCovariance[i])]);
    mseSvg.append(element("path", { d:path(empirical),class:"validation-line realised" }));
    mseSvg.append(element("path", { d:path(predicted),class:"validation-line predicted" }));
    const finalEmpirical=empirical.at(-1), finalPredicted=predicted.at(-1);
    mseSvg.append(element("circle", { cx:finalEmpirical[0],cy:finalEmpirical[1],r:3,class:"validation-end realised" }));
    mseSvg.append(element("circle", { cx:finalPredicted[0],cy:finalPredicted[1],r:3,class:"validation-end predicted" }));
    mseSvg.append(element("text", { x:W-m.r+9,y:finalEmpirical[1]-5,class:"validation-direct-label realised" }, "trials"));
    mseSvg.append(element("text", { x:W-m.r+9,y:finalPredicted[1]+12,class:"validation-direct-label predicted" }, "prediction"));

    const reduction = 100 * (1-current.runningMse/baseline.runningMse);
    reductionValue.textContent = selectedIndex === 0 ? "baseline" : `${reduction.toFixed(0)}% lower MSE`;
  }

  function drawNees() {
    clear(neesSvg);
    const current = data.cases[selectedIndex];
    const baseline = data.cases[0];
    const W=430,H=300,m={l:45,r:20,t:22,b:36};
    const sx=(t)=>m.l+t/data.horizon*(W-m.l-m.r);
    const sy=(v)=>H-m.b-(v-1.5)/(8.5-1.5)*(H-m.t-m.b);
    [2,4,6,8].forEach((value) => {
      neesSvg.append(element("line", { x1:m.l,x2:W-m.r,y1:sy(value),y2:sy(value),class:value===2?"validation-expected":"validation-gridline" }));
      neesSvg.append(element("text", { x:m.l-8,y:sy(value)+4,class:"validation-tick","text-anchor":"end" }, `${value}`));
    });
    timeAxis(neesSvg,W,H,m,sx);
    neesSvg.append(element("text", { x:7,y:13,class:"validation-axis" }, "horizontal NEES"));
    neesSvg.append(element("text", { x:W-m.r-4,y:sy(2)-7,class:"validation-expected-label","text-anchor":"end" }, "expected 2"));
    if (selectedIndex !== 0) {
      neesSvg.append(element("path", { d:path(data.times.map((t,i)=>[sx(t),sy(baseline.meanAnees[i])])),class:"validation-line reference nees" }));
    }
    neesSvg.append(element("path", { d:path(data.times.map((t,i)=>[sx(t),sy(current.meanAnees[i])])),class:"validation-line nees" }));
    neesValue.textContent=`mean NEES ${current.meanHorizontalAnees.toFixed(2)}`;
  }

  function render() { drawMse(); drawNees(); }

  buttons.forEach((button) => button.addEventListener("click", () => {
    selectedIndex=Number(button.dataset.validationCase);
    buttons.forEach((item)=>item.setAttribute("aria-pressed",item===button?"true":"false"));
    render();
  }));
  render();
})();
