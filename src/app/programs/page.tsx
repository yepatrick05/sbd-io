import Link from "next/link";
import { revalidatePath } from "next/cache";

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
        <main className="space-y-6 p-6">
            <div className="space-y-2">
                <Link href="/" className="text-sm text-gray-600 underline">
                    Back to Dashboard
                </Link>
                <h1 className="text-2xl font-semibold">Saved Programs</h1>
                <p className="text-sm text-gray-600">Browse programs that have already been confirmed and saved.</p>
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
                        const isCurrentProgram = program.id === currentProgramId;

                        return (
                            <div
                                key={program.id}
                                className={
                                    isCurrentProgram
                                        ? "rounded border border-black bg-white p-4 text-sm"
                                        : "rounded border border-gray-200 bg-white p-4 text-sm"
                                }
                            >
                                <div className="space-y-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-lg font-medium">{program.name}</p>

                                        {isCurrentProgram && (
                                            <span className="rounded border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                                                Current Program
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-gray-600">
                                        Block: {firstBlock === null ? "Not found" : firstBlock.name}
                                    </p>
                                    <p className="text-gray-600">Weeks: {weekCount}</p>
                                    <p className="text-gray-600">Sessions: {sessionCount}</p>
                                    <p className="text-gray-600">Exercises: {exerciseCount}</p>
                                    <p className="text-gray-600">Created: {formatDate(program.createdAt)}</p>

                                    <div className="flex flex-wrap items-start gap-3">
                                        <Link
                                            href={`/programs/${program.id}`}
                                            className="rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
                                        >
                                            View Program
                                        </Link>

                                        <DeleteProgramButton
                                            programId={program.id}
                                            deleteProgramAction={deleteProgram}
                                        />
                                    </div>
                                </div>
                            </div>
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
