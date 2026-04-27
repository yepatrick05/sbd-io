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
    ValidationIssue,
    WorkbookPreview,
} from "@/types/workbook";

const PREVIEW_ROW_LIMIT = 100;
const HEADER_COLUMN_GAP_LIMIT = 2;
const CONSECUTIVE_EMPTY_ROW_LIMIT = 2;

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
        validationIssues: [],
    };

    workbook.eachSheet((sheet) => {
        preview.sheetNames.push(sheet.name);

        const rows: PreviewCell[][] = [];

        sheet.eachRow((row, rowNumber) => {
            if (rowNumber > PREVIEW_ROW_LIMIT) {
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

        preview.sheets.push({
            name: sheet.name,
            rows,
        });
    });

    preview.headerRowCandidates = detectHeaderRows(preview.sheets);
    preview.tableRegions = detectTableRegions(preview.sheets, preview.headerRowCandidates);
    preview.tableColumnMappings = detectTableColumnMappings(preview.sheets, preview.tableRegions);
    preview.exerciseRows = extractExerciseRows(preview.sheets, preview.tableRegions, preview.tableColumnMappings);
    preview.tableContexts = detectTableContexts(preview.sheets, preview.tableRegions);
    preview.sessionPreviews = buildSessionPreviews(preview.tableContexts, preview.exerciseRows);
    preview.programPreview = buildProgramPreview(uploadedFile.name, preview.sessionPreviews);
    preview.validationIssues = validateProgramPreview(preview.programPreview);

    return NextResponse.json(preview);
}

function detectHeaderRows(sheets: SheetPreview[]): HeaderRowCandidate[] {
    const headerRowCandidates: HeaderRowCandidate[] = [];

    for (const sheet of sheets) {
        for (let rowIndex = 0; rowIndex < sheet.rows.length; rowIndex++) {
            const rowValues = sheet.rows[rowIndex];
            const rowNumber = rowIndex + 1;
            const regionCandidates = detectHeaderRegionsInRow(sheet.name, rowValues, rowNumber);

            for (const regionCandidate of regionCandidates) {
                headerRowCandidates.push(regionCandidate);
            }
        }
    }

    return headerRowCandidates;
}

function detectHeaderRegionsInRow(
    sheetName: string,
    rowValues: PreviewCell[],
    rowNumber: number,
): HeaderRowCandidate[] {
    const headerRowCandidates: HeaderRowCandidate[] = [];
    const matchedHeaderCells: { columnIndex: number; fieldName: string }[] = [];
    let exerciseHeaderColumnIndex: number | null = null;

    for (let columnIndex = 0; columnIndex < rowValues.length; columnIndex++) {
        const fieldName = getHeaderFieldName(rowValues[columnIndex]);

        if (fieldName === null) {
            continue;
        }

        if (fieldName === "exercise") {
            if (exerciseHeaderColumnIndex === null) {
                exerciseHeaderColumnIndex = columnIndex;
            }

            continue;
        }

        matchedHeaderCells.push({
            columnIndex,
            fieldName,
        });
    }

    if (matchedHeaderCells.length === 0) {
        return headerRowCandidates;
    }

    const headerGroups = splitHeaderCellsIntoGroups(matchedHeaderCells);

    for (const headerGroup of headerGroups) {
        if (!isValidHeaderGroup(headerGroup)) {
            continue;
        }

        let startColumnIndex = headerGroup.startColumnIndex;

        if (exerciseHeaderColumnIndex !== null && exerciseHeaderColumnIndex < headerGroup.startColumnIndex) {
            startColumnIndex = exerciseHeaderColumnIndex;
        }

        const matchedFields = [...headerGroup.matchedFields];

        if (startColumnIndex !== headerGroup.startColumnIndex) {
            matchedFields.unshift("exercise");
        }

        headerRowCandidates.push({
            sheetName,
            rowNumber,
            confidence: 100,
            matchedFields,
            startColumnIndex,
            endColumnIndex: headerGroup.endColumnIndex,
            headerStartColumnIndex: headerGroup.startColumnIndex,
        });
    }

    return headerRowCandidates;
}

function splitHeaderCellsIntoGroups(
    matchedHeaderCells: { columnIndex: number; fieldName: string }[],
): { startColumnIndex: number; endColumnIndex: number; matchedFields: string[] }[] {
    const headerGroups: { startColumnIndex: number; endColumnIndex: number; matchedFields: string[] }[] = [];
    let currentGroup: { startColumnIndex: number; endColumnIndex: number; matchedFields: string[] } | null = null;

    for (const matchedHeaderCell of matchedHeaderCells) {
        if (currentGroup === null) {
            currentGroup = {
                startColumnIndex: matchedHeaderCell.columnIndex,
                endColumnIndex: matchedHeaderCell.columnIndex,
                matchedFields: [matchedHeaderCell.fieldName],
            };

            continue;
        }

        const columnGap = matchedHeaderCell.columnIndex - currentGroup.endColumnIndex;
        const fieldAlreadySeen = currentGroup.matchedFields.includes(matchedHeaderCell.fieldName);

        if (columnGap <= HEADER_COLUMN_GAP_LIMIT && !fieldAlreadySeen) {
            currentGroup.endColumnIndex = matchedHeaderCell.columnIndex;
            currentGroup.matchedFields.push(matchedHeaderCell.fieldName);
            continue;
        }

        headerGroups.push(currentGroup);

        currentGroup = {
            startColumnIndex: matchedHeaderCell.columnIndex,
            endColumnIndex: matchedHeaderCell.columnIndex,
            matchedFields: [matchedHeaderCell.fieldName],
        };
    }

    if (currentGroup !== null) {
        headerGroups.push(currentGroup);
    }

    return headerGroups;
}

function isValidHeaderGroup(headerGroup: { matchedFields: string[] }): boolean {
    const hasSets = headerGroup.matchedFields.includes("sets");
    const hasReps = headerGroup.matchedFields.includes("reps");
    const hasEnoughFields = headerGroup.matchedFields.length >= 5;

    return hasSets && hasReps && hasEnoughFields;
}

function detectTableRegions(sheets: SheetPreview[], headerRowCandidates: HeaderRowCandidate[]): TableRegion[] {
    const tableRegions: TableRegion[] = [];

    for (const sheet of sheets) {
        const sheetHeaderRowCandidates = headerRowCandidates
            .filter((candidate) => candidate.sheetName === sheet.name)
            .sort((firstCandidate, secondCandidate) => {
                if (firstCandidate.rowNumber !== secondCandidate.rowNumber) {
                    return firstCandidate.rowNumber - secondCandidate.rowNumber;
                }

                return firstCandidate.headerStartColumnIndex - secondCandidate.headerStartColumnIndex;
            });

        for (let candidateIndex = 0; candidateIndex < sheetHeaderRowCandidates.length; candidateIndex++) {
            const headerRowCandidate = sheetHeaderRowCandidates[candidateIndex];
            const startRowNumber = headerRowCandidate.rowNumber + 1;

            if (startRowNumber > sheet.rows.length) {
                continue;
            }

            let endRowNumber = sheet.rows.length;
            const nextHeaderRowNumber = findNextHeaderRowNumberForRegion(sheetHeaderRowCandidates, candidateIndex);

            if (nextHeaderRowNumber !== null) {
                endRowNumber = nextHeaderRowNumber - 1;
            }

            let consecutiveEmptyRowCount = 0;

            for (let rowNumber = startRowNumber; rowNumber <= endRowNumber; rowNumber++) {
                const rowValues = sheet.rows[rowNumber - 1];
                const rowIsEmpty = isRegionRowEmpty(
                    rowValues,
                    headerRowCandidate.startColumnIndex,
                    headerRowCandidate.endColumnIndex,
                );

                if (rowIsEmpty) {
                    consecutiveEmptyRowCount += 1;
                } else {
                    consecutiveEmptyRowCount = 0;
                }

                if (consecutiveEmptyRowCount >= CONSECUTIVE_EMPTY_ROW_LIMIT) {
                    endRowNumber = rowNumber - CONSECUTIVE_EMPTY_ROW_LIMIT;
                    break;
                }
            }

            if (endRowNumber < startRowNumber) {
                endRowNumber = startRowNumber - 1;
            }

            const rowCount = endRowNumber - startRowNumber + 1;

            tableRegions.push({
                sheetName: sheet.name,
                headerRowNumber: headerRowCandidate.rowNumber,
                startRowNumber,
                endRowNumber,
                startColumnIndex: headerRowCandidate.startColumnIndex,
                endColumnIndex: headerRowCandidate.endColumnIndex,
                headerStartColumnIndex: headerRowCandidate.headerStartColumnIndex,
                rowCount: rowCount > 0 ? rowCount : 0,
            });
        }
    }

    return tableRegions;
}

function findNextHeaderRowNumberForRegion(
    headerRowCandidates: HeaderRowCandidate[],
    currentCandidateIndex: number,
): number | null {
    const currentCandidate = headerRowCandidates[currentCandidateIndex];

    for (
        let nextCandidateIndex = currentCandidateIndex + 1;
        nextCandidateIndex < headerRowCandidates.length;
        nextCandidateIndex++
    ) {
        const nextCandidate = headerRowCandidates[nextCandidateIndex];

        if (
            rangesOverlap(
                currentCandidate.headerStartColumnIndex,
                currentCandidate.endColumnIndex,
                nextCandidate.headerStartColumnIndex,
                nextCandidate.endColumnIndex,
            )
        ) {
            return nextCandidate.rowNumber;
        }
    }

    return null;
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

        const exerciseColumnIndex = findMatchingHeaderColumn(
            headerRow,
            tableRegion.startColumnIndex,
            tableRegion.headerStartColumnIndex,
            "exercise",
        );

        const setsColumnIndex = findMatchingHeaderColumn(
            headerRow,
            tableRegion.headerStartColumnIndex,
            tableRegion.endColumnIndex,
            "sets",
        );
        const repsColumnIndex = findMatchingHeaderColumn(
            headerRow,
            tableRegion.headerStartColumnIndex,
            tableRegion.endColumnIndex,
            "reps",
        );
        const prescribedLoadColumnIndex = findMatchingHeaderColumn(
            headerRow,
            tableRegion.headerStartColumnIndex,
            tableRegion.endColumnIndex,
            "prescribedLoad",
        );
        const selectedLoadColumnIndex = findMatchingHeaderColumn(
            headerRow,
            tableRegion.headerStartColumnIndex,
            tableRegion.endColumnIndex,
            "selectedLoad",
        );
        const prescribedRpeColumnIndex = findMatchingHeaderColumn(
            headerRow,
            tableRegion.headerStartColumnIndex,
            tableRegion.endColumnIndex,
            "prescribedRpe",
        );
        const actualRpeColumnIndex = findMatchingHeaderColumn(
            headerRow,
            tableRegion.headerStartColumnIndex,
            tableRegion.endColumnIndex,
            "actualRpe",
        );
        const coachNotesColumnIndex = findMatchingHeaderColumn(
            headerRow,
            tableRegion.headerStartColumnIndex,
            tableRegion.endColumnIndex,
            "coachNotes",
        );
        const athleteNotesColumnIndex = findMatchingHeaderColumn(
            headerRow,
            tableRegion.headerStartColumnIndex,
            tableRegion.endColumnIndex,
            "athleteNotes",
        );

        tableColumnMappings.push({
            sheetName: tableRegion.sheetName,
            headerRowNumber: tableRegion.headerRowNumber,
            startColumnIndex: tableRegion.startColumnIndex,
            headerStartColumnIndex: tableRegion.headerStartColumnIndex,
            columns: {
                exercise: getRelativeColumnIndex(tableRegion.startColumnIndex, exerciseColumnIndex),
                sets: getRelativeColumnIndex(tableRegion.startColumnIndex, setsColumnIndex),
                reps: getRelativeColumnIndex(tableRegion.startColumnIndex, repsColumnIndex),
                prescribedLoad: getRelativeColumnIndex(tableRegion.startColumnIndex, prescribedLoadColumnIndex),
                selectedLoad: getRelativeColumnIndex(tableRegion.startColumnIndex, selectedLoadColumnIndex),
                prescribedRpe: getRelativeColumnIndex(tableRegion.startColumnIndex, prescribedRpeColumnIndex),
                actualRpe: getRelativeColumnIndex(tableRegion.startColumnIndex, actualRpeColumnIndex),
                coachNotes: getRelativeColumnIndex(tableRegion.startColumnIndex, coachNotesColumnIndex),
                athleteNotes: getRelativeColumnIndex(tableRegion.startColumnIndex, athleteNotesColumnIndex),
            },
        });
    }

    return tableColumnMappings;
}

function findMatchingHeaderColumn(
    headerRow: PreviewCell[],
    startColumnIndex: number,
    endColumnIndex: number,
    fieldName: string,
): number | null {
    for (let columnIndex = startColumnIndex; columnIndex <= endColumnIndex; columnIndex++) {
        if (headerMatchesField(headerRow[columnIndex], fieldName)) {
            return columnIndex;
        }
    }

    return null;
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
                currentMapping.headerRowNumber === tableRegion.headerRowNumber &&
                currentMapping.headerStartColumnIndex === tableRegion.headerStartColumnIndex
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

            const exercise = getMappedCellValue(rowValues, tableRegion, tableColumnMapping.columns.exercise);

            if (exercise === null) {
                continue;
            }

            exerciseRows.push({
                sheetName: tableRegion.sheetName,
                headerRowNumber: tableRegion.headerRowNumber,
                startColumnIndex: tableRegion.startColumnIndex,
                headerStartColumnIndex: tableRegion.headerStartColumnIndex,
                sourceRowNumber: rowNumber,
                exercise,
                sets: getMappedCellValue(rowValues, tableRegion, tableColumnMapping.columns.sets),
                reps: getMappedCellValue(rowValues, tableRegion, tableColumnMapping.columns.reps),
                prescribedLoad: getMappedCellValue(rowValues, tableRegion, tableColumnMapping.columns.prescribedLoad),
                prescribedRpe: getMappedCellValue(rowValues, tableRegion, tableColumnMapping.columns.prescribedRpe),
                coachNotes: getMappedCellValue(rowValues, tableRegion, tableColumnMapping.columns.coachNotes),
                selectedLoad: getMappedCellValue(rowValues, tableRegion, tableColumnMapping.columns.selectedLoad),
                actualRpe: getMappedCellValue(rowValues, tableRegion, tableColumnMapping.columns.actualRpe),
                athleteNotes: getMappedCellValue(rowValues, tableRegion, tableColumnMapping.columns.athleteNotes),
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

            for (
                let columnIndex = tableRegion.headerStartColumnIndex;
                columnIndex <= tableRegion.endColumnIndex;
                columnIndex++
            ) {
                const cellValue = rowValues[columnIndex];

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
            startColumnIndex: tableRegion.startColumnIndex,
            headerStartColumnIndex: tableRegion.headerStartColumnIndex,
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
                exerciseRow.headerRowNumber === tableContext.headerRowNumber &&
                exerciseRow.headerStartColumnIndex === tableContext.headerStartColumnIndex
            );
        });

        sessionPreviews.push({
            sheetName: tableContext.sheetName,
            headerRowNumber: tableContext.headerRowNumber,
            startColumnIndex: tableContext.startColumnIndex,
            headerStartColumnIndex: tableContext.headerStartColumnIndex,
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

        if (firstSession.headerRowNumber !== secondSession.headerRowNumber) {
            return firstSession.headerRowNumber - secondSession.headerRowNumber;
        }

        return firstSession.headerStartColumnIndex - secondSession.headerStartColumnIndex;
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
            startColumnIndex: sessionPreview.startColumnIndex,
            headerStartColumnIndex: sessionPreview.headerStartColumnIndex,
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

                if (firstSession.headerRowNumber !== secondSession.headerRowNumber) {
                    return firstSession.headerRowNumber - secondSession.headerRowNumber;
                }

                return firstSession.headerStartColumnIndex - secondSession.headerStartColumnIndex;
            });
        }
    }

    return {
        programName: getProgramName(fileName),
        blocks,
    };
}

function validateProgramPreview(programPreview: ProgramPreview | null): ValidationIssue[] {
    const validationIssues: ValidationIssue[] = [];

    if (programPreview === null) {
        validationIssues.push({
            severity: "error",
            message: "Program preview could not be created.",
            weekNumber: null,
            sessionOrder: null,
            exerciseName: null,
            sourceRowNumber: null,
        });

        return validationIssues;
    }

    let totalWeekCount = 0;

    for (const block of programPreview.blocks) {
        totalWeekCount += block.weeks.length;
    }

    if (totalWeekCount === 0) {
        validationIssues.push({
            severity: "error",
            message: "Program preview must contain at least one week.",
            weekNumber: null,
            sessionOrder: null,
            exerciseName: null,
            sourceRowNumber: null,
        });
    }

    for (const block of programPreview.blocks) {
        for (const week of block.weeks) {
            if (week.sessions.length === 0) {
                validationIssues.push({
                    severity: "error",
                    message: "Each week must contain at least one session.",
                    weekNumber: week.weekNumber,
                    sessionOrder: null,
                    exerciseName: null,
                    sourceRowNumber: null,
                });
            }

            for (const session of week.sessions) {
                if (session.exercises.length === 0) {
                    validationIssues.push({
                        severity: "error",
                        message: "Each session must contain at least one exercise.",
                        weekNumber: week.weekNumber,
                        sessionOrder: session.sessionOrder,
                        exerciseName: null,
                        sourceRowNumber: null,
                    });
                }

                for (const exercise of session.exercises) {
                    if (exercise.exercise === null) {
                        validationIssues.push({
                            severity: "error",
                            message: "Each exercise must have an exercise name.",
                            weekNumber: week.weekNumber,
                            sessionOrder: session.sessionOrder,
                            exerciseName: null,
                            sourceRowNumber: exercise.sourceRowNumber,
                        });
                    }

                    if (exercise.sets === null) {
                        validationIssues.push({
                            severity: "warning",
                            message: "Exercise is missing sets.",
                            weekNumber: week.weekNumber,
                            sessionOrder: session.sessionOrder,
                            exerciseName: exercise.exercise,
                            sourceRowNumber: exercise.sourceRowNumber,
                        });
                    }

                    if (exercise.reps === null) {
                        validationIssues.push({
                            severity: "warning",
                            message: "Exercise is missing reps.",
                            weekNumber: week.weekNumber,
                            sessionOrder: session.sessionOrder,
                            exerciseName: exercise.exercise,
                            sourceRowNumber: exercise.sourceRowNumber,
                        });
                    }

                    if (exercise.prescribedRpe === null && exercise.coachNotes === null) {
                        validationIssues.push({
                            severity: "warning",
                            message: "Exercise is missing prescribed RPE or coach notes explaining the RPE-style work.",
                            weekNumber: week.weekNumber,
                            sessionOrder: session.sessionOrder,
                            exerciseName: exercise.exercise,
                            sourceRowNumber: exercise.sourceRowNumber,
                        });
                    }
                }
            }
        }
    }

    return validationIssues;
}

function getHeaderFieldName(cellValue: PreviewCell): string | null {
    if (typeof cellValue !== "string") {
        return null;
    }

    const normalisedCellValue = normaliseText(cellValue);

    if (normalisedCellValue === "") {
        return null;
    }

    if (normalisedCellValue === "movement" || normalisedCellValue === "exercise") {
        return "exercise";
    }

    if (normalisedCellValue === "sets" || normalisedCellValue === "set") {
        return "sets";
    }

    if (normalisedCellValue === "reps" || normalisedCellValue === "rep") {
        return "reps";
    }

    if (
        normalisedCellValue.includes("projected load") ||
        normalisedCellValue.includes("prescribed load") ||
        normalisedCellValue.includes("target load") ||
        normalisedCellValue.includes("recommended load")
    ) {
        return "prescribedLoad";
    }

    if (
        normalisedCellValue.includes("selected load") ||
        normalisedCellValue.includes("actual load") ||
        normalisedCellValue.includes("chosen load") ||
        normalisedCellValue.includes("working load") ||
        normalisedCellValue === "load"
    ) {
        return "selectedLoad";
    }

    if (
        normalisedCellValue.includes("isrpe") ||
        normalisedCellValue.includes("is rpe") ||
        normalisedCellValue.includes("actual rpe") ||
        normalisedCellValue.includes("selected rpe")
    ) {
        return "actualRpe";
    }

    if (
        normalisedCellValue === "rpe" ||
        normalisedCellValue.includes("projected rpe") ||
        normalisedCellValue.includes("prescribed rpe") ||
        normalisedCellValue.includes("target rpe")
    ) {
        return "prescribedRpe";
    }

    if (
        normalisedCellValue.includes("coach comments") ||
        normalisedCellValue.includes("coach notes") ||
        normalisedCellValue.includes("coach note") ||
        normalisedCellValue.includes("notes/cues") ||
        normalisedCellValue.includes("notes / cues") ||
        normalisedCellValue.includes("coach cues") ||
        normalisedCellValue === "notes"
    ) {
        return "coachNotes";
    }

    if (
        normalisedCellValue.includes("athlete notes") ||
        normalisedCellValue.includes("athlete note") ||
        normalisedCellValue.includes("actual notes") ||
        normalisedCellValue.includes("lifter notes")
    ) {
        return "athleteNotes";
    }

    return null;
}

function headerMatchesField(cellValue: PreviewCell, fieldName: string): boolean {
    return getHeaderFieldName(cellValue) === fieldName;
}

function getRelativeColumnIndex(regionStartColumnIndex: number, absoluteColumnIndex: number | null): number | null {
    if (absoluteColumnIndex === null) {
        return null;
    }

    return absoluteColumnIndex - regionStartColumnIndex;
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

function getMappedCellValue(
    rowValues: PreviewCell[],
    tableRegion: TableRegion,
    relativeColumnIndex: number | null,
): string | null {
    if (relativeColumnIndex === null) {
        return null;
    }

    const absoluteColumnIndex = tableRegion.startColumnIndex + relativeColumnIndex;

    if (absoluteColumnIndex < tableRegion.startColumnIndex || absoluteColumnIndex > tableRegion.endColumnIndex) {
        return null;
    }

    const cellValue = rowValues[absoluteColumnIndex];

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
    const cellText = getCellText(cell);

    if (typeof value === "number" && isPercentageFormat(cell.numFmt)) {
        return `${value * 100}%`;
    }

    if (value instanceof Date && isMonthDayFormat(cell.numFmt)) {
        return `${value.getUTCMonth() + 1}-${value.getUTCDate()}`;
    }

    if (cellText !== null && cellText.trim() !== "") {
        return cellText.trim();
    }

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

function isPercentageFormat(numberFormat: string | undefined): boolean {
    if (typeof numberFormat !== "string") {
        return false;
    }

    return numberFormat.includes("%");
}

function isMonthDayFormat(numberFormat: string | undefined): boolean {
    if (typeof numberFormat !== "string") {
        return false;
    }

    const normalisedNumberFormat = numberFormat.trim().toLowerCase();

    if (normalisedNumberFormat === "m-d") {
        return true;
    }

    if (normalisedNumberFormat === "m/d") {
        return true;
    }

    if (normalisedNumberFormat === "mm-dd") {
        return true;
    }

    if (normalisedNumberFormat === "mm/dd") {
        return true;
    }

    return false;
}

function normaliseText(value: string): string {
    return value.trim().toLowerCase();
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
    return startA <= endB && startB <= endA;
}

function isRegionRowEmpty(
    rowValues: PreviewCell[] | undefined,
    startColumnIndex: number,
    endColumnIndex: number,
): boolean {
    if (rowValues === undefined) {
        return true;
    }

    for (let columnIndex = startColumnIndex; columnIndex <= endColumnIndex; columnIndex++) {
        const cellValue = rowValues[columnIndex];

        if (cellValue === null || cellValue === undefined) {
            continue;
        }

        if (typeof cellValue === "string" && cellValue.trim() === "") {
            continue;
        }

        return false;
    }

    return true;
}
