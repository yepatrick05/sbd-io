# Import Pipeline

## Goal

Convert an uploaded Excel workbook into a normalized powerlifting program structure
without requiring users to manually recreate the program.

## Stage 1: Workbook Read

Read:

- sheet names
- row values
- column values
- merged cells if available

Output:

- raw workbook representation

## Stage 2: Sheet Preview

Display:

- workbook sheets
- sample rows
- likely dense regions
- likely header rows

Goal:

- let developer and user understand workbook structure

## Stage 3: Candidate Table Detection

Detect likely workout tables using heuristics such as:

- repeated headers
- dense rectangular regions
- exercise-like text rows
- columns resembling sets/reps/load/RPE

Output:

- candidate workout regions per sheet

## Stage 4: Field Inference

Infer likely meaning of columns/regions:

- exercise name
- sets
- reps
- prescribed load
- prescribed RPE
- notes
- week labels
- session labels

Output:

- best-guess mapping with confidence

## Stage 5: User Confirmation

User can:

- confirm detected fields
- reassign fields
- ignore rows
- rename sessions
- split or regroup detected regions if needed

Output:

- approved mapping configuration

## Stage 6: Normalization

Convert mapped workbook data into internal schema:

- program
- block
- week
- session
- exercise prescription rows

Validation:

- every exercise must belong to a session
- exercise name required
- prescribed RPE required
- invalid rows flagged for correction

## Stage 7: Session Progression

After normalization, session order is established as:

- Week 1 Session 1
- Week 1 Session 2
- ...
- Week N Session M

The app determines the next session as:

- first uncompleted session in program order

## Stage 8: Logging

For each exercise prescription row, user logs:

- actual load
- actual reps
- actual RPE
- optional notes

Completion of a session advances the program position.

# Future Extensions

- Google Sheets import
- cloud persistence
- write-back sync for linked cloud sources
- parser template reuse across multiple imports
