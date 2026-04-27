import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ProgramDetailPage({ params }: { params: Promise<{ programId: string }> }) {
    const { programId } = await params;

    const existingProgram = await prisma.program.findUnique({
        where: {
            id: programId,
        },
        select: {
            id: true,
        },
    });

    if (existingProgram === null) {
        notFound();
    }

    const program = await prisma.program.update({
        where: {
            id: programId,
        },
        data: {
            lastAccessedAt: new Date(),
        },
        select: {
            id: true,
            name: true,
            createdAt: true,
            blocks: {
                orderBy: {
                    blockOrder: "asc",
                },
                select: {
                    id: true,
                    name: true,
                    sheetName: true,
                    weeks: {
                        orderBy: {
                            weekNumber: "asc",
                        },
                        select: {
                            id: true,
                            weekNumber: true,
                            sessions: {
                                orderBy: {
                                    sessionOrder: "asc",
                                },
                                select: {
                                    id: true,
                                    sessionOrder: true,
                                    label: true,
                                    intendedWeekday: true,
                                    completedAt: true,
                                    exercises: {
                                        orderBy: {
                                            rowOrder: "asc",
                                        },
                                        select: {
                                            id: true,
                                            rawExerciseName: true,
                                            sets: true,
                                            reps: true,
                                            prescribedLoad: true,
                                            prescribedRpe: true,
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

    const orderedSessions = getOrderedSessions(program.blocks);
    const currentSessionId = getCurrentSessionId(orderedSessions);
    const completedSessionCount = orderedSessions.filter((session) => {
        return session.completedAt !== null;
    }).length;
    const totalSessionCount = orderedSessions.length;
    const completionPercentage = getCompletionPercentage(completedSessionCount, totalSessionCount);

    return (
        <main className="space-y-6 p-6">
            <div className="space-y-2">
                <Link href="/programs" className="text-sm text-gray-600 underline">
                    Back to saved programs
                </Link>
                <h1 className="text-2xl font-semibold">{program.name}</h1>
                <p className="text-sm text-gray-600">Created: {formatDate(program.createdAt)}</p>
                <Link href={`/programs/${program.id}/next`} className="text-sm text-gray-600 underline">
                    Continue Training
                </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded border border-gray-200 bg-white p-4 text-sm">
                    <p className="text-gray-600">Session Progress</p>
                    <p className="font-medium">
                        {completedSessionCount} / {totalSessionCount} completed
                    </p>
                </div>

                <div className="rounded border border-gray-200 bg-white p-4 text-sm">
                    <p className="text-gray-600">Completion</p>
                    <p className="font-medium">{completionPercentage}% complete</p>
                </div>
            </div>

            {program.blocks.length === 0 && (
                <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-600">
                    No saved blocks were found for this program.
                </div>
            )}

            {program.blocks.map((block) => (
                <section key={block.id} className="space-y-4 rounded border border-gray-200 bg-white p-4">
                    <div className="space-y-1">
                        <h2 className="text-lg font-semibold">{block.name}</h2>
                        <p className="text-sm text-gray-600">Sheet: {block.sheetName}</p>
                    </div>

                    {block.weeks.length === 0 && (
                        <p className="text-sm text-gray-600">No saved weeks were found for this block.</p>
                    )}

                    {block.weeks.map((week) => (
                        <div key={week.id} className="space-y-3 rounded border border-gray-200 bg-gray-50 p-4">
                            <div className="space-y-1">
                                <h3 className="font-medium">Week {week.weekNumber}</h3>
                                <p className="text-sm text-gray-600">Sessions: {week.sessions.length}</p>
                            </div>

                            <div className="space-y-2">
                                {week.sessions.map((session) => (
                                    <div
                                        key={session.id}
                                        className="rounded border border-gray-200 bg-white p-4 text-sm"
                                    >
                                        <div className="space-y-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="font-medium">Session {session.sessionOrder}</p>
                                                <span
                                                    className={getSessionStatusBadgeClassName(
                                                        getSessionStatusLabel(
                                                            session.completedAt,
                                                            currentSessionId,
                                                            session.id,
                                                        ),
                                                    )}
                                                >
                                                    {getSessionStatusLabel(
                                                        session.completedAt,
                                                        currentSessionId,
                                                        session.id,
                                                    )}
                                                </span>
                                            </div>
                                            <p className="text-gray-600">Label: {session.label ?? "Not found"}</p>
                                            <p className="text-gray-600">
                                                Intended weekday: {session.intendedWeekday ?? "Not found"}
                                            </p>
                                            <p className="text-gray-600">Exercise count: {session.exercises.length}</p>
                                            <Link
                                                href={`/programs/${program.id}/sessions/${session.id}`}
                                                className="inline-block text-gray-600 underline"
                                            >
                                                View session details
                                            </Link>
                                        </div>

                                        {session.exercises.length > 0 && (
                                            <div className="mt-3 rounded border border-gray-200">
                                                <table className="min-w-full border-collapse text-sm">
                                                    <thead className="bg-gray-50">
                                                        <tr className="border-b border-gray-200">
                                                            <th className="px-3 py-2 text-left font-medium">
                                                                Exercise
                                                            </th>
                                                            <th className="px-3 py-2 text-left font-medium">Sets</th>
                                                            <th className="px-3 py-2 text-left font-medium">Reps</th>
                                                            <th className="px-3 py-2 text-left font-medium">
                                                                Prescribed Load
                                                            </th>
                                                            <th className="px-3 py-2 text-left font-medium">
                                                                Prescribed RPE
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {session.exercises.map((exercise) => (
                                                            <tr key={exercise.id} className="border-b border-gray-200">
                                                                <td className="px-3 py-2 align-top">
                                                                    {exercise.rawExerciseName}
                                                                </td>
                                                                <td className="px-3 py-2 align-top">
                                                                    {formatNullableText(exercise.sets)}
                                                                </td>
                                                                <td className="px-3 py-2 align-top">
                                                                    {formatNullableText(exercise.reps)}
                                                                </td>
                                                                <td className="px-3 py-2 align-top">
                                                                    {formatNullableText(exercise.prescribedLoad)}
                                                                </td>
                                                                <td className="px-3 py-2 align-top">
                                                                    {formatNullableText(exercise.prescribedRpe)}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </section>
            ))}
        </main>
    );
}

function formatDate(value: Date): string {
    return new Intl.DateTimeFormat("en-AU", {
        year: "numeric",
        month: "short",
        day: "numeric",
    }).format(value);
}

function formatNullableText(value: string | null): string {
    if (value === null) {
        return "-";
    }

    return value;
}

function getOrderedSessions(
    blocks: {
        weeks: {
            sessions: {
                id: string;
                completedAt: Date | null;
            }[];
        }[];
    }[],
): { id: string; completedAt: Date | null }[] {
    const orderedSessions: { id: string; completedAt: Date | null }[] = [];

    for (const block of blocks) {
        for (const week of block.weeks) {
            for (const session of week.sessions) {
                orderedSessions.push({
                    id: session.id,
                    completedAt: session.completedAt,
                });
            }
        }
    }

    return orderedSessions;
}

function getCurrentSessionId(
    orderedSessions: {
        id: string;
        completedAt: Date | null;
    }[],
): string | null {
    for (const session of orderedSessions) {
        if (session.completedAt === null) {
            return session.id;
        }
    }

    return null;
}

function getCompletionPercentage(completedSessionCount: number, totalSessionCount: number): number {
    if (totalSessionCount === 0) {
        return 0;
    }

    return Math.round((completedSessionCount / totalSessionCount) * 100);
}

function getSessionStatusLabel(
    completedAt: Date | null,
    currentSessionId: string | null,
    sessionId: string,
): "Completed" | "Current" | "Upcoming" {
    if (completedAt !== null) {
        return "Completed";
    }

    if (currentSessionId === sessionId) {
        return "Current";
    }

    return "Upcoming";
}

function getSessionStatusBadgeClassName(status: "Completed" | "Current" | "Upcoming"): string {
    if (status === "Completed") {
        return "rounded border border-green-300 bg-green-50 px-2 py-0.5 text-xs text-green-700";
    }

    if (status === "Current") {
        return "rounded border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs text-blue-700";
    }

    return "rounded border border-gray-300 bg-gray-50 px-2 py-0.5 text-xs text-gray-700";
}
