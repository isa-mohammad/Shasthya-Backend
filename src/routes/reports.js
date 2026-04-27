import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabaseClient.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { dbError, notFound } from '../utils/errors.js';

const router = Router();

const reportSchema = z.object({
  appointment_id: z.string().uuid().optional(),
  family_member_id: z.string().uuid().optional(),
  report_type: z.string().min(1),
  file_name: z.string().min(1),
  report_date: z.string().date(),
  notes: z.string().optional(),
});

// GET /reports
router.get('/', requireAuth, async (req, res) => {
  const { type, family_member_id, page = 1, limit = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let query = supabase
    .from('reports')
    .select('*', { count: 'exact' })
    .eq('user_id', req.user.id)
    .order('report_date', { ascending: false })
    .range(offset, offset + Number(limit) - 1);

  if (type) query = query.eq('report_type', type);
  if (family_member_id) query = query.eq('family_member_id', family_member_id);

  const { data, error, count } = await query;
  if (error) return dbError(res, error);
  res.json({ data, total: count });
});

// GET /reports/:id
router.get('/:id', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (error || !data) return notFound(res, 'Report');

  // Generate a fresh signed URL for the file
  if (data.file_url) {
    const path = data.file_url.split('/reports/')[1];
    if (path) {
      const { data: signedUrl } = await supabase.storage
        .from('reports')
        .createSignedUrl(path, 3600);
      data.signed_url = signedUrl?.signedUrl;
    }
  }

  res.json(data);
});

// POST /reports/upload-url — get signed URL then call POST /reports to save metadata
router.post('/upload-url', requireAuth, async (req, res) => {
  const { file_name, mime_type } = req.body;
  if (!file_name) return res.status(400).json({ error: 'file_name required' });

  const ext = file_name.split('.').pop();
  const path = `${req.user.id}/${Date.now()}.${ext}`;

  const { data, error } = await supabase.storage
    .from('reports')
    .createSignedUploadUrl(path);

  if (error) return dbError(res, error);
  res.json({ upload_url: data.signedUrl, path });
});

// POST /reports — save report metadata after upload
router.post('/', requireAuth, validate(reportSchema), async (req, res) => {
  const { path, ...rest } = req.body;

  // Build file_url from storage path if provided
  let file_url = req.body.file_url;
  if (!file_url && req.body.path) {
    const { data: urlData } = supabase.storage.from('reports').getPublicUrl(req.body.path);
    file_url = urlData?.publicUrl;
  }

  const { data, error } = await supabase
    .from('reports')
    .insert({ ...rest, user_id: req.user.id, file_url: file_url ?? '' })
    .select()
    .single();

  if (error) return dbError(res, error);
  res.status(201).json(data);
});

// DELETE /reports/:id
router.delete('/:id', requireAuth, async (req, res) => {
  const { data: report } = await supabase
    .from('reports')
    .select('file_url')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();

  if (!report) return notFound(res, 'Report');

  const { error } = await supabase
    .from('reports')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);

  if (error) return dbError(res, error);
  res.status(204).send();
});

export default router;
