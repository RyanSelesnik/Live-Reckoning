#!/usr/bin/env python3
"""Export saved hard-FoV landmark sweeps for the project page.

No optimisation is solved here. Saved flat-output plans are sampled, then the
report's deterministic covariance rollout and calibrated camera model are run.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import casadi as ca
import numpy as np


GEOMETRIES = {
    "centre": ("centred", np.array([11.0, 0.0, 1.0])),
    "image_left": ("left", np.array([11.0, 1.0, 1.0])),
}


def rounded(values, digits=7):
    return np.round(np.asarray(values, dtype=float), digits).tolist()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("archive_root", type=Path, help="directory containing centre/ and image_left/")
    parser.add_argument("model_root", type=Path, help="directory containing belief.py")
    parser.add_argument("output", type=Path, help="output optimization-data.js")
    args = parser.parse_args()

    sys.path.insert(0, str(args.model_root.resolve()))
    import config

    # Match the explicit overrides in run_landmark_experiment_simple.py before
    # trajectory.py imports these values.
    config.MAX_VELOCITY = 5.0
    config.MAX_ACCELERATION = 3.0
    config.MAX_JERK = 4.0
    config.MAX_YAW_RATE = np.deg2rad(60.0)
    config.MAX_YAW_ACCELERATION = np.deg2rad(20.0)

    from belief import camera_model, initial_joint_covariance, rollout_covariance
    from config import CX, CY, FX, FY, IMAGE_HEIGHT, IMAGE_WIDTH, Z0
    from optimisation import IMAGE_MARGIN, MINIMUM_LANDMARK_DEPTH
    from trajectory import evaluate_quadrotor_reference, sample_snap_plan, snap_motion_cost

    sample_times = np.linspace(0.0, 5.0, 101)
    P0 = initial_joint_covariance(num_landmarks=1)

    def export_case(label, epsilon, X, U, motion_cost, motion_increase, saved_mean, landmark):
        sampled = sample_snap_plan(X, U, sample_times)
        X_dm, U_dm = ca.DM(X), ca.DM(U)
        rollout = rollout_covariance(X_dm, U_dm, P0, ca.DM(landmark.reshape(1, 3)))
        cov = np.asarray([float(P[0, 0] + P[1, 1]) for P in rollout["P"]])
        mean = float(np.mean(cov[1:]))
        if saved_mean is not None and not np.isclose(mean, saved_mean, rtol=5e-3, atol=5e-5):
            raise ValueError(f"covariance rollout mismatch for {label}: {mean} vs {saved_mean}")

        pixels = []
        for time, position in zip(sample_times, sampled["position"].T):
            R_WB, _, _ = evaluate_quadrotor_reference(X_dm, U_dm, float(time))
            p_C, pixel, _ = camera_model(
                ca.DM([position[0], position[1], Z0]), R_WB, ca.DM(landmark)
            )
            pixel = np.asarray(pixel, dtype=float).ravel()
            depth = float(p_C[2])
            if depth <= 0.0:
                raise ValueError(f"{label} passes behind the camera at t={time:g}")
            pixels.append([time, pixel[0], pixel[1], depth])

        trajectory = np.column_stack(
            [sampled["time"], sampled["position"][0], sampled["position"][1], sampled["psi"]]
        )
        covariance = np.column_stack([rollout["P_times"], cov])
        return {
            "label": label,
            "epsilon": epsilon,
            "motionCost": float(motion_cost),
            "motionIncrease": float(motion_increase),
            "savedMeanCovariance": float(mean if saved_mean is None else saved_mean),
            "recomputedMeanCovariance": mean,
            "trajectory": rounded(trajectory),
            "pixels": rounded(pixels),
            "covariance": rounded(covariance, 9),
        }

    exported = {}
    expected_epsilons = None
    required = {"epsilons", "X_baseline", "U_baseline", "X", "U"}
    for key, (label, expected_landmark) in GEOMETRIES.items():
        archive = args.archive_root / key / "epsilon_sweep.npz"
        saved = np.load(archive)
        missing = required.difference(saved.files)
        if missing:
            raise ValueError(f"{key} missing arrays: {sorted(missing)}")
        landmark_key = "landmark_W" if "landmark_W" in saved.files else "landmark"
        if landmark_key not in saved.files:
            raise ValueError(f"{key} missing landmark array")
        landmark = np.asarray(saved[landmark_key], dtype=float).reshape(-1, 3)
        if landmark.shape != (1, 3) or not np.allclose(landmark[0], expected_landmark):
            raise ValueError(f"unexpected {key} landmark: {landmark}")

        epsilons = np.asarray(saved["epsilons"], dtype=float)
        if expected_epsilons is None:
            expected_epsilons = epsilons
        elif not np.array_equal(epsilons, expected_epsilons):
            raise ValueError("saved sweeps use different epsilon grids")
        states = np.asarray(saved["X"], dtype=float)
        controls = np.asarray(saved["U"], dtype=float)
        if states.shape != (len(epsilons), 10, 51) or controls.shape != (len(epsilons), 3, 50):
            raise ValueError(f"unexpected {key} trajectory dimensions")

        baseline_motion = (
            float(saved["J_motion_star"])
            if "J_motion_star" in saved.files
            else float(snap_motion_cost(ca.DM(saved["U_baseline"])))
        )
        saved_baseline = float(saved["running_baseline"]) if "running_baseline" in saved.files else None
        cases = [
            export_case(
                "motion-only", None, saved["X_baseline"], saved["U_baseline"],
                baseline_motion, 0.0, saved_baseline, landmark[0],
            )
        ]
        for i, epsilon in enumerate(epsilons):
            motion_cost = (
                float(saved["J_motion"][i])
                if "J_motion" in saved.files
                else float(snap_motion_cost(ca.DM(controls[i])))
            )
            motion_increase = (
                float(saved["motion_increase"][i])
                if "motion_increase" in saved.files
                else 100.0 * (motion_cost / baseline_motion - 1.0)
            )
            saved_mean = (
                float(saved["running_covariance"][i])
                if "running_covariance" in saved.files
                else None
            )
            cases.append(
                export_case(
                    f"ε = {epsilon:g}", float(epsilon), states[i], controls[i],
                    motion_cost, motion_increase, saved_mean, landmark[0],
                )
            )
        exported[key] = {
            "label": label,
            "source": f"Ryan/figures/{args.archive_root.name}/{key}/epsilon_sweep.npz",
            "landmark": rounded(landmark[0]),
            "cases": cases,
        }

    payload = {
        "model": "maximum-likelihood-observation covariance rollout",
        "horizon": 5.0,
        "cameraRate": 10.0,
        "planner": {
            "intervals": 50,
            "step": 0.1,
            "altitude": float(Z0),
            "start": [0.0, 0.0],
            "goal": [10.0, 0.0],
            "bounds": {
                "velocity": float(config.MAX_VELOCITY),
                "acceleration": float(config.MAX_ACCELERATION),
                "jerk": float(config.MAX_JERK),
                "yawDegrees": float(np.rad2deg(config.MAX_ABS_YAW)),
                "yawRateDegrees": float(np.rad2deg(config.MAX_YAW_RATE)),
                "yawAccelerationDegrees": float(np.rad2deg(config.MAX_YAW_ACCELERATION)),
            },
            "minimumDepth": float(MINIMUM_LANDMARK_DEPTH),
            "imageMargin": float(IMAGE_MARGIN),
        },
        "image": {
            "width": IMAGE_WIDTH, "height": IMAGE_HEIGHT,
            "fx": FX, "fy": FY, "cx": CX, "cy": CY,
        },
        "geometries": exported,
    }
    args.output.write_text(
        "window.OPTIMIZATION_DATA = " + json.dumps(payload, separators=(",", ":")) + ";\n"
    )


if __name__ == "__main__":
    main()
