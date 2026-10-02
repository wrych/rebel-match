-- Members, applicants and the whitelist are one table (design.md §2).
-- Onboarding is complete only when both `name` and `consent_at` are set
-- (R-ONB-1); `requested_name` is what an applicant typed at the door and never
-- satisfies that gate (R-AUTH-12).
CREATE TABLE members (
  id                   CHAR(36)     NOT NULL PRIMARY KEY,
  email                VARCHAR(320) NOT NULL,
  name                 VARCHAR(120) NULL,
  job_title            VARCHAR(120) NULL,
  org                  VARCHAR(160) NULL,
  sector               VARCHAR(160) NULL,
  status               ENUM('applicant','active','rejected','deleted')
                                    NOT NULL DEFAULT 'applicant',
  requested_name       VARCHAR(120) NULL,
  requested_org        VARCHAR(160) NULL,
  joined_via_invite_id CHAR(36)     NULL,
  consent_version      VARCHAR(20)  NULL,
  consent_at           DATETIME     NULL,
  analytics_id         CHAR(36)     NOT NULL,
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_members_email (email),
  UNIQUE KEY uq_members_analytics_id (analytics_id),
  KEY ix_members_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
