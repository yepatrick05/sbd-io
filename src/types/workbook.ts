export type PreviewCell = string | number | boolean | null;

export interface SheetPreview {
    name: string;
    rows: PreviewCell[][];
}

export interface WorkbookPreview {
    sheetNames: string[];
    sheets: SheetPreview[];
}
