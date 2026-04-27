# AI Calory Backend

Express backend for the AI Calory project using Supabase as the database.

## Setup

1. Copy `.env.example` to `.env`.
2. Set `SUPABASE_SERVICE_ROLE_KEY` from your Supabase project.
3. Run `npm install`.
4. Run `npm run dev` to start the server in development.

## Endpoints

- `GET /health`
- `GET /food-items`
- `GET /food-items/:id`
- `POST /food-items`
- `PUT /food-items/:id`
- `DELETE /food-items/:id`

## Notes

This backend uses Supabase for database storage and does not use or modify the existing app tables shown in the current schema. The new table created is `food_items`.
