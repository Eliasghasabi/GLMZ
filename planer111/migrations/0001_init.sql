-- ═══════════════════════════════════════════════════════════════════
-- StudyFlow — Cloudflare D1 migration 0001_init
-- Mirrors prisma/schema.prisma exactly (table/column naming included),
-- so the same code runs on SQLite (dev) and D1 (production).
-- Apply with:  wrangler d1 migrations apply studyflow-db --remote
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────── Users & auth ───────────────────────────

CREATE TABLE "User" (
    "id"           TEXT    NOT NULL PRIMARY KEY,
    "email"        TEXT    NOT NULL,
    "name"         TEXT    NOT NULL,
    "passwordHash" TEXT    NOT NULL,
    "avatarEmoji"  TEXT    NOT NULL DEFAULT '🎓',
    "avatarColor"  TEXT    NOT NULL DEFAULT '#6366F1',
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    DATETIME NOT NULL
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Session" (
    "id"        TEXT    NOT NULL PRIMARY KEY,
    "tokenHash" TEXT    NOT NULL,
    "userId"    TEXT    NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

CREATE TABLE "UserSettings" (
    "userId"                  TEXT    NOT NULL PRIMARY KEY,
    "theme"                   TEXT    NOT NULL DEFAULT 'system',
    "language"                TEXT    NOT NULL DEFAULT 'fa',
    "pomodoroFocus"           INTEGER NOT NULL DEFAULT 25,
    "pomodoroBreak"           INTEGER NOT NULL DEFAULT 5,
    "pomodoroLongBreak"       INTEGER NOT NULL DEFAULT 15,
    "pomodorosUntilLongBreak" INTEGER NOT NULL DEFAULT 4,
    "revisionIntervals"       TEXT    NOT NULL DEFAULT '[1,3,7,14,30]',
    "dailyGoalMinutes"        INTEGER NOT NULL DEFAULT 120,
    "preferredSessionMinutes" INTEGER NOT NULL DEFAULT 45,
    "notifyTasks"             BOOLEAN NOT NULL DEFAULT true,
    "notifyExams"             BOOLEAN NOT NULL DEFAULT true,
    "notifyRevisions"         BOOLEAN NOT NULL DEFAULT true,
    "notifyStudy"             BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ─────────────────────────── Study core ───────────────────────────

CREATE TABLE "Subject" (
    "id"            TEXT    NOT NULL PRIMARY KEY,
    "userId"        TEXT    NOT NULL,
    "name"          TEXT    NOT NULL,
    "icon"          TEXT    NOT NULL DEFAULT '📘',
    "color"         TEXT    NOT NULL DEFAULT '#6366F1',
    "description"   TEXT,
    "teacher"       TEXT,
    "totalChapters" INTEGER NOT NULL DEFAULT 0,
    "archived"      BOOLEAN NOT NULL DEFAULT false,
    "isDemo"        BOOLEAN NOT NULL DEFAULT false,
    "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     DATETIME NOT NULL,
    CONSTRAINT "Subject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Subject_userId_archived_idx" ON "Subject"("userId", "archived");

CREATE TABLE "Topic" (
    "id"               TEXT    NOT NULL PRIMARY KEY,
    "userId"           TEXT    NOT NULL,
    "subjectId"        TEXT    NOT NULL,
    "title"            TEXT    NOT NULL,
    "description"      TEXT,
    "status"           TEXT    NOT NULL DEFAULT 'NOT_STARTED',
    "difficulty"       TEXT    NOT NULL DEFAULT 'MEDIUM',
    "estimatedMinutes" INTEGER,
    "actualMinutes"    INTEGER NOT NULL DEFAULT 0,
    "chapterLabel"     TEXT,
    "notes"            TEXT,
    "completedAt"      DATETIME,
    "isDemo"           BOOLEAN NOT NULL DEFAULT false,
    "createdAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        DATETIME NOT NULL,
    CONSTRAINT "Topic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Topic_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Topic_userId_subjectId_idx" ON "Topic"("userId", "subjectId");
CREATE INDEX "Topic_userId_status_idx" ON "Topic"("userId", "status");

-- ─────────────────────────── Tasks ───────────────────────────

CREATE TABLE "Task" (
    "id"               TEXT    NOT NULL PRIMARY KEY,
    "userId"           TEXT    NOT NULL,
    "subjectId"        TEXT,
    "title"            TEXT    NOT NULL,
    "description"      TEXT,
    "dueDate"          TEXT,
    "priority"         TEXT    NOT NULL DEFAULT 'MEDIUM',
    "estimatedMinutes" INTEGER,
    "status"           TEXT    NOT NULL DEFAULT 'TODO',
    "tags"             TEXT    NOT NULL DEFAULT '[]',
    "completedAt"      DATETIME,
    "isDemo"           BOOLEAN NOT NULL DEFAULT false,
    "createdAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        DATETIME NOT NULL,
    CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Task_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Task_userId_status_idx" ON "Task"("userId", "status");
CREATE INDEX "Task_userId_dueDate_idx" ON "Task"("userId", "dueDate");

-- ─────────────────────────── Planning ───────────────────────────

-- Weekly planner template (0 = Saturday … 6 = Friday)
CREATE TABLE "StudyBlock" (
    "id"        TEXT    NOT NULL PRIMARY KEY,
    "userId"    TEXT    NOT NULL,
    "subjectId" TEXT,
    "topicId"   TEXT,
    "title"     TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT    NOT NULL,
    "endTime"   TEXT    NOT NULL,
    "color"     TEXT,
    "status"    TEXT    NOT NULL DEFAULT 'PLANNED',
    "isDemo"    BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudyBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudyBlock_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StudyBlock_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "StudyBlock_userId_dayOfWeek_idx" ON "StudyBlock"("userId", "dayOfWeek");

-- Actual study sessions — source of truth for stats & streaks
CREATE TABLE "StudySession" (
    "id"              TEXT    NOT NULL PRIMARY KEY,
    "userId"          TEXT    NOT NULL,
    "subjectId"       TEXT,
    "topicId"         TEXT,
    "date"            TEXT    NOT NULL,
    "startTime"       TEXT    NOT NULL,
    "endTime"         TEXT    NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "notes"           TEXT,
    "source"          TEXT    NOT NULL DEFAULT 'MANUAL',
    "completed"       BOOLEAN NOT NULL DEFAULT true,
    "isDemo"          BOOLEAN NOT NULL DEFAULT false,
    "createdAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudySession_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StudySession_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "StudySession_userId_date_idx" ON "StudySession"("userId", "date");
CREATE INDEX "StudySession_userId_subjectId_idx" ON "StudySession"("userId", "subjectId");

CREATE TABLE "PomodoroSession" (
    "id"          TEXT    NOT NULL PRIMARY KEY,
    "userId"      TEXT    NOT NULL,
    "subjectId"   TEXT,
    "minutes"     INTEGER NOT NULL,
    "type"        TEXT    NOT NULL DEFAULT 'FOCUS',
    "isDemo"      BOOLEAN NOT NULL DEFAULT false,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PomodoroSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PomodoroSession_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "PomodoroSession_userId_completedAt_idx" ON "PomodoroSession"("userId", "completedAt");

-- ─────────────────────────── Smart revision ───────────────────────────

CREATE TABLE "Revision" (
    "id"             TEXT    NOT NULL PRIMARY KEY,
    "userId"         TEXT    NOT NULL,
    "topicId"        TEXT    NOT NULL,
    "subjectId"      TEXT,
    "revisionNumber" INTEGER NOT NULL,
    "dueDate"        TEXT    NOT NULL,
    "status"         TEXT    NOT NULL DEFAULT 'PENDING',
    "completedAt"    DATETIME,
    "isDemo"         BOOLEAN NOT NULL DEFAULT false,
    "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Revision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Revision_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Revision_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Revision_userId_dueDate_status_idx" ON "Revision"("userId", "dueDate", "status");
CREATE INDEX "Revision_userId_topicId_idx" ON "Revision"("userId", "topicId");
CREATE UNIQUE INDEX "Revision_topicId_revisionNumber_key" ON "Revision"("topicId", "revisionNumber");

-- ─────────────────────────── Exams / Goals / Notes ───────────────────────────

CREATE TABLE "Exam" (
    "id"              TEXT    NOT NULL PRIMARY KEY,
    "userId"          TEXT    NOT NULL,
    "subjectId"       TEXT,
    "title"           TEXT    NOT NULL,
    "date"            TEXT    NOT NULL,
    "time"            TEXT,
    "location"        TEXT,
    "topics"          TEXT    NOT NULL DEFAULT '[]',
    "notes"           TEXT,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "isDemo"          BOOLEAN NOT NULL DEFAULT false,
    "createdAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       DATETIME NOT NULL,
    CONSTRAINT "Exam_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Exam_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Exam_userId_date_idx" ON "Exam"("userId", "date");

CREATE TABLE "Goal" (
    "id"           TEXT    NOT NULL PRIMARY KEY,
    "userId"       TEXT    NOT NULL,
    "title"        TEXT    NOT NULL,
    "targetValue"  REAL    NOT NULL,
    "currentValue" REAL    NOT NULL DEFAULT 0,
    "unit"         TEXT    NOT NULL DEFAULT 'واحد',
    "deadline"     TEXT,
    "status"       TEXT    NOT NULL DEFAULT 'ACTIVE',
    "isDemo"       BOOLEAN NOT NULL DEFAULT false,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    DATETIME NOT NULL,
    CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Goal_userId_status_idx" ON "Goal"("userId", "status");

CREATE TABLE "Note" (
    "id"        TEXT    NOT NULL PRIMARY KEY,
    "userId"    TEXT    NOT NULL,
    "subjectId" TEXT,
    "topicId"   TEXT,
    "title"     TEXT    NOT NULL,
    "content"   TEXT    NOT NULL DEFAULT '',
    "tags"      TEXT    NOT NULL DEFAULT '[]',
    "pinned"    BOOLEAN NOT NULL DEFAULT false,
    "isDemo"    BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Note_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Note_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Note_userId_updatedAt_idx" ON "Note"("userId", "updatedAt");

-- ─────────────────────────── Notifications ───────────────────────────

CREATE TABLE "Notification" (
    "id"        TEXT    NOT NULL PRIMARY KEY,
    "userId"    TEXT    NOT NULL,
    "type"      TEXT    NOT NULL,
    "title"     TEXT    NOT NULL,
    "body"      TEXT,
    "link"      TEXT,
    "dedupeKey" TEXT    NOT NULL,
    "read"      BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
CREATE INDEX "Notification_userId_read_createdAt_idx" ON "Notification"("userId", "read", "createdAt");
