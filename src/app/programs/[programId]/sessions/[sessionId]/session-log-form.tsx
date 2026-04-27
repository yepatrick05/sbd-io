"use client";

import { useEffect, useRef, useState } from "react";

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
    markSessionCompleteAction?: (formData: FormData) => void | Promise<void>;
}

export function SessionLogForm({
    exercises,
    programId,
    sessionId,
    saveLogsAction,
    markSessionCompleteAction,
}: SessionLogFormProps) {
    const formRef = useRef<HTMLFormElement | null>(null);
    const [logStatus, setLogStatus] = useState<LogStatus>("clean");
    const [errorMessage, setErrorMessage] = useState("");
    const [completionWarningMessage, setCompletionWarningMessage] = useState<string | null>(null);
    const hasUnsavedChanges = logStatus === "dirty";

    useEffect(() => {
        function handleBeforeUnload(event: BeforeUnloadEvent) {
            if (!hasUnsavedChanges) {
                return;
            }

            event.preventDefault();
            event.returnValue = "";
        }

        function handleDocumentClick(event: MouseEvent) {
            if (!hasUnsavedChanges) {
                return;
            }

            if (event.defaultPrevented) {
                return;
            }

            const clickTarget = event.target;

            if (!(clickTarget instanceof Element)) {
                return;
            }

            const navigationLink = clickTarget.closest<HTMLAnchorElement>('a[data-warn-unsaved="true"]');

            if (navigationLink === null) {
                return;
            }

            const shouldLeavePage = window.confirm("You have unsaved log changes. Leave this page without saving?");

            if (shouldLeavePage) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
        }

        window.addEventListener("beforeunload", handleBeforeUnload);
        document.addEventListener("click", handleDocumentClick, true);

        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
            document.removeEventListener("click", handleDocumentClick, true);
        };
    }, [hasUnsavedChanges]);

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
                setCompletionWarningMessage(null);

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

                setCompletionWarningMessage(null);
            }}
            className="space-y-4 pb-24"
        >
            <input type="hidden" name="programId" value={programId} />
            <input type="hidden" name="sessionId" value={sessionId} />

            <div className={statusClassName}>{statusMessage}</div>

            {exercises.map((exercise) => {
                const currentLog = exercise.logs[0] ?? null;
                const setsAndReps = formatSetsAndReps(exercise.sets, exercise.reps);

                return (
                    <div key={exercise.id} className="space-y-3 rounded border border-gray-200 bg-white p-4 text-sm">
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <p className="text-base font-semibold text-gray-900">{exercise.rawExerciseName}</p>

                                <span className="rounded border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700">
                                    {setsAndReps}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 rounded border border-gray-200 bg-gray-50 p-3">
                                <div>
                                    <p className="text-xs uppercase tracking-wide text-gray-500">Prescribed Load</p>
                                    <p className="font-medium text-gray-900">
                                        {formatNullableText(exercise.prescribedLoad)}
                                    </p>
                                </div>

                                <div>
                                    <p className="text-xs uppercase tracking-wide text-gray-500">Prescribed RPE</p>
                                    <p className="font-medium text-gray-900">
                                        {formatNullableText(exercise.prescribedRpe)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {exercise.coachNotes !== null && (
                            <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                                <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">Coach Notes</p>
                                <p>{exercise.coachNotes}</p>
                            </div>
                        )}

                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-1">
                                <span className="text-gray-700">Selected Load</span>
                                <input
                                    type="text"
                                    name={`selectedLoad-${exercise.id}`}
                                    defaultValue={currentLog?.selectedLoad ?? ""}
                                    className="w-full rounded border border-gray-300 bg-white px-3 py-3 text-base"
                                />
                            </label>

                            <label className="space-y-1">
                                <span className="text-gray-700">Actual RPE</span>
                                <input
                                    type="text"
                                    name={`actualRpe-${exercise.id}`}
                                    defaultValue={currentLog?.actualRpe ?? ""}
                                    className="w-full rounded border border-gray-300 bg-white px-3 py-3 text-base"
                                />
                            </label>
                        </div>

                        <label className="space-y-1">
                            <span className="text-gray-600">Athlete Notes</span>
                            <textarea
                                name={`athleteNotes-${exercise.id}`}
                                defaultValue={currentLog?.athleteNotes ?? ""}
                                rows={2}
                                className="w-full rounded border border-gray-300 bg-white px-3 py-3 text-base"
                            />
                        </label>
                    </div>
                );
            })}

            <div className="sticky bottom-0 -mx-4 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
                <div className="space-y-3">
                    {completionWarningMessage !== null && (
                        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-gray-700">
                            {completionWarningMessage}
                        </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-sm text-gray-600">{statusMessage}</p>

                        <div className="flex flex-wrap items-center gap-3">
                            {markSessionCompleteAction !== undefined && (
                                <button
                                    type="button"
                                    onClick={async () => {
                                        if (!hasUnsavedChanges) {
                                            setCompletionWarningMessage(null);
                                        } else {
                                            setCompletionWarningMessage(
                                                "You have unsaved log changes. Save logs before completing this session.",
                                            );
                                            return;
                                        }

                                        const formData = new FormData();
                                        formData.set("programId", programId);
                                        formData.set("sessionId", sessionId);

                                        await markSessionCompleteAction(formData);
                                    }}
                                    className="rounded border border-gray-300 bg-white px-4 py-3 text-sm text-gray-700"
                                >
                                    Mark Complete
                                </button>
                            )}

                            <button
                                type="submit"
                                disabled={logStatus === "saving"}
                                className="rounded border border-black bg-black px-4 py-3 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {logStatus === "saving" ? "Saving..." : "Save Logs"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </form>
    );
}

function formatNullableText(value: string | null): string {
    if (value === null) {
        return "Not found";
    }

    return value;
}

function formatSetsAndReps(sets: string | null, reps: string | null): string {
    const formattedSets = formatNullableText(sets);
    const formattedReps = formatNullableText(reps);

    return `${formattedSets} x ${formattedReps}`;
}
