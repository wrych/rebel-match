-- The double opt-in (ADR 0004, design §2). No email is stored here: an address
-- is read from members only for an accepted request and only by one of its two
-- parties (R-CONN-3, R-CONN-6). A request goes with either member when they
-- are deleted (R-NFR-7); its challenge, being only context, is let go.
--
-- pending_key holds a value only while a request is pending, and is unique, so
-- the database itself refuses a second pending request between the same two
-- members about the same challenge, or about none (R-CONN-5). An answered
-- request leaves the key empty and does not block a later one.
CREATE TABLE connection_requests (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  requester_id CHAR(36)     NOT NULL,
  target_id    CHAR(36)     NOT NULL,
  challenge_id CHAR(36)     NULL,
  kind         ENUM('same_boat','been_there') NOT NULL,
  message      VARCHAR(600) NULL,
  status       ENUM('pending','accepted','declined') NOT NULL DEFAULT 'pending',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at DATETIME     NULL,
  pending_key  VARCHAR(110) AS (
    IF(status = 'pending',
       CONCAT(requester_id, ':', target_id, ':', COALESCE(challenge_id, '-')),
       NULL)
  ) VIRTUAL,
  KEY ix_req_target (target_id, status),
  KEY ix_req_requester (requester_id),
  UNIQUE KEY uq_pending (pending_key),
  CONSTRAINT fk_req_requester FOREIGN KEY (requester_id)
    REFERENCES members(id) ON DELETE CASCADE,
  CONSTRAINT fk_req_target FOREIGN KEY (target_id)
    REFERENCES members(id) ON DELETE CASCADE,
  CONSTRAINT fk_req_challenge FOREIGN KEY (challenge_id)
    REFERENCES challenges(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
