"use client";

import { useRouter } from "next/navigation";
import { Children, type ReactNode, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, getButtonClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
    const router = useRouter();
    const [workbookPreview, setWorkbookPreview] = useState<WorkbookPreview | null>(null);
    const [selectedSheetName, setSelectedSheetName] = useState<string | null>(null);
    const [activeParsedBlockSheetName, setActiveParsedBlockSheetName] = useState<string | null>(null);
    const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
    const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
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
        setExpandedSessionKeys([]);
        setShowDebugDetails(false);
        setIsSavingImport(false);
        setActiveParsedBlockSheetName(preview.programPreview?.blocks[0]?.sheetName ?? null);

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
    const reviewLevelIssues = getReviewLevelIssues(validationIssues);
    const unparsedSheetIssues = getUnparsedSheetIssues(validationIssues);
    const groupedImportWarnings = getGroupedImportWarnings(validationIssues);
    const parsedBlocks = programPreview?.blocks ?? [];
    const activeParsedBlock =
        parsedBlocks.find((block) => block.sheetName === activeParsedBlockSheetName) ?? parsedBlocks[0] ?? null;

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

            if (responseBody.programId === undefined) {
                setConfirmMessage("Import was saved, but the program page could not be opened.");
                return;
            }

            router.push(`/programs/${responseBody.programId}`);
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
        <main className="space-y-8 px-4 py-6 sm:px-6 sm:py-8">
            <div className="space-y-3">
                <h1 className="max-w-2xl text-3xl font-semibold tracking-[-0.03em] text-foreground">
                    Upload Workbook
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    Upload an Excel program, review the parsed result, then confirm the import.
                </p>
            </div>

            <form onSubmit={handleUpload}>
                <Card className="space-y-5 p-5">
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Choose a workbook</p>
                        <p className="text-sm text-muted-foreground">
                            `.xlsx` only. The workbook will be parsed for review before anything is saved.
                        </p>
                    </div>

                    <label
                        htmlFor="workbook-file"
                        className="block cursor-pointer rounded-lg border border-dashed border-border bg-surface-muted p-5"
                    >
                        <input
                            id="workbook-file"
                            type="file"
                            name="file"
                            accept=".xlsx"
                            required
                            className="sr-only"
                            onChange={(event) => {
                                const selectedFile = event.currentTarget.files?.[0] ?? null;

                                if (selectedFile === null) {
                                    setSelectedFileName(null);
                                    return;
                                }

                                setSelectedFileName(selectedFile.name);
                            }}
                        />

                        <div className="space-y-3">
                            <span className={getButtonClassName({ variant: "secondary", size: "sm" })}>
                                Choose `.xlsx` file
                            </span>
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-foreground">
                                    {selectedFileName === null ? "No file selected yet" : selectedFileName}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    Coach spreadsheets stay unchanged until you confirm the parsed import.
                                </p>
                            </div>
                        </div>
                    </label>

                    <div className="flex flex-wrap items-center gap-3">
                        <Button type="submit">Parse Workbook</Button>
                        <p className="text-sm text-muted-foreground">
                            Review the parsed weeks, sessions, and warnings before saving.
                        </p>
                    </div>
                </Card>
            </form>

            {workbookPreview !== null && (
                <section className="space-y-6">
                    <Card className="space-y-5 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Badge variant={hasBlockingErrors ? "error" : "completed"}>
                                        {hasBlockingErrors ? "Blocked" : "Ready"}
                                    </Badge>
                                    <p className="text-sm text-muted-foreground">Import Review</p>
                                </div>

                                <div className="space-y-1">
                                    <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground">
                                        {workbookPreview.originalFileName}
                                    </h2>
                                    {programPreview !== null && (
                                        <p className="text-sm text-muted-foreground">
                                            Parsed program: {programPreview.programName}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2 text-sm">
                                <Button
                                    type="button"
                                    onClick={handleConfirmImport}
                                    disabled={hasBlockingErrors || isSavingImport}
                                >
                                    {isSavingImport ? "Saving Import..." : "Confirm Import"}
                                </Button>

                                {confirmMessage !== null && (
                                    <p
                                        className={
                                            hasBlockingErrors || confirmMessage.includes("Failed")
                                                ? "text-danger-foreground"
                                                : "text-muted-foreground"
                                        }
                                    >
                                        {confirmMessage}
                                    </p>
                                )}
                            </div>
                        </div>

                        <Card
                            variant="muted"
                            className={hasBlockingErrors ? "border-[#e6b8b2] p-4" : "border-[#cad9c7] p-4"}
                        >
                            <div className="space-y-1 text-sm">
                                <p className="font-medium text-foreground">
                                    {hasBlockingErrors
                                        ? "Blocking errors were found. Confirm Import is disabled until they are resolved."
                                        : "No blocking errors were found. Confirm Import is available."}
                                </p>
                                <p className="text-muted-foreground">
                                    Errors: {totalErrorCount} | Warnings: {totalWarningCount}
                                </p>
                            </div>
                        </Card>

                        {reviewLevelIssues.length > 0 && (
                            <div className="space-y-3">
                                <p className="text-sm font-medium text-foreground">Import review notes</p>

                                <div className="space-y-2">
                                    {reviewLevelIssues.map((issue, issueIndex) => (
                                        <IssueCard key={issueIndex} issue={issue} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {unparsedSheetIssues.length > 0 && (
                            <div className="space-y-3">
                                <p className="text-sm font-medium text-foreground">
                                    Sheets that were not parsed confidently
                                </p>

                                <div className="space-y-2">
                                    {unparsedSheetIssues.map((issue, issueIndex) => (
                                        <Card key={issueIndex} className="border-[#dccda8] p-4 text-sm">
                                            <p className="font-medium text-foreground">{issue.sheetName}</p>
                                            <p className="mt-1 text-muted-foreground">{issue.message}</p>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        )}

                        {groupedImportWarnings.length > 0 && (
                            <details className="rounded-lg border border-border bg-surface">
                                <summary className="cursor-pointer list-none px-4 py-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="space-y-1">
                                            <p className="font-medium text-foreground">Warnings</p>
                                            <p className="text-sm text-muted-foreground">
                                                {groupedImportWarnings.length} warning type
                                                {groupedImportWarnings.length === 1 ? "" : "s"}
                                            </p>
                                        </div>

                                        <Badge variant="warning">{totalWarningCount} total</Badge>
                                    </div>
                                </summary>

                                <div className="space-y-3 border-t border-border px-4 py-4">
                                    {groupedImportWarnings.map((warningSummary, warningIndex) => (
                                        <Card key={warningIndex} className="border-[#dccda8] p-4 text-sm">
                                            <p className="font-medium text-foreground">{warningSummary.message}</p>
                                            <p className="mt-1 text-muted-foreground">
                                                {warningSummary.count} occurrence
                                                {warningSummary.count === 1 ? "" : "s"}
                                            </p>

                                            <details className="mt-3 rounded-md border border-border bg-surface p-3">
                                                <summary className="cursor-pointer font-medium text-muted-foreground">
                                                    Show warning details
                                                </summary>

                                                <div className="mt-3 space-y-1 text-muted-foreground">
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
                                            </details>
                                        </Card>
                                    ))}
                                </div>
                            </details>
                        )}

                        {programPreview === null && (
                            <p className="text-sm text-muted-foreground">No program preview was created.</p>
                        )}

                        {programPreview !== null && (
                            <details className="rounded-lg border border-border bg-surface">
                                <summary className="cursor-pointer list-none px-4 py-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="space-y-1">
                                            <p className="font-medium text-foreground">Parsed program details</p>
                                            <p className="text-sm text-muted-foreground">
                                                Open one parsed sheet at a time, then expand weeks and sessions only
                                                when you need more detail.
                                            </p>
                                        </div>

                                        <Badge variant="neutral">
                                            {parsedBlocks.length} parsed sheet{parsedBlocks.length === 1 ? "" : "s"}
                                        </Badge>
                                    </div>
                                </summary>

                                <div className="space-y-4 border-t border-border px-4 py-4">
                                    {parsedBlocks.length > 1 && (
                                        <div className="flex flex-wrap gap-2 border-b border-border pb-4">
                                            {parsedBlocks.map((block) => {
                                                const isActiveTab = activeParsedBlock?.sheetName === block.sheetName;

                                                return (
                                                    <button
                                                        key={block.sheetName}
                                                        type="button"
                                                        onClick={() => setActiveParsedBlockSheetName(block.sheetName)}
                                                        className={getButtonClassName({
                                                            variant: isActiveTab ? "primary" : "secondary",
                                                            size: "sm",
                                                        })}
                                                    >
                                                        {block.sheetName}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {activeParsedBlock !== null && (
                                        <div className="space-y-4">
                                            {parsedBlocks.length > 1 && (
                                                <p className="text-sm text-muted-foreground">
                                                    Showing parsed details for {activeParsedBlock.sheetName}.
                                                </p>
                                            )}

                                            {activeParsedBlock.weeks.map((week, weekIndex) => {
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
                                                    <Card key={weekIndex} variant="muted" className="space-y-3 p-4">
                                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                                            <div className="space-y-1">
                                                                <p className="font-medium text-foreground">
                                                                    Week {formatNumberValue(week.weekNumber)}
                                                                </p>
                                                                <p className="text-sm text-muted-foreground">
                                                                    Sessions: {week.sessions.length} | Exercises:{" "}
                                                                    {weekExerciseCount}
                                                                </p>
                                                            </div>

                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <Badge variant={weekErrorCount > 0 ? "error" : "neutral"}>
                                                                    Errors: {weekErrorCount}
                                                                </Badge>
                                                                <Badge
                                                                    variant={
                                                                        weekWarningCount > 0 ? "warning" : "neutral"
                                                                    }
                                                                >
                                                                    Warnings: {weekWarningCount}
                                                                </Badge>
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
                                                                    <Card key={sessionIndex} className="overflow-hidden">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => toggleSession(session)}
                                                                            className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left"
                                                                        >
                                                                            <div className="space-y-1">
                                                                                <p className="font-medium text-foreground">
                                                                                    Session{" "}
                                                                                    {formatNumberValue(
                                                                                        session.sessionOrder,
                                                                                    )}
                                                                                </p>
                                                                                <p className="text-sm text-muted-foreground">
                                                                                    {formatTextValue(session.sessionLabel)}
                                                                                </p>
                                                                            </div>

                                                                            <div className="flex flex-wrap items-center gap-2">
                                                                                <Badge
                                                                                    variant={
                                                                                        sessionErrorCount > 0
                                                                                            ? "error"
                                                                                            : "neutral"
                                                                                    }
                                                                                >
                                                                                    Errors: {sessionErrorCount}
                                                                                </Badge>
                                                                                <Badge
                                                                                    variant={
                                                                                        sessionWarningCount > 0
                                                                                            ? "warning"
                                                                                            : "neutral"
                                                                                    }
                                                                                >
                                                                                    Warnings: {sessionWarningCount}
                                                                                </Badge>
                                                                                <Badge variant="neutral">
                                                                                    {session.exercises.length} exercises
                                                                                </Badge>
                                                                            </div>
                                                                        </button>

                                                                        {sessionIsExpanded && (
                                                                            <div className="space-y-3 border-t border-border px-4 py-4">
                                                                                <div className="space-y-1 text-sm text-muted-foreground">
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
                                                                                        <p className="text-sm font-medium text-foreground">
                                                                                            Errors for this session
                                                                                        </p>

                                                                                        {sessionErrors.map((issue, issueIndex) => (
                                                                                            <IssueCard
                                                                                                key={issueIndex}
                                                                                                issue={issue}
                                                                                            />
                                                                                        ))}
                                                                                    </div>
                                                                                )}

                                                                                {groupedSessionWarnings.length > 0 && (
                                                                                    <details className="rounded-lg border border-border bg-surface p-3">
                                                                                        <summary className="cursor-pointer font-medium text-muted-foreground">
                                                                                            Show warning details
                                                                                        </summary>

                                                                                        <div className="mt-3 space-y-2">
                                                                                            {groupedSessionWarnings
                                                                                                .flatMap((warningSummary) => {
                                                                                                    return warningSummary.issues;
                                                                                                })
                                                                                                .map((issue, issueIndex) => (
                                                                                                    <p
                                                                                                        key={issueIndex}
                                                                                                        className="text-sm text-muted-foreground"
                                                                                                    >
                                                                                                        {issue.message} | Exercise:{" "}
                                                                                                        {formatTextValue(
                                                                                                            issue.exerciseName,
                                                                                                        )}{" "}
                                                                                                        | Source row:{" "}
                                                                                                        {formatNumberValue(
                                                                                                            issue.sourceRowNumber,
                                                                                                        )}
                                                                                                    </p>
                                                                                                ))}
                                                                                        </div>
                                                                                    </details>
                                                                                )}

                                                                                <div className="overflow-x-auto rounded-lg border border-border bg-surface">
                                                                                    <table className="min-w-full border-collapse text-sm">
                                                                                        <thead className="bg-surface-muted">
                                                                                            <tr className="border-b border-border">
                                                                                                <th className="px-3 py-2 text-left font-medium text-foreground">
                                                                                                    Exercise
                                                                                                </th>
                                                                                                <th className="px-3 py-2 text-left font-medium text-foreground">
                                                                                                    Sets
                                                                                                </th>
                                                                                                <th className="px-3 py-2 text-left font-medium text-foreground">
                                                                                                    Reps
                                                                                                </th>
                                                                                                <th className="px-3 py-2 text-left font-medium text-foreground">
                                                                                                    Prescribed Load
                                                                                                </th>
                                                                                                <th className="px-3 py-2 text-left font-medium text-foreground">
                                                                                                    Prescribed RPE
                                                                                                </th>
                                                                                                <th className="px-3 py-2 text-left font-medium text-foreground">
                                                                                                    Selected Load
                                                                                                </th>
                                                                                                <th className="px-3 py-2 text-left font-medium text-foreground">
                                                                                                    Actual RPE
                                                                                                </th>
                                                                                            </tr>
                                                                                        </thead>
                                                                                        <tbody>
                                                                                            {session.exercises.map(
                                                                                                (exercise, exerciseIndex) => (
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
                                                                    </Card>
                                                                );
                                                            })}
                                                        </div>
                                                    </Card>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </details>
                        )}
                    </Card>

                    <details className="rounded-lg border border-border bg-surface">
                        <summary className="cursor-pointer list-none px-4 py-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="space-y-1">
                                    <p className="font-medium text-foreground">Developer details</p>
                                    <p className="text-sm text-muted-foreground">
                                        Workbook rows, detected headers, table regions, and column mappings.
                                    </p>
                                </div>

                                <Badge variant="neutral">Debug</Badge>
                            </div>
                        </summary>

                        <div className="space-y-3 border-t border-border px-4 py-4">
                            <div className="flex flex-wrap items-center gap-3">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowDebugDetails(!showDebugDetails)}
                                >
                                    {showDebugDetails ? "Hide debug details" : "Show debug details"}
                                </Button>
                                <p className="text-sm text-muted-foreground">
                                    Keep this closed during normal imports.
                                </p>
                            </div>

                            {showDebugDetails && (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <h2 className="text-lg font-semibold text-foreground">Parser Debug</h2>
                                        <p className="text-sm text-muted-foreground">
                                            These sections are still available so we can inspect how the workbook was
                                            parsed.
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <h3 className="text-base font-semibold text-foreground">Workbook Preview</h3>
                                        <p className="text-sm text-muted-foreground">
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
                                                    className={getButtonClassName({
                                                        variant: isSelected ? "primary" : "secondary",
                                                        size: "sm",
                                                    })}
                                                >
                                                    {sheetName}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {selectedSheet !== null && (
                                        <div className="space-y-4">
                                            <div className="overflow-x-auto rounded-lg border border-border bg-surface">
                                                <table className="min-w-full border-collapse text-sm">
                                                    <tbody>
                                                        {selectedSheet.rows.map((row, rowIndex) => (
                                                            <tr key={rowIndex} className="border-b border-border">
                                                                <td className="w-12 bg-surface-muted px-3 py-2 text-right text-muted-foreground">
                                                                    {rowIndex + 1}
                                                                </td>

                                                                {row.map((cellValue, cellIndex) => {
                                                                    const displayValue =
                                                                        cellValue === null ? "-" : String(cellValue);
                                                                    const cellTextClassName =
                                                                        cellValue === null
                                                                            ? "text-muted-foreground"
                                                                            : "text-foreground";

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

                                            <DebugCardList
                                                title="Detected Header Rows"
                                                emptyMessage="No likely header rows were detected for this sheet."
                                            >
                                                {visibleHeaderRowCandidates.map((candidate, index) => (
                                                    <Card key={index} variant="muted" className="p-3 text-sm">
                                                        <p className="font-medium text-foreground">
                                                            Row {candidate.rowNumber} with {candidate.confidence}%
                                                            confidence
                                                        </p>
                                                        <p className="text-muted-foreground">
                                                            Region columns: {candidate.startColumnIndex} to{" "}
                                                            {candidate.endColumnIndex}
                                                        </p>
                                                        <p className="text-muted-foreground">
                                                            Header columns: {candidate.headerStartColumnIndex} to{" "}
                                                            {candidate.endColumnIndex}
                                                        </p>
                                                        <p className="text-muted-foreground">
                                                            Matched fields: {candidate.matchedFields.join(", ")}
                                                        </p>
                                                    </Card>
                                                ))}
                                            </DebugCardList>

                                            <DebugCardList
                                                title="Detected Table Regions"
                                                emptyMessage="No likely table regions were detected for this sheet."
                                            >
                                                {visibleTableRegions.map((tableRegion, index) => (
                                                    <Card key={index} variant="muted" className="p-3 text-sm">
                                                        <p className="font-medium text-foreground">
                                                            Header row {tableRegion.headerRowNumber}
                                                        </p>
                                                        <p className="text-muted-foreground">
                                                            Table rows: {tableRegion.startRowNumber} to{" "}
                                                            {tableRegion.endRowNumber}
                                                        </p>
                                                        <p className="text-muted-foreground">
                                                            Table columns: {tableRegion.startColumnIndex} to{" "}
                                                            {tableRegion.endColumnIndex}
                                                        </p>
                                                        <p className="text-muted-foreground">
                                                            Header columns: {tableRegion.headerStartColumnIndex} to{" "}
                                                            {tableRegion.endColumnIndex}
                                                        </p>
                                                        <p className="text-muted-foreground">
                                                            Row count: {tableRegion.rowCount}
                                                        </p>
                                                    </Card>
                                                ))}
                                            </DebugCardList>

                                            <DebugCardList
                                                title="Detected Column Mappings"
                                                emptyMessage="No column mappings were detected for this sheet."
                                            >
                                                {visibleTableColumnMappings.map((tableColumnMapping, index) => (
                                                    <Card key={index} variant="muted" className="p-3 text-sm">
                                                        <p className="font-medium text-foreground">
                                                            Header row {tableColumnMapping.headerRowNumber}
                                                        </p>
                                                        <p className="text-muted-foreground">
                                                            Region start column: {tableColumnMapping.startColumnIndex}
                                                        </p>
                                                        <p className="text-muted-foreground">
                                                            Header start column:{" "}
                                                            {tableColumnMapping.headerStartColumnIndex}
                                                        </p>
                                                        <p className="text-muted-foreground">
                                                            Exercise column:{" "}
                                                            {formatColumnIndex(tableColumnMapping.columns.exercise)}
                                                        </p>
                                                        <p className="text-muted-foreground">
                                                            Sets column:{" "}
                                                            {formatColumnIndex(tableColumnMapping.columns.sets)}
                                                        </p>
                                                        <p className="text-muted-foreground">
                                                            Reps column:{" "}
                                                            {formatColumnIndex(tableColumnMapping.columns.reps)}
                                                        </p>
                                                        <p className="text-muted-foreground">
                                                            Prescribed load column:{" "}
                                                            {formatColumnIndex(tableColumnMapping.columns.prescribedLoad)}
                                                        </p>
                                                        <p className="text-muted-foreground">
                                                            Selected load column:{" "}
                                                            {formatColumnIndex(tableColumnMapping.columns.selectedLoad)}
                                                        </p>
                                                        <p className="text-muted-foreground">
                                                            Prescribed RPE column:{" "}
                                                            {formatColumnIndex(tableColumnMapping.columns.prescribedRpe)}
                                                        </p>
                                                        <p className="text-muted-foreground">
                                                            Actual RPE column:{" "}
                                                            {formatColumnIndex(tableColumnMapping.columns.actualRpe)}
                                                        </p>
                                                        <p className="text-muted-foreground">
                                                            Coach notes column:{" "}
                                                            {formatColumnIndex(tableColumnMapping.columns.coachNotes)}
                                                        </p>
                                                        <p className="text-muted-foreground">
                                                            Athlete notes column:{" "}
                                                            {formatColumnIndex(tableColumnMapping.columns.athleteNotes)}
                                                        </p>
                                                    </Card>
                                                ))}
                                            </DebugCardList>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </details>
                </section>
            )}
        </main>
    );
}

function ExerciseReviewRows({ exercise }: { exercise: NormalisedSessionPreview["exercises"][number] }) {
    const hasNotes = exercise.coachNotes !== null || exercise.athleteNotes !== null;

    return (
        <>
            <tr className="border-b border-border">
                <td className="px-3 py-2 align-top text-foreground">
                    <div>
                        <p className="font-medium">{formatTextValue(exercise.exercise)}</p>
                        <p className="text-xs text-muted-foreground">Row {exercise.sourceRowNumber}</p>
                    </div>
                </td>
                <td className="px-3 py-2 align-top text-muted-foreground">{formatTextValue(exercise.sets)}</td>
                <td className="px-3 py-2 align-top text-muted-foreground">{formatTextValue(exercise.reps)}</td>
                <td className="px-3 py-2 align-top text-muted-foreground">
                    {formatTextValue(exercise.prescribedLoad)}
                </td>
                <td className="px-3 py-2 align-top text-muted-foreground">
                    {formatTextValue(exercise.prescribedRpe)}
                </td>
                <td className="px-3 py-2 align-top text-muted-foreground">
                    {formatTextValue(exercise.selectedLoad)}
                </td>
                <td className="px-3 py-2 align-top text-muted-foreground">{formatTextValue(exercise.actualRpe)}</td>
            </tr>

            {hasNotes && (
                <tr className="border-b border-border bg-surface-muted">
                    <td colSpan={7} className="px-3 py-2 text-sm text-muted-foreground">
                        {exercise.coachNotes !== null && <p>Coach notes: {exercise.coachNotes}</p>}
                        {exercise.athleteNotes !== null && <p>Athlete notes: {exercise.athleteNotes}</p>}
                    </td>
                </tr>
            )}
        </>
    );
}

function IssueCard({ issue }: { issue: ValidationIssue }) {
    return (
        <Card
            className={issue.severity === "error" ? "border-[#e6b8b2] p-4 text-sm" : "border-[#dccda8] p-4 text-sm"}
        >
            <p className="font-medium text-foreground">
                {formatSeverity(issue.severity)}: {issue.message}
            </p>
            {(issue.exerciseName !== null || issue.sourceRowNumber !== null) && (
                <p className="mt-1 text-muted-foreground">
                    Exercise: {formatTextValue(issue.exerciseName)} | Source row:{" "}
                    {formatNumberValue(issue.sourceRowNumber)}
                </p>
            )}
        </Card>
    );
}

function DebugCardList({
    title,
    emptyMessage,
    children,
}: {
    title: string;
    emptyMessage: string;
    children: ReactNode;
}) {
    const childCount = Children.count(children);

    return (
        <div className="space-y-2">
            <h3 className="text-base font-semibold text-foreground">{title}</h3>

            {childCount === 0 && <p className="text-sm text-muted-foreground">{emptyMessage}</p>}

            {childCount > 0 && <div className="space-y-2">{children}</div>}
        </div>
    );
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
