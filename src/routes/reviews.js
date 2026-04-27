import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabaseClient.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { dbError, notFound } from '../utils/errors.js';

const router = Router();

const reviewSchema = z.object({
  doctor_id: z.string().uuid(),
  appointment_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

// POST /reviews
router.post('/', requireAuth, validate(reviewSchema), async (req, res) => {
  // Verify appointment belongs to patient and is completed
  const { data: appt } = await supabase
    .from('appointments')
    .select('patient_id, doctor_id, status')
    .eq('id', req.body.appointment_id)
    .single();

  if (!appt) return notFound(res, 'Appointment');
  if (appt.patient_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  if (appt.status !== 'completed') return res.status(409).json({ error: 'Can only review completed appointments' });

  const { data, error } = await supabase
    .from('reviews')
    .insert({ ...req.body, patient_id: req.user.id })
    .select()
    .single();

  if (error?.code === '23505') return res.status(409).json({ error: 'You already reviewed this appointment' });
  if (error) return dbError(res, error);
  res.status(201).json(data);
});

// PATCH /reviews/:id
router.patch('/:id', requireAuth, validate(reviewSchema.pick({ rating: true, comment: true }).partial()), async (req, res) => {
  const { data, error } = await supabase
    .from('reviews')
    .update(req.body)
    .eq('id', req.params.id)
    .eq('patient_id', req.user.id)
    .select()
    .single();

  if (error || !data) return notFound(res, 'Review');
  res.json(data);
});

export default router;
