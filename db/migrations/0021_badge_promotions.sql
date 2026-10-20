-- The promotions players reached before badges counted them, recorded once
-- and quietly as the launch award does (R-BADGE-11): each job from its first
-- day, as src/badges/rows.ts places them.
INSERT INTO "member_badges" ("member_id", "row_key", "level", "earned_at", "seen_at")
SELECT p."member_id", 'game', job."level", now(), now()
FROM "game_players" p
JOIN "members" m ON m."id" = p."member_id" AND m."status" = 'active'
JOIN (VALUES (1, 1), (2, 4), (3, 7), (4, 10), (5, 13), (6, 16)) AS job("level", "first_day")
  ON p."highest_level" >= job."first_day"
ON CONFLICT DO NOTHING;
