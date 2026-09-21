-- CreateEnum
CREATE TYPE "FocusSessionStatus" AS ENUM ('RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "FocusSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "status" "FocusSessionStatus" NOT NULL DEFAULT 'RUNNING',
    "targetMinutes" INTEGER,
    "accumulatedSeconds" INTEGER NOT NULL DEFAULT 0,
    "segmentStartedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FocusSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FocusSession_userId_status_idx" ON "FocusSession"("userId", "status");

-- CreateIndex
CREATE INDEX "FocusSession_taskId_status_idx" ON "FocusSession"("taskId", "status");

-- CreateIndex
CREATE INDEX "FocusSession_userId_endedAt_idx" ON "FocusSession"("userId", "endedAt");

-- AddForeignKey
ALTER TABLE "FocusSession" ADD CONSTRAINT "FocusSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusSession" ADD CONSTRAINT "FocusSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- One active focus session per user, enforced by the database.
--
-- Written by hand because Prisma's schema language has no way to express a
-- filtered index, so this constraint exists only here. It is the reason two
-- concurrent "start" requests cannot both succeed: the second one loses on the
-- index and comes back as a unique-violation, which the service turns into a
-- conflict naming the session that already exists.
--
-- An application-level "check, then insert" cannot do this — between the check
-- and the insert, the other request commits.
--
-- COMPLETED and CANCELLED rows are deliberately outside the index, so a user
-- accumulates any number of finished sessions and at most one live one.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "FocusSession_one_active_per_user"
    ON "FocusSession"("userId")
    WHERE "status" IN ('RUNNING', 'PAUSED');
