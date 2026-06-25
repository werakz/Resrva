# Security and Risk Register

| Risk | Impact | Mitigation |
| SQL injection through forms, filters, or IDs | Data leakage, booking tampering, or database corruption | Backend database access uses PHP PDO prepared statements, typed parameters, and server-side validation before SQL execution. |
| Unauthorised dashboard access | Customer data, settings, and manager tools could be exposed | Manager routes require an authenticated session and active manager account. Passwords are stored with `password_hash` and verified with `password_verify`. |
| Invalid booking data or double booking | Operational conflict, incorrect capacity, or poor customer experience | Server-side validation checks dates, times, guest limits, opening hours, blocked dates, overlapping bookings, and function area clashes. |
| Manager message contains incorrect, unsafe, or misleading wording | Customer confusion, reputational risk, or unapproved promises | Messages are written manually by authenticated staff and logged for review/audit. |

## Additional Controls

- File uploads are limited to image MIME types and a 5 MB maximum.
- `api/config.local.php` can hold machine-specific credentials and is ignored by Git.
- Email sending is simulated through `email_logs` for auditable local demo evidence.
- Activity logging records important manager actions for traceability.
- `npm audit`, PHP syntax checks, linting, and production build checks are used before submission.
