import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabaseClient.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { dbError, notFound } from '../utils/errors.js';

const router = Router();

const LOCK_DURATION_MINUTES = 10;

const bookSchema = z.object({
  doctor_id: z.string().uuid(),
  slot_id: z.string().uuid(),
  mode: z.enum(['in_person', 'telemedicine']),
  family_member_id: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const confirmPaymentSchema = z.object({
  payment_method: z.string().min(1),
  payment_reference: z.string().min(1),
});

// GET /appointments — list patient's own appointments
router.get('/', requireAuth, async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let query = supabase
    .from('appointments')
    .select(`
      *,
      doctor_slots(slot_date, start_time, end_time),
      doctors(specialty, consultation_fee,
        profiles!doctors_user_id_fkey(name, avatar_url)
      )
    `, { count: 'exact' })
    .eq('patient_id', req.user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + Number(limit) - 1);

  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) return dbError(res, error);
  res.json({ data, total: count });
});

// GET /appointments/:id
router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      *,
      doctor_slots(slot_date, start_time, end_time),
      doctors(*,
        profiles!doctors_user_id_fkey(name, avatar_url)
      ),
      prescriptions(*)
    `)
    .eq('id', req.params.id)
    .single();

  if (error || !data) return notFound(res, 'Appointment');

  const isPatient = data.patient_id === req.user.id;
  const { data: doctorRow } = await supabase
    .from('doctors')
    .select('user_id')
    .eq('id', data.doctor_id)
    .single();
  const isDoctor = doctorRow?.user_id === req.user.id;

  if (!isPatient && !isDoctor) return res.status(403).json({ error: 'Forbidden' });
  res.json(data);
});

// POST /appointments — lock slot + create pending appointment
router.post('/', requireAuth, validate(bookSchema), async (req, res) => {
  const { doctor_id, slot_id, mode, family_member_id, notes } = req.body;

  // 1. Lock the slot atomically
  const lockExpiry = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000).toISOString();

  const { data: slot, error: slotError } = await supabase
    .from('doctor_slots')
    .update({ locked_until: lockExpiry, locked_by: req.user.id })
    .eq('id', slot_id)
    .eq('doctor_id', doctor_id)
    .eq('is_booked', false)
    .or(`locked_until.is.null,locked_until.lt.${new Date().toISOString()}`)
    .select()
    .single();

  if (slotError || !slot) {
    return res.status(409).json({ error: 'Slot is no longer available' });
  }

  // 2. Get fee
  const { data: doctor } = await supabase
    .from('doctors')
    .select('consultation_fee, telemedicine_fee')
    .eq('id', doctor_id)
    .single();

  const fee = mode === 'telemedicine'
    ? (doctor?.telemedicine_fee ?? doctor?.consultation_fee ?? 0)
    : (doctor?.consultation_fee ?? 0);

  // 3. Create appointment
  const { data: appointment, error: apptError } = await supabase
    .from('appointments')
    .insert({
      patient_id: req.user.id,
      doctor_id,
      slot_id,
      mode,
      family_member_id,
      notes,
      fee,
      status: 'pending',
      payment_status: 'pending',
    })
    .select()
    .single();

  if (apptError) {
    // Rollback lock
    await supabase
      .from('doctor_slots')
      .update({ locked_until: null, locked_by: null })
      .eq('id', slot_id);
    return dbError(res, apptError);
  }

  res.status(201).json({
    appointment,
    lock_expires_at: lockExpiry,
    message: `Slot locked for ${LOCK_DURATION_MINUTES} minutes. Complete payment to confirm.`,
  });
});

// POST /appointments/:id/confirm-payment — mark payment done + confirm appointment
router.post('/:id/confirm-payment', requireAuth, validate(confirmPaymentSchema), async (req, res) => {
  const { payment_method, payment_reference } = req.body;

  // Verify ownership
  const { data: appt } = await supabase
    .from('appointments')
    .select('id, patient_id, slot_id, status')
    .eq('id', req.params.id)
    .single();

  if (!appt) return notFound(res, 'Appointment');
  if (appt.patient_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  if (appt.status !== 'pending') return res.status(409).json({ error: 'Appointment is not in pending state' });

  // Update appointment
  const { data, error } = await supabase
    .from('appointments')
    .update({
      payment_method,
      payment_reference,
      payment_status: 'paid',
      status: 'confirmed',
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return dbError(res, error);

  // Mark slot as booked
  await supabase
    .from('doctor_slots')
    .update({ is_booked: true, locked_until: null, locked_by: null })
    .eq('id', appt.slot_id);

  res.json(data);
});

// PATCH /appointments/:id/cancel
router.patch('/:id/cancel', requireAuth, async (req, res) => {
  const { data: appt } = await supabase
    .from('appointments')
    .select('id, patient_id, slot_id, status, doctor_id')
    .eq('id', req.params.id)
    .single();

  if (!appt) return notFound(res, 'Appointment');

  const { data: doctorRow } = await supabase
    .from('doctors')
    .select('user_id')
    .eq('id', appt.doctor_id)
    .single();

  const isPatient = appt.patient_id === req.user.id;
  const isDoctor = doctorRow?.user_id === req.user.id;

  if (!isPatient && !isDoctor) return res.status(403).json({ error: 'Forbidden' });
  if (['completed', 'cancelled'].includes(appt.status)) {
    return res.status(409).json({ error: 'Cannot cancel a completed or already cancelled appointment' });
  }

  const { data, error } = await supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return dbError(res, error);

  // Free up slot
  await supabase
    .from('doctor_slots')
    .update({ is_booked: false, locked_until: null, locked_by: null })
    .eq('id', appt.slot_id);

  res.json(data);
});

// PATCH /appointments/:id/complete — doctor marks complete
router.patch('/:id/complete', requireAuth, requireRole('doctor'), async (req, res) => {
  const { data: appt } = await supabase
    .from('appointments')
    .select('id, doctor_id, status')
    .eq('id', req.params.id)
    .single();

  if (!appt) return notFound(res, 'Appointment');

  const { data: doctorRow } = await supabase
    .from('doctors')
    .select('user_id')
    .eq('id', appt.doctor_id)
    .single();

  if (doctorRow?.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  if (appt.status !== 'confirmed') return res.status(409).json({ error: 'Appointment must be confirmed first' });

  const { data, error } = await supabase
    .from('appointments')
    .update({ status: 'completed' })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return dbError(res, error);
  res.json(data);
});

// GET /appointments/doctor/list — doctor's own appointments list
router.get('/doctor/list', requireAuth, requireRole('doctor'), async (req, res) => {
  const { status, date, page = 1, limit = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  const { data: doctor } = await supabase
    .from('doctors')
    .select('id')
    .eq('user_id', req.user.id)
    .single();

  if (!doctor) return notFound(res, 'Doctor profile');

  let query = supabase
    .from('appointments')
    .select(`
      *,
      doctor_slots(slot_date, start_time, end_time),
      profiles!appointments_patient_id_fkey(name, avatar_url, phone)
    `, { count: 'exact' })
    .eq('doctor_id', doctor.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + Number(limit) - 1);

  if (status) query = query.eq('status', status);
  if (date) {
    query = query.eq('doctor_slots.slot_date', date);
  }

  const { data, error, count } = await query;
  if (error) return dbError(res, error);
  res.json({ data, total: count });
});

export default router;
