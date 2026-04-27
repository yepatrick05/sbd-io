import Link from "next/link";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Home() {
    const currentProgram = await readCurrentProgram();

    return (
        <main className="space-y-6 p-6">
            <div className="space-y-2">
                <h1 className="text-2xl font-semibold">sbd.io</h1>
                <p className="max-w-xl text-sm text-gray-600">
                    A simple training companion that turns coach spreadsheets into a cleaner session-by-session workflow
                    for lifters.
                </p>
            </div>

            <div className="flex flex-wrap gap-3 text-sm">
                <Link href="/upload" className="rounded border border-black bg-black px-4 py-2 text-white">
                    Upload Program
                </Link>
                <Link href="/programs" className="rounded border border-gray-300 bg-white px-4 py-2 text-gray-700">
                    View All Programs
                </Link>
            </div>

            {currentProgram === null && (
                <div className="space-y-2 rounded border border-gray-200 bg-white p-4 text-sm text-gray-600">
                    <p className="font-medium text-gray-900">No saved programs yet</p>
                    <p>Upload your first spreadsheet to start turning a training block into trackable sessions.</p>
                </div>
            )}

            {currentProgram !== null && (
                <section className="space-y-4 rounded border border-gray-200 bg-white p-4">
                    <div className="space-y-1">
                        <p className="text-sm text-gray-600">Current Program</p>
                        <h2 className="text-xl font-semibold">{currentProgram.name}</h2>
                        <p className="text-sm text-gray-600">
                            Latest block: {currentProgram.latestBlockName}
                        </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
                            <p className="text-gray-600">Progress</p>
                            <p className="font-medium">
                                {currentProgram.completedSessionCount} / {currentProgram.totalSessionCount} sessions
                                completed
                            </p>
                        </div>

                        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
                            <p className="text-gray-600">Created</p>
                            <p className="font-medium">{formatDate(currentProgram.createdAt)}</p>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-3 text-sm">
                        <Link
                            href={`/programs/${currentProgram.id}/next`}
                            className="rounded border border-black bg-black px-4 py-2 text-white"
                        >
                            Continue Training
                        </Link>
                        <Link
                            href={`/programs/${currentProgram.id}`}
                            className="rounded border border-gray-300 bg-white px-4 py-2 text-gray-700"
                        >
                            View Program
                        </Link>
                    </div>
                </section>
            )}
        </main>
    );
}

async function readCurrentProgram() {
    const currentProgram = await prisma.program.findFirst({
        where: {
            lastAccessedAt: {
                not: null,
            },
        },
        orderBy: {
            lastAccessedAt: "desc",
        },
        select: {
            id: true,
            name: true,
            createdAt: true,
            blocks: {
                orderBy: {
                    blockOrder: "desc",
                },
                select: {
                    name: true,
                    weeks: {
                        orderBy: {
                            weekNumber: "asc",
                        },
                        select: {
                            sessions: {
                                orderBy: {
                                    sessionOrder: "asc",
                                },
                                select: {
                                    completedAt: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    if (currentProgram !== null) {
        return buildCurrentProgramSummary(currentProgram);
    }

    const latestProgram = await prisma.program.findFirst({
        orderBy: {
            createdAt: "desc",
        },
        select: {
            id: true,
            name: true,
            createdAt: true,
            blocks: {
                orderBy: {
                    blockOrder: "desc",
                },
                select: {
                    name: true,
                    weeks: {
                        orderBy: {
                            weekNumber: "asc",
                        },
                        select: {
                            sessions: {
                                orderBy: {
                                    sessionOrder: "asc",
                                },
                                select: {
                                    completedAt: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    if (latestProgram === null) {
        return null;
    }

    return buildCurrentProgramSummary(latestProgram);
}

function buildCurrentProgramSummary(currentProgram: {
    id: string;
    name: string;
    createdAt: Date;
    blocks: {
        name: string;
        weeks: {
            sessions: {
                completedAt: Date | null;
            }[];
        }[];
    }[];
}) {
    const latestBlock = currentProgram.blocks[0] ?? null;
    const totalSessionCount = countSessions(currentProgram.blocks);
    const completedSessionCount = countCompletedSessions(currentProgram.blocks);

    return {
        id: currentProgram.id,
        name: currentProgram.name,
        createdAt: currentProgram.createdAt,
        latestBlockName: latestBlock === null ? "Not found" : latestBlock.name,
        totalSessionCount,
        completedSessionCount,
    };
}

function countSessions(
    blocks: {
        weeks: {
            sessions: {
                completedAt: Date | null;
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

function countCompletedSessions(
    blocks: {
        weeks: {
            sessions: {
                completedAt: Date | null;
            }[];
        }[];
    }[],
): number {
    let completedSessionCount = 0;

    for (const block of blocks) {
        for (const week of block.weeks) {
            for (const session of week.sessions) {
                if (session.completedAt !== null) {
                    completedSessionCount += 1;
                }
            }
        }
    }

    return completedSessionCount;
}

function formatDate(value: Date): string {
    return new Intl.DateTimeFormat("en-AU", {
        year: "numeric",
        month: "short",
        day: "numeric",
    }).format(value);
}
