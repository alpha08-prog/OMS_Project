// Constituency dropdown options shared across grievance/birthday/visitor forms.
// Values include the AC number so downstream consumers (letters, exports) keep
// the official numbering intact.
export const CONSTITUENCY_OPTIONS: readonly string[] = [
  "Navalagund 69",
  "Kundagol 70",
  "Dharwad 71",
  "Hubli-Dharwad East 72",
  "Hubli-Dharwad Central 73",
  "Dharwad West 74",
  "Kalaghatagi 75",
  "Shiggaon 83",
  "Out of Constituency",
] as const;
