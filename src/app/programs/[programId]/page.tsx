import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
        <main className="space-y-8 px-4 py-6 sm:px-6 sm:py-8">
            <div className="space-y-3">
                <Link href="/programs" className="text-sm text-muted-foreground underline">
                    Back to saved programs
                </Link>
                <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">{program.name}</h1>
                <p className="text-sm text-muted-foreground">Created: {formatDate(program.createdAt)}</p>
                <Link href={`/programs/${program.id}/next`} className="text-sm text-muted-foreground underline">
                    Continue Training
                </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <Card className="p-4 text-sm">
                    <p className="text-muted-foreground">Session Progress</p>
                    <p className="font-medium text-foreground">
                        {completedSessionCount} / {totalSessionCount} completed
                    </p>
                </Card>

                <Card className="p-4 text-sm">
                    <p className="text-muted-foreground">Completion</p>
                    <p className="font-medium text-foreground">{completionPercentage}% complete</p>
                </Card>
            </div>

            {program.blocks.length === 0 && (
                <Card className="p-4 text-sm text-muted-foreground">
                    No saved blocks were found for this program.
                </Card>
            )}

            {program.blocks.map((block) => (
                <Card key={block.id} className="space-y-4 p-4">
                    <div className="space-y-1">
                        <h2 className="text-lg font-semibold text-foreground">{block.name}</h2>
                        <p className="text-sm text-muted-foreground">Sheet: {block.sheetName}</p>
                    </div>

                    {block.weeks.length === 0 && (
                        <p className="text-sm text-muted-foreground">No saved weeks were found for this block.</p>
                    )}

                    {block.weeks.map((week) => {
                        const completedWeekSessionCount = countCompletedSessionsForWeek(week.sessions);

                        return (
                            <details
                                key={week.id}
                                className="rounded-lg border border-border bg-surface"
                            >
                                <summary className="cursor-pointer list-none px-4 py-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="space-y-1">
                                            <p className="font-medium text-foreground">Week {week.weekNumber}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {week.sessions.length} sessions
                                            </p>
                                        </div>

                                        <Badge variant="neutral">
                                            {completedWeekSessionCount} / {week.sessions.length} completed
                                        </Badge>
                                    </div>
                                </summary>

                                <div className="space-y-3 border-t border-border px-4 py-4">
                                    {week.sessions.map((session) => {
                                        const sessionStatusLabel = getSessionStatusLabel(
                                            session.completedAt,
                                            currentSessionId,
                                            session.id,
                                        );

                                        return (
                                            <details
                                                key={session.id}
                                                className="rounded-lg border border-border bg-surface-muted"
                                            >
                                                <summary className="cursor-pointer list-none px-4 py-4">
                                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                                        <div className="space-y-1">
                                                            <p className="font-medium text-foreground">
                                                                Session {session.sessionOrder}
                                                            </p>
                                                            <p className="text-sm text-muted-foreground">
                                                                {session.label ?? "Not found"}
                                                            </p>
                                                        </div>

                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <Badge variant={getSessionStatusBadgeVariant(sessionStatusLabel)}>
                                                                {sessionStatusLabel}
                                                            </Badge>
                                                            <Badge variant="neutral">
                                                                {session.exercises.length} exercises
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                </summary>

                                                <div className="space-y-3 border-t border-border bg-surface px-4 py-4 text-sm">
                                                    <Link
                                                        href={`/programs/${program.id}/sessions/${session.id}`}
                                                        className="inline-block text-muted-foreground underline"
                                                    >
                                                        View session details
                                                    </Link>

                                                    {session.exercises.length > 0 && (
                                                        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
                                                            <table className="min-w-full border-collapse text-sm">
                                                                <thead className="bg-surface-muted">
                                                                    <tr className="border-b border-border">
                                                                        <th className="px-3 py-2 text-left font-medium">
                                                                            Exercise
                                                                        </th>
                                                                        <th className="px-3 py-2 text-left font-medium">
                                                                            Sets
                                                                        </th>
                                                                        <th className="px-3 py-2 text-left font-medium">
                                                                            Reps
                                                                        </th>
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
                                                                        <tr key={exercise.id} className="border-b border-border">
                                                                            <td className="px-3 py-2 align-top text-foreground">
                                                                                {exercise.rawExerciseName}
                                                                            </td>
                                                                            <td className="px-3 py-2 align-top text-muted-foreground">
                                                                                {formatNullableText(exercise.sets)}
                                                                            </td>
                                                                            <td className="px-3 py-2 align-top text-muted-foreground">
                                                                                {formatNullableText(exercise.reps)}
                                                                            </td>
                                                                            <td className="px-3 py-2 align-top text-muted-foreground">
                                                                                {formatNullableText(exercise.prescribedLoad)}
                                                                            </td>
                                                                            <td className="px-3 py-2 align-top text-muted-foreground">
                                                                                {formatNullableText(exercise.prescribedRpe)}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>
                                            </details>
                                        );
                                    })}
                                </div>
                            </details>
                        );
                    })}
                </Card>
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

function getSessionStatusBadgeVariant(status: "Completed" | "Current" | "Upcoming"): "completed" | "current" | "upcoming" {
    if (status === "Completed") {
        return "completed";
    }

    if (status === "Current") {
        return "current";
    }

    return "upcoming";
}

function countCompletedSessionsForWeek(
    sessions: {
        completedAt: Date | null;
    }[],
): number {
    let completedSessionCount = 0;

    for (const session of sessions) {
        if (session.completedAt !== null) {
            completedSessionCount += 1;
        }
    }

    return completedSessionCount;
}
