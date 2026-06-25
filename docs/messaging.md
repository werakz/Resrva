# Messaging Appendix

Resrva no longer includes a generated customer reply composer.

Customer communication is handled through a regular manager-written message composer. Staff enter the subject and message manually, and the PHP API stores the result in `email_logs` for local demo audit evidence.

No booking/customer details are sent to an external provider for message generation.

The database still contains legacy `ai_assignment_*` table names for rule-based table assignment recommendation history. Those records are not customer-message generation and do not call an external AI service.
