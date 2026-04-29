import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getButtonClassName } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Home() {
    const currentProgram = await readCurrentProgram();

    return (
        <main className="space-y-8 px-4 py-6 sm:px-6 sm:py-8">
            <div className="space-y-3">
                <Badge variant="neutral">Spreadsheet-first powerlifting log</Badge>
                <h1 className="max-w-2xl text-3xl font-semibold tracking-[-0.03em] text-foreground">
                    Calm training workflow for coach-built programs.
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    A simple training companion that turns coach spreadsheets into a cleaner session-by-session workflow
                    for lifters.
                </p>
            </div>

            <div className="flex flex-wrap gap-3 text-sm">
                <Link href="/upload" className={getButtonClassName({ variant: "primary" })}>
                    Upload Program
                </Link>
                <Link href="/programs" className={getButtonClassName({ variant: "secondary" })}>
                    View All Programs
                </Link>
            </div>

            {currentProgram === null && (
                <Card className="space-y-2 p-5 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">No saved programs yet</p>
                    <p>Upload your first spreadsheet to start turning a training block into trackable sessions.</p>
                </Card>
            )}

            {currentProgram !== null && (
                <Card className="space-y-5 p-5">
                    <div className="space-y-1">
                        <Badge variant="current">Current Program</Badge>
                        <h2 className="pt-2 text-2xl font-semibold tracking-[-0.03em] text-foreground">
                            {currentProgram.name}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            Latest block: {currentProgram.latestBlockName}
                        </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <Card variant="muted" className="p-4 text-sm">
                            <p className="text-muted-foreground">Progress</p>
                            <p className="font-medium text-foreground">
                                {currentProgram.completedSessionCount} / {currentProgram.totalSessionCount} sessions
                                completed
                            </p>
                        </Card>

                        <Card variant="muted" className="p-4 text-sm">
                            <p className="text-muted-foreground">Created</p>
                            <p className="font-medium text-foreground">{formatDate(currentProgram.createdAt)}</p>
                        </Card>
                    </div>

                    <div className="flex flex-wrap gap-3 text-sm">
                        <Link href={`/programs/${currentProgram.id}/next`} className={getButtonClassName({ variant: "primary" })}>
                            Continue Training
                        </Link>
                        <Link href={`/programs/${currentProgram.id}`} className={getButtonClassName({ variant: "secondary" })}>
                            View Program
                        </Link>
                    </div>
                </Card>
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
