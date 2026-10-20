// Old pipe-delimited message format.
// TODO: remove once everyone is on the new format.
export default function legacy(reminder) {
  return ['REMIND', reminder.user_id, reminder.at, reminder.text].join('|');
}
