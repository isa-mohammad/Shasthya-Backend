import { supabase } from '../../supabaseClient.js';

/**
 * Runs every hour.
 * Finds confirmed appointments starting in 50–70 min from now
 * and sends an in-app notification to both patient and doctor.
 */
export async function sendAppointmentReminders() {
  const now = new Date();
  const from = new Date(now.getTime() + 50 * 60 * 1000); // 50 min ahead
  const to   = new Date(now.getTime() + 70 * 60 * 1000); // 70 min ahead

  // Build time window as date + time parts for Postgres comparison
  const fromDate = from.toISOString().split('T')[0];
  const toDate   = to.toISOString().split('T')[0];
  const fromTime = from.toTimeString().slice(0, 5);
  const toTime   = to.toTimeString().slice(0, 5);

  const { data: appointments, error } = await supabase
    .from('appointments')
    .select(`
      id, patient_id, mode,
      doctors!appointments_doctor_id_fkey(user_id),
      doctor_slots!appointments_slot_id_fkey(slot_date, start_time)
    `)
    .eq('status', 'confirmed')
    .gte('doctor_slots.slot_date', fromDate)
    .lte('doctor_slots.slot_date', toDate);

  if (error) throw error;
  if (!appointments?.length) return;

  const notifications = [];

  for (const appt of appointments) {
    const slot = appt.doctor_slots;
    if (!slot) continue;

    // Filter precisely — slot_date + start_time in our window
    const slotDateTime = new Date(`${slot.slot_date}T${slot.start_time}`);
    if (slotDateTime < from || slotDateTime > to) continue;

    const timeStr = slot.start_time.slice(0, 5);
    const modeStr = appt.mode === 'telemedicine' ? 'video call' : 'in-person visit';

    // Notify patient
    notifications.push({
      user_id: appt.patient_id,
      type: 'appointment_reminder',
      title: 'Appointment in 1 hour',
      body: `Your ${modeStr} appointment is at ${timeStr}. Please be ready.`,
      data: { appointment_id: appt.id },
    });

    // Notify doctor
    if (appt.doctors?.user_id) {
      notifications.push({
        user_id: appt.doctors.user_id,
        type: 'appointment_reminder',
        title: 'Appointment in 1 hour',
        body: `You have a ${modeStr} appointment at ${timeStr}.`,
        data: { appointment_id: appt.id },
      });
    }
  }

  if (!notifications.length) return;

  const { error: notifError } = await supabase.from('notifications').insert(notifications);
  if (notifError) throw notifError;

  console.log(`[appointmentReminders] Sent ${notifications.length} reminders`);
}
