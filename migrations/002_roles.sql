-- Access is role-based, never an is_admin flag (ADR 0006). A member may hold
-- several roles; effective permissions are the union, resolved from config.
CREATE TABLE roles (
  role_key    VARCHAR(40)  NOT NULL PRIMARY KEY,
  label       VARCHAR(80)  NOT NULL,
  description VARCHAR(255) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE member_roles (
  member_id  CHAR(36)    NOT NULL,
  role_key   VARCHAR(40) NOT NULL,
  granted_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  granted_by CHAR(36)    NULL,
  PRIMARY KEY (member_id, role_key),
  CONSTRAINT fk_member_roles_member FOREIGN KEY (member_id)
    REFERENCES members(id) ON DELETE CASCADE,
  CONSTRAINT fk_member_roles_role FOREIGN KEY (role_key)
    REFERENCES roles(role_key),
  CONSTRAINT fk_member_roles_granter FOREIGN KEY (granted_by)
    REFERENCES members(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
