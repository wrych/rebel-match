-- Every outbound message, in every environment (ADR 0016). Outside development
-- the stored body has its magic-link token redacted, so this table can never be
-- used to sign in as someone else (R-MSG-4).
CREATE TABLE outbox (
  id         CHAR(36)     NOT NULL PRIMARY KEY,
  member_id  CHAR(36)     NULL,
  to_email   VARCHAR(320) NOT NULL,
  kind       ENUM('magic_link','approval','connection_request','admin_notice')
                          NOT NULL,
  subject    VARCHAR(255) NOT NULL,
  body_text  MEDIUMTEXT   NOT NULL,
  body_html  MEDIUMTEXT   NULL,
  status     ENUM('recorded','sent','suppressed','failed')
                          NOT NULL DEFAULT 'recorded',
  error      VARCHAR(500) NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at    DATETIME     NULL,
  KEY ix_outbox_created (created_at),
  KEY ix_outbox_to (to_email),
  KEY ix_outbox_status (status),
  CONSTRAINT fk_outbox_member FOREIGN KEY (member_id)
    REFERENCES members(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
