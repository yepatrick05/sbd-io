import Link from "next/link";
import { revalidatePath } from "next/cache";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getButtonClassName } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { DeleteProgramButton } from "./delete-program-button";

export const dynamic = "force-dynamic";

export default async function ProgramsPage() {
    async function deleteProgram(formData: FormData): Promise<{ error: string | null }> {
        "use server";

        const programId = formData.get("programId");

        if (typeof programId !== "string" || programId === "") {
            return {
                error: "Program id is missing.",
            };
        }

        try {
            await prisma.program.delete({
                where: {
                    id: programId,
                },
            });
        } catch {
            return {
                error: "Deleting the program failed. Please try again.",
            };
        }

        revalidatePath("/programs");
        revalidatePath("/");

        return {
            error: null,
        };
    }

    const programs = await prisma.program.findMany({
        orderBy: {
            createdAt: "desc",
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
                                    _count: {
                                        select: {
                                            exercises: true,
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

    const currentProgram = await readCurrentProgramSummary();
    const currentProgramId = currentProgram?.id ?? null;

    return (
        <main className="space-y-8 px-4 py-6 sm:px-6 sm:py-8">
            <div className="space-y-3">
                <Link href="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
                    Back to Dashboard
                </Link>
                <h1 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">Saved Programs</h1>
                <p className="text-sm leading-6 text-muted-foreground">
                    Browse programs that have already been confirmed and saved.
                </p>
            </div>

            {programs.length === 0 && (
                <Card className="p-4 text-sm text-muted-foreground">
                    No saved programs were found yet.
                </Card>
            )}

            {programs.length > 0 && (
                <div className="grid gap-4 md:grid-cols-2">
                    {programs.map((program) => {
                        const firstBlock = program.blocks[0] ?? null;
                        const weekCount = countWeeks(program.blocks);
                        const sessionCount = countSessions(program.blocks);
                        const exerciseCount = countExercises(program.blocks);
                        const isCurrentProgram = program.id === currentProgramId;

                        return (
                            <Card
                                key={program.id}
                                className={
                                    isCurrentProgram
                                        ? "border-accent p-5 text-sm"
                                        : "p-5 text-sm"
                                }
                            >
                                <div className="space-y-4">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-xl font-medium tracking-[-0.02em] text-foreground">
                                            {program.name}
                                        </p>

                                        {isCurrentProgram && (
                                            <Badge variant="accent">
                                                Current Program
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-muted-foreground">
                                        Block: {firstBlock === null ? "Not found" : firstBlock.name}
                                    </p>
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <Card variant="muted" className="p-3">
                                            <p className="text-muted-foreground">Weeks</p>
                                            <p className="font-medium text-foreground">{weekCount}</p>
                                        </Card>
                                        <Card variant="muted" className="p-3">
                                            <p className="text-muted-foreground">Sessions</p>
                                            <p className="font-medium text-foreground">{sessionCount}</p>
                                        </Card>
                                        <Card variant="muted" className="p-3">
                                            <p className="text-muted-foreground">Exercises</p>
                                            <p className="font-medium text-foreground">{exerciseCount}</p>
                                        </Card>
                                        <Card variant="muted" className="p-3">
                                            <p className="text-muted-foreground">Created</p>
                                            <p className="font-medium text-foreground">{formatDate(program.createdAt)}</p>
                                        </Card>
                                    </div>

                                    <div className="flex flex-wrap items-start gap-3">
                                        <Link href={`/programs/${program.id}`} className={getButtonClassName({ variant: "secondary", size: "sm" })}>
                                            View Program
                                        </Link>

                                        <DeleteProgramButton
                                            programId={program.id}
                                            deleteProgramAction={deleteProgram}
                                        />
                                    </div>
                                </div>
                            </Card>
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
                _count: {
                    exercises: number;
                };
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
                _count: {
                    exercises: number;
                };
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
                _count: {
                    exercises: number;
                };
            }[];
        }[];
    }[],
): number {
    let exerciseCount = 0;

    for (const block of blocks) {
        for (const week of block.weeks) {
            for (const session of week.sessions) {
                exerciseCount += session._count.exercises;
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

async function readCurrentProgramSummary(): Promise<{ id: string } | null> {
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
        },
    });

    if (currentProgram !== null) {
        return currentProgram;
    }

    return prisma.program.findFirst({
        orderBy: {
            createdAt: "desc",
        },
        select: {
            id: true,
        },
    });
}
