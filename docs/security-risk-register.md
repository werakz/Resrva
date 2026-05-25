# Security and Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| SQL injection through forms or filters | Data leakage or corruption | All database access uses PDO prepared statements and typed parameters. |
| Weak password storage | Manager account compromise | Manager passwords are stored with PHP `password_hash`; login uses `password_verify`. |
| Unauthorised dashboard access | Booking/customer data exposure | Manager routes require an active authenticated session and role check. |
| Invalid or malicious booking input | Bad records, double bookings, unreliable data | Client-side validation is supported by server-side validation for email, phone, date, time, guest limits, and opening hours. |
| Double booking overlapping tables | Operational conflict | Assignment checks booking date/time overlap before choosing tables. |
| AI recommendation accepted blindly | Poor table allocation or unfair decision | AI assignment is local, explainable, logged, and manager-overridable. |
| Sensitive data sent to external AI | Privacy breach | No public AI service is called; customer data remains in local MySQL. |
| Real email failures in demo | Missing confirmation evidence | Email is simulated through `email_logs` so messages are auditable in XAMPP. |
| Dependency vulnerabilities | Security exposure in production | npm audit advisories are documented; production handover should upgrade and retest dependencies. |
| Local config leakage | Password exposure | Machine-specific config can be placed in ignored `api/config.local.php`. |
