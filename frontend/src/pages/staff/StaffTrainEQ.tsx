import TrainEqListPage from "@/pages/Train/TrainEqListPage";

/**
 * Staff view of their own Train EQ entries.
 *
 * Staff previously had no dedicated Train EQ list at all — their entries were
 * only visible inside the merged My History timeline, capped at 100 rows and
 * mixed in with grievances and tour programs. Since staff are the primary
 * users of this module (they create the entries and print their own letters),
 * they get the same paged, searchable list the admin has.
 *
 * Row scoping is enforced SERVER-side by identity alias, not here — the same
 * endpoint returns only this user's rows when the caller's role is STAFF.
 */
export default function StaffTrainEQ() {
  return <TrainEqListPage scope="staff" />;
}
