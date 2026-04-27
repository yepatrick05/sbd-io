import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import type { ExerciseRow, NormalisedSessionPreview, WorkbookPreview } from "@/types/workbook";

export async function POST(request: Request) {
    try {
        const requestBody = (await request.json()) as { workbookPreview?: WorkbookPreview };
        const workbookPreview = requestBody.workbookPreview;

        if (workbookPreview === undefined) {
            return NextResponse.json({ error: "Missing workbook preview." }, { status: 400 });
        }

        if (workbookPreview.programPreview === null) {
            return NextResponse.json({ error: "Program preview is missing." }, { status: 400 });
        }

        const hasBlockingErrors = workbookPreview.validationIssues.some((issue) => issue.severity === "error");

        if (hasBlockingErrors) {
            return NextResponse.json(
                { error: "Cannot save import while blocking validation errors exist." },
                { status: 400 },
            );
        }

        const savableProgramError = getSavableProgramError(workbookPreview);

        if (savableProgramError !== null) {
            return NextResponse.json({ error: savableProgramError }, { status: 400 });
        }

        const programPreview = workbookPreview.programPreview;

        const savedProgram = await prisma.$transaction(
            async (transaction) => {
                const importAccessedAt = new Date();
                const createProgramStartTime = Date.now();

                const program = await transaction.program.create({
                    data: {
                        name: programPreview.programName,
                        lastAccessedAt: importAccessedAt,
                    },
                });

                logSaveStep("Created program", createProgramStartTime);

                for (let blockIndex = 0; blockIndex < programPreview.blocks.length; blockIndex++) {
                    const blockPreview = programPreview.blocks[blockIndex];
                    const createBlockStartTime = Date.now();

                    const block = await transaction.block.create({
                        data: {
                            programId: program.id,
                            name: blockPreview.sheetName,
                            blockOrder: blockIndex + 1,
                            sheetName: blockPreview.sheetName,
                        },
                    });

                    logSaveStep(`Created block ${block.sheetName}`, createBlockStartTime);

                    const createWeeksStartTime = Date.now();
                    const weekCreateData = blockPreview.weeks.map((weekPreview) => {
                        return {
                            blockId: block.id,
                            weekNumber: weekPreview.weekNumber as number,
                        };
                    });

                    await transaction.week.createMany({
                        data: weekCreateData,
                    });

                    const savedWeeks = await transaction.week.findMany({
                        where: {
                            blockId: block.id,
                        },
                        orderBy: {
                            weekNumber: "asc",
                        },
                    });
                    const weeksByNumber = new Map(
                        savedWeeks.map((savedWeek) => {
                            return [savedWeek.weekNumber, savedWeek];
                        }),
                    );

                    logSaveStep(`Created weeks for ${block.sheetName}`, createWeeksStartTime);

                    const createSessionsStartTime = Date.now();
                    const sessionCreateData: {
                        weekId: string;
                        sessionOrder: number;
                        label: string | null;
                        intendedWeekday: string | null;
                        sheetName: string;
                        headerRowNumber: number;
                        startRowNumber: number;
                        endRowNumber: number;
                        startColumnIndex: number;
                        endColumnIndex: number;
                    }[] = [];
                    const importSourceCreateData: {
                        programId: string;
                        sourceType: string;
                        originalFileName: string;
                        sheetName: string;
                        headerRowNumber: number;
                        startRowNumber: number;
                        endRowNumber: number;
                        startColumnIndex: number;
                        endColumnIndex: number;
                    }[] = [];

                    for (const weekPreview of blockPreview.weeks) {
                        const savedWeek = weeksByNumber.get(weekPreview.weekNumber as number);

                        if (savedWeek === undefined) {
                            throw new Error(
                                `Could not find saved week ${weekPreview.weekNumber} for ${block.sheetName}.`,
                            );
                        }

                        for (const sessionPreview of weekPreview.sessions) {
                            sessionCreateData.push({
                                weekId: savedWeek.id,
                                sessionOrder: sessionPreview.sessionOrder as number,
                                label: sessionPreview.sessionLabel,
                                intendedWeekday: sessionPreview.intendedWeekday,
                                sheetName: sessionPreview.sheetName,
                                headerRowNumber: sessionPreview.headerRowNumber,
                                startRowNumber: sessionPreview.startRowNumber,
                                endRowNumber: sessionPreview.endRowNumber,
                                startColumnIndex: sessionPreview.startColumnIndex,
                                endColumnIndex: sessionPreview.endColumnIndex,
                            });

                            importSourceCreateData.push({
                                programId: program.id,
                                sourceType: "xlsx_upload",
                                originalFileName: workbookPreview.originalFileName,
                                sheetName: sessionPreview.sheetName,
                                headerRowNumber: sessionPreview.headerRowNumber,
                                startRowNumber: sessionPreview.startRowNumber,
                                endRowNumber: sessionPreview.endRowNumber,
                                startColumnIndex: sessionPreview.startColumnIndex,
                                endColumnIndex: sessionPreview.endColumnIndex,
                            });
                        }
                    }

                    await transaction.session.createMany({
                        data: sessionCreateData,
                    });

                    await transaction.importSource.createMany({
                        data: importSourceCreateData,
                    });

                    const savedWeeksWithSessions = await transaction.week.findMany({
                        where: {
                            blockId: block.id,
                        },
                        orderBy: {
                            weekNumber: "asc",
                        },
                        include: {
                            sessions: {
                                orderBy: [
                                    {
                                        sessionOrder: "asc",
                                    },
                                    {
                                        headerRowNumber: "asc",
                                    },
                                    {
                                        startRowNumber: "asc",
                                    },
                                    {
                                        startColumnIndex: "asc",
                                    },
                                ],
                            },
                        },
                    });
                    const sessionIdsByKey = new Map<string, string>();

                    for (const savedWeek of savedWeeksWithSessions) {
                        for (const savedSession of savedWeek.sessions) {
                            const savedSessionKey = getSavedSessionKey(savedWeek.weekNumber, savedSession);
                            sessionIdsByKey.set(savedSessionKey, savedSession.id);
                        }
                    }

                    logSaveStep(`Created sessions for ${block.sheetName}`, createSessionsStartTime);

                    const createExercisesStartTime = Date.now();
                    const exercisePrescriptionCreateData: {
                        sessionId: string;
                        rowOrder: number;
                        rawExerciseName: string;
                        movementPattern: null;
                        variationName: null;
                        priorityTag: null;
                        sets: string | null;
                        reps: string | null;
                        prescribedLoad: string | null;
                        prescribedRpe: string | null;
                        coachNotes: string | null;
                        sourceRowNumber: number;
                    }[] = [];

                    for (const weekPreview of blockPreview.weeks) {
                        for (const sessionPreview of weekPreview.sessions) {
                            const sessionKey = getSessionPreviewKey(weekPreview.weekNumber as number, sessionPreview);
                            const savedSessionId = sessionIdsByKey.get(sessionKey);

                            if (savedSessionId === undefined) {
                                throw new Error(
                                    `Could not find saved session ${sessionPreview.sessionOrder} in week ${weekPreview.weekNumber}.`,
                                );
                            }

                            for (
                                let exerciseIndex = 0;
                                exerciseIndex < sessionPreview.exercises.length;
                                exerciseIndex++
                            ) {
                                const exercisePreview = sessionPreview.exercises[exerciseIndex];

                                if (exercisePreview.exercise === null) {
                                    continue;
                                }

                                exercisePrescriptionCreateData.push({
                                    sessionId: savedSessionId,
                                    rowOrder: exerciseIndex + 1,
                                    rawExerciseName: exercisePreview.exercise,
                                    movementPattern: null,
                                    variationName: null,
                                    priorityTag: null,
                                    sets: exercisePreview.sets,
                                    reps: exercisePreview.reps,
                                    prescribedLoad: exercisePreview.prescribedLoad,
                                    prescribedRpe: exercisePreview.prescribedRpe,
                                    coachNotes: exercisePreview.coachNotes,
                                    sourceRowNumber: exercisePreview.sourceRowNumber,
                                });
                            }
                        }
                    }

                    await transaction.exercisePrescription.createMany({
                        data: exercisePrescriptionCreateData,
                    });

                    const savedWeeksWithExercises = await transaction.week.findMany({
                        where: {
                            blockId: block.id,
                        },
                        orderBy: {
                            weekNumber: "asc",
                        },
                        include: {
                            sessions: {
                                orderBy: [
                                    {
                                        sessionOrder: "asc",
                                    },
                                    {
                                        headerRowNumber: "asc",
                                    },
                                    {
                                        startRowNumber: "asc",
                                    },
                                    {
                                        startColumnIndex: "asc",
                                    },
                                ],
                                include: {
                                    exercises: {
                                        orderBy: [
                                            {
                                                rowOrder: "asc",
                                            },
                                            {
                                                sourceRowNumber: "asc",
                                            },
                                        ],
                                    },
                                },
                            },
                        },
                    });
                    const exerciseIdsByKey = new Map<string, string>();

                    for (const savedWeek of savedWeeksWithExercises) {
                        for (const savedSession of savedWeek.sessions) {
                            for (const savedExercise of savedSession.exercises) {
                                const savedExerciseKey = getSavedExerciseKey(
                                    savedWeek.weekNumber,
                                    savedSession,
                                    savedExercise,
                                );
                                exerciseIdsByKey.set(savedExerciseKey, savedExercise.id);
                            }
                        }
                    }

                    logSaveStep(`Created exercise prescriptions for ${block.sheetName}`, createExercisesStartTime);

                    const createLogsStartTime = Date.now();
                    const exerciseLogCreateData: {
                        exercisePrescriptionId: string;
                        selectedLoad: string | null;
                        actualReps: null;
                        actualRpe: string | null;
                        athleteNotes: string | null;
                    }[] = [];

                    for (const weekPreview of blockPreview.weeks) {
                        for (const sessionPreview of weekPreview.sessions) {
                            for (
                                let exerciseIndex = 0;
                                exerciseIndex < sessionPreview.exercises.length;
                                exerciseIndex++
                            ) {
                                const exercisePreview = sessionPreview.exercises[exerciseIndex];

                                if (exercisePreview.exercise === null) {
                                    continue;
                                }

                                if (!hasExerciseLogData(exercisePreview)) {
                                    continue;
                                }

                                const savedExerciseKey = getExercisePreviewKey(
                                    weekPreview.weekNumber as number,
                                    sessionPreview,
                                    exercisePreview,
                                    exerciseIndex + 1,
                                );
                                const savedExerciseId = exerciseIdsByKey.get(savedExerciseKey);

                                if (savedExerciseId === undefined) {
                                    throw new Error(
                                        `Could not find saved exercise ${exercisePreview.exercise} in week ${weekPreview.weekNumber}.`,
                                    );
                                }

                                exerciseLogCreateData.push({
                                    exercisePrescriptionId: savedExerciseId,
                                    selectedLoad: exercisePreview.selectedLoad,
                                    actualReps: null,
                                    actualRpe: exercisePreview.actualRpe,
                                    athleteNotes: exercisePreview.athleteNotes,
                                });
                            }
                        }
                    }

                    if (exerciseLogCreateData.length > 0) {
                        await transaction.exerciseLog.createMany({
                            data: exerciseLogCreateData,
                        });
                    }

                    logSaveStep(`Created exercise logs for ${block.sheetName}`, createLogsStartTime);
                }

                return program;
            },
            {
                maxWait: 10000,
                timeout: 30000,
            },
        );

        return NextResponse.json({ programId: savedProgram.id });
    } catch (error) {
        console.error("Failed to save imported program", error);

        return NextResponse.json({ error: getImportErrorMessage(error) }, { status: 500 });
    }
}

function getSavableProgramError(workbookPreview: WorkbookPreview): string | null {
    if (workbookPreview.programPreview === null) {
        return "Program preview is missing.";
    }

    for (const blockPreview of workbookPreview.programPreview.blocks) {
        for (const weekPreview of blockPreview.weeks) {
            if (weekPreview.weekNumber === null) {
                return "Cannot save a week without a week number.";
            }

            for (const sessionPreview of weekPreview.sessions) {
                if (sessionPreview.sessionOrder === null) {
                    return "Cannot save a session without a session order.";
                }

                for (const exercisePreview of sessionPreview.exercises) {
                    if (exercisePreview.exercise === null) {
                        return "Cannot save an exercise without a name.";
                    }
                }
            }
        }
    }

    return null;
}

function hasExerciseLogData(exercisePreview: ExerciseRow): boolean {
    if (exercisePreview.selectedLoad !== null) {
        return true;
    }

    if (exercisePreview.actualRpe !== null) {
        return true;
    }

    if (exercisePreview.athleteNotes !== null) {
        return true;
    }

    return false;
}

function getImportErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim() !== "") {
        return `Failed to save imported program: ${error.message}`;
    }

    return "Failed to save imported program.";
}

function logSaveStep(stepLabel: string, stepStartTime: number) {
    console.info(`[import] ${stepLabel} in ${Date.now() - stepStartTime}ms`);
}

function getSessionPreviewKey(weekNumber: number, sessionPreview: NormalisedSessionPreview): string {
    return [
        String(weekNumber),
        String(sessionPreview.sessionOrder),
        String(sessionPreview.headerRowNumber),
        String(sessionPreview.startRowNumber),
        String(sessionPreview.endRowNumber),
        String(sessionPreview.startColumnIndex),
        String(sessionPreview.endColumnIndex),
    ].join(":");
}

function getSavedSessionKey(
    weekNumber: number,
    savedSession: {
        sessionOrder: number;
        headerRowNumber: number;
        startRowNumber: number;
        endRowNumber: number;
        startColumnIndex: number;
        endColumnIndex: number;
    },
): string {
    return [
        String(weekNumber),
        String(savedSession.sessionOrder),
        String(savedSession.headerRowNumber),
        String(savedSession.startRowNumber),
        String(savedSession.endRowNumber),
        String(savedSession.startColumnIndex),
        String(savedSession.endColumnIndex),
    ].join(":");
}

function getExercisePreviewKey(
    weekNumber: number,
    sessionPreview: NormalisedSessionPreview,
    exercisePreview: ExerciseRow,
    rowOrder: number,
): string {
    return [
        getSessionPreviewKey(weekNumber, sessionPreview),
        String(rowOrder),
        String(exercisePreview.sourceRowNumber),
    ].join(":");
}

function getSavedExerciseKey(
    weekNumber: number,
    savedSession: {
        sessionOrder: number;
        headerRowNumber: number;
        startRowNumber: number;
        endRowNumber: number;
        startColumnIndex: number;
        endColumnIndex: number;
    },
    savedExercise: {
        rowOrder: number;
        sourceRowNumber: number;
    },
): string {
    return [
        getSavedSessionKey(weekNumber, savedSession),
        String(savedExercise.rowOrder),
        String(savedExercise.sourceRowNumber),
    ].join(":");
}
