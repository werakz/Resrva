# Test Evidence

The following cases are designed for manual demonstration in XAMPP. They include positive and negative coverage for login, public forms, booking rules, manager operations, and customer messages.

| ID | Test | Type | Expected Result |
| --- | --- | --- | --- |
| T01 | Manager logs in with `manager@resrva.test` / `Password123!` | Positive | Dashboard loads and manager name/avatar area appears in header. |
| T02 | Manager logs in with wrong password | Negative | Login is rejected with an error message. |
| T03 | Customer submits table booking for 8 guests within opening hours | Positive | Booking is confirmed, table assigned, and email log created. |
| T04 | Customer submits booking for 4 guests | Negative | System explains smaller groups should walk in. |
| T05 | Customer submits table booking for 35 guests | Negative | System directs user to the function request flow. |
| T06 | Customer submits booking on Christmas Day | Negative | Booking is rejected because the venue is closed. |
| T07 | Two overlapping table bookings are created for the same service | Positive/negative | Second booking receives different available table(s) or is rejected if no suitable table remains. |
| T08 | Customer submits function request | Positive | Request is saved as pending and acknowledgement email is logged. |
| T09 | Manager approves or confirms a function and enters a customer message | Positive | Status updates and customer message is saved to email log. |
| T10 | Manager filters bookings by search, date, service, or status | Positive | Booking list updates to matching results. |
| T11 | Manager changes a table between reservable and not reservable | Positive | Table status updates and calendar capacity uses reservable tables. |
| T12 | Manager blocks online bookings for a selected date | Positive | Public form prevents bookings on that date and calendar/settings show the block. |
| T13 | Manager sends a customer message for a booking | Positive | Manager enters subject/body manually and the message is saved to the email log. |
| T14 | Manager uploads venue or profile image | Positive | Image is validated, stored, and displayed in the relevant UI. |

## Verification Logs

Completed locally before final submission:

```text
php -l api/index.php
php -l api/config.php
npm run lint
npm run build
npm audit
```

Result:

- PHP syntax checks passed.
- ESLint passed.
- React/TypeScript production build passed.
- `npm audit` reported 0 vulnerabilities.
- Vite emitted a large bundle warning only; this does not fail the build and is acceptable for the local assessment demo.

## Demo URLs

When running with the PHP built-in server and Vite:

```text
Public booking form: http://127.0.0.1:5173/
Function request form: http://127.0.0.1:5173/functions
Terms page: http://127.0.0.1:5173/terms
Manager sign in: http://127.0.0.1:5173/signin
API: http://127.0.0.1:8000/index.php
```
