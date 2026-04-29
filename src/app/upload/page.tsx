"use client";

import Link from "next/link";
import { useState } from "react";

import type {
    HeaderRowCandidate,
    NormalisedSessionPreview,
    NormalisedWeekPreview,
    ProgramPreview,
    TableColumnMapping,
    TableRegion,
    ValidationIssue,
    WorkbookPreview,
} from "@/types/workbook";

export default function UploadPage() {
    const [workbookPreview, setWorkbookPreview] = useState<WorkbookPreview | null>(null);
    const [selectedSheetName, setSelectedSheetName] = useState<string | null>(null);
    const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
    const [savedProgramId, setSavedProgramId] = useState<string | null>(null);
    const [expandedSessionKeys, setExpandedSessionKeys] = useState<string[]>([]);
    const [showDebugDetails, setShowDebugDetails] = useState(false);
    const [isSavingImport, setIsSavingImport] = useState(false);

    async function handleUpload(event: React.SubmitEvent<HTMLFormElement>) {
        event.preventDefault();

        const formData = new FormData(event.currentTarget);

        const response = await fetch("/api/upload", {
            method: "POST",
            body: formData,
        });

        const preview = (await response.json()) as WorkbookPreview;

        setWorkbookPreview(preview);
        setConfirmMessage(null);
        setSavedProgramId(null);
        setExpandedSessionKeys([]);
        setShowDebugDetails(false);
        setIsSavingImport(false);

        if (preview.sheets.length > 0) {
            setSelectedSheetName(preview.sheets[0].name);
        } else {
            setSelectedSheetName(null);
        }
    }

    let selectedSheet = null;

    if (workbookPreview !== null) {
        selectedSheet =
            workbookPreview.sheets.find((sheet) => sheet.name === selectedSheetName) ??
            workbookPreview.sheets[0] ??
            null;
    }

    let visibleHeaderRowCandidates: HeaderRowCandidate[] = [];
    let visibleTableRegions: TableRegion[] = [];
    let visibleTableColumnMappings: TableColumnMapping[] = [];
    let programPreview: ProgramPreview | null = null;
    let validationIssues: ValidationIssue[] = [];

    if (workbookPreview !== null) {
        programPreview = workbookPreview.programPreview;
        validationIssues = workbookPreview.validationIssues;

        if (selectedSheet !== null) {
            visibleHeaderRowCandidates = workbookPreview.headerRowCandidates.filter((candidate) => {
                return candidate.sheetName === selectedSheet.name;
            });

            visibleTableRegions = workbookPreview.tableRegions.filter((tableRegion) => {
                return tableRegion.sheetName === selectedSheet.name;
            });

            visibleTableColumnMappings = workbookPreview.tableColumnMappings.filter((tableColumnMapping) => {
                return tableColumnMapping.sheetName === selectedSheet.name;
            });
        }
    }

    const totalErrorCount = countIssuesBySeverity(validationIssues, "error");
    const totalWarningCount = countIssuesBySeverity(validationIssues, "warning");
    const hasBlockingErrors = totalErrorCount > 0;
    const reviewSummary = buildReviewSummary(programPreview, validationIssues);
    const reviewLevelIssues = getReviewLevelIssues(validationIssues);
    const unparsedSheetIssues = getUnparsedSheetIssues(validationIssues);
    const groupedImportWarnings = getGroupedImportWarnings(validationIssues);

    async function handleConfirmImport() {
        if (hasBlockingErrors) {
            setConfirmMessage("Import cannot be confirmed yet because there are blocking validation errors.");
            return;
        }

        if (workbookPreview === null) {
            setConfirmMessage("Workbook preview is missing.");
            return;
        }

        setIsSavingImport(true);
        setConfirmMessage(null);
        setSavedProgramId(null);

        try {
            const response = await fetch("/api/import", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    workbookPreview,
                }),
            });

            const responseBody = (await response.json()) as { error?: string; programId?: string };

            if (!response.ok) {
                setConfirmMessage(responseBody.error ?? "Failed to save import.");
                return;
            }

            setConfirmMessage(`Import saved successfully. Program id: ${responseBody.programId}`);
            setSavedProgramId(responseBody.programId ?? null);
        } catch {
            setConfirmMessage("Failed to save import.");
        } finally {
            setIsSavingImport(false);
        }
    }

    function toggleSession(session: NormalisedSessionPreview) {
        const sessionKey = getSessionKey(session);
        const sessionIsExpanded = expandedSessionKeys.includes(sessionKey);

        if (sessionIsExpanded) {
            const nextExpandedSessionKeys = expandedSessionKeys.filter((currentKey) => currentKey !== sessionKey);
            setExpandedSessionKeys(nextExpandedSessionKeys);
            return;
        }

        setExpandedSessionKeys([...expandedSessionKeys, sessionKey]);
    }

    return (
        <main className="space-y-6 p-6">
            <div className="space-y-3">
                <h1 className="max-w-2xl text-3xl font-semibold tracking-[-0.03em] text-foreground">Upload Workbook</h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    Upload an Excel program, review the parsed result, then confirm the import.
                </p>
            </div>

            <form onSubmit={handleUpload} className="space-y-3 rounded border border-gray-200 bg-white p-4">
                <input type="file" name="file" accept=".xlsx" required />
                <div>
                    <button
                        type="submit"
                        className="rounded border border-black bg-black px-3 py-1.5 text-sm text-white"
                    >
                        Upload
                    </button>
                </div>
            </form>

            {workbookPreview !== null && (
                <section className="space-y-6">
                    <div className="space-y-4 rounded border border-gray-200 bg-gray-50 p-4">
                        <div className="space-y-2">
                            <h2 className="text-lg font-semibold">Import Review</h2>
                            <p className="text-sm text-gray-600">
                                Review the summary first, then expand individual sessions only when you need more
                                detail.
                            </p>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <SummaryCard label="Program Name" value={reviewSummary.programName} />
                            <SummaryCard label="Sheet Name" value={reviewSummary.sheetName} />
                            <SummaryCard label="Total Weeks" value={String(reviewSummary.totalWeeks)} />
                            <SummaryCard label="Total Sessions" value={String(reviewSummary.totalSessions)} />
                            <SummaryCard label="Total Exercises" value={String(reviewSummary.totalExercises)} />
                            <SummaryCard label="Errors" value={String(totalErrorCount)} />
                            <SummaryCard label="Warnings" value={`${groupedImportWarnings.length} types`} />
                            <SummaryCard label="Import Status" value={hasBlockingErrors ? "Blocked" : "Ready"} />
                        </div>

                        <div
                            className={
                                hasBlockingErrors
                                    ? "rounded border border-red-300 bg-red-50 p-3 text-sm"
                                    : "rounded border border-green-300 bg-green-50 p-3 text-sm"
                            }
                        >
                            <p className="font-medium">
                                {hasBlockingErrors
                                    ? "Blocking errors were found. Import cannot be confirmed yet."
                                    : "No blocking errors were found. Import can be confirmed."}
                            </p>
                            <p className="text-gray-700">
                                Errors: {totalErrorCount} | Warning types: {groupedImportWarnings.length} | Warning
                                instances: {totalWarningCount}
                            </p>
                        </div>

                        {reviewLevelIssues.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-sm font-medium">Import review notes</p>

                                {reviewLevelIssues.map((issue, issueIndex) => (
                                    <div
                                        key={issueIndex}
                                        className={
                                            issue.severity === "error"
                                                ? "rounded border border-red-300 bg-red-50 p-3 text-sm"
                                                : "rounded border border-yellow-300 bg-yellow-50 p-3 text-sm"
                                        }
                                    >
                                        <p className="font-medium">
                                            {formatSeverity(issue.severity)}: {issue.message}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {unparsedSheetIssues.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-sm font-medium">Sheets that were not parsed confidently</p>

                                {unparsedSheetIssues.map((issue, issueIndex) => (
                                    <div
                                        key={issueIndex}
                                        className="rounded border border-yellow-300 bg-yellow-50 p-3 text-sm"
                                    >
                                        <p className="font-medium">{issue.sheetName}</p>
                                        <p className="text-gray-700">{issue.message}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {groupedImportWarnings.length > 0 && (
                            <div className="space-y-2">
                                <p className="text-sm font-medium">Warning summary</p>

                                <div className="space-y-2">
                                    {groupedImportWarnings.map((warningSummary, warningIndex) => (
                                        <div
                                            key={warningIndex}
                                            className="rounded border border-yellow-300 bg-yellow-50 p-3 text-sm"
                                        >
                                            <p className="font-medium">{warningSummary.message}</p>
                                            <p className="text-gray-700">
                                                {warningSummary.count} occurrence
                                                {warningSummary.count === 1 ? "" : "s"}
                                            </p>
                                        </div>
                                    ))}
                                </div>

                                <details className="rounded border border-gray-200 bg-white p-3 text-sm">
                                    <summary className="cursor-pointer font-medium text-gray-700">
                                        Show warning details
                                    </summary>

                                    <div className="mt-3 space-y-2">
                                        {groupedImportWarnings.map((warningSummary, warningIndex) => (
                                            <div key={warningIndex} className="rounded border border-gray-200 p-3">
                                                <p className="font-medium">{warningSummary.message}</p>

                                                <div className="mt-2 space-y-1 text-gray-600">
                                                    {warningSummary.issues.map((issue, issueIndex) => (
                                                        <p key={issueIndex}>
                                                            Sheet: {formatTextValue(issue.sheetName)} | Week:{" "}
                                                            {formatNumberValue(issue.weekNumber)} | Session:{" "}
                                                            {formatNumberValue(issue.sessionOrder)} | Exercise:{" "}
                                                            {formatTextValue(issue.exerciseName)} | Source row:{" "}
                                                            {formatNumberValue(issue.sourceRowNumber)}
                                                        </p>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                onClick={handleConfirmImport}
                                disabled={hasBlockingErrors || isSavingImport}
                                className={
                                    hasBlockingErrors || isSavingImport
                                        ? "rounded border border-gray-300 bg-gray-200 px-4 py-2 text-sm text-gray-500"
                                        : "rounded border border-black bg-black px-4 py-2 text-sm text-white"
                                }
                            >
                                {isSavingImport ? "Saving Import..." : "Confirm Import"}
                            </button>

                            {confirmMessage !== null && <p className="text-sm text-gray-600">{confirmMessage}</p>}
                            {savedProgramId !== null && (
                                <Link href={`/programs/${savedProgramId}`} className="text-sm text-gray-700 underline">
                                    View saved program
                                </Link>
                            )}
                        </div>

                        {programPreview === null && (
                            <p className="text-sm text-gray-600">No program preview was created.</p>
                        )}

                        {programPreview !== null && (
                            <div className="space-y-4">
                                {programPreview.blocks.map((block, blockIndex) => (
                                    <div
                                        key={blockIndex}
                                        className="space-y-4 rounded border border-gray-200 bg-white p-4"
                                    >
                                        <div className="space-y-1">
                                            <p className="font-medium">Sheet: {block.sheetName}</p>
                                        </div>

                                        {block.weeks.map((week, weekIndex) => {
                                            const weekExerciseCount = countExercisesInWeek(week);
                                            const weekErrorCount = countIssuesForWeek(
                                                validationIssues,
                                                week.weekNumber,
                                                "error",
                                            );
                                            const weekWarningCount = countIssuesForWeek(
                                                validationIssues,
                                                week.weekNumber,
                                                "warning",
                                            );

                                            return (
                                                <div
                                                    key={weekIndex}
                                                    className="space-y-3 rounded border border-gray-200 bg-gray-50 p-4"
                                                >
                                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                                        <div className="space-y-1">
                                                            <p className="font-medium">
                                                                Week {formatNumberValue(week.weekNumber)}
                                                            </p>
                                                            <p className="text-sm text-gray-600">
                                                                Sessions: {week.sessions.length} | Exercises:{" "}
                                                                {weekExerciseCount}
                                                            </p>
                                                        </div>

                                                        <div className="text-sm text-gray-600">
                                                            Errors: {weekErrorCount} | Warnings: {weekWarningCount}
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2">
                                                        {week.sessions.map((session, sessionIndex) => {
                                                            const sessionKey = getSessionKey(session);
                                                            const sessionIsExpanded =
                                                                expandedSessionKeys.includes(sessionKey);
                                                            const sessionErrorCount = countIssuesForSession(
                                                                validationIssues,
                                                                session,
                                                                "error",
                                                            );
                                                            const sessionWarningCount = countIssuesForSession(
                                                                validationIssues,
                                                                session,
                                                                "warning",
                                                            );
                                                            const sessionIssues = getIssuesForSession(
                                                                validationIssues,
                                                                session,
                                                            );
                                                            const sessionErrors = sessionIssues.filter((issue) => {
                                                                return issue.severity === "error";
                                                            });
                                                            const groupedSessionWarnings =
                                                                getGroupedWarningSummaries(sessionIssues);

                                                            return (
                                                                <div
                                                                    key={sessionIndex}
                                                                    className="rounded border border-gray-200 bg-white"
                                                                >
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => toggleSession(session)}
                                                                        className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left"
                                                                    >
                                                                        <div className="space-y-1">
                                                                            <p className="font-medium">
                                                                                Session{" "}
                                                                                {formatNumberValue(
                                                                                    session.sessionOrder,
                                                                                )}
                                                                            </p>
                                                                            <p className="text-sm text-gray-600">
                                                                                {formatTextValue(session.sessionLabel)}
                                                                            </p>
                                                                        </div>

                                                                        <div className="text-sm text-gray-600">
                                                                            <p>
                                                                                {formatCompactWeekday(
                                                                                    session.intendedWeekday,
                                                                                )}{" "}
                                                                                | Exercises: {session.exercises.length}
                                                                            </p>
                                                                            <p>
                                                                                Errors: {sessionErrorCount} | Warnings:{" "}
                                                                                {sessionWarningCount}
                                                                            </p>
                                                                        </div>

                                                                        <div className="text-sm text-gray-600">
                                                                            {sessionIsExpanded
                                                                                ? "Hide details"
                                                                                : "Show details"}
                                                                        </div>
                                                                    </button>

                                                                    {sessionIsExpanded && (
                                                                        <div className="space-y-3 border-t border-gray-200 px-4 py-4">
                                                                            <div className="space-y-1 text-sm text-gray-600">
                                                                                <p>
                                                                                    Intended weekday:{" "}
                                                                                    {formatTextValue(
                                                                                        session.intendedWeekday,
                                                                                    )}
                                                                                </p>
                                                                                <p>
                                                                                    Source region: row{" "}
                                                                                    {session.startRowNumber} to{" "}
                                                                                    {session.endRowNumber}, columns{" "}
                                                                                    {session.startColumnIndex} to{" "}
                                                                                    {session.endColumnIndex}
                                                                                </p>
                                                                            </div>

                                                                            {sessionErrors.length > 0 && (
                                                                                <div className="space-y-2">
                                                                                    <p className="font-medium text-sm">
                                                                                        Errors for this session
                                                                                    </p>

                                                                                    {sessionErrors.map(
                                                                                        (issue, issueIndex) => (
                                                                                            <div
                                                                                                key={issueIndex}
                                                                                                className="rounded border border-red-300 bg-red-50 p-3 text-sm"
                                                                                            >
                                                                                                <p className="font-medium">
                                                                                                    {formatSeverity(
                                                                                                        issue.severity,
                                                                                                    )}
                                                                                                    : {issue.message}
                                                                                                </p>
                                                                                                <p className="text-gray-600">
                                                                                                    Exercise:{" "}
                                                                                                    {formatTextValue(
                                                                                                        issue.exerciseName,
                                                                                                    )}{" "}
                                                                                                    | Source row:{" "}
                                                                                                    {formatNumberValue(
                                                                                                        issue.sourceRowNumber,
                                                                                                    )}
                                                                                                </p>
                                                                                            </div>
                                                                                        ),
                                                                                    )}
                                                                                </div>
                                                                            )}

                                                                            {groupedSessionWarnings.length > 0 && (
                                                                                <div className="space-y-2">
                                                                                    <p className="font-medium text-sm">
                                                                                        Warning summary for this session
                                                                                    </p>

                                                                                    {groupedSessionWarnings.map(
                                                                                        (
                                                                                            warningSummary,
                                                                                            warningIndex,
                                                                                        ) => (
                                                                                            <div
                                                                                                key={warningIndex}
                                                                                                className="rounded border border-yellow-300 bg-yellow-50 p-3 text-sm"
                                                                                            >
                                                                                                <p className="font-medium">
                                                                                                    {
                                                                                                        warningSummary.message
                                                                                                    }
                                                                                                </p>
                                                                                                <p className="text-gray-600">
                                                                                                    {
                                                                                                        warningSummary.count
                                                                                                    }{" "}
                                                                                                    occurrence
                                                                                                    {warningSummary.count ===
                                                                                                    1
                                                                                                        ? ""
                                                                                                        : "s"}
                                                                                                </p>
                                                                                            </div>
                                                                                        ),
                                                                                    )}

                                                                                    <details className="rounded border border-gray-200 bg-white p-3 text-sm">
                                                                                        <summary className="cursor-pointer font-medium text-gray-700">
                                                                                            Show warning details
                                                                                        </summary>

                                                                                        <div className="mt-3 space-y-2 text-gray-600">
                                                                                            {groupedSessionWarnings
                                                                                                .flatMap(
                                                                                                    (
                                                                                                        warningSummary,
                                                                                                    ) => {
                                                                                                        return warningSummary.issues;
                                                                                                    },
                                                                                                )
                                                                                                .map(
                                                                                                    (
                                                                                                        issue,
                                                                                                        issueIndex,
                                                                                                    ) => (
                                                                                                        <p
                                                                                                            key={
                                                                                                                issueIndex
                                                                                                            }
                                                                                                        >
                                                                                                            {
                                                                                                                issue.message
                                                                                                            }{" "}
                                                                                                            | Exercise:{" "}
                                                                                                            {formatTextValue(
                                                                                                                issue.exerciseName,
                                                                                                            )}{" "}
                                                                                                            | Source
                                                                                                            row:{" "}
                                                                                                            {formatNumberValue(
                                                                                                                issue.sourceRowNumber,
                                                                                                            )}
                                                                                                        </p>
                                                                                                    ),
                                                                                                )}
                                                                                        </div>
                                                                                    </details>
                                                                                </div>
                                                                            )}

                                                                            <div className="overflow-x-auto rounded border border-gray-200">
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
                                                                                            <th className="px-3 py-2 text-left font-medium">
                                                                                                Selected Load
                                                                                            </th>
                                                                                            <th className="px-3 py-2 text-left font-medium">
                                                                                                Actual RPE
                                                                                            </th>
                                                                                        </tr>
                                                                                    </thead>
                                                                                    <tbody>
                                                                                        {session.exercises.map(
                                                                                            (
                                                                                                exercise,
                                                                                                exerciseIndex,
                                                                                            ) => (
                                                                                                <ExerciseReviewRows
                                                                                                    key={exerciseIndex}
                                                                                                    exercise={exercise}
                                                                                                />
                                                                                            ),
                                                                                        )}
                                                                                    </tbody>
                                                                                </table>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4">
                            <button
                                type="button"
                                onClick={handleConfirmImport}
                                disabled={hasBlockingErrors || isSavingImport}
                                className={
                                    hasBlockingErrors || isSavingImport
                                        ? "rounded border border-gray-300 bg-gray-200 px-4 py-2 text-sm text-gray-500"
                                        : "rounded border border-black bg-black px-4 py-2 text-sm text-white"
                                }
                            >
                                {isSavingImport ? "Saving Import..." : "Confirm Import"}
                            </button>

                            {hasBlockingErrors && (
                                <p className="text-sm text-red-600">
                                    Resolve the blocking validation errors before confirming the import.
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <button
                            type="button"
                            onClick={() => setShowDebugDetails(!showDebugDetails)}
                            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700"
                        >
                            {showDebugDetails ? "Hide debug details" : "Show debug details"}
                        </button>

                        {showDebugDetails && (
                            <div className="space-y-4 rounded border border-gray-200 bg-white p-4">
                                <div className="space-y-2">
                                    <h2 className="text-lg font-semibold">Parser Debug</h2>
                                    <p className="text-sm text-gray-600">
                                        These sections are still available so we can inspect how the workbook was
                                        parsed.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="text-base font-semibold">Workbook Preview</h3>
                                    <p className="text-sm text-gray-600">
                                        Select a sheet to preview the parsed workbook rows.
                                    </p>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {workbookPreview.sheetNames.map((sheetName) => {
                                        const isSelected = sheetName === selectedSheet?.name;

                                        return (
                                            <button
                                                key={sheetName}
                                                type="button"
                                                onClick={() => setSelectedSheetName(sheetName)}
                                                className={
                                                    isSelected
                                                        ? "rounded border border-black bg-black px-3 py-1.5 text-sm text-white"
                                                        : "rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
                                                }
                                            >
                                                {sheetName}
                                            </button>
                                        );
                                    })}
                                </div>

                                {selectedSheet !== null && (
                                    <div className="space-y-4">
                                        <div className="overflow-x-auto rounded border border-gray-200">
                                            <table className="min-w-full border-collapse text-sm">
                                                <tbody>
                                                    {selectedSheet.rows.map((row, rowIndex) => (
                                                        <tr key={rowIndex} className="border-b border-gray-200">
                                                            <td className="w-12 bg-gray-50 px-3 py-2 text-right text-gray-500">
                                                                {rowIndex + 1}
                                                            </td>

                                                            {row.map((cellValue, cellIndex) => {
                                                                const displayValue =
                                                                    cellValue === null ? "-" : String(cellValue);
                                                                const cellTextClassName =
                                                                    cellValue === null
                                                                        ? "text-gray-400"
                                                                        : "text-gray-900";

                                                                return (
                                                                    <td
                                                                        key={cellIndex}
                                                                        className={`min-w-28 px-3 py-2 align-top ${cellTextClassName}`}
                                                                    >
                                                                        {displayValue}
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        <div className="space-y-2">
                                            <h3 className="text-base font-semibold">Detected Header Rows</h3>

                                            {visibleHeaderRowCandidates.length === 0 && (
                                                <p className="text-sm text-gray-600">
                                                    No likely header rows were detected for this sheet.
                                                </p>
                                            )}

                                            {visibleHeaderRowCandidates.length > 0 && (
                                                <div className="space-y-2">
                                                    {visibleHeaderRowCandidates.map((candidate, index) => (
                                                        <div
                                                            key={index}
                                                            className="rounded border border-gray-200 bg-gray-50 p-3 text-sm"
                                                        >
                                                            <p className="font-medium">
                                                                Row {candidate.rowNumber} with {candidate.confidence}%
                                                                confidence
                                                            </p>
                                                            <p className="text-gray-600">
                                                                Region columns: {candidate.startColumnIndex} to{" "}
                                                                {candidate.endColumnIndex}
                                                            </p>
                                                            <p className="text-gray-600">
                                                                Header columns: {candidate.headerStartColumnIndex} to{" "}
                                                                {candidate.endColumnIndex}
                                                            </p>
                                                            <p className="text-gray-600">
                                                                Matched fields: {candidate.matchedFields.join(", ")}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            <h3 className="text-base font-semibold">Detected Table Regions</h3>

                                            {visibleTableRegions.length === 0 && (
                                                <p className="text-sm text-gray-600">
                                                    No likely table regions were detected for this sheet.
                                                </p>
                                            )}

                                            {visibleTableRegions.length > 0 && (
                                                <div className="space-y-2">
                                                    {visibleTableRegions.map((tableRegion, index) => (
                                                        <div
                                                            key={index}
                                                            className="rounded border border-gray-200 bg-gray-50 p-3 text-sm"
                                                        >
                                                            <p className="font-medium">
                                                                Header row {tableRegion.headerRowNumber}
                                                            </p>
                                                            <p className="text-gray-600">
                                                                Table rows: {tableRegion.startRowNumber} to{" "}
                                                                {tableRegion.endRowNumber}
                                                            </p>
                                                            <p className="text-gray-600">
                                                                Table columns: {tableRegion.startColumnIndex} to{" "}
                                                                {tableRegion.endColumnIndex}
                                                            </p>
                                                            <p className="text-gray-600">
                                                                Header columns: {tableRegion.headerStartColumnIndex} to{" "}
                                                                {tableRegion.endColumnIndex}
                                                            </p>
                                                            <p className="text-gray-600">
                                                                Row count: {tableRegion.rowCount}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            <h3 className="text-base font-semibold">Detected Column Mappings</h3>

                                            {visibleTableColumnMappings.length === 0 && (
                                                <p className="text-sm text-gray-600">
                                                    No column mappings were detected for this sheet.
                                                </p>
                                            )}

                                            {visibleTableColumnMappings.length > 0 && (
                                                <div className="space-y-2">
                                                    {visibleTableColumnMappings.map((tableColumnMapping, index) => (
                                                        <div
                                                            key={index}
                                                            className="rounded border border-gray-200 bg-gray-50 p-3 text-sm"
                                                        >
                                                            <p className="font-medium">
                                                                Header row {tableColumnMapping.headerRowNumber}
                                                            </p>
                                                            <p className="text-gray-600">
                                                                Region start column:{" "}
                                                                {tableColumnMapping.startColumnIndex}
                                                            </p>
                                                            <p className="text-gray-600">
                                                                Header start column:{" "}
                                                                {tableColumnMapping.headerStartColumnIndex}
                                                            </p>
                                                            <p className="text-gray-600">
                                                                Exercise column:{" "}
                                                                {formatColumnIndex(tableColumnMapping.columns.exercise)}
                                                            </p>
                                                            <p className="text-gray-600">
                                                                Sets column:{" "}
                                                                {formatColumnIndex(tableColumnMapping.columns.sets)}
                                                            </p>
                                                            <p className="text-gray-600">
                                                                Reps column:{" "}
                                                                {formatColumnIndex(tableColumnMapping.columns.reps)}
                                                            </p>
                                                            <p className="text-gray-600">
                                                                Prescribed load column:{" "}
                                                                {formatColumnIndex(
                                                                    tableColumnMapping.columns.prescribedLoad,
                                                                )}
                                                            </p>
                                                            <p className="text-gray-600">
                                                                Selected load column:{" "}
                                                                {formatColumnIndex(
                                                                    tableColumnMapping.columns.selectedLoad,
                                                                )}
                                                            </p>
                                                            <p className="text-gray-600">
                                                                Prescribed RPE column:{" "}
                                                                {formatColumnIndex(
                                                                    tableColumnMapping.columns.prescribedRpe,
                                                                )}
                                                            </p>
                                                            <p className="text-gray-600">
                                                                Actual RPE column:{" "}
                                                                {formatColumnIndex(
                                                                    tableColumnMapping.columns.actualRpe,
                                                                )}
                                                            </p>
                                                            <p className="text-gray-600">
                                                                Coach notes column:{" "}
                                                                {formatColumnIndex(
                                                                    tableColumnMapping.columns.coachNotes,
                                                                )}
                                                            </p>
                                                            <p className="text-gray-600">
                                                                Athlete notes column:{" "}
                                                                {formatColumnIndex(
                                                                    tableColumnMapping.columns.athleteNotes,
                                                                )}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </section>
            )}
        </main>
    );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
            <p className="text-gray-600">{label}</p>
            <p className="font-medium">{value}</p>
        </div>
    );
}

function ExerciseReviewRows({ exercise }: { exercise: NormalisedSessionPreview["exercises"][number] }) {
    const hasNotes = exercise.coachNotes !== null || exercise.athleteNotes !== null;

    return (
        <>
            <tr className="border-b border-gray-200">
                <td className="px-3 py-2 align-top">
                    <div>
                        <p className="font-medium">{formatTextValue(exercise.exercise)}</p>
                        <p className="text-xs text-gray-500">Row {exercise.sourceRowNumber}</p>
                    </div>
                </td>
                <td className="px-3 py-2 align-top">{formatTextValue(exercise.sets)}</td>
                <td className="px-3 py-2 align-top">{formatTextValue(exercise.reps)}</td>
                <td className="px-3 py-2 align-top">{formatTextValue(exercise.prescribedLoad)}</td>
                <td className="px-3 py-2 align-top">{formatTextValue(exercise.prescribedRpe)}</td>
                <td className="px-3 py-2 align-top">{formatTextValue(exercise.selectedLoad)}</td>
                <td className="px-3 py-2 align-top">{formatTextValue(exercise.actualRpe)}</td>
            </tr>

            {hasNotes && (
                <tr className="border-b border-gray-200 bg-gray-50">
                    <td colSpan={7} className="px-3 py-2 text-sm text-gray-600">
                        {exercise.coachNotes !== null && <p>Coach notes: {exercise.coachNotes}</p>}
                        {exercise.athleteNotes !== null && <p>Athlete notes: {exercise.athleteNotes}</p>}
                    </td>
                </tr>
            )}
        </>
    );
}

function buildReviewSummary(programPreview: ProgramPreview | null, validationIssues: ValidationIssue[]) {
    let totalWeeks = 0;
    let totalSessions = 0;
    let totalExercises = 0;
    let programName = "Not found";
    let sheetName = "Not found";

    if (programPreview !== null) {
        programName = programPreview.programName;

        if (programPreview.blocks.length > 0) {
            sheetName = programPreview.blocks[0].sheetName;
        }

        for (const block of programPreview.blocks) {
            totalWeeks += block.weeks.length;

            for (const week of block.weeks) {
                totalSessions += week.sessions.length;

                for (const session of week.sessions) {
                    totalExercises += session.exercises.length;
                }
            }
        }
    }

    return {
        programName,
        sheetName,
        totalWeeks,
        totalSessions,
        totalExercises,
        totalErrors: countIssuesBySeverity(validationIssues, "error"),
        totalWarnings: countIssuesBySeverity(validationIssues, "warning"),
    };
}

function getSessionKey(session: NormalisedSessionPreview): string {
    return [
        session.sheetName,
        String(session.weekNumber),
        String(session.sessionOrder),
        String(session.headerRowNumber),
        String(session.headerStartColumnIndex),
    ].join("-");
}

function countExercisesInWeek(week: NormalisedWeekPreview): number {
    let exerciseCount = 0;

    for (const session of week.sessions) {
        exerciseCount += session.exercises.length;
    }

    return exerciseCount;
}

function countIssuesBySeverity(validationIssues: ValidationIssue[], severity: "error" | "warning"): number {
    let issueCount = 0;

    for (const issue of validationIssues) {
        if (issue.severity === severity) {
            issueCount += 1;
        }
    }

    return issueCount;
}

function getReviewLevelIssues(validationIssues: ValidationIssue[]): ValidationIssue[] {
    const reviewLevelIssues: ValidationIssue[] = [];

    for (const issue of validationIssues) {
        const isReviewLevelIssue =
            issue.sheetName === null &&
            issue.weekNumber === null &&
            issue.sessionOrder === null &&
            issue.exerciseName === null &&
            issue.sourceRowNumber === null;

        if (isReviewLevelIssue) {
            reviewLevelIssues.push(issue);
        }
    }

    return reviewLevelIssues;
}

function getUnparsedSheetIssues(validationIssues: ValidationIssue[]): ValidationIssue[] {
    const unparsedSheetIssues: ValidationIssue[] = [];

    for (const issue of validationIssues) {
        const isUnparsedSheetIssue =
            issue.sheetName !== null &&
            issue.weekNumber === null &&
            issue.sessionOrder === null &&
            issue.exerciseName === null &&
            issue.sourceRowNumber === null;

        if (isUnparsedSheetIssue) {
            unparsedSheetIssues.push(issue);
        }
    }

    return unparsedSheetIssues;
}

function getGroupedImportWarnings(validationIssues: ValidationIssue[]): GroupedWarningSummary[] {
    const importWarnings = validationIssues.filter((issue) => {
        const isDetailedImportWarning =
            issue.severity === "warning" &&
            issue.sheetName !== null &&
            (issue.weekNumber !== null ||
                issue.sessionOrder !== null ||
                issue.exerciseName !== null ||
                issue.sourceRowNumber !== null);

        return isDetailedImportWarning;
    });

    return getGroupedWarningSummaries(importWarnings);
}

function getGroupedWarningSummaries(validationIssues: ValidationIssue[]): GroupedWarningSummary[] {
    const warningGroups = new Map<string, GroupedWarningSummary>();

    for (const issue of validationIssues) {
        if (issue.severity !== "warning") {
            continue;
        }

        const existingGroup = warningGroups.get(issue.message);

        if (existingGroup === undefined) {
            warningGroups.set(issue.message, {
                message: issue.message,
                count: 1,
                issues: [issue],
            });
            continue;
        }

        existingGroup.count += 1;
        existingGroup.issues.push(issue);
    }

    return Array.from(warningGroups.values());
}

function countIssuesForWeek(
    validationIssues: ValidationIssue[],
    weekNumber: number | null,
    severity: "error" | "warning",
): number {
    let issueCount = 0;

    for (const issue of validationIssues) {
        if (issue.weekNumber === weekNumber && issue.severity === severity) {
            issueCount += 1;
        }
    }

    return issueCount;
}

function countIssuesForSession(
    validationIssues: ValidationIssue[],
    session: NormalisedSessionPreview,
    severity: "error" | "warning",
): number {
    let issueCount = 0;

    for (const issue of validationIssues) {
        const issueMatchesWeek = issue.weekNumber === session.weekNumber;
        const issueMatchesSession = issue.sessionOrder === session.sessionOrder;
        const issueMatchesSeverity = issue.severity === severity;

        if (issueMatchesWeek && issueMatchesSession && issueMatchesSeverity) {
            issueCount += 1;
        }
    }

    return issueCount;
}

function getIssuesForSession(
    validationIssues: ValidationIssue[],
    session: NormalisedSessionPreview,
): ValidationIssue[] {
    const sessionIssues: ValidationIssue[] = [];

    for (const issue of validationIssues) {
        const issueMatchesWeek = issue.weekNumber === session.weekNumber;
        const issueMatchesSession = issue.sessionOrder === session.sessionOrder;

        if (issueMatchesWeek && issueMatchesSession) {
            sessionIssues.push(issue);
        }
    }

    return sessionIssues;
}

function formatColumnIndex(columnIndex: number | null): string {
    if (columnIndex === null) {
        return "Not found";
    }

    return String(columnIndex);
}

function formatTextValue(value: string | null): string {
    if (value === null) {
        return "Not found";
    }

    return value;
}

function formatNumberValue(value: number | null): string {
    if (value === null) {
        return "Not found";
    }

    return String(value);
}

function formatCompactWeekday(value: string | null): string {
    if (value === null) {
        return "Weekday not found";
    }

    return value;
}

function formatSeverity(severity: "error" | "warning"): string {
    if (severity === "error") {
        return "Error";
    }

    return "Warning";
}

interface GroupedWarningSummary {
    message: string;
    count: number;
    issues: ValidationIssue[];
}
