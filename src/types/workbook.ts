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

export interface WorkbookPreview {
    sheetNames: string[];
    sheets: SheetPreview[];
    headerRowCandidates: HeaderRowCandidate[];
    tableRegions: TableRegion[];
}
