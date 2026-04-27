import Link from "next/link";
import { notFound, redirect } from "next/navigation";

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
                                select: {
                                    id: true,
                                    completedAt: true,
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

    const nextSessionId = findNextSessionId(program.blocks);

    if (nextSessionId !== null) {
        redirect(`/programs/${program.id}/sessions/${nextSessionId}`);
    }

    return (
        <main className="space-y-6 p-6">
            <div className="space-y-2">
                <Link href={`/programs/${program.id}`} className="text-sm text-gray-600 underline">
                    Back to program
                </Link>
                <h1 className="text-2xl font-semibold">Next Session</h1>
                <p className="text-sm text-gray-600">{program.name}</p>
            </div>

            <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-600">
                This program has no remaining sessions. Every saved session is already completed.
            </div>
        </main>
    );
}

function findNextSessionId(
    blocks: {
        weeks: {
            sessions: {
                id: string;
                completedAt: Date | null;
            }[];
        }[];
    }[],
): string | null {
    for (const block of blocks) {
        for (const week of block.weeks) {
            for (const session of week.sessions) {
                if (session.completedAt === null) {
                    return session.id;
                }
            }
        }
    }

    return null;
}
