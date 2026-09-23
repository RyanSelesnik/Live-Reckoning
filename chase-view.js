let chaseData;
let experiment;
let slider;
const highlightColors = [0x176f8a, 0xb34a36, 0x8a6b16];

function boot() {
  chaseData = window.CHASE_DATA;
  experiment = window.EXPERIMENT_DATA;
  slider = document.querySelector("#feature-time");
  if (chaseData && experiment && slider) {
    document.querySelectorAll("[data-chase]").forEach(makeView);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, {once: true});
} else boot();

function nearest(values, time, accessor = value => value) {
  let lo = 0, hi = values.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (accessor(values[mid]) < time) lo = mid + 1; else hi = mid;
  }
  return lo && Math.abs(accessor(values[lo - 1]) - time) < Math.abs(accessor(values[lo]) - time) ? lo - 1 : lo;
}

function persistentFeatures(motion, frame) {
  return motion.features[frame].map(feature => {
    let age = 0;
    for (let k = frame; k >= Math.max(0, frame - 7); k--) {
      if (motion.features[k].some(candidate => candidate[0] === feature[0])) age++; else break;
    }
    return {id: feature[0], age};
  }).sort((a, b) => b.age - a.age || a.id - b.id).slice(0, 3);
}

function positions(frames, which) {
  const offset = which === "truth" ? 1 : 2;
  return new Float32Array(frames.flatMap(frame => frame[offset].slice(0, 3)));
}

function lineObject(array, color, opacity, width = 1) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(array, 3));
  const material = new THREE.LineBasicMaterial({color, transparent: opacity < 1, opacity, linewidth: width});
  return new THREE.Line(geometry, material);
}

function bodyMarker(color, opacity = 1) {
  const group = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    -.30, 0, 0, .30, 0, 0,
    0, -.30, 0, 0, .30, 0,
    0, 0, 0, .38, 0, 0
  ], 3));
  group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({color, transparent: opacity < 1, opacity, depthTest: false})));
  group.add(new THREE.Mesh(
    new THREE.RingGeometry(.075, .108, 20),
    new THREE.MeshBasicMaterial({color, side: THREE.DoubleSide, transparent: opacity < 1, opacity, depthTest: false})
  ));
  return group;
}

function makeGrid() {
  const vertices = [];
  for (let x = 0; x <= 32; x += 4) vertices.push(x, -10, 0, x, 10, 0);
  for (let y = -10; y <= 10; y += 4) vertices.push(0, y, 0, 32, y, 0);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({color: 0xcfd5d7, transparent: true, opacity: .58}));
}

function makeGround() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(32, 20),
    new THREE.MeshBasicMaterial({color: 0xf3f5f5, side: THREE.DoubleSide})
  );
  ground.position.set(16, 0, -.025);
  return ground;
}

function makeView(element) {
  const key = element.dataset.chase;
  const frames = chaseData.cases[key];
  const motion = experiment.motions[key];
  const canvas = element.querySelector("canvas");
  const errorLabel = element.querySelector(".chase-error");
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: false});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0xffffff, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, .04, 100);
  camera.up.set(0, 0, 1);
  scene.add(makeGround(), makeGrid());

  const cloudGeometry = new THREE.BufferGeometry();
  cloudGeometry.setAttribute("position", new THREE.Float32BufferAttribute(experiment.landmarks.flat(), 3));
  scene.add(new THREE.Points(cloudGeometry, new THREE.PointsMaterial({color: 0x778187, size: .045, transparent: true, opacity: .25, sizeAttenuation: true})));

  const truthFull = lineObject(positions(frames, "truth"), 0x78878e, .4);
  const truthPast = lineObject(positions(frames, "truth"), 0x182126, 1);
  const estimatePast = lineObject(positions(frames, "estimate"), 0x426b78, .94);
  scene.add(truthFull, truthPast, estimatePast);

  const truthBody = bodyMarker(0x182126);
  const estimateBody = bodyMarker(0x426b78, .85);
  estimateBody.scale.setScalar(.82);
  scene.add(truthBody, estimateBody);

  const covariance = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 10),
    new THREE.MeshBasicMaterial({color: 0x426b78, wireframe: true, transparent: true, opacity: .4})
  );
  scene.add(covariance);

  const activeGeometry = new THREE.BufferGeometry();
  activeGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(30), 3));
  activeGeometry.setDrawRange(0, 0);
  const activePoints = new THREE.Points(activeGeometry, new THREE.PointsMaterial({color: 0x59696f, size: .18, sizeAttenuation: true}));
  scene.add(activePoints);

  const highlights = highlightColors.map(color => {
    const marker = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 7), new THREE.MeshBasicMaterial({color}));
    scene.add(marker); return marker;
  });
  const rayGeometry = new THREE.BufferGeometry();
  rayGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(18), 3));
  rayGeometry.setDrawRange(0, 6);
  const rays = new THREE.LineSegments(rayGeometry, new THREE.LineBasicMaterial({color: 0x71858c, transparent: true, opacity: .4}));
  scene.add(rays);

  const rotationMatrix = new THREE.Matrix4();
  const truthPosition = new THREE.Vector3();
  const estimatePosition = new THREE.Vector3();
  const desiredCamera = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const cameraOffset = new THREE.Vector3(-4.4, -2.8, 2.2);
  let initialized = false;
  let lastIndex = -1;

  function resize() {
    const box = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(box.width));
    const height = Math.max(1, Math.round(box.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function update() {
    const time = Number(slider.value);
    const index = nearest(frames, time, frame => frame[0]);
    const frame = frames[index];
    const truth = frame[1], estimate = frame[2];
    truthPosition.fromArray(truth);
    estimatePosition.fromArray(estimate);
    truthBody.position.copy(truthPosition);
    truthBody.quaternion.set(truth[3], truth[4], truth[5], truth[6]).normalize();
    estimateBody.position.copy(estimatePosition);
    estimateBody.quaternion.set(estimate[3], estimate[4], estimate[5], estimate[6]).normalize();
    truthPast.geometry.setDrawRange(0, index + 1);
    estimatePast.geometry.setDrawRange(0, index + 1);

    covariance.position.copy(estimatePosition);
    covariance.scale.fromArray(frame[3]);
    const basis = frame[4];
    rotationMatrix.set(
      basis[0], basis[1], basis[2], 0,
      basis[3], basis[4], basis[5], 0,
      basis[6], basis[7], basis[8], 0,
      0, 0, 0, 1
    );
    covariance.quaternion.setFromRotationMatrix(rotationMatrix);
    errorLabel.textContent = `Current gap ${truthPosition.distanceTo(estimatePosition).toFixed(3)} m`;

    const featureIndex = nearest(motion.featureTimes, time);
    const currentFeatures = motion.features[featureIndex];
    const selected = persistentFeatures(motion, featureIndex);
    const activeArray = activeGeometry.attributes.position.array;
    currentFeatures.forEach((feature, j) => {
      const landmark = experiment.landmarks[feature[0]];
      activeArray.set(landmark, j * 3);
    });
    activeGeometry.setDrawRange(0, currentFeatures.length);
    activeGeometry.attributes.position.needsUpdate = true;

    const rayArray = rayGeometry.attributes.position.array;
    selected.forEach((selection, j) => {
      const landmark = experiment.landmarks[selection.id];
      highlights[j].position.fromArray(landmark);
      rayArray.set(truth.slice(0, 3), j * 6);
      rayArray.set(landmark, j * 6 + 3);
    });
    rayGeometry.attributes.position.needsUpdate = true;

    // Follow translation only. A fixed world-space offset avoids inheriting
    // the vehicle's changing heading, roll, and pitch.
    desiredCamera.copy(truthPosition).add(cameraOffset);
    if (!initialized || Math.abs(index - lastIndex) > 12) {
      camera.position.copy(desiredCamera);
      lookTarget.copy(truthPosition);
      initialized = true;
    } else {
      camera.position.lerp(desiredCamera, .055);
      lookTarget.lerp(truthPosition, .055);
    }
    camera.lookAt(lookTarget);
    renderer.render(scene, camera);
    lastIndex = index;
    requestAnimationFrame(update);
  }

  new ResizeObserver(resize).observe(canvas);
  resize(); update();
}
