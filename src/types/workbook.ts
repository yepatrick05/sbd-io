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

export interface WorkbookPreview {
    sheetNames: string[];
    sheets: SheetPreview[];
    headerRowCandidates: HeaderRowCandidate[];
    tableRegions: TableRegion[];
    tableColumnMappings: TableColumnMapping[];
}
