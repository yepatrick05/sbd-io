import Link from "next/link";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ProgramsPage() {
    // Read saved programs from the database so users can browse imported programs.
    const programs = await prisma.program.findMany({
        orderBy: {
            createdAt: "desc",
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
                                    exercises: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    return (
        <main className="space-y-6 p-6">
            <div className="space-y-2">
                <h1 className="text-2xl font-semibold">Saved Programs</h1>
                <p className="text-sm text-gray-600">
                    Browse programs that have already been confirmed and saved.
                </p>
            </div>

            {programs.length === 0 && (
                <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-600">
                    No saved programs were found yet.
                </div>
            )}

            {programs.length > 0 && (
                <div className="grid gap-4 md:grid-cols-2">
                    {programs.map((program) => {
                        const firstBlock = program.blocks[0] ?? null;
                        const weekCount = countWeeks(program.blocks);
                        const sessionCount = countSessions(program.blocks);
                        const exerciseCount = countExercises(program.blocks);

                        return (
                            <Link
                                key={program.id}
                                href={`/programs/${program.id}`}
                                className="rounded border border-gray-200 bg-white p-4 text-sm transition hover:border-black"
                            >
                                <div className="space-y-2">
                                    <p className="text-lg font-medium">{program.name}</p>
                                    <p className="text-gray-600">
                                        Block: {firstBlock === null ? "Not found" : firstBlock.name}
                                    </p>
                                    <p className="text-gray-600">Weeks: {weekCount}</p>
                                    <p className="text-gray-600">Sessions: {sessionCount}</p>
                                    <p className="text-gray-600">Exercises: {exerciseCount}</p>
                                    <p className="text-gray-600">
                                        Created: {formatDate(program.createdAt)}
                                    </p>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </main>
    );
}

function countWeeks(
    blocks: {
        weeks: {
            sessions: {
                exercises: unknown[];
            }[];
        }[];
    }[],
): number {
    let weekCount = 0;

    for (const block of blocks) {
        weekCount += block.weeks.length;
    }

    return weekCount;
}

function countSessions(
    blocks: {
        weeks: {
            sessions: {
                exercises: unknown[];
            }[];
        }[];
    }[],
): number {
    let sessionCount = 0;

    for (const block of blocks) {
        for (const week of block.weeks) {
            sessionCount += week.sessions.length;
        }
    }

    return sessionCount;
}

function countExercises(
    blocks: {
        weeks: {
            sessions: {
                exercises: unknown[];
            }[];
        }[];
    }[],
): number {
    let exerciseCount = 0;

    for (const block of blocks) {
        for (const week of block.weeks) {
            for (const session of week.sessions) {
                exerciseCount += session.exercises.length;
            }
        }
    }

    return exerciseCount;
}

function formatDate(value: Date): string {
    return new Intl.DateTimeFormat("en-AU", {
        year: "numeric",
        month: "short",
        day: "numeric",
    }).format(value);
}
