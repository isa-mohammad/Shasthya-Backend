import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabaseClient.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { dbError, notFound } from '../utils/errors.js';

const router = Router();

const reminderSchema = z.object({
  medicine_name: z.string().min(1),
  dosage: z.string().min(1),
  schedule_times: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1),
  weekdays: z.array(z.number().int().min(0).max(6)).default([0,1,2,3,4,5,6]),
  start_date: z.string().date().optional(),
  end_date: z.string().date().optional(),
  is_active: z.boolean().default(true),
  notes: z.string().optional(),
});

// GET /reminders
router.get('/', requireAuth, async (req, res) => {
  const { active } = req.query;

  let query = supabase
    .from('reminders')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (active === 'true') query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) return dbError(res, error);
  res.json(data);
});

// GET /reminders/:id
router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (error || !data) return notFound(res, 'Reminder');
  res.json(data);
});

// POST /reminders
router.post('/', requireAuth, validate(reminderSchema), async (req, res) => {
  const { data, error } = await supabase
    .from('reminders')
    .insert({ ...req.body, user_id: req.user.id })
    .select()
    .single();

  if (error) return dbError(res, error);
  res.status(201).json(data);
});

// PATCH /reminders/:id
router.patch('/:id', requireAuth, validate(reminderSchema.partial()), async (req, res) => {
  const { data, error } = await supabase
    .from('reminders')
    .update(req.body)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error || !data) return notFound(res, 'Reminder');
  res.json(data);
});

// DELETE /reminders/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('reminders')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return dbError(res, error);
  res.status(204).send();
});

export default router;
