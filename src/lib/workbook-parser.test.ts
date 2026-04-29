import { readFile } from "node:fs/promises";
import path from "node:path";

import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";

import { computePercentageBackoffDisplayLoad, parseWorkbook } from "./workbook-parser";

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
            sheetName: "Block 14 - blowing ts up",
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
            return block.sheetName === "block 2 - ramping it up";
        });

        const weekNumbers = structuredBlock?.weeks.map((week) => week.weekNumber);
        const sessionCounts = structuredBlock?.weeks.map((week) => week.sessions.length);

        expect(weekNumbers).toEqual([1, 2, 3, 4]);
        expect(sessionCounts).toEqual([4, 4, 4, 4]);
    });

    it("detects known session labels in the structured block", () => {
        const structuredBlock = workbookPreview.programPreview?.blocks.find((block) => {
            return block.sheetName === "block 2 - ramping it up";
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
        const programSheetNames = workbookPreview.programPreview?.blocks.map((block) => block.sheetName) ?? [];

        expect(vagueSheetHeaderCandidates).toHaveLength(0);
        expect(vagueSheetTableRegions).toHaveLength(0);
        expect(vagueSheetExerciseRows).toHaveLength(0);
        expect(vagueSheetSessions).toHaveLength(0);
        expect(programSheetNames).not.toContain("block 3 - rando bodybuilding st");
    });

    it("adds a warning for the vague sheet instead of silently ignoring it", () => {
        const vagueSheetWarning = workbookPreview.validationIssues.find((issue) => {
            return (
                issue.sheetName === "block 3 - rando bodybuilding st" &&
                issue.message === "No recognisable workout table headers were found." &&
                issue.severity === "warning"
            );
        });

        expect(vagueSheetWarning).toMatchObject({
            sheetName: "block 3 - rando bodybuilding st",
            severity: "warning",
            message: "No recognisable workout table headers were found.",
        });
    });
});

describe("workbook parser with no recognisable workout tables", () => {
    it("adds a blocking error when the workbook has no valid workout tables anywhere", async () => {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("notes");

        sheet.getCell("A1").value = "Just some notes";
        sheet.getCell("A2").value = "Bench 80 x 5";
        sheet.getCell("A3").value = "Squat 120 x 5";

        const workbookBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
        const workbookPreview = await parseWorkbook("unstructured.xlsx", workbookBuffer);

        const workbookLevelError = workbookPreview.validationIssues.find((issue) => {
            return (
                issue.sheetName === null &&
                issue.severity === "error" &&
                issue.message === "No recognisable workout tables were detected anywhere in this workbook."
            );
        });
        const sheetLevelWarning = workbookPreview.validationIssues.find((issue) => {
            return (
                issue.sheetName === "notes" &&
                issue.severity === "warning" &&
                issue.message === "No recognisable workout table headers were found."
            );
        });

        expect(workbookPreview.headerRowCandidates).toHaveLength(0);
        expect(workbookPreview.tableRegions).toHaveLength(0);
        expect(workbookLevelError).toMatchObject({
            sheetName: null,
            severity: "error",
            message: "No recognisable workout tables were detected anywhere in this workbook.",
        });
        expect(sheetLevelWarning).toMatchObject({
            sheetName: "notes",
            severity: "warning",
            message: "No recognisable workout table headers were found.",
        });
    });
});

describe("load normalisation and percentage backoff helpers", () => {
    it("copies selectedLoad into prescribedLoad when prescribedLoad is empty", async () => {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("block 1");

        sheet.addRow([
            "Week 1",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
        ]);
        sheet.addRow([
            "Day 1 - Wednesday",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
        ]);
        sheet.addRow([
            "Movement",
            "Sets",
            "Reps",
            "Projected Load",
            "RPE",
            "Coach Notes/Cues",
            "Selected Load",
            "Athlete Notes",
        ]);
        sheet.addRow([
            "Comp Squat",
            "1",
            "5",
            "",
            "",
            "",
            "155",
            "",
        ]);

        const workbookBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
        const workbookPreview = await parseWorkbook("load-capped.xlsx", workbookBuffer);
        const exerciseRow = workbookPreview.exerciseRows[0];

        expect(exerciseRow).toMatchObject({
            prescribedLoad: "155",
            selectedLoad: "155",
        });
    });

    it("preserves percentage prescribedLoad when selectedLoad also exists", async () => {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("block 1");

        sheet.addRow(["Week 1"]);
        sheet.addRow(["Day 1 - Wednesday"]);
        sheet.addRow([
            "Movement",
            "Sets",
            "Reps",
            "Projected Load",
            "RPE",
            "Coach Notes/Cues",
            "Selected Load",
            "Athlete Notes",
        ]);
        sheet.addRow([
            "Comp Deadlift",
            "1",
            "5",
            "-10%",
            "",
            "",
            "72",
            "",
        ]);

        const workbookBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
        const workbookPreview = await parseWorkbook("percentage-load.xlsx", workbookBuffer);
        const exerciseRow = workbookPreview.exerciseRows[0];

        expect(exerciseRow).toMatchObject({
            prescribedLoad: "-10%",
            selectedLoad: "72",
        });
    });

    it("computes a percentage backoff from the previous selectedLoad when available", () => {
        const exerciseRows = [
            buildExerciseRow({
                exercise: "Competition Deadlift",
                prescribedLoad: "100",
                selectedLoad: "102.5",
            }),
            buildExerciseRow({
                exercise: "Competition Deadlift",
                prescribedLoad: "-12.5%",
            }),
        ];

        const computedDisplayLoad = computePercentageBackoffDisplayLoad(exerciseRows, exerciseRows[1]);

        expect(computedDisplayLoad).toBeCloseTo(89.7, 1);
    });

    it("falls back to the previous prescribedLoad when selectedLoad is missing", () => {
        const exerciseRows = [
            buildExerciseRow({
                exercise: "Competition Bench",
                prescribedLoad: "80",
                selectedLoad: null,
            }),
            buildExerciseRow({
                exercise: "Competition Bench",
                prescribedLoad: "-10%",
            }),
        ];

        const computedDisplayLoad = computePercentageBackoffDisplayLoad(exerciseRows, exerciseRows[1]);

        expect(computedDisplayLoad).toBe(72);
    });

    it("does not compute a percentage backoff when no previous concrete load exists", () => {
        const exerciseRows = [
            buildExerciseRow({
                exercise: "Competition Squat",
                prescribedLoad: "-10%",
            }),
            buildExerciseRow({
                exercise: "Competition Squat",
                prescribedLoad: "-12.5%",
            }),
        ];

        const computedDisplayLoad = computePercentageBackoffDisplayLoad(exerciseRows, exerciseRows[1]);

        expect(computedDisplayLoad).toBeNull();
    });
});

function buildExerciseRow({
    exercise,
    prescribedLoad = null,
    selectedLoad = null,
}: {
    exercise: string;
    prescribedLoad?: string | null;
    selectedLoad?: string | null;
}) {
    return {
        sheetName: "block 1",
        headerRowNumber: 3,
        startColumnIndex: 0,
        headerStartColumnIndex: 0,
        sourceRowNumber: 4,
        exercise,
        sets: "1",
        reps: "5",
        prescribedLoad,
        prescribedRpe: null,
        coachNotes: null,
        selectedLoad,
        actualRpe: null,
        athleteNotes: null,
    };
}
