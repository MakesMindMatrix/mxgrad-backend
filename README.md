# GCC-Startup Portal – Backend

Node.js (Express) API with PostgreSQL, JWT auth, and RBAC.

## Setup

1. **PostgreSQL**  
   Create a database, e.g. `gcc_startup_portal`.

2. **Environment**  
   Copy `.env.example` to `.env` and set:
   - `DATABASE_URL` – e.g. `postgresql://user:password@localhost:5432/gcc_startup_portal`
   - `JWT_SECRET` – strong secret for production
   - `PORT` (optional, default 4000)
   - `CORS_ORIGIN` (optional, e.g. `http://localhost:5173` for frontend dev)

3. **Install and init DB**
   ```bash
   npm install
   npm run db:init
   npm run db:seed
   ```
   Seed creates an admin user: `admin@gccstartup.local` / `Admin123!` (override with `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`).

4. **Run**
   ```bash
   npm run dev
   ```
   API: `http://localhost:4000`

## API overview

- **POST /api/auth/register** – Register as GCC or STARTUP (approval_status = PENDING).
- **POST /api/auth/login** – Login; returns 403 with `code: 'PENDING_APPROVAL'` if not approved.
- **GET /api/auth/me** – Current user (Bearer token).

- **GET/PUT /api/gcc/profile** – GCC profile (GCC only).
- **GET/POST /api/gcc/requirements** – List/create requirements (GCC only).
- **GET/PUT/DELETE /api/gcc/requirements/:id** – Single requirement (GCC only).

- **GET/PUT /api/startup/profile** – Startup profile, tabbed fields (STARTUP only).

- **GET /api/requirements** – List open requirements (public).
- **GET /api/requirements/:id** – Single requirement (public).
- **POST /api/requirements/:id/express-interest** – Express interest (STARTUP only).
- **GET /api/requirements/my/interests** – My expressions (STARTUP only).

- **GET /api/admin/approvals** – Pending users (ADMIN only).
- **POST /api/admin/approvals/:userId/approve** – Approve (ADMIN only).
- **POST /api/admin/approvals/:userId/reject** – Reject (ADMIN only).

All protected routes use `Authorization: Bearer <token>` and RBAC by role (ADMIN, GCC, STARTUP).
