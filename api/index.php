<?php

declare(strict_types=1);

/*
 * Resrva API
 * ----------
 * Plain PHP keeps the backend easy to run in XAMPP while still using secure
 * building blocks: PDO prepared statements, password_hash/password_verify,
 * session authentication, explicit access checks, and server-side validation.
 */

$config = require __DIR__ . '/config.php';
date_default_timezone_set($config['timezone']);
session_name($config['session_name']);
session_start();

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && in_array($origin, $config['cors_allowed_origins'], true)) {
    header("Access-Control-Allow-Origin: {$origin}");
    header('Access-Control-Allow-Credentials: true');
}

header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function db(): PDO
{
    static $pdo = null;
    global $config;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $db = $config['db'];
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $db['host'],
        $db['port'],
        $db['database'],
        $db['charset']
    );

    $pdo = new PDO($dsn, $db['username'], $db['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $pdo;
}

function json_body(): array
{
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        throw new InvalidArgumentException('Invalid JSON request body.');
    }

    return $decoded;
}

function respond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $message, int $status = 400, array $details = []): void
{
    respond(['error' => $message, 'details' => $details], $status);
}

function clean_string(mixed $value): string
{
    return trim((string) $value);
}

function request_base_url(): string
{
    $forwardedProto = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '';
    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || $forwardedProto === 'https';
    $scheme = $isHttps ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $scriptDir = str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/')));
    $scriptDir = $scriptDir === '/' ? '' : rtrim($scriptDir, '/');

    return "{$scheme}://{$host}{$scriptDir}";
}

function public_asset_url(string $path): string
{
    $path = clean_string($path);
    if ($path === '' || preg_match('#^https?://#i', $path)) {
        return $path;
    }

    return request_base_url() . '/' . ltrim($path, '/');
}

function nullable_int(mixed $value): ?int
{
    if ($value === null || $value === '') {
        return null;
    }

    return (int) $value;
}

function bool_int(mixed $value): int
{
    return filter_var($value, FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
}

function normalized_table_ids(mixed $value): array
{
    if (!is_array($value)) {
        return [];
    }

    $ids = [];
    foreach ($value as $tableId) {
        $id = (int) $tableId;
        if ($id > 0) {
            $ids[] = $id;
        }
    }

    return array_values(array_unique($ids));
}

function normalized_area_ids(mixed $value): array
{
    return normalized_table_ids($value);
}

function require_fields(array $data, array $fields): void
{
    $missing = [];
    foreach ($fields as $field) {
        if (!array_key_exists($field, $data) || clean_string($data[$field]) === '') {
            $missing[] = $field;
        }
    }

    if ($missing !== []) {
        fail('Please complete all required fields.', 422, ['missing' => $missing]);
    }
}

function validate_email_address(string $email): void
{
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        fail('Please enter a valid email address.', 422, ['email' => $email]);
    }
}

function validate_phone_number(string $phone): void
{
    if (!preg_match('/^[0-9+()\-\s]{8,20}$/', $phone)) {
        fail('Please enter a valid phone number.', 422, ['phone' => $phone]);
    }
}

function current_user(): ?array
{
    if (empty($_SESSION['user_id'])) {
        return null;
    }

    $stmt = db()->prepare('SELECT id, name, email, role, status, avatar_url, created_at, updated_at FROM users WHERE id = :id AND status = "active"');
    $stmt->execute(['id' => $_SESSION['user_id']]);
    $user = $stmt->fetch();

    return normalize_user_record($user ?: null);
}

function normalize_user_record(?array $user): ?array
{
    if (!$user) {
        return null;
    }

    if (array_key_exists('avatar_url', $user) && $user['avatar_url'] !== null) {
        $user['avatar_url'] = public_asset_url((string) $user['avatar_url']);
    }

    return $user;
}

function normalize_user_records(array $users): array
{
    return array_map(static fn (array $user) => normalize_user_record($user), $users);
}

function require_manager(): array
{
    $user = current_user();
    if (!$user || $user['role'] !== 'manager') {
        fail('Manager sign in required.', 401);
    }

    return $user;
}

function setting(string $key, string $fallback = ''): string
{
    $stmt = db()->prepare('SELECT setting_value FROM settings WHERE setting_key = :key');
    $stmt->execute(['key' => $key]);
    $value = $stmt->fetchColumn();

    return $value === false ? $fallback : (string) $value;
}

function settings_defaults(): array
{
    return [
        'min_table_guests' => '8',
        'max_table_guests' => '29',
        'default_duration_minutes' => '120',
        'slot_interval_minutes' => '30',
        'minimum_booking_notice_minutes' => '0',
        'annual_closed_day' => '12-25',
        'annual_closed_days' => '12-25',
        'venue_name' => 'Old Canberra Inn',
        'venue_phone' => '(02) 6134 6000',
        'venue_email' => 'manager@oldcanberrainn.com.au',
        'venue_image_url' => '',
        'booking_policy_note' => 'Online bookings are for groups of 8 or more. Smaller groups are welcome to walk in.',
        'online_table_bookings_enabled' => '1',
        'online_function_requests_enabled' => '1',
    ];
}

function setting_enabled(string $key, bool $fallback = true): bool
{
    return setting($key, $fallback ? '1' : '0') !== '0';
}

function annual_closed_month_days(): array
{
    $raw = setting('annual_closed_days', setting('annual_closed_day', '12-25'));
    $legacy = setting('annual_closed_day', '');
    $values = array_filter(array_map('trim', explode(',', $raw . ',' . $legacy)));
    $monthDays = [];

    foreach ($values as $value) {
        if (preg_match('/^\d{2}-\d{2}$/', $value)) {
            $monthDays[] = $value;
        }
    }

    return array_values(array_unique($monthDays));
}

function minutes_from_time(string $time): int
{
    if (!preg_match('/^\d{2}:\d{2}$/', $time)) {
        fail('Time must use HH:MM format.', 422, ['time' => $time]);
    }

    [$hours, $minutes] = array_map('intval', explode(':', $time));
    if ($hours < 0 || $hours > 23 || $minutes < 0 || $minutes > 59) {
        fail('Time is outside a valid 24-hour clock range.', 422, ['time' => $time]);
    }

    return ($hours * 60) + $minutes;
}

function time_from_minutes(int $minutes): string
{
    $hours = intdiv($minutes, 60);
    $mins = $minutes % 60;

    return sprintf('%02d:%02d', $hours, $mins);
}

function validate_booking_window(string $date, string $time, int $durationMinutes, bool $enforceMinimumNotice = false): array
{
    $dateObj = DateTime::createFromFormat('Y-m-d', $date);
    if (!$dateObj || $dateObj->format('Y-m-d') !== $date) {
        fail('Please choose a valid booking date.', 422, ['date' => $date]);
    }

    $today = new DateTime('today');
    if ($dateObj < $today) {
        fail('Bookings cannot be made in the past.', 422, ['date' => $date]);
    }

    if (in_array($dateObj->format('m-d'), annual_closed_month_days(), true)) {
        fail('The venue is closed on the selected date.', 422, ['date' => $date]);
    }

    $dayOfWeek = (int) $dateObj->format('w');
    $stmt = db()->prepare('SELECT opens_at, closes_at, is_closed FROM opening_hours WHERE day_of_week = :day');
    $stmt->execute(['day' => $dayOfWeek]);
    $hours = $stmt->fetch();

    if (!$hours || (int) $hours['is_closed'] === 1) {
        fail('The venue is closed on the selected date.', 422, ['date' => $date]);
    }

    $slotInterval = (int) setting('slot_interval_minutes', '30');
    $startMinutes = minutes_from_time($time);
    if ($startMinutes % $slotInterval !== 0) {
        fail("Bookings must start on a {$slotInterval}-minute slot.", 422, ['time' => $time]);
    }

    if ($enforceMinimumNotice) {
        $minimumNoticeMinutes = max((int) setting('minimum_booking_notice_minutes', '0'), 0);
        $bookingStart = DateTime::createFromFormat('Y-m-d H:i', "{$date} {$time}");
        $earliestStart = new DateTime();
        if ($minimumNoticeMinutes > 0) {
            $earliestStart->modify("+{$minimumNoticeMinutes} minutes");
        }

        if (!$bookingStart || $bookingStart < $earliestStart) {
            fail('This booking needs more advance notice.', 422, [
                'minimum_notice_minutes' => $minimumNoticeMinutes,
                'earliest_start' => $earliestStart->format('Y-m-d H:i'),
            ]);
        }
    }

    $openMinutes = minutes_from_time(substr($hours['opens_at'], 0, 5));
    $closeMinutes = minutes_from_time(substr($hours['closes_at'], 0, 5));
    $endMinutes = $startMinutes + $durationMinutes;

    if ($startMinutes < $openMinutes || $endMinutes > $closeMinutes) {
        fail('Booking time must fit within Old Canberra Inn kitchen hours.', 422, [
            'opens_at' => substr($hours['opens_at'], 0, 5),
            'closes_at' => substr($hours['closes_at'], 0, 5),
            'duration_minutes' => $durationMinutes,
        ]);
    }

    return [time_from_minutes($startMinutes), time_from_minutes($endMinutes)];
}

function booking_reference(): string
{
    do {
        $reference = 'RSV-' . date('Ymd') . '-' . random_int(1000, 9999);
        $stmt = db()->prepare('SELECT COUNT(*) FROM bookings WHERE booking_reference = :reference');
        $stmt->execute(['reference' => $reference]);
    } while ((int) $stmt->fetchColumn() > 0);

    return $reference;
}

function ensure_booking_customer_snapshots(): void
{
    static $checked = false;
    if ($checked) {
        return;
    }

    $columns = [
        'customer_name_snapshot' => ['definition' => 'VARCHAR(120) NULL', 'after' => 'customer_id'],
        'customer_email_snapshot' => ['definition' => 'VARCHAR(160) NULL', 'after' => 'customer_name_snapshot'],
        'customer_phone_snapshot' => ['definition' => 'VARCHAR(30) NULL', 'after' => 'customer_email_snapshot'],
    ];
    $placeholders = implode(',', array_fill(0, count($columns), '?'));
    $stmt = db()->prepare(
        "SELECT COLUMN_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'bookings'
           AND COLUMN_NAME IN ({$placeholders})"
    );
    $stmt->execute(array_keys($columns));
    $existingColumns = array_flip($stmt->fetchAll(PDO::FETCH_COLUMN));

    foreach ($columns as $column => $config) {
        if (!isset($existingColumns[$column])) {
            db()->exec("ALTER TABLE bookings ADD COLUMN {$column} {$config['definition']} AFTER {$config['after']}");
        }
    }

    db()->exec(
        'UPDATE bookings b
         JOIN customers c ON c.id = b.customer_id
         LEFT JOIN (
             SELECT booking_id, MIN(id) AS first_email_id
             FROM email_logs
             WHERE body LIKE "Hi %,%"
             GROUP BY booking_id
         ) first_email ON first_email.booking_id = b.id
         LEFT JOIN email_logs e ON e.id = first_email.first_email_id
         SET b.customer_name_snapshot = COALESCE(
                 NULLIF(b.customer_name_snapshot, ""),
                 NULLIF(TRIM(SUBSTRING_INDEX(SUBSTRING(e.body, 4), ",", 1)), ""),
                 c.name
             ),
             b.customer_email_snapshot = COALESCE(NULLIF(b.customer_email_snapshot, ""), e.recipient_email, c.email),
             b.customer_phone_snapshot = COALESCE(NULLIF(b.customer_phone_snapshot, ""), c.phone)
         WHERE b.customer_name_snapshot IS NULL
            OR b.customer_name_snapshot = ""
            OR b.customer_email_snapshot IS NULL
            OR b.customer_email_snapshot = ""
            OR b.customer_phone_snapshot IS NULL
            OR b.customer_phone_snapshot = ""'
    );

    $checked = true;
}

function ensure_online_booking_blocks_table(): void
{
    static $checked = false;
    if ($checked) {
        return;
    }

    db()->exec(
        'CREATE TABLE IF NOT EXISTS online_booking_blocks (
            block_date DATE NOT NULL PRIMARY KEY,
            created_by_user_id INT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        ) ENGINE=InnoDB'
    );

    $checked = true;
}

function ensure_user_avatar_column(): void
{
    static $checked = false;
    if ($checked) {
        return;
    }

    $stmt = db()->prepare(
        "SELECT COUNT(*)
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'users'
           AND COLUMN_NAME = 'avatar_url'"
    );
    $stmt->execute();

    if ((int) $stmt->fetchColumn() === 0) {
        db()->exec('ALTER TABLE users ADD COLUMN avatar_url VARCHAR(255) NULL AFTER status');
    }

    $checked = true;
}

function validate_date_value(string $date): void
{
    $dateObj = DateTime::createFromFormat('Y-m-d', $date);
    if (!$dateObj || $dateObj->format('Y-m-d') !== $date) {
        fail('Please choose a valid date.', 422, ['date' => $date]);
    }
}

function fetch_online_booking_blocks(): array
{
    ensure_online_booking_blocks_table();

    return db()->query(
        'SELECT block_date, created_by_user_id, created_at, updated_at
         FROM online_booking_blocks
         ORDER BY block_date ASC'
    )->fetchAll();
}

function online_booking_block_dates(): array
{
    return array_map(static fn (array $row) => (string) $row['block_date'], fetch_online_booking_blocks());
}

function online_booking_blocked(string $date): bool
{
    validate_date_value($date);
    ensure_online_booking_blocks_table();

    return scalar_query('SELECT COUNT(*) FROM online_booking_blocks WHERE block_date = ?', [$date]) > 0;
}

function require_online_booking_date_available(string $date): void
{
    if (online_booking_blocked($date)) {
        fail('Online bookings are turned off for this date.', 403, ['date' => $date]);
    }
}

function find_or_create_customer(array $data): int
{
    $email = strtolower(clean_string($data['email']));
    $name = clean_string($data['name']);
    $phone = clean_string($data['phone']);

    $stmt = db()->prepare('SELECT id FROM customers WHERE email = :email LIMIT 1');
    $stmt->execute(['email' => $email]);
    $existingId = $stmt->fetchColumn();

    if ($existingId !== false) {
        return (int) $existingId;
    }

    $insert = db()->prepare('INSERT INTO customers (name, email, phone, created_at, updated_at) VALUES (:name, :email, :phone, NOW(), NOW())');
    $insert->execute(['name' => $name, 'email' => $email, 'phone' => $phone]);

    return (int) db()->lastInsertId();
}

function log_activity(?int $userId, string $action, string $entityType, ?int $entityId, array $details = []): void
{
    $stmt = db()->prepare(
        'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details_json, created_at)
         VALUES (:user_id, :action, :entity_type, :entity_id, :details_json, NOW())'
    );
    $stmt->execute([
        'user_id' => $userId,
        'action' => $action,
        'entity_type' => $entityType,
        'entity_id' => $entityId,
        'details_json' => json_encode($details, JSON_UNESCAPED_SLASHES),
    ]);
}

function create_email_log(int $bookingId, string $email, string $subject, string $body): int
{
    /*
     * Real SMTP is intentionally replaceable. The assessment demo keeps email
     * evidence auditable by storing exactly what would have been sent.
     */
    $stmt = db()->prepare(
        'INSERT INTO email_logs (booking_id, recipient_email, subject, body, status, created_at)
         VALUES (:booking_id, :recipient_email, :subject, :body, "logged", NOW())'
    );
    $stmt->execute([
        'booking_id' => $bookingId,
        'recipient_email' => $email,
        'subject' => $subject,
        'body' => $body,
    ]);

    return (int) db()->lastInsertId();
}

function email_display_date(string $date): string
{
    $timestamp = strtotime($date);

    return $timestamp ? date('D, j M Y', $timestamp) : $date;
}

function email_display_time(string $time): string
{
    $timestamp = strtotime($time);

    return $timestamp ? date('g:i A', $timestamp) : substr($time, 0, 5);
}

function create_function_confirmation_email(array $booking, string $managerMessage = ''): void
{
    $status = (string) ($booking['status'] ?? 'confirmed');
    $statusLabel = $status === 'approved' ? 'approved' : 'confirmed';
    $name = (string) ($booking['customer_name'] ?? 'there');
    $reference = (string) ($booking['booking_reference'] ?? '');
    $areas = (string) ($booking['assigned_area_names'] ?? $booking['assigned_area_name'] ?? 'to be confirmed');
    $eventType = (string) ($booking['event_type'] ?? 'function');
    $date = email_display_date((string) ($booking['booking_date'] ?? ''));
    $startTime = email_display_time((string) ($booking['start_time'] ?? ''));
    $endTime = email_display_time((string) ($booking['end_time'] ?? ''));
    $guestCount = (int) ($booking['guest_count'] ?? 0);

    $body = "Hi {$name}, your {$eventType} function booking at Old Canberra Inn is {$statusLabel}. " .
        "Reference: {$reference}. Date: {$date}. Time: {$startTime} - {$endTime}. " .
        "Guests: {$guestCount}. Area(s): {$areas}.";

    if ($managerMessage !== '') {
        $body .= "\n\nMessage from the manager: {$managerMessage}";
    }

    create_email_log(
        (int) $booking['id'],
        (string) $booking['customer_email'],
        "Old Canberra Inn function booking {$reference} {$statusLabel}",
        $body
    );
}

function booking_reply_area_label(array $booking): string
{
    if ((string) ($booking['booking_type'] ?? '') === 'table') {
        if (!empty($booking['table_numbers'])) {
            return 'table ' . $booking['table_numbers'];
        }

        return (string) ($booking['assigned_area_name'] ?? $booking['preferred_area_name'] ?? 'your table');
    }

    return (string) ($booking['assigned_area_names'] ?? $booking['assigned_area_name'] ?? $booking['preferred_area_name'] ?? 'the function area');
}

function booking_reply_prompt_context(array $booking, string $purpose, string $instructions): string
{
    $eventType = (string) ($booking['event_type'] ?? '');
    $bookingType = (string) ($booking['booking_type'] ?? 'table');
    $lines = [
        'Write a warm, concise customer email for Old Canberra Inn.',
        'Return only JSON with keys subject and body.',
        'Tone: professional, helpful, friendly, no emojis.',
        'Transform manager instructions into natural customer-facing wording. Do not copy short notes verbatim.',
        'Purpose: ' . $purpose,
        'Booking type: ' . $bookingType,
        'Reference: ' . (string) ($booking['booking_reference'] ?? ''),
        'Customer: ' . (string) ($booking['customer_name'] ?? ''),
        'Status: ' . (string) ($booking['status'] ?? ''),
        'Date: ' . email_display_date((string) ($booking['booking_date'] ?? '')),
        'Time: ' . email_display_time((string) ($booking['start_time'] ?? '')) . ' - ' . email_display_time((string) ($booking['end_time'] ?? '')),
        'Guests: ' . (int) ($booking['guest_count'] ?? 0),
        'Area/table: ' . booking_reply_area_label($booking),
    ];

    if ($eventType !== '') {
        $lines[] = 'Event type: ' . $eventType;
    }
    if (!empty($booking['notes'])) {
        $lines[] = 'Guest notes: ' . (string) $booking['notes'];
    }
    if (!empty($booking['staff_notes'])) {
        $lines[] = 'Internal staff notes, use only if customer-safe: ' . (string) $booking['staff_notes'];
    }
    if ($instructions !== '') {
        $lines[] = 'Manager instructions: ' . $instructions;
    }

    return implode("\n", $lines);
}

function openai_booking_reply_draft(array $booking, string $purpose, string $instructions): ?array
{
    global $config;

    $apiKey = (string) ($config['ai']['openai_api_key'] ?? '');
    if ($apiKey === '' || !function_exists('curl_init')) {
        return null;
    }

    $model = (string) ($config['ai']['openai_model'] ?? 'gpt-4o-mini');
    $payload = [
        'model' => $model,
        'messages' => [
            [
                'role' => 'system',
                'content' => 'You draft concise hospitality booking emails. Return strict JSON only.',
            ],
            [
                'role' => 'user',
                'content' => booking_reply_prompt_context($booking, $purpose, $instructions),
            ],
        ],
        'temperature' => 0.4,
    ];

    $ch = curl_init('https://api.openai.com/v1/chat/completions');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $apiKey,
        ],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_SLASHES),
        CURLOPT_TIMEOUT => 12,
    ]);

    $response = curl_exec($ch);
    $statusCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if (!is_string($response) || $statusCode < 200 || $statusCode >= 300) {
        return null;
    }

    $decoded = json_decode($response, true);
    $content = $decoded['choices'][0]['message']['content'] ?? '';
    $draft = is_string($content) ? json_decode($content, true) : null;

    if (!is_array($draft) || empty($draft['subject']) || empty($draft['body'])) {
        return null;
    }

    return [
        'subject' => clean_string($draft['subject']),
        'body' => clean_string($draft['body']),
        'provider' => 'openai',
        'model' => $model,
    ];
}

function local_reply_instruction_sentences(string $instructions): array
{
    $instructions = clean_string($instructions);
    if ($instructions === '') {
        return [];
    }

    $text = strtolower($instructions);
    $sentences = [];

    if (preg_match('/diet|allerg|vegan|vegetarian|gluten|coeliac|celiac/', $text)) {
        $sentences[] = 'Please let us know if anyone in your group has dietary requirements or allergies.';
    }
    if (preg_match('/deposit|payment|prepay|pre-pay/', $text)) {
        $sentences[] = 'Please note that a deposit or pre-payment may be required to secure the booking.';
    }
    if (preg_match('/cake|birthday cake/', $text)) {
        $sentences[] = 'If you are bringing a cake, please let us know so the team can prepare accordingly.';
    }
    if (preg_match('/pre.?order|set menu|menu/', $text)) {
        $sentences[] = 'If you would like to discuss menu options or pre-orders, please reply and our team can help.';
    }
    if (preg_match('/arrival|arrive|early/', $text)) {
        $sentences[] = 'Please arrive a little before your booking time so we can get everyone settled comfortably.';
    }
    if (preg_match('/access|wheelchair|mobility|pram/', $text)) {
        $sentences[] = 'Please let us know if anyone in your group has accessibility needs so we can plan the best setup.';
    }
    if (preg_match('/children|kids|high chair|highchair/', $text)) {
        $sentences[] = 'Please let us know if you need high chairs or space for children in the booking setup.';
    }
    if (preg_match('/parking/', $text)) {
        $sentences[] = 'Please allow a little extra time for parking, especially during busy service periods.';
    }

    if ($sentences !== []) {
        return array_values(array_unique($sentences));
    }

    $cleaned = preg_replace('/^(please\s+)?(mention|include|add|ask|tell|say|note)\s+(that\s+|about\s+)?/i', '', $instructions);
    $cleaned = clean_string($cleaned);
    if ($cleaned === '') {
        return [];
    }

    $sentence = strtoupper(substr($cleaned, 0, 1)) . substr($cleaned, 1);
    if (!preg_match('/[.!?]$/', $sentence)) {
        $sentence .= '.';
    }

    return [$sentence];
}

function local_booking_reply_draft(array $booking, string $purpose, string $instructions): array
{
    $name = (string) ($booking['customer_name'] ?? 'there');
    $reference = (string) ($booking['booking_reference'] ?? '');
    $bookingType = (string) ($booking['booking_type'] ?? 'table');
    $status = (string) ($booking['status'] ?? 'confirmed');
    $date = email_display_date((string) ($booking['booking_date'] ?? ''));
    $startTime = email_display_time((string) ($booking['start_time'] ?? ''));
    $endTime = email_display_time((string) ($booking['end_time'] ?? ''));
    $guests = (int) ($booking['guest_count'] ?? 0);
    $area = booking_reply_area_label($booking);
    $eventType = clean_string($booking['event_type'] ?? '');
    $kind = $bookingType === 'function' ? ($eventType !== '' ? strtolower($eventType) . ' function' : 'function') : 'table booking';

    $subject = match ($purpose) {
        'decline' => "Old Canberra Inn booking {$reference} update",
        'request_info' => "A quick question about your Old Canberra Inn booking {$reference}",
        'update' => "Old Canberra Inn booking {$reference} update",
        default => "Old Canberra Inn booking {$reference} confirmation",
    };

    $opening = match ($purpose) {
        'decline' => "Thanks for your {$kind} enquiry. Unfortunately, we are unable to accommodate this booking as requested.",
        'request_info' => "Thanks for your {$kind} enquiry. We just need a little more information before we can finalise it.",
        'update' => "I am writing with an update for your {$kind} at Old Canberra Inn.",
        default => "Your {$kind} at Old Canberra Inn is {$status}.",
    };

    $body = "Hi {$name},\n\n";
    $body .= "{$opening}\n\n";

    $instructionSentences = local_reply_instruction_sentences($instructions);
    if ($instructionSentences !== []) {
        $body .= implode("\n", $instructionSentences) . "\n\n";
    }

    $body .= "Booking details:\n";
    $body .= "Reference: {$reference}\n";
    $body .= "Date: {$date}\n";
    $body .= "Time: {$startTime} - {$endTime}\n";
    $body .= "Guests: {$guests}\n";
    $body .= ($bookingType === 'table' ? 'Table/area: ' : 'Area(s): ') . "{$area}\n";
    $body .= "\nKind regards,\nOld Canberra Inn";

    return [
        'subject' => $subject,
        'body' => $body,
        'provider' => 'local_ai',
        'model' => 'resrva-reply-drafter',
    ];
}

function generate_booking_reply_draft(int $bookingId, array $data, array $manager): array
{
    $booking = fetch_booking($bookingId);
    if (!$booking) {
        fail('Booking not found.', 404);
    }

    $purpose = clean_string($data['purpose'] ?? 'confirm');
    if (!in_array($purpose, ['confirm', 'update', 'decline', 'request_info'], true)) {
        fail('Please choose a valid reply type.', 422, ['purpose' => $purpose]);
    }

    $instructions = clean_string($data['instructions'] ?? '');
    $draft = openai_booking_reply_draft($booking, $purpose, $instructions)
        ?? local_booking_reply_draft($booking, $purpose, $instructions);

    log_activity((int) $manager['id'], 'drafted_ai_reply', 'booking', $bookingId, [
        'purpose' => $purpose,
        'provider' => $draft['provider'],
    ]);

    return [
        'subject' => $draft['subject'],
        'body' => $draft['body'],
        'provider' => $draft['provider'],
        'model' => $draft['model'],
    ];
}

function log_ai_reply_email(int $bookingId, array $data, array $manager): array
{
    $booking = fetch_booking($bookingId);
    if (!$booking) {
        fail('Booking not found.', 404);
    }

    $subject = clean_string($data['subject'] ?? '');
    $body = clean_string($data['body'] ?? '');
    require_fields(['subject' => $subject, 'body' => $body], ['subject', 'body']);

    $emailLogId = create_email_log($bookingId, (string) $booking['customer_email'], $subject, $body);
    log_activity((int) $manager['id'], 'logged_ai_reply', 'booking', $bookingId, ['email_log_id' => $emailLogId]);

    return ['ok' => true, 'email_log_id' => $emailLogId];
}

function overlapping_table_ids(string $date, string $startTime, string $endTime, ?int $excludeBookingId = null): array
{
    $sql =
        'SELECT DISTINCT bt.table_id
         FROM booking_tables bt
         JOIN bookings b ON b.id = bt.booking_id
         WHERE b.booking_date = :booking_date
           AND b.status NOT IN ("cancelled", "no_show", "declined")
           AND b.start_time < :end_time
           AND b.end_time > :start_time';
    $params = [
        'booking_date' => $date,
        'start_time' => $startTime,
        'end_time' => $endTime,
    ];

    if ($excludeBookingId !== null) {
        $sql .= ' AND b.id <> :exclude_booking_id';
        $params['exclude_booking_id'] = $excludeBookingId;
    }

    $stmt = db()->prepare($sql);
    $stmt->execute($params);

    return array_map('intval', array_column($stmt->fetchAll(), 'table_id'));
}

function blocked_function_area_ids(string $date, string $startTime, string $endTime, ?int $excludeBookingId = null): array
{
    $sql =
        'SELECT DISTINCT area_id
         FROM (
            SELECT b.assigned_area_id AS area_id, b.id, b.booking_type, b.status, b.booking_date, b.start_time, b.end_time
            FROM bookings b
            WHERE b.assigned_area_id IS NOT NULL
            UNION ALL
            SELECT bfa.area_id AS area_id, b.id, b.booking_type, b.status, b.booking_date, b.start_time, b.end_time
            FROM booking_function_areas bfa
            JOIN bookings b ON b.id = bfa.booking_id
         ) function_areas
         WHERE booking_type = "function"
           AND status IN ("approved", "confirmed")
           AND booking_date = :booking_date
           AND start_time < :end_time
           AND end_time > :start_time';
    $params = [
        'booking_date' => $date,
        'start_time' => $startTime,
        'end_time' => $endTime,
    ];

    if ($excludeBookingId !== null) {
        $sql .= ' AND id <> :exclude_booking_id';
        $params['exclude_booking_id'] = $excludeBookingId;
    }

    $stmt = db()->prepare($sql);
    $stmt->execute($params);

    return array_map('intval', array_column($stmt->fetchAll(), 'area_id'));
}

function active_areas(bool $functionOnly = false): array
{
    $sql = 'SELECT id, code, name, function_enabled FROM areas WHERE active = 1';
    if ($functionOnly) {
        $sql .= ' AND function_enabled = 1';
    }
    $sql .= ' ORDER BY sort_order, id';

    return db()->query($sql)->fetchAll();
}

function get_area_tables(int $areaId): array
{
    $stmt = db()->prepare('SELECT id, table_number, capacity FROM venue_tables WHERE area_id = :area_id AND active = 1 ORDER BY table_number');
    $stmt->execute(['area_id' => $areaId]);

    return $stmt->fetchAll();
}

function choose_tables_from_area(array $tables, int $guestCount, array $unavailableIds): array
{
    $available = array_values(array_filter($tables, fn (array $table) => !in_array((int) $table['id'], $unavailableIds, true)));
    if ($available === []) {
        return [];
    }

    foreach ($available as $table) {
        if ((int) $table['capacity'] >= $guestCount) {
            return [$table];
        }
    }

    $neededTables = (int) ceil($guestCount / 8);
    $runs = [];
    $current = [];
    $previousNumber = null;

    foreach ($available as $table) {
        $tableNumber = (int) $table['table_number'];
        if ($previousNumber !== null && $tableNumber !== $previousNumber + 1) {
            $runs[] = $current;
            $current = [];
        }
        $current[] = $table;
        $previousNumber = $tableNumber;
    }
    if ($current !== []) {
        $runs[] = $current;
    }

    foreach ($runs as $run) {
        if (count($run) >= $neededTables) {
            return array_slice($run, 0, $neededTables);
        }
    }

    if (count($available) >= $neededTables) {
        return array_slice($available, 0, $neededTables);
    }

    return [];
}

function recommend_tables(int $guestCount, string $date, string $startTime, string $endTime, ?int $preferredAreaId, ?int $excludeBookingId = null): array
{
    $unavailableIds = overlapping_table_ids($date, $startTime, $endTime, $excludeBookingId);
    $blockedAreaIds = blocked_function_area_ids($date, $startTime, $endTime, $excludeBookingId);
    $areas = active_areas(false);

    usort($areas, function (array $left, array $right) use ($preferredAreaId): int {
        $leftPreferred = $preferredAreaId !== null && (int) $left['id'] === $preferredAreaId ? 0 : 1;
        $rightPreferred = $preferredAreaId !== null && (int) $right['id'] === $preferredAreaId ? 0 : 1;

        return $leftPreferred <=> $rightPreferred;
    });

    foreach ($areas as $area) {
        $areaId = (int) $area['id'];
        if (in_array($areaId, $blockedAreaIds, true)) {
            continue;
        }

        $tables = choose_tables_from_area(get_area_tables($areaId), $guestCount, $unavailableIds);
        if ($tables !== []) {
            $numbers = array_map(fn (array $table) => (int) $table['table_number'], $tables);
            $tableIds = array_map(fn (array $table) => (int) $table['id'], $tables);
            $capacity = array_sum(array_map(fn (array $table) => (int) $table['capacity'], $tables));
            $preferredText = $preferredAreaId === $areaId ? ' The customer preferred this area.' : '';

            return [
                'area_id' => $areaId,
                'area_name' => $area['name'],
                'table_ids' => $tableIds,
                'table_numbers' => $numbers,
                'capacity' => $capacity,
                'explanation' => 'Recommended ' . $area['name'] . ' table(s) ' . implode(', ', $numbers) .
                    " because they cover {$guestCount} guests within the two-hour booking window." . $preferredText,
                'rules_snapshot' => [
                    'guest_count' => $guestCount,
                    'preferred_area_id' => $preferredAreaId,
                    'duration_minutes' => (int) setting('default_duration_minutes', '120'),
                    'strategy' => 'Prefer one table, otherwise smallest same-area consecutive table set.',
                    'blocked_function_area_ids' => $blockedAreaIds,
                ],
            ];
        }
    }

    fail('No suitable tables are available for that booking window.', 409);
}

function manual_table_assignment(array $tableIds, int $guestCount, string $date, string $startTime, string $endTime, ?int $excludeBookingId = null): array
{
    $tableIds = normalized_table_ids($tableIds);
    if ($tableIds === []) {
        fail('Please select at least one table.', 422);
    }

    $placeholders = implode(',', array_fill(0, count($tableIds), '?'));
    $stmt = db()->prepare(
        "SELECT vt.id, vt.table_number, vt.capacity, vt.area_id, vt.active, a.name AS area_name
         FROM venue_tables vt
         JOIN areas a ON a.id = vt.area_id
         WHERE a.active = 1
           AND vt.id IN ({$placeholders})
         ORDER BY vt.table_number"
    );
    $stmt->execute($tableIds);
    $tables = $stmt->fetchAll();

    if (count($tables) !== count($tableIds)) {
        fail('One or more selected tables are unavailable.', 422);
    }

    $areaIds = array_values(array_unique(array_map(fn (array $table) => (int) $table['area_id'], $tables)));
    if (count($areaIds) !== 1) {
        fail('Selected tables must be in one area.', 422);
    }

    $areaId = $areaIds[0];
    if (in_array($areaId, blocked_function_area_ids($date, $startTime, $endTime, $excludeBookingId), true)) {
        fail('That area is blocked by a function during the selected time.', 409);
    }

    $unavailableIds = overlapping_table_ids($date, $startTime, $endTime, $excludeBookingId);
    $clashingIds = array_values(array_intersect($tableIds, $unavailableIds));
    if ($clashingIds !== []) {
        fail('One or more selected tables are already booked for that time.', 409, ['table_ids' => $clashingIds]);
    }

    $capacity = array_sum(array_map(fn (array $table) => (int) $table['capacity'], $tables));
    if ($capacity < $guestCount) {
        fail('Selected table capacity does not cover this party size.', 422, [
            'guest_count' => $guestCount,
            'selected_capacity' => $capacity,
        ]);
    }

    $numbers = array_map(fn (array $table) => (int) $table['table_number'], $tables);
    $areaName = (string) $tables[0]['area_name'];

    return [
        'area_id' => $areaId,
        'area_name' => $areaName,
        'table_ids' => $tableIds,
        'table_numbers' => $numbers,
        'capacity' => $capacity,
        'explanation' => 'Manager selected ' . $areaName . ' table(s) ' . implode(', ', $numbers) . '.',
        'rules_snapshot' => [
            'guest_count' => $guestCount,
            'duration_minutes' => (int) setting('default_duration_minutes', '120'),
            'strategy' => 'Manager manual table assignment. Non-reservable tables may be selected manually.',
        ],
    ];
}

function attach_tables_to_booking(int $bookingId, array $tableIds): void
{
    db()->prepare('DELETE FROM booking_tables WHERE booking_id = :booking_id')->execute(['booking_id' => $bookingId]);
    $insert = db()->prepare('INSERT INTO booking_tables (booking_id, table_id) VALUES (:booking_id, :table_id)');

    foreach ($tableIds as $tableId) {
        $insert->execute(['booking_id' => $bookingId, 'table_id' => (int) $tableId]);
    }
}

function attach_function_areas_to_booking(int $bookingId, array $areaIds): void
{
    $areaIds = normalized_area_ids($areaIds);
    db()->prepare('DELETE FROM booking_function_areas WHERE booking_id = :booking_id')->execute(['booking_id' => $bookingId]);

    if ($areaIds === []) {
        return;
    }

    $placeholders = implode(',', array_fill(0, count($areaIds), '?'));
    $stmt = db()->prepare("SELECT id FROM areas WHERE active = 1 AND function_enabled = 1 AND id IN ({$placeholders})");
    $stmt->execute($areaIds);
    $validIds = array_map('intval', array_column($stmt->fetchAll(), 'id'));

    if (count($validIds) !== count($areaIds)) {
        fail('One or more selected function areas are unavailable.', 422);
    }

    $insert = db()->prepare('INSERT INTO booking_function_areas (booking_id, area_id) VALUES (:booking_id, :area_id)');
    foreach ($areaIds as $areaId) {
        $insert->execute(['booking_id' => $bookingId, 'area_id' => $areaId]);
    }
}

function validate_function_area_assignment(array $areaIds, string $date, string $startTime, string $endTime, ?int $excludeBookingId = null): void
{
    $areaIds = normalized_area_ids($areaIds);

    if ($areaIds === []) {
        fail('Please select at least one function area.', 422);
    }

    $blockedAreaIds = blocked_function_area_ids($date, $startTime, $endTime, $excludeBookingId);
    $clashingAreaIds = array_values(array_intersect($areaIds, $blockedAreaIds));

    if ($clashingAreaIds === []) {
        return;
    }

    $placeholders = implode(',', array_fill(0, count($clashingAreaIds), '?'));
    $stmt = db()->prepare("SELECT name FROM areas WHERE id IN ({$placeholders}) ORDER BY sort_order, id");
    $stmt->execute($clashingAreaIds);
    $areaNames = array_column($stmt->fetchAll(), 'name');

    fail('One or more selected function areas already have an approved function at that time.', 409, [
        'area_ids' => $clashingAreaIds,
        'areas' => $areaNames,
    ]);
}

function log_ai_assignment(int $bookingId, array $recommendation, ?int $acceptedByUserId, bool $overridden = false): void
{
    $stmt = db()->prepare(
        'INSERT INTO ai_assignment_logs
            (booking_id, suggested_area_id, suggested_table_numbers_json, explanation, rules_snapshot_json,
             accepted_by_user_id, accepted_at, final_table_numbers_json, overridden, created_at)
         VALUES
            (:booking_id, :suggested_area_id, :suggested_table_numbers_json, :explanation, :rules_snapshot_json,
             :accepted_by_user_id, NOW(), :final_table_numbers_json, :overridden, NOW())'
    );
    $stmt->execute([
        'booking_id' => $bookingId,
        'suggested_area_id' => $recommendation['area_id'] ?? null,
        'suggested_table_numbers_json' => json_encode($recommendation['table_numbers'] ?? [], JSON_UNESCAPED_SLASHES),
        'explanation' => $recommendation['explanation'] ?? 'Manager override recorded.',
        'rules_snapshot_json' => json_encode($recommendation['rules_snapshot'] ?? [], JSON_UNESCAPED_SLASHES),
        'accepted_by_user_id' => $acceptedByUserId,
        'final_table_numbers_json' => json_encode($recommendation['table_numbers'] ?? [], JSON_UNESCAPED_SLASHES),
        'overridden' => $overridden ? 1 : 0,
    ]);
}

function create_table_booking(array $data, ?array $manager = null): array
{
    require_fields($data, ['name', 'email', 'phone', 'date', 'time', 'guest_count']);

    $name = clean_string($data['name']);
    $email = strtolower(clean_string($data['email']));
    $phone = clean_string($data['phone']);
    $guestCount = (int) $data['guest_count'];
    $date = clean_string($data['date']);
    $time = clean_string($data['time']);
    $notes = clean_string($data['notes'] ?? '');
    $staffNotes = $manager ? clean_string($data['staff_notes'] ?? '') : '';
    $preferredAreaId = $manager ? null : nullable_int($data['preferred_area_id'] ?? null);
    $durationMinutes = (int) setting('default_duration_minutes', '120');
    $minGuests = (int) setting('min_table_guests', '8');
    $maxGuests = (int) setting('max_table_guests', '29');

    validate_email_address($email);
    validate_phone_number($phone);

    if ($manager === null) {
        require_online_booking_date_available($date);
    }

    if ($guestCount < $minGuests) {
        fail("Online bookings are for groups of {$minGuests} or more. Smaller groups are welcome to walk in.", 422);
    }

    if ($guestCount > $maxGuests) {
        fail("Groups over {$maxGuests} guests should use the function request form.", 422);
    }

    [$startTime, $endTime] = validate_booking_window($date, $time, $durationMinutes, $manager === null);
    $recommendation = $manager
        ? manual_table_assignment(normalized_table_ids($data['table_ids'] ?? []), $guestCount, $date, $startTime, $endTime)
        : recommend_tables($guestCount, $date, $startTime, $endTime, $preferredAreaId);
    $customerId = find_or_create_customer(['name' => $name, 'email' => $email, 'phone' => $phone]);
    $reference = booking_reference();

    $stmt = db()->prepare(
        'INSERT INTO bookings
            (booking_reference, booking_type, status, customer_id, customer_name_snapshot, customer_email_snapshot,
             customer_phone_snapshot, guest_count, booking_date, start_time, end_time, preferred_area_id,
             assigned_area_id, notes, staff_notes, created_by_user_id, updated_by_user_id, created_at, updated_at)
         VALUES
            (:reference, "table", "confirmed", :customer_id, :customer_name, :customer_email, :customer_phone,
             :guest_count, :booking_date, :start_time, :end_time, :preferred_area_id, :assigned_area_id, :notes,
             :staff_notes, :created_by_user_id, :updated_by_user_id, NOW(), NOW())'
    );
    $stmt->execute([
        'reference' => $reference,
        'customer_id' => $customerId,
        'customer_name' => $name,
        'customer_email' => $email,
        'customer_phone' => $phone,
        'guest_count' => $guestCount,
        'booking_date' => $date,
        'start_time' => $startTime,
        'end_time' => $endTime,
        'preferred_area_id' => $preferredAreaId,
        'assigned_area_id' => $recommendation['area_id'],
        'notes' => $notes,
        'staff_notes' => $staffNotes,
        'created_by_user_id' => $manager['id'] ?? null,
        'updated_by_user_id' => $manager['id'] ?? null,
    ]);

    $bookingId = (int) db()->lastInsertId();
    attach_tables_to_booking($bookingId, $recommendation['table_ids']);
    log_ai_assignment($bookingId, $recommendation, $manager['id'] ?? null, $manager !== null);

    $subject = "Old Canberra Inn booking {$reference} confirmed";
    $body = "Hi {$name}, your table booking for {$guestCount} guests on {$date} at {$startTime} is confirmed. " .
        "Your table area is {$recommendation['area_name']} and your reference is {$reference}.";
    create_email_log($bookingId, $email, $subject, $body);
    log_activity($manager['id'] ?? null, 'created', 'booking', $bookingId, ['reference' => $reference, 'source' => $manager ? 'manager' : 'public']);

    return [
        'id' => $bookingId,
        'booking_reference' => $reference,
        'status' => 'confirmed',
        'assigned_area' => $recommendation['area_name'],
        'assigned_tables' => $recommendation['table_numbers'],
        'message' => 'Booking confirmed and confirmation email logged.',
    ];
}

function create_function_request(array $data): array
{
    require_fields($data, ['name', 'email', 'phone', 'event_date', 'start_time', 'guest_count', 'event_type']);

    $name = clean_string($data['name']);
    $email = strtolower(clean_string($data['email']));
    $phone = clean_string($data['phone']);
    $guestCount = (int) $data['guest_count'];
    $date = clean_string($data['event_date']);
    $time = clean_string($data['start_time']);
    $eventType = clean_string($data['event_type']);
    $notes = clean_string($data['notes'] ?? '');
    $preferredAreaId = nullable_int($data['preferred_area_id'] ?? null);
    $durationMinutes = max((int) ($data['duration_minutes'] ?? 180), 120);

    validate_email_address($email);
    validate_phone_number($phone);
    require_online_booking_date_available($date);

    if ($guestCount < 8) {
        fail('Function requests must be for at least 8 guests.', 422);
    }

    [$startTime, $endTime] = validate_booking_window($date, $time, $durationMinutes, true);
    $customerId = find_or_create_customer(['name' => $name, 'email' => $email, 'phone' => $phone]);
    $reference = booking_reference();

    $stmt = db()->prepare(
        'INSERT INTO bookings
            (booking_reference, booking_type, status, customer_id, customer_name_snapshot, customer_email_snapshot,
             customer_phone_snapshot, guest_count, booking_date, start_time, end_time, preferred_area_id, notes,
             event_type, created_at, updated_at)
         VALUES
            (:reference, "function", "pending", :customer_id, :customer_name, :customer_email, :customer_phone,
             :guest_count, :booking_date, :start_time, :end_time, :preferred_area_id, :notes, :event_type, NOW(), NOW())'
    );
    $stmt->execute([
        'reference' => $reference,
        'customer_id' => $customerId,
        'customer_name' => $name,
        'customer_email' => $email,
        'customer_phone' => $phone,
        'guest_count' => $guestCount,
        'booking_date' => $date,
        'start_time' => $startTime,
        'end_time' => $endTime,
        'preferred_area_id' => $preferredAreaId,
        'notes' => $notes,
        'event_type' => $eventType,
    ]);

    $bookingId = (int) db()->lastInsertId();
    create_email_log(
        $bookingId,
        $email,
        "Old Canberra Inn function request {$reference} received",
        "Hi {$name}, your function request has been received. A manager will review the area and send a confirmation message."
    );
    log_activity(null, 'created', 'function_request', $bookingId, ['reference' => $reference, 'source' => 'public']);

    return [
        'id' => $bookingId,
        'booking_reference' => $reference,
        'status' => 'pending',
        'message' => 'Function request received and acknowledgement email logged.',
    ];
}

function create_manager_function_booking(array $data, array $manager): array
{
    require_fields($data, ['name', 'email', 'phone', 'date', 'time', 'guest_count', 'event_type']);

    $allowedStatuses = ['pending', 'approved', 'confirmed', 'declined', 'cancelled'];
    $name = clean_string($data['name']);
    $email = strtolower(clean_string($data['email']));
    $phone = clean_string($data['phone']);
    $guestCount = (int) $data['guest_count'];
    $date = clean_string($data['date']);
    $time = clean_string($data['time']);
    $eventType = clean_string($data['event_type']);
    $notes = clean_string($data['notes'] ?? '');
    $staffNotes = clean_string($data['staff_notes'] ?? '');
    $managerMessage = clean_string($data['manager_message'] ?? '');
    $status = clean_string($data['status'] ?? 'pending');
    $assignedAreaIds = normalized_area_ids($data['assigned_area_ids'] ?? []);
    $assignedAreaId = $assignedAreaIds[0] ?? null;
    $durationMinutes = max((int) ($data['duration_minutes'] ?? 180), 120);

    validate_email_address($email);
    validate_phone_number($phone);

    if ($guestCount < 8) {
        fail('Function bookings must be for at least 8 guests.', 422);
    }

    if (!in_array($status, $allowedStatuses, true)) {
        fail('Unsupported function status.', 422, ['status' => $status]);
    }

    [$startTime, $endTime] = validate_booking_window($date, $time, $durationMinutes);

    if (in_array($status, ['approved', 'confirmed'], true)) {
        validate_function_area_assignment($assignedAreaIds, $date, $startTime, $endTime);
    }

    $customerId = find_or_create_customer(['name' => $name, 'email' => $email, 'phone' => $phone]);
    $reference = booking_reference();

    $stmt = db()->prepare(
        'INSERT INTO bookings
            (booking_reference, booking_type, status, customer_id, customer_name_snapshot, customer_email_snapshot,
             customer_phone_snapshot, guest_count, booking_date, start_time, end_time, assigned_area_id, notes,
             staff_notes, event_type, manager_message, created_by_user_id, updated_by_user_id, created_at, updated_at)
         VALUES
            (:reference, "function", :status, :customer_id, :customer_name, :customer_email, :customer_phone,
             :guest_count, :booking_date, :start_time, :end_time, :assigned_area_id, :notes, :staff_notes,
             :event_type, :manager_message, :created_by_user_id,
             :updated_by_user_id, NOW(), NOW())'
    );
    $stmt->execute([
        'reference' => $reference,
        'status' => $status,
        'customer_id' => $customerId,
        'customer_name' => $name,
        'customer_email' => $email,
        'customer_phone' => $phone,
        'guest_count' => $guestCount,
        'booking_date' => $date,
        'start_time' => $startTime,
        'end_time' => $endTime,
        'assigned_area_id' => $assignedAreaId,
        'notes' => $notes,
        'staff_notes' => $staffNotes,
        'event_type' => $eventType,
        'manager_message' => $managerMessage,
        'created_by_user_id' => (int) $manager['id'],
        'updated_by_user_id' => (int) $manager['id'],
    ]);

    $bookingId = (int) db()->lastInsertId();
    attach_function_areas_to_booking($bookingId, $assignedAreaIds);
    $booking = fetch_booking($bookingId);

    if ($booking && in_array($status, ['approved', 'confirmed'], true)) {
        create_function_confirmation_email($booking, $managerMessage);
    } else {
        create_email_log(
            $bookingId,
            $email,
            "Old Canberra Inn function booking {$reference} created",
            $managerMessage !== ''
                ? $managerMessage
                : "Hi {$name}, your function booking for {$guestCount} guests on {$date} at {$startTime} has been created."
        );
    }
    log_activity((int) $manager['id'], 'created', 'function_booking', $bookingId, ['reference' => $reference]);

    return $booking ?: fetch_booking($bookingId);
}

function booking_select_sql(?string $type): string
{
    $typeWhere = $type === null ? 'WHERE 1 = 1' : 'WHERE b.booking_type = :type';

    return
        'SELECT b.*,
                COALESCE(NULLIF(b.customer_name_snapshot, ""), c.name) AS customer_name,
                COALESCE(NULLIF(b.customer_email_snapshot, ""), c.email) AS customer_email,
                COALESCE(NULLIF(b.customer_phone_snapshot, ""), c.phone) AS customer_phone,
                preferred.name AS preferred_area_name, assigned.name AS assigned_area_name,
                (
                    SELECT GROUP_CONCAT(a.id ORDER BY a.sort_order, a.id SEPARATOR ",")
                    FROM booking_function_areas bfa
                    JOIN areas a ON a.id = bfa.area_id
                    WHERE bfa.booking_id = b.id
                ) AS assigned_area_ids,
                (
                    SELECT GROUP_CONCAT(a.name ORDER BY a.sort_order, a.id SEPARATOR ", ")
                    FROM booking_function_areas bfa
                    JOIN areas a ON a.id = bfa.area_id
                    WHERE bfa.booking_id = b.id
                ) AS assigned_area_names,
                (
                    SELECT GROUP_CONCAT(vt.table_number ORDER BY vt.table_number SEPARATOR ", ")
                    FROM booking_tables bt
                    JOIN venue_tables vt ON vt.id = bt.table_id
                    WHERE bt.booking_id = b.id
                ) AS table_numbers,
                (
                    SELECT GROUP_CONCAT(vt.id ORDER BY vt.table_number SEPARATOR ",")
                    FROM booking_tables bt
                    JOIN venue_tables vt ON vt.id = bt.table_id
                    WHERE bt.booking_id = b.id
                ) AS table_ids
         FROM bookings b
         JOIN customers c ON c.id = b.customer_id
         LEFT JOIN areas preferred ON preferred.id = b.preferred_area_id
         LEFT JOIN areas assigned ON assigned.id = b.assigned_area_id
         ' . $typeWhere;
}

function list_bookings(?string $type): void
{
    require_manager();

    $page = max((int) ($_GET['page'] ?? 1), 1);
    $perPage = min(max((int) ($_GET['per_page'] ?? 50), 5), 100);
    $offset = ($page - 1) * $perPage;
    $params = [];
    $where = '';

    if ($type !== null) {
        $params['type'] = $type;
    }

    if (!empty($_GET['status'])) {
        $where .= ' AND b.status = :status';
        $params['status'] = clean_string($_GET['status']);
    }

    if (!empty($_GET['date'])) {
        $where .= ' AND b.booking_date = :booking_date';
        $params['booking_date'] = clean_string($_GET['date']);
    }

    if (!empty($_GET['date_from'])) {
        $where .= ' AND b.booking_date >= :date_from';
        $params['date_from'] = clean_string($_GET['date_from']);
    }

    if (!empty($_GET['date_to'])) {
        $where .= ' AND b.booking_date <= :date_to';
        $params['date_to'] = clean_string($_GET['date_to']);
    }

    if (!empty($_GET['type']) && in_array($_GET['type'], ['table', 'function'], true) && $type === null) {
        $where .= ' AND b.booking_type = :booking_type_filter';
        $params['booking_type_filter'] = clean_string($_GET['type']);
    }

    if (!empty($_GET['search'])) {
        $where .= ' AND (
            b.booking_reference LIKE :search_reference
            OR COALESCE(NULLIF(b.customer_name_snapshot, ""), c.name) LIKE :search_name
            OR COALESCE(NULLIF(b.customer_email_snapshot, ""), c.email) LIKE :search_email
            OR COALESCE(NULLIF(b.customer_phone_snapshot, ""), c.phone) LIKE :search_phone
        )';
        $searchTerm = '%' . clean_string($_GET['search']) . '%';
        $params['search_reference'] = $searchTerm;
        $params['search_name'] = $searchTerm;
        $params['search_email'] = $searchTerm;
        $params['search_phone'] = $searchTerm;
    }

    $count = db()->prepare(
        'SELECT COUNT(*)
         FROM bookings b
         JOIN customers c ON c.id = b.customer_id
         ' . ($type === null ? 'WHERE 1 = 1' : 'WHERE b.booking_type = :type') . $where
    );
    $count->execute($params);
    $total = (int) $count->fetchColumn();

    $sql = booking_select_sql($type) . $where . ' ORDER BY b.booking_date ASC, b.start_time ASC LIMIT ' . $perPage . ' OFFSET ' . $offset;
    $stmt = db()->prepare($sql);
    $stmt->execute($params);

    respond([
        'items' => $stmt->fetchAll(),
        'meta' => [
            'page' => $page,
            'per_page' => $perPage,
            'total' => $total,
            'total_pages' => (int) ceil($total / $perPage),
        ],
    ]);
}

function update_booking(int $bookingId, array $data, array $manager): array
{
    $existing = fetch_booking($bookingId);
    if (!$existing) {
        fail('Booking not found.', 404);
    }

    $allowedStatuses = ['pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show', 'approved', 'declined'];
    $status = clean_string($data['status'] ?? '');
    if ($status !== '' && !in_array($status, $allowedStatuses, true)) {
        fail('Unsupported booking status.', 422, ['status' => $status]);
    }

    $managerMessage = array_key_exists('manager_message', $data) ? clean_string($data['manager_message']) : '';
    $assignedAreaIds = [];
    if ((string) $existing['booking_type'] === 'function') {
        $assignedAreaIds = array_key_exists('assigned_area_ids', $data)
            ? normalized_area_ids($data['assigned_area_ids'])
            : (
                array_key_exists('assigned_area_id', $data)
                    ? array_filter([nullable_int($data['assigned_area_id'])])
                    : normalized_area_ids(explode(',', (string) ($existing['assigned_area_ids'] ?? $existing['assigned_area_id'] ?? '')))
            );
    }
    $assignedAreaId = array_key_exists('assigned_area_id', $data)
        ? nullable_int($data['assigned_area_id'])
        : (array_key_exists('assigned_area_ids', $data) ? ($assignedAreaIds[0] ?? null) : nullable_int($existing['assigned_area_id']));
    $preferredAreaId = array_key_exists('preferred_area_id', $data)
        ? nullable_int($data['preferred_area_id'])
        : nullable_int($existing['preferred_area_id']);
    $guestCount = array_key_exists('guest_count', $data)
        ? (int) $data['guest_count']
        : (int) $existing['guest_count'];
    $bookingDate = array_key_exists('date', $data)
        ? clean_string($data['date'])
        : (string) $existing['booking_date'];
    $startInput = array_key_exists('time', $data)
        ? clean_string($data['time'])
        : substr((string) $existing['start_time'], 0, 5);
    $durationMinutes = (int) setting('default_duration_minutes', '120');
    if ((string) $existing['booking_type'] === 'function' && array_key_exists('duration_minutes', $data)) {
        $durationMinutes = max((int) $data['duration_minutes'], 120);
    } elseif ((string) $existing['booking_type'] === 'function') {
        $durationMinutes = max((minutes_from_time(substr((string) $existing['end_time'], 0, 5)) - minutes_from_time(substr((string) $existing['start_time'], 0, 5))), 120);
    }

    [$startTime, $endTime] = validate_booking_window($bookingDate, $startInput, $durationMinutes);

    if ((string) $existing['booking_type'] === 'table') {
        $minGuests = (int) setting('min_table_guests', '8');
        $maxGuests = (int) setting('max_table_guests', '29');
        if ($guestCount < $minGuests || $guestCount > $maxGuests) {
            fail("Table bookings must be between {$minGuests} and {$maxGuests} guests.", 422);
        }
    }

    $customerSnapshotUpdate = null;
    if (array_key_exists('name', $data) || array_key_exists('email', $data) || array_key_exists('phone', $data)) {
        $customerName = clean_string($data['name'] ?? $existing['customer_name']);
        $customerEmail = strtolower(clean_string($data['email'] ?? $existing['customer_email']));
        $customerPhone = clean_string($data['phone'] ?? $existing['customer_phone']);
        require_fields(['name' => $customerName, 'email' => $customerEmail, 'phone' => $customerPhone], ['name', 'email', 'phone']);
        validate_email_address($customerEmail);
        validate_phone_number($customerPhone);

        $customerSnapshotUpdate = [
            'customer_id' => find_or_create_customer(['name' => $customerName, 'email' => $customerEmail, 'phone' => $customerPhone]),
            'name' => $customerName,
            'email' => $customerEmail,
            'phone' => $customerPhone,
        ];
    }

    $hasManualTableIds = array_key_exists('table_ids', $data);
    $manualRecommendation = null;
    if ((string) $existing['booking_type'] === 'table' && $hasManualTableIds) {
        $manualRecommendation = manual_table_assignment(
            normalized_table_ids($data['table_ids']),
            $guestCount,
            $bookingDate,
            $startTime,
            $endTime,
            $bookingId
        );
        $assignedAreaId = (int) $manualRecommendation['area_id'];
    }

    $shouldReassign = (string) $existing['booking_type'] === 'table'
        && !$hasManualTableIds
        && (
            $guestCount !== (int) $existing['guest_count']
            || $bookingDate !== (string) $existing['booking_date']
            || $startTime !== substr((string) $existing['start_time'], 0, 5)
            || $preferredAreaId !== nullable_int($existing['preferred_area_id'])
        );

    $recommendation = null;
    if ($shouldReassign) {
        $recommendation = recommend_tables($guestCount, $bookingDate, $startTime, $endTime, $preferredAreaId, $bookingId);
        $assignedAreaId = (int) $recommendation['area_id'];
    }

    $nextStatus = $status !== '' ? $status : (string) $existing['status'];
    if (
        (string) $existing['booking_type'] === 'function'
        && in_array($nextStatus, ['approved', 'confirmed'], true)
    ) {
        validate_function_area_assignment($assignedAreaIds, $bookingDate, $startTime, $endTime, $bookingId);
    }

    $updates = ['updated_by_user_id = :updated_by_user_id', 'updated_at = NOW()'];
    $params = ['id' => $bookingId, 'updated_by_user_id' => $manager['id']];

    if ($status !== '') {
        $updates[] = 'status = :status';
        $params['status'] = $status;
    }
    if ($customerSnapshotUpdate !== null) {
        $updates[] = 'customer_id = :customer_id';
        $updates[] = 'customer_name_snapshot = :customer_name_snapshot';
        $updates[] = 'customer_email_snapshot = :customer_email_snapshot';
        $updates[] = 'customer_phone_snapshot = :customer_phone_snapshot';
        $params['customer_id'] = $customerSnapshotUpdate['customer_id'];
        $params['customer_name_snapshot'] = $customerSnapshotUpdate['name'];
        $params['customer_email_snapshot'] = $customerSnapshotUpdate['email'];
        $params['customer_phone_snapshot'] = $customerSnapshotUpdate['phone'];
    }
    if (array_key_exists('manager_message', $data)) {
        $updates[] = 'manager_message = :manager_message';
        $params['manager_message'] = $managerMessage;
    }
    if (array_key_exists('assigned_area_id', $data) || array_key_exists('assigned_area_ids', $data) || $recommendation !== null || $manualRecommendation !== null) {
        $updates[] = 'assigned_area_id = :assigned_area_id';
        $params['assigned_area_id'] = $assignedAreaId;
    }
    if (array_key_exists('preferred_area_id', $data)) {
        $updates[] = 'preferred_area_id = :preferred_area_id';
        $params['preferred_area_id'] = $preferredAreaId;
    }
    if (array_key_exists('guest_count', $data)) {
        $updates[] = 'guest_count = :guest_count';
        $params['guest_count'] = $guestCount;
    }
    if (array_key_exists('date', $data) || array_key_exists('time', $data)) {
        $updates[] = 'booking_date = :booking_date';
        $updates[] = 'start_time = :start_time';
        $updates[] = 'end_time = :end_time';
        $params['booking_date'] = $bookingDate;
        $params['start_time'] = $startTime;
        $params['end_time'] = $endTime;
    }
    if (array_key_exists('notes', $data)) {
        $updates[] = 'notes = :notes';
        $params['notes'] = clean_string($data['notes']);
    }
    if (array_key_exists('staff_notes', $data)) {
        $updates[] = 'staff_notes = :staff_notes';
        $params['staff_notes'] = clean_string($data['staff_notes']);
    }
    if (array_key_exists('event_type', $data)) {
        $updates[] = 'event_type = :event_type';
        $params['event_type'] = clean_string($data['event_type']);
    }

    $stmt = db()->prepare('UPDATE bookings SET ' . implode(', ', $updates) . ' WHERE id = :id');
    $stmt->execute($params);

    if ($recommendation !== null) {
        attach_tables_to_booking($bookingId, $recommendation['table_ids']);
        log_ai_assignment($bookingId, $recommendation, (int) $manager['id'], false);
    } elseif ($manualRecommendation !== null) {
        attach_tables_to_booking($bookingId, $manualRecommendation['table_ids']);
        log_ai_assignment($bookingId, $manualRecommendation, (int) $manager['id'], true);
    }

    if ((string) $existing['booking_type'] === 'function' && (array_key_exists('assigned_area_ids', $data) || array_key_exists('assigned_area_id', $data))) {
        attach_function_areas_to_booking($bookingId, $assignedAreaIds);
    }

    $booking = fetch_booking($bookingId);
    if ($booking && $managerMessage !== '') {
        create_email_log(
            $bookingId,
            $booking['customer_email'],
            "Old Canberra Inn booking {$booking['booking_reference']} update",
            $managerMessage
        );
    }

    log_activity((int) $manager['id'], 'updated', 'booking', $bookingId, ['status' => $status]);

    return fetch_booking($bookingId);
}

function fetch_booking(int $bookingId): ?array
{
    $sql =
        'SELECT b.*,
                COALESCE(NULLIF(b.customer_name_snapshot, ""), c.name) AS customer_name,
                COALESCE(NULLIF(b.customer_email_snapshot, ""), c.email) AS customer_email,
                COALESCE(NULLIF(b.customer_phone_snapshot, ""), c.phone) AS customer_phone,
                preferred.name AS preferred_area_name, assigned.name AS assigned_area_name,
                (
                    SELECT GROUP_CONCAT(a.id ORDER BY a.sort_order, a.id SEPARATOR ",")
                    FROM booking_function_areas bfa
                    JOIN areas a ON a.id = bfa.area_id
                    WHERE bfa.booking_id = b.id
                ) AS assigned_area_ids,
                (
                    SELECT GROUP_CONCAT(a.name ORDER BY a.sort_order, a.id SEPARATOR ", ")
                    FROM booking_function_areas bfa
                    JOIN areas a ON a.id = bfa.area_id
                    WHERE bfa.booking_id = b.id
                ) AS assigned_area_names,
                (
                    SELECT GROUP_CONCAT(vt.table_number ORDER BY vt.table_number SEPARATOR ", ")
                    FROM booking_tables bt
                    JOIN venue_tables vt ON vt.id = bt.table_id
                    WHERE bt.booking_id = b.id
                ) AS table_numbers,
                (
                    SELECT GROUP_CONCAT(vt.id ORDER BY vt.table_number SEPARATOR ",")
                    FROM booking_tables bt
                    JOIN venue_tables vt ON vt.id = bt.table_id
                    WHERE bt.booking_id = b.id
                ) AS table_ids
         FROM bookings b
         JOIN customers c ON c.id = b.customer_id
         LEFT JOIN areas preferred ON preferred.id = b.preferred_area_id
         LEFT JOIN areas assigned ON assigned.id = b.assigned_area_id
         WHERE b.id = :id
         LIMIT 1';
    $stmt = db()->prepare($sql);
    $stmt->execute(['id' => $bookingId]);
    $booking = $stmt->fetch();

    return $booking ?: null;
}

function meta_payload(): array
{
    $settings = settings_defaults();
    $storedSettings = [];
    foreach (db()->query('SELECT setting_key, setting_value FROM settings ORDER BY setting_key')->fetchAll() as $row) {
        $storedSettings[$row['setting_key']] = $row['setting_value'];
        $settings[$row['setting_key']] = $row['setting_value'];
    }

    if (!array_key_exists('annual_closed_days', $storedSettings)) {
        $settings['annual_closed_days'] = $storedSettings['annual_closed_day'] ?? $settings['annual_closed_day'];
    }
    $settings['venue_image_url'] = public_asset_url($settings['venue_image_url'] ?? '');

    return [
        'areas' => db()->query('SELECT id, code, name, function_enabled, active FROM areas WHERE active = 1 ORDER BY sort_order, id')->fetchAll(),
        'function_areas' => db()->query('SELECT id, code, name FROM areas WHERE active = 1 AND function_enabled = 1 ORDER BY sort_order, id')->fetchAll(),
        'settings' => $settings,
        'opening_hours' => db()->query('SELECT day_of_week, opens_at, closes_at, is_closed FROM opening_hours ORDER BY day_of_week')->fetchAll(),
        'online_booking_blocks' => fetch_online_booking_blocks(),
    ];
}

function dashboard_guest_chart_points(string $startDate, int $days): array
{
    $start = new DateTimeImmutable($startDate);
    $end = $start->modify('+' . max($days - 1, 0) . ' days')->format('Y-m-d');
    $stmt = db()->prepare(
        'SELECT booking_date, COALESCE(SUM(guest_count), 0) AS guests
         FROM bookings
         WHERE booking_date BETWEEN :start_date AND :end_date
           AND status NOT IN ("cancelled", "declined", "no_show")
         GROUP BY booking_date'
    );
    $stmt->execute(['start_date' => $startDate, 'end_date' => $end]);
    $guestsByDate = [];
    foreach ($stmt->fetchAll() as $row) {
        $guestsByDate[(string) $row['booking_date']] = (int) $row['guests'];
    }

    $points = [];
    for ($index = 0; $index < $days; $index++) {
        $date = $start->modify("+{$index} days")->format('Y-m-d');
        $points[] = [
            'date' => $date,
            'guests' => $guestsByDate[$date] ?? 0,
        ];
    }

    return $points;
}

function dashboard_payload(): array
{
    require_manager();
    $today = date('Y-m-d');
    $nextWeek = (new DateTime('+7 days'))->format('Y-m-d');
    $monthStart = (new DateTimeImmutable('first day of this month'))->format('Y-m-d');
    $daysInMonth = (int) (new DateTimeImmutable('last day of this month'))->format('j');

    $todayMetricsStmt = db()->prepare(
        'SELECT
            COUNT(*) AS all_bookings,
            COALESCE(SUM(guest_count), 0) AS all_guests,
            COALESCE(SUM(CASE WHEN start_time < "17:00:00" THEN 1 ELSE 0 END), 0) AS lunch_bookings,
            COALESCE(SUM(CASE WHEN start_time < "17:00:00" THEN guest_count ELSE 0 END), 0) AS lunch_guests,
            COALESCE(SUM(CASE WHEN start_time >= "17:00:00" THEN 1 ELSE 0 END), 0) AS dinner_bookings,
            COALESCE(SUM(CASE WHEN start_time >= "17:00:00" THEN guest_count ELSE 0 END), 0) AS dinner_guests
         FROM bookings
         WHERE booking_date = :today
           AND status NOT IN ("cancelled", "declined", "no_show")'
    );
    $todayMetricsStmt->execute(['today' => $today]);
    $todayMetrics = $todayMetricsStmt->fetch() ?: [];

    $pendingFunctionRequests = scalar_query(
        'SELECT COUNT(*) FROM bookings WHERE booking_type = "function" AND status = "pending"',
        []
    );
    $bookingsWithoutTables = scalar_query(
        'SELECT COUNT(*)
         FROM bookings b
         WHERE b.booking_type = "table"
           AND b.booking_date >= ?
           AND b.status NOT IN ("cancelled", "declined", "no_show")
           AND NOT EXISTS (SELECT 1 FROM booking_tables bt WHERE bt.booking_id = b.id)',
        [$today]
    );

    $cards = [
        'today_bookings' => scalar_query('SELECT COUNT(*) FROM bookings WHERE booking_type = "table" AND booking_date = ?', [$today]),
        'pending_functions' => scalar_query('SELECT COUNT(*) FROM bookings WHERE booking_type = "function" AND status = "pending"', []),
        'guests_next_7_days' => scalar_query('SELECT COALESCE(SUM(guest_count), 0) FROM bookings WHERE booking_date BETWEEN ? AND ? AND status NOT IN ("cancelled", "declined", "no_show")', [$today, $nextWeek]),
        'emails_logged' => scalar_query('SELECT COUNT(*) FROM email_logs', []),
    ];

    $recent = db()->query(
        'SELECT b.id, b.booking_reference, b.booking_type, b.status, b.booking_date, b.start_time, b.guest_count,
                COALESCE(NULLIF(b.customer_name_snapshot, ""), c.name) AS customer_name,
                a.name AS assigned_area_name
         FROM bookings b
         JOIN customers c ON c.id = b.customer_id
         LEFT JOIN areas a ON a.id = b.assigned_area_id
         ORDER BY b.created_at DESC
         LIMIT 8'
    )->fetchAll();

    $areaMix = db()->query(
        'SELECT COALESCE(a.name, "Unassigned") AS area_name, COUNT(*) AS total
         FROM bookings b
         LEFT JOIN areas a ON a.id = b.assigned_area_id
         WHERE b.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         GROUP BY COALESCE(a.name, "Unassigned")
         ORDER BY total DESC'
    )->fetchAll();

    $statusMix = db()->query(
        'SELECT status, COUNT(*) AS total
         FROM bookings
         GROUP BY status
         ORDER BY total DESC'
    )->fetchAll();

    $upcoming = db()->query(
        'SELECT b.id, b.booking_reference, b.booking_type, b.status, b.booking_date, b.start_time, b.guest_count,
                COALESCE(NULLIF(b.customer_name_snapshot, ""), c.name) AS customer_name,
                a.name AS assigned_area_name
         FROM bookings b
         JOIN customers c ON c.id = b.customer_id
         LEFT JOIN areas a ON a.id = b.assigned_area_id
         WHERE b.booking_date >= CURDATE()
           AND b.status NOT IN ("cancelled", "declined", "no_show")
         ORDER BY b.booking_date ASC, b.start_time ASC
        LIMIT 8'
    )->fetchAll();

    $todayBookingsStmt = db()->prepare(
        booking_select_sql(null) .
        ' AND b.booking_date = :today
          AND b.status NOT IN ("cancelled", "declined", "no_show")
          ORDER BY b.start_time ASC, b.created_at ASC'
    );
    $todayBookingsStmt->execute(['today' => $today]);
    $todayBookings = $todayBookingsStmt->fetchAll();

    $upcomingFunctionsStmt = db()->prepare(
        booking_select_sql('function') .
        ' AND b.booking_date >= :today
          AND b.status NOT IN ("cancelled", "declined", "no_show", "completed")
          ORDER BY b.booking_date ASC, b.start_time ASC
          LIMIT 6'
    );
    $upcomingFunctionsStmt->execute(['type' => 'function', 'today' => $today]);
    $upcomingFunctions = $upcomingFunctionsStmt->fetchAll();

    $activity = db()->query(
        'SELECT l.*, u.name AS user_name
         FROM activity_logs l
         LEFT JOIN users u ON u.id = l.user_id
         ORDER BY l.created_at DESC
         LIMIT 8'
    )->fetchAll();

    return [
        'today' => [
            'all' => [
                'bookings' => (int) ($todayMetrics['all_bookings'] ?? 0),
                'guests' => (int) ($todayMetrics['all_guests'] ?? 0),
            ],
            'lunch' => [
                'bookings' => (int) ($todayMetrics['lunch_bookings'] ?? 0),
                'guests' => (int) ($todayMetrics['lunch_guests'] ?? 0),
            ],
            'dinner' => [
                'bookings' => (int) ($todayMetrics['dinner_bookings'] ?? 0),
                'guests' => (int) ($todayMetrics['dinner_guests'] ?? 0),
            ],
        ],
        'pending_actions' => [
            'function_requests' => $pendingFunctionRequests,
            'bookings_without_tables' => $bookingsWithoutTables,
        ],
        'guest_chart' => [
            'weekly' => dashboard_guest_chart_points($today, 7),
            'monthly' => dashboard_guest_chart_points($monthStart, $daysInMonth),
        ],
        'today_bookings' => $todayBookings,
        'upcoming_functions' => $upcomingFunctions,
        'cards' => $cards,
        'recent' => $recent,
        'area_mix' => $areaMix,
        'status_mix' => $statusMix,
        'upcoming' => $upcoming,
        'activity' => $activity,
    ];
}

function scalar_query(string $sql, array $params): int
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);

    return (int) $stmt->fetchColumn();
}

function save_setting_value(string $key, string $value): void
{
    $stmt = db()->prepare(
        'INSERT INTO settings (setting_key, setting_value, updated_at)
         VALUES (:setting_key, :setting_value, NOW())
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()'
    );
    $stmt->execute(['setting_key' => clean_string($key), 'setting_value' => clean_string($value)]);
}

function upload_venue_image(array $manager): array
{
    if (empty($_FILES['image']) || !is_array($_FILES['image'])) {
        fail('Please choose an image to upload.', 422);
    }

    $file = $_FILES['image'];
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        fail('Image upload failed.', 422, ['upload_error' => $file['error'] ?? null]);
    }

    if (($file['size'] ?? 0) > 5 * 1024 * 1024) {
        fail('Image must be 5 MB or smaller.', 422);
    }

    $tmpPath = (string) ($file['tmp_name'] ?? '');
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mimeType = $finfo->file($tmpPath) ?: '';
    $extensions = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
    ];

    if (!isset($extensions[$mimeType])) {
        fail('Please upload a JPG, PNG, WebP, or GIF image.', 422, ['mime_type' => $mimeType]);
    }

    $uploadDir = __DIR__ . '/uploads/venue';
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0775, true) && !is_dir($uploadDir)) {
        fail('Venue image folder could not be created.', 500);
    }

    $filename = 'venue-' . date('Ymd-His') . '-' . bin2hex(random_bytes(4)) . '.' . $extensions[$mimeType];
    $destination = $uploadDir . '/' . $filename;

    if (!move_uploaded_file($tmpPath, $destination)) {
        fail('Venue image could not be saved.', 500);
    }

    $url = public_asset_url('uploads/venue/' . $filename);
    save_setting_value('venue_image_url', $url);
    log_activity((int) $manager['id'], 'updated', 'settings', null, ['venue_image_url' => $url]);

    return ['url' => $url];
}

function upload_profile_avatar(array $manager): array
{
    if (empty($_FILES['image']) || !is_array($_FILES['image'])) {
        fail('Please choose an image to upload.', 422);
    }

    $file = $_FILES['image'];
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        fail('Image upload failed.', 422, ['upload_error' => $file['error'] ?? null]);
    }

    if (($file['size'] ?? 0) > 5 * 1024 * 1024) {
        fail('Image must be 5 MB or smaller.', 422);
    }

    $tmpPath = (string) ($file['tmp_name'] ?? '');
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mimeType = $finfo->file($tmpPath) ?: '';
    $extensions = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
    ];

    if (!isset($extensions[$mimeType])) {
        fail('Please upload a JPG, PNG, WebP, or GIF image.', 422, ['mime_type' => $mimeType]);
    }

    $uploadDir = __DIR__ . '/uploads/users';
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0775, true) && !is_dir($uploadDir)) {
        fail('Profile image folder could not be created.', 500);
    }

    $filename = 'user-' . (int) $manager['id'] . '-' . date('Ymd-His') . '-' . bin2hex(random_bytes(4)) . '.' . $extensions[$mimeType];
    $destination = $uploadDir . '/' . $filename;

    if (!move_uploaded_file($tmpPath, $destination)) {
        fail('Profile image could not be saved.', 500);
    }

    $url = public_asset_url('uploads/users/' . $filename);
    $stmt = db()->prepare('UPDATE users SET avatar_url = :avatar_url, updated_at = NOW() WHERE id = :id');
    $stmt->execute([
        'avatar_url' => $url,
        'id' => (int) $manager['id'],
    ]);
    log_activity((int) $manager['id'], 'updated', 'profile', (int) $manager['id'], ['avatar_url' => $url]);

    return ['url' => $url, 'user' => current_user()];
}

function area_code_from_name(string $name): string
{
    $code = strtoupper((string) preg_replace('/[^A-Za-z0-9]+/', '_', $name));
    $code = trim($code, '_');
    $code = substr($code !== '' ? $code : 'AREA', 0, 20);
    $base = $code;
    $suffix = 2;

    while (scalar_query('SELECT COUNT(*) FROM areas WHERE code = ?', [$code]) > 0) {
        $suffixText = '_' . $suffix;
        $code = substr($base, 0, 20 - strlen($suffixText)) . $suffixText;
        $suffix++;
    }

    return $code;
}

function ensure_area_exists(int $areaId): void
{
    if ($areaId <= 0 || scalar_query('SELECT COUNT(*) FROM areas WHERE id = ?', [$areaId]) === 0) {
        fail('Please choose a valid area.', 422, ['area_id' => $areaId]);
    }
}

function ensure_table_number_available(int $tableNumber, ?int $excludeId = null): void
{
    if ($tableNumber <= 0) {
        fail('Table number must be greater than zero.', 422, ['table_number' => $tableNumber]);
    }

    $sql = 'SELECT COUNT(*) FROM venue_tables WHERE table_number = ?';
    $params = [$tableNumber];
    if ($excludeId !== null) {
        $sql .= ' AND id <> ?';
        $params[] = $excludeId;
    }

    if (scalar_query($sql, $params) > 0) {
        fail('That table number already exists.', 409, ['table_number' => $tableNumber]);
    }
}

function sync_area_table_range(int $areaId): void
{
    if ($areaId <= 0) {
        return;
    }

    $stmt = db()->prepare(
        'SELECT COALESCE(MIN(table_number), 0) AS table_start, COALESCE(MAX(table_number), 0) AS table_end
         FROM venue_tables
         WHERE area_id = :area_id'
    );
    $stmt->execute(['area_id' => $areaId]);
    $range = $stmt->fetch() ?: ['table_start' => 0, 'table_end' => 0];

    $update = db()->prepare('UPDATE areas SET table_start = :table_start, table_end = :table_end WHERE id = :id');
    $update->execute([
        'table_start' => (int) $range['table_start'],
        'table_end' => (int) $range['table_end'],
        'id' => $areaId,
    ]);
}

try {
    ensure_booking_customer_snapshots();
    ensure_online_booking_blocks_table();
    ensure_user_avatar_column();

    $method = $_SERVER['REQUEST_METHOD'];
    $route = trim((string) ($_GET['r'] ?? 'meta'), '/');
    $segments = $route === '' ? [] : explode('/', $route);

    if ($method === 'GET' && $route === 'meta') {
        respond(meta_payload());
    }

    if ($method === 'POST' && $route === 'auth/login') {
        $data = json_body();
        require_fields($data, ['email', 'password']);

        $stmt = db()->prepare('SELECT id, name, email, role, password_hash, status, avatar_url FROM users WHERE email = :email LIMIT 1');
        $stmt->execute(['email' => strtolower(clean_string($data['email']))]);
        $user = $stmt->fetch();

        if (!$user || $user['status'] !== 'active' || !password_verify((string) $data['password'], $user['password_hash'])) {
            fail('Invalid email or password.', 401);
        }

        $_SESSION['user_id'] = (int) $user['id'];
        log_activity((int) $user['id'], 'signed_in', 'user', (int) $user['id']);
        unset($user['password_hash']);
        respond(['user' => normalize_user_record($user)]);
    }

    if ($method === 'POST' && $route === 'auth/logout') {
        $user = current_user();
        if ($user) {
            log_activity((int) $user['id'], 'signed_out', 'user', (int) $user['id']);
        }
        session_destroy();
        respond(['ok' => true]);
    }

    if ($method === 'GET' && $route === 'auth/me') {
        respond(['user' => current_user()]);
    }

    if ($method === 'PUT' && $route === 'profile') {
        $manager = require_manager();
        $data = json_body();
        $name = clean_string($data['name'] ?? '');
        $email = strtolower(clean_string($data['email'] ?? ''));
        $password = (string) ($data['password'] ?? '');

        require_fields(['name' => $name, 'email' => $email], ['name', 'email']);
        validate_email_address($email);

        if (scalar_query('SELECT COUNT(*) FROM users WHERE email = ? AND id <> ?', [$email, (int) $manager['id']]) > 0) {
            fail('That email is already used by another user.', 409, ['email' => $email]);
        }

        $updates = ['name = :name', 'email = :email', 'updated_at = NOW()'];
        $params = [
            'name' => $name,
            'email' => $email,
            'id' => (int) $manager['id'],
        ];

        if ($password !== '') {
            if (strlen($password) < 8) {
                fail('Password must be at least 8 characters.', 422);
            }

            $updates[] = 'password_hash = :password_hash';
            $params['password_hash'] = password_hash($password, PASSWORD_DEFAULT);
        }

        $stmt = db()->prepare('UPDATE users SET ' . implode(', ', $updates) . ' WHERE id = :id');
        $stmt->execute($params);
        log_activity((int) $manager['id'], 'updated', 'profile', (int) $manager['id']);
        respond(['user' => current_user()]);
    }

    if ($method === 'POST' && $route === 'profile/avatar') {
        $manager = require_manager();
        respond(upload_profile_avatar($manager), 201);
    }

    if ($method === 'DELETE' && $route === 'profile/avatar') {
        $manager = require_manager();
        $stmt = db()->prepare('UPDATE users SET avatar_url = NULL, updated_at = NOW() WHERE id = :id');
        $stmt->execute(['id' => (int) $manager['id']]);
        log_activity((int) $manager['id'], 'updated', 'profile', (int) $manager['id'], ['avatar_url' => '']);
        respond(['ok' => true, 'user' => current_user()]);
    }

    if ($method === 'POST' && $route === 'public/table-bookings') {
        if (!setting_enabled('online_table_bookings_enabled')) {
            fail('Online table bookings are currently turned off.', 403);
        }
        db()->beginTransaction();
        $result = create_table_booking(json_body());
        db()->commit();
        respond($result, 201);
    }

    if ($method === 'POST' && $route === 'public/function-requests') {
        if (!setting_enabled('online_function_requests_enabled')) {
            fail('Online function requests are currently turned off.', 403);
        }
        db()->beginTransaction();
        $result = create_function_request(json_body());
        db()->commit();
        respond($result, 201);
    }

    if ($method === 'GET' && $route === 'dashboard') {
        respond(dashboard_payload());
    }

    if ($method === 'GET' && $route === 'bookings') {
        $type = clean_string($_GET['type'] ?? 'table');
        list_bookings(match ($type) {
            'all' => null,
            'function' => 'function',
            default => 'table',
        });
    }

    if ($method === 'POST' && $route === 'bookings') {
        $manager = require_manager();
        db()->beginTransaction();
        $result = create_table_booking(json_body(), $manager);
        db()->commit();
        respond($result, 201);
    }

    if (($segments[0] ?? '') === 'bookings' && isset($segments[1], $segments[2]) && $segments[2] === 'reply-draft' && $method === 'POST') {
        $manager = require_manager();
        respond(generate_booking_reply_draft((int) $segments[1], json_body(), $manager));
    }

    if (($segments[0] ?? '') === 'bookings' && isset($segments[1], $segments[2]) && $segments[2] === 'reply-log' && $method === 'POST') {
        $manager = require_manager();
        respond(log_ai_reply_email((int) $segments[1], json_body(), $manager), 201);
    }

    if (($segments[0] ?? '') === 'bookings' && isset($segments[1]) && $method === 'PUT') {
        $manager = require_manager();
        db()->beginTransaction();
        $result = update_booking((int) $segments[1], json_body(), $manager);
        db()->commit();
        respond(['item' => $result]);
    }

    if ($method === 'GET' && $route === 'functions') {
        list_bookings('function');
    }

    if ($method === 'POST' && $route === 'functions') {
        $manager = require_manager();
        db()->beginTransaction();
        $result = create_manager_function_booking(json_body(), $manager);
        db()->commit();
        respond(['item' => $result], 201);
    }

    if (($segments[0] ?? '') === 'functions' && isset($segments[1]) && $method === 'PUT') {
        $manager = require_manager();
        db()->beginTransaction();
        $result = update_booking((int) $segments[1], json_body(), $manager);
        db()->commit();
        respond(['item' => $result]);
    }

    if ($method === 'GET' && $route === 'online-booking-blocks') {
        require_manager();
        respond(['items' => fetch_online_booking_blocks()]);
    }

    if ($method === 'POST' && $route === 'online-booking-blocks') {
        $manager = require_manager();
        $data = json_body();
        $date = clean_string($data['date'] ?? '');
        validate_date_value($date);

        $stmt = db()->prepare(
            'INSERT INTO online_booking_blocks (block_date, created_by_user_id, created_at, updated_at)
             VALUES (:block_date, :created_by_user_id, NOW(), NOW())
             ON DUPLICATE KEY UPDATE created_by_user_id = VALUES(created_by_user_id), updated_at = NOW()'
        );
        $stmt->execute([
            'block_date' => $date,
            'created_by_user_id' => (int) $manager['id'],
        ]);
        log_activity((int) $manager['id'], 'blocked_online_bookings', 'date', null, ['date' => $date]);
        respond(['item' => ['block_date' => $date]]);
    }

    if (($segments[0] ?? '') === 'online-booking-blocks' && isset($segments[1]) && $method === 'DELETE') {
        $manager = require_manager();
        $date = clean_string($segments[1]);
        validate_date_value($date);
        db()->prepare('DELETE FROM online_booking_blocks WHERE block_date = :block_date')->execute(['block_date' => $date]);
        log_activity((int) $manager['id'], 'unblocked_online_bookings', 'date', null, ['date' => $date]);
        respond(['ok' => true]);
    }

    if ($method === 'GET' && $route === 'calendar') {
        require_manager();
        $stmt = db()->query(
            booking_select_sql(null) .
            ' AND b.status NOT IN ("cancelled", "declined", "no_show")
             ORDER BY b.booking_date, b.start_time'
        );
        respond(['items' => $stmt->fetchAll(), 'online_booking_blocks' => fetch_online_booking_blocks()]);
    }

    if ($method === 'GET' && $route === 'tables') {
        require_manager();
        $areas = db()->query('SELECT * FROM areas ORDER BY sort_order, id')->fetchAll();
        $tables = db()->query('SELECT * FROM venue_tables ORDER BY table_number')->fetchAll();
        respond(['areas' => $areas, 'tables' => $tables]);
    }

    if ($method === 'POST' && $route === 'tables') {
        $manager = require_manager();
        $data = json_body();
        $areaId = (int) ($data['area_id'] ?? 0);
        $tableNumber = (int) ($data['table_number'] ?? 0);

        ensure_area_exists($areaId);
        ensure_table_number_available($tableNumber);

        $stmt = db()->prepare(
            'INSERT INTO venue_tables (area_id, table_number, capacity, active, created_at, updated_at)
             VALUES (:area_id, :table_number, :capacity, :active, NOW(), NOW())'
        );
        $stmt->execute([
            'area_id' => $areaId,
            'table_number' => $tableNumber,
            'capacity' => max((int) ($data['capacity'] ?? 8), 1),
            'active' => bool_int($data['active'] ?? true),
        ]);
        $tableId = (int) db()->lastInsertId();
        sync_area_table_range($areaId);
        log_activity((int) $manager['id'], 'created', 'table', $tableId);
        respond(['ok' => true, 'id' => $tableId], 201);
    }

    if (($segments[0] ?? '') === 'tables' && isset($segments[1]) && $method === 'PUT') {
        $manager = require_manager();
        $data = json_body();
        $tableId = (int) $segments[1];
        $existingStmt = db()->prepare('SELECT * FROM venue_tables WHERE id = :id');
        $existingStmt->execute(['id' => $tableId]);
        $existing = $existingStmt->fetch();
        if (!$existing) {
            fail('Table not found.', 404);
        }

        $areaId = array_key_exists('area_id', $data) ? (int) $data['area_id'] : (int) $existing['area_id'];
        $tableNumber = array_key_exists('table_number', $data) ? (int) $data['table_number'] : (int) $existing['table_number'];
        ensure_area_exists($areaId);
        ensure_table_number_available($tableNumber, $tableId);

        $stmt = db()->prepare(
            'UPDATE venue_tables
             SET area_id = :area_id, table_number = :table_number, capacity = :capacity, active = :active, updated_at = NOW()
             WHERE id = :id'
        );
        $stmt->execute([
            'area_id' => $areaId,
            'table_number' => $tableNumber,
            'capacity' => max((int) ($data['capacity'] ?? 8), 1),
            'active' => bool_int($data['active'] ?? true),
            'id' => $tableId,
        ]);
        sync_area_table_range((int) $existing['area_id']);
        sync_area_table_range($areaId);
        log_activity((int) $manager['id'], 'updated', 'table', $tableId);
        respond(['ok' => true]);
    }

    if (($segments[0] ?? '') === 'tables' && isset($segments[1]) && $method === 'DELETE') {
        $manager = require_manager();
        $tableId = (int) $segments[1];
        $stmt = db()->prepare('SELECT area_id FROM venue_tables WHERE id = :id');
        $stmt->execute(['id' => $tableId]);
        $table = $stmt->fetch();
        if (!$table) {
            fail('Table not found.', 404);
        }

        if (scalar_query('SELECT COUNT(*) FROM booking_tables WHERE table_id = ?', [$tableId]) > 0) {
            fail('This table is used by existing bookings. Mark it not reservable instead.', 409);
        }

        db()->prepare('DELETE FROM venue_tables WHERE id = :id')->execute(['id' => $tableId]);
        sync_area_table_range((int) $table['area_id']);
        log_activity((int) $manager['id'], 'deleted', 'table', $tableId);
        respond(['ok' => true]);
    }

    if ($method === 'POST' && $route === 'areas') {
        $manager = require_manager();
        $data = json_body();
        $name = clean_string($data['name'] ?? '');
        if ($name === '') {
            fail('Area name is required.', 422);
        }
        $code = clean_string($data['code'] ?? '');
        $code = $code !== '' ? strtoupper(substr((string) preg_replace('/[^A-Za-z0-9_]+/', '_', $code), 0, 20)) : area_code_from_name($name);
        if (scalar_query('SELECT COUNT(*) FROM areas WHERE code = ?', [$code]) > 0) {
            fail('That area code already exists.', 409, ['code' => $code]);
        }

        $sortOrder = array_key_exists('sort_order', $data)
            ? (int) $data['sort_order']
            : scalar_query('SELECT COALESCE(MAX(sort_order), 0) + 10 FROM areas', []);
        $stmt = db()->prepare(
            'INSERT INTO areas (code, name, table_start, table_end, function_enabled, active, sort_order)
             VALUES (:code, :name, 0, 0, :function_enabled, 1, :sort_order)'
        );
        $stmt->execute([
            'code' => $code,
            'name' => $name,
            'function_enabled' => bool_int($data['function_enabled'] ?? false),
            'sort_order' => $sortOrder,
        ]);
        $areaId = (int) db()->lastInsertId();
        log_activity((int) $manager['id'], 'created', 'area', $areaId);
        respond(['ok' => true, 'id' => $areaId], 201);
    }

    if (($segments[0] ?? '') === 'areas' && isset($segments[1]) && $method === 'PUT') {
        $manager = require_manager();
        $areaId = (int) $segments[1];
        ensure_area_exists($areaId);
        $data = json_body();
        $name = clean_string($data['name'] ?? '');
        if ($name === '') {
            fail('Area name is required.', 422);
        }
        $code = strtoupper(substr((string) preg_replace('/[^A-Za-z0-9_]+/', '_', clean_string($data['code'] ?? '')), 0, 20));
        if ($code === '') {
            fail('Area code is required.', 422);
        }
        if (scalar_query('SELECT COUNT(*) FROM areas WHERE code = ? AND id <> ?', [$code, $areaId]) > 0) {
            fail('That area code already exists.', 409, ['code' => $code]);
        }

        $stmt = db()->prepare(
            'UPDATE areas
             SET code = :code, name = :name, function_enabled = :function_enabled, sort_order = :sort_order
             WHERE id = :id'
        );
        $stmt->execute([
            'code' => $code,
            'name' => $name,
            'function_enabled' => bool_int($data['function_enabled'] ?? false),
            'sort_order' => (int) ($data['sort_order'] ?? 0),
            'id' => $areaId,
        ]);
        log_activity((int) $manager['id'], 'updated', 'area', $areaId);
        respond(['ok' => true]);
    }

    if (($segments[0] ?? '') === 'areas' && isset($segments[1]) && $method === 'DELETE') {
        $manager = require_manager();
        $areaId = (int) $segments[1];
        ensure_area_exists($areaId);
        if (scalar_query('SELECT COUNT(*) FROM venue_tables WHERE area_id = ?', [$areaId]) > 0) {
            fail('Move or delete this area’s tables before removing the area.', 409);
        }

        try {
            db()->prepare('DELETE FROM areas WHERE id = :id')->execute(['id' => $areaId]);
        } catch (PDOException) {
            db()->prepare('UPDATE areas SET active = 0 WHERE id = :id')->execute(['id' => $areaId]);
        }

        log_activity((int) $manager['id'], 'deleted', 'area', $areaId);
        respond(['ok' => true]);
    }

    if ($method === 'GET' && $route === 'ai-logs') {
        require_manager();
        $items = db()->query(
            'SELECT l.*, b.booking_reference, b.booking_date, b.start_time,
                    COALESCE(NULLIF(b.customer_name_snapshot, ""), c.name) AS customer_name,
                    a.name AS suggested_area_name
             FROM ai_assignment_logs l
             JOIN bookings b ON b.id = l.booking_id
             JOIN customers c ON c.id = b.customer_id
             LEFT JOIN areas a ON a.id = l.suggested_area_id
             ORDER BY l.created_at DESC
             LIMIT 100'
        )->fetchAll();
        respond(['items' => $items]);
    }

    if ($method === 'GET' && $route === 'email-logs') {
        require_manager();
        $items = db()->query(
            'SELECT e.*, b.booking_reference
             FROM email_logs e
             LEFT JOIN bookings b ON b.id = e.booking_id
             ORDER BY e.created_at DESC
             LIMIT 100'
        )->fetchAll();
        respond(['items' => $items]);
    }

    if ($method === 'GET' && $route === 'activity-logs') {
        require_manager();
        $items = db()->query(
            'SELECT l.*, u.name AS user_name
             FROM activity_logs l
             LEFT JOIN users u ON u.id = l.user_id
             ORDER BY l.created_at DESC
             LIMIT 100'
        )->fetchAll();
        respond(['items' => $items]);
    }

    if ($method === 'GET' && $route === 'users') {
        require_manager();
        $items = db()->query('SELECT id, name, email, role, status, avatar_url, created_at, updated_at FROM users ORDER BY created_at DESC')->fetchAll();
        respond(['items' => normalize_user_records($items)]);
    }

    if ($method === 'POST' && $route === 'users') {
        $manager = require_manager();
        $data = json_body();
        require_fields($data, ['name', 'email', 'password']);
        validate_email_address(strtolower(clean_string($data['email'])));

        $stmt = db()->prepare(
            'INSERT INTO users (name, email, role, password_hash, status, created_at, updated_at)
             VALUES (:name, :email, "manager", :password_hash, "active", NOW(), NOW())'
        );
        $stmt->execute([
            'name' => clean_string($data['name']),
            'email' => strtolower(clean_string($data['email'])),
            'password_hash' => password_hash((string) $data['password'], PASSWORD_DEFAULT),
        ]);
        log_activity((int) $manager['id'], 'created', 'user', (int) db()->lastInsertId());
        respond(['ok' => true], 201);
    }

    if (($segments[0] ?? '') === 'users' && isset($segments[1]) && $method === 'PUT') {
        $manager = require_manager();
        $data = json_body();
        $targetUserId = (int) $segments[1];
        $existingStmt = db()->prepare('SELECT id, role, status FROM users WHERE id = :id LIMIT 1');
        $existingStmt->execute(['id' => $targetUserId]);
        $existingUser = $existingStmt->fetch();
        if (!$existingUser) {
            fail('User not found.', 404);
        }

        $updates = ['updated_at = NOW()'];
        $params = ['id' => $targetUserId];

        if (isset($data['name'])) {
            $updates[] = 'name = :name';
            $params['name'] = clean_string($data['name']);
        }
        if (isset($data['status'])) {
            $nextStatus = clean_string($data['status']);
            if (!in_array($nextStatus, ['active', 'inactive'], true)) {
                fail('Please choose a valid user status.', 422, ['status' => $nextStatus]);
            }

            if ((string) $existingUser['role'] === 'manager' && $nextStatus === 'inactive') {
                if ($targetUserId === (int) $manager['id']) {
                    fail('You cannot deactivate your own manager account.', 422);
                }

                $activeManagers = scalar_query(
                    'SELECT COUNT(*) FROM users WHERE role = "manager" AND status = "active" AND id <> ?',
                    [$targetUserId]
                );
                if ($activeManagers < 1) {
                    fail('At least one active manager is required.', 422);
                }
            }

            $updates[] = 'status = :status';
            $params['status'] = $nextStatus;
        }
        if (!empty($data['password'])) {
            $updates[] = 'password_hash = :password_hash';
            $params['password_hash'] = password_hash((string) $data['password'], PASSWORD_DEFAULT);
        }

        $stmt = db()->prepare('UPDATE users SET ' . implode(', ', $updates) . ' WHERE id = :id');
        $stmt->execute($params);
        log_activity((int) $manager['id'], 'updated', 'user', $targetUserId);
        respond(['ok' => true]);
    }

    if ($method === 'POST' && $route === 'settings/venue-image') {
        $manager = require_manager();
        respond(upload_venue_image($manager), 201);
    }

    if ($method === 'DELETE' && $route === 'settings/venue-image') {
        $manager = require_manager();
        save_setting_value('venue_image_url', '');
        log_activity((int) $manager['id'], 'updated', 'settings', null, ['venue_image_url' => '']);
        respond(['ok' => true]);
    }

    if ($method === 'GET' && $route === 'settings') {
        require_manager();
        respond(meta_payload());
    }

    if ($method === 'PUT' && $route === 'settings') {
        $manager = require_manager();
        $data = json_body();

        if (!empty($data['settings']) && is_array($data['settings'])) {
            foreach ($data['settings'] as $key => $value) {
                save_setting_value(clean_string($key), clean_string($value));
            }
        }

        if (!empty($data['opening_hours']) && is_array($data['opening_hours'])) {
            $stmt = db()->prepare(
                'UPDATE opening_hours
                 SET opens_at = :opens_at, closes_at = :closes_at, is_closed = :is_closed, updated_at = NOW()
                 WHERE day_of_week = :day_of_week'
            );

            foreach ($data['opening_hours'] as $hours) {
                $stmt->execute([
                    'opens_at' => clean_string($hours['opens_at'] ?? '12:00'),
                    'closes_at' => clean_string($hours['closes_at'] ?? '21:00'),
                    'is_closed' => bool_int($hours['is_closed'] ?? false),
                    'day_of_week' => (int) $hours['day_of_week'],
                ]);
            }
        }

        log_activity((int) $manager['id'], 'updated', 'settings', null);
        respond(['ok' => true]);
    }

    fail('API route not found.', 404, ['route' => $route, 'method' => $method]);
} catch (Throwable $error) {
    try {
        $pdo = db();
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
    } catch (Throwable) {
        /*
         * If the database connection itself failed, there is no open transaction
         * to roll back. The original error is still returned below.
         */
    }

    error_log($error->getMessage());
    fail('Server error: ' . $error->getMessage(), 500);
}
