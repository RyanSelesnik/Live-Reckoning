# Live Reckoning

**Moving to Observe, Observing to be Sure**

Towards estimation-aware trajectory planning for visual–inertial navigation.

Interactive project page for Ryan Selesnik’s 2026 MSc Control and Optimisation thesis at Imperial College London, supervised by Dr David Boyle.

The project contains two linked studies:

- four prescribed trajectories evaluated over 20 paired OpenVINS simulations;
- a reduced differentiable covariance model used for constrained trajectory planning.

In the primary monocular experiment, oscillatory motion reduced reported position uncertainty by about 51% and mean position error by about 73% versus nominal cruise. In planning, the largest tested motion allowance reduced predicted cost by 87.8% for a centred landmark, but only 20–22% for multi-landmark geometry.

The page ends with a 200-trial nonlinear EKF Monte Carlo study of the saved plans.

## Preview locally

The page is static, but browser security rules require it to be served over HTTP:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Repository structure

- `index.html` — project narrative and research metadata
- `styles.css` — responsive page and figure styling
- `*-view.js` — interactive experiment visualisations
- `*-data.js` — saved, browser-ready experiment outputs
- `scripts/` — conversion scripts for saved experiment outputs
- `vendor/` — vendored browser dependencies and licences

## Scope

This repository contains the page, saved outputs, and data-conversion scripts. The planner and OpenVINS implementation is not bundled here; its intended home is [Live-Reckoning-Code](https://github.com/RyanSelesnik/Live-Reckoning-Code). Until released, this is an inspectable record rather than a complete reproduction package.

## Citation

```bibtex
@mastersthesis{selesnik2026livereckoning,
  author = {Ryan Selesnik},
  title  = {Live Reckoning: Moving to Observe, Observing to be Sure --
            Towards Estimation-Aware Trajectory Planning for
            Visual--Inertial Navigation},
  school = {Imperial College London},
  type   = {MSc thesis},
  year   = {2026}
}
```

Report content is licensed under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) unless otherwise indicated.
