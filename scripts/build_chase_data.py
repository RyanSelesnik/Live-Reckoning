#!/usr/bin/env python3
"""Build static chase-view data from completed OpenVINS runs only."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np


CASES = ("straight", "weave_3d")
START_S = 8.0
END_S = 41.3
CHI2_95_3D = 7.814727903251179


def table(path: Path) -> np.ndarray:
    rows = np.loadtxt(path, comments="#")
    return rows[None, :] if rows.ndim == 1 else rows


def nearest_rows(source: np.ndarray, times: np.ndarray) -> np.ndarray:
    indices = np.searchsorted(source[:, 0], times)
    indices = np.clip(indices, 1, len(source) - 1)
    left = indices - 1
    use_left = np.abs(source[left, 0] - times) <= np.abs(source[indices, 0] - times)
    return source[np.where(use_left, left, indices)]


def rounded(values: np.ndarray, digits: int) -> list[float]:
    return np.round(values.astype(float), digits).tolist()


def build_case(results: Path, name: str) -> list[list]:
    run = results / name / "seed_00"
    estimate = table(run / "state_est.txt")
    estimate = estimate[(estimate[:, 0] >= START_S) & (estimate[:, 0] <= END_S)]
    truth = nearest_rows(table(run / "state_gt.txt"), estimate[:, 0])
    covariance = nearest_rows(table(run / "cov.txt"), estimate[:, 0])

    frames = []
    for gt, est, cov in zip(truth, estimate, covariance, strict=True):
        dimension = int(cov[1])
        full = cov[2:].reshape(dimension, dimension)
        position_covariance = 0.5 * (full[3:6, 3:6] + full[3:6, 3:6].T)
        eigenvalues, eigenvectors = np.linalg.eigh(position_covariance)
        order = np.argsort(eigenvalues)[::-1]
        eigenvalues, eigenvectors = eigenvalues[order], eigenvectors[:, order]
        for column in range(3):
            pivot = int(np.argmax(np.abs(eigenvectors[:, column])))
            if eigenvectors[pivot, column] < 0:
                eigenvectors[:, column] *= -1
        if np.linalg.det(eigenvectors) < 0:
            eigenvectors[:, -1] *= -1
        radii = np.sqrt(CHI2_95_3D * np.maximum(eigenvalues, 0.0))

        # [time, truth p/q, estimate p/q, 95% radii, row-major eigenbasis]
        frames.append([
            round(float(est[0]), 3),
            rounded(gt[5:8], 5) + rounded(gt[1:5], 7),
            rounded(est[5:8], 5) + rounded(est[1:5], 7),
            rounded(radii, 6),
            rounded(eigenvectors.reshape(-1), 7),
        ])
    return frames


def main() -> None:
    parser = argparse.ArgumentParser()
    default_source = Path(__file__).resolve().parents[2] / "gramian-acados"
    parser.add_argument("--source", type=Path, default=default_source)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "chase-data.js")
    args = parser.parse_args()
    results = args.source.resolve() / "simple_motion/simple_motion_results"
    payload = {
        "meta": {"start": START_S, "end": END_S, "confidence": 0.95, "source": "recorded OpenVINS seed_00"},
        "cases": {name: build_case(results, name) for name in CASES},
    }
    args.output.write_text("window.CHASE_DATA=" + json.dumps(payload, separators=(",", ":")) + ";\n")
    print(f"wrote {args.output} from completed runs")


if __name__ == "__main__":
    main()
