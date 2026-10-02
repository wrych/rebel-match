-- Invite tokens are printed on posters, so they are public capabilities rather
-- than secrets and are stored in clear (ADR 0014). Their protection is the
-- window, the cap and revocation.
CREATE TABLE invites (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  token       VARCHAR(64)  NOT NULL,
  label       VARCHAR(120) NOT NULL,
  valid_from  DATETIME     NOT NULL,
  valid_until DATETIME     NOT NULL,
  max_uses    INT UNSIGNED NOT NULL,
  uses        INT UNSIGNED NOT NULL DEFAULT 0,
  revoked_at  DATETIME     NULL,
  created_by  CHAR(36)     NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_invites_token (token),
  CONSTRAINT fk_invites_creator FOREIGN KEY (created_by)
    REFERENCES members(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- members was created first, so the back-reference is added here rather than
-- leaving a circular dependency between the two tables.
ALTER TABLE members
  ADD CONSTRAINT fk_members_invite FOREIGN KEY (joined_via_invite_id)
    REFERENCES invites(id) ON DELETE SET NULL;
