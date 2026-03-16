"""
grader.py — Orchestrates the full grading pipeline for a single submission.

Steps:
1. Download the raw .ipynb from S3 to /tmp
2. Run the jupygrader package (uses OpenAI) to produce graded artifacts
3. Upload the HTML, JSON, and TXT artifacts back to S3
4. Return S3 keys and score for the handler to persist in Postgres
"""

import boto3
import json
import os
import tempfile
import logging
from typing import Any

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

s3 = boto3.client("s3")
BUCKET = os.environ["S3_BUCKET_NAME"]


def grade_notebook(submission_id: str, workspace_id: str, s3_key: str) -> dict[str, Any]:
    """
    Downloads a notebook from S3, runs jupygrader, uploads artifacts back to S3,
    and returns a dict with the artifact S3 keys and score.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        local_path = os.path.join(tmpdir, f"{submission_id}.ipynb")

        # ── 1. Download raw notebook from S3 ──────────────────────────────────
        logger.info("Downloading %s from S3 bucket %s", s3_key, BUCKET)
        s3.download_file(BUCKET, s3_key, local_path)

        # ── 2. Run jupygrader ─────────────────────────────────────────────────
        grading_prompt = os.environ.get("GRADING_PROMPT", "")
        openai_api_key = os.environ["OPENAI_API_KEY"]

        logger.info("Running jupygrader on submission %s", submission_id)

        # jupygrader public API — adapt if the package exposes a different interface
        from jupygrader import grade  # type: ignore[import]

        result: dict[str, Any] = grade(
            notebook_path=local_path,
            prompt=grading_prompt,
            openai_api_key=openai_api_key,
        )

        base = f"submissions/{workspace_id}"

        # ── 3a. Upload HTML graded notebook ───────────────────────────────────
        html_key = f"{base}/graded/{submission_id}.html"
        html_body: bytes = result["html"].encode("utf-8") if isinstance(result["html"], str) else result["html"]
        s3.put_object(Bucket=BUCKET, Key=html_key, Body=html_body, ContentType="text/html")
        logger.info("Uploaded graded HTML to %s", html_key)

        # ── 3b. Upload JSON results ────────────────────────────────────────────
        json_key = f"{base}/results/{submission_id}.json"
        json_body = json.dumps(result.get("results", {})).encode("utf-8")
        s3.put_object(Bucket=BUCKET, Key=json_key, Body=json_body, ContentType="application/json")
        logger.info("Uploaded JSON results to %s", json_key)

        # ── 3c. Upload text summary ────────────────────────────────────────────
        txt_key = f"{base}/summary/{submission_id}.txt"
        txt_body: bytes = result["summary"].encode("utf-8") if isinstance(result.get("summary"), str) else b""
        s3.put_object(Bucket=BUCKET, Key=txt_key, Body=txt_body, ContentType="text/plain")
        logger.info("Uploaded text summary to %s", txt_key)

        return {
            "score": str(result.get("score", "")) or None,
            "graded_html_key": html_key,
            "results_json_key": json_key,
            "summary_txt_key": txt_key,
        }
