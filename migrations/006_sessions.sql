-- design.md §8 requires a server-side session store, but §2 never defined one.
-- Defining it here keeps the schema in version control and under the
-- run-from-scratch check in CI (R-QA-4), rather than letting the session
-- library create a table nobody reviewed.
CREATE TABLE sessions (
  session_id VARCHAR(128) NOT NULL PRIMARY KEY,
  expires    INT UNSIGNED NOT NULL,
  data       MEDIUMTEXT   NULL,
  KEY ix_sessions_expires (expires)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
