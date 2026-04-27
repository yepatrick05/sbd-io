import { readFile } from "node:fs/promises";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { parseWorkbook } from "./workbook-parser";

describe("workbook parser", () => {
    let workbookPreview: Awaited<ReturnType<typeof parseWorkbook>>;

    beforeAll(async () => {
        const sampleWorkbookPath = path.join(process.cwd(), "samples", "sample-program.xlsx");
        const workbookBuffer = await readFile(sampleWorkbookPath);

        workbookPreview = await parseWorkbook("sample-program.xlsx", workbookBuffer);
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
