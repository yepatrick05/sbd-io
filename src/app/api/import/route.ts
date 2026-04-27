import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import type { ExerciseRow, WorkbookPreview } from "@/types/workbook";

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

        const savedProgram = await prisma.$transaction(async (transaction) => {
            const importAccessedAt = new Date();

            const program = await transaction.program.create({
                data: {
                    name: programPreview.programName,
                    lastAccessedAt: importAccessedAt,
                },
            });

            for (let blockIndex = 0; blockIndex < programPreview.blocks.length; blockIndex++) {
                const blockPreview = programPreview.blocks[blockIndex];

                const block = await transaction.block.create({
                    data: {
                        programId: program.id,
                        name: blockPreview.blockName,
                        blockOrder: blockIndex + 1,
                        sheetName: blockPreview.sheetName,
                    },
                });

                for (const weekPreview of blockPreview.weeks) {
                    const week = await transaction.week.create({
                        data: {
                            blockId: block.id,
                            weekNumber: weekPreview.weekNumber as number,
                        },
                    });

                    for (const sessionPreview of weekPreview.sessions) {
                        const session = await transaction.session.create({
                            data: {
                                weekId: week.id,
                                sessionOrder: sessionPreview.sessionOrder as number,
                                label: sessionPreview.sessionLabel,
                                intendedWeekday: sessionPreview.intendedWeekday,
                                sheetName: sessionPreview.sheetName,
                                headerRowNumber: sessionPreview.headerRowNumber,
                                startRowNumber: sessionPreview.startRowNumber,
                                endRowNumber: sessionPreview.endRowNumber,
                                startColumnIndex: sessionPreview.startColumnIndex,
                                endColumnIndex: sessionPreview.endColumnIndex,
                            },
                        });

                        await transaction.importSource.create({
                            data: {
                                programId: program.id,
                                sourceType: "xlsx_upload",
                                originalFileName: workbookPreview.originalFileName,
                                sheetName: sessionPreview.sheetName,
                                headerRowNumber: sessionPreview.headerRowNumber,
                                startRowNumber: sessionPreview.startRowNumber,
                                endRowNumber: sessionPreview.endRowNumber,
                                startColumnIndex: sessionPreview.startColumnIndex,
                                endColumnIndex: sessionPreview.endColumnIndex,
                            },
                        });

                        for (let exerciseIndex = 0; exerciseIndex < sessionPreview.exercises.length; exerciseIndex++) {
                            const exercisePreview = sessionPreview.exercises[exerciseIndex];

                            if (exercisePreview.exercise === null) {
                                continue;
                            }

                            const exercisePrescription = await transaction.exercisePrescription.create({
                                data: {
                                    sessionId: session.id,
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
                                },
                            });

                            if (hasExerciseLogData(exercisePreview)) {
                                await transaction.exerciseLog.create({
                                    data: {
                                        exercisePrescriptionId: exercisePrescription.id,
                                        selectedLoad: exercisePreview.selectedLoad,
                                        actualReps: null,
                                        actualRpe: exercisePreview.actualRpe,
                                        athleteNotes: exercisePreview.athleteNotes,
                                    },
                                });
                            }
                        }
                    }
                }
            }

            return program;
        });

        return NextResponse.json({ programId: savedProgram.id });
    } catch (error) {
        console.error("Failed to save imported program", error);

        return NextResponse.json({ error: "Failed to save imported program." }, { status: 500 });
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
