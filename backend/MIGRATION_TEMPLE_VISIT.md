# Temple Visit Letter — Catalyst column additions

The TEMPLE_VISIT grievance type ships its letter through the existing
`Grievance` table. Add the columns below to the `Grievance` table in the
Catalyst Console (Tables → Grievance → + Add Column).

All columns are optional / nullable so existing rows are unaffected.

| Column name          | Type     | Notes                                                   |
|----------------------|----------|---------------------------------------------------------|
| `templeKey`          | TEXT     | One of the keys in `TEMPLE_REGISTRY` (pdf.controller).  |
| `memberCount`        | BIGINT   | Whole number ≥ 1                                        |
| `originDistrict`     | TEXT     | Free text                                               |
| `originState`        | TEXT     | Free text                                               |
| `visitDateFrom`      | DATETIME | First day of visit                                      |
| `visitDateTo`        | DATETIME | Optional — leave null for single-day visits             |
| `servicesRequested`  | TEXT     | Comma-separated codes (see below)                       |
| `showMobileOnLetter` | BOOLEAN  | Default false                                           |

The petitioner's full name (with any prefix the staff wants — `Sri.`, `Smt.`,
`Shri.`, `Dr.`, etc.) goes into the existing `petitionerName` column. The
letter renders it verbatim: `<petitionerName> and <memberCount> members from
<origin>`.

`servicesRequested` codes (stored as comma-separated): `SPECIAL_DARSHAN`,
`DARSHAN`, `SPARSH_DARSHAN`, `MANGALARATI`, `BHASMARATI`, `POOJA`,
`ACCOMMODATION`.

After the columns are live in Catalyst, no code change is required for inserts /
updates — the controller already passes any extra fields through.
