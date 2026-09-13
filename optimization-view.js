(() => {
  "use strict";

  const data = window.OPTIMIZATION_DATA;
  const allowanceSlider = document.querySelector("#optimizer-allowance");
  if (!data || !allowanceSlider) return;

  const NS = "http://www.w3.org/2000/svg";
  const ink = "#182126", blue = "#426b78", ochre = "#9a7425", muted = "#788085";
  const colours = { centre: blue, image_left: ochre };
  const $ = (selector) => document.querySelector(selector);
  const trajectorySvg = $("#optimizer-trajectory");
  const imageSvg = $("#optimizer-image");
  const covarianceSvg = $("#optimizer-covariance");
  const frontierSvg = $("#optimizer-frontier");
  const allowanceValue = $("#optimizer-allowance-value");
  const meanValue = $("#optimizer-mean-value");
  const motionValue = $("#optimizer-motion-value");
  const timeSlider = $("#optimizer-time");
  const timeValue = $("#optimizer-time-value");
  const playButton = $("#optimizer-play");
  const modeButtons = [...document.querySelectorAll("[data-optimizer-mode]")];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let mode = "centre";
  let playing = !reducedMotion;
  let time = 0;
  let lastFrame = performance.now();
  let visible = true;

  const element = (name, attrs = {}, text = "") => {
    const node = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    if (text) node.textContent = text;
    return node;
  };
  const clear = (svg) => { while (svg.lastChild) svg.lastChild.remove(); };
  const path = (points) => points.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");
  const activeKeys = () => mode === "both" ? ["centre", "image_left"] : [mode];
  const selectedCase = (key) => data.geometries[key].cases[Number(allowanceSlider.value)];

  function sampleAt(series, value) {
    if (value <= series[0][0]) return series[0];
    if (value >= series[series.length - 1][0]) return series[series.length - 1];
    const scaled = value / data.horizon * (series.length - 1);
    const lower = Math.floor(scaled), upper = Math.min(series.length - 1, lower + 1);
    const amount = scaled - lower;
    return series[lower].map((entry, i) => i === 0 ? value : entry + (series[upper][i] - entry) * amount);
  }

  function prefix(series, value, map) {
    const points = series.filter((row) => row[0] < value).map(map);
    points.push(map(sampleAt(series, value)));
    return points;
  }

  function axes(svg, W, H, margins, xTicks, yTicks, sx, sy, xLabel, yLabel) {
    xTicks.forEach((value) => {
      svg.append(element("line", { x1:sx(value), x2:sx(value), y1:margins.t, y2:H-margins.b, class:"optimizer-gridline" }));
      svg.append(element("text", { x:sx(value), y:H-17, class:"optimizer-tick", "text-anchor":"middle" }, `${value}`));
    });
    yTicks.forEach((value) => {
      svg.append(element("line", { x1:margins.l, x2:W-margins.r, y1:sy(value), y2:sy(value), class:"optimizer-gridline" }));
      svg.append(element("text", { x:margins.l-9, y:sy(value)+4, class:"optimizer-tick", "text-anchor":"end" }, `${value}`));
    });
    svg.append(element("text", { x:(margins.l+W-margins.r)/2, y:H-3, class:"optimizer-axis", "text-anchor":"middle" }, xLabel));
    svg.append(element("text", { x:7, y:13, class:"optimizer-axis" }, yLabel));
  }

  function drawTrajectory() {
    clear(trajectorySvg);
    const W=650,H=370,m={l:48,r:24,t:24,b:42};
    const sx=(x)=>m.l+(x+.45)/12.15*(W-m.l-m.r);
    const sy=(y)=>H-m.b-(y+1.45)/3.1*(H-m.t-m.b);
    axes(trajectorySvg,W,H,m,[0,5,10],[-1,0,1],sx,sy,"x_W [m]","y_W [m]");

    const baseline=data.geometries.centre.cases[0].trajectory.map((d)=>[sx(d[1]),sy(d[2])]);
    trajectorySvg.append(element("path",{d:path(baseline),class:"optimizer-path baseline"}));
    activeKeys().forEach((key)=>{
      const geometry=data.geometries[key], current=selectedCase(key), colour=colours[key];
      const full=current.trajectory.map((d)=>[sx(d[1]),sy(d[2])]);
      const travelled=prefix(current.trajectory,time,(d)=>[sx(d[1]),sy(d[2])]);
      const pose=sampleAt(current.trajectory,time);
      const landmark=[sx(geometry.landmark[0]),sy(geometry.landmark[1])];
      const position=[sx(pose[1]),sy(pose[2])];
      trajectorySvg.append(element("path",{d:path(full),class:"optimizer-path future",stroke:colour}));
      trajectorySvg.append(element("path",{d:path(travelled),class:"optimizer-path active",stroke:colour}));
      trajectorySvg.append(element("line",{x1:position[0],y1:position[1],x2:landmark[0],y2:landmark[1],class:"optimizer-sightline",stroke:colour}));
      const heading=12;
      trajectorySvg.append(element("line",{
        x1:position[0]-Math.cos(pose[3])*heading,y1:position[1]+Math.sin(pose[3])*heading,
        x2:position[0]+Math.cos(pose[3])*heading,y2:position[1]-Math.sin(pose[3])*heading,
        class:"optimizer-heading-tick",stroke:colour
      }));
      trajectorySvg.append(element("circle",{cx:position[0],cy:position[1],r:4.5,class:"optimizer-vehicle",fill:colour}));
      trajectorySvg.append(element("circle",{cx:landmark[0],cy:landmark[1],r:5.5,class:"optimizer-landmark",fill:colour}));
      trajectorySvg.append(element("text",{x:landmark[0]-8,y:landmark[1]-10,class:"optimizer-direct-label","text-anchor":"end",fill:colour},geometry.label));
    });
    trajectorySvg.append(element("circle",{cx:sx(0),cy:sy(0),r:4,class:"optimizer-start"}));
    trajectorySvg.append(element("circle",{cx:sx(10),cy:sy(0),r:4,class:"optimizer-goal"}));
  }

  function drawImage() {
    clear(imageSvg);
    const W=470,H=370,m={l:48,r:18,t:25,b:42};
    const sx=(u)=>m.l+u/data.image.width*(W-m.l-m.r);
    const sy=(v)=>m.t+v/data.image.height*(H-m.t-m.b);
    imageSvg.append(element("rect",{x:m.l,y:m.t,width:W-m.l-m.r,height:H-m.t-m.b,class:"optimizer-image-frame"}));
    imageSvg.append(element("line",{x1:sx(data.image.cx)-7,x2:sx(data.image.cx)+7,y1:sy(data.image.cy),y2:sy(data.image.cy),class:"optimizer-principal"}));
    imageSvg.append(element("line",{x1:sx(data.image.cx),x2:sx(data.image.cx),y1:sy(data.image.cy)-7,y2:sy(data.image.cy)+7,class:"optimizer-principal"}));
    [0,320,640].forEach((u)=>imageSvg.append(element("text",{x:sx(u),y:H-17,class:"optimizer-tick","text-anchor":"middle"},`${u}`)));
    [0,240,480].forEach((v)=>imageSvg.append(element("text",{x:m.l-9,y:sy(v)+4,class:"optimizer-tick","text-anchor":"end"},`${v}`)));
    imageSvg.append(element("text",{x:(m.l+W-m.r)/2,y:H-3,class:"optimizer-axis","text-anchor":"middle"},"u [px]"));
    imageSvg.append(element("text",{x:7,y:13,class:"optimizer-axis"},"v [px]"));

    activeKeys().forEach((key)=>{
      const geometry=data.geometries[key], current=selectedCase(key), colour=colours[key];
      const baseline=geometry.cases[0].pixels.map((d)=>[sx(d[1]),sy(d[2])]);
      const full=current.pixels.map((d)=>[sx(d[1]),sy(d[2])]);
      const travelled=prefix(current.pixels,time,(d)=>[sx(d[1]),sy(d[2])]);
      const pixel=sampleAt(current.pixels,time);
      imageSvg.append(element("path",{d:path(baseline),class:"optimizer-pixel baseline",stroke:colour}));
      imageSvg.append(element("path",{d:path(full),class:"optimizer-pixel future",stroke:colour}));
      imageSvg.append(element("path",{d:path(travelled),class:"optimizer-pixel active",stroke:colour}));
      imageSvg.append(element("circle",{cx:sx(pixel[1]),cy:sy(pixel[2]),r:5,class:"optimizer-pixel-point",fill:colour}));
    });
  }

  function drawCovariance() {
    clear(covarianceSvg);
    const W=500,H=225,m={l:51,r:16,t:18,b:34};
    const sx=(t)=>m.l+t/data.horizon*(W-m.l-m.r);
    const lo=Math.log10(.001),hi=Math.log10(1.2);
    const sy=(v)=>H-m.b-(Math.log10(v)-lo)/(hi-lo)*(H-m.t-m.b);
    [0.001,0.01,0.1,1].forEach((v)=>{
      covarianceSvg.append(element("line",{x1:m.l,x2:W-m.r,y1:sy(v),y2:sy(v),class:"optimizer-gridline"}));
      covarianceSvg.append(element("text",{x:m.l-8,y:sy(v)+4,class:"optimizer-tick","text-anchor":"end"},v.toString()));
    });
    [0,2.5,5].forEach((t)=>covarianceSvg.append(element("text",{x:sx(t),y:H-11,class:"optimizer-tick","text-anchor":"middle"},`${t}`)));
    covarianceSvg.append(element("text",{x:(m.l+W-m.r)/2,y:H-2,class:"optimizer-axis","text-anchor":"middle"},"t [s]"));
    covarianceSvg.append(element("text",{x:6,y:12,class:"optimizer-axis"},"Pxx + Pyy [m²]"));
    covarianceSvg.append(element("line",{x1:sx(time),x2:sx(time),y1:m.t,y2:H-m.b,class:"optimizer-time-line"}));
    activeKeys().forEach((key)=>{
      const geometry=data.geometries[key], current=selectedCase(key), colour=colours[key];
      const baseline=geometry.cases[0].covariance.map((d)=>[sx(d[0]),sy(d[1])]);
      const active=current.covariance.map((d)=>[sx(d[0]),sy(d[1])]);
      const now=sampleAt(current.covariance,time);
      covarianceSvg.append(element("path",{d:path(baseline),class:"optimizer-path baseline",stroke:colour}));
      covarianceSvg.append(element("path",{d:path(active),class:"optimizer-path active",stroke:colour}));
      covarianceSvg.append(element("circle",{cx:sx(time),cy:sy(now[1]),r:3.5,class:"optimizer-current-covariance",fill:colour}));
    });
  }

  function drawFrontier() {
    clear(frontierSvg);
    const W=500,H=205,m={l:51,r:16,t:18,b:35};
    const sx=(v)=>m.l+v/300*(W-m.l-m.r);
    const lo=Math.log10(.015),hi=Math.log10(.35);
    const sy=(v)=>H-m.b-(Math.log10(v)-lo)/(hi-lo)*(H-m.t-m.b);
    [0.02,0.05,0.1,0.2].forEach((v)=>{
      frontierSvg.append(element("line",{x1:m.l,x2:W-m.r,y1:sy(v),y2:sy(v),class:"optimizer-gridline"}));
      frontierSvg.append(element("text",{x:m.l-8,y:sy(v)+4,class:"optimizer-tick","text-anchor":"end"},v.toString()));
    });
    [0,100,200,300].forEach((v)=>frontierSvg.append(element("text",{x:sx(v),y:H-11,class:"optimizer-tick","text-anchor":"middle"},`${v}`)));
    frontierSvg.append(element("text",{x:(m.l+W-m.r)/2,y:H-2,class:"optimizer-axis","text-anchor":"middle"},"motion-cost increase [%]"));
    frontierSvg.append(element("text",{x:6,y:12,class:"optimizer-axis"},"mean covariance [m²] · log scale"));
    activeKeys().forEach((key)=>{
      const geometry=data.geometries[key], current=selectedCase(key), colour=colours[key];
      const points=geometry.cases.map((d)=>[sx(d.motionIncrease),sy(d.savedMeanCovariance)]);
      frontierSvg.append(element("path",{d:path(points),class:"optimizer-frontier-line",stroke:colour}));
      geometry.cases.forEach((d,i)=>frontierSvg.append(element("circle",{cx:points[i][0],cy:points[i][1],r:d===current?4.7:2,class:d===current?"optimizer-frontier-active":"optimizer-frontier-point",fill:colour})));
    });
    const selected=selectedCase(activeKeys()[0]);
    if(selected.epsilon!==null){
      const x=sx(selected.epsilon*100);
      frontierSvg.append(element("line",{x1:x,x2:x,y1:m.t,y2:H-m.b,class:"optimizer-budget"}));
    }
  }

  function updateLabels() {
    const keys=activeKeys(), selected=selectedCase(keys[0]);
    allowanceValue.textContent=selected.epsilon===null?"motion-only":`ε = ${selected.epsilon.toFixed(selected.epsilon<.1?2:1)}`;
    meanValue.textContent=keys.map((key)=>`${data.geometries[key].label} ${selectedCase(key).savedMeanCovariance.toFixed(selectedCase(key).savedMeanCovariance<.1?4:3)}`).join(" · ")+" m²";
    motionValue.textContent=`${selected.motionIncrease.toFixed(0)}%`;
    timeValue.textContent=`${time.toFixed(1)} s`;
  }

  function render() {
    updateLabels();
    drawTrajectory(); drawImage(); drawCovariance(); drawFrontier();
  }

  allowanceSlider.max=data.geometries.centre.cases.length-1;
  allowanceSlider.addEventListener("input",render);
  timeSlider.addEventListener("input",()=>{
    time=Number(timeSlider.value); playing=false; playButton.textContent="Play"; render();
  });
  playButton.addEventListener("click",()=>{
    playing=!playing; playButton.textContent=playing?"Pause":"Play"; lastFrame=performance.now();
  });
  modeButtons.forEach((button)=>button.addEventListener("click",()=>{
    mode=button.dataset.optimizerMode;
    modeButtons.forEach((item)=>item.setAttribute("aria-pressed",item===button?"true":"false"));
    render();
  }));
  if("IntersectionObserver" in window){
    new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;lastFrame=performance.now();},{threshold:.05}).observe($(".optimizer-story"));
  }

  function tick(now){
    const delta=Math.max(0,Math.min(50,now-lastFrame)); lastFrame=now;
    if(playing&&visible){time=(time+delta/1600)%data.horizon;timeSlider.value=time;updateLabels();drawTrajectory();drawImage();drawCovariance();}
    window.requestAnimationFrame(tick);
  }
  playButton.textContent=playing?"Pause":"Play";
  render();
  window.requestAnimationFrame(tick);
})();
