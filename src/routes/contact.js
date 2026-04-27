import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabaseClient.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { dbError } from '../utils/errors.js';

const router = Router();

const contactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(10),
});

// POST /contact — anyone can submit
router.post('/', validate(contactSchema), async (req, res) => {
  const user_id = req.headers.authorization ? null : null; // optionally attach user

  const { data, error } = await supabase
    .from('contact_messages')
    .insert({ ...req.body, user_id: null })
    .select()
    .single();

  if (error) return dbError(res, error);
  res.status(201).json({ message: 'Message received. We will get back to you soon.' });
});

// GET /contact — admin reads all
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { resolved, page = 1, limit = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let query = supabase
    .from('contact_messages')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + Number(limit) - 1);

  if (resolved === 'true') query = query.eq('is_resolved', true);
  if (resolved === 'false') query = query.eq('is_resolved', false);

  const { data, error, count } = await query;
  if (error) return dbError(res, error);
  res.json({ data, total: count });
});

// PATCH /contact/:id/resolve — admin resolves
router.patch('/:id/resolve', requireAuth, requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('contact_messages')
    .update({ is_resolved: true, resolved_at: new Date().toISOString(), resolved_by: req.user.id })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return dbError(res, error);
  res.json(data);
});

export default router;
