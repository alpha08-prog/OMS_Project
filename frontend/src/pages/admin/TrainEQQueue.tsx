import TrainEqListPage from "@/pages/Train/TrainEqListPage";

/**
 * Admin view of Train EQ entries.
 *
 * Train EQ is self-service for staff: they create the entry and print the
 * letter on their own. Admin observes here (no approve/assign flow) but CAN
 * correct any entry via the edit dialog — reprints pick up the corrections.
 *
 * The list itself lives in TrainEqListPage, shared with the staff view. The
 * backend scopes rows by role, so the two differ only in copy.
 */
export default function TrainEQQueue() {
  return <TrainEqListPage scope="admin" />;
}
