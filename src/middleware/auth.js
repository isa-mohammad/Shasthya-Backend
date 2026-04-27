import { supabase } from '../supabaseClient.js';

/**
 * Verifies the Bearer JWT from Authorization header.
 * Attaches req.user and req.token on success.
 */
export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.slice(7);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = data.user;
  req.token = token;
  next();
}

/**
 * Factory: require a specific role (patient | doctor | admin).
 * Must be used after requireAuth.
 */
export function requireRole(role) {
  return async (req, res, next) => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', req.user.id)
      .eq('role', role)
      .maybeSingle();

    if (error || !data) {
      return res.status(403).json({ error: `Requires role: ${role}` });
    }
    next();
  };
}
