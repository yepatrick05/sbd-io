import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NextSessionPage({
    params,
    searchParams,
}: {
    params: Promise<{ programId: string }>;
    searchParams: Promise<{ saved?: string; warning?: string; count?: string }>;
}) {
    const { programId } = await params;
    const resolvedSearchParams = await searchParams;

    // Read the saved program and its sessions so we can find the next uncompleted session.
    const program = await prisma.program.findUnique({
        where: {
            id: programId,
        },
        include: {
            blocks: {
                orderBy: {
                    blockOrder: "asc",
                },
                include: {
                    weeks: {
                        orderBy: {
                            weekNumber: "asc",
                        },
                        include: {
                            sessions: {
                                orderBy: {
                                    sessionOrder: "asc",
                                },
                                include: {
                                    exercises: {
                                        orderBy: {
                                            rowOrder: "asc",
                                        },
                                        include: {
                                            logs: {
                                                orderBy: {
                                                    createdAt: "asc",
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    if (program === null) {
        notFound();
    }

    const nextSession = findNextSession(program.blocks);

    async function markSessionComplete(formData: FormData) {
        "use server";

        const sessionId = formData.get("sessionId");
        const currentProgramId = formData.get("programId");
        const confirmMissingActualRpe = formData.get("confirmMissingActualRpe");

        if (typeof sessionId !== "string" || sessionId === "") {
            return;
        }

        if (typeof currentProgramId !== "string" || currentProgramId === "") {
            return;
        }

        const missingActualRpeCount = await countExercisesMissingActualRpe(sessionId);

        if (missingActualRpeCount > 0 && confirmMissingActualRpe !== "true") {
            redirect(
                `/programs/${currentProgramId}/next?warning=missing-actual-rpe&count=${missingActualRpeCount}`,
            );
        }

        await prisma.session.updateMany({
            where: {
                id: sessionId,
                completedAt: null,
            },
            data: {
                completedAt: new Date(),
            },
        });

        redirect(`/programs/${currentProgramId}/next`);
    }

    async function saveLogs(formData: FormData) {
        "use server";

        const sessionId = formData.get("sessionId");
        const currentProgramId = formData.get("programId");

        if (typeof sessionId !== "string" || sessionId === "") {
            return;
        }

        if (typeof currentProgramId !== "string" || currentProgramId === "") {
            return;
        }

        const exercisePrescriptions = await prisma.exercisePrescription.findMany({
            where: {
                sessionId,
            },
            include: {
                logs: {
                    orderBy: {
                        createdAt: "asc",
                    },
                },
            },
        });

        await prisma.$transaction(async (transaction) => {
            for (const exercisePrescription of exercisePrescriptions) {
                const selectedLoad = getOptionalFormValue(formData.get(`selectedLoad-${exercisePrescription.id}`));
                const actualRpe = getOptionalFormValue(formData.get(`actualRpe-${exercisePrescription.id}`));
                const athleteNotes = getOptionalFormValue(formData.get(`athleteNotes-${exercisePrescription.id}`));
                const existingLog = exercisePrescription.logs[0] ?? null;

                if (existingLog === null) {
                    if (selectedLoad === null && actualRpe === null && athleteNotes === null) {
                        continue;
                    }

                    await transaction.exerciseLog.create({
                        data: {
                            exercisePrescriptionId: exercisePrescription.id,
                            selectedLoad,
                            actualReps: null,
                            actualRpe,
                            athleteNotes,
                        },
                    });

                    continue;
                }

                await transaction.exerciseLog.update({
                    where: {
                        id: existingLog.id,
                    },
                    data: {
                        selectedLoad,
                        actualRpe,
                        athleteNotes,
                    },
                });
            }
        });

        redirect(`/programs/${currentProgramId}/next?saved=logs`);
    }

    const saveMessage = getSaveMessage(resolvedSearchParams.saved);
    const warningMessage = getMissingActualRpeWarningMessage(
        resolvedSearchParams.warning,
        resolvedSearchParams.count,
    );

    return (
        <main className="space-y-6 p-6">
            <div className="space-y-2">
                <Link href={`/programs/${program.id}`} className="text-sm text-gray-600 underline">
                    Back to program
                </Link>
                <h1 className="text-2xl font-semibold">Next Session</h1>
                <p className="text-sm text-gray-600">{program.name}</p>
            </div>

            {saveMessage !== null && (
                <div className="rounded border border-green-300 bg-green-50 p-3 text-sm text-gray-700">
                    {saveMessage}
                </div>
            )}

            {warningMessage !== null && nextSession !== null && (
                <div className="space-y-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-gray-700">
                    <p>{warningMessage}</p>

                    <form action={markSessionComplete}>
                        <input type="hidden" name="programId" value={program.id} />
                        <input type="hidden" name="sessionId" value={nextSession.session.id} />
                        <input type="hidden" name="confirmMissingActualRpe" value="true" />
                        <button
                            type="submit"
                            className="rounded border border-amber-400 bg-white px-4 py-2 text-sm text-gray-700"
                        >
                            Complete Anyway
                        </button>
                    </form>
                </div>
            )}

            {nextSession === null && (
                <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-600">
                    All sessions in this program are completed. There is no next session to show right now.
                </div>
            )}

            {nextSession !== null && (
                <section className="space-y-4 rounded border border-gray-200 bg-white p-4">
                    <div className="space-y-1">
                        <p className="text-sm text-gray-600">Block</p>
                        <p className="font-medium">{nextSession.blockName}</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
                            <p className="text-gray-600">Week</p>
                            <p className="font-medium">{nextSession.weekNumber}</p>
                        </div>

                        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
                            <p className="text-gray-600">Session Order</p>
                            <p className="font-medium">{nextSession.session.sessionOrder}</p>
                        </div>

                        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
                            <p className="text-gray-600">Label</p>
                            <p className="font-medium">{formatNullableText(nextSession.session.label)}</p>
                        </div>

                        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
                            <p className="text-gray-600">Intended Weekday</p>
                            <p className="font-medium">{formatNullableText(nextSession.session.intendedWeekday)}</p>
                        </div>
                    </div>

                    <form action={saveLogs} className="space-y-4">
                        <input type="hidden" name="programId" value={program.id} />
                        <input type="hidden" name="sessionId" value={nextSession.session.id} />

                        <div className="space-y-3">
                            <h2 className="text-lg font-semibold">Exercise Logs</h2>

                            {nextSession.session.exercises.map((exercise) => {
                                const currentLog = exercise.logs[0] ?? null;

                                return (
                                    <div
                                        key={exercise.id}
                                        className="space-y-3 rounded border border-gray-200 bg-gray-50 p-4 text-sm"
                                    >
                                        <div className="space-y-1">
                                            <p className="font-medium">{exercise.rawExerciseName}</p>
                                        </div>

                                        <div className="grid gap-2 sm:grid-cols-2">
                                            <div>
                                                <p className="text-gray-600">Sets</p>
                                                <p>{formatNullableText(exercise.sets)}</p>
                                            </div>

                                            <div>
                                                <p className="text-gray-600">Reps</p>
                                                <p>{formatNullableText(exercise.reps)}</p>
                                            </div>

                                            <div>
                                                <p className="text-gray-600">Prescribed Load</p>
                                                <p>{formatNullableText(exercise.prescribedLoad)}</p>
                                            </div>

                                            <div>
                                                <p className="text-gray-600">Prescribed RPE</p>
                                                <p>{formatNullableText(exercise.prescribedRpe)}</p>
                                            </div>
                                        </div>

                                        {exercise.coachNotes !== null && (
                                            <div className="rounded border border-gray-200 bg-white p-3 text-sm text-gray-700">
                                                <p className="text-gray-600">Coach Notes</p>
                                                <p>{exercise.coachNotes}</p>
                                            </div>
                                        )}

                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <label className="space-y-1">
                                                <span className="text-gray-600">Selected Load</span>
                                                <input
                                                    type="text"
                                                    name={`selectedLoad-${exercise.id}`}
                                                    defaultValue={currentLog?.selectedLoad ?? ""}
                                                    className="w-full rounded border border-gray-300 bg-white px-3 py-2"
                                                />
                                            </label>

                                            <label className="space-y-1">
                                                <span className="text-gray-600">Actual RPE</span>
                                                <input
                                                    type="text"
                                                    name={`actualRpe-${exercise.id}`}
                                                    defaultValue={currentLog?.actualRpe ?? ""}
                                                    className="w-full rounded border border-gray-300 bg-white px-3 py-2"
                                                />
                                            </label>
                                        </div>

                                        <label className="space-y-1">
                                            <span className="text-gray-600">Athlete Notes</span>
                                            <textarea
                                                name={`athleteNotes-${exercise.id}`}
                                                defaultValue={currentLog?.athleteNotes ?? ""}
                                                rows={3}
                                                className="w-full rounded border border-gray-300 bg-white px-3 py-2"
                                            />
                                        </label>
                                    </div>
                                );
                            })}
                        </div>

                        <button
                            type="submit"
                            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700"
                        >
                            Save Logs
                        </button>
                    </form>

                    <div className="space-y-3">
                        <h2 className="text-lg font-semibold">Exercises</h2>

                        {nextSession.session.exercises.map((exercise) => (
                            <div
                                key={exercise.id}
                                className="space-y-2 rounded border border-gray-200 bg-gray-50 p-4 text-sm"
                            >
                                <div className="space-y-1">
                                    <p className="font-medium">{exercise.rawExerciseName}</p>
                                </div>

                                <div className="grid gap-2 sm:grid-cols-2">
                                    <div>
                                        <p className="text-gray-600">Sets</p>
                                        <p>{formatNullableText(exercise.sets)}</p>
                                    </div>

                                    <div>
                                        <p className="text-gray-600">Reps</p>
                                        <p>{formatNullableText(exercise.reps)}</p>
                                    </div>

                                    <div>
                                        <p className="text-gray-600">Prescribed Load</p>
                                        <p>{formatNullableText(exercise.prescribedLoad)}</p>
                                    </div>

                                    <div>
                                        <p className="text-gray-600">Prescribed RPE</p>
                                        <p>{formatNullableText(exercise.prescribedRpe)}</p>
                                    </div>
                                </div>

                                {exercise.coachNotes !== null && (
                                    <div className="rounded border border-gray-200 bg-white p-3 text-sm text-gray-700">
                                        <p className="text-gray-600">Coach Notes</p>
                                        <p>{exercise.coachNotes}</p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <form action={markSessionComplete}>
                        <input type="hidden" name="programId" value={program.id} />
                        <input type="hidden" name="sessionId" value={nextSession.session.id} />
                        <button
                            type="submit"
                            className="rounded border border-black bg-black px-4 py-2 text-sm text-white"
                        >
                            Mark Session Complete
                        </button>
                    </form>
                </section>
            )}
        </main>
    );
}

function findNextSession(
    blocks: {
        name: string;
        weeks: {
            weekNumber: number;
            sessions: {
                id: string;
                sessionOrder: number;
                label: string | null;
                intendedWeekday: string | null;
                completedAt: Date | null;
                exercises: {
                    id: string;
                    rawExerciseName: string;
                    sets: string | null;
                    reps: string | null;
                    prescribedLoad: string | null;
                    prescribedRpe: string | null;
                    coachNotes: string | null;
                    logs: {
                        id: string;
                        selectedLoad: string | null;
                        actualRpe: string | null;
                        athleteNotes: string | null;
                    }[];
                }[];
            }[];
        }[];
    }[],
) {
    for (const block of blocks) {
        for (const week of block.weeks) {
            for (const session of week.sessions) {
                if (session.completedAt === null) {
                    return {
                        blockName: block.name,
                        weekNumber: week.weekNumber,
                        session,
                    };
                }
            }
        }
    }

    return null;
}

function formatNullableText(value: string | null): string {
    if (value === null) {
        return "Not found";
    }

    return value;
}

function getOptionalFormValue(value: FormDataEntryValue | null): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const trimmedValue = value.trim();

    if (trimmedValue === "") {
        return null;
    }

    return trimmedValue;
}

function getSaveMessage(savedValue: string | undefined): string | null {
    if (savedValue === "logs") {
        return "Exercise logs were saved.";
    }

    return null;
}

async function countExercisesMissingActualRpe(sessionId: string): Promise<number> {
    const exercisePrescriptions = await prisma.exercisePrescription.findMany({
        where: {
            sessionId,
        },
        include: {
            logs: {
                orderBy: {
                    createdAt: "asc",
                },
            },
        },
    });

    let missingActualRpeCount = 0;

    for (const exercisePrescription of exercisePrescriptions) {
        const existingLog = exercisePrescription.logs[0] ?? null;

        if (existingLog === null || existingLog.actualRpe === null || existingLog.actualRpe.trim() === "") {
            missingActualRpeCount += 1;
        }
    }

    return missingActualRpeCount;
}

function getMissingActualRpeWarningMessage(
    warningValue: string | undefined,
    countValue: string | undefined,
): string | null {
    if (warningValue !== "missing-actual-rpe") {
        return null;
    }

    const missingActualRpeCount = Number(countValue);

    if (!Number.isFinite(missingActualRpeCount) || missingActualRpeCount <= 0) {
        return "Some exercises are missing actual RPE. You can still complete this session if you want to.";
    }

    if (missingActualRpeCount === 1) {
        return "1 exercise is missing actual RPE. You can still complete this session if you want to.";
    }

    return `${missingActualRpeCount} exercises are missing actual RPE. You can still complete this session if you want to.`;
}
