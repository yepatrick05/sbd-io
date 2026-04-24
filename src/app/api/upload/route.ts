import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import type {
    HeaderRowCandidate,
    PreviewCell,
    SheetPreview,
    TableColumnMapping,
    TableRegion,
    WorkbookPreview,
} from "@/types/workbook";

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
        tableColumnMappings: [],
    };

    workbook.eachSheet((sheet) => {
        preview.sheetNames.push(sheet.name);

        const rows: PreviewCell[][] = [];

        sheet.eachRow((row, rowNumber) => {
            if (rowNumber > 100) {
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

    preview.tableColumnMappings = detectTableColumnMappings(preview.sheets, preview.tableRegions);

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
    const requiredMatchCount = fieldMatchers.length;

    // Only keep rows that match every expected workout header field.
    // Based on current testing, partial matches are false positives.
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

        if (matchedFields.length === requiredMatchCount) {
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

function detectTableColumnMappings(sheets: SheetPreview[], tableRegions: TableRegion[]): TableColumnMapping[] {
    const tableColumnMappings: TableColumnMapping[] = [];

    for (const tableRegion of tableRegions) {
        const sheet = sheets.find((currentSheet) => currentSheet.name === tableRegion.sheetName);

        if (sheet === undefined) {
            continue;
        }

        const headerRow = sheet.rows[tableRegion.headerRowNumber - 1];

        if (headerRow === undefined) {
            continue;
        }

        const columns: TableColumnMapping["columns"] = {
            exercise: null,
            sets: null,
            reps: null,
            prescribedLoad: null,
            selectedLoad: null,
            prescribedRpe: null,
            actualRpe: null,
            coachNotes: null,
            athleteNotes: null,
        };

        for (let columnIndex = 0; columnIndex < headerRow.length; columnIndex++) {
            const cellValue = headerRow[columnIndex];

            if (typeof cellValue !== "string") {
                continue;
            }

            const normalisedCellValue = cellValue.trim().toLowerCase();

            if (normalisedCellValue === "") {
                continue;
            }

            if (columns.exercise === null) {
                if (normalisedCellValue.includes("exercise") || normalisedCellValue.includes("movement")) {
                    columns.exercise = columnIndex;
                    continue;
                }
            }

            if (columns.sets === null) {
                if (normalisedCellValue === "sets" || normalisedCellValue === "set") {
                    columns.sets = columnIndex;
                    continue;
                }
            }

            if (columns.reps === null) {
                if (normalisedCellValue === "reps" || normalisedCellValue === "rep") {
                    columns.reps = columnIndex;
                    continue;
                }
            }

            if (columns.prescribedLoad === null) {
                if (
                    normalisedCellValue.includes("projected load") ||
                    normalisedCellValue.includes("prescribed load") ||
                    normalisedCellValue.includes("target load") ||
                    normalisedCellValue.includes("recommended load")
                ) {
                    columns.prescribedLoad = columnIndex;
                    continue;
                }
            }

            if (columns.selectedLoad === null) {
                if (
                    normalisedCellValue.includes("selected load") ||
                    normalisedCellValue.includes("actual load") ||
                    normalisedCellValue.includes("chosen load") ||
                    normalisedCellValue.includes("working load") ||
                    normalisedCellValue === "load"
                ) {
                    columns.selectedLoad = columnIndex;
                    continue;
                }
            }

            if (columns.actualRpe === null) {
                if (
                    normalisedCellValue.includes("isrpe") ||
                    normalisedCellValue.includes("is rpe") ||
                    normalisedCellValue.includes("actual rpe") ||
                    normalisedCellValue.includes("selected rpe")
                ) {
                    columns.actualRpe = columnIndex;
                    continue;
                }
            }

            if (columns.prescribedRpe === null) {
                if (
                    normalisedCellValue === "rpe" ||
                    normalisedCellValue.includes("projected rpe") ||
                    normalisedCellValue.includes("prescribed rpe") ||
                    normalisedCellValue.includes("target rpe")
                ) {
                    columns.prescribedRpe = columnIndex;
                    continue;
                }
            }

            if (columns.coachNotes === null) {
                if (
                    normalisedCellValue.includes("coach comments") ||
                    normalisedCellValue.includes("coach notes") ||
                    normalisedCellValue.includes("coach note") ||
                    normalisedCellValue.includes("notes/cues") ||
                    normalisedCellValue.includes("notes / cues") ||
                    normalisedCellValue.includes("coach cues") ||
                    normalisedCellValue === "notes"
                ) {
                    columns.coachNotes = columnIndex;
                    continue;
                }
            }

            if (columns.athleteNotes === null) {
                if (
                    normalisedCellValue.includes("athlete notes") ||
                    normalisedCellValue.includes("athlete note") ||
                    normalisedCellValue.includes("actual notes") ||
                    normalisedCellValue.includes("lifter notes")
                ) {
                    columns.athleteNotes = columnIndex;
                }
            }
        }

        tableColumnMappings.push({
            sheetName: tableRegion.sheetName,
            headerRowNumber: tableRegion.headerRowNumber,
            columns,
        });
    }

    return tableColumnMappings;
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
