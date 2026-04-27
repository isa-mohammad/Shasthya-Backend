import { Router } from 'express';
import { supabase } from '../supabaseClient.js';
import { requireAuth } from '../middleware/auth.js';
import { dbError } from '../utils/errors.js';

const router = Router();

// GET /notifications
router.get('/', requireAuth, async (req, res) => {
  const { unread, page = 1, limit = 30 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let query = supabase
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + Number(limit) - 1);

  if (unread === 'true') query = query.eq('is_read', false);

  const { data, error, count } = await query;
  if (error) return dbError(res, error);
  res.json({ data, total: count });
});

// PATCH /notifications/:id/read
router.patch('/:id/read', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return dbError(res, error);
  res.json({ message: 'Marked as read' });
});

// PATCH /notifications/read-all
router.patch('/read-all', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', req.user.id)
    .eq('is_read', false);

  if (error) return dbError(res, error);
  res.json({ message: 'All notifications marked as read' });
});

export default router;
