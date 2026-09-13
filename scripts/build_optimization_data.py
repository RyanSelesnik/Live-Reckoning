#!/usr/bin/env python3
"""Export the saved centre-landmark epsilon sweep for the project page.

This does not solve an optimisation problem. It samples the saved flat-output
plans and reruns the deterministic covariance rollout used by the report.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import casadi as ca
import numpy as np


def rounded(values, digits=7):
    return np.round(np.asarray(values, dtype=float), digits).tolist()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path, help="centre/epsilon_sweep.npz")
    parser.add_argument("model_root", type=Path, help="directory containing belief.py")
    parser.add_argument("output", type=Path, help="output optimization-data.js")
    args = parser.parse_args()

    sys.path.insert(0, str(args.model_root.resolve()))
    from belief import initial_joint_covariance, rollout_covariance
    from trajectory import sample_snap_plan

    saved = np.load(args.archive)
    required = {
        "landmark_W", "epsilons", "X_baseline", "U_baseline", "J_motion_star",
        "X", "U", "J_motion", "motion_increase", "running_baseline",
        "running_covariance",
    }
    missing = required.difference(saved.files)
    if missing:
        raise ValueError(f"missing archive arrays: {sorted(missing)}")

    landmark = np.asarray(saved["landmark_W"], dtype=float).reshape(-1, 3)
    if landmark.shape != (1, 3) or not np.allclose(landmark[0], [11.0, 0.0, 1.0]):
        raise ValueError(f"expected the front landmark at (11, 0, 1), got {landmark}")

    epsilons = np.asarray(saved["epsilons"], dtype=float)
    states = np.asarray(saved["X"], dtype=float)
    controls = np.asarray(saved["U"], dtype=float)
    if states.shape != (len(epsilons), 10, 51) or controls.shape != (len(epsilons), 3, 50):
        raise ValueError("unexpected saved trajectory dimensions")

    sample_times = np.linspace(0.0, 5.0, 101)
    P0 = initial_joint_covariance(num_landmarks=1)

    def export_case(label, epsilon, X, U, motion_cost, motion_increase, saved_mean):
        sampled = sample_snap_plan(X, U, sample_times)
        rollout = rollout_covariance(ca.DM(X), ca.DM(U), P0, ca.DM(landmark))
        cov = np.asarray([float(P[0, 0] + P[1, 1]) for P in rollout["P"]])
        mean = float(np.mean(cov[1:]))
        if not np.isclose(mean, saved_mean, rtol=5e-3, atol=5e-5):
            raise ValueError(f"covariance rollout mismatch for {label}: {mean} vs {saved_mean}")
        trajectory = np.column_stack(
            [sampled["time"], sampled["position"][0], sampled["position"][1], sampled["psi"]]
        )
        covariance = np.column_stack([rollout["P_times"], cov])
        return {
            "label": label,
            "epsilon": epsilon,
            "motionCost": float(motion_cost),
            "motionIncrease": float(motion_increase),
            "savedMeanCovariance": float(saved_mean),
            "recomputedMeanCovariance": mean,
            "trajectory": rounded(trajectory),
            "covariance": rounded(covariance, 9),
        }

    cases = [
        export_case(
            "motion-only", None, saved["X_baseline"], saved["U_baseline"],
            saved["J_motion_star"], 0.0, saved["running_baseline"],
        )
    ]
    for i, epsilon in enumerate(epsilons):
        cases.append(
            export_case(
                f"ε = {epsilon:g}", float(epsilon), states[i], controls[i],
                saved["J_motion"][i], saved["motion_increase"][i],
                saved["running_covariance"][i],
            )
        )

    payload = {
        "source": "Ryan/figures/visibility_ablation/full_information_hard_fov/centre/epsilon_sweep.npz",
        "model": "maximum-likelihood-observation covariance rollout",
        "horizon": 5.0,
        "cameraRate": 10.0,
        "landmark": rounded(landmark[0]),
        "cases": cases,
    }
    args.output.write_text(
        "window.OPTIMIZATION_DATA = " + json.dumps(payload, separators=(",", ":")) + ";\n"
    )


if __name__ == "__main__":
    main()
