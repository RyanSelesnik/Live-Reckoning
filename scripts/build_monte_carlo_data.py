#!/usr/bin/env python3
"""Export the centred-landmark Monte Carlo aggregate histories for the project page."""

import argparse
import csv
import json
from pathlib import Path

import numpy as np


DEFAULT_SOURCE = Path("../gramian-acados/Ryan/monte_carlo_report_landmark_results_sola/centre")


def rounded(values):
    return np.round(np.asarray(values, dtype=float), 9).tolist()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=Path("monte-carlo-data.js"))
    args = parser.parse_args()

    histories = np.load(args.source / "histories.npz")
    with (args.source / "summary.csv").open(newline="") as handle:
        summaries = list(csv.DictReader(handle))

    epsilons = histories["epsilon"]
    if len(summaries) != len(epsilons):
        raise ValueError("summary and history case counts differ")

    cases = []
    for index, epsilon in enumerate(epsilons):
        summary = summaries[index]
        if not np.isclose(float(summary["epsilon"]), epsilon):
            raise ValueError(f"epsilon mismatch at row {index}")
        cases.append({
            "epsilon": float(epsilon),
            "runningMse": float(summary["mc_running_mse"]),
            "runningPrediction": float(summary["planning_running_covariance"]),
            "meanHorizontalAnees": float(summary["mean_horizontal_anees"]),
            "visibleFraction": float(summary["visible_fraction"]),
            "empiricalMse": rounded(histories["empirical_mse"][index]),
            "predictedCovariance": rounded(histories["predicted_covariance"][index]),
            "meanAnees": rounded(histories["mean_anees"][index]),
        })

    payload = {
        "source": "Ryan/monte_carlo_report_landmark_results_sola/centre",
        "trials": 200,
        "geometry": "centred landmark",
        "horizon": float(histories["times"][-1]),
        "times": rounded(histories["times"]),
        "cases": cases,
    }
    args.output.write_text("window.MONTE_CARLO_DATA = " + json.dumps(payload, separators=(",", ":")) + ";\n")


if __name__ == "__main__":
    main()
