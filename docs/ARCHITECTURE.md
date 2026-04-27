# Architecture

This document describes the current MVP architecture for sbd.io at a high level.

## Product Shape

sbd.io is built around one core idea:

- import a coach spreadsheet
- normalize structured training data
- continue training from the first incomplete session

The app does not treat the calendar as the source of truth. It treats session order as the source of truth.

## Workbook Upload Flow

The upload flow is split into two stages:

### 1. Parse and review

Route:

- `POST /api/upload`

Page:

- `/upload`

What happens:

1. The user uploads an `.xlsx` file
2. The server reads the workbook with ExcelJS
3. The parser builds a `WorkbookPreview`
4. The UI shows an import review before anything is saved

This stage is intentionally non-destructive. It exists so the user can inspect what was parsed and what was ignored.

### 2. Confirm and save

Route:

- `POST /api/import`

What happens:

1. The user clicks `Confirm Import`
2. The server checks that blocking errors do not exist
3. The normalized preview is saved with Prisma inside a transaction
4. A saved `Program` id is returned

The save route uses only the normalized parsed program data. Review warnings can still be displayed in the UI without becoming saved records.

## Parser Pipeline

The parser lives in:

- [src/lib/workbook-parser.ts](../src/lib/workbook-parser.ts)

The pipeline is intentionally rule-based and conservative.

### Stage 1. Read workbook preview

The parser reads:

- sheet names
- row values
- cell display values

It prefers visible spreadsheet meaning over aggressive type inference because workout prescriptions often rely on:

- rep ranges
- percentage drops
- mixed text and numbers

### Stage 2. Detect header candidates

The parser looks for recognizable workout headers such as:

- `Movement`
- `Sets`
- `Reps`
- `% Load`
- `RPE`
- `Coach Notes/Cues`
- `Selected Load`
- `IsRPE`
- `Athlete Notes`

If those headers are not present, the parser does not invent structure.

### Stage 3. Detect table regions

Once a header row is found, the parser builds a rectangular table region using:

- header row
- start/end rows
- start/end columns

This supports horizontally repeated week layouts, where multiple sessions or weeks appear side by side on the same sheet.

### Stage 4. Map columns

Within each table region, the parser maps column meanings relative to that region:

- exercise name
- sets
- reps
- prescribed load
- prescribed RPE
- coach notes
- selected load
- actual RPE
- athlete notes

### Stage 5. Extract exercises

The parser reads only inside detected table regions and extracts `ExerciseRow` objects.

Important rule:

- prescribed values stay separate from athlete-input values

This means import data preserves the difference between:

- what the coach prescribed
- what the athlete later logged

### Stage 6. Detect week and session context

The parser scans above each table region to find nearby labels such as:

- `Week 1`
- `Day 2 - Friday`

This context is attached to the session preview, not guessed from the calendar.

### Stage 7. Normalize into app-level structure

The parser groups data into:

- `ProgramPreview`
- `Block`
- `Week`
- `Session`
- `Exercise`

Blocks are currently sheet-based.

### Stage 8. Validate

Validation checks whether the normalized preview is usable.

Blocking errors remain for cases like:

- no valid weeks
- no valid sessions
- a session with no exercises
- an exercise missing a name

Warnings are used for things that may still be workable during import review.

## Import Review Flow

The import review lives on `/upload`.

Its purpose is to answer three questions:

1. Did the parser find a usable program?
2. What was parsed?
3. What was skipped or only partially understood?

The review currently shows:

- top-level import readiness
- summary counts
- non-blocking sheet warnings
- grouped warning summaries
- structured weeks, sessions, and exercises

Detailed warnings remain available behind collapsible sections so the review stays readable.

## Database Model

At a high level, the saved data model is:

- `Program`
  - contains imported training programs
- `Block`
  - currently aligned to sheet-level groupings
- `Week`
  - numbered week within a block
- `Session`
  - one workout in program order
- `ExercisePrescription`
  - one prescribed exercise row inside a session
- `ExerciseLog`
  - athlete-entered logging data for a prescription
- `ImportSource`
  - metadata about where imported data came from

Important design choice:

- prescribed fields and athlete log fields are stored separately

That keeps coach intent and athlete execution distinct.

## Session Progression Model

The next session is:

- the first session where `completedAt` is `null`

Program order is:

1. `weekNumber` ascending
2. `sessionOrder` ascending

This rule powers:

- `Continue Training`
- session completion
- reopened sessions
- current-program progress display

## Why Session Order Matters More Than Calendar Date

In real training, athletes do not always train on the exact day written in the spreadsheet.

Examples:

- a Friday session might happen on Saturday
- a missed workout might shift the rest of the week
- the coach label might say `Day 2 - Friday`, but the athlete still needs to complete it next even if the calendar moved

Because of that, sbd.io does not calculate the next workout from today's date.

It calculates the next workout from training sequence:

- first incomplete session in program order

Intended weekdays are useful metadata, but not the primary progression rule.

## How Unstructured or Vague Sheets Are Handled

This is a deliberate product constraint.

If a sheet looks more like a notepad than a workout table, the parser should fail safely.

That means:

- no guessed column meanings from bare numbers
- no fake week/session structure
- no silent conversion into a “complete” parsed block

Instead, the app:

- ignores that sheet for normalized program data
- shows a non-blocking review warning if other valid sheets were parsed
- shows a blocking error if no valid workout tables were detected anywhere in the workbook

This keeps the import trustworthy. A partial but honest import is better than a confident-looking fake one.

## Current Constraints

- `.xlsx` only
- no auth yet
- no Google Sheets sync yet
- parser expects recognizable workout table headers
- vague sheets are not guessed
- migration history is still early-stage

## Main App Areas

- `/`
  - dashboard
- `/upload`
  - import review and confirmation
- `/programs`
  - saved program list
- `/programs/[programId]`
  - program detail page
- `/programs/[programId]/next`
  - resolve to the first incomplete session
- `/programs/[programId]/sessions/[sessionId]`
  - session detail, logging, completion, and reopening
