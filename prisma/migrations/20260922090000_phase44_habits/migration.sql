-- CreateEnum
CREATE TYPE "HabitStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "HabitFrequency" AS ENUM ('DAILY', 'WEEKDAYS', 'WEEKLY');

-- AlterEnum
ALTER TYPE "XpSource" ADD VALUE 'HABIT_COMPLETION';

-- AlterTable
ALTER TABLE "XpTransaction" ADD COLUMN     "habitCompletionId" TEXT;

-- CreateTable
CREATE TABLE "Habit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "HabitStatus" NOT NULL DEFAULT 'ACTIVE',
    "frequency" "HabitFrequency" NOT NULL DEFAULT 'DAILY',
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "weeklyTarget" INTEGER,
    "xpReward" INTEGER NOT NULL DEFAULT 10,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Habit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitCompletion" (
    "id" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "completedDate" DATE NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HabitCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitPause" (
    "id" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,

    CONSTRAINT "HabitPause_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Habit_userId_status_idx" ON "Habit"("userId", "status");

-- CreateIndex
CREATE INDEX "HabitCompletion_habitId_completedDate_idx" ON "HabitCompletion"("habitId", "completedDate");

-- CreateIndex
CREATE UNIQUE INDEX "HabitCompletion_habitId_completedDate_key" ON "HabitCompletion"("habitId", "completedDate");

-- CreateIndex
CREATE INDEX "HabitPause_habitId_startDate_idx" ON "HabitPause"("habitId", "startDate");

-- CreateIndex
CREATE INDEX "XpTransaction_habitCompletionId_idx" ON "XpTransaction"("habitCompletionId");

-- CreateIndex
CREATE UNIQUE INDEX "XpTransaction_habitCompletionId_kind_key" ON "XpTransaction"("habitCompletionId", "kind");

-- AddForeignKey
ALTER TABLE "XpTransaction" ADD CONSTRAINT "XpTransaction_habitCompletionId_fkey" FOREIGN KEY ("habitCompletionId") REFERENCES "HabitCompletion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Habit" ADD CONSTRAINT "Habit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitCompletion" ADD CONSTRAINT "HabitCompletion_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitPause" ADD CONSTRAINT "HabitPause_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

