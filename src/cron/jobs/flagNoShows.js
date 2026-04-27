import { supabase } from '../../supabaseClient.js';

/**
 * Runs every 15 minutes.
 * Finds confirmed appointments whose slot end_time has passed by
 * more than 30 minutes and marks them as no_show.
 * Also frees up the slot.
 */
export async function flagNoShows() {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000); // 30 min grace period
  const cutoffDate = cutoff.toISOString().split('T')[0];
  const cutoffTime = cutoff.toTimeString().slice(0, 5);

  const { data: appointments, error } = await supabase
    .from('appointments')
    .select(`
      id, patient_id, slot_id,
      doctors!appointments_doctor_id_fkey(user_id),
      doctor_slots!appointments_slot_id_fkey(slot_date, end_time)
    `)
    .eq('status', 'confirmed');

  if (error) throw error;
  if (!appointments?.length) return;

  const noShowIds = [];
  const slotIds = [];
  const notifications = [];

  for (const appt of appointments) {
    const slot = appt.doctor_slots;
    if (!slot) continue;

    const slotEnd = new Date(`${slot.slot_date}T${slot.end_time}`);
    if (slotEnd > cutoff) continue; // not past grace period yet

    noShowIds.push(appt.id);
    slotIds.push(appt.slot_id);

    notifications.push({
      user_id: appt.patient_id,
      type: 'no_show',
      title: 'Appointment marked as no-show',
      body: 'Your appointment was marked as no-show as it was not attended.',
      data: { appointment_id: appt.id },
    });

    if (appt.doctors?.user_id) {
      notifications.push({
        user_id: appt.doctors.user_id,
        type: 'no_show',
        title: 'Patient did not attend',
        body: 'A patient did not attend their appointment. It has been marked as no-show.',
        data: { appointment_id: appt.id },
      });
    }
  }

  if (!noShowIds.length) return;

  await Promise.all([
    supabase.from('appointments').update({ status: 'no_show' }).in('id', noShowIds),
    supabase.from('doctor_slots').update({ is_booked: false }).in('id', slotIds),
    supabase.from('notifications').insert(notifications),
  ]);

  console.log(`[flagNoShows] Flagged ${noShowIds.length} no-shows`);
}
