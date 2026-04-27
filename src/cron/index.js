import cron from 'node-cron';
import { generateSlots } from './jobs/generateSlots.js';
import { sendAppointmentReminders } from './jobs/appointmentReminders.js';
import { flagNoShows } from './jobs/flagNoShows.js';
import { dispatchMedicineReminders } from './jobs/medicineReminders.js';

export function startCronJobs() {
  // Every day at midnight — generate slots 14 days ahead
  cron.schedule('0 0 * * *', () => {
    generateSlots(14).catch(err => console.error('[cron:generateSlots]', err));
  });

  // Every hour — send appointment reminders for slots starting in ~1hr
  cron.schedule('0 * * * *', () => {
    sendAppointmentReminders().catch(err => console.error('[cron:appointmentReminders]', err));
  });

  // Every 15 minutes — flag no-shows for past confirmed appointments
  cron.schedule('*/15 * * * *', () => {
    flagNoShows().catch(err => console.error('[cron:flagNoShows]', err));
  });

  // Every minute — dispatch medicine reminders whose time has come
  cron.schedule('* * * * *', () => {
    dispatchMedicineReminders().catch(err => console.error('[cron:medicineReminders]', err));
  });

  console.log('Cron jobs started');
}
