import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabaseClient.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { dbError, notFound } from '../utils/errors.js';

const router = Router();

const familyMemberSchema = z.object({
  name: z.string().min(1),
  relation: z.string().min(1),
  date_of_birth: z.string().date().optional(),
  gender: z.string().optional(),
  blood_group: z.string().optional(),
  phone: z.string().optional(),
});

// GET /family
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('family_members')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at');

  if (error) return dbError(res, error);
  res.json(data);
});

// GET /family/:id
router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('family_members')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (error || !data) return notFound(res, 'Family member');
  res.json(data);
});

// POST /family
router.post('/', requireAuth, validate(familyMemberSchema), async (req, res) => {
  const { data, error } = await supabase
    .from('family_members')
    .insert({ ...req.body, user_id: req.user.id })
    .select()
    .single();

  if (error) return dbError(res, error);
  res.status(201).json(data);
});

// PATCH /family/:id
router.patch('/:id', requireAuth, validate(familyMemberSchema.partial()), async (req, res) => {
  const { data, error } = await supabase
    .from('family_members')
    .update(req.body)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();

  if (error || !data) return notFound(res, 'Family member');
  res.json(data);
});

// DELETE /family/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('family_members')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return dbError(res, error);
  res.status(204).send();
});

export default router;
