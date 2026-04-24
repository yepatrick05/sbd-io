export type PreviewCell = string | number | boolean | null;

export interface SheetPreview {
    name: string;
    rows: PreviewCell[][];
}

export interface HeaderRowCandidate {
    sheetName: string;
    rowNumber: number;
    confidence: number;
    matchedFields: string[];
}

export interface TableRegion {
    sheetName: string;
    headerRowNumber: number;
    startRowNumber: number;
    endRowNumber: number;
    rowCount: number;
}

export interface TableColumnMapping {
    sheetName: string;
    headerRowNumber: number;
    columns: {
        exercise: number | null;
        sets: number | null;
        reps: number | null;
        prescribedLoad: number | null;
        selectedLoad: number | null;
        prescribedRpe: number | null;
        actualRpe: number | null;
        coachNotes: number | null;
        athleteNotes: number | null;
    };
}

export interface ExerciseRow {
    sheetName: string;
    headerRowNumber: number;
    sourceRowNumber: number;
    exercise: string | null;
    sets: string | null;
    reps: string | null;
    prescribedLoad: string | null;
    prescribedRpe: string | null;
    coachNotes: string | null;
    selectedLoad: string | null;
    actualRpe: string | null;
    athleteNotes: string | null;
}

export interface TableContext {
    sheetName: string;
    headerRowNumber: number;
    weekNumber: number | null;
    sessionOrder: number | null;
    sessionLabel: string | null;
    intendedWeekday: string | null;
}

export interface SessionPreview {
    sheetName: string;
    headerRowNumber: number;
    weekNumber: number | null;
    sessionOrder: number | null;
    sessionLabel: string | null;
    intendedWeekday: string | null;
    exercises: ExerciseRow[];
}

export interface WorkbookPreview {
    sheetNames: string[];
    sheets: SheetPreview[];
    headerRowCandidates: HeaderRowCandidate[];
    tableRegions: TableRegion[];
    tableColumnMappings: TableColumnMapping[];
    exerciseRows: ExerciseRow[];
    tableContexts: TableContext[];
    sessionPreviews: SessionPreview[];
}
