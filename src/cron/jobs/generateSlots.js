import { supabase } from '../../supabaseClient.js';

/**
 * For every active doctor schedule, generate doctor_slots
 * for the next `daysAhead` days if they don't already exist.
 */
export async function generateSlots(daysAhead = 14) {
  const { data: schedules, error } = await supabase
    .from('doctor_schedules')
    .select('id, doctor_id, day_of_week, start_time, end_time, slot_duration_minutes, mode')
    .eq('is_active', true);

  if (error) throw error;
  if (!schedules?.length) return;

  const today = new Date();
  const slotsToInsert = [];

  for (const schedule of schedules) {
    for (let i = 0; i < daysAhead; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);

      // Only generate for matching day of week
      if (date.getDay() !== schedule.day_of_week) continue;

      const slotDate = date.toISOString().split('T')[0];

      // Generate time slots within start_time–end_time
      const slots = splitIntoSlots(
        schedule.start_time,
        schedule.end_time,
        schedule.slot_duration_minutes
      );

      for (const { start, end } of slots) {
        slotsToInsert.push({
          doctor_id: schedule.doctor_id,
          schedule_id: schedule.id,
          slot_date: slotDate,
          start_time: start,
          end_time: end,
          mode: schedule.mode,
        });
      }
    }
  }

  if (!slotsToInsert.length) return;

  // upsert — skip conflicts (slot already exists)
  const { error: insertError } = await supabase
    .from('doctor_slots')
    .upsert(slotsToInsert, { onConflict: 'doctor_id,slot_date,start_time,mode', ignoreDuplicates: true });

  if (insertError) throw insertError;

  console.log(`[generateSlots] Upserted ${slotsToInsert.length} slots`);
}

function splitIntoSlots(startTime, endTime, durationMinutes) {
  const slots = [];
  let current = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  while (current + durationMinutes <= end) {
    slots.push({
      start: minutesToTime(current),
      end: minutesToTime(current + durationMinutes),
    });
    current += durationMinutes;
  }

  return slots;
}

function timeToMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes) {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}
