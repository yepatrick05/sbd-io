import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { SessionLogForm, type SaveLogsState } from "./session-log-form";

export const dynamic = "force-dynamic";

export default async function SessionDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ programId: string; sessionId: string }>;
    searchParams: Promise<{ saved?: string; warning?: string; count?: string }>;
}) {
    const { programId, sessionId } = await params;
    const resolvedSearchParams = await searchParams;

    const session = await prisma.session.findFirst({
        where: {
            id: sessionId,
            week: {
                block: {
                    programId,
                },
            },
        },
        include: {
            week: {
                include: {
                    block: {
                        include: {
                            program: true,
                        },
                    },
                },
            },
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
    });

    if (session === null) {
        notFound();
    }

    const orderedSessions = await prisma.session.findMany({
        where: {
            week: {
                block: {
                    programId,
                },
            },
        },
        orderBy: [
            {
                week: {
                    block: {
                        blockOrder: "asc",
                    },
                },
            },
            {
                week: {
                    weekNumber: "asc",
                },
            },
            {
                sessionOrder: "asc",
            },
        ],
        select: {
            id: true,
        },
    });

    const sessionNavigation = getSessionNavigation(orderedSessions, session.id);

    async function saveLogs(formData: FormData): Promise<SaveLogsState> {
        "use server";

        const currentSessionId = formData.get("sessionId");
        const currentProgramId = formData.get("programId");

        if (typeof currentSessionId !== "string" || currentSessionId === "") {
            return {
                status: "error",
                message: "Session id is missing.",
            };
        }

        if (typeof currentProgramId !== "string" || currentProgramId === "") {
            return {
                status: "error",
                message: "Program id is missing.",
            };
        }

        try {
            const exercisePrescriptions = await prisma.exercisePrescription.findMany({
                where: {
                    sessionId: currentSessionId,
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
        } catch {
            return {
                status: "error",
                message: "Saving logs failed. Please try again.",
            };
        }

        return {
            status: "success",
            message: "Logs saved successfully.",
        };
    }

    async function markSessionComplete(formData: FormData) {
        "use server";

        const currentSessionId = formData.get("sessionId");
        const currentProgramId = formData.get("programId");
        const confirmMissingActualRpe = formData.get("confirmMissingActualRpe");

        if (typeof currentSessionId !== "string" || currentSessionId === "") {
            return;
        }

        if (typeof currentProgramId !== "string" || currentProgramId === "") {
            return;
        }

        const missingActualRpeCount = await countExercisesMissingActualRpe(currentSessionId);

        if (missingActualRpeCount > 0 && confirmMissingActualRpe !== "true") {
            redirect(
                `/programs/${currentProgramId}/sessions/${currentSessionId}?warning=missing-actual-rpe&count=${missingActualRpeCount}`,
            );
        }

        await prisma.session.updateMany({
            where: {
                id: currentSessionId,
                completedAt: null,
            },
            data: {
                completedAt: new Date(),
            },
        });

        redirect(`/programs/${currentProgramId}/sessions/${currentSessionId}?saved=completed`);
    }

    async function reopenSession(formData: FormData) {
        "use server";

        const currentSessionId = formData.get("sessionId");
        const currentProgramId = formData.get("programId");

        if (typeof currentSessionId !== "string" || currentSessionId === "") {
            return;
        }

        if (typeof currentProgramId !== "string" || currentProgramId === "") {
            return;
        }

        await prisma.session.update({
            where: {
                id: currentSessionId,
            },
            data: {
                completedAt: null,
            },
        });

        redirect(`/programs/${currentProgramId}/sessions/${currentSessionId}?saved=reopened`);
    }

    const statusMessage = getStatusMessage(resolvedSearchParams.saved);
    const warningMessage = getMissingActualRpeWarningMessage(resolvedSearchParams.warning, resolvedSearchParams.count);

    return (
        <main className="space-y-6 p-6">
            <div className="space-y-2">
                <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                    <Link href={`/programs/${programId}`} className="underline" data-warn-unsaved="true">
                        Back to program
                    </Link>
                    <Link href={`/programs/${programId}/next`} className="underline" data-warn-unsaved="true">
                        Continue Training
                    </Link>
                    {sessionNavigation.previousSessionId !== null ? (
                        <Link
                            href={`/programs/${programId}/sessions/${sessionNavigation.previousSessionId}`}
                            className="underline"
                            data-warn-unsaved="true"
                        >
                            Previous Session
                        </Link>
                    ) : (
                        <span className="text-gray-400">Previous Session</span>
                    )}
                    {sessionNavigation.nextSessionId !== null ? (
                        <Link
                            href={`/programs/${programId}/sessions/${sessionNavigation.nextSessionId}`}
                            className="underline"
                            data-warn-unsaved="true"
                        >
                            Next Session
                        </Link>
                    ) : (
                        <span className="text-gray-400">Next Session</span>
                    )}
                </div>
                <h1 className="text-2xl font-semibold">{session.week.block.program.name}</h1>
                <p className="text-sm text-gray-600">Session details</p>
            </div>

            {statusMessage !== null && (
                <div className="rounded border border-green-300 bg-green-50 p-3 text-sm text-gray-700">
                    {statusMessage}
                </div>
            )}

            {warningMessage !== null && session.completedAt === null && (
                <div className="space-y-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-gray-700">
                    <p>{warningMessage}</p>

                    <form action={markSessionComplete}>
                        <input type="hidden" name="programId" value={programId} />
                        <input type="hidden" name="sessionId" value={session.id} />
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

            <section className="space-y-4 rounded border border-gray-200 bg-white p-4">
                <div className="space-y-1">
                    <p className="text-sm text-gray-600">Block</p>
                    <p className="font-medium">{session.week.block.name}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
                        <p className="text-gray-600">Week</p>
                        <p className="font-medium">{session.week.weekNumber}</p>
                    </div>

                    <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
                        <p className="text-gray-600">Session Order</p>
                        <p className="font-medium">{session.sessionOrder}</p>
                    </div>

                    <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
                        <p className="text-gray-600">Label</p>
                        <p className="font-medium">{formatNullableText(session.label)}</p>
                    </div>

                    <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
                        <p className="text-gray-600">Intended Weekday</p>
                        <p className="font-medium">{formatNullableText(session.intendedWeekday)}</p>
                    </div>

                    <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
                        <p className="text-gray-600">Completion Status</p>
                        <p className="font-medium">{session.completedAt === null ? "Incomplete" : "Completed"}</p>
                    </div>

                    <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
                        <p className="text-gray-600">Exercise Count</p>
                        <p className="font-medium">{session.exercises.length}</p>
                    </div>
                </div>

                <div className="space-y-3">
                    <h2 className="text-lg font-semibold">Exercise Logs</h2>

                    {session.exercises.length === 0 && (
                        <div className="rounded border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                            No exercises were found for this session.
                        </div>
                    )}

                    {session.exercises.length > 0 && (
                        <SessionLogForm
                            exercises={session.exercises}
                            programId={programId}
                            sessionId={session.id}
                            saveLogsAction={saveLogs}
                            markSessionCompleteAction={session.completedAt === null ? markSessionComplete : undefined}
                        />
                    )}
                </div>

                {session.completedAt === null && session.exercises.length === 0 && (
                    <form action={markSessionComplete}>
                        <input type="hidden" name="programId" value={programId} />
                        <input type="hidden" name="sessionId" value={session.id} />
                        <button
                            type="submit"
                            className="rounded border border-black bg-black px-4 py-2 text-sm text-white"
                        >
                            Mark Complete
                        </button>
                    </form>
                )}

                {session.completedAt !== null && (
                    <form action={reopenSession}>
                        <input type="hidden" name="programId" value={programId} />
                        <input type="hidden" name="sessionId" value={session.id} />
                        <button
                            type="submit"
                            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700"
                        >
                            Reopen Session
                        </button>
                    </form>
                )}
            </section>
        </main>
    );
}

function getSessionNavigation(
    orderedSessions: { id: string }[],
    currentSessionId: string,
): {
    previousSessionId: string | null;
    nextSessionId: string | null;
} {
    const currentSessionIndex = orderedSessions.findIndex((orderedSession) => {
        return orderedSession.id === currentSessionId;
    });

    if (currentSessionIndex === -1) {
        return {
            previousSessionId: null,
            nextSessionId: null,
        };
    }

    const previousSession = orderedSessions[currentSessionIndex - 1];
    const nextSession = orderedSessions[currentSessionIndex + 1];

    return {
        previousSessionId: previousSession?.id ?? null,
        nextSessionId: nextSession?.id ?? null,
    };
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

function getStatusMessage(savedValue: string | undefined): string | null {
    if (savedValue === "completed") {
        return "Session marked complete.";
    }

    if (savedValue === "reopened") {
        return "Session reopened.";
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
