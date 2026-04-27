"use client";

import { useRef, useState } from "react";

export interface SaveLogsState {
    status: "idle" | "success" | "error";
    message: string;
}

type LogStatus = "clean" | "dirty" | "saving" | "saved" | "error";

interface SessionLogFormProps {
    exercises: {
        id: string;
        rawExerciseName: string;
        sets: string | null;
        reps: string | null;
        prescribedLoad: string | null;
        prescribedRpe: string | null;
        coachNotes: string | null;
        logs: {
            selectedLoad: string | null;
            actualRpe: string | null;
            athleteNotes: string | null;
        }[];
    }[];
    programId: string;
    sessionId: string;
    saveLogsAction: (formData: FormData) => Promise<SaveLogsState>;
}

export function SessionLogForm({
    exercises,
    programId,
    sessionId,
    saveLogsAction,
}: SessionLogFormProps) {
    const formRef = useRef<HTMLFormElement | null>(null);
    const [logStatus, setLogStatus] = useState<LogStatus>("clean");
    const [errorMessage, setErrorMessage] = useState("");

    let statusMessage = "Logs saved";
    let statusClassName = "rounded border border-green-300 bg-green-50 p-3 text-sm text-gray-700";

    if (logStatus === "saving") {
        statusMessage = "Saving...";
        statusClassName = "rounded border border-blue-300 bg-blue-50 p-3 text-sm text-gray-700";
    } else if (logStatus === "dirty") {
        statusMessage = "Unsaved changes";
        statusClassName = "rounded border border-amber-300 bg-amber-50 p-3 text-sm text-gray-700";
    } else if (logStatus === "saved") {
        statusMessage = "Logs saved successfully";
    } else if (logStatus === "error") {
        statusMessage = errorMessage;
        statusClassName = "rounded border border-red-300 bg-red-50 p-3 text-sm text-gray-700";
    }

    return (
        <form
            ref={formRef}
            onSubmit={async (event) => {
                event.preventDefault();

                if (formRef.current === null) {
                    setLogStatus("error");
                    setErrorMessage("Saving logs failed. Please try again.");
                    return;
                }

                setLogStatus("saving");
                setErrorMessage("");

                const formData = new FormData(formRef.current);
                const saveResult = await saveLogsAction(formData);

                if (saveResult.status === "error") {
                    setLogStatus("error");
                    setErrorMessage(saveResult.message);
                    return;
                }

                setLogStatus("saved");
            }}
            onChange={() => {
                if (logStatus !== "saving") {
                    setLogStatus("dirty");
                }
            }}
            className="space-y-4"
        >
            <input type="hidden" name="programId" value={programId} />
            <input type="hidden" name="sessionId" value={sessionId} />

            <div className={statusClassName}>{statusMessage}</div>

            {exercises.map((exercise) => {
                const currentLog = exercise.logs[0] ?? null;

                return (
                    <div
                        key={exercise.id}
                        className="space-y-3 rounded border border-gray-200 bg-gray-50 p-4 text-sm"
                    >
                        <div className="space-y-1">
                            <p className="font-medium">{exercise.rawExerciseName}</p>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                            <div>
                                <p className="text-gray-600">Sets</p>
                                <p>{formatNullableText(exercise.sets)}</p>
                            </div>

                            <div>
                                <p className="text-gray-600">Reps</p>
                                <p>{formatNullableText(exercise.reps)}</p>
                            </div>

                            <div>
                                <p className="text-gray-600">Prescribed Load</p>
                                <p>{formatNullableText(exercise.prescribedLoad)}</p>
                            </div>

                            <div>
                                <p className="text-gray-600">Prescribed RPE</p>
                                <p>{formatNullableText(exercise.prescribedRpe)}</p>
                            </div>
                        </div>

                        {exercise.coachNotes !== null && (
                            <div className="rounded border border-gray-200 bg-white p-3 text-sm text-gray-700">
                                <p className="text-gray-600">Coach Notes</p>
                                <p>{exercise.coachNotes}</p>
                            </div>
                        )}

                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-1">
                                <span className="text-gray-600">Selected Load</span>
                                <input
                                    type="text"
                                    name={`selectedLoad-${exercise.id}`}
                                    defaultValue={currentLog?.selectedLoad ?? ""}
                                    className="w-full rounded border border-gray-300 bg-white px-3 py-2"
                                />
                            </label>

                            <label className="space-y-1">
                                <span className="text-gray-600">Actual RPE</span>
                                <input
                                    type="text"
                                    name={`actualRpe-${exercise.id}`}
                                    defaultValue={currentLog?.actualRpe ?? ""}
                                    className="w-full rounded border border-gray-300 bg-white px-3 py-2"
                                />
                            </label>
                        </div>

                        <label className="space-y-1">
                            <span className="text-gray-600">Athlete Notes</span>
                            <textarea
                                name={`athleteNotes-${exercise.id}`}
                                defaultValue={currentLog?.athleteNotes ?? ""}
                                rows={3}
                                className="w-full rounded border border-gray-300 bg-white px-3 py-2"
                            />
                        </label>
                    </div>
                );
            })}

            <button
                type="submit"
                disabled={logStatus === "saving"}
                className="rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {logStatus === "saving" ? "Saving..." : "Save Logs"}
            </button>
        </form>
    );
}

function formatNullableText(value: string | null): string {
    if (value === null) {
        return "Not found";
    }

    return value;
}
