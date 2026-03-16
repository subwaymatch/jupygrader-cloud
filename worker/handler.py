"""
handler.py — AWS Lambda entrypoint for SQS-triggered grading jobs.

Each SQS record contains exactly one grading job. The handler:
1. Parses the SQS message body
2. Updates the submission status to "processing"
3. Invokes grade_notebook() from grader.py
4. Updates the submission status to "completed" with results
5. On any exception, marks the submission "failed" and re-raises
   (so SQS can route the message to a DLQ if configured)
"""

import json
import logging
import os
from typing import Any

import psycopg2

from grader import grade_notebook

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def handler(event: dict[str, Any], context: Any) -> None:
    """Lambda handler — processes one SQS record at a time."""
    records = event.get("Records", [])
    logger.info("Processing %d SQS record(s)", len(records))

    for record in records:
        body = json.loads(record["body"])
        submission_id = body["submissionId"]
        workspace_id = body["workspaceId"]
        s3_key = body["s3Key"]

        logger.info(
            "Starting grading: submission=%s workspace=%s", submission_id, workspace_id
        )

        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        try:
            _update_status(conn, submission_id, "processing")

            grading_result = grade_notebook(submission_id, workspace_id, s3_key)

            _update_status(conn, submission_id, "completed", result=grading_result)
            logger.info("Grading completed for submission %s", submission_id)

        except Exception as exc:
            logger.exception("Grading failed for submission %s: %s", submission_id, exc)
            try:
                _update_status(conn, submission_id, "failed", error=str(exc))
            except Exception:
                logger.exception("Failed to update error status for submission %s", submission_id)
            raise  # re-raise so SQS can retry / route to DLQ

        finally:
            conn.close()


def _update_status(
    conn: "psycopg2.connection",
    submission_id: str,
    status: str,
    result: dict[str, Any] | None = None,
    error: str | None = None,
) -> None:
    """Updates a single submission row in Postgres."""
    with conn.cursor() as cur:
        if result:
            cur.execute(
                """
                UPDATE submission
                SET
                    status            = %s,
                    score             = %s,
                    graded_html_key   = %s,
                    results_json_key  = %s,
                    summary_txt_key   = %s,
                    graded_at         = NOW(),
                    updated_at        = NOW()
                WHERE id = %s
                """,
                (
                    status,
                    result.get("score"),
                    result.get("graded_html_key"),
                    result.get("results_json_key"),
                    result.get("summary_txt_key"),
                    submission_id,
                ),
            )
        elif error:
            cur.execute(
                """
                UPDATE submission
                SET status = %s, error_message = %s, updated_at = NOW()
                WHERE id = %s
                """,
                (status, error, submission_id),
            )
        else:
            cur.execute(
                "UPDATE submission SET status = %s, updated_at = NOW() WHERE id = %s",
                (status, submission_id),
            )
        conn.commit()
