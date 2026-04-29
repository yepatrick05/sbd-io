"use client";

import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export interface SaveLogsState {
    status: "idle" | "success" | "error";
    message: string;
}

type LogStatus = "clean" | "dirty" | "saving" | "saved" | "error";
type SessionViewMode = "focused" | "table";

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
    weekNumber: number;
    sessionOrder: number;
    sessionLabel: string | null;
    intendedWeekday: string | null;
    completedAt: Date | null;
    saveLogsAction: (formData: FormData) => Promise<SaveLogsState>;
    markSessionCompleteAction?: (formData: FormData) => void | Promise<void>;
}

export function SessionLogForm({
    exercises,
    programId,
    sessionId,
    weekNumber,
    sessionOrder,
    sessionLabel,
    intendedWeekday,
    completedAt,
    saveLogsAction,
    markSessionCompleteAction,
}: SessionLogFormProps) {
    const formRef = useRef<HTMLFormElement | null>(null);
    const mobileExerciseContainerRef = useRef<HTMLDivElement | null>(null);
    const exerciseCardRefs = useRef<Array<HTMLDivElement | null>>([]);
    const [logStatus, setLogStatus] = useState<LogStatus>("clean");
    const [errorMessage, setErrorMessage] = useState("");
    const [completionWarningMessage, setCompletionWarningMessage] = useState<string | null>(null);
    const [activeExerciseIndex, setActiveExerciseIndex] = useState(0);
    const [sessionViewMode, setSessionViewMode] = useState<SessionViewMode>("focused");
    const hasUnsavedChanges = logStatus === "dirty";
    const lastExerciseIndex = Math.max(exercises.length - 1, 0);
    const visibleExerciseIndex = Math.min(activeExerciseIndex, lastExerciseIndex);
    const sessionStatusLabel = getCompletionStatusLabel(completedAt);
    const sessionStatusVariant = getCompletionStatusVariant(completedAt);
    const sessionDisplayLabel = buildSessionDisplayLabel({
        sessionOrder,
        sessionLabel,
        intendedWeekday,
    });

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

    useEffect(() => {
        const mobileExerciseContainer = mobileExerciseContainerRef.current;

        if (mobileExerciseContainer === null) {
            return;
        }

        let animationFrameId = 0;

        function updateActiveExerciseFromScroll() {
            animationFrameId = 0;

            const containerTop = mobileExerciseContainer.getBoundingClientRect().top;
            let closestExerciseIndex = visibleExerciseIndex;
            let closestDistance = Number.POSITIVE_INFINITY;

            for (let exerciseIndex = 0; exerciseIndex < exerciseCardRefs.current.length; exerciseIndex += 1) {
                const exerciseCard = exerciseCardRefs.current[exerciseIndex];

                if (exerciseCard === null) {
                    continue;
                }

                const distanceFromTop = Math.abs(exerciseCard.getBoundingClientRect().top - containerTop);

                if (distanceFromTop < closestDistance) {
                    closestDistance = distanceFromTop;
                    closestExerciseIndex = exerciseIndex;
                }
            }

            if (closestExerciseIndex !== visibleExerciseIndex) {
                setActiveExerciseIndex(closestExerciseIndex);
            }
        }

        function handleScroll() {
            if (animationFrameId !== 0) {
                return;
            }

            animationFrameId = window.requestAnimationFrame(updateActiveExerciseFromScroll);
        }

        mobileExerciseContainer.addEventListener("scroll", handleScroll);

        return () => {
            mobileExerciseContainer.removeEventListener("scroll", handleScroll);

            if (animationFrameId !== 0) {
                window.cancelAnimationFrame(animationFrameId);
            }
        };
    }, [visibleExerciseIndex]);

    let statusMessage = "Logs saved";
    let statusClassName = "rounded-lg border border-[#cad9c7] bg-success-surface p-3 text-sm text-success-foreground";

    if (logStatus === "saving") {
        statusMessage = "Saving...";
        statusClassName = "rounded-lg border border-border bg-surface-muted p-3 text-sm text-foreground";
    } else if (logStatus === "dirty") {
        statusMessage = "Unsaved changes";
        statusClassName = "rounded-lg border border-[#dccda8] bg-warning-surface p-3 text-sm text-warning-foreground";
    } else if (logStatus === "saved") {
        statusMessage = "Logs saved successfully";
    } else if (logStatus === "error") {
        statusMessage = errorMessage;
        statusClassName = "rounded-lg border border-[#e6b8b2] bg-danger-surface p-3 text-sm text-danger-foreground";
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
            className="space-y-4 pb-28"
        >
            <input type="hidden" name="programId" value={programId} />
            <input type="hidden" name="sessionId" value={sessionId} />

            <Card className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <span>Week {weekNumber}</span>
                            <span aria-hidden="true">•</span>
                            <span>{sessionDisplayLabel}</span>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <Badge variant={sessionStatusVariant}>{sessionStatusLabel}</Badge>
                        {exercises.length > 0 && (
                            <Badge variant="neutral">
                                Exercise {visibleExerciseIndex + 1} of {exercises.length}
                            </Badge>
                        )}
                    </div>
                </div>

                {exercises.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            variant={sessionViewMode === "focused" ? "primary" : "secondary"}
                            size="sm"
                            onClick={() => {
                                setSessionViewMode("focused");
                            }}
                        >
                            Focused View
                        </Button>
                        <Button
                            type="button"
                            variant={sessionViewMode === "table" ? "primary" : "secondary"}
                            size="sm"
                            onClick={() => {
                                setSessionViewMode("table");
                            }}
                        >
                            Full Table
                        </Button>
                    </div>
                )}
            </Card>

            {exercises.length > 0 && sessionViewMode === "table" && (
                <Card className="overflow-x-auto p-0">
                    <table className="min-w-full border-collapse text-sm">
                        <thead className="bg-surface-muted">
                            <tr className="border-b border-border">
                                <th className="px-3 py-2 text-left font-medium">Exercise</th>
                                <th className="px-3 py-2 text-left font-medium">Sets</th>
                                <th className="px-3 py-2 text-left font-medium">Reps</th>
                                <th className="px-3 py-2 text-left font-medium">Prescribed Load</th>
                                <th className="px-3 py-2 text-left font-medium">Prescribed RPE</th>
                            </tr>
                        </thead>
                        <tbody>
                            {exercises.map((exercise) => (
                                <tr key={exercise.id} className="border-b border-border">
                                    <td className="px-3 py-2 align-top text-foreground">{exercise.rawExerciseName}</td>
                                    <td className="px-3 py-2 align-top text-muted-foreground">
                                        {formatNullableText(exercise.sets)}
                                    </td>
                                    <td className="px-3 py-2 align-top text-muted-foreground">
                                        {formatNullableText(exercise.reps)}
                                    </td>
                                    <td className="px-3 py-2 align-top text-muted-foreground">
                                        {formatNullableText(exercise.prescribedLoad)}
                                    </td>
                                    <td className="px-3 py-2 align-top text-muted-foreground">
                                        {formatNullableText(exercise.prescribedRpe)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>
            )}

            <div
                ref={mobileExerciseContainerRef}
                className={clsx(
                    "space-y-4 md:space-y-4 md:overflow-visible md:snap-none md:pr-0 md:[scrollbar-width:auto]",
                    "max-md:max-h-[calc(100svh-25rem)] max-md:overflow-y-auto max-md:snap-y max-md:snap-mandatory max-md:overscroll-contain max-md:pr-1 max-md:[scrollbar-width:none]",
                    sessionViewMode === "table" ? "hidden" : "block",
                )}
            >
                {exercises.map((exercise, exerciseIndex) => {
                    const currentLog = exercise.logs[0] ?? null;
                    const setsAndReps = formatSetsAndReps(exercise.sets, exercise.reps);
                    const exerciseIsActive = exerciseIndex === visibleExerciseIndex;

                    return (
                        <Card
                            key={exercise.id}
                            ref={(exerciseCardElement) => {
                                exerciseCardRefs.current[exerciseIndex] = exerciseCardElement;
                            }}
                            className={clsx(
                                "space-y-4 p-4 text-sm",
                                "max-md:min-h-[calc(100svh-27rem)] max-md:snap-start",
                                exerciseIsActive
                                    ? "border-accent"
                                    : "max-md:border-border md:border-border",
                            )}
                        >
                            <div className="space-y-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="space-y-2">
                                        <p className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                                            {exercise.rawExerciseName}
                                        </p>
                                    </div>

                                    <Badge variant="neutral">{setsAndReps}</Badge>
                                </div>

                                <Card variant="muted" className="grid grid-cols-2 gap-3 p-3">
                                    <div>
                                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                            Prescribed Load
                                        </p>
                                        <p className="font-medium text-foreground">
                                            {formatNullableText(exercise.prescribedLoad)}
                                        </p>
                                    </div>

                                    <div>
                                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                            Prescribed RPE
                                        </p>
                                        <p className="font-medium text-foreground">
                                            {formatNullableText(exercise.prescribedRpe)}
                                        </p>
                                    </div>
                                </Card>
                            </div>

                            {exercise.coachNotes !== null && (
                                <Card variant="muted" className="p-3 text-sm text-foreground">
                                    <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                                        Coach Notes
                                    </p>
                                    <p>{exercise.coachNotes}</p>
                                </Card>
                            )}

                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="space-y-1">
                                    <span className="text-foreground">Selected Load</span>
                                    <input
                                        type="text"
                                        name={`selectedLoad-${exercise.id}`}
                                        defaultValue={currentLog?.selectedLoad ?? ""}
                                        className="w-full rounded-md border border-border bg-surface px-3 py-3 text-base text-foreground"
                                    />
                                </label>

                                <label className="space-y-1">
                                    <span className="text-foreground">Actual RPE</span>
                                    <input
                                        type="text"
                                        name={`actualRpe-${exercise.id}`}
                                        defaultValue={currentLog?.actualRpe ?? ""}
                                        className="w-full rounded-md border border-border bg-surface px-3 py-3 text-base text-foreground"
                                    />
                                </label>
                            </div>

                            <label className="space-y-1">
                                <span className="text-muted-foreground">Athlete Notes</span>
                                <textarea
                                    name={`athleteNotes-${exercise.id}`}
                                    defaultValue={currentLog?.athleteNotes ?? ""}
                                    rows={3}
                                    className="w-full rounded-md border border-border bg-surface px-3 py-3 text-base text-foreground"
                                />
                            </label>
                        </Card>
                    );
                })}
            </div>

            <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
                <div className="space-y-3">
                    {completionWarningMessage !== null && (
                        <Card className="border-[#dccda8] bg-warning-surface p-3 text-sm text-warning-foreground">
                            {completionWarningMessage}
                        </Card>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className={statusClassName}>{statusMessage}</p>

                        <div className="flex flex-wrap items-center gap-3">
                            {markSessionCompleteAction !== undefined && (
                                <Button
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
                                    variant="secondary"
                                >
                                    Mark Complete
                                </Button>
                            )}

                            <Button
                                type="submit"
                                disabled={logStatus === "saving"}
                                variant="primary"
                            >
                                {logStatus === "saving" ? "Saving..." : "Save Logs"}
                            </Button>
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

function getCompletionStatusLabel(completedAt: Date | null): "Completed" | "Incomplete" {
    if (completedAt !== null) {
        return "Completed";
    }

    return "Incomplete";
}

function getCompletionStatusVariant(completedAt: Date | null): "completed" | "current" {
    if (completedAt !== null) {
        return "completed";
    }

    return "current";
}

function buildSessionDisplayLabel({
    sessionOrder,
    sessionLabel,
    intendedWeekday,
}: {
    sessionOrder: number;
    sessionLabel: string | null;
    intendedWeekday: string | null;
}): string {
    if (sessionLabel !== null && sessionLabel !== "") {
        return sessionLabel;
    }

    if (intendedWeekday !== null && intendedWeekday !== "") {
        return `Day ${sessionOrder} - ${intendedWeekday}`;
    }

    return `Day ${sessionOrder}`;
}
