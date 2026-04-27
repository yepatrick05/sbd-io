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
    startColumnIndex: number;
    endColumnIndex: number;
    headerStartColumnIndex: number;
}

export interface TableRegion {
    sheetName: string;
    headerRowNumber: number;
    startRowNumber: number;
    endRowNumber: number;
    startColumnIndex: number;
    endColumnIndex: number;
    headerStartColumnIndex: number;
    rowCount: number;
}

export interface TableColumnMapping {
    sheetName: string;
    headerRowNumber: number;
    startColumnIndex: number;
    headerStartColumnIndex: number;
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
    startColumnIndex: number;
    headerStartColumnIndex: number;
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
    startColumnIndex: number;
    headerStartColumnIndex: number;
    weekNumber: number | null;
    sessionOrder: number | null;
    sessionLabel: string | null;
    intendedWeekday: string | null;
}

export interface SessionPreview {
    sheetName: string;
    headerRowNumber: number;
    startColumnIndex: number;
    headerStartColumnIndex: number;
    startRowNumber: number;
    endRowNumber: number;
    endColumnIndex: number;
    weekNumber: number | null;
    sessionOrder: number | null;
    sessionLabel: string | null;
    intendedWeekday: string | null;
    exercises: ExerciseRow[];
}

export interface NormalisedSessionPreview {
    sheetName: string;
    headerRowNumber: number;
    startColumnIndex: number;
    headerStartColumnIndex: number;
    startRowNumber: number;
    endRowNumber: number;
    endColumnIndex: number;
    weekNumber: number | null;
    sessionOrder: number | null;
    sessionLabel: string | null;
    intendedWeekday: string | null;
    exercises: ExerciseRow[];
}

export interface NormalisedWeekPreview {
    weekNumber: number | null;
    sessions: NormalisedSessionPreview[];
}

export interface NormalisedBlockPreview {
    sheetName: string;
    blockName: string;
    weeks: NormalisedWeekPreview[];
}

export interface ProgramPreview {
    programName: string;
    blocks: NormalisedBlockPreview[];
}

export interface ValidationIssue {
    severity: "error" | "warning";
    message: string;
    weekNumber: number | null;
    sessionOrder: number | null;
    exerciseName: string | null;
    sourceRowNumber: number | null;
}

export interface WorkbookPreview {
    originalFileName: string;
    sheetNames: string[];
    sheets: SheetPreview[];
    headerRowCandidates: HeaderRowCandidate[];
    tableRegions: TableRegion[];
    tableColumnMappings: TableColumnMapping[];
    exerciseRows: ExerciseRow[];
    tableContexts: TableContext[];
    sessionPreviews: SessionPreview[];
    programPreview: ProgramPreview | null;
    validationIssues: ValidationIssue[];
}
