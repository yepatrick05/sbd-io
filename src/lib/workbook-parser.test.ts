import { readFile } from "node:fs/promises";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { parseWorkbook } from "./workbook-parser";

async function loadWorkbookPreview(fileName: string) {
    const sampleWorkbookPath = path.join(process.cwd(), "samples", fileName);
    const workbookBuffer = await readFile(sampleWorkbookPath);

    return parseWorkbook(fileName, workbookBuffer);
}

describe("workbook parser", () => {
    let workbookPreview: Awaited<ReturnType<typeof parseWorkbook>>;

    beforeAll(async () => {
        workbookPreview = await loadWorkbookPreview("sample-program.xlsx");
    });

    it("detects all expected weeks", () => {
        expect(workbookPreview.programPreview).not.toBeNull();

        const firstBlock = workbookPreview.programPreview?.blocks[0];
        const weekNumbers = firstBlock?.weeks.map((week) => week.weekNumber);

        expect(weekNumbers).toEqual([1, 2, 3, 4]);
    });

    it("detects the expected number of sessions per week", () => {
        const firstBlock = workbookPreview.programPreview?.blocks[0];
        const sessionCounts = firstBlock?.weeks.map((week) => week.sessions.length);

        expect(sessionCounts).toEqual([4, 4, 4, 4]);
    });

    it("detects known session labels", () => {
        const firstBlock = workbookPreview.programPreview?.blocks[0];
        const sessionLabels =
            firstBlock?.weeks.flatMap((week) => {
                return week.sessions.map((session) => session.sessionLabel);
            }) ?? [];

        expect(sessionLabels).toContain("Day 1 - Wednesday");
        expect(sessionLabels).toContain("Day 2 - Friday");
    });

    it("extracts known exercises", () => {
        const exerciseNames = workbookPreview.exerciseRows.map((exerciseRow) => exerciseRow.exercise);

        expect(exerciseNames).toContain("Competition Deadlift");
        expect(exerciseNames).toContain("Competition Bench");
        expect(exerciseNames).toContain("High Bar Squat");
        expect(exerciseNames).toContain("Paused Bench Press (3ct)");
    });

    it("preserves rep ranges from the spreadsheet", () => {
        const repValues = workbookPreview.exerciseRows.map((exerciseRow) => exerciseRow.reps);

        expect(repValues).toContain("8 -10");
        expect(repValues).toContain("10 - 12");
    });

    it("preserves percentage-based load drops", () => {
        const prescribedLoads = workbookPreview.exerciseRows.map((exerciseRow) => exerciseRow.prescribedLoad);

        expect(prescribedLoads).toContain("-12.5%");
        expect(prescribedLoads).toContain("-10%");
        expect(prescribedLoads).toContain("-12%");
        expect(prescribedLoads).toContain("-15%");
    });

    it("keeps prescribed and athlete-input fields separate", () => {
        const deadliftDropSet = workbookPreview.exerciseRows.find((exerciseRow) => {
            return (
                exerciseRow.exercise === "Competition Deadlift" &&
                exerciseRow.prescribedLoad === "-12.5%" &&
                exerciseRow.selectedLoad === "145" &&
                exerciseRow.actualRpe === "5"
            );
        });

        expect(deadliftDropSet).toMatchObject({
            prescribedLoad: "-12.5%",
            prescribedRpe: null,
            selectedLoad: "145",
            actualRpe: "5",
        });
    });
});

describe("workbook parser with sample-program2.xlsx", () => {
    let workbookPreview: Awaited<ReturnType<typeof parseWorkbook>>;

    beforeAll(async () => {
        workbookPreview = await loadWorkbookPreview("sample-program2.xlsx");
    });

    it("parses the structured block into weeks and sessions", () => {
        expect(workbookPreview.programPreview).not.toBeNull();

        const structuredBlock = workbookPreview.programPreview?.blocks.find((block) => {
            return block.blockName === "block 2 - ramping it up";
        });

        const weekNumbers = structuredBlock?.weeks.map((week) => week.weekNumber);
        const sessionCounts = structuredBlock?.weeks.map((week) => week.sessions.length);

        expect(weekNumbers).toEqual([1, 2, 3, 4]);
        expect(sessionCounts).toEqual([4, 4, 4, 4]);
    });

    it("detects known session labels in the structured block", () => {
        const structuredBlock = workbookPreview.programPreview?.blocks.find((block) => {
            return block.blockName === "block 2 - ramping it up";
        });

        const sessionLabels =
            structuredBlock?.weeks.flatMap((week) => {
                return week.sessions.map((session) => session.sessionLabel);
            }) ?? [];

        expect(sessionLabels).toContain("Day 1 - Wednesday");
        expect(sessionLabels).toContain("Day 2 - Friday");
    });

    it("extracts known exercises from the structured block", () => {
        const exerciseNames = workbookPreview.exerciseRows
            .filter((exerciseRow) => exerciseRow.sheetName === "block 2 - ramping it up")
            .map((exerciseRow) => exerciseRow.exercise);

        expect(exerciseNames).toContain("Competition Deadlift");
        expect(exerciseNames).toContain("Competition Bench");
        expect(exerciseNames).toContain("Mid-Grip Bench");
    });

    it("preserves rep ranges, notes, percentages, and athlete-input fields in the structured block", () => {
        const repValues = workbookPreview.exerciseRows
            .filter((exerciseRow) => exerciseRow.sheetName === "block 2 - ramping it up")
            .map((exerciseRow) => exerciseRow.reps);
        const prescribedLoads = workbookPreview.exerciseRows
            .filter((exerciseRow) => exerciseRow.sheetName === "block 2 - ramping it up")
            .map((exerciseRow) => exerciseRow.prescribedLoad);
        const structuredAccessoryRow = workbookPreview.exerciseRows.find((exerciseRow) => {
            return (
                exerciseRow.sheetName === "block 2 - ramping it up" &&
                exerciseRow.exercise === "DB Tricep Kickbacks" &&
                exerciseRow.sourceRowNumber === 14 &&
                exerciseRow.headerStartColumnIndex === 11
            );
        });

        expect(repValues).toContain("10 - 12");
        expect(repValues).toContain("8-10");
        expect(prescribedLoads).toContain("-10%");
        expect(prescribedLoads).toContain("-16%");

        expect(structuredAccessoryRow).toMatchObject({
            prescribedRpe: "9",
            coachNotes: "Last set AMRAP",
            selectedLoad: "55",
            athleteNotes: "pusheown",
        });
    });

    it("does not invent a confident parsed block from the vague sheet", () => {
        const vagueSheetHeaderCandidates = workbookPreview.headerRowCandidates.filter((candidate) => {
            return candidate.sheetName === "block 3 - rando bodybuilding st";
        });
        const vagueSheetTableRegions = workbookPreview.tableRegions.filter((tableRegion) => {
            return tableRegion.sheetName === "block 3 - rando bodybuilding st";
        });
        const vagueSheetExerciseRows = workbookPreview.exerciseRows.filter((exerciseRow) => {
            return exerciseRow.sheetName === "block 3 - rando bodybuilding st";
        });
        const vagueSheetSessions = workbookPreview.sessionPreviews.filter((sessionPreview) => {
            return sessionPreview.sheetName === "block 3 - rando bodybuilding st";
        });
        const programBlockNames = workbookPreview.programPreview?.blocks.map((block) => block.blockName) ?? [];

        expect(vagueSheetHeaderCandidates).toHaveLength(0);
        expect(vagueSheetTableRegions).toHaveLength(0);
        expect(vagueSheetExerciseRows).toHaveLength(0);
        expect(vagueSheetSessions).toHaveLength(0);
        expect(programBlockNames).not.toContain("block 3 - rando bodybuilding st");
    });
});
