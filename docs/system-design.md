# System Design

## Architecture Diagram

```text
Customer browser
  -> React public pages
  -> PHP API
  -> MySQL database

Manager browser
  -> React manager dashboard
  -> PHP API with session authentication
  -> MySQL database

Optional AI reply composer
  -> OpenAI Chat Completions API when OPENAI_API_KEY is configured
  -> Local deterministic fallback when no API key is configured
```

## Main Modules

- Public booking module: validates customer table bookings and creates confirmed booking records.
- Public function request module: accepts function enquiries as pending manager-review records.
- Manager dashboard: shows daily KPIs, pending actions, guest chart data, today's bookings, and upcoming functions.
- Bookings module: provides manager create/update workflows for table bookings.
- Functions module: provides manager create/update workflows for function requests and confirmed functions.
- Calendar module: shows booking volume and table capacity by date and service.
- Tables/areas module: stores area records, table numbers, capacities, and reservable status.
- Settings module: stores venue details, venue image, booking rules, blocked online dates, opening hours, and terms.
- Users/profile module: manages manager accounts, status, passwords, and avatar uploads.
- AI reply composer: drafts customer-facing replies from booking context and manager instructions.
- Audit/email logs: stores simulated email history and activity evidence for the local demo.

## ERD Summary

```text
users
  1 -> many bookings.created_by_user_id
  1 -> many bookings.updated_by_user_id
  1 -> many activity_logs.user_id
  1 -> many ai_assignment_logs.accepted_by_user_id

customers
  1 -> many bookings

areas
  1 -> many venue_tables
  1 -> many bookings.preferred_area_id
  1 -> many bookings.assigned_area_id
  many -> many bookings through booking_function_areas

bookings
  many -> many venue_tables through booking_tables
  1 -> many ai_assignment_logs
  1 -> many email_logs

settings
  key/value booking rules, venue details, terms, and image URL

opening_hours
  7 rows, one per day of week

online_booking_blocks
  dates where public online bookings are turned off

activity_logs
  audit record for sign-in, create, update, delete, settings, and AI reply actions
```

## Important Tables

| Table | Purpose |
| --- | --- |
| `users` | Manager login accounts with password hashes and avatar URL. |
| `customers` | Public customer contact records. |
| `areas` | Venue areas such as OSF, Schumack, Wisteria, Stables, Kookaburra, and Main Bar. |
| `venue_tables` | Table number, area, capacity, and reservable status. |
| `bookings` | Table bookings and function requests/bookings. |
| `booking_tables` | Many-to-many assigned table links. |
| `booking_function_areas` | Many-to-many function area links. |
| `ai_assignment_logs` | Rule-based table assignment recommendations and manager overrides. |
| `email_logs` | Simulated outgoing email and AI reply evidence. |
| `activity_logs` | Audit history for manager actions. |
| `settings` | Booking rules, venue details, terms, online booking controls. |
| `opening_hours` | Daily venue opening/closing validation. |
| `online_booking_blocks` | Individual dates where public online booking is disabled. |

## API Endpoints

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| GET | `meta` | Public | Areas, function areas, settings, opening hours, blocked dates. |
| POST | `public/table-bookings` | Public | Create public table booking. |
| POST | `public/function-requests` | Public | Create public function request. |
| POST | `auth/login` | Public | Manager login. |
| POST | `auth/logout` | Manager | Manager logout. |
| GET | `auth/me` | Public | Current session user. |
| GET | `dashboard` | Manager | Dashboard statistics and lists. |
| GET | `bookings` | Manager | Paginated table/function booking list. |
| POST | `bookings` | Manager | Create manual table booking. |
| PUT | `bookings/{id}` | Manager | Update booking details, status, tables, or notification prompt. |
| POST | `bookings/{id}/reply-draft` | Manager | Generate AI-assisted customer reply draft. |
| POST | `bookings/{id}/reply-log` | Manager | Save reviewed reply to email log. |
| GET | `functions` | Manager | Paginated function list. |
| POST | `functions` | Manager | Create manager function booking. |
| PUT | `functions/{id}` | Manager | Update function request/booking. |
| GET | `calendar` | Manager | Calendar event list and blocked online dates. |
| GET | `tables` | Manager | Areas and tables. |
| POST | `tables` | Manager | Add a table. |
| PUT | `tables/{id}` | Manager | Update table area, number, capacity, reservable status. |
| DELETE | `tables/{id}` | Manager | Delete unused table. |
| POST | `areas` | Manager | Add venue area. |
| PUT | `areas/{id}` | Manager | Update venue area. |
| DELETE | `areas/{id}` | Manager | Delete or deactivate area. |
| GET | `online-booking-blocks` | Manager | List blocked public booking dates. |
| POST | `online-booking-blocks` | Manager | Block public booking for one date. |
| DELETE | `online-booking-blocks/{date}` | Manager | Remove date block. |
| GET | `settings` | Manager | Booking settings. |
| PUT | `settings` | Manager | Update rules and opening hours. |
| POST | `settings/venue-image` | Manager | Upload venue image. |
| DELETE | `settings/venue-image` | Manager | Remove venue image. |
| GET | `users` | Manager | List manager users. |
| POST | `users` | Manager | Create manager user. |
| PUT | `users/{id}` | Manager | Update manager status/password. |
| POST | `profile` | Manager | Update current manager profile. |
| POST | `profile/avatar` | Manager | Upload profile image. |
| DELETE | `profile/avatar` | Manager | Remove profile image. |
| GET | `email-logs` | Manager | Simulated email history. |
| GET | `activity-logs` | Manager | Manager activity history. |

## Table Assignment Logic

1. Validate date, time, slot interval, minimum notice, and opening hours.
2. Apply public booking rules: smaller groups are walk-ins and larger table groups are directed to functions.
3. Calculate the booking duration and end time.
4. Find overlapping booking tables and function area blocks.
5. Prefer the customer's requested area when it is available.
6. Prefer a single table when possible, otherwise choose the smallest same-area table set.
7. Save the booking, assigned tables, simulated email log, and assignment audit record.
8. Allow managers to override assignments, including selecting not-reservable tables after confirmation.
