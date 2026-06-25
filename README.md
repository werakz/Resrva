# Resrva

Resrva is a full-stack restaurant reservation management system built for the Old Canberra Inn assessment scenario. It includes public booking forms, a manager dashboard, table and area management, calendar capacity views, configurable online booking rules, and manager customer messaging.

## Stack

- Frontend: React 19, TypeScript, Vite, Tailwind CSS
- Backend: PHP 8 with PDO
- Database: MySQL
- Local runtime: XAMPP or PHP's built-in server

## Demo Account

| Role | Email | Password |
| --- | --- | --- |
| Manager | `manager@resrva.test` | `Password123!` |

Customers do not log in. They use the public table booking and function request forms.

## Deployment / Demo Link

This assessment build is designed for local XAMPP deployment.

- Local frontend demo: `http://localhost:5173`
- Local PHP API through XAMPP: `http://localhost/Resrva/api/index.php`
- PHP built-in API alternative: `http://127.0.0.1:8000/index.php`

## Main Features

- Public table booking form with editable booking terms.
- Public function request form for larger/private events.
- Manager dashboard with today's bookings, guest counts, pending actions, guest volume chart, and upcoming functions.
- Bookings and functions management with filtering, status updates, table assignment, and customer notification prompts.
- Customer message composer for manager-written booking updates.
- Calendar view showing lunch/dinner capacity based on reservable tables.
- Table and area management, including reservable/not reservable table status.
- Settings for venue details, venue image, online booking availability, blocked online dates, booking rules, opening hours, and terms and conditions.
- Manager user management and profile/avatar editing.
- Server-side validation, prepared statements, session checks, and audit activity logging.

## Booking Rules

The seeded defaults follow the Old Canberra Inn assessment context:

- Public table bookings default to groups of 8 to 29 guests.
- Smaller groups are expected to walk in.
- Larger/private events should use the function request form.
- Christmas Day is seeded as an annual closed date.
- Managers can override public booking limits when creating internal bookings.

These values can be edited from the manager Settings page.

## Setup With XAMPP

1. Start Apache and MySQL in XAMPP.
2. Import `database/schema.sql` into MySQL.
   - phpMyAdmin: create/select the database and import the SQL file.
   - CLI: `mysql -u root < database/schema.sql`
3. Confirm the database connection in `api/config.php`.
   - Default database: `resrva`
   - Default username: `root`
   - Default password: empty
4. Serve the project through Apache, for example as `/Resrva`.
   - Expected API URL: `http://localhost/Resrva/api/index.php`
5. Install and run the frontend:

```powershell
cd frontend
npm install
npm run dev
```

6. Open the Vite URL, usually `http://localhost:5173`.

If the API is hosted somewhere else, set `VITE_API_URL` before starting Vite:

```powershell
cd frontend
$env:VITE_API_URL='http://localhost/Resrva/api/index.php'
npm run dev
```

## Setup Without Apache

From the project root:

```powershell
php -S 127.0.0.1:8000 -t api
```

In a second terminal:

```powershell
cd frontend
$env:VITE_API_URL='http://127.0.0.1:8000/index.php'
npm run dev -- --host 127.0.0.1 --port 5173
```

## Public URLs

- Table bookings: `/`
- Function requests: `/functions`
- Booking terms: `/terms`
- Manager sign in: `/signin`

## Build And Checks

```powershell
php -l api/index.php
cd frontend
npm run build
npm run lint
```

The production frontend output is generated in `frontend/dist`. It is ignored because it can be rebuilt from source.

## Repository Structure

```text
api/                 PHP API, upload handling, authentication, booking logic
database/            MySQL schema and seed data
docs/                Assessment documentation and evidence
frontend/            React manager dashboard and public booking forms
```

## Documentation Pack

- `docs/project-proposal.md`
- `docs/system-design.md`
- `docs/security-risk-register.md`
- `docs/test-evidence.md`
- `docs/messaging.md`
- `docs/submission-checklist.md`
- `docs/Resrva-assignment-presentation.pptx`

## Messaging Statement

Resrva includes a regular message composer for managers. Staff write the subject and message themselves, and the system stores the message in `email_logs` for auditable local demo evidence.
