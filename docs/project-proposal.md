# Project Proposal

## Project Name

Resrva

## Client Context

Resrva is designed for the Old Canberra Inn assessment scenario. The venue needs a practical reservation system that supports public table bookings, function enquiries, and manager operations online.

## Problem Statement

Manual booking processes can make it difficult for venue staff to track customer requests, table capacity, function bookings, blocked online dates, and customer communication. A paper or spreadsheet process also creates limited audit evidence for testing, security review, and assessment demonstration.

Resrva solves this by providing one full-stack application where customers can submit requests online and managers can review, edit, assign, and communicate from a controlled dashboard.

## Target Users

| User | Needs |
| --- | --- |
| Customers | Submit a table booking or function request without creating an account. |
| Venue managers | Manage bookings, functions, tables, areas, settings, users, and customer replies. |

## Main Features

- Public table booking form with date, service, time, guest count, details, terms, and venue branding.
- Public function request form for larger/private events.
- Manager dashboard with today's bookings, guest counts, pending actions, overview chart, today's booking list, and upcoming functions.
- Booking and function management with search, filtering, status updates, table/area assignment, and customer communication prompts.
- Calendar view showing lunch/dinner capacity based on reservable tables and blocked online booking dates.
- Tables and areas administration with add/edit/delete controls and reservable/not reservable status.
- Settings for venue details, venue image, online booking availability, advance notice, opening hours, blocked dates, and terms and conditions.
- Manager user management and profile/avatar editing.
- AI-assisted reply composer that drafts customer-facing messages from booking context and manager instructions.
- Server-side validation, PDO prepared statements, session authentication, upload validation, and audit/email logs.

## Technology Stack

| Layer | Technology | Reason |
| --- | --- | --- |
| Frontend | React 19, TypeScript, Vite | Supports stateful forms, dashboard views, reusable components, and fast local development. |
| UI | Tailwind CSS and TailAdmin-style components | Provides a clean admin dashboard style with responsive form controls and cards. |
| Backend | PHP 8 with PDO | Fits the XAMPP requirement and keeps the API easy to run locally. |
| Database | MySQL | Stores users, bookings, customers, tables, areas, settings, logs, and opening hours. |
| AI | Optional OpenAI Chat Completions API with local fallback | Allows an AI feature while keeping the demo usable without external credentials. |
| Runtime | XAMPP or PHP built-in server plus Vite | Matches classroom/demo deployment expectations. |

## Team Roles

Full Stack Development 

## Milestones

| Milestone | Outcome |
| --- | --- |
| 1. Requirements and proposal | Confirm venue scenario, booking rules, target users, and required deliverables. |
| 2. Database and API foundation | Create MySQL schema, PHP config, session login, and core API helpers. |
| 3. Public booking experience | Build table booking, function request, booking terms, and venue image support. |
| 4. Manager operations | Build dashboard, bookings, functions, calendar, table/area management, settings, and users. |
| 5. AI feature and governance | Add AI reply composer, prompt controls, fallback generator, review step, and logging. |
| 6. Testing and documentation | Run build checks, document test cases, update risk register, system design, and AI appendix. |
| 7. Final submission | Clean repository, confirm README setup steps, include SQL schema, and prepare presentation/demo. |

## Success Criteria

- A manager can run the app locally, sign in, and manage bookings/functions.
- Customers can submit table bookings and function requests through public pages.
- The database schema can be imported from `database/schema.sql`.
- The documentation pack covers proposal, system design, security risks, test evidence, and AI governance.
- The AI feature is human-reviewed and does not send messages automatically.
