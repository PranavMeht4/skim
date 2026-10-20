// Current message format.
export default function format(reminder) {
  return `Reminder for ${reminder.user_id}: ${reminder.text} (set for ${reminder.at})`;
}
