# sbd.io

Spreadsheet companion app for powerlifters.

sbd.io takes coach-provided Excel programs, extracts structured workout sessions, and turns them into a cleaner training workflow. Instead of scrolling through large spreadsheets in the gym, the athlete can review the parsed import, save the program, continue training from the first incomplete session, and log actual performance separately from the coach's prescription.

## Problem Statement

Powerlifting programs are often delivered as Excel or Google spreadsheets. They work well as the coach's source of truth, but they are awkward to use during training:

- weeks and sessions are often spread across large tables
- progression is session-based, not calendar-based
- prescribed values and athlete logs get mixed together in the spreadsheet
- vague spreadsheet sections can look like data even when they are not safely parseable

sbd.io is a QoL layer on top of those spreadsheets. It does not try to replace the spreadsheet. It focuses on importing structured blocks, showing the next session clearly, and keeping athlete logs separate from prescribed work.

## Current MVP Features

- Upload `.xlsx` workout programs
- Preview workbook sheets and parser output
- Detect structured workout tables from recognisable headers
- Detect repeated week/session tables laid out horizontally
- Extract exercises, sets, reps, prescribed load, prescribed RPE, coach notes, and athlete-input columns
- Normalise parsed data into program -> block -> week -> session -> exercise structure
- Show an import review with warnings and unparsed-sheet messaging
- Save confirmed imports to PostgreSQL with Prisma
- List saved programs and view program detail pages
- Continue training from the first incomplete session
- View any saved session directly
- Save exercise logs for selected load, actual RPE, and athlete notes
- Mark sessions complete and reopen them later
- Detect vague or unstructured sheets and fail safely instead of guessing
- Run parser tests against sample workbooks

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create environment variables

Add a `.env` file with a PostgreSQL connection string:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sbd"
```

### 3. Generate the Prisma client

```bash
npx prisma generate
```

### 4. Push the schema to your local database

This repo currently ships the Prisma schema, but not a full migration history yet, so the simplest local setup is:

```bash
npx prisma db push
```

If your local schema drifts during development and you are okay losing local test data, reset the database first:

```bash
npx prisma migrate reset
```

Then regenerate and push again.

### 5. Start the app

```bash
npm run dev
```

Open `http://localhost:3000` or the port shown in the terminal.

## Database Setup Notes

- PostgreSQL is required
- Prisma config lives in [prisma.config.ts](./prisma.config.ts)
- Prisma schema lives in [prisma/schema.prisma](./prisma/schema.prisma)
- The generated Prisma client is written to `src/generated/prisma`

The current schema includes:

- `Program`
- `Block`
- `Week`
- `Session`
- `ExercisePrescription`
- `ExerciseLog`
- `ImportSource`

`Program.lastAccessedAt` is used to infer the current program from user activity.

## Testing

Run parser tests:

```bash
npm test
```

Run linting:

```bash
npm run lint
```

Run a production build check:

```bash
npm run build
```

Current automated coverage focuses on the parser pipeline, including:

- structured workbook parsing
- horizontally repeated week tables
- rep range preservation
- percentage load preservation
- safe handling of vague or unstructured sheets

## Supported Input Assumptions

The current parser works best when the workbook contains recognisable workout table headers such as:

- `Movement`
- `Sets`
- `Reps`
- `Projected Load`
- `% Load`
- `RPE`
- `Coach Comments`
- `Coach Notes/Cues`
- `Selected Load`
- `IsRPE`
- `Athlete Notes`

The current import flow assumes:

- input is `.xlsx`
- blocks are sheet-based
- week labels look like `Week 1`, `Week 2`, and so on
- session labels look like `Day 1 - Wednesday` or `Session 1 - ...`
- structured workout data appears in rectangular table regions

The parser can handle:

- horizontally repeated week/session tables
- rep ranges like `8-10` or `10 - 12`
- percentage-based load drops like `-10%` or `-12.5%`
- prescribed fields and athlete-input fields stored in separate columns

## Current Limitations

- `.xlsx` only for now
- no authentication yet
- no Google Sheets sync yet
- no write-back to the original spreadsheet
- parser expects recognisable table headers
- import corrections are still lightweight and developer-oriented
- automated tests currently focus on parser behaviour more than end-to-end UI/database flows

## Future Roadmap

- Auth and persistent user accounts
- Google Sheets import and sync
- Safer migration workflow for shared deployments
- Better import correction tools
- More parser coverage across spreadsheet styles
- Session history and review improvements
- Stronger exercise identity normalisation
- Better mobile training UX polish
- More end-to-end automated tests

## Project Structure

```txt
src/
  app/
    api/
    programs/
    upload/
  lib/
  types/
prisma/
samples/
```

## Architecture

High-level architecture notes live in [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).
