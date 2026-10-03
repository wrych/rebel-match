-- The Ask journey's tables (design §2). Trends and cases are shared seed
-- content; a member's challenges, expertise and follows go with them when the
-- member is deleted (R-NFR-7), so those keys cascade.
CREATE TABLE trends (
  id         CHAR(2)     NOT NULL PRIMARY KEY,
  short      VARCHAR(80) NOT NULL,
  from_label VARCHAR(80) NOT NULL,
  peers      INT         NOT NULL DEFAULT 0,
  keywords   JSON        NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE cases (
  id       BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  trend_id CHAR(2)      NOT NULL,
  org      VARCHAR(120) NOT NULL,
  url      VARCHAR(400) NOT NULL,
  takeaway VARCHAR(400) NOT NULL,
  UNIQUE KEY uq_case_trend_url (trend_id, url),
  CONSTRAINT fk_case_trend FOREIGN KEY (trend_id) REFERENCES trends(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE challenges (
  id         CHAR(36)   NOT NULL PRIMARY KEY,
  member_id  CHAR(36)   NOT NULL,
  body       TEXT       NOT NULL,
  trend_id   CHAR(2)    NULL,
  auto_trend CHAR(2)    NULL,
  overridden TINYINT(1) NOT NULL DEFAULT 0,
  status     ENUM('draft','active','archived') NOT NULL DEFAULT 'active',
  created_at DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_challenge_member (member_id),
  KEY ix_challenge_trend (trend_id),
  CONSTRAINT fk_challenge_member FOREIGN KEY (member_id)
    REFERENCES members(id) ON DELETE CASCADE,
  CONSTRAINT fk_challenge_trend FOREIGN KEY (trend_id) REFERENCES trends(id),
  CONSTRAINT fk_challenge_auto_trend FOREIGN KEY (auto_trend)
    REFERENCES trends(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE member_expertise (
  member_id CHAR(36)     NOT NULL,
  trend_id  CHAR(2)      NOT NULL,
  note      VARCHAR(400) NULL,
  PRIMARY KEY (member_id, trend_id),
  KEY ix_expertise_trend (trend_id),
  CONSTRAINT fk_exp_member FOREIGN KEY (member_id)
    REFERENCES members(id) ON DELETE CASCADE,
  CONSTRAINT fk_exp_trend FOREIGN KEY (trend_id) REFERENCES trends(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE follows (
  member_id  CHAR(36) NOT NULL,
  trend_id   CHAR(2)  NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (member_id, trend_id),
  CONSTRAINT fk_follow_member FOREIGN KEY (member_id)
    REFERENCES members(id) ON DELETE CASCADE,
  CONSTRAINT fk_follow_trend FOREIGN KEY (trend_id) REFERENCES trends(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
