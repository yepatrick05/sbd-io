import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SessionDetailPage({
    params,
    searchParams,
}: {
    params: Promise<{ programId: string; sessionId: string }>;
    searchParams: Promise<{ saved?: string }>;
}) {
    const { programId, sessionId } = await params;
    const resolvedSearchParams = await searchParams;

    // Read the specific saved session so users can review it directly.
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

    async function saveLogs(formData: FormData) {
        "use server";

        const currentSessionId = formData.get("sessionId");
        const currentProgramId = formData.get("programId");

        if (typeof currentSessionId !== "string" || currentSessionId === "") {
            return;
        }

        if (typeof currentProgramId !== "string" || currentProgramId === "") {
            return;
        }

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

        redirect(`/programs/${currentProgramId}/sessions/${currentSessionId}?saved=logs`);
    }

    async function markSessionComplete(formData: FormData) {
        "use server";

        const currentSessionId = formData.get("sessionId");
        const currentProgramId = formData.get("programId");

        if (typeof currentSessionId !== "string" || currentSessionId === "") {
            return;
        }

        if (typeof currentProgramId !== "string" || currentProgramId === "") {
            return;
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

    return (
        <main className="space-y-6 p-6">
            <div className="space-y-2">
                <Link href={`/programs/${programId}`} className="text-sm text-gray-600 underline">
                    Back to program
                </Link>
                <h1 className="text-2xl font-semibold">{session.week.block.program.name}</h1>
                <p className="text-sm text-gray-600">Session details</p>
            </div>

            {statusMessage !== null && (
                <div className="rounded border border-green-300 bg-green-50 p-3 text-sm text-gray-700">
                    {statusMessage}
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
                        <p className="font-medium">
                            {session.completedAt === null ? "Incomplete" : "Completed"}
                        </p>
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
                        <form action={saveLogs} className="space-y-4">
                            <input type="hidden" name="programId" value={programId} />
                            <input type="hidden" name="sessionId" value={session.id} />

                            {session.exercises.map((exercise) => {
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

                            <button
                                type="submit"
                                className="rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700"
                            >
                                Save Logs
                            </button>
                        </form>
                    )}
                </div>

                {session.completedAt === null && (
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
    if (savedValue === "logs") {
        return "Exercise logs were saved.";
    }

    if (savedValue === "completed") {
        return "Session marked complete.";
    }

    if (savedValue === "reopened") {
        return "Session reopened.";
    }

    return null;
}
