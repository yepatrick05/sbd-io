"use client";

import { useState } from "react";

import type { HeaderRowCandidate, WorkbookPreview } from "@/types/workbook";

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

    if (workbookPreview !== null && selectedSheet !== null) {
        visibleHeaderRowCandidates = workbookPreview.headerRowCandidates.filter((candidate) => {
            return candidate.sheetName === selectedSheet.name;
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
                        <p className="text-sm text-gray-600">Select a sheet to preview its first 20 rows.</p>
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
                        </div>
                    )}
                </section>
            )}
        </main>
    );
}
