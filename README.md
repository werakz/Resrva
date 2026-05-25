# Resrva

Resrva is a full-stack reservation management system for **Old Canberra Inn**. It supports public table bookings, public function requests, and a manager dashboard for bookings, functions, calendar views, table areas, AI-assisted table assignment logs, manager users, and booking rules.

## Stack

- Frontend: React 19, TypeScript, Vite, TailAdmin React/Tailwind UI kit
- Backend: PHP 8 with PDO
- Database: MySQL
- Runtime target: XAMPP local demo

## Demo Accounts

| Role | Email | Password |
| --- | --- | --- |
| Manager | `manager@resrva.test` | `Password123!` |

Customers do not log in. They submit table bookings and function requests through the public forms.

## Main Features

- Manager session authentication with hashed passwords
- Public table booking form for groups of 8 to 29
- Public function request form for larger/private events
- Automatic table assignment using local AI-assisted rules
- Manager review and override path with audit logging
- CRUD-style booking and function management
- Manager user creation and activation/deactivation
- Search, filter, and pagination on bookings/functions
- Responsive TailAdmin dashboard
- Server-side validation, prepared statements, and access checks
- Simulated email delivery through an `email_logs` table

## Booking Rules

Old Canberra Inn public information says the kitchen hours are:

- Sunday and public holidays: 12:00 PM to 9:00 PM
- Monday to Thursday: 12:00 PM to 9:30 PM
- Friday to Saturday: 12:00 PM to 10:00 PM
- Closed Christmas Day

The venue also notes that table bookings are for groups of eight or more, with smaller groups encouraged to walk in. Source: <https://www.oldcanberrainn.com.au/>

## Setup

1. Start Apache and MySQL in XAMPP.
2. Create the database by importing `database/schema.sql` into MySQL.
   - phpMyAdmin: choose Import, select `database/schema.sql`, run it.
   - CLI if available: `mysql -u root < database/schema.sql`
3. Confirm API database settings in `api/config.php`.
   - Default database: `resrva`
   - Default username: `root`
   - Default password: empty
4. Place or keep this project where Apache can serve it as `/Resrva`.
   - Expected API URL: `http://localhost/Resrva/api/index.php`
5. Install and run the React frontend:

```powershell
cd frontend
npm install
npm run dev
```

6. Open the Vite URL shown in the terminal, usually `http://localhost:5173`.

If your API is served at a different URL, set:

```powershell
$env:VITE_API_URL='http://localhost/Resrva/api/index.php'
npm run dev
```

### Alternative Without Moving to htdocs

From the project root, run the PHP API with PHP's built-in server:

```powershell
php -S 127.0.0.1:8000 -t api
```

In a second terminal:

```powershell
cd frontend
$env:VITE_API_URL='http://127.0.0.1:8000/index.php'
npm run dev -- --host 127.0.0.1 --port 5173
```

## Build

```powershell
cd frontend
npm run build
```

The production frontend is generated in `frontend/dist`.

## Repository Structure

```text
api/                 PHP API and configuration
database/            MySQL schema and seed data
docs/                Assessment documentation pack
frontend/            React + TailAdmin frontend
```

## AI Use Statement

Resrva uses a local AI-assisted rules engine for table assignment. It does not send customer data to public AI services. The system recommends an area/table set based on party size, customer area preference, booking duration, existing reservations, function blocks, and active tables. Managers can review and override assignments, and each recommendation or override is recorded in `ai_assignment_logs`.

AI-assisted output is treated as a recommendation, not an autonomous decision-maker. Confirmation emails are simulated through the database for audit evidence.

## Known Notes

- Email sending is simulated through `email_logs` because SMTP credentials are not available for the XAMPP demo.
- TailAdmin template dependencies currently report npm audit advisories. The app builds successfully; a production handover should review dependency updates carefully before deployment.
- The project is configured for local demonstration and should receive environment-specific hardening before internet deployment.
