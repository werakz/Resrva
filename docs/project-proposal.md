# Project Proposal

## Project Name

Resrva

## Client

Old Canberra Inn, a family-friendly pub in Lyneham ACT with table bookings, functions, food service, and live music.

## Problem Statement

Old Canberra Inn needs a simple reservation management system that supports online booking requests while helping managers keep table assignments, function enquiries, and booking communication organised. Manual tracking can lead to double-booking, missed follow-up messages, and limited audit evidence.

## Target Users

- Customers: submit online table bookings or function requests without needing an account.
- Managers: sign in to manage bookings, functions, table areas, users, settings, AI assignment logs, and simulated email logs.

## Scope

Resrva will provide:

- Public table booking form for groups of 8 to 29.
- Public function request form for private events or larger groups.
- Manager dashboard using TailAdmin.
- Table and area data for OSF, Schumack, Wisteria, Stables, Kookaburra, and Main Bar.
- Local AI-assisted table assignment with human review/override logging.
- Booking search, filter, pagination, and calendar.
- Manager user management.
- Security-focused PHP API with PDO prepared statements.

## Technology Stack

- React + TypeScript + Vite for the frontend.
- TailAdmin React/Tailwind UI kit for dashboard layout and responsive components.
- PHP 8 with PDO for backend API logic.
- MySQL for persistent database storage.
- XAMPP for local development and demonstration.

React is justified because Resrva needs stateful forms, dashboard tables, filtering, calendar interactions, and reusable UI components.


