-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lastAccessedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "blockOrder" INTEGER NOT NULL,
    "sheetName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Week" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Week_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "sessionOrder" INTEGER NOT NULL,
    "label" TEXT,
    "intendedWeekday" TEXT,
    "completedAt" TIMESTAMP(3),
    "sheetName" TEXT NOT NULL,
    "headerRowNumber" INTEGER NOT NULL,
    "startRowNumber" INTEGER NOT NULL,
    "endRowNumber" INTEGER NOT NULL,
    "startColumnIndex" INTEGER NOT NULL,
    "endColumnIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExercisePrescription" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "rowOrder" INTEGER NOT NULL,
    "rawExerciseName" TEXT NOT NULL,
    "movementPattern" TEXT,
    "variationName" TEXT,
    "priorityTag" TEXT,
    "sets" TEXT,
    "reps" TEXT,
    "prescribedLoad" TEXT,
    "prescribedRpe" TEXT,
    "coachNotes" TEXT,
    "sourceRowNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExercisePrescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseLog" (
    "id" TEXT NOT NULL,
    "exercisePrescriptionId" TEXT NOT NULL,
    "selectedLoad" TEXT,
    "actualReps" TEXT,
    "actualRpe" TEXT,
    "athleteNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciseLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportSource" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "sheetName" TEXT,
    "headerRowNumber" INTEGER,
    "sourceRowNumber" INTEGER,
    "startRowNumber" INTEGER,
    "endRowNumber" INTEGER,
    "startColumnIndex" INTEGER,
    "endColumnIndex" INTEGER,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Block_programId_blockOrder_idx" ON "Block"("programId", "blockOrder");

-- CreateIndex
CREATE INDEX "Week_blockId_weekNumber_idx" ON "Week"("blockId", "weekNumber");

-- CreateIndex
CREATE INDEX "Session_weekId_sessionOrder_idx" ON "Session"("weekId", "sessionOrder");

-- CreateIndex
CREATE INDEX "ExercisePrescription_sessionId_rowOrder_idx" ON "ExercisePrescription"("sessionId", "rowOrder");

-- CreateIndex
CREATE INDEX "ExerciseLog_exercisePrescriptionId_idx" ON "ExerciseLog"("exercisePrescriptionId");

-- CreateIndex
CREATE INDEX "ImportSource_programId_idx" ON "ImportSource"("programId");

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Week" ADD CONSTRAINT "Week_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExercisePrescription" ADD CONSTRAINT "ExercisePrescription_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseLog" ADD CONSTRAINT "ExerciseLog_exercisePrescriptionId_fkey" FOREIGN KEY ("exercisePrescriptionId") REFERENCES "ExercisePrescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportSource" ADD CONSTRAINT "ImportSource_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
