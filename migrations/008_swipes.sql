-- What a member did with each card in the deck, so a challenge they already
-- swiped never comes back (design §2, R-OFF-2). It goes with either side when
-- a member or a challenge is deleted (R-NFR-7).
CREATE TABLE swipes (
  member_id    CHAR(36) NOT NULL,
  challenge_id CHAR(36) NOT NULL,
  action       ENUM('same_boat','been_there','follow','skip') NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (member_id, challenge_id, action),
  KEY ix_swipe_challenge (challenge_id),
  CONSTRAINT fk_swipe_member FOREIGN KEY (member_id)
    REFERENCES members(id) ON DELETE CASCADE,
  CONSTRAINT fk_swipe_challenge FOREIGN KEY (challenge_id)
    REFERENCES challenges(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
