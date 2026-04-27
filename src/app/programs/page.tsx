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
            // Deleting the program also deletes its related records through cascade relations.
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
                <Link href="/" className="text-sm text-gray-600 underline">
                    Back to Dashboard
                </Link>
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
                            <div
                                key={program.id}
                                className="rounded border border-gray-200 bg-white p-4 text-sm"
                            >
                                <div className="space-y-3">
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
