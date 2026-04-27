# Sasthya Sathi — Backend Status

## ✅ Done

### Database
| What | Where |
|------|-------|
| All 18 tables + enums + indexes | `supabase/migrations/*_sasthya_sathi_core_schema` |
| RLS policies on every table | `supabase/migrations/*_sasthya_sathi_rls_policies` |
| `has_role()` SECURITY DEFINER function | same as core schema migration |
| Auto-create profile + patient role on signup trigger | same as core schema migration |
| Auto-recalculate doctor avg rating on review trigger | same as core schema migration |
| Storage buckets (avatars, reports, prescriptions, doctor-docs) + policies | `supabase/migrations/*_sasthya_sathi_storage_buckets` |

### Auth — `src/routes/auth.js`
- [x] Email/password signup
- [x] Email/password login
- [x] Email OTP send & verify
- [x] Token refresh
- [x] Password reset request (email link)
- [x] Password update (authenticated)
- [x] Logout
- [x] `GET /auth/me` — current user + roles + profile

### Profile — `src/routes/profile.js`
- [x] Get own profile
- [x] Update own profile
- [x] Avatar signed upload URL
- [x] Save avatar URL to profile

### Doctors — `src/routes/doctors.js`
- [x] Public listing with search, specialty, language, telemedicine filters + pagination
- [x] Single doctor profile
- [x] Available slots listing (filters: date range, mode)
- [x] Doctor reviews listing
- [x] Register as doctor
- [x] Update own doctor profile
- [x] Weekly schedule CRUD (`GET/POST/PATCH/DELETE /doctors/me/schedules`)
- [x] Manual slot creation (`POST /doctors/me/slots`)

### Appointments — `src/routes/appointments.js`
- [x] Patient — list own appointments (filter by status)
- [x] Patient — get single appointment
- [x] Patient — create appointment (10-min slot lock)
- [x] Confirm payment → mark slot booked
- [x] Cancel appointment (patient or doctor)
- [x] Doctor marks appointment completed
- [x] Doctor — list own appointments

### Family Members — `src/routes/family.js`
- [x] List, get, create, update, delete

### Reminders — `src/routes/reminders.js`
- [x] List (filter active), get, create, update, delete

### Reports — `src/routes/reports.js`
- [x] List (filter by type, family member) + pagination
- [x] Get single (returns fresh signed download URL)
- [x] Signed upload URL endpoint
- [x] Save metadata after upload
- [x] Delete

### Prescriptions — `src/routes/prescriptions.js`
- [x] Doctor creates prescription + medicines in one request
- [x] Patient lists own prescriptions
- [x] Patient / doctor gets single prescription
- [x] Doctor lists own issued prescriptions

### Articles — `src/routes/articles.js`
- [x] Public listing (search, category, tag filter) + pagination
- [x] Single article by slug (+ view count increment)
- [x] Category list
- [x] Admin create, update, publish, delete

### Community — `src/routes/community.js`
- [x] Posts — list, get, create, update, delete
- [x] Comments — list, add, delete (+ threaded via parent_id)
- [x] Likes — add, remove
- [x] Report a post (increments report_count)
- [x] Admin hide post

### Notifications — `src/routes/notifications.js`
- [x] List (filter unread) + pagination
- [x] Mark one as read
- [x] Mark all as read

### Reviews — `src/routes/reviews.js`
- [x] Create review (only on completed appointments)
- [x] Update own review

### Contact — `src/routes/contact.js`
- [x] Public submit contact message
- [x] Admin list messages (filter resolved/unresolved)
- [x] Admin mark resolved

### Admin — `src/routes/admin.js`
- [x] Dashboard stats (users, doctors, appointments, articles, posts, open messages)
- [x] Pending doctor verification queue
- [x] Verify doctor (+ sends notification)
- [x] Reject doctor (+ sends notification)
- [x] User list with search + pagination
- [x] Add / remove user roles
- [x] Reported community posts list

### Telemedicine — `src/routes/telemedicine.js`
- [x] Generate LiveKit room token (patient or doctor)
- [x] End room / kick all participants (doctor only, marks appointment completed)

### Infrastructure
- [x] Helmet (security headers)
- [x] Morgan (request logging)
- [x] Rate limiting (20 req/15min on auth, 120 req/min general)
- [x] Zod validation on all write endpoints
- [x] `requireAuth` + `requireRole` middleware
- [x] Global error handler + 404 handler
- [x] CORS open (all origins — tighten before production)

---

## ❌ Todo

### Payments — `src/routes/payments.js` (not created)
- [ ] bKash integration
- [ ] Nagad integration
- [ ] Rocket integration
- [ ] SSLCommerz integration (cards + local wallets)
- [ ] Stripe integration (international cards)
- [ ] Webhook endpoint + signature verification
- [ ] Refund flow
- [ ] Receipt / invoice generation

### SMS / Mobile OTP — `src/routes/auth.js` + `src/services/sms.js` (not created)
- [ ] Twilio client setup (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` env vars already stubbed in `.env.example`)
- [ ] `POST /auth/phone/send-otp`
- [ ] `POST /auth/phone/verify-otp`
- [ ] Phone number as login method

### Email Notifications — `src/services/email.js` (not created)
- [ ] Appointment confirmation email (patient + doctor)
- [ ] Appointment reminder email (24hr before)
- [ ] Doctor verification approved/rejected email
- [ ] Custom email templates (currently uses Supabase default)

### Web Push Notifications — `src/services/push.js` (not created)
- [ ] VAPID key generation + storage
- [ ] `POST /push/subscribe` — save subscription object per user
- [ ] `DELETE /push/subscribe` — unsubscribe
- [ ] Push dispatch helper (used by cron jobs + events)

### Cron Jobs — `src/cron/` (not created)
- [ ] Reminder dispatch — fire at scheduled times from `reminders` table
- [ ] Appointment reminder — notify patient + doctor 1hr before slot
- [ ] No-show flagging — auto-cancel if appointment stays `confirmed` X minutes past slot end
- [ ] Slot auto-generation — generate `doctor_slots` rows from `doctor_schedules` (e.g. 2 weeks ahead)
- [ ] Lock expiry cleanup — free slots whose `locked_until` has passed (fallback to DB trigger)

### AI Endpoints — `src/routes/ai.js`
- [x] `POST /api/ai/chat` — Dr. Sasthya chatbot (Claude Haiku, streaming SSE, chat history persisted)
- [x] `POST /api/ai/nutrition` — 7-day Bangladeshi meal plan generator (Claude Haiku)
- [x] `GET /api/ai/sessions` — list user's chat sessions
- [x] `GET /api/ai/sessions/:id/messages` — load session history
- [x] `DELETE /api/ai/sessions/:id` — clear session
- [x] AI rate limit: 30 messages/hour/user

### Telemedicine — `src/routes/telemedicine.js`
- [ ] Persist chat messages to DB during/after session
- [ ] Recording start/stop (LiveKit Cloud feature)
- [ ] Waiting room / pre-call check endpoint

### Doctor Slot Auto-Generation — `src/routes/doctors.js`
- [ ] `POST /doctors/me/slots/generate` — generate slots from schedules for a given date range

### Search — `src/routes/search.js` (not created)
- [ ] `GET /search?q=` — unified search across doctors + articles

### Community — `src/routes/community.js`
- [ ] Signed upload URL for post images (bucket + endpoint)

### Data & Compliance — `src/routes/account.js` (not created)
- [ ] `GET /account/export` — GDPR-style full data export (JSON)
- [ ] `DELETE /account` — delete account + all associated data

### Security (pre-launch)
- [ ] Tighten CORS to specific frontend domain (`ALLOWED_ORIGINS` in `.env`)
- [ ] Add CAPTCHA to signup + contact endpoints
- [ ] Input sanitisation for XSS on article/community body fields
- [ ] Rotate Supabase service role key before production
