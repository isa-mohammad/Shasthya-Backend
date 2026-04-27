import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../supabaseClient.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { dbError, notFound } from '../utils/errors.js';

const router = Router();

// All admin routes require auth + admin role
router.use(requireAuth, requireRole('admin'));

// ── Dashboard stats ──────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  const [users, doctors, appointments, articles, posts, messages] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('doctors').select('id', { count: 'exact', head: true }),
    supabase.from('appointments').select('id', { count: 'exact', head: true }),
    supabase.from('articles').select('id', { count: 'exact', head: true }).eq('published', true),
    supabase.from('community_posts').select('id', { count: 'exact', head: true }).eq('is_hidden', false),
    supabase.from('contact_messages').select('id', { count: 'exact', head: true }).eq('is_resolved', false),
  ]);

  res.json({
    total_users: users.count ?? 0,
    total_doctors: doctors.count ?? 0,
    total_appointments: appointments.count ?? 0,
    published_articles: articles.count ?? 0,
    community_posts: posts.count ?? 0,
    open_contact_messages: messages.count ?? 0,
  });
});

// ── Doctor verification ──────────────────────────────────────────
router.get('/doctors/pending', async (req, res) => {
  const { data, error } = await supabase
    .from('doctors')
    .select(`*, profiles!doctors_user_id_fkey(name, avatar_url, phone)`)
    .eq('verified', false)
    .order('created_at');

  if (error) return dbError(res, error);
  res.json(data);
});

router.patch('/doctors/:id/verify', async (req, res) => {
  const { data, error } = await supabase
    .from('doctors')
    .update({ verified: true })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error || !data) return notFound(res, 'Doctor');

  // Notify the doctor
  if (data.user_id) {
    await supabase.from('notifications').insert({
      user_id: data.user_id,
      type: 'doctor_verified',
      title: 'Profile Verified',
      body: 'Your doctor profile has been verified. You can now receive appointments.',
    });
  }

  res.json(data);
});

router.patch('/doctors/:id/reject', async (req, res) => {
  const { reason } = req.body;

  const { data, error } = await supabase
    .from('doctors')
    .select('user_id')
    .eq('id', req.params.id)
    .single();

  if (!data) return notFound(res, 'Doctor');

  if (data.user_id) {
    await supabase.from('notifications').insert({
      user_id: data.user_id,
      type: 'doctor_rejected',
      title: 'Verification Rejected',
      body: reason ?? 'Your BMDC documents could not be verified. Please resubmit.',
    });
  }

  res.json({ message: 'Rejection notification sent' });
  if (error) return dbError(res, error);
});

// ── User management ──────────────────────────────────────────────
router.get('/users', async (req, res) => {
  const { search, role, page = 1, limit = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let query = supabase
    .from('profiles')
    .select(`*, user_roles(role)`, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + Number(limit) - 1);

  if (search) query = query.ilike('name', `%${search}%`);

  const { data, error, count } = await query;
  if (error) return dbError(res, error);
  res.json({ data, total: count });
});

router.patch('/users/:id/role', validate(z.object({ role: z.enum(['patient', 'doctor', 'admin']), action: z.enum(['add', 'remove']) })), async (req, res) => {
  const { role, action } = req.body;

  if (action === 'add') {
    const { error } = await supabase
      .from('user_roles')
      .upsert({ user_id: req.params.id, role }, { onConflict: 'user_id,role' });
    if (error) return dbError(res, error);
  } else {
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', req.params.id)
      .eq('role', role);
    if (error) return dbError(res, error);
  }

  res.json({ message: `Role ${role} ${action}ed` });
});

// ── Doctor documents (BMDC verification) ────────────────────────
router.get('/doctors/:id/docs', async (req, res) => {
  const { data: docs, error } = await supabase
    .from('doctor_documents')
    .select('*')
    .eq('doctor_id', req.params.id)
    .order('uploaded_at', { ascending: false });

  if (error) return dbError(res, error);

  // Attach fresh 1-hour signed URLs for each doc
  const withUrls = await Promise.all(
    docs.map(async (doc) => {
      const { data } = await supabase.storage
        .from('doctor-docs')
        .createSignedUrl(doc.file_path, 3600);
      return { ...doc, signed_url: data?.signedUrl ?? null };
    })
  );

  res.json(withUrls);
});

// ── Community moderation ─────────────────────────────────────────
router.get('/community/reported', async (req, res) => {
  const { data, error } = await supabase
    .from('community_posts')
    .select(`*, profiles!community_posts_user_id_fkey(name)`)
    .gt('report_count', 0)
    .order('report_count', { ascending: false });

  if (error) return dbError(res, error);
  res.json(data);
});

export default router;
