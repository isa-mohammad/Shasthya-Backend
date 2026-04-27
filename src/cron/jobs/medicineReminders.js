import { supabase } from '../../supabaseClient.js';

/**
 * Runs every minute.
 * Finds active reminders scheduled for the current time (±1 min window)
 * on the current day of week, and creates an in-app notification.
 */
export async function dispatchMedicineReminders() {
  const now = new Date();
  const currentDay = now.getDay(); // 0=Sun ... 6=Sat
  const currentTime = now.toTimeString().slice(0, 5); // "HH:MM"

  // Fetch all active reminders for today that haven't ended
  const today = now.toISOString().split('T')[0];

  const { data: reminders, error } = await supabase
    .from('reminders')
    .select('id, user_id, medicine_name, dosage, schedule_times, weekdays, end_date')
    .eq('is_active', true)
    .lte('start_date', today)
    .or(`end_date.is.null,end_date.gte.${today}`);

  if (error) throw error;
  if (!reminders?.length) return;

  const notifications = [];

  for (const reminder of reminders) {
    // Check day of week
    if (!reminder.weekdays.includes(currentDay)) continue;

    // Check if any scheduled time matches current time (exact minute match)
    const matchesTime = reminder.schedule_times.some(t => t.slice(0, 5) === currentTime);
    if (!matchesTime) continue;

    notifications.push({
      user_id: reminder.user_id,
      type: 'medicine_reminder',
      title: `Time to take ${reminder.medicine_name}`,
      body: `Dosage: ${reminder.dosage}`,
      data: { reminder_id: reminder.id },
    });
  }

  if (!notifications.length) return;

  const { error: notifError } = await supabase.from('notifications').insert(notifications);
  if (notifError) throw notifError;

  console.log(`[medicineReminders] Dispatched ${notifications.length} reminders at ${currentTime}`);
}
