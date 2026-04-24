"use client";

import { useState } from "react";

import type { HeaderRowCandidate, TableColumnMapping, TableRegion, WorkbookPreview } from "@/types/workbook";

export default function UploadPage() {
    const [workbookPreview, setWorkbookPreview] = useState<WorkbookPreview | null>(null);
    const [selectedSheetName, setSelectedSheetName] = useState<string | null>(null);

    async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const formData = new FormData(event.currentTarget);

        const response = await fetch("/api/upload", {
            method: "POST",
            body: formData,
        });

        const preview = (await response.json()) as WorkbookPreview;

        setWorkbookPreview(preview);

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

    if (workbookPreview !== null && selectedSheet !== null) {
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

    return (
        <main className="p-6 space-y-4">
            <h1 className="text-xl font-semibold">Upload Workbook</h1>

            <form onSubmit={handleUpload} className="space-y-3">
                <input type="file" name="file" accept=".xlsx" required />
                <button type="submit" className="ml-2 px-3 py-1 border">
                    Upload
                </button>
            </form>

            {workbookPreview !== null && (
                <section className="space-y-4">
                    <div className="space-y-2">
                        <h2 className="text-lg font-semibold">Workbook Preview</h2>
                        <p className="text-sm text-gray-600">Select a sheet to preview the parsed workbook rows.</p>
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
                                                    const displayValue = cellValue === null ? "-" : String(cellValue);
                                                    const cellTextClassName =
                                                        cellValue === null ? "text-gray-400" : "text-gray-900";

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
                                                    Row {candidate.rowNumber} with {candidate.confidence}% confidence
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
                                                <p className="font-medium">Header row {tableRegion.headerRowNumber}</p>
                                                <p className="text-gray-600">
                                                    Table rows: {tableRegion.startRowNumber} to{" "}
                                                    {tableRegion.endRowNumber}
                                                </p>
                                                <p className="text-gray-600">Row count: {tableRegion.rowCount}</p>
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
                                                    Exercise column:{" "}
                                                    {formatColumnIndex(tableColumnMapping.columns.exercise)}
                                                </p>
                                                <p className="text-gray-600">
                                                    Sets column: {formatColumnIndex(tableColumnMapping.columns.sets)}
                                                </p>
                                                <p className="text-gray-600">
                                                    Reps column: {formatColumnIndex(tableColumnMapping.columns.reps)}
                                                </p>
                                                <p className="text-gray-600">
                                                    Prescribed load column:{" "}
                                                    {formatColumnIndex(tableColumnMapping.columns.prescribedLoad)}
                                                </p>
                                                <p className="text-gray-600">
                                                    Selected load column:{" "}
                                                    {formatColumnIndex(tableColumnMapping.columns.selectedLoad)}
                                                </p>
                                                <p className="text-gray-600">
                                                    Prescribed RPE column:{" "}
                                                    {formatColumnIndex(tableColumnMapping.columns.prescribedRpe)}
                                                </p>
                                                <p className="text-gray-600">
                                                    Actual RPE column:{" "}
                                                    {formatColumnIndex(tableColumnMapping.columns.actualRpe)}
                                                </p>
                                                <p className="text-gray-600">
                                                    Coach notes column:{" "}
                                                    {formatColumnIndex(tableColumnMapping.columns.coachNotes)}
                                                </p>
                                                <p className="text-gray-600">
                                                    Athlete notes column:{" "}
                                                    {formatColumnIndex(tableColumnMapping.columns.athleteNotes)}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </section>
            )}
        </main>
    );
}

function formatColumnIndex(columnIndex: number | null): string {
    if (columnIndex === null) {
        return "Not found";
    }

    return String(columnIndex);
}
