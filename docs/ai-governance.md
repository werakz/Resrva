# AI Governance Appendix

## AI Feature Chosen

Resrva implements an AI-assisted customer reply composer for managers. The feature appears inside booking/function management and drafts a customer-facing email reply using the selected booking, reply type, and manager instructions.

The AI does not create, approve, cancel, or send bookings automatically. It only drafts text for a manager to review.

## AI Provider

The backend supports two modes:

- OpenAI Chat Completions API when `OPENAI_API_KEY` is configured in `api/config.php` or the environment.
- Local deterministic fallback when no API key is configured.

The default configured OpenAI model is `gpt-4o-mini`. The local fallback model label is `resrva-reply-drafter`.

## Data Handling

The AI reply prompt can include:

- Booking reference.
- Booking type and status.
- Customer name.
- Booking date and time.
- Guest count.
- Area/table summary.
- Event type, if it is a function.
- Guest notes or staff notes only when relevant.
- Manager instructions entered in the composer.

The AI feature does not need account passwords, payment information, or unrelated customer history. The app is designed for a local XAMPP demo, and generated replies are stored as simulated email logs rather than sent through SMTP.

## Prompt Approach

The prompt instructs the model to:

- Write a warm, concise customer email for Old Canberra Inn.
- Return strict JSON with `subject` and `body`.
- Use a professional, helpful, friendly tone.
- Transform manager notes into natural customer-facing wording.
- Avoid copying short manager notes verbatim.

The generated booking details are placed before the sign-off so customers receive a clear message plus reference, date, time, guests, and assigned area/table details.

## Human-in-the-Loop Mechanism

The manager remains responsible for the final message:

1. Manager opens the AI reply composer.
2. Manager selects a reply type and optionally enters instructions.
3. The system generates a draft.
4. Manager reviews and edits the subject/body.
5. Manager saves the reviewed reply to email history.

The app does not auto-send AI content. Logging the reply is an explicit manager action.

## Limitations

- AI text can be inaccurate, overly generic, or misunderstand short instructions.
- External AI is only available when an API key and internet connection are configured.
- The local fallback is predictable and safer for demo use, but less flexible than a generative model.
- The AI cannot verify real-world venue constraints unless those details are present in the booking, settings, or manager instructions.

## Mitigations

- Human review is required before the reply is logged.
- The prompt limits scope to concise hospitality booking replies.
- The local fallback keeps the demo working without external data transfer.
- Activity logs record generated AI reply actions.
- Managers can edit or discard drafts before use.
