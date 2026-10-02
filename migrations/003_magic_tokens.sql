-- Only the hash is stored; the raw token exists in the email and nowhere else
-- (R-NFR-5). `kind` drives the lifetime: self-service links are short-lived,
-- approval links were not asked for and live longer (R-AUTH-10).
CREATE TABLE magic_tokens (
  id         CHAR(36) NOT NULL PRIMARY KEY,
  member_id  CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  kind       ENUM('self_service','approval') NOT NULL DEFAULT 'self_service',
  next_path  VARCHAR(512) NULL,
  expires_at DATETIME NOT NULL,
  used_at    DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_magic_tokens_hash (token_hash),
  KEY ix_magic_tokens_member (member_id),
  CONSTRAINT fk_magic_tokens_member FOREIGN KEY (member_id)
    REFERENCES members(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
