# AI Governance Appendix

## AI Feature

Resrva implements an AI-assisted automatic table assignment feature. The system recommends the best table or table set for a booking based on rules and current database state.

## Why This Is Low Risk

- It runs locally in PHP and MySQL.
- It does not send personal data to a public AI provider.
- It produces explainable recommendations instead of opaque generated text.
- Managers can review, accept, or override the result.
- Suggestions and overrides are logged for auditability.

## Data Used

The assignment engine uses:

- Booking date and time.
- Guest count.
- Customer preferred area, if supplied.
- Booking duration.
- Active tables and capacities.
- Existing overlapping bookings.
- Approved or confirmed function blocks.

It does not need customer names, emails, or phone numbers to calculate the table recommendation.

## Human-in-the-Loop Mechanism

For public table bookings, the system creates the booking automatically because the rule set is deterministic and auditable. Managers can still review, update status, edit tables, or override records afterward.

For function requests, the system does not auto-confirm. A manager must review the request, choose the final area, write a customer message, and approve/confirm/decline it.

## Logging

Every assignment creates an `ai_assignment_logs` record containing:

- Booking reference.
- Suggested area.
- Suggested table numbers.
- Explanation.
- Rules snapshot.
- Final table numbers.
- Whether the manager overrode the recommendation.
- Timestamp.

## Limitations

- The engine assumes all tables have capacity 8 by default unless managers update them.
- It does not model physical table distance beyond same-area and consecutive table-number preference.
- It does not know special venue operations unless managers enter them into settings or table availability.
- It simulates intelligence through local rules and auditability rather than a generative AI model.

## Mitigations

- Managers can mark tables inactive.
- Managers can override table assignments.
- Function areas are blocked during confirmed function bookings.
- All recommendations are explainable and logged.
- Sensitive personal data remains local.
