import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import type { HeaderRowCandidate, PreviewCell, SheetPreview, TableRegion, WorkbookPreview } from "@/types/workbook";

export async function POST(request: Request) {
    const formData = await request.formData();
    const uploadedFile = formData.get("file");

    if (!(uploadedFile instanceof File)) {
        return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const arrayBuffer = await uploadedFile.arrayBuffer();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    const preview: WorkbookPreview = {
        sheetNames: [],
        sheets: [],
        headerRowCandidates: [],
        tableRegions: [],
    };

    workbook.eachSheet((sheet) => {
        preview.sheetNames.push(sheet.name);

        const rows: PreviewCell[][] = [];

        sheet.eachRow((row, rowNumber) => {
            if (rowNumber > 20) {
                return;
            }

            const rowValues: PreviewCell[] = [];

            for (let columnNumber = 1; columnNumber <= row.cellCount; columnNumber++) {
                const cell = row.getCell(columnNumber);
                const value = serialiseCellValue(cell.value);

                rowValues.push(value);
            }

            rows.push(rowValues);
        });

        const headerRowCandidates = detectHeaderRows(sheet.name, rows);

        preview.sheets.push({
            name: sheet.name,
            rows,
        });

        for (const headerRowCandidate of headerRowCandidates) {
            preview.headerRowCandidates.push(headerRowCandidate);
        }
    });

    preview.tableRegions = detectTableRegions(preview.sheets, preview.headerRowCandidates);

    return NextResponse.json(preview);
}

function detectHeaderRows(sheetName: string, rows: PreviewCell[][]): HeaderRowCandidate[] {
    const candidates: HeaderRowCandidate[] = [];
    const fieldMatchers = [
        {
            fieldName: "exercise",
            possibleLabels: ["movement", "exercise"],
        },
        {
            fieldName: "sets",
            possibleLabels: ["sets", "set"],
        },
        {
            fieldName: "reps",
            possibleLabels: ["reps", "rep"],
        },
        {
            fieldName: "load",
            possibleLabels: ["load", "weight", "projected load", "selected load"],
        },
        {
            fieldName: "rpe",
            possibleLabels: ["rpe"],
        },
        {
            fieldName: "notes",
            possibleLabels: ["notes", "athlete notes"],
        },
    ];

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        const matchedFields: string[] = [];

        for (const fieldMatcher of fieldMatchers) {
            let fieldWasMatched = false;

            for (const cellValue of row) {
                if (fieldWasMatched) {
                    break;
                }

                if (typeof cellValue !== "string") {
                    continue;
                }

                const normalisedCellValue = cellValue.trim().toLowerCase();

                if (normalisedCellValue === "") {
                    continue;
                }

                for (const possibleLabel of fieldMatcher.possibleLabels) {
                    if (normalisedCellValue.includes(possibleLabel)) {
                        matchedFields.push(fieldMatcher.fieldName);
                        fieldWasMatched = true;
                        break;
                    }
                }
            }
        }

        if (matchedFields.length >= 2) {
            const confidence = Math.round((matchedFields.length / fieldMatchers.length) * 100);

            candidates.push({
                sheetName,
                rowNumber: rowIndex + 1,
                confidence,
                matchedFields,
            });
        }
    }

    return candidates;
}

function detectTableRegions(sheets: SheetPreview[], headerRowCandidates: HeaderRowCandidate[]): TableRegion[] {
    const tableRegions: TableRegion[] = [];
    const consecutiveEmptyRowsLimit = 2;

    for (const sheet of sheets) {
        const sheetHeaderCandidates = headerRowCandidates
            .filter((candidate) => candidate.sheetName === sheet.name)
            .sort((firstCandidate, secondCandidate) => firstCandidate.rowNumber - secondCandidate.rowNumber);

        for (let candidateIndex = 0; candidateIndex < sheetHeaderCandidates.length; candidateIndex++) {
            const headerCandidate = sheetHeaderCandidates[candidateIndex];
            const nextHeaderCandidate = sheetHeaderCandidates[candidateIndex + 1];

            const startRowNumber = headerCandidate.rowNumber + 1;

            if (startRowNumber > sheet.rows.length) {
                continue;
            }

            let endRowNumber = sheet.rows.length;

            if (nextHeaderCandidate !== undefined) {
                endRowNumber = nextHeaderCandidate.rowNumber - 1;
            }

            let consecutiveEmptyRowCount = 0;

            for (let rowNumber = startRowNumber; rowNumber <= endRowNumber; rowNumber++) {
                const rowValues = sheet.rows[rowNumber - 1];

                if (isRowEmpty(rowValues)) {
                    consecutiveEmptyRowCount += 1;
                } else {
                    consecutiveEmptyRowCount = 0;
                }

                if (consecutiveEmptyRowCount >= consecutiveEmptyRowsLimit) {
                    endRowNumber = rowNumber - consecutiveEmptyRowsLimit;
                    break;
                }
            }

            if (endRowNumber < startRowNumber) {
                endRowNumber = startRowNumber - 1;
            }

            const rowCount = endRowNumber - startRowNumber + 1;

            tableRegions.push({
                sheetName: sheet.name,
                headerRowNumber: headerCandidate.rowNumber,
                startRowNumber,
                endRowNumber,
                rowCount: rowCount > 0 ? rowCount : 0,
            });
        }
    }

    return tableRegions;
}

function isRowEmpty(rowValues: PreviewCell[]): boolean {
    for (const cellValue of rowValues) {
        if (cellValue === null) {
            continue;
        }

        if (typeof cellValue === "string" && cellValue.trim() === "") {
            continue;
        }

        return false;
    }

    return true;
}

function serialiseCellValue(value: unknown): PreviewCell {
    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === "string") {
        return value;
    }

    if (typeof value === "number") {
        return value;
    }

    if (typeof value === "boolean") {
        return value;
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    return String(value);
}
