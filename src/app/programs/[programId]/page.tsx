import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ProgramDetailPage({
    params,
}: {
    params: Promise<{ programId: string }>;
}) {
    const { programId } = await params;

    // Read the full saved program so users can review its weeks and sessions.
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

    return (
        <main className="space-y-6 p-6">
            <div className="space-y-2">
                <Link href="/programs" className="text-sm text-gray-600 underline">
                    Back to saved programs
                </Link>
                <h1 className="text-2xl font-semibold">{program.name}</h1>
                <p className="text-sm text-gray-600">
                    Created: {formatDate(program.createdAt)}
                </p>
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
                                <p className="text-sm text-gray-600">
                                    Sessions: {week.sessions.length}
                                </p>
                            </div>

                            <div className="space-y-2">
                                {week.sessions.map((session) => (
                                    <div
                                        key={session.id}
                                        className="rounded border border-gray-200 bg-white p-4 text-sm"
                                    >
                                        <div className="space-y-1">
                                            <p className="font-medium">Session {session.sessionOrder}</p>
                                            <p className="text-gray-600">
                                                Label: {session.label ?? "Not found"}
                                            </p>
                                            <p className="text-gray-600">
                                                Intended weekday: {session.intendedWeekday ?? "Not found"}
                                            </p>
                                            <p className="text-gray-600">
                                                Exercise count: {session.exercises.length}
                                            </p>
                                        </div>

                                        {session.exercises.length > 0 && (
                                            <div className="mt-3 rounded border border-gray-200">
                                                <table className="min-w-full border-collapse text-sm">
                                                    <thead className="bg-gray-50">
                                                        <tr className="border-b border-gray-200">
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
