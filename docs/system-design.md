# System Design

## Architecture

```text
Customer browser
  -> React public booking/function pages
  -> PHP API
  -> MySQL database

Manager browser
  -> React TailAdmin dashboard
  -> PHP API with session authentication
  -> MySQL database
```

## Main Modules

- Public booking module: validates customer table booking details and creates confirmed bookings.
- Function request module: accepts event/function requests for manager review.
- Manager dashboard: shows key operational metrics and recent activity.
- Bookings module: provides CRUD-style manager control for table bookings.
- Tables/areas module: stores table numbers, capacities, active state, and function-enabled areas.
- AI assignment module: recommends tables and logs suggestions or manager overrides.
- Users module: manages manager accounts.
- Settings module: manages booking rules and opening hours.

## ERD Summary

```text
users
  1 -> many bookings.created_by_user_id
  1 -> many bookings.updated_by_user_id
  1 -> many ai_assignment_logs.accepted_by_user_id

customers
  1 -> many bookings

areas
  1 -> many venue_tables
  1 -> many bookings.preferred_area_id
  1 -> many bookings.assigned_area_id

bookings
  many -> many venue_tables through booking_tables
  1 -> many ai_assignment_logs
  1 -> many email_logs

settings
  key/value booking rules

opening_hours
  7 rows, one per day of week

activity_logs
  audit record for sign-in, create, update, and settings changes
```

## Important Tables

| Table | Purpose |
| --- | --- |
| `users` | Manager login accounts with password hashes |
| `customers` | Public customer contact records |
| `areas` | OSF, Schumack, Wisteria, Stables, Kookaburra, Main Bar |
| `venue_tables` | Tables 1 to 73, capacity and active state |
| `bookings` | Table bookings and function requests |
| `booking_tables` | Assigned table links |
| `ai_assignment_logs` | AI-assisted recommendations and overrides |
| `email_logs` | Simulated outgoing email evidence |
| `settings` | Booking duration, min/max guests, venue details |
| `opening_hours` | Daily opening/closing validation |

## API Endpoints

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| GET | `meta` | Public | Areas, function areas, settings, opening hours |
| POST | `public/table-bookings` | Public | Create auto-confirmed table booking |
| POST | `public/function-requests` | Public | Create pending function request |
| POST | `auth/login` | Public | Manager login |
| POST | `auth/logout` | Manager | Manager logout |
| GET | `auth/me` | Public | Current session |
| GET | `dashboard` | Manager | Dashboard statistics |
| GET | `bookings` | Manager | Paginated table bookings |
| POST | `bookings` | Manager | Create manual table booking |
| PUT | `bookings/{id}` | Manager | Update booking status/assignment |
| GET | `functions` | Manager | Paginated function requests |
| PUT | `functions/{id}` | Manager | Approve/confirm/decline function |
| GET | `calendar` | Manager | Calendar event list |
| GET | `tables` | Manager | Areas and tables |
| PUT | `tables/{id}` | Manager | Update table capacity/active state |
| GET | `ai-logs` | Manager | AI assignment log |
| GET | `email-logs` | Manager | Simulated email log |
| GET | `users` | Manager | List manager users |
| POST | `users` | Manager | Create manager user |
| PUT | `users/{id}` | Manager | Update manager status/password |
| GET | `settings` | Manager | Booking settings |
| PUT | `settings` | Manager | Update rules and opening hours |

## Table Assignment Logic

1. Validate the booking date, time, slot interval, and venue opening hours.
2. Reject groups below 8 and direct groups above 29 to functions.
3. Calculate the 2-hour booking window.
4. Find unavailable tables from overlapping bookings.
5. Block function-enabled areas when an approved/confirmed function overlaps.
6. Prefer the customer's requested area when available.
7. Prefer a single table if it fits.
8. Otherwise choose the smallest same-area table set.
9. Save the recommendation and final accepted assignment in `ai_assignment_logs`.
