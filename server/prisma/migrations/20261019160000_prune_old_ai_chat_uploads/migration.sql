-- AI chat uploads are ephemeral. On deployment, keep only each user's newest
-- 10 MiB of previously persisted chat uploads. This does NOT touch permanent
-- TaskAttachment rows or AI-generated documents.
WITH ranked AS (
  SELECT "id", SUM("size") OVER (
    PARTITION BY "userId"
    ORDER BY "createdAt" DESC, "id" DESC
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS running_bytes
  FROM "AiConversationAttachment"
)
DELETE FROM "AiConversationAttachment" AS files
USING ranked
WHERE files."id" = ranked."id"
  AND ranked.running_bytes > 10485760;
