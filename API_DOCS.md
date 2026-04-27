# Sasthya Sathi — API Documentation

## Base URL
```
Development:  http://localhost:4000/api
Production:   https://your-backend.railway.app/api
```

## Authentication
All protected endpoints require a Bearer token in the `Authorization` header:
```
Authorization: Bearer <access_token>
```
Tokens are obtained from `/auth/login` or `/auth/otp/verify`.

## Response Format
All responses are JSON. Errors follow:
```json
{ "error": "Human readable message" }
```
Validation errors:
```json
{ "error": "Validation failed", "details": { "field": ["message"] } }
```

## Rate Limits
| Scope | Limit |
|-------|-------|
| `/auth/*` | 20 requests / 15 min |
| `/ai/*` | 30 requests / 1 hour |
| Everything else | 120 requests / 1 min |

---

## Table of Contents
1. [Auth](#1-auth)
2. [Profile](#2-profile)
3. [Doctors](#3-doctors)
4. [Appointments](#4-appointments)
5. [Family Members](#5-family-members)
6. [Reminders](#6-reminders)
7. [Reports](#7-reports)
8. [Prescriptions](#8-prescriptions)
9. [Articles](#9-articles)
10. [Community](#10-community)
11. [Notifications](#11-notifications)
12. [Reviews](#12-reviews)
13. [Contact](#13-contact)
14. [Telemedicine](#14-telemedicine)
15. [AI](#15-ai)
16. [Admin](#16-admin)

---

## 1. Auth

### POST `/auth/signup`
Create a new patient account.

**Body**
```json
{
  "email": "user@example.com",
  "password": "min8chars",
  "name": "Rahim Uddin",
  "lang": "en"
}
```
`lang`: `"en"` | `"bn"` (optional, default `"en"`)

**Response** `201`
```json
{ "message": "Account created. Please verify your email." }
```

---

### POST `/auth/login`
Login with email and password.

**Body**
```json
{
  "email": "user@example.com",
  "password": "yourpassword"
}
```

**Response** `200`
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "expires_at": 1234567890,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "roles": ["patient"]
  }
}
```

---

### POST `/auth/otp/send`
Send a one-time password to an email address.

**Body**
```json
{ "email": "user@example.com" }
```

**Response** `200`
```json
{ "message": "OTP sent to email" }
```

---

### POST `/auth/otp/verify`
Verify the OTP and get a session.

**Body**
```json
{
  "email": "user@example.com",
  "token": "123456",
  "type": "email"
}
```
`type`: `"email"` | `"signup"`

**Response** `200`
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "expires_at": 1234567890,
  "user": { "id": "uuid", "email": "...", "roles": ["patient"] }
}
```

---

### POST `/auth/refresh`
Refresh an expired access token.

**Body**
```json
{ "refresh_token": "eyJ..." }
```

**Response** `200`
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "expires_at": 1234567890
}
```

---

### POST `/auth/password/reset-request`
Send a password reset email.

**Body**
```json
{ "email": "user@example.com" }
```

**Response** `200`
```json
{ "message": "Password reset email sent" }
```

---

### POST `/auth/password/reset-verify`
Exchange the `token_hash` from the reset email link for a session.  
Frontend calls this after user lands on the reset page with `?token_hash=xxx&type=recovery` in the URL.

**Body**
```json
{ "token_hash": "pkce_token_from_url" }
```

**Response** `200`
```json
{
  "access_token": "eyJ...",
  "expires_at": 1234567890
}
```

---

### POST `/auth/password/update` 🔒
Update password. Use the `access_token` from `/password/reset-verify` as the Bearer token.

**Body**
```json
{ "password": "newpassword123" }
```

**Response** `200`
```json
{ "message": "Password updated successfully" }
```

---

### POST `/auth/logout` 🔒
Invalidate all sessions for the current user.

**Response** `200`
```json
{ "message": "Logged out" }
```

---

### GET `/auth/me` 🔒
Get current user info, roles, and profile.

**Response** `200`
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "roles": ["patient"],
  "profile": {
    "id": "uuid",
    "name": "Rahim Uddin",
    "phone": "+8801700000000",
    "avatar_url": "https://...",
    "lang": "en",
    "date_of_birth": "1990-01-15",
    "gender": "male",
    "blood_group": "B+",
    "address": "Dhaka, Bangladesh"
  }
}
```

---

## 2. Profile

### GET `/profile` 🔒
Get own profile.

**Response** `200`
```json
{
  "id": "uuid",
  "name": "Rahim Uddin",
  "phone": "+8801700000000",
  "avatar_url": "https://...",
  "lang": "en",
  "date_of_birth": "1990-01-15",
  "gender": "male",
  "blood_group": "B+",
  "address": "Dhaka, Bangladesh",
  "created_at": "2026-01-01T00:00:00Z",
  "updated_at": "2026-01-01T00:00:00Z"
}
```

---

### PATCH `/profile` 🔒
Update own profile. All fields optional.

**Body**
```json
{
  "name": "Rahim Uddin",
  "phone": "+8801700000000",
  "lang": "bn",
  "date_of_birth": "1990-01-15",
  "gender": "male",
  "blood_group": "B+",
  "address": "Dhaka, Bangladesh"
}
```

**Response** `200` — updated profile object

---

### POST `/profile/avatar/upload-url` 🔒
Get a signed URL to upload an avatar directly to Supabase Storage.

**Body**
```json
{ "ext": "jpg" }
```

**Response** `200`
```json
{
  "upload_url": "https://storage.supabase.co/...",
  "path": "uuid/avatar.jpg"
}
```

> Upload the file via `PUT` to `upload_url`, then call `PATCH /profile/avatar` with the `path`.

---

### PATCH `/profile/avatar` 🔒
Save the avatar URL after upload.

**Body**
```json
{ "path": "uuid/avatar.jpg" }
```

**Response** `200` — updated profile object

---

## 3. Doctors

### GET `/doctors`
List verified doctors. All query params optional.

**Query Params**
| Param | Type | Description |
|-------|------|-------------|
| `specialty` | string | Filter by specialty |
| `lang` | string | Filter by language (`en`, `bn`) |
| `telemedicine` | boolean | `true` for telemedicine-available only |
| `search` | string | Full-text search |
| `page` | number | Default `1` |
| `limit` | number | Default `20` |

**Response** `200`
```json
{
  "data": [
    {
      "id": "uuid",
      "specialty": "Cardiology",
      "consultation_fee": 800,
      "telemedicine_fee": 600,
      "languages": ["en", "bn"],
      "avg_rating": 4.8,
      "review_count": 42,
      "profiles": { "name": "Dr. Karim", "avatar_url": "https://..." }
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 20
}
```

---

### GET `/doctors/:id`
Get a single verified doctor profile.

**Response** `200` — full doctor object with profile

---

### GET `/doctors/:id/slots`
Get available booking slots for a doctor.

**Query Params**
| Param | Type | Description |
|-------|------|-------------|
| `date_from` | date | Start date (default: today) |
| `date_to` | date | End date |
| `mode` | string | `in_person` or `telemedicine` |

**Response** `200`
```json
[
  {
    "id": "uuid",
    "slot_date": "2026-05-01",
    "start_time": "09:00",
    "end_time": "09:30",
    "mode": "in_person",
    "is_booked": false
  }
]
```

---

### GET `/doctors/:id/reviews`
Get reviews for a doctor.

**Query Params**: `page`, `limit`

**Response** `200`
```json
{
  "data": [
    {
      "id": "uuid",
      "rating": 5,
      "comment": "Excellent doctor",
      "created_at": "2026-01-01T00:00:00Z",
      "profiles": { "name": "Rahim", "avatar_url": "https://..." }
    }
  ],
  "total": 42
}
```

---

### POST `/doctors` 🔒
Register as a doctor.

**Body**
```json
{
  "specialty": "Cardiology",
  "bmdc_number": "A-12345",
  "consultation_fee": 800,
  "telemedicine_fee": 600,
  "languages": ["en", "bn"],
  "bio": "15 years of experience...",
  "experience_years": 15,
  "qualifications": ["MBBS", "MD"],
  "available_for_telemedicine": true
}
```

**Response** `201` — doctor object

---

### POST `/doctors/me/docs/upload-url` 🔒
Get a signed URL to upload a BMDC or verification document.

**Body**
```json
{
  "file_name": "bmdc-certificate.pdf",
  "doc_type": "bmdc"
}
```
`doc_type`: `bmdc` | `degree` | `certificate` | any string

**Response** `200`
```json
{
  "upload_url": "https://storage.supabase.co/...",
  "path": "user-uuid/bmdc-1234567890.pdf",
  "doc_type": "bmdc"
}
```

> Upload via `PUT` to `upload_url`, then call `POST /doctors/me/docs`.

---

### POST `/doctors/me/docs` 🔒
Save document metadata after upload.

**Body**
```json
{
  "file_name": "bmdc-certificate.pdf",
  "path": "user-uuid/bmdc-1234567890.pdf",
  "doc_type": "bmdc"
}
```

**Response** `201`
```json
{
  "id": "uuid",
  "doctor_id": "uuid",
  "file_name": "bmdc-certificate.pdf",
  "file_path": "user-uuid/bmdc-1234567890.pdf",
  "doc_type": "bmdc",
  "uploaded_at": "2026-04-27T00:00:00Z"
}
```

---

### GET `/doctors/me/docs` 🔒
List own uploaded verification documents.

**Response** `200` — array of document objects

---

### DELETE `/doctors/me/docs/:docId` 🔒
Delete an uploaded document (removes from storage and DB).

**Response** `204`

---

### GET `/doctors/me/profile` 🔒 `doctor`
Get own doctor profile.

**Response** `200` — full doctor object

---

### PATCH `/doctors/me` 🔒 `doctor`
Update own doctor profile. All fields optional.

**Response** `200` — updated doctor object

---

### GET `/doctors/me/schedules` 🔒 `doctor`
Get own weekly schedules.

**Response** `200` — array of schedule objects

---

### POST `/doctors/me/schedules` 🔒 `doctor`
Add a weekly recurring schedule.

**Body**
```json
{
  "day_of_week": 1,
  "start_time": "09:00",
  "end_time": "17:00",
  "slot_duration_minutes": 30,
  "mode": "in_person",
  "is_active": true
}
```
`day_of_week`: `0`=Sun, `1`=Mon ... `6`=Sat

**Response** `201` — schedule object

---

### PATCH `/doctors/me/schedules/:scheduleId` 🔒 `doctor`
Update a schedule. All fields optional.

**Response** `200` — updated schedule object

---

### DELETE `/doctors/me/schedules/:scheduleId` 🔒 `doctor`
Delete a schedule.

**Response** `204`

---

### POST `/doctors/me/slots` 🔒 `doctor`
Manually add a specific slot.

**Body**
```json
{
  "slot_date": "2026-05-01",
  "start_time": "14:00",
  "end_time": "14:30",
  "mode": "telemedicine"
}
```

**Response** `201` — slot object

---

## 4. Appointments

### GET `/appointments` 🔒
List own appointments.

**Query Params**
| Param | Type | Description |
|-------|------|-------------|
| `status` | string | `pending`, `confirmed`, `completed`, `cancelled`, `no_show` |
| `page` | number | Default `1` |
| `limit` | number | Default `20` |

**Response** `200`
```json
{
  "data": [
    {
      "id": "uuid",
      "mode": "telemedicine",
      "status": "confirmed",
      "payment_status": "paid",
      "fee": 600,
      "doctor_slots": { "slot_date": "2026-05-01", "start_time": "09:00", "end_time": "09:30" },
      "doctors": {
        "specialty": "Cardiology",
        "profiles": { "name": "Dr. Karim", "avatar_url": "https://..." }
      }
    }
  ],
  "total": 5
}
```

---

### GET `/appointments/:id` 🔒
Get a single appointment. Accessible by the patient or the assigned doctor.

**Response** `200` — full appointment object with slot, doctor, and prescriptions

---

### POST `/appointments` 🔒
Book an appointment. Locks the slot for 10 minutes.

**Body**
```json
{
  "doctor_id": "uuid",
  "slot_id": "uuid",
  "mode": "in_person",
  "family_member_id": "uuid",
  "notes": "First visit"
}
```
`family_member_id`: optional, book on behalf of a family member

**Response** `201`
```json
{
  "appointment": { "id": "uuid", "status": "pending", "fee": 800, "..." },
  "lock_expires_at": "2026-05-01T09:10:00Z",
  "message": "Slot locked for 10 minutes. Complete payment to confirm."
}
```

---

### POST `/appointments/:id/confirm-payment` 🔒
Confirm payment and finalise the booking.

**Body**
```json
{
  "payment_method": "bkash",
  "payment_reference": "TXN123456"
}
```

**Response** `200` — updated appointment with `status: "confirmed"`

---

### PATCH `/appointments/:id/cancel` 🔒
Cancel an appointment. Accessible by patient or doctor.

**Response** `200` — updated appointment with `status: "cancelled"`

---

### PATCH `/appointments/:id/complete` 🔒 `doctor`
Mark an appointment as completed.

**Response** `200` — updated appointment with `status: "completed"`

---

### GET `/appointments/doctor/list` 🔒 `doctor`
List own appointments as a doctor.

**Query Params**: `status`, `date` (YYYY-MM-DD), `page`, `limit`

**Response** `200` — paginated appointments with patient profile

---

## 5. Family Members

### GET `/family` 🔒
List all family members.

**Response** `200` — array of family member objects

---

### GET `/family/:id` 🔒
Get a single family member.

**Response** `200`
```json
{
  "id": "uuid",
  "name": "Fatema Begum",
  "relation": "mother",
  "date_of_birth": "1960-05-10",
  "gender": "female",
  "blood_group": "O+",
  "phone": "+8801800000000"
}
```

---

### POST `/family` 🔒
Add a family member.

**Body**
```json
{
  "name": "Fatema Begum",
  "relation": "mother",
  "date_of_birth": "1960-05-10",
  "gender": "female",
  "blood_group": "O+",
  "phone": "+8801800000000"
}
```

**Response** `201` — family member object

---

### PATCH `/family/:id` 🔒
Update a family member. All fields optional.

**Response** `200` — updated object

---

### DELETE `/family/:id` 🔒
Delete a family member.

**Response** `204`

---

## 6. Reminders

### GET `/reminders` 🔒
List medicine reminders.

**Query Params**: `active=true` to filter active only

**Response** `200` — array of reminder objects

---

### GET `/reminders/:id` 🔒
Get a single reminder.

**Response** `200`
```json
{
  "id": "uuid",
  "medicine_name": "Metformin",
  "dosage": "500mg",
  "schedule_times": ["08:00", "20:00"],
  "weekdays": [0, 1, 2, 3, 4, 5, 6],
  "start_date": "2026-01-01",
  "end_date": "2026-06-01",
  "is_active": true,
  "notes": "Take after meals"
}
```

---

### POST `/reminders` 🔒
Create a reminder.

**Body**
```json
{
  "medicine_name": "Metformin",
  "dosage": "500mg",
  "schedule_times": ["08:00", "20:00"],
  "weekdays": [1, 2, 3, 4, 5],
  "start_date": "2026-01-01",
  "end_date": "2026-06-01",
  "notes": "Take after meals"
}
```
`weekdays`: array of `0`=Sun ... `6`=Sat. Omit for all days.

**Response** `201` — reminder object

---

### PATCH `/reminders/:id` 🔒
Update a reminder. All fields optional.

**Response** `200` — updated object

---

### DELETE `/reminders/:id` 🔒
Delete a reminder.

**Response** `204`

---

## 7. Reports

### GET `/reports` 🔒
List medical reports.

**Query Params**
| Param | Type | Description |
|-------|------|-------------|
| `type` | string | e.g. `blood_test`, `xray`, `mri` |
| `family_member_id` | uuid | Filter by family member |
| `page` | number | Default `1` |
| `limit` | number | Default `20` |

**Response** `200`
```json
{ "data": [...], "total": 10 }
```

---

### GET `/reports/:id` 🔒
Get a single report. Returns a fresh signed download URL valid for 1 hour.

**Response** `200`
```json
{
  "id": "uuid",
  "report_type": "blood_test",
  "file_name": "CBC_result.pdf",
  "report_date": "2026-03-01",
  "signed_url": "https://storage.supabase.co/...?token=..."
}
```

---

### POST `/reports/upload-url` 🔒
Step 1 — Get a signed URL to upload a report file.

**Body**
```json
{ "file_name": "CBC_result.pdf" }
```

**Response** `200`
```json
{
  "upload_url": "https://storage.supabase.co/...",
  "path": "uuid/1234567890.pdf"
}
```

> Upload the file via `PUT` to `upload_url`, then call `POST /reports` with the path.

---

### POST `/reports` 🔒
Step 2 — Save report metadata after upload.

**Body**
```json
{
  "report_type": "blood_test",
  "file_name": "CBC_result.pdf",
  "file_url": "https://...",
  "report_date": "2026-03-01",
  "appointment_id": "uuid",
  "family_member_id": "uuid",
  "notes": "Fasting CBC"
}
```
`appointment_id` and `family_member_id` are optional.

**Response** `201` — report object

---

### DELETE `/reports/:id` 🔒
Delete a report.

**Response** `204`

---

## 8. Prescriptions

### GET `/prescriptions` 🔒
List own prescriptions (patient).

**Query Params**: `page`, `limit`

**Response** `200`
```json
{
  "data": [
    {
      "id": "uuid",
      "diagnosis": "Type 2 Diabetes",
      "notes": "Avoid sugar",
      "follow_up_date": "2026-04-01",
      "prescription_medicines": [
        {
          "medicine_name": "Metformin",
          "dosage": "500mg",
          "frequency": "Twice daily",
          "duration": "30 days",
          "instructions": "After meals"
        }
      ],
      "doctors": {
        "specialty": "Endocrinology",
        "profiles": { "name": "Dr. Karim" }
      }
    }
  ],
  "total": 3
}
```

---

### GET `/prescriptions/:id` 🔒
Get a single prescription. Accessible by patient or issuing doctor.

**Response** `200` — full prescription with medicines, doctor, and appointment details

---

### POST `/prescriptions/:id/upload-url` 🔒 `doctor`
Get a signed URL to upload a PDF prescription file for an existing prescription.

**Body**
```json
{ "ext": "pdf" }
```

**Response** `200`
```json
{
  "upload_url": "https://storage.supabase.co/...",
  "path": "doctor-uuid/prescription-uuid.pdf"
}
```

> Upload the file via `PUT` to `upload_url`, then call `PATCH /prescriptions/:id/file`.

---

### PATCH `/prescriptions/:id/file` 🔒 `doctor`
Save the file path after upload.

**Body**
```json
{ "path": "doctor-uuid/prescription-uuid.pdf" }
```

**Response** `200` — updated prescription object with `file_url`

---

### GET `/prescriptions/:id/file` 🔒
Get a fresh signed download URL for the prescription file. Valid for 1 hour.  
Accessible by the patient or the issuing doctor.

**Response** `200`
```json
{
  "signed_url": "https://storage.supabase.co/...?token=...",
  "expires_in": 3600
}
```

---

### POST `/prescriptions` 🔒 `doctor`
Create a prescription for a completed/confirmed appointment.

**Body**
```json
{
  "appointment_id": "uuid",
  "diagnosis": "Type 2 Diabetes",
  "notes": "Avoid sugar",
  "follow_up_date": "2026-04-01",
  "medicines": [
    {
      "medicine_name": "Metformin",
      "dosage": "500mg",
      "frequency": "Twice daily",
      "duration": "30 days",
      "instructions": "After meals"
    }
  ]
}
```

**Response** `201` — prescription with medicines

---

### GET `/prescriptions/doctor/list` 🔒 `doctor`
List prescriptions issued by the doctor.

**Query Params**: `page`, `limit`

**Response** `200` — paginated prescriptions with patient info

---

## 9. Articles

### GET `/articles`
List published articles.

**Query Params**
| Param | Type | Description |
|-------|------|-------------|
| `category` | string | Filter by category |
| `tag` | string | Filter by tag |
| `search` | string | Full-text search |
| `page` | number | Default `1` |
| `limit` | number | Default `20` |

**Response** `200`
```json
{
  "data": [
    {
      "id": "uuid",
      "slug": "diabetes-prevention",
      "title": "How to Prevent Diabetes",
      "excerpt": "...",
      "category": "nutrition",
      "tags": ["diabetes", "diet"],
      "published_at": "2026-01-01T00:00:00Z",
      "view_count": 1240,
      "profiles": { "name": "Dr. Karim", "avatar_url": "https://..." }
    }
  ],
  "total": 50
}
```

---

### GET `/articles/categories/list`
List all distinct article categories.

**Response** `200`
```json
["mental-health", "nutrition", "cardiology"]
```

---

### GET `/articles/:slug`
Get a single article by slug.

**Response** `200` — full article object including `body`, `body_bn`, `title_bn`

---

### POST `/articles` 🔒 `admin`
Create an article.

**Body**
```json
{
  "slug": "diabetes-prevention",
  "title": "How to Prevent Diabetes",
  "title_bn": "ডায়াবেটিস প্রতিরোধ",
  "body": "Full article body...",
  "body_bn": "...",
  "excerpt": "Short summary",
  "cover_image_url": "https://...",
  "category": "nutrition",
  "tags": ["diabetes", "diet"],
  "published": true
}
```

**Response** `201` — article object

---

### PATCH `/articles/:id` 🔒 `admin`
Update an article. All fields optional. Setting `published: true` sets `published_at` to now.

**Response** `200` — updated article object

---

### DELETE `/articles/:id` 🔒 `admin`
Delete an article.

**Response** `204`

---

## 10. Community

### GET `/community/posts`
List visible community posts.

**Query Params**
| Param | Type | Description |
|-------|------|-------------|
| `category` | string | Filter by category |
| `search` | string | Search in title |
| `page` | number | Default `1` |
| `limit` | number | Default `20` |

**Response** `200`
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Managing blood pressure naturally",
      "body": "...",
      "category": "hypertension",
      "is_pinned": false,
      "view_count": 340,
      "profiles": { "name": "Rahim", "avatar_url": "https://..." },
      "post_likes": [{ "count": 24 }],
      "post_comments": [{ "count": 8 }]
    }
  ],
  "total": 200
}
```

---

### GET `/community/posts/:id`
Get a single post.

**Response** `200` — full post object with like/comment counts

---

### POST `/community/posts` 🔒
Create a post.

**Body**
```json
{
  "title": "Managing blood pressure naturally",
  "body": "Here are some tips...",
  "category": "hypertension",
  "tags": ["blood-pressure", "lifestyle"],
  "image_url": "https://..."
}
```

**Response** `201` — post object

---

### PATCH `/community/posts/:id` 🔒
Update own post. All fields optional.

**Response** `200` — updated post object

---

### DELETE `/community/posts/:id` 🔒
Delete own post (admin can delete any).

**Response** `204`

---

### GET `/community/posts/:id/comments`
List comments on a post (threaded via `parent_id`).

**Response** `200`
```json
[
  {
    "id": "uuid",
    "body": "Great advice!",
    "parent_id": null,
    "created_at": "2026-01-01T00:00:00Z",
    "profiles": { "name": "Rahim", "avatar_url": "https://..." }
  }
]
```

---

### POST `/community/posts/:id/comments` 🔒
Add a comment.

**Body**
```json
{
  "body": "Great advice!",
  "parent_id": "uuid"
}
```
`parent_id`: optional, for threaded replies

**Response** `201` — comment object

---

### DELETE `/community/comments/:id` 🔒
Delete own comment.

**Response** `204`

---

### POST `/community/posts/:id/like` 🔒
Like a post.

**Response** `201` — like object  
**Response** `409` if already liked

---

### DELETE `/community/posts/:id/like` 🔒
Unlike a post.

**Response** `204`

---

### POST `/community/posts/:id/report` 🔒
Report a post. Increments the report counter.

**Response** `200`
```json
{ "message": "Reported" }
```

---

### PATCH `/community/posts/:id/hide` 🔒 `admin`
Hide a post (moderation).

**Response** `200` — updated post object

---

## 11. Notifications

### GET `/notifications` 🔒
List own notifications.

**Query Params**
| Param | Type | Description |
|-------|------|-------------|
| `unread` | boolean | `true` for unread only |
| `page` | number | Default `1` |
| `limit` | number | Default `30` |

**Response** `200`
```json
{
  "data": [
    {
      "id": "uuid",
      "type": "appointment_reminder",
      "title": "Appointment in 1 hour",
      "body": "Your in-person appointment is at 09:00.",
      "data": { "appointment_id": "uuid" },
      "is_read": false,
      "created_at": "2026-05-01T08:00:00Z"
    }
  ],
  "total": 12
}
```

**Notification types**: `appointment_reminder`, `no_show`, `medicine_reminder`, `doctor_verified`, `doctor_rejected`

---

### PATCH `/notifications/:id/read` 🔒
Mark a notification as read.

**Response** `200`
```json
{ "message": "Marked as read" }
```

---

### PATCH `/notifications/read-all` 🔒
Mark all notifications as read.

**Response** `200`
```json
{ "message": "All notifications marked as read" }
```

---

## 12. Reviews

### POST `/reviews` 🔒
Submit a review for a completed appointment. One review per appointment.

**Body**
```json
{
  "doctor_id": "uuid",
  "appointment_id": "uuid",
  "rating": 5,
  "comment": "Very professional and helpful."
}
```
`rating`: integer `1`–`5`

**Response** `201` — review object  
**Response** `409` if appointment already reviewed  
**Response** `409` if appointment not completed

---

### PATCH `/reviews/:id` 🔒
Update own review.

**Body**
```json
{
  "rating": 4,
  "comment": "Updated comment"
}
```

**Response** `200` — updated review object

---

## 13. Contact

### POST `/contact`
Submit a contact message. No auth required.

**Body**
```json
{
  "name": "Rahim Uddin",
  "email": "rahim@example.com",
  "subject": "Issue with booking",
  "body": "I am unable to book an appointment..."
}
```

**Response** `201`
```json
{ "message": "Message received. We will get back to you soon." }
```

---

### GET `/contact` 🔒 `admin`
List all contact messages.

**Query Params**
| Param | Type | Description |
|-------|------|-------------|
| `resolved` | boolean | `true` or `false` to filter |
| `page` | number | Default `1` |
| `limit` | number | Default `20` |

**Response** `200` — paginated contact messages

---

### PATCH `/contact/:id/resolve` 🔒 `admin`
Mark a message as resolved.

**Response** `200` — updated message with `resolved_at` timestamp

---

## 14. Telemedicine

### POST `/telemedicine/:appointmentId/token` 🔒
Get a LiveKit room token. Accessible by the patient or doctor of the appointment.

**Response** `200`
```json
{
  "token": "eyJ...",
  "room_name": "appt-uuid",
  "livekit_url": "wss://your-app.livekit.cloud"
}
```

> Use `token` and `livekit_url` with the LiveKit JS SDK to connect to the video room.

---

### DELETE `/telemedicine/:appointmentId/end` 🔒 `doctor`
End the video room and mark the appointment as completed.

**Response** `200`
```json
{ "message": "Room ended" }
```

---

## 15. AI

### POST `/api/ai/chat` 🔒
Chat with Dr. Sasthya AI assistant. Responds in the same language as the message (English or Bengali). **Streaming response (SSE).**

**Body**
```json
{
  "message": "আমার মাথা ব্যথা করছে, কি করব?",
  "session_id": "uuid"
}
```
`session_id`: optional — omit to start a new session, provide to continue an existing one.

**Response** `200` — `text/event-stream`
```
data: {"text": "মাথা ব্যথার "}
data: {"text": "অনেক কারণ "}
data: {"text": "হতে পারে..."}
data: {"done": true, "session_id": "uuid"}
```

**Consuming the stream (JS)**
```js
const res = await fetch('/api/ai/chat', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ message }),
});
const reader = res.body.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  for (const line of decoder.decode(value).split('\n')) {
    if (line.startsWith('data: ')) {
      const { text, done } = JSON.parse(line.slice(6));
      if (text) appendToChat(text);
    }
  }
}
```

---

### POST `/api/ai/nutrition` 🔒
Generate a 7-day Bangladeshi meal plan.

**Body**
```json
{
  "message": "I am diabetic, 45 years old, male, want to lose weight",
  "session_id": "uuid"
}
```

**Response** `200`
```json
{
  "reply": "Day 1:\n- Breakfast: Red rice with vegetables...\n...",
  "session_id": "uuid"
}
```

---

### GET `/api/ai/sessions` 🔒
List own AI chat sessions.

**Query Params**: `type` — `doctor` or `nutrition`

**Response** `200`
```json
[
  { "id": "uuid", "type": "doctor", "created_at": "...", "updated_at": "..." }
]
```

---

### GET `/api/ai/sessions/:id/messages` 🔒
Load message history for a session.

**Response** `200`
```json
[
  { "id": "uuid", "role": "user", "content": "আমার মাথা ব্যথা", "created_at": "..." },
  { "id": "uuid", "role": "assistant", "content": "মাথা ব্যথার...", "created_at": "..." }
]
```

---

### DELETE `/api/ai/sessions/:id` 🔒
Delete a chat session and all its messages.

**Response** `204`

---

## 16. Admin

> All admin endpoints require `admin` role.

### GET `/admin/stats` 🔒 `admin`
Dashboard summary stats.

**Response** `200`
```json
{
  "total_users": 1240,
  "total_doctors": 85,
  "total_appointments": 3400,
  "published_articles": 62,
  "community_posts": 430,
  "open_contact_messages": 7
}
```

---

### GET `/admin/doctors/pending` 🔒 `admin`
List unverified doctors awaiting BMDC verification.

**Response** `200` — array of doctor objects with profile

---

### PATCH `/admin/doctors/:id/verify` 🔒 `admin`
Approve a doctor. Sends an in-app notification to the doctor.

**Response** `200` — updated doctor object with `verified: true`

---

### PATCH `/admin/doctors/:id/reject` 🔒 `admin`
Reject a doctor. Sends an in-app notification with reason.

**Body**
```json
{ "reason": "BMDC number could not be verified." }
```

**Response** `200`
```json
{ "message": "Rejection notification sent" }
```

---

### GET `/admin/users` 🔒 `admin`
List all users with roles.

**Query Params**
| Param | Type | Description |
|-------|------|-------------|
| `search` | string | Search by name |
| `page` | number | Default `1` |
| `limit` | number | Default `20` |

**Response** `200` — paginated user profiles with roles

---

### PATCH `/admin/users/:id/role` 🔒 `admin`
Add or remove a role from a user.

**Body**
```json
{
  "role": "doctor",
  "action": "add"
}
```
`role`: `patient` | `doctor` | `admin`  
`action`: `add` | `remove`

**Response** `200`
```json
{ "message": "Role doctor added" }
```

---

### GET `/admin/doctors/:id/docs` 🔒 `admin`
List all uploaded verification documents for a doctor, each with a fresh 1-hour signed URL.

**Response** `200`
```json
[
  {
    "id": "uuid",
    "file_name": "bmdc-certificate.pdf",
    "doc_type": "bmdc",
    "uploaded_at": "2026-04-27T00:00:00Z",
    "signed_url": "https://storage.supabase.co/...?token=..."
  }
]
```

---

### GET `/admin/community/reported` 🔒 `admin`
List community posts with reports, sorted by report count.

**Response** `200` — array of post objects with `report_count` and author name

---

## Health Check

### GET `/health`
Check if the server is running. No auth required.

**Response** `200`
```json
{
  "status": "ok",
  "service": "sasthya-sathi-backend",
  "ts": "2026-04-27T12:00:00.000Z"
}
```

---

## Role Reference

| Symbol | Meaning |
|--------|---------|
| 🔒 | Requires `Authorization: Bearer <token>` |
| `doctor` | Also requires `doctor` role |
| `admin` | Also requires `admin` role |
| *(no symbol)* | Public endpoint |
