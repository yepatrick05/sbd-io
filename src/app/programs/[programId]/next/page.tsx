import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NextSessionPage({
    params,
}: {
    params: Promise<{ programId: string }>;
}) {
    const { programId } = await params;

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

    return (
        <main className="space-y-6 p-6">
            <div className="space-y-2">
                <Link href={`/programs/${program.id}`} className="text-sm text-gray-600 underline">
                    Back to program
                </Link>
                <h1 className="text-2xl font-semibold">Next Session</h1>
                <p className="text-sm text-gray-600">{program.name}</p>
            </div>

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
                            <p className="font-medium">
                                {formatNullableText(nextSession.session.intendedWeekday)}
                            </p>
                        </div>
                    </div>

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
