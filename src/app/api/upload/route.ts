import ExcelJS from "exceljs";
import type { Cell } from "exceljs";
import { NextResponse } from "next/server";

import type {
    ExerciseRow,
    HeaderRowCandidate,
    NormalisedBlockPreview,
    NormalisedSessionPreview,
    PreviewCell,
    ProgramPreview,
    SheetPreview,
    SessionPreview,
    TableColumnMapping,
    TableContext,
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
        exerciseRows: [],
        tableContexts: [],
        sessionPreviews: [],
        programPreview: null,
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
                const value = serialiseCell(cell);

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

    preview.exerciseRows = extractExerciseRows(preview.sheets, preview.tableRegions, preview.tableColumnMappings);

    preview.tableContexts = detectTableContexts(preview.sheets, preview.tableRegions);

    preview.sessionPreviews = buildSessionPreviews(preview.tableContexts, preview.exerciseRows);

    // Convert session previews into a cleaner program/block/week/session structure.
    preview.programPreview = buildProgramPreview(uploadedFile.name, preview.sessionPreviews);

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

function extractExerciseRows(
    sheets: SheetPreview[],
    tableRegions: TableRegion[],
    tableColumnMappings: TableColumnMapping[],
): ExerciseRow[] {
    const exerciseRows: ExerciseRow[] = [];

    for (const tableRegion of tableRegions) {
        const sheet = sheets.find((currentSheet) => currentSheet.name === tableRegion.sheetName);

        if (sheet === undefined) {
            continue;
        }

        const tableColumnMapping = tableColumnMappings.find((currentMapping) => {
            return (
                currentMapping.sheetName === tableRegion.sheetName &&
                currentMapping.headerRowNumber === tableRegion.headerRowNumber
            );
        });

        if (tableColumnMapping === undefined) {
            continue;
        }

        for (let rowNumber = tableRegion.startRowNumber; rowNumber <= tableRegion.endRowNumber; rowNumber++) {
            const rowValues = sheet.rows[rowNumber - 1];

            if (rowValues === undefined) {
                continue;
            }

            const exercise = getMappedCellValue(rowValues, tableColumnMapping.columns.exercise);

            if (exercise === null) {
                continue;
            }

            exerciseRows.push({
                sheetName: tableRegion.sheetName,
                headerRowNumber: tableRegion.headerRowNumber,
                sourceRowNumber: rowNumber,
                exercise,
                sets: getMappedCellValue(rowValues, tableColumnMapping.columns.sets),
                reps: getMappedCellValue(rowValues, tableColumnMapping.columns.reps),
                prescribedLoad: getMappedCellValue(rowValues, tableColumnMapping.columns.prescribedLoad),
                prescribedRpe: getMappedCellValue(rowValues, tableColumnMapping.columns.prescribedRpe),
                coachNotes: getMappedCellValue(rowValues, tableColumnMapping.columns.coachNotes),
                selectedLoad: getMappedCellValue(rowValues, tableColumnMapping.columns.selectedLoad),
                actualRpe: getMappedCellValue(rowValues, tableColumnMapping.columns.actualRpe),
                athleteNotes: getMappedCellValue(rowValues, tableColumnMapping.columns.athleteNotes),
            });
        }
    }

    return exerciseRows;
}

function detectTableContexts(sheets: SheetPreview[], tableRegions: TableRegion[]): TableContext[] {
    const tableContexts: TableContext[] = [];

    for (const tableRegion of tableRegions) {
        const sheet = sheets.find((currentSheet) => currentSheet.name === tableRegion.sheetName);

        if (sheet === undefined) {
            continue;
        }

        let weekNumber: number | null = null;
        let sessionOrder: number | null = null;
        let sessionLabel: string | null = null;
        let intendedWeekday: string | null = null;

        for (let rowNumber = tableRegion.headerRowNumber - 1; rowNumber >= 1; rowNumber--) {
            const rowValues = sheet.rows[rowNumber - 1];

            if (rowValues === undefined) {
                continue;
            }

            for (const cellValue of rowValues) {
                if (typeof cellValue !== "string") {
                    continue;
                }

                const trimmedCellValue = cellValue.trim();

                if (trimmedCellValue === "") {
                    continue;
                }

                if (weekNumber === null) {
                    const detectedWeekNumber = parseWeekNumber(trimmedCellValue);

                    if (detectedWeekNumber !== null) {
                        weekNumber = detectedWeekNumber;
                    }
                }

                if (sessionOrder === null || sessionLabel === null) {
                    const detectedSessionContext = parseSessionLabel(trimmedCellValue);

                    if (detectedSessionContext !== null) {
                        sessionOrder = detectedSessionContext.sessionOrder;
                        sessionLabel = detectedSessionContext.sessionLabel;
                        intendedWeekday = detectedSessionContext.intendedWeekday;
                    }
                }
            }

            if (weekNumber !== null && sessionLabel !== null) {
                break;
            }
        }

        tableContexts.push({
            sheetName: tableRegion.sheetName,
            headerRowNumber: tableRegion.headerRowNumber,
            weekNumber,
            sessionOrder,
            sessionLabel,
            intendedWeekday,
        });
    }

    return tableContexts;
}

function buildSessionPreviews(tableContexts: TableContext[], exerciseRows: ExerciseRow[]): SessionPreview[] {
    const sessionPreviews: SessionPreview[] = [];

    for (const tableContext of tableContexts) {
        const exercises = exerciseRows.filter((exerciseRow) => {
            return (
                exerciseRow.sheetName === tableContext.sheetName &&
                exerciseRow.headerRowNumber === tableContext.headerRowNumber
            );
        });

        sessionPreviews.push({
            sheetName: tableContext.sheetName,
            headerRowNumber: tableContext.headerRowNumber,
            weekNumber: tableContext.weekNumber,
            sessionOrder: tableContext.sessionOrder,
            sessionLabel: tableContext.sessionLabel,
            intendedWeekday: tableContext.intendedWeekday,
            exercises,
        });
    }

    sessionPreviews.sort((firstSession, secondSession) => {
        const weekComparison = compareNullableNumber(firstSession.weekNumber, secondSession.weekNumber);

        if (weekComparison !== 0) {
            return weekComparison;
        }

        const sessionComparison = compareNullableNumber(firstSession.sessionOrder, secondSession.sessionOrder);

        if (sessionComparison !== 0) {
            return sessionComparison;
        }

        return firstSession.headerRowNumber - secondSession.headerRowNumber;
    });

    return sessionPreviews;
}

function buildProgramPreview(fileName: string, sessionPreviews: SessionPreview[]): ProgramPreview {
    const blocksBySheetName = new Map<string, NormalisedBlockPreview>();

    for (const sessionPreview of sessionPreviews) {
        let block = blocksBySheetName.get(sessionPreview.sheetName);

        if (block === undefined) {
            block = {
                sheetName: sessionPreview.sheetName,
                blockName: sessionPreview.sheetName,
                weeks: [],
            };

            blocksBySheetName.set(sessionPreview.sheetName, block);
        }

        let week = block.weeks.find((currentWeek) => currentWeek.weekNumber === sessionPreview.weekNumber);

        if (week === undefined) {
            week = {
                weekNumber: sessionPreview.weekNumber,
                sessions: [],
            };

            block.weeks.push(week);
        }

        const normalisedSession: NormalisedSessionPreview = {
            sheetName: sessionPreview.sheetName,
            headerRowNumber: sessionPreview.headerRowNumber,
            weekNumber: sessionPreview.weekNumber,
            sessionOrder: sessionPreview.sessionOrder,
            sessionLabel: sessionPreview.sessionLabel,
            intendedWeekday: sessionPreview.intendedWeekday,
            exercises: sessionPreview.exercises,
        };

        week.sessions.push(normalisedSession);
    }

    const blocks = Array.from(blocksBySheetName.values());

    for (const block of blocks) {
        block.weeks.sort((firstWeek, secondWeek) => {
            return compareNullableNumber(firstWeek.weekNumber, secondWeek.weekNumber);
        });

        for (const week of block.weeks) {
            week.sessions.sort((firstSession, secondSession) => {
                const sessionComparison = compareNullableNumber(firstSession.sessionOrder, secondSession.sessionOrder);

                if (sessionComparison !== 0) {
                    return sessionComparison;
                }

                return firstSession.headerRowNumber - secondSession.headerRowNumber;
            });
        }
    }

    return {
        programName: getProgramName(fileName),
        blocks,
    };
}

function getProgramName(fileName: string): string {
    if (fileName.endsWith(".xlsx")) {
        return fileName.slice(0, -5);
    }

    return fileName;
}

function compareNullableNumber(firstValue: number | null, secondValue: number | null): number {
    if (firstValue === null && secondValue === null) {
        return 0;
    }

    if (firstValue === null) {
        return 1;
    }

    if (secondValue === null) {
        return -1;
    }

    return firstValue - secondValue;
}

function parseWeekNumber(value: string): number | null {
    const weekMatch = value.match(/^week\s+(\d+)$/i);

    if (weekMatch === null) {
        return null;
    }

    return Number(weekMatch[1]);
}

function parseSessionLabel(
    value: string,
): { sessionOrder: number | null; sessionLabel: string; intendedWeekday: string | null } | null {
    const dayMatch = value.match(/^day\s+(\d+)\s*-\s*(.+)$/i);

    if (dayMatch !== null) {
        return {
            sessionOrder: Number(dayMatch[1]),
            sessionLabel: value,
            intendedWeekday: dayMatch[2].trim(),
        };
    }

    const sessionMatch = value.match(/^session\s+(\d+)\s*-\s*(.+)$/i);

    if (sessionMatch !== null) {
        return {
            sessionOrder: Number(sessionMatch[1]),
            sessionLabel: value,
            intendedWeekday: null,
        };
    }

    return null;
}

function getMappedCellValue(rowValues: PreviewCell[], columnIndex: number | null): string | null {
    if (columnIndex === null) {
        return null;
    }

    const cellValue = rowValues[columnIndex];

    if (cellValue === null || cellValue === undefined) {
        return null;
    }

    const stringValue = String(cellValue).trim();

    if (stringValue === "") {
        return null;
    }

    return stringValue;
}

function serialiseCell(cell: Cell): PreviewCell {
    const value = cell.value;

    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === "number") {
        if (typeof cell.numFmt === "string" && cell.numFmt.includes("%")) {
            return formatPercentageValue(value);
        }

        return value;
    }

    if (typeof value === "string") {
        return value;
    }

    if (typeof value === "boolean") {
        return value;
    }

    if (value instanceof Date) {
        if (typeof cell.numFmt === "string" && isMonthDayFormat(cell.numFmt)) {
            return formatMonthDayValue(value);
        }

        return value.toISOString();
    }

    const cellText = getCellText(cell);

    if (cellText !== null && cellText.trim() !== "") {
        return cellText.trim();
    }

    return String(value);
}

function getCellText(cell: Cell): string | null {
    try {
        if (cell.text === undefined || cell.text === null) {
            return null;
        }

        return cell.text;
    } catch {
        return null;
    }
}

function formatPercentageValue(value: number): string {
    const percentageValue = value * 100;

    if (Number.isInteger(percentageValue)) {
        return `${percentageValue}%`;
    }

    return `${percentageValue.toFixed(2).replace(/\.?0+$/, "")}%`;
}

function isMonthDayFormat(format: string): boolean {
    const normalisedFormat = format.toLowerCase();

    if (normalisedFormat === "m-d" || normalisedFormat === "m/d") {
        return true;
    }

    if (normalisedFormat === "mm-dd" || normalisedFormat === "mm/dd") {
        return true;
    }

    return false;
}

function formatMonthDayValue(value: Date): string {
    const month = value.getUTCMonth() + 1;
    const day = value.getUTCDate();

    return `${month}-${day}`;
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
