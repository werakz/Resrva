# Test Evidence

The following cases are designed for manual demonstration in XAMPP. Screenshots can be added beside this file after running the demo.

| ID | Test | Type | Expected Result |
| --- | --- | --- | --- |
| T01 | Manager logs in with `manager@resrva.test` / `Password123!` | Positive | Dashboard loads and manager name appears in header. |
| T02 | Manager logs in with wrong password | Negative | Login is rejected with an error message. |
| T03 | Customer submits table booking for 8 guests within opening hours | Positive | Booking is confirmed, table assigned, email log created. |
| T04 | Customer submits booking for 4 guests | Negative | System explains smaller groups should walk in. |
| T05 | Customer submits booking for 35 guests | Negative | System directs user to function request form. |
| T06 | Customer submits booking on Christmas Day | Negative | Booking is rejected because the venue is closed. |
| T07 | Two overlapping table bookings are created | Positive/negative | Second booking receives different available table(s) or is rejected if none fit. |
| T08 | Customer submits function request | Positive | Request is saved as pending and acknowledgement email is logged. |
| T09 | Manager approves a function and writes a message | Positive | Status updates and customer message is saved to email log. |
| T10 | Manager filters bookings by status/search | Positive | Booking table updates and pagination metadata remains visible. |
| T11 | Manager changes a table capacity/active status | Positive | Table record updates and assignment uses new state. |
| T12 | AI assignment log is opened | Positive | Suggested area, tables, explanation, and final acceptance are visible. |

## Build Verification

Completed locally:

```text
php -l api/index.php
php -l api/config.php
npm run build
```

Result: PHP syntax checks passed. React production build passed. TailAdmin CSS emitted upstream minification warnings but did not fail the build.
