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

    $stmt = db()->prepare('SELECT id, name, email, role, status, avatar_url, is_platform_admin, created_at, updated_at FROM users WHERE id = :id AND status = "active"');
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
    if (array_key_exists('is_platform_admin', $user)) {
        $user['is_platform_admin'] = (int) $user['is_platform_admin'];
    }

    return $user;
}

function normalize_user_records(array $users): array
{
    return array_map(static fn (array $user) => normalize_user_record($user), $users);
}

function auth_payload(?array $user): array
{
    if (!$user) {
        return ['user' => null, 'venues' => [], 'current_venue' => null, 'support_mode' => false];
    }

    $isPlatformAdmin = is_platform_admin_user($user);
    $supportVenue = $isPlatformAdmin ? platform_support_venue($user) : null;
    $venues = $isPlatformAdmin
        ? ($supportVenue ? [$supportVenue] : [])
        : accessible_venues_for_user((int) $user['id']);

    return [
        'user' => normalize_user_record($user),
        'venues' => $venues,
        'current_venue' => table_exists('venues') ? ($supportVenue ?: ($isPlatformAdmin ? null : current_venue($user))) : null,
        'support_mode' => $supportVenue !== null,
    ];
}

function require_manager(): array
{
    $user = current_user();
    if (!$user || $user['role'] !== 'manager') {
        fail('Manager sign in required.', 401);
    }

    return $user;
}

function require_platform_admin(): array
{
    $user = require_manager();
    if ((int) ($user['is_platform_admin'] ?? 0) !== 1) {
        fail('Resrva owner access required.', 403);
    }

    return $user;
}

function is_platform_admin_user(?array $user): bool
{
    return (int) ($user['is_platform_admin'] ?? 0) === 1;
}

function table_exists(string $table): bool
{
    $stmt = db()->prepare(
        'SELECT COUNT(*)
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table_name'
    );
    $stmt->execute(['table_name' => $table]);

    return (int) $stmt->fetchColumn() > 0;
}

function default_account_id(): int
{
    $accountId = db()->query('SELECT id FROM accounts ORDER BY id LIMIT 1')->fetchColumn();
    if ($accountId !== false) {
        return (int) $accountId;
    }

    db()->prepare(
        'INSERT INTO accounts (business_name, plan, billing_status, created_at, updated_at)
         VALUES (:business_name, "standard", "active", NOW(), NOW())'
    )->execute(['business_name' => raw_setting('venue_name', 'Old Canberra Inn') ?: 'Old Canberra Inn']);

    return (int) db()->lastInsertId();
}

function default_venue_id(): int
{
    $venueId = db()->query('SELECT id FROM venues ORDER BY id LIMIT 1')->fetchColumn();
    if ($venueId !== false) {
        return (int) $venueId;
    }

    $accountId = default_account_id();
    db()->prepare(
        'INSERT INTO venues
            (account_id, name, slug, timezone, address, phone, email, active, created_at, updated_at)
         VALUES
            (:account_id, :name, "old-canberra-inn", "Australia/Sydney", "", :phone, :email, 1, NOW(), NOW())'
    )->execute([
        'account_id' => $accountId,
        'name' => raw_setting('venue_name', 'Old Canberra Inn') ?: 'Old Canberra Inn',
        'phone' => raw_setting('venue_phone', '(02) 6134 6000'),
        'email' => raw_setting('venue_email', 'admin@resrva.test'),
    ]);

    return (int) db()->lastInsertId();
}

function accessible_venues_for_user(int $userId, bool $activeOnly = true): array
{
    if (!table_exists('user_venues')) {
        return [];
    }

    $activeClause = $activeOnly ? 'AND v.active = 1' : '';
    if (scalar_query('SELECT COUNT(*) FROM users WHERE id = ? AND is_platform_admin = 1', [$userId]) > 0) {
        $supportVenue = platform_support_venue(['id' => $userId, 'is_platform_admin' => 1]);

        return $supportVenue ? [$supportVenue] : [];
    }

    $stmt = db()->prepare(
        'SELECT v.id, v.account_id, v.name, v.slug, v.timezone, v.address, v.phone, v.email,
                v.active, a.business_name AS account_name, uv.role AS access_role
         FROM user_venues uv
         JOIN venues v ON v.id = uv.venue_id
         JOIN accounts a ON a.id = v.account_id
         WHERE uv.user_id = :user_id
           ' . $activeClause . '
         ORDER BY a.business_name, v.name, v.id'
    );
    $stmt->execute(['user_id' => $userId]);

    return $stmt->fetchAll();
}

function accessible_accounts_for_user(int $userId): array
{
    if (scalar_query('SELECT COUNT(*) FROM users WHERE id = ? AND is_platform_admin = 1', [$userId]) > 0) {
        $stmt = db()->query(
            'SELECT a.id, a.business_name, a.plan, a.billing_status, a.created_at, a.updated_at,
                    COUNT(DISTINCT v.id) AS venue_count,
                    SUM(CASE WHEN v.active = 1 THEN 1 ELSE 0 END) AS active_venue_count
             FROM accounts a
             LEFT JOIN venues v ON v.account_id = a.id
             GROUP BY a.id, a.business_name, a.plan, a.billing_status, a.created_at, a.updated_at
             ORDER BY a.business_name, a.id'
        );

        return $stmt->fetchAll();
    }

    $stmt = db()->prepare(
        'SELECT a.id, a.business_name, a.plan, a.billing_status, a.created_at, a.updated_at,
                COUNT(DISTINCT v.id) AS venue_count,
                SUM(CASE WHEN v.active = 1 THEN 1 ELSE 0 END) AS active_venue_count
         FROM accounts a
         JOIN venues v ON v.account_id = a.id
         JOIN user_venues uv ON uv.venue_id = v.id
         WHERE uv.user_id = :user_id
         GROUP BY a.id, a.business_name, a.plan, a.billing_status, a.created_at, a.updated_at
         ORDER BY a.business_name, a.id'
    );
    $stmt->execute(['user_id' => $userId]);

    return $stmt->fetchAll();
}

function require_account_access(array $user, int $accountId): array
{
    if ((int) ($user['is_platform_admin'] ?? 0) === 1) {
        $stmt = db()->prepare(
            'SELECT a.id, a.business_name, a.plan, a.billing_status, a.created_at, a.updated_at,
                    COUNT(DISTINCT v.id) AS venue_count,
                    SUM(CASE WHEN v.active = 1 THEN 1 ELSE 0 END) AS active_venue_count
             FROM accounts a
             LEFT JOIN venues v ON v.account_id = a.id
             WHERE a.id = :account_id
             GROUP BY a.id, a.business_name, a.plan, a.billing_status, a.created_at, a.updated_at
             LIMIT 1'
        );
        $stmt->execute(['account_id' => $accountId]);
        $account = $stmt->fetch();
        if (!$account) {
            fail('Client not found.', 404);
        }

        return $account;
    }

    $stmt = db()->prepare(
        'SELECT a.id, a.business_name, a.plan, a.billing_status, a.created_at, a.updated_at,
                COUNT(DISTINCT v.id) AS venue_count,
                SUM(CASE WHEN v.active = 1 THEN 1 ELSE 0 END) AS active_venue_count
         FROM accounts a
         JOIN venues v ON v.account_id = a.id
         JOIN user_venues uv ON uv.venue_id = v.id
         WHERE uv.user_id = :user_id
           AND a.id = :account_id
         GROUP BY a.id, a.business_name, a.plan, a.billing_status, a.created_at, a.updated_at
         LIMIT 1'
    );
    $stmt->execute([
        'user_id' => (int) $user['id'],
        'account_id' => $accountId,
    ]);
    $account = $stmt->fetch();

    if (!$account) {
        fail('You do not have access to that client.', 403);
    }

    return $account;
}

function require_venue_access(array $user, int $venueId): array
{
    if ((int) ($user['is_platform_admin'] ?? 0) === 1) {
        $stmt = db()->prepare(
            'SELECT v.id, v.account_id, v.name, v.slug, v.timezone, v.address, v.phone, v.email, v.active,
                    a.business_name AS account_name, "platform_admin" AS access_role
             FROM venues v
             JOIN accounts a ON a.id = v.account_id
             WHERE v.id = :venue_id
             LIMIT 1'
        );
        $stmt->execute(['venue_id' => $venueId]);
        $venue = $stmt->fetch();
        if (!$venue) {
            fail('Venue not found.', 404);
        }

        return $venue;
    }

    $stmt = db()->prepare(
        'SELECT v.id, v.account_id, v.name, v.slug, v.timezone, v.address, v.phone, v.email, v.active,
                a.business_name AS account_name, uv.role AS access_role
         FROM venues v
         JOIN user_venues uv ON uv.venue_id = v.id
         JOIN accounts a ON a.id = v.account_id
         WHERE uv.user_id = :user_id
           AND v.id = :venue_id
         LIMIT 1'
    );
    $stmt->execute([
        'user_id' => (int) $user['id'],
        'venue_id' => $venueId,
    ]);
    $venue = $stmt->fetch();

    if (!$venue) {
        fail('You do not have access to that venue.', 403);
    }

    return $venue;
}

function venue_by_slug(?string $slug): ?array
{
    $slug = clean_string($slug ?? '');
    if ($slug === '' || !table_exists('venues')) {
        return null;
    }

    $stmt = db()->prepare('SELECT * FROM venues WHERE slug = :slug AND active = 1 LIMIT 1');
    $stmt->execute(['slug' => $slug]);
    $venue = $stmt->fetch();

    return $venue ?: null;
}

function platform_support_venue(?array $user = null): ?array
{
    $user = $user ?: current_user();
    if (!is_platform_admin_user($user)) {
        return null;
    }

    $venueId = (int) ($_SESSION['support_venue_id'] ?? 0);
    if ($venueId <= 0) {
        return null;
    }

    $stmt = db()->prepare(
        'SELECT v.id, v.account_id, v.name, v.slug, v.timezone, v.address, v.phone, v.email, v.active,
                a.business_name AS account_name, "support" AS access_role
         FROM venues v
         JOIN accounts a ON a.id = v.account_id
         WHERE v.id = :venue_id
           AND v.active = 1
         LIMIT 1'
    );
    $stmt->execute(['venue_id' => $venueId]);
    $venue = $stmt->fetch();

    if (!$venue) {
        unset($_SESSION['support_venue_id']);
        return null;
    }

    return $venue;
}

function current_venue_id(?array $user = null): int
{
    if (!table_exists('venues')) {
        return 1;
    }

    $publicVenue = venue_by_slug($_GET['venue'] ?? $_GET['venue_slug'] ?? null);
    $user = $user ?: current_user();
    if ($user) {
        if (is_platform_admin_user($user)) {
            $supportVenue = platform_support_venue($user);
            if ($supportVenue) {
                return (int) $supportVenue['id'];
            }

            if ($publicVenue) {
                return (int) $publicVenue['id'];
            }

            return default_venue_id();
        }

        $venues = accessible_venues_for_user((int) $user['id']);
        if ($venues !== []) {
            $venueIds = array_map(static fn (array $venue): int => (int) $venue['id'], $venues);
            if ($publicVenue && in_array((int) $publicVenue['id'], $venueIds, true)) {
                $_SESSION['venue_id'] = (int) $publicVenue['id'];
                return (int) $publicVenue['id'];
            }

            $sessionVenueId = (int) ($_SESSION['venue_id'] ?? 0);
            if ($sessionVenueId > 0 && in_array($sessionVenueId, $venueIds, true)) {
                return $sessionVenueId;
            }

            $_SESSION['venue_id'] = (int) $venues[0]['id'];
            return (int) $venues[0]['id'];
        }
    }

    if ($publicVenue) {
        return (int) $publicVenue['id'];
    }

    return default_venue_id();
}

function current_venue(?array $user = null): array
{
    $venueId = current_venue_id($user);
    $stmt = db()->prepare('SELECT * FROM venues WHERE id = :id LIMIT 1');
    $stmt->execute(['id' => $venueId]);
    $venue = $stmt->fetch();

    if (!$venue) {
        fail('Venue not found.', 404);
    }

    return $venue;
}

function platform_admin_route_allowed_without_support(string $route): bool
{
    if ($route === 'meta' || $route === 'accounts' || $route === 'profile') {
        return true;
    }

    foreach (['auth/', 'accounts/', 'platform/', 'support/', 'profile/', 'public/'] as $prefix) {
        if (str_starts_with($route, $prefix)) {
            return true;
        }
    }

    return false;
}

function ensure_platform_support_context_for_route(?array $user, string $route): void
{
    if (!is_platform_admin_user($user)) {
        return;
    }

    if (platform_support_venue($user) || platform_admin_route_allowed_without_support($route)) {
        return;
    }

    fail('Start support mode before opening a client venue workspace.', 409);
}

function setting(string $key, string $fallback = ''): string
{
    if (table_column_exists('settings', 'venue_id')) {
        $stmt = db()->prepare('SELECT setting_value FROM settings WHERE venue_id = :venue_id AND setting_key = :key');
        $stmt->execute(['venue_id' => current_venue_id(), 'key' => $key]);
    } else {
        $stmt = db()->prepare('SELECT setting_value FROM settings WHERE setting_key = :key');
        $stmt->execute(['key' => $key]);
    }
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
        'booking_terms_and_conditions' => "Bookings are subject to venue availability and confirmation.\n\nPlease arrive on time for your booking. Tables may be released if guests arrive late without contacting the venue.\n\nGuest numbers should be accurate at the time of booking. If your party size changes, please contact the venue before your visit.\n\nSpecial requests are noted but cannot be guaranteed. The venue will do its best to accommodate seating preferences, accessibility needs, allergies, and dietary requirements when notified in advance.\n\nThe venue may contact you using the details provided to confirm, update, or manage your booking.\n\nThe venue may cancel or amend bookings where required due to operational needs, private events, safety requirements, or incorrect booking information.\n\nBy submitting a booking, you agree to these terms and confirm that the details provided are accurate.",
        'online_table_bookings_enabled' => '1',
        'online_function_requests_enabled' => '1',
        'auto_assignment_enabled' => '1',
    ];
}

function setting_enabled(string $key, bool $fallback = true): bool
{
    return setting($key, $fallback ? '1' : '0') !== '0';
}

function venue_display_name(): string
{
    $venue = current_venue();
    $name = setting('venue_name', (string) ($venue['name'] ?? ''));

    return $name !== '' ? $name : 'the venue';
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
    $stmt = db()->prepare('SELECT opens_at, closes_at, is_closed FROM opening_hours WHERE venue_id = :venue_id AND day_of_week = :day');
    $stmt->execute(['venue_id' => current_venue_id(), 'day' => $dayOfWeek]);
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
        fail('Booking time must fit within venue opening hours.', 422, [
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

    if (!table_column_exists('users', 'is_platform_admin')) {
        db()->exec('ALTER TABLE users ADD COLUMN is_platform_admin TINYINT(1) NOT NULL DEFAULT 0 AFTER avatar_url');
    }

    $adminEmail = 'admin@resrva.test';
    $legacyEmail = 'manager@resrva.test';
    $defaultPasswordHash = '$2y$10$TFmxQt22rkg/nkg6ybGpeeCnbhpNSjIWwOVYeBdA7J77uhXEBwQMS';

    $findUser = db()->prepare('SELECT id FROM users WHERE email = :email LIMIT 1');
    $findUser->execute(['email' => $adminEmail]);
    $adminId = (int) ($findUser->fetchColumn() ?: 0);

    if ($adminId > 0) {
        db()->prepare('UPDATE users SET name = :name, role = "manager", status = "active", is_platform_admin = 1, updated_at = NOW() WHERE id = :id')
            ->execute(['name' => 'Resrva Admin', 'id' => $adminId]);
        db()->prepare('UPDATE users SET is_platform_admin = 0, updated_at = NOW() WHERE email = :email AND id <> :admin_id')
            ->execute(['email' => $legacyEmail, 'admin_id' => $adminId]);
    } else {
        $findUser->execute(['email' => $legacyEmail]);
        $legacyId = (int) ($findUser->fetchColumn() ?: 0);

        if ($legacyId > 0) {
            db()->prepare(
                'UPDATE users
                 SET name = :name, email = :email, role = "manager", status = "active", is_platform_admin = 1, updated_at = NOW()
                 WHERE id = :id'
            )->execute([
                'name' => 'Resrva Admin',
                'email' => $adminEmail,
                'id' => $legacyId,
            ]);
        } else {
            db()->prepare(
                'INSERT INTO users (name, email, role, password_hash, status, avatar_url, is_platform_admin, created_at, updated_at)
                 VALUES (:name, :email, "manager", :password_hash, "active", NULL, 1, NOW(), NOW())'
            )->execute([
                'name' => 'Resrva Admin',
                'email' => $adminEmail,
                'password_hash' => $defaultPasswordHash,
            ]);
        }
    }

    $checked = true;
}

function table_column_exists(string $table, string $column): bool
{
    $stmt = db()->prepare(
        'SELECT COUNT(*)
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table_name
           AND COLUMN_NAME = :column_name'
    );
    $stmt->execute(['table_name' => $table, 'column_name' => $column]);

    return (int) $stmt->fetchColumn() > 0;
}

function raw_setting(string $key, string $fallback = ''): string
{
    if (!table_exists('settings')) {
        return $fallback;
    }

    $stmt = db()->prepare('SELECT setting_value FROM settings WHERE setting_key = :key LIMIT 1');
    $stmt->execute(['key' => $key]);
    $value = $stmt->fetchColumn();

    return $value === false ? $fallback : (string) $value;
}

function safe_schema_exec(string $sql): void
{
    try {
        db()->exec($sql);
    } catch (PDOException) {
    }
}

function add_column_if_missing(string $table, string $column, string $definition): void
{
    if (table_exists($table) && !table_column_exists($table, $column)) {
        db()->exec("ALTER TABLE {$table} ADD COLUMN {$column} {$definition}");
    }
}

function ensure_multi_venue_schema(): void
{
    static $checked = false;
    if ($checked) {
        return;
    }

    db()->exec(
        'CREATE TABLE IF NOT EXISTS accounts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            business_name VARCHAR(160) NOT NULL,
            plan VARCHAR(40) NOT NULL DEFAULT "standard",
            billing_status VARCHAR(40) NOT NULL DEFAULT "active",
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        ) ENGINE=InnoDB'
    );
    db()->exec(
        'CREATE TABLE IF NOT EXISTS venues (
            id INT AUTO_INCREMENT PRIMARY KEY,
            account_id INT NOT NULL,
            name VARCHAR(160) NOT NULL,
            slug VARCHAR(120) NOT NULL UNIQUE,
            timezone VARCHAR(80) NOT NULL DEFAULT "Australia/Sydney",
            address VARCHAR(255) NULL,
            phone VARCHAR(40) NULL,
            email VARCHAR(160) NULL,
            active TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            INDEX idx_venues_account (account_id)
        ) ENGINE=InnoDB'
    );
    db()->exec(
        'CREATE TABLE IF NOT EXISTS user_venues (
            user_id INT NOT NULL,
            venue_id INT NOT NULL,
            role ENUM("owner", "manager", "staff") NOT NULL DEFAULT "manager",
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY (user_id, venue_id),
            INDEX idx_user_venues_venue (venue_id)
        ) ENGINE=InnoDB'
    );

    $venueId = default_venue_id();

    add_column_if_missing('customers', 'venue_id', 'INT NULL AFTER id');
    add_column_if_missing('areas', 'venue_id', 'INT NULL AFTER id');
    add_column_if_missing('venue_tables', 'venue_id', 'INT NULL AFTER id');
    add_column_if_missing('booking_types', 'venue_id', 'INT NULL AFTER id');
    add_column_if_missing('booking_sessions', 'venue_id', 'INT NULL AFTER booking_type_id');
    add_column_if_missing('bookings', 'venue_id', 'INT NULL AFTER id');
    add_column_if_missing('settings', 'venue_id', 'INT NULL FIRST');
    add_column_if_missing('opening_hours', 'venue_id', 'INT NULL FIRST');
    add_column_if_missing('online_booking_blocks', 'venue_id', 'INT NULL FIRST');
    add_column_if_missing('table_join_groups', 'venue_id', 'INT NULL AFTER id');
    add_column_if_missing('ai_assignment_logs', 'venue_id', 'INT NULL AFTER id');
    add_column_if_missing('ai_assignment_candidates', 'venue_id', 'INT NULL AFTER id');
    add_column_if_missing('email_logs', 'venue_id', 'INT NULL AFTER id');
    add_column_if_missing('activity_logs', 'venue_id', 'INT NULL AFTER id');

    foreach (['customers', 'areas', 'booking_types', 'bookings', 'settings', 'opening_hours', 'online_booking_blocks', 'table_join_groups', 'ai_assignment_logs', 'ai_assignment_candidates', 'email_logs', 'activity_logs'] as $table) {
        if (table_exists($table) && table_column_exists($table, 'venue_id')) {
            $stmt = db()->prepare("UPDATE {$table} SET venue_id = :venue_id WHERE venue_id IS NULL");
            $stmt->execute(['venue_id' => $venueId]);
        }
    }

    if (table_exists('venue_tables') && table_column_exists('venue_tables', 'venue_id')) {
        $stmt = db()->prepare(
            'UPDATE venue_tables vt
             LEFT JOIN areas a ON a.id = vt.area_id
             SET vt.venue_id = COALESCE(a.venue_id, :venue_id)
             WHERE vt.venue_id IS NULL'
        );
        $stmt->execute(['venue_id' => $venueId]);
    }

    if (table_exists('booking_sessions') && table_column_exists('booking_sessions', 'venue_id')) {
        $stmt = db()->prepare(
            'UPDATE booking_sessions bs
             LEFT JOIN booking_types bt ON bt.id = bs.booking_type_id
             SET bs.venue_id = COALESCE(bt.venue_id, :venue_id)
             WHERE bs.venue_id IS NULL'
        );
        $stmt->execute(['venue_id' => $venueId]);
    }

    foreach (['customers', 'areas', 'venue_tables', 'booking_types', 'booking_sessions', 'bookings', 'settings', 'opening_hours', 'online_booking_blocks', 'table_join_groups', 'ai_assignment_logs', 'ai_assignment_candidates', 'email_logs', 'activity_logs'] as $table) {
        if (table_exists($table) && table_column_exists($table, 'venue_id')) {
            safe_schema_exec("ALTER TABLE {$table} MODIFY venue_id INT NOT NULL");
        }
    }

    db()->prepare(
        'INSERT IGNORE INTO user_venues (user_id, venue_id, role, created_at, updated_at)
         SELECT u.id, :venue_id, "owner", NOW(), NOW()
         FROM users u
         WHERE u.role = "manager"
           AND (
                u.is_platform_admin = 1
                OR NOT EXISTS (
                    SELECT 1 FROM user_venues existing_access WHERE existing_access.user_id = u.id
                )
           )'
    )->execute(['venue_id' => $venueId]);

    db()->prepare(
        'DELETE uv
         FROM user_venues uv
         JOIN users u ON u.id = uv.user_id
         JOIN venues default_venue ON default_venue.id = uv.venue_id
         JOIN user_venues other_access
            ON other_access.user_id = uv.user_id
           AND other_access.venue_id <> uv.venue_id
         JOIN venues other_venue ON other_venue.id = other_access.venue_id
         WHERE uv.venue_id = :venue_id
           AND u.role = "manager"
           AND u.is_platform_admin = 0
           AND other_venue.account_id <> default_venue.account_id'
    )->execute(['venue_id' => $venueId]);

    safe_schema_exec('ALTER TABLE settings DROP PRIMARY KEY, ADD PRIMARY KEY (venue_id, setting_key)');
    safe_schema_exec('ALTER TABLE opening_hours DROP PRIMARY KEY, ADD PRIMARY KEY (venue_id, day_of_week)');
    safe_schema_exec('ALTER TABLE online_booking_blocks DROP PRIMARY KEY, ADD PRIMARY KEY (venue_id, block_date)');

    safe_schema_exec('ALTER TABLE customers DROP INDEX email');
    safe_schema_exec('CREATE UNIQUE INDEX uniq_customers_venue_email ON customers (venue_id, email)');
    safe_schema_exec('ALTER TABLE areas DROP INDEX code');
    safe_schema_exec('CREATE UNIQUE INDEX uniq_areas_venue_code ON areas (venue_id, code)');
    safe_schema_exec('ALTER TABLE venue_tables DROP INDEX table_number');
    safe_schema_exec('CREATE UNIQUE INDEX uniq_tables_venue_number ON venue_tables (venue_id, table_number)');
    safe_schema_exec('ALTER TABLE booking_types DROP INDEX slug');
    safe_schema_exec('CREATE UNIQUE INDEX uniq_booking_types_venue_slug ON booking_types (venue_id, slug)');

    foreach ([
        'idx_bookings_venue_date' => 'CREATE INDEX idx_bookings_venue_date ON bookings (venue_id, booking_date, status)',
        'idx_areas_venue' => 'CREATE INDEX idx_areas_venue ON areas (venue_id, active, sort_order)',
        'idx_tables_venue_area' => 'CREATE INDEX idx_tables_venue_area ON venue_tables (venue_id, area_id, active)',
        'idx_sessions_venue_date' => 'CREATE INDEX idx_sessions_venue_date ON booking_sessions (venue_id, date, status)',
        'idx_booking_types_venue' => 'CREATE INDEX idx_booking_types_venue ON booking_types (venue_id, is_active, display_to_customers)',
    ] as $sql) {
        safe_schema_exec($sql);
    }

    $checked = true;
}

function slug_from_name(string $name): string
{
    $slug = strtolower((string) preg_replace('/[^a-zA-Z0-9]+/', '-', $name));
    $slug = trim($slug, '-');

    return $slug !== '' ? substr($slug, 0, 80) : 'booking-type';
}

function unique_venue_slug(string $name, ?int $excludeId = null): string
{
    $base = slug_from_name($name);
    if ($base === 'booking-type') {
        $base = 'venue';
    }

    $slug = substr($base, 0, 120);
    $counter = 2;

    while (true) {
        $sql = 'SELECT COUNT(*) FROM venues WHERE slug = ?';
        $params = [$slug];
        if ($excludeId !== null) {
            $sql .= ' AND id <> ?';
            $params[] = $excludeId;
        }

        if (scalar_query($sql, $params) === 0) {
            return $slug;
        }

        $suffix = '-' . $counter;
        $slug = substr($base, 0, 120 - strlen($suffix)) . $suffix;
        $counter++;
    }
}

function unique_booking_type_slug_for_venue(int $venueId, string $name, ?int $excludeId = null): string
{
    $base = slug_from_name($name);
    $slug = $base;
    $counter = 2;

    while (true) {
        $sql = 'SELECT COUNT(*) FROM booking_types WHERE slug = ? AND venue_id = ?';
        $params = [$slug, $venueId];
        if ($excludeId !== null) {
            $sql .= ' AND id <> ?';
            $params[] = $excludeId;
        }

        if (scalar_query($sql, $params) === 0) {
            return $slug;
        }

        $suffix = '-' . $counter;
        $slug = substr($base, 0, 80 - strlen($suffix)) . $suffix;
        $counter++;
    }
}

function unique_booking_type_slug(string $name, ?int $excludeId = null): string
{
    return unique_booking_type_slug_for_venue(current_venue_id(), $name, $excludeId);
}

function ensure_booking_type_schema(): void
{
    static $checked = false;
    if ($checked) {
        return;
    }

    db()->exec(
        "CREATE TABLE IF NOT EXISTS booking_types (
            id INT AUTO_INCREMENT PRIMARY KEY,
            venue_id INT NOT NULL,
            name VARCHAR(120) NOT NULL,
            slug VARCHAR(90) NOT NULL,
            category ENUM('dining', 'event', 'function', 'custom') NOT NULL DEFAULT 'event',
            description TEXT NULL,
            customer_button_label VARCHAR(80) NULL,
            internal_label VARCHAR(80) NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            display_to_customers TINYINT(1) NOT NULL DEFAULT 1,
            colour VARCHAR(20) NOT NULL DEFAULT '#276749',
            icon VARCHAR(40) NOT NULL DEFAULT 'calendar',
            capacity_mode ENUM('guests', 'bookings', 'tables', 'area') NOT NULL DEFAULT 'guests',
            min_guests INT NOT NULL DEFAULT 1,
            max_guests INT NULL,
            max_capacity INT NULL,
            max_bookings INT NULL,
            requires_approval TINYINT(1) NOT NULL DEFAULT 0,
            auto_confirm TINYINT(1) NOT NULL DEFAULT 1,
            allow_waitlist TINYINT(1) NOT NULL DEFAULT 0,
            booking_cutoff_minutes INT NOT NULL DEFAULT 0,
            booking_window_days INT NOT NULL DEFAULT 90,
            cancellation_cutoff_minutes INT NOT NULL DEFAULT 0,
            sort_order INT NOT NULL DEFAULT 0,
            deleted_at DATETIME NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            UNIQUE KEY uniq_booking_types_venue_slug (venue_id, slug),
            INDEX idx_booking_types_venue (venue_id, is_active, display_to_customers)
        ) ENGINE=InnoDB"
    );

    if (!table_column_exists('booking_types', 'venue_id')) {
        db()->exec('ALTER TABLE booking_types ADD COLUMN venue_id INT NULL AFTER id');
        db()->prepare('UPDATE booking_types SET venue_id = :venue_id WHERE venue_id IS NULL')
            ->execute(['venue_id' => default_venue_id()]);
    }
    db()->exec('ALTER TABLE booking_types MODIFY max_guests INT NULL');
    if (!table_column_exists('booking_types', 'booking_window_days')) {
        db()->exec('ALTER TABLE booking_types ADD COLUMN booking_window_days INT NOT NULL DEFAULT 90 AFTER booking_cutoff_minutes');
    }
    if (!table_column_exists('booking_types', 'deleted_at')) {
        db()->exec('ALTER TABLE booking_types ADD COLUMN deleted_at DATETIME NULL AFTER sort_order');
    }

    db()->exec(
        "CREATE TABLE IF NOT EXISTS booking_type_schedules (
            id INT AUTO_INCREMENT PRIMARY KEY,
            booking_type_id INT NOT NULL,
            recurrence_type ENUM('none', 'daily', 'weekly', 'fortnightly', 'monthly', 'custom') NOT NULL DEFAULT 'weekly',
            day_of_week TINYINT NULL,
            day_of_month TINYINT NULL,
            start_time TIME NULL,
            end_time TIME NULL,
            arrival_time TIME NULL,
            duration_minutes INT NOT NULL DEFAULT 120,
            start_date DATE NULL,
            end_date DATE NULL,
            custom_dates_json JSON NULL,
            reserved_area_ids_json JSON NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            INDEX idx_booking_type_schedules_type (booking_type_id)
        ) ENGINE=InnoDB"
    );

    db()->exec("ALTER TABLE booking_type_schedules MODIFY recurrence_type ENUM('none', 'daily', 'weekly', 'fortnightly', 'monthly', 'custom') NOT NULL DEFAULT 'weekly'");
    if (!table_column_exists('booking_type_schedules', 'day_of_month')) {
        db()->exec('ALTER TABLE booking_type_schedules ADD COLUMN day_of_month TINYINT NULL AFTER day_of_week');
    }
    if (!table_column_exists('booking_type_schedules', 'custom_dates_json')) {
        db()->exec('ALTER TABLE booking_type_schedules ADD COLUMN custom_dates_json JSON NULL AFTER end_date');
    }
    if (!table_column_exists('booking_type_schedules', 'reserved_area_ids_json')) {
        db()->exec('ALTER TABLE booking_type_schedules ADD COLUMN reserved_area_ids_json JSON NULL AFTER custom_dates_json');
    }

    db()->exec(
        "CREATE TABLE IF NOT EXISTS booking_sessions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            booking_type_id INT NOT NULL,
            venue_id INT NOT NULL,
            date DATE NOT NULL,
            start_time TIME NOT NULL,
            end_time TIME NOT NULL,
            arrival_time TIME NULL,
            capacity INT NULL,
            booking_limit INT NULL,
            reserved_area_ids_json JSON NULL,
            status ENUM('active', 'cancelled') NOT NULL DEFAULT 'active',
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            UNIQUE KEY uniq_booking_session (booking_type_id, date, start_time),
            INDEX idx_sessions_venue_date (venue_id, date, status),
            INDEX idx_booking_sessions_lookup (booking_type_id, date, status)
        ) ENGINE=InnoDB"
    );
    if (!table_column_exists('booking_sessions', 'venue_id')) {
        db()->exec('ALTER TABLE booking_sessions ADD COLUMN venue_id INT NULL AFTER booking_type_id');
        db()->prepare(
            'UPDATE booking_sessions bs
             LEFT JOIN booking_types bt ON bt.id = bs.booking_type_id
             SET bs.venue_id = COALESCE(bt.venue_id, :venue_id)
             WHERE bs.venue_id IS NULL'
        )->execute(['venue_id' => default_venue_id()]);
    }
    if (!table_column_exists('booking_sessions', 'reserved_area_ids_json')) {
        db()->exec('ALTER TABLE booking_sessions ADD COLUMN reserved_area_ids_json JSON NULL AFTER booking_limit');
    }

    db()->exec(
        "CREATE TABLE IF NOT EXISTS booking_custom_fields (
            id INT AUTO_INCREMENT PRIMARY KEY,
            booking_type_id INT NOT NULL,
            label VARCHAR(120) NOT NULL,
            field_type ENUM('text', 'dropdown', 'checkbox', 'number') NOT NULL DEFAULT 'text',
            is_required TINYINT(1) NOT NULL DEFAULT 0,
            options_json JSON NULL,
            display_order INT NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            INDEX idx_booking_custom_fields_type (booking_type_id)
        ) ENGINE=InnoDB"
    );

    db()->exec(
        "CREATE TABLE IF NOT EXISTS booking_custom_answers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            booking_id INT NOT NULL,
            field_id INT NULL,
            field_label_snapshot VARCHAR(120) NOT NULL,
            answer TEXT NOT NULL,
            created_at DATETIME NOT NULL,
            INDEX idx_booking_custom_answers_booking (booking_id)
        ) ENGINE=InnoDB"
    );

    if (!table_column_exists('bookings', 'booking_type_id')) {
        db()->exec('ALTER TABLE bookings ADD COLUMN booking_type_id INT NULL AFTER booking_type');
    }
    if (!table_column_exists('bookings', 'booking_session_id')) {
        db()->exec('ALTER TABLE bookings ADD COLUMN booking_session_id INT NULL AFTER booking_type_id');
    }

    db()->exec("ALTER TABLE bookings MODIFY booking_type ENUM('table', 'function', 'event') NOT NULL");
    db()->exec("ALTER TABLE bookings MODIFY status ENUM('pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show', 'approved', 'declined', 'waitlist') NOT NULL");

    try {
        db()->exec('CREATE INDEX idx_bookings_booking_type_id ON bookings (booking_type_id)');
    } catch (PDOException) {
    }

    try {
        db()->exec('CREATE INDEX idx_bookings_booking_session_id ON bookings (booking_session_id)');
    } catch (PDOException) {
    }

    seed_default_booking_types();
    $checked = true;
}

function ensure_assignment_schema(): void
{
    static $checked = false;
    if ($checked) {
        return;
    }

    $areaColumns = [
        'auto_assign_enabled' => 'ALTER TABLE areas ADD COLUMN auto_assign_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER function_enabled',
        'allow_table_joins' => 'ALTER TABLE areas ADD COLUMN allow_table_joins TINYINT(1) NOT NULL DEFAULT 1 AFTER auto_assign_enabled',
        'max_joined_tables' => 'ALTER TABLE areas ADD COLUMN max_joined_tables INT NULL DEFAULT 4 AFTER allow_table_joins',
        'assignment_priority' => 'ALTER TABLE areas ADD COLUMN assignment_priority INT NOT NULL DEFAULT 0 AFTER max_joined_tables',
        'preferred_min_guests' => 'ALTER TABLE areas ADD COLUMN preferred_min_guests INT NULL AFTER assignment_priority',
        'preferred_max_guests' => 'ALTER TABLE areas ADD COLUMN preferred_max_guests INT NULL AFTER preferred_min_guests',
    ];
    foreach ($areaColumns as $column => $sql) {
        if (!table_column_exists('areas', $column)) {
            db()->exec($sql);
        }
    }

    $tableColumns = [
        'auto_assign_enabled' => 'ALTER TABLE venue_tables ADD COLUMN auto_assign_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER active',
        'joinable' => 'ALTER TABLE venue_tables ADD COLUMN joinable TINYINT(1) NOT NULL DEFAULT 1 AFTER auto_assign_enabled',
        'assignment_priority' => 'ALTER TABLE venue_tables ADD COLUMN assignment_priority INT NOT NULL DEFAULT 0 AFTER joinable',
        'preferred_min_guests' => 'ALTER TABLE venue_tables ADD COLUMN preferred_min_guests INT NULL AFTER assignment_priority',
        'preferred_max_guests' => 'ALTER TABLE venue_tables ADD COLUMN preferred_max_guests INT NULL AFTER preferred_min_guests',
        'keep_for_walkins' => 'ALTER TABLE venue_tables ADD COLUMN keep_for_walkins TINYINT(1) NOT NULL DEFAULT 0 AFTER preferred_max_guests',
        'accessibility_friendly' => 'ALTER TABLE venue_tables ADD COLUMN accessibility_friendly TINYINT(1) NOT NULL DEFAULT 0 AFTER keep_for_walkins',
    ];
    foreach ($tableColumns as $column => $sql) {
        if (!table_column_exists('venue_tables', $column)) {
            db()->exec($sql);
        }
    }

    db()->exec(
        "CREATE TABLE IF NOT EXISTS table_join_groups (
            id INT AUTO_INCREMENT PRIMARY KEY,
            venue_id INT NOT NULL,
            area_id INT NOT NULL,
            name VARCHAR(120) NOT NULL,
            max_tables INT NULL,
            active TINYINT(1) NOT NULL DEFAULT 1,
            priority INT NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            CONSTRAINT fk_table_join_groups_area FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE CASCADE,
            INDEX idx_table_join_groups_area (area_id, active, priority)
        ) ENGINE=InnoDB"
    );
    if (!table_column_exists('table_join_groups', 'venue_id')) {
        db()->exec('ALTER TABLE table_join_groups ADD COLUMN venue_id INT NULL AFTER id');
        db()->prepare('UPDATE table_join_groups SET venue_id = :venue_id WHERE venue_id IS NULL')
            ->execute(['venue_id' => default_venue_id()]);
    }

    db()->exec(
        "CREATE TABLE IF NOT EXISTS table_join_group_tables (
            join_group_id INT NOT NULL,
            table_id INT NOT NULL,
            PRIMARY KEY (join_group_id, table_id),
            CONSTRAINT fk_table_join_group_tables_group FOREIGN KEY (join_group_id) REFERENCES table_join_groups(id) ON DELETE CASCADE,
            CONSTRAINT fk_table_join_group_tables_table FOREIGN KEY (table_id) REFERENCES venue_tables(id) ON DELETE CASCADE
        ) ENGINE=InnoDB"
    );

    db()->exec(
        "CREATE TABLE IF NOT EXISTS ai_assignment_candidates (
            id INT AUTO_INCREMENT PRIMARY KEY,
            venue_id INT NOT NULL,
            assignment_log_id INT NOT NULL,
            booking_id INT NOT NULL,
            candidate_rank INT NOT NULL,
            area_id INT NULL,
            table_ids_json JSON NOT NULL,
            table_numbers_json JSON NOT NULL,
            capacity INT NOT NULL,
            score DECIMAL(10,2) NOT NULL,
            selected TINYINT(1) NOT NULL DEFAULT 0,
            feature_snapshot_json JSON NOT NULL,
            created_at DATETIME NOT NULL,
            CONSTRAINT fk_ai_candidate_log FOREIGN KEY (assignment_log_id) REFERENCES ai_assignment_logs(id) ON DELETE CASCADE,
            CONSTRAINT fk_ai_candidate_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
            CONSTRAINT fk_ai_candidate_area FOREIGN KEY (area_id) REFERENCES areas(id),
            INDEX idx_ai_assignment_candidates_booking (booking_id),
            INDEX idx_ai_assignment_candidates_log (assignment_log_id)
        ) ENGINE=InnoDB"
    );
    if (!table_column_exists('ai_assignment_candidates', 'venue_id')) {
        db()->exec('ALTER TABLE ai_assignment_candidates ADD COLUMN venue_id INT NULL AFTER id');
        db()->prepare('UPDATE ai_assignment_candidates SET venue_id = :venue_id WHERE venue_id IS NULL')
            ->execute(['venue_id' => default_venue_id()]);
    }

    seed_default_table_join_groups();
    $checked = true;
}

function seed_default_table_join_groups(): void
{
    $venueId = current_venue_id();
    $stmt = db()->prepare(
        'SELECT a.id, a.name, a.sort_order
         FROM areas a
         WHERE a.venue_id = :venue_id
           AND NOT EXISTS (
            SELECT 1 FROM table_join_groups tjg WHERE tjg.area_id = a.id
         )
         ORDER BY a.sort_order, a.id'
    );
    $stmt->execute(['venue_id' => $venueId]);
    $areas = $stmt->fetchAll();

    if ($areas === []) {
        return;
    }

    $insertGroup = db()->prepare(
        'INSERT INTO table_join_groups (venue_id, area_id, name, max_tables, active, priority, created_at, updated_at)
         VALUES (:venue_id, :area_id, :name, 4, 1, :priority, NOW(), NOW())'
    );
    $attachTables = db()->prepare(
        'INSERT IGNORE INTO table_join_group_tables (join_group_id, table_id)
         SELECT :join_group_id, id
         FROM venue_tables
         WHERE venue_id = :venue_id AND area_id = :area_id'
    );

    foreach ($areas as $area) {
        $insertGroup->execute([
            'venue_id' => $venueId,
            'area_id' => (int) $area['id'],
            'name' => (string) $area['name'] . ' join group',
            'priority' => (int) ($area['sort_order'] ?? 0),
        ]);
        $attachTables->execute([
            'join_group_id' => (int) db()->lastInsertId(),
            'venue_id' => $venueId,
            'area_id' => (int) $area['id'],
        ]);
    }
}

function seed_default_booking_types(): void
{
    $venueId = current_venue_id();
    if (scalar_query('SELECT COUNT(*) FROM booking_types WHERE venue_id = ?', [$venueId]) > 0) {
        return;
    }

    $types = [
        [
            'name' => 'Lunch',
            'slug' => 'lunch',
            'category' => 'dining',
            'description' => 'Standard lunch table bookings.',
            'customer_button_label' => 'Lunch',
            'internal_label' => 'Lunch',
            'colour' => '#276749',
            'icon' => 'sun',
            'capacity_mode' => 'tables',
            'min_guests' => (int) setting('min_table_guests', '8'),
            'max_guests' => (int) setting('max_table_guests', '29'),
            'max_capacity' => null,
            'max_bookings' => null,
            'requires_approval' => 0,
            'auto_confirm' => 1,
            'allow_waitlist' => 0,
            'display_to_customers' => 1,
            'booking_window_days' => 90,
            'sort_order' => 10,
        ],
        [
            'name' => 'Dinner',
            'slug' => 'dinner',
            'category' => 'dining',
            'description' => 'Standard dinner table bookings.',
            'customer_button_label' => 'Dinner',
            'internal_label' => 'Dinner',
            'colour' => '#c47f2c',
            'icon' => 'moon',
            'capacity_mode' => 'tables',
            'min_guests' => (int) setting('min_table_guests', '8'),
            'max_guests' => (int) setting('max_table_guests', '29'),
            'max_capacity' => null,
            'max_bookings' => null,
            'requires_approval' => 0,
            'auto_confirm' => 1,
            'allow_waitlist' => 0,
            'display_to_customers' => 1,
            'booking_window_days' => 90,
            'sort_order' => 20,
        ],
        [
            'name' => 'Function Enquiry',
            'slug' => 'function-enquiry',
            'category' => 'function',
            'description' => 'Larger groups and private event enquiries.',
            'customer_button_label' => 'Function Enquiry',
            'internal_label' => 'Functions',
            'colour' => '#2f80ed',
            'icon' => 'wine',
            'capacity_mode' => 'area',
            'min_guests' => 8,
            'max_guests' => 200,
            'max_capacity' => null,
            'max_bookings' => null,
            'requires_approval' => 1,
            'auto_confirm' => 0,
            'allow_waitlist' => 0,
            'display_to_customers' => 1,
            'booking_window_days' => 90,
            'sort_order' => 30,
        ],
        [
            'name' => 'Trivia Night',
            'slug' => 'trivia-night',
            'category' => 'event',
            'description' => 'Join us every Wednesday for pub trivia.',
            'customer_button_label' => 'Book Trivia',
            'internal_label' => 'Trivia',
            'colour' => '#4f8f5d',
            'icon' => 'help-circle',
            'capacity_mode' => 'guests',
            'min_guests' => 2,
            'max_guests' => 10,
            'max_capacity' => 80,
            'max_bookings' => null,
            'requires_approval' => 0,
            'auto_confirm' => 1,
            'allow_waitlist' => 1,
            'display_to_customers' => 1,
            'booking_window_days' => 90,
            'sort_order' => 40,
            'schedule' => [
                'recurrence_type' => 'weekly',
                'day_of_week' => 3,
                'start_time' => '19:00',
                'arrival_time' => '18:30',
                'duration_minutes' => 150,
            ],
            'fields' => [
                ['label' => 'Team name', 'field_type' => 'text', 'is_required' => 1, 'options' => []],
            ],
        ],
    ];

    $insert = db()->prepare(
        'INSERT INTO booking_types
            (venue_id, name, slug, category, description, customer_button_label, internal_label, is_active,
             display_to_customers, colour, icon, capacity_mode, min_guests, max_guests, max_capacity,
             max_bookings, requires_approval, auto_confirm, allow_waitlist, booking_cutoff_minutes,
             booking_window_days, cancellation_cutoff_minutes, sort_order, created_at, updated_at)
         VALUES
            (:venue_id, :name, :slug, :category, :description, :customer_button_label, :internal_label, 1,
             :display_to_customers, :colour, :icon, :capacity_mode, :min_guests, :max_guests,
             :max_capacity, :max_bookings, :requires_approval, :auto_confirm, :allow_waitlist, 120,
             :booking_window_days, 240, :sort_order, NOW(), NOW())'
    );

    foreach ($types as $type) {
        $insert->execute([
            'venue_id' => $venueId,
            'name' => $type['name'],
            'slug' => $type['slug'],
            'category' => $type['category'],
            'description' => $type['description'],
            'customer_button_label' => $type['customer_button_label'],
            'internal_label' => $type['internal_label'],
            'display_to_customers' => $type['display_to_customers'],
            'colour' => $type['colour'],
            'icon' => $type['icon'],
            'capacity_mode' => $type['capacity_mode'],
            'min_guests' => $type['min_guests'],
            'max_guests' => $type['max_guests'],
            'max_capacity' => $type['max_capacity'],
            'max_bookings' => $type['max_bookings'],
            'requires_approval' => $type['requires_approval'],
            'auto_confirm' => $type['auto_confirm'],
            'allow_waitlist' => $type['allow_waitlist'],
            'booking_window_days' => $type['booking_window_days'],
            'sort_order' => $type['sort_order'],
        ]);

        $bookingTypeId = (int) db()->lastInsertId();
        if (!empty($type['schedule'])) {
            save_booking_type_schedule($bookingTypeId, $type['schedule']);
        }
        if (!empty($type['fields'])) {
            save_booking_type_custom_fields($bookingTypeId, $type['fields']);
        }
    }
}

function booking_schedule_days(array $schedule): array
{
    $rawDays = [];
    if (isset($schedule['day_of_weeks']) && is_array($schedule['day_of_weeks'])) {
        $rawDays = $schedule['day_of_weeks'];
    } elseif (array_key_exists('day_of_week', $schedule) && $schedule['day_of_week'] !== '' && $schedule['day_of_week'] !== null) {
        $rawDays = [$schedule['day_of_week']];
    }

    $days = [];
    foreach ($rawDays as $day) {
        if ($day === '' || $day === null) {
            continue;
        }

        $day = (int) $day;
        if ($day >= 0 && $day <= 6 && !in_array($day, $days, true)) {
            $days[] = $day;
        }
    }
    sort($days);

    return $days;
}

function booking_schedule_custom_dates(array $schedule): array
{
    $rawDates = $schedule['custom_dates'] ?? [];
    if (is_string($rawDates)) {
        $decoded = json_decode($rawDates, true);
        $rawDates = is_array($decoded) ? $decoded : explode(',', $rawDates);
    }
    if (!is_array($rawDates)) {
        return [];
    }

    $dates = [];
    foreach ($rawDates as $date) {
        $date = clean_string($date);
        $dateObj = DateTime::createFromFormat('Y-m-d', $date);
        if ($dateObj && $dateObj->format('Y-m-d') === $date && !in_array($date, $dates, true)) {
            $dates[] = $date;
        }
    }
    sort($dates);

    return $dates;
}

function normalized_active_area_ids(mixed $value): array
{
    $areaIds = normalized_area_ids($value);
    if ($areaIds === []) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($areaIds), '?'));
    $stmt = db()->prepare("SELECT id FROM areas WHERE venue_id = ? AND active = 1 AND id IN ({$placeholders}) ORDER BY sort_order, id");
    $stmt->execute(array_merge([current_venue_id()], $areaIds));
    $validIds = array_map('intval', array_column($stmt->fetchAll(), 'id'));

    if (count($validIds) !== count($areaIds)) {
        fail('One or more selected event areas are unavailable.', 422);
    }

    return $validIds;
}

function decode_json_int_list(mixed $value): array
{
    if (is_array($value)) {
        return normalized_area_ids($value);
    }

    $decoded = json_decode((string) ($value ?? '[]'), true);
    if (!is_array($decoded)) {
        return [];
    }

    return normalized_area_ids($decoded);
}

function area_names_for_ids(array $areaIds): string
{
    $areaIds = normalized_area_ids($areaIds);
    if ($areaIds === []) {
        return '';
    }

    $placeholders = implode(',', array_fill(0, count($areaIds), '?'));
    $stmt = db()->prepare("SELECT name FROM areas WHERE venue_id = ? AND id IN ({$placeholders}) ORDER BY sort_order, id");
    $stmt->execute(array_merge([current_venue_id()], $areaIds));

    return implode(', ', array_column($stmt->fetchAll(), 'name'));
}

function save_booking_type_schedule(int $bookingTypeId, array $schedule): void
{
    db()->prepare('DELETE FROM booking_type_schedules WHERE booking_type_id = :booking_type_id')
        ->execute(['booking_type_id' => $bookingTypeId]);

    $recurrenceType = clean_string($schedule['recurrence_type'] ?? 'weekly');
    if (!in_array($recurrenceType, ['none', 'daily', 'weekly', 'fortnightly', 'monthly', 'custom'], true)) {
        $recurrenceType = 'weekly';
    }

    $startTime = clean_string($schedule['start_time'] ?? '');
    $durationMinutes = max((int) ($schedule['duration_minutes'] ?? 120), 15);
    $endTime = clean_string($schedule['end_time'] ?? '');
    if ($startTime !== '' && $endTime === '') {
        $endTime = time_from_minutes(minutes_from_time(substr($startTime, 0, 5)) + $durationMinutes);
    }

    $days = booking_schedule_days($schedule);
    $dayOfMonth = nullable_int($schedule['day_of_month'] ?? null);
    if ($recurrenceType === 'monthly') {
        $dayOfMonth = $dayOfMonth !== null ? min(max($dayOfMonth, 1), 31) : 1;
    } else {
        $dayOfMonth = null;
    }
    $customDates = in_array($recurrenceType, ['none', 'custom'], true) ? booking_schedule_custom_dates($schedule) : [];
    if ($recurrenceType === 'none') {
        $customDates = array_slice($customDates, 0, 1);
    }
    $reservedAreaIds = normalized_active_area_ids($schedule['reserved_area_ids'] ?? []);
    $rows = in_array($recurrenceType, ['weekly', 'fortnightly'], true) && $days !== [] ? $days : [null];
    $stmt = db()->prepare(
        'INSERT INTO booking_type_schedules
            (booking_type_id, recurrence_type, day_of_week, day_of_month, start_time, end_time, arrival_time,
             duration_minutes, start_date, end_date, custom_dates_json, reserved_area_ids_json, created_at, updated_at)
         VALUES
            (:booking_type_id, :recurrence_type, :day_of_week, :day_of_month, :start_time, :end_time, :arrival_time,
             :duration_minutes, :start_date, :end_date, :custom_dates_json, :reserved_area_ids_json, NOW(), NOW())'
    );
    foreach ($rows as $dayOfWeek) {
        $stmt->execute([
            'booking_type_id' => $bookingTypeId,
            'recurrence_type' => $recurrenceType,
            'day_of_week' => $dayOfWeek,
            'day_of_month' => $dayOfMonth,
            'start_time' => $startTime !== '' ? substr($startTime, 0, 5) : null,
            'end_time' => $endTime !== '' ? substr($endTime, 0, 5) : null,
            'arrival_time' => clean_string($schedule['arrival_time'] ?? '') !== '' ? substr(clean_string($schedule['arrival_time']), 0, 5) : null,
            'duration_minutes' => $durationMinutes,
            'start_date' => clean_string($schedule['start_date'] ?? '') !== '' ? clean_string($schedule['start_date']) : null,
            'end_date' => clean_string($schedule['end_date'] ?? '') !== '' ? clean_string($schedule['end_date']) : null,
            'custom_dates_json' => $customDates !== [] ? json_encode($customDates, JSON_UNESCAPED_SLASHES) : null,
            'reserved_area_ids_json' => $reservedAreaIds !== [] ? json_encode($reservedAreaIds, JSON_UNESCAPED_SLASHES) : null,
        ]);
    }
}

function save_booking_type_custom_fields(int $bookingTypeId, array $fields): void
{
    db()->prepare('DELETE FROM booking_custom_fields WHERE booking_type_id = :booking_type_id')
        ->execute(['booking_type_id' => $bookingTypeId]);

    $stmt = db()->prepare(
        'INSERT INTO booking_custom_fields
            (booking_type_id, label, field_type, is_required, options_json, display_order, created_at, updated_at)
         VALUES
            (:booking_type_id, :label, :field_type, :is_required, :options_json, :display_order, NOW(), NOW())'
    );

    $displayOrder = 10;
    foreach (array_slice($fields, 0, 5) as $field) {
        $label = clean_string($field['label'] ?? '');
        if ($label === '') {
            continue;
        }

        $fieldType = clean_string($field['field_type'] ?? 'text');
        if (!in_array($fieldType, ['text', 'dropdown', 'checkbox', 'number'], true)) {
            $fieldType = 'text';
        }

        $options = $field['options'] ?? [];
        if (is_string($options)) {
            $options = array_filter(array_map('trim', explode("\n", str_replace(',', "\n", $options))));
        }
        if (!is_array($options)) {
            $options = [];
        }
        $options = array_values(array_filter(array_map('clean_string', $options)));

        $stmt->execute([
            'booking_type_id' => $bookingTypeId,
            'label' => $label,
            'field_type' => $fieldType,
            'is_required' => bool_int($field['is_required'] ?? false),
            'options_json' => $options !== [] ? json_encode($options, JSON_UNESCAPED_SLASHES) : null,
            'display_order' => $displayOrder,
        ]);
        $displayOrder += 10;
    }
}

function booking_type_schedule(int $bookingTypeId): ?array
{
    $stmt = db()->prepare(
        'SELECT id, booking_type_id, recurrence_type, day_of_week, day_of_month, start_time, end_time, arrival_time,
                duration_minutes, start_date, end_date, custom_dates_json, reserved_area_ids_json
         FROM booking_type_schedules
         WHERE booking_type_id = :booking_type_id
         ORDER BY day_of_week IS NULL, day_of_week, id'
    );
    $stmt->execute(['booking_type_id' => $bookingTypeId]);
    $schedules = $stmt->fetchAll();
    if ($schedules === []) {
        return null;
    }

    $schedule = $schedules[0];
    $dayOfWeeks = [];
    foreach ($schedules as $row) {
        if ($row['day_of_week'] === null) {
            continue;
        }

        $dayOfWeek = (int) $row['day_of_week'];
        if ($dayOfWeek >= 0 && $dayOfWeek <= 6 && !in_array($dayOfWeek, $dayOfWeeks, true)) {
            $dayOfWeeks[] = $dayOfWeek;
        }
    }
    sort($dayOfWeeks);
    $schedule['day_of_weeks'] = $dayOfWeeks;
    $schedule['day_of_week'] = $dayOfWeeks[0] ?? null;
    $customDates = json_decode((string) ($schedule['custom_dates_json'] ?? '[]'), true);
    $schedule['custom_dates'] = is_array($customDates) ? array_values(array_filter(array_map('clean_string', $customDates))) : [];
    $schedule['reserved_area_ids'] = decode_json_int_list($schedule['reserved_area_ids_json'] ?? null);
    $schedule['reserved_area_names'] = area_names_for_ids($schedule['reserved_area_ids']);

    return $schedule;
}

function booking_type_custom_fields(int $bookingTypeId): array
{
    $stmt = db()->prepare(
        'SELECT id, booking_type_id, label, field_type, is_required, options_json, display_order
         FROM booking_custom_fields
         WHERE booking_type_id = :booking_type_id
         ORDER BY display_order, id'
    );
    $stmt->execute(['booking_type_id' => $bookingTypeId]);
    $fields = $stmt->fetchAll();

    foreach ($fields as &$field) {
        $decoded = json_decode((string) ($field['options_json'] ?? '[]'), true);
        $field['options'] = is_array($decoded) ? $decoded : [];
    }
    unset($field);

    return $fields;
}

function booking_type_base_sql(): string
{
    return 'SELECT id, venue_id, name, slug, category, description, customer_button_label, internal_label,
                   is_active, display_to_customers, colour, icon, capacity_mode, min_guests,
                   max_guests, max_capacity, max_bookings, requires_approval, auto_confirm,
                   allow_waitlist, booking_cutoff_minutes, booking_window_days, cancellation_cutoff_minutes,
                   sort_order, deleted_at, created_at, updated_at
            FROM booking_types';
}

function normalize_booking_type(array $type, bool $includeSessions = false): array
{
    $type['schedule'] = booking_type_schedule((int) $type['id']);
    $type['custom_fields'] = booking_type_custom_fields((int) $type['id']);

    if ($includeSessions && (string) $type['category'] === 'event') {
        generate_booking_sessions_for_type((int) $type['id']);
        $type['upcoming_sessions'] = public_booking_sessions((int) $type['id']);
    }

    return $type;
}

function fetch_booking_types(bool $publicOnly = false, bool $includeSessions = false): array
{
    ensure_booking_type_schema();

    $sql = booking_type_base_sql();
    if ($publicOnly) {
        $sql .= ' WHERE venue_id = :venue_id AND deleted_at IS NULL AND is_active = 1 AND display_to_customers = 1';
    } else {
        $sql .= ' WHERE venue_id = :venue_id AND deleted_at IS NULL';
    }
    $sql .= ' ORDER BY sort_order, name';

    $stmt = db()->prepare($sql);
    $stmt->execute(['venue_id' => current_venue_id()]);
    $types = $stmt->fetchAll();

    return array_map(static fn (array $type) => normalize_booking_type($type, $includeSessions), $types);
}

function find_booking_type_by_id(int $bookingTypeId): ?array
{
    ensure_booking_type_schema();
    $stmt = db()->prepare(booking_type_base_sql() . ' WHERE id = :id AND venue_id = :venue_id LIMIT 1');
    $stmt->execute(['id' => $bookingTypeId, 'venue_id' => current_venue_id()]);
    $type = $stmt->fetch();

    return $type ? normalize_booking_type($type) : null;
}

function find_booking_type_by_slug(string $slug): ?array
{
    ensure_booking_type_schema();
    $stmt = db()->prepare(booking_type_base_sql() . ' WHERE slug = :slug AND venue_id = :venue_id AND deleted_at IS NULL LIMIT 1');
    $stmt->execute(['slug' => $slug, 'venue_id' => current_venue_id()]);
    $type = $stmt->fetch();

    return $type ? normalize_booking_type($type) : null;
}

function default_booking_type_id_for_table_time(string $startTime): ?int
{
    $startMinutes = minutes_from_time(substr($startTime, 0, 5));
    foreach (['lunch', 'dinner'] as $slug) {
        $type = find_booking_type_by_slug($slug);
        $schedule = $type['schedule'] ?? null;
        $serviceStart = substr((string) ($schedule['start_time'] ?? ''), 0, 5);
        $serviceEnd = substr((string) ($schedule['end_time'] ?? ''), 0, 5);

        if ($type && $serviceStart !== '' && $serviceEnd !== '') {
            $serviceStartMinutes = minutes_from_time($serviceStart);
            $serviceEndMinutes = minutes_from_time($serviceEnd);
            if ($startMinutes >= $serviceStartMinutes && $startMinutes <= $serviceEndMinutes) {
                return (int) $type['id'];
            }
        }
    }

    $slug = $startMinutes < 17 * 60 ? 'lunch' : 'dinner';
    $type = find_booking_type_by_slug($slug);

    return $type ? (int) $type['id'] : null;
}

function default_function_booking_type_id(): ?int
{
    $type = find_booking_type_by_slug('function-enquiry');

    return $type ? (int) $type['id'] : null;
}

function public_booking_type_for_category(?int $bookingTypeId, string $category): ?array
{
    if ($bookingTypeId === null) {
        return null;
    }

    $type = find_booking_type_by_id($bookingTypeId);
    if (
        !$type ||
        (string) $type['category'] !== $category ||
        (int) $type['is_active'] !== 1 ||
        (int) $type['display_to_customers'] !== 1
    ) {
        fail('This booking type is not available online.', 422);
    }

    return $type;
}

function validate_dining_booking_type_time(array $bookingType, string $startTime): void
{
    $schedule = $bookingType['schedule'] ?? null;
    $serviceStart = substr((string) ($schedule['start_time'] ?? ''), 0, 5);
    $serviceEnd = substr((string) ($schedule['end_time'] ?? ''), 0, 5);
    if ($serviceStart === '' && (string) ($bookingType['slug'] ?? '') === 'dinner') {
        $serviceStart = '17:00';
    }
    if ($serviceEnd === '' && (string) ($bookingType['slug'] ?? '') === 'lunch') {
        $serviceEnd = '16:30';
    }

    if ($serviceStart === '' && $serviceEnd === '') {
        return;
    }

    $startMinutes = minutes_from_time(substr($startTime, 0, 5));
    if ($serviceStart !== '' && $startMinutes < minutes_from_time($serviceStart)) {
        fail('This booking type is not available at the selected time.', 422);
    }
    if ($serviceEnd !== '' && $startMinutes > minutes_from_time($serviceEnd)) {
        fail('This booking type is not available at the selected time.', 422);
    }
}

function booking_type_payload(array $data, ?array $existing = null): array
{
    require_fields($data, ['name', 'category']);

    $name = clean_string($data['name']);
    $category = clean_string($data['category']);
    if (!in_array($category, ['dining', 'event', 'function', 'custom'], true)) {
        fail('Please choose a valid booking type category.', 422, ['category' => $category]);
    }

    $capacityMode = clean_string($data['capacity_mode'] ?? 'guests');
    if (!in_array($capacityMode, ['guests', 'bookings', 'tables', 'area'], true)) {
        fail('Please choose a valid capacity mode.', 422, ['capacity_mode' => $capacityMode]);
    }

    $colour = clean_string($data['colour'] ?? ($existing['colour'] ?? '#276749'));
    if (!preg_match('/^#[0-9A-Fa-f]{6}$/', $colour)) {
        $colour = '#276749';
    }

    $minGuests = max((int) ($data['min_guests'] ?? ($existing['min_guests'] ?? 1)), 1);
    $rawMaxGuests = array_key_exists('max_guests', $data)
        ? nullable_int($data['max_guests'])
        : nullable_int($existing['max_guests'] ?? null);
    $maxGuests = $rawMaxGuests !== null ? max($rawMaxGuests, $minGuests) : null;
    $maxCapacity = nullable_int($data['max_capacity'] ?? ($existing['max_capacity'] ?? null));
    $maxBookings = nullable_int($data['max_bookings'] ?? ($existing['max_bookings'] ?? null));

    return [
        'name' => $name,
        'slug' => unique_booking_type_slug($name, $existing ? (int) $existing['id'] : null),
        'category' => $category,
        'description' => clean_string($data['description'] ?? ''),
        'customer_button_label' => clean_string($data['customer_button_label'] ?? $name),
        'internal_label' => clean_string($data['internal_label'] ?? $name),
        'is_active' => bool_int($data['is_active'] ?? true),
        'display_to_customers' => bool_int($data['display_to_customers'] ?? true),
        'colour' => $colour,
        'icon' => substr(clean_string($data['icon'] ?? 'calendar'), 0, 40),
        'capacity_mode' => $capacityMode,
        'min_guests' => $minGuests,
        'max_guests' => $maxGuests,
        'max_capacity' => $maxCapacity !== null ? max($maxCapacity, 1) : null,
        'max_bookings' => $maxBookings !== null ? max($maxBookings, 1) : null,
        'requires_approval' => bool_int($data['requires_approval'] ?? false),
        'auto_confirm' => bool_int($data['auto_confirm'] ?? true),
        'allow_waitlist' => bool_int($data['allow_waitlist'] ?? false),
        'booking_cutoff_minutes' => max((int) ($data['booking_cutoff_minutes'] ?? 0), 0),
        'booking_window_days' => min(max((int) ($data['booking_window_days'] ?? ($existing['booking_window_days'] ?? 90)), 1), 365),
        'cancellation_cutoff_minutes' => max((int) ($data['cancellation_cutoff_minutes'] ?? 0), 0),
        'sort_order' => (int) ($data['sort_order'] ?? ($existing['sort_order'] ?? 0)),
        'schedule' => is_array($data['schedule'] ?? null) ? $data['schedule'] : [],
        'custom_fields' => is_array($data['custom_fields'] ?? null) ? $data['custom_fields'] : [],
    ];
}

function create_booking_type(array $data, array $manager): array
{
    $payload = booking_type_payload($data);
    $venueId = current_venue_id($manager);
    $stmt = db()->prepare(
        'INSERT INTO booking_types
            (venue_id, name, slug, category, description, customer_button_label, internal_label, is_active,
             display_to_customers, colour, icon, capacity_mode, min_guests, max_guests, max_capacity,
             max_bookings, requires_approval, auto_confirm, allow_waitlist, booking_cutoff_minutes,
             booking_window_days, cancellation_cutoff_minutes, sort_order, created_at, updated_at)
         VALUES
            (:venue_id, :name, :slug, :category, :description, :customer_button_label, :internal_label, :is_active,
             :display_to_customers, :colour, :icon, :capacity_mode, :min_guests, :max_guests, :max_capacity,
             :max_bookings, :requires_approval, :auto_confirm, :allow_waitlist, :booking_cutoff_minutes,
             :booking_window_days, :cancellation_cutoff_minutes, :sort_order, NOW(), NOW())'
    );
    $params = array_diff_key($payload, array_flip(['schedule', 'custom_fields']));
    $params['venue_id'] = $venueId;
    $stmt->execute($params);
    $bookingTypeId = (int) db()->lastInsertId();

    save_booking_type_schedule($bookingTypeId, $payload['schedule']);
    save_booking_type_custom_fields($bookingTypeId, $payload['custom_fields']);
    log_activity((int) $manager['id'], 'created', 'booking_type', $bookingTypeId, ['name' => $payload['name']]);

    return find_booking_type_by_id($bookingTypeId) ?: [];
}

function event_session_capacity_values(array $type): array
{
    $maxCapacity = nullable_int($type['max_capacity'] ?? null);
    $maxBookings = nullable_int($type['max_bookings'] ?? null);

    return [
        'capacity' => $maxCapacity !== null && $maxCapacity > 0 ? $maxCapacity : null,
        'booking_limit' => $maxBookings !== null && $maxBookings > 0 ? $maxBookings : null,
    ];
}

function refresh_booked_event_sessions_from_payload(int $bookingTypeId, array $payload): void
{
    if ((string) $payload['category'] !== 'event') {
        return;
    }

    $reservedAreaIds = normalized_active_area_ids($payload['schedule']['reserved_area_ids'] ?? []);
    $reservedAreaIdsJson = $reservedAreaIds !== [] ? json_encode($reservedAreaIds, JSON_UNESCAPED_SLASHES) : null;
    $capacityValues = event_session_capacity_values($payload);
    $stmt = db()->prepare(
        'UPDATE booking_sessions
         SET reserved_area_ids_json = :reserved_area_ids_json,
             capacity = :capacity,
             booking_limit = :booking_limit,
             updated_at = NOW()
         WHERE booking_type_id = :booking_type_id
           AND date >= CURDATE()
           AND EXISTS (SELECT 1 FROM bookings WHERE bookings.booking_session_id = booking_sessions.id)'
    );
    $stmt->execute([
        'booking_type_id' => $bookingTypeId,
        'reserved_area_ids_json' => $reservedAreaIdsJson,
        'capacity' => $capacityValues['capacity'],
        'booking_limit' => $capacityValues['booking_limit'],
    ]);
}

function update_booking_type(int $bookingTypeId, array $data, array $manager): array
{
    $existing = find_booking_type_by_id($bookingTypeId);
    if (!$existing) {
        fail('Booking type not found.', 404);
    }

    $payload = booking_type_payload($data, $existing);
    $stmt = db()->prepare(
        'UPDATE booking_types
         SET name = :name, slug = :slug, category = :category, description = :description,
             customer_button_label = :customer_button_label, internal_label = :internal_label,
             is_active = :is_active, display_to_customers = :display_to_customers, colour = :colour,
             icon = :icon, capacity_mode = :capacity_mode, min_guests = :min_guests,
             max_guests = :max_guests, max_capacity = :max_capacity, max_bookings = :max_bookings,
             requires_approval = :requires_approval, auto_confirm = :auto_confirm,
             allow_waitlist = :allow_waitlist, booking_cutoff_minutes = :booking_cutoff_minutes,
             booking_window_days = :booking_window_days,
             cancellation_cutoff_minutes = :cancellation_cutoff_minutes, sort_order = :sort_order,
             updated_at = NOW()
         WHERE id = :id'
    );
    $params = array_diff_key($payload, array_flip(['schedule', 'custom_fields']));
    $params['id'] = $bookingTypeId;
    $stmt->execute($params);

    save_booking_type_schedule($bookingTypeId, $payload['schedule']);
    save_booking_type_custom_fields($bookingTypeId, $payload['custom_fields']);
    refresh_booked_event_sessions_from_payload($bookingTypeId, $payload);
    db()->prepare(
        'DELETE FROM booking_sessions
         WHERE booking_type_id = :booking_type_id
           AND date >= CURDATE()
           AND NOT EXISTS (SELECT 1 FROM bookings WHERE bookings.booking_session_id = booking_sessions.id)'
    )->execute(['booking_type_id' => $bookingTypeId]);

    log_activity((int) $manager['id'], 'updated', 'booking_type', $bookingTypeId, ['name' => $payload['name']]);

    return find_booking_type_by_id($bookingTypeId) ?: [];
}

function delete_booking_type(int $bookingTypeId, array $manager): array
{
    $venueId = current_venue_id($manager);
    $existing = find_booking_type_by_id($bookingTypeId);
    if (!$existing) {
        fail('Booking type not found.', 404);
    }

    $bookingCount = scalar_query(
        'SELECT COUNT(*) FROM bookings WHERE venue_id = ? AND booking_type_id = ?',
        [$venueId, $bookingTypeId]
    );

    if ($bookingCount > 0) {
        db()->prepare(
            'UPDATE booking_types
             SET slug = CONCAT(LEFT(slug, 70), "-deleted-", id),
                 is_active = 0,
                 display_to_customers = 0,
                 sort_order = sort_order + 1000,
                 deleted_at = NOW(),
                 updated_at = NOW()
             WHERE id = :id AND venue_id = :venue_id'
        )->execute([
            'id' => $bookingTypeId,
            'venue_id' => $venueId,
        ]);
        db()->prepare(
            'UPDATE booking_sessions
             SET status = "cancelled", updated_at = NOW()
             WHERE booking_type_id = :booking_type_id
               AND venue_id = :venue_id
               AND date >= CURDATE()
               AND NOT EXISTS (SELECT 1 FROM bookings WHERE bookings.booking_session_id = booking_sessions.id)'
        )->execute([
            'booking_type_id' => $bookingTypeId,
            'venue_id' => $venueId,
        ]);
        log_activity((int) $manager['id'], 'archived', 'booking_type', $bookingTypeId, [
            'name' => $existing['name'],
            'bookings' => $bookingCount,
        ]);

        return ['ok' => true, 'mode' => 'archived', 'bookings' => $bookingCount];
    }

    db()->prepare(
        'DELETE FROM booking_custom_fields WHERE booking_type_id = :booking_type_id'
    )->execute(['booking_type_id' => $bookingTypeId]);
    db()->prepare(
        'DELETE FROM booking_type_schedules WHERE booking_type_id = :booking_type_id'
    )->execute(['booking_type_id' => $bookingTypeId]);
    db()->prepare(
        'DELETE FROM booking_sessions WHERE booking_type_id = :booking_type_id AND venue_id = :venue_id'
    )->execute([
        'booking_type_id' => $bookingTypeId,
        'venue_id' => $venueId,
    ]);
    db()->prepare(
        'DELETE FROM booking_types WHERE id = :id AND venue_id = :venue_id'
    )->execute([
        'id' => $bookingTypeId,
        'venue_id' => $venueId,
    ]);
    log_activity((int) $manager['id'], 'deleted', 'booking_type', $bookingTypeId, ['name' => $existing['name']]);

    return ['ok' => true, 'mode' => 'deleted', 'bookings' => 0];
}

function generate_booking_sessions_for_type(int $bookingTypeId, ?int $daysAhead = null): void
{
    $type = find_booking_type_by_id($bookingTypeId);
    if (!$type || (string) $type['category'] !== 'event') {
        return;
    }
    $daysAhead = $daysAhead !== null
        ? min(max($daysAhead, 1), 365)
        : min(max((int) ($type['booking_window_days'] ?? 90), 1), 365);

    $schedule = $type['schedule'] ?? null;
    $recurrenceType = (string) ($schedule['recurrence_type'] ?? '');
    if (!$schedule || !in_array($recurrenceType, ['none', 'daily', 'weekly', 'fortnightly', 'monthly', 'custom'], true)) {
        return;
    }

    $dayOfWeeks = [];
    if (isset($schedule['day_of_weeks']) && is_array($schedule['day_of_weeks'])) {
        foreach ($schedule['day_of_weeks'] as $day) {
            $day = (int) $day;
            if ($day >= 0 && $day <= 6 && !in_array($day, $dayOfWeeks, true)) {
                $dayOfWeeks[] = $day;
            }
        }
    }
    if ($dayOfWeeks === [] && array_key_exists('day_of_week', $schedule) && $schedule['day_of_week'] !== null) {
        $dayOfWeek = (int) $schedule['day_of_week'];
        if ($dayOfWeek >= 0 && $dayOfWeek <= 6) {
            $dayOfWeeks[] = $dayOfWeek;
        }
    }

    $startTime = substr((string) ($schedule['start_time'] ?? ''), 0, 5);
    $endTime = substr((string) ($schedule['end_time'] ?? ''), 0, 5);
    if ($startTime === '' || $endTime === '') {
        return;
    }
    if (in_array($recurrenceType, ['weekly', 'fortnightly'], true) && $dayOfWeeks === []) {
        return;
    }

    $startDate = clean_string($schedule['start_date'] ?? '');
    $endDate = clean_string($schedule['end_date'] ?? '');
    $today = new DateTimeImmutable('today');
    $last = $today->modify("+{$daysAhead} days");
    $anchor = $startDate !== '' ? DateTimeImmutable::createFromFormat('Y-m-d', $startDate) : $today;
    if (!$anchor) {
        $anchor = $today;
    }
    $insert = db()->prepare(
        'INSERT IGNORE INTO booking_sessions
            (booking_type_id, venue_id, date, start_time, end_time, arrival_time, capacity, booking_limit, reserved_area_ids_json, status, created_at, updated_at)
         VALUES
            (:booking_type_id, :venue_id, :date, :start_time, :end_time, :arrival_time, :capacity, :booking_limit, :reserved_area_ids_json, "active", NOW(), NOW())'
    );
    $reservedAreaIdsJson = !empty($schedule['reserved_area_ids'])
        ? json_encode(array_values(array_map('intval', $schedule['reserved_area_ids'])), JSON_UNESCAPED_SLASHES)
        : null;
    $capacityValues = event_session_capacity_values($type);

    $insertSession = static function (string $iso) use ($insert, $bookingTypeId, $type, $schedule, $startTime, $endTime, $reservedAreaIdsJson, $capacityValues): void {
        $insert->execute([
            'booking_type_id' => $bookingTypeId,
            'venue_id' => (int) $type['venue_id'],
            'date' => $iso,
            'start_time' => $startTime,
            'end_time' => $endTime,
            'arrival_time' => clean_string($schedule['arrival_time'] ?? '') !== '' ? substr((string) $schedule['arrival_time'], 0, 5) : null,
            'capacity' => $capacityValues['capacity'],
            'booking_limit' => $capacityValues['booking_limit'],
            'reserved_area_ids_json' => $reservedAreaIdsJson,
        ]);
    };

    if (in_array($recurrenceType, ['none', 'custom'], true)) {
        $customDates = isset($schedule['custom_dates']) && is_array($schedule['custom_dates']) ? $schedule['custom_dates'] : [];
        foreach ($customDates as $customDate) {
            $iso = clean_string($customDate);
            if ($iso < $today->format('Y-m-d')) {
                continue;
            }
            if ($iso > $last->format('Y-m-d')) {
                continue;
            }
            if ($startDate !== '' && $iso < $startDate) {
                continue;
            }
            if ($endDate !== '' && $iso > $endDate) {
                continue;
            }

            $insertSession($iso);
        }
        return;
    }

    $dayOfMonth = (int) ($schedule['day_of_month'] ?? 1);
    $dayOfMonth = min(max($dayOfMonth, 1), 31);
    for ($date = $today; $date <= $last; $date = $date->modify('+1 day')) {
        $iso = $date->format('Y-m-d');
        $matches = match ($recurrenceType) {
            'daily' => true,
            'weekly' => in_array((int) $date->format('w'), $dayOfWeeks, true),
            'fortnightly' => in_array((int) $date->format('w'), $dayOfWeeks, true)
                && $anchor <= $date
                && ((int) floor($anchor->diff($date)->days / 7)) % 2 === 0,
            'monthly' => (int) $date->format('j') === $dayOfMonth,
            default => false,
        };
        if (!$matches) {
            continue;
        }
        if ($startDate !== '' && $iso < $startDate) {
            continue;
        }
        if ($endDate !== '' && $iso > $endDate) {
            continue;
        }

        $insertSession($iso);
    }
}

function session_usage(int $sessionId): array
{
    $stmt = db()->prepare(
        'SELECT COUNT(*) AS booking_count, COALESCE(SUM(guest_count), 0) AS guest_count
         FROM bookings
         WHERE booking_session_id = :booking_session_id
           AND venue_id = :venue_id
           AND status NOT IN ("cancelled", "declined", "no_show")'
    );
    $stmt->execute(['booking_session_id' => $sessionId, 'venue_id' => current_venue_id()]);
    $usage = $stmt->fetch() ?: ['booking_count' => 0, 'guest_count' => 0];

    return [
        'booking_count' => (int) $usage['booking_count'],
        'guest_count' => (int) $usage['guest_count'],
    ];
}

function public_booking_sessions(int $bookingTypeId): array
{
    $stmt = db()->prepare(
        'SELECT bs.id, bs.booking_type_id, bs.date, bs.start_time, bs.end_time, bs.arrival_time,
                bt.max_capacity AS capacity, bt.max_bookings AS booking_limit,
                bs.reserved_area_ids_json, bs.status
         FROM booking_sessions bs
         JOIN booking_types bt ON bt.id = bs.booking_type_id
         WHERE bs.booking_type_id = :booking_type_id
           AND bs.venue_id = :session_venue_id
           AND bt.venue_id = :type_venue_id
           AND bs.date >= CURDATE()
           AND bs.date <= DATE_ADD(CURDATE(), INTERVAL bt.booking_window_days DAY)
           AND bs.status = "active"
         ORDER BY bs.date ASC, bs.start_time ASC'
    );
    $venueId = current_venue_id();
    $stmt->execute([
        'booking_type_id' => $bookingTypeId,
        'session_venue_id' => $venueId,
        'type_venue_id' => $venueId,
    ]);
    $sessions = $stmt->fetchAll();

    foreach ($sessions as &$session) {
        $usage = session_usage((int) $session['id']);
        $session['booked_guests'] = $usage['guest_count'];
        $session['booked_count'] = $usage['booking_count'];
        $session['available_guests'] = $session['capacity'] !== null ? max((int) $session['capacity'] - $usage['guest_count'], 0) : null;
        $session['available_bookings'] = $session['booking_limit'] !== null ? max((int) $session['booking_limit'] - $usage['booking_count'], 0) : null;
        $session['reserved_area_ids'] = decode_json_int_list($session['reserved_area_ids_json'] ?? null);
        $session['reserved_area_names'] = area_names_for_ids($session['reserved_area_ids']);
    }
    unset($session);

    return $sessions;
}

function validate_custom_answers(array $fields, mixed $answers): array
{
    $answers = is_array($answers) ? $answers : [];
    $validated = [];

    foreach ($fields as $field) {
        $fieldId = (int) $field['id'];
        $key = (string) $fieldId;
        $answer = clean_string($answers[$key] ?? $answers[$fieldId] ?? '');
        $fieldType = (string) $field['field_type'];

        if ($fieldType === 'checkbox') {
            $answer = bool_int($answers[$key] ?? $answers[$fieldId] ?? false) ? 'Yes' : 'No';
        }

        if ((int) $field['is_required'] === 1 && $answer === '') {
            fail('Please complete all required fields.', 422, ['field' => $field['label']]);
        }

        if ($answer === '') {
            continue;
        }

        if ($fieldType === 'number' && !is_numeric($answer)) {
            fail('Please enter a valid number.', 422, ['field' => $field['label']]);
        }

        if ($fieldType === 'dropdown') {
            $options = $field['options'] ?? [];
            if ($options !== [] && !in_array($answer, $options, true)) {
                fail('Please choose a valid option.', 422, ['field' => $field['label']]);
            }
        }

        $validated[] = [
            'field_id' => $fieldId,
            'label' => (string) $field['label'],
            'answer' => $answer,
        ];
    }

    return $validated;
}

function save_booking_custom_answers(int $bookingId, array $answers): void
{
    if ($answers === []) {
        return;
    }

    $stmt = db()->prepare(
        'INSERT INTO booking_custom_answers (booking_id, field_id, field_label_snapshot, answer, created_at)
         VALUES (:booking_id, :field_id, :field_label_snapshot, :answer, NOW())'
    );
    foreach ($answers as $answer) {
        $stmt->execute([
            'booking_id' => $bookingId,
            'field_id' => $answer['field_id'],
            'field_label_snapshot' => $answer['label'],
            'answer' => $answer['answer'],
        ]);
    }
}

function create_event_booking(array $data): array
{
    require_fields($data, ['booking_type_id', 'booking_session_id', 'name', 'email', 'phone', 'guest_count']);

    $bookingTypeId = (int) $data['booking_type_id'];
    $sessionId = (int) $data['booking_session_id'];
    $venueId = current_venue_id();
    $type = find_booking_type_by_id($bookingTypeId);
    if (!$type || (int) $type['is_active'] !== 1 || (int) $type['display_to_customers'] !== 1 || (string) $type['category'] !== 'event') {
        fail('This booking type is not available online.', 404);
    }

    generate_booking_sessions_for_type($bookingTypeId);
    $stmt = db()->prepare(
        'SELECT id, booking_type_id, date, start_time, end_time, arrival_time, capacity, booking_limit,
                reserved_area_ids_json, status
         FROM booking_sessions
         WHERE id = :id AND booking_type_id = :booking_type_id AND venue_id = :venue_id
         LIMIT 1'
    );
    $stmt->execute(['id' => $sessionId, 'booking_type_id' => $bookingTypeId, 'venue_id' => $venueId]);
    $session = $stmt->fetch();
    if (!$session || (string) $session['status'] !== 'active' || (string) $session['date'] < date('Y-m-d')) {
        fail('This event session is no longer available.', 404);
    }
    $bookingWindowDays = min(max((int) ($type['booking_window_days'] ?? 90), 1), 365);
    $lastBookableDate = (new DateTimeImmutable('today'))->modify("+{$bookingWindowDays} days")->format('Y-m-d');
    if ((string) $session['date'] > $lastBookableDate) {
        fail('This event session is outside the booking window.', 422);
    }
    $session['capacity'] = nullable_int($type['max_capacity'] ?? null);
    $session['booking_limit'] = nullable_int($type['max_bookings'] ?? null);

    $name = clean_string($data['name']);
    $email = strtolower(clean_string($data['email']));
    $phone = clean_string($data['phone']);
    $guestCount = (int) $data['guest_count'];
    $notes = clean_string($data['notes'] ?? '');

    validate_email_address($email);
    validate_phone_number($phone);
    require_online_booking_date_available((string) $session['date']);

    $minGuests = max((int) ($type['min_guests'] ?? 1), 1);
    $maxGuests = nullable_int($type['max_guests'] ?? null);
    if ($guestCount < $minGuests) {
        fail("This booking type accepts bookings from {$minGuests} guests.", 422);
    }
    if ($maxGuests !== null && $guestCount > $maxGuests) {
        fail("This booking type accepts bookings up to {$maxGuests} guests.", 422);
    }

    $cutoffMinutes = max((int) ($type['booking_cutoff_minutes'] ?? 0), 0);
    if ($cutoffMinutes > 0) {
        $sessionStart = DateTime::createFromFormat('Y-m-d H:i:s', "{$session['date']} {$session['start_time']}");
        $cutoff = $sessionStart ? (clone $sessionStart)->modify("-{$cutoffMinutes} minutes") : null;
        if ($cutoff && new DateTime() > $cutoff) {
            fail('Bookings for this event session have closed.', 422);
        }
    }

    $usage = session_usage($sessionId);
    $status = (int) $type['requires_approval'] === 1 || (int) $type['auto_confirm'] !== 1 ? 'pending' : 'confirmed';
    $bookingDurationMinutes = max((int) ($type['schedule']['duration_minutes'] ?? 120), 15);
    $bookingEndTime = time_from_minutes(minutes_from_time(substr((string) $session['start_time'], 0, 5)) + $bookingDurationMinutes);
    $reservedAreaIds = decode_json_int_list($session['reserved_area_ids_json'] ?? null);
    $autoAssignmentEnabled = setting_enabled('auto_assignment_enabled', true);

    $bookingLimitExceeded = $session['booking_limit'] !== null
        && $usage['booking_count'] >= (int) $session['booking_limit'];
    $guestCapacityExceeded = $session['capacity'] !== null
        && $usage['guest_count'] + $guestCount > (int) $session['capacity'];

    if ($bookingLimitExceeded || $guestCapacityExceeded) {
        if ((int) $type['allow_waitlist'] === 1) {
            $status = 'waitlist';
        } elseif ($bookingLimitExceeded) {
            fail('This event session is fully booked.', 409);
        } else {
            fail('This event session does not have enough remaining capacity.', 409);
        }
    }

    $tableRecommendation = null;
    if ($status !== 'waitlist' && $autoAssignmentEnabled) {
        $tableRecommendation = recommend_tables(
            $guestCount,
            (string) $session['date'],
            (string) $session['start_time'],
            $bookingEndTime,
            $reservedAreaIds[0] ?? null,
            null,
            $reservedAreaIds,
            $sessionId
        );
    } elseif ($status === 'confirmed') {
        $status = 'pending';
    }

    $customAnswers = validate_custom_answers($type['custom_fields'], $data['custom_answers'] ?? []);
    $customerId = find_or_create_customer(['name' => $name, 'email' => $email, 'phone' => $phone]);
    $reference = booking_reference();

    $stmt = db()->prepare(
        'INSERT INTO bookings
            (venue_id, booking_reference, booking_type, booking_type_id, booking_session_id, status, customer_id,
             customer_name_snapshot, customer_email_snapshot, customer_phone_snapshot, guest_count,
             booking_date, start_time, end_time, assigned_area_id, notes, event_type, created_at, updated_at)
         VALUES
            (:venue_id, :reference, "event", :booking_type_id, :booking_session_id, :status, :customer_id,
             :customer_name, :customer_email, :customer_phone, :guest_count, :booking_date,
             :start_time, :end_time, :assigned_area_id, :notes, :event_type, NOW(), NOW())'
    );
    $stmt->execute([
        'venue_id' => $venueId,
        'reference' => $reference,
        'booking_type_id' => $bookingTypeId,
        'booking_session_id' => $sessionId,
        'status' => $status,
        'customer_id' => $customerId,
        'customer_name' => $name,
        'customer_email' => $email,
        'customer_phone' => $phone,
        'guest_count' => $guestCount,
        'booking_date' => $session['date'],
        'start_time' => $session['start_time'],
        'end_time' => $bookingEndTime,
        'assigned_area_id' => $tableRecommendation['area_id'] ?? null,
        'notes' => $notes,
        'event_type' => $type['name'],
    ]);

    $bookingId = (int) db()->lastInsertId();
    if ($tableRecommendation !== null) {
        attach_tables_to_booking($bookingId, $tableRecommendation['table_ids']);
        log_ai_assignment($bookingId, $tableRecommendation, null, false);
    }
    save_booking_custom_answers($bookingId, $customAnswers);

    $statusLabel = $status === 'waitlist' ? 'on the waitlist' : ($status === 'pending' ? 'received' : 'confirmed');
    create_email_log(
        $bookingId,
        $email,
        "{$type['name']} booking {$reference} {$statusLabel}",
        "Hi {$name}, your {$type['name']} booking for {$guestCount} guests on {$session['date']} at {$session['start_time']} is {$statusLabel}. Your reference is {$reference}."
    );
    log_activity(null, 'created', 'event_booking', $bookingId, ['reference' => $reference, 'booking_type_id' => $bookingTypeId]);

    return [
        'id' => $bookingId,
        'booking_reference' => $reference,
        'status' => $status,
        'booking_type_name' => $type['name'],
        'message' => 'Event booking received and acknowledgement email logged.',
    ];
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

    $stmt = db()->prepare(
        'SELECT block_date, created_by_user_id, created_at, updated_at
         FROM online_booking_blocks
         WHERE venue_id = :venue_id
         ORDER BY block_date ASC'
    );
    $stmt->execute(['venue_id' => current_venue_id()]);

    return $stmt->fetchAll();
}

function online_booking_block_dates(): array
{
    return array_map(static fn (array $row) => (string) $row['block_date'], fetch_online_booking_blocks());
}

function online_booking_blocked(string $date): bool
{
    validate_date_value($date);
    ensure_online_booking_blocks_table();

    return scalar_query('SELECT COUNT(*) FROM online_booking_blocks WHERE venue_id = ? AND block_date = ?', [current_venue_id(), $date]) > 0;
}

function require_online_booking_date_available(string $date): void
{
    if (online_booking_blocked($date)) {
        fail('Online bookings are turned off for this date.', 403, ['date' => $date]);
    }
}

function find_or_create_customer(array $data): int
{
    $venueId = current_venue_id();
    $email = strtolower(clean_string($data['email']));
    $name = clean_string($data['name']);
    $phone = clean_string($data['phone']);

    $stmt = db()->prepare('SELECT id FROM customers WHERE venue_id = :venue_id AND email = :email LIMIT 1');
    $stmt->execute(['venue_id' => $venueId, 'email' => $email]);
    $existingId = $stmt->fetchColumn();

    if ($existingId !== false) {
        return (int) $existingId;
    }

    $insert = db()->prepare('INSERT INTO customers (venue_id, name, email, phone, created_at, updated_at) VALUES (:venue_id, :name, :email, :phone, NOW(), NOW())');
    $insert->execute(['venue_id' => $venueId, 'name' => $name, 'email' => $email, 'phone' => $phone]);

    return (int) db()->lastInsertId();
}

function log_activity(?int $userId, string $action, string $entityType, ?int $entityId, array $details = []): void
{
    $stmt = db()->prepare(
        'INSERT INTO activity_logs (venue_id, user_id, action, entity_type, entity_id, details_json, created_at)
         VALUES (:venue_id, :user_id, :action, :entity_type, :entity_id, :details_json, NOW())'
    );
    $stmt->execute([
        'venue_id' => current_venue_id(),
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
        'INSERT INTO email_logs (venue_id, booking_id, recipient_email, subject, body, status, created_at)
         VALUES (:venue_id, :booking_id, :recipient_email, :subject, :body, "logged", NOW())'
    );
    $stmt->execute([
        'venue_id' => current_venue_id(),
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
    $venueName = venue_display_name();
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

    $body = "Hi {$name}, your {$eventType} function booking at {$venueName} is {$statusLabel}. " .
        "Reference: {$reference}. Date: {$date}. Time: {$startTime} - {$endTime}. " .
        "Guests: {$guestCount}. Area(s): {$areas}.";

    if ($managerMessage !== '') {
        $body .= "\n\nMessage from the manager: {$managerMessage}";
    }

    create_email_log(
        (int) $booking['id'],
        (string) $booking['customer_email'],
        "{$venueName} function booking {$reference} {$statusLabel}",
        $body
    );
}

function booking_reply_area_label(array $booking): string
{
    if ((string) ($booking['booking_type'] ?? '') === 'event') {
        return (string) ($booking['booking_type_name'] ?? $booking['event_type'] ?? 'the event');
    }

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
    $venueName = venue_display_name();
    $eventType = (string) ($booking['event_type'] ?? '');
    $bookingType = (string) ($booking['booking_type'] ?? 'table');
    $lines = [
        "Write a warm, concise customer email for {$venueName}.",
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
    if (!empty($booking['custom_answers_summary'])) {
        $lines[] = 'Custom answers: ' . str_replace("\n", '; ', (string) $booking['custom_answers_summary']);
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
    $venueName = venue_display_name();
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
    $kind = match ($bookingType) {
        'function' => $eventType !== '' ? strtolower($eventType) . ' function' : 'function',
        'event' => clean_string($booking['booking_type_name'] ?? '') !== ''
            ? strtolower((string) $booking['booking_type_name'])
            : ($eventType !== '' ? strtolower($eventType) : 'event booking'),
        default => 'table booking',
    };

    $subject = match ($purpose) {
        'decline' => "{$venueName} booking {$reference} update",
        'request_info' => "A quick question about your {$venueName} booking {$reference}",
        'update' => "{$venueName} booking {$reference} update",
        default => "{$venueName} booking {$reference} confirmation",
    };

    $opening = match ($purpose) {
        'decline' => "Thanks for your {$kind} enquiry. Unfortunately, we are unable to accommodate this booking as requested.",
        'request_info' => "Thanks for your {$kind} enquiry. We just need a little more information before we can finalise it.",
        'update' => "I am writing with an update for your {$kind} at {$venueName}.",
        default => "Your {$kind} at {$venueName} is {$status}.",
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
    $body .= ($bookingType === 'table' ? 'Table/area: ' : ($bookingType === 'event' ? 'Event: ' : 'Area(s): ')) . "{$area}\n";
    $body .= "\nKind regards,\n{$venueName}";

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
         WHERE b.venue_id = :venue_id
           AND b.booking_date = :booking_date
           AND b.status NOT IN ("cancelled", "no_show", "declined", "waitlist")
           AND b.start_time < :end_time
           AND b.end_time > :start_time';
    $params = [
        'venue_id' => current_venue_id(),
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
            SELECT b.assigned_area_id AS area_id, b.id, b.venue_id, b.booking_type, b.status, b.booking_date, b.start_time, b.end_time
            FROM bookings b
            WHERE b.assigned_area_id IS NOT NULL
            UNION ALL
            SELECT bfa.area_id AS area_id, b.id, b.venue_id, b.booking_type, b.status, b.booking_date, b.start_time, b.end_time
            FROM booking_function_areas bfa
            JOIN bookings b ON b.id = bfa.booking_id
         ) function_areas
         WHERE venue_id = :venue_id
           AND booking_type = "function"
           AND status IN ("approved", "confirmed")
           AND booking_date = :booking_date
           AND start_time < :end_time
           AND end_time > :start_time';
    $params = [
        'venue_id' => current_venue_id(),
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

function blocked_event_area_ids(string $date, string $startTime, string $endTime, ?int $excludeSessionId = null): array
{
    $stmt = db()->prepare(
        'SELECT id, reserved_area_ids_json
         FROM booking_sessions
         WHERE venue_id = :venue_id
           AND date = :booking_date
           AND status = "active"
           AND reserved_area_ids_json IS NOT NULL
           AND start_time < :end_time
           AND end_time > :start_time'
    );
    $stmt->execute([
        'venue_id' => current_venue_id(),
        'booking_date' => $date,
        'start_time' => $startTime,
        'end_time' => $endTime,
    ]);

    $areaIds = [];
    foreach ($stmt->fetchAll() as $session) {
        if ($excludeSessionId !== null && (int) $session['id'] === $excludeSessionId) {
            continue;
        }

        foreach (decode_json_int_list($session['reserved_area_ids_json'] ?? null) as $areaId) {
            if (!in_array($areaId, $areaIds, true)) {
                $areaIds[] = $areaId;
            }
        }
    }

    return $areaIds;
}

function event_reserved_area_ids_for_booking(array $booking): array
{
    $sessionId = nullable_int($booking['booking_session_id'] ?? null);
    if ($sessionId === null) {
        return [];
    }

    $stmt = db()->prepare('SELECT reserved_area_ids_json FROM booking_sessions WHERE id = :id AND venue_id = :venue_id LIMIT 1');
    $stmt->execute(['id' => $sessionId, 'venue_id' => current_venue_id()]);

    return decode_json_int_list($stmt->fetchColumn() ?: null);
}

function active_areas(bool $functionOnly = false): array
{
    $sql = 'SELECT id, code, name, function_enabled, auto_assign_enabled, allow_table_joins,
                   max_joined_tables, assignment_priority, preferred_min_guests, preferred_max_guests
            FROM areas
            WHERE venue_id = :venue_id AND active = 1';
    if ($functionOnly) {
        $sql .= ' AND function_enabled = 1';
    }
    $sql .= ' ORDER BY sort_order, id';

    $stmt = db()->prepare($sql);
    $stmt->execute(['venue_id' => current_venue_id()]);

    return $stmt->fetchAll();
}

function get_area_tables(int $areaId): array
{
    $stmt = db()->prepare(
        'SELECT id, area_id, table_number, capacity, active, auto_assign_enabled, joinable,
                assignment_priority, preferred_min_guests, preferred_max_guests,
                keep_for_walkins, accessibility_friendly
         FROM venue_tables
         WHERE venue_id = :venue_id AND area_id = :area_id AND active = 1
         ORDER BY table_number'
    );
    $stmt->execute(['venue_id' => current_venue_id(), 'area_id' => $areaId]);

    return $stmt->fetchAll();
}

function auto_assignment_settings(): array
{
    return [
        'enabled' => setting_enabled('auto_assignment_enabled', true),
        'ranking_style' => 'general_learning',
    ];
}

function table_gap_count(array $tables): int
{
    if (count($tables) <= 1) {
        return 0;
    }

    $numbers = array_map(static fn (array $table): int => (int) $table['table_number'], $tables);
    sort($numbers);

    return max($numbers) - min($numbers) + 1 - count($numbers);
}

function assignment_db_bool(array $row, string $key, bool $fallback = true): bool
{
    if (!array_key_exists($key, $row) || $row[$key] === null) {
        return $fallback;
    }

    return (int) $row[$key] === 1;
}

function assignment_nullable_int(array $row, string $key): ?int
{
    if (!array_key_exists($key, $row) || $row[$key] === null || $row[$key] === '') {
        return null;
    }

    return (int) $row[$key];
}

function assignment_preference_penalty(?int $minGuests, ?int $maxGuests, int $guestCount, int $weight): int
{
    if ($minGuests !== null && $guestCount < $minGuests) {
        return ($minGuests - $guestCount) * $weight;
    }

    if ($maxGuests !== null && $guestCount > $maxGuests) {
        return ($guestCount - $maxGuests) * $weight;
    }

    return 0;
}

function table_assignment_score(
    array $tables,
    int $guestCount,
    ?int $preferredAreaId,
    array $area,
    array $settings,
    ?array $joinGroup = null
): array
{
    $capacity = array_sum(array_map(static fn (array $table): int => (int) $table['capacity'], $tables));
    $waste = max($capacity - $guestCount, 0);
    $tableCount = count($tables);
    $gaps = table_gap_count($tables);
    $areaId = (int) $area['id'];

    $weights = ['waste' => 5, 'tables' => 36, 'gaps' => 10];
    $gapWeight = $weights['gaps'];
    $preferredBonus = $preferredAreaId !== null && $preferredAreaId === $areaId ? 40 : 0;
    $areaPriority = (int) ($area['assignment_priority'] ?? 0);
    $joinGroupPriority = $joinGroup !== null ? (int) ($joinGroup['priority'] ?? 0) : 0;
    $tablePriority = array_sum(array_map(static fn (array $table): int => (int) ($table['assignment_priority'] ?? 0), $tables));
    $preferencePenalty = assignment_preference_penalty(
        assignment_nullable_int($area, 'preferred_min_guests'),
        assignment_nullable_int($area, 'preferred_max_guests'),
        $guestCount,
        8
    );

    foreach ($tables as $table) {
        $preferencePenalty += assignment_preference_penalty(
            assignment_nullable_int($table, 'preferred_min_guests'),
            assignment_nullable_int($table, 'preferred_max_guests'),
            $guestCount,
            6
        );
    }

    $score = ($waste * $weights['waste'])
        + (($tableCount - 1) * $weights['tables'])
        + ($gaps * $gapWeight)
        + ($areaPriority * 4)
        + ($joinGroupPriority * 2)
        + ($tablePriority * 2)
        + $preferencePenalty
        - $preferredBonus;

    return [
        'score' => $score,
        'capacity' => $capacity,
        'waste' => $waste,
        'table_count' => $tableCount,
        'gap_count' => $gaps,
        'area_priority' => $areaPriority,
        'join_group_priority' => $joinGroupPriority,
        'table_priority' => $tablePriority,
        'preference_penalty' => $preferencePenalty,
    ];
}

function assignment_join_groups_for_area(int $areaId): array
{
    $stmt = db()->prepare(
        'SELECT g.id AS group_id, g.area_id, g.name, g.max_tables, g.active, g.priority,
                vt.id AS table_id, vt.table_number, vt.capacity, vt.active AS table_active,
                vt.auto_assign_enabled, vt.joinable, vt.assignment_priority,
                vt.preferred_min_guests, vt.preferred_max_guests,
                vt.keep_for_walkins, vt.accessibility_friendly
         FROM table_join_groups g
         JOIN table_join_group_tables jgt ON jgt.join_group_id = g.id
         JOIN venue_tables vt ON vt.id = jgt.table_id
         WHERE g.venue_id = :group_venue_id
           AND vt.venue_id = :table_venue_id
           AND g.area_id = :area_id
           AND g.active = 1
           AND vt.active = 1
         ORDER BY g.priority, g.id, vt.table_number'
    );
    $venueId = current_venue_id();
    $stmt->execute(['group_venue_id' => $venueId, 'table_venue_id' => $venueId, 'area_id' => $areaId]);
    $groups = [];

    foreach ($stmt->fetchAll() as $row) {
        $groupId = (int) $row['group_id'];
        if (!isset($groups[$groupId])) {
            $groups[$groupId] = [
                'id' => $groupId,
                'area_id' => (int) $row['area_id'],
                'name' => (string) $row['name'],
                'max_tables' => $row['max_tables'] === null ? null : (int) $row['max_tables'],
                'active' => (int) $row['active'],
                'priority' => (int) $row['priority'],
                'tables' => [],
            ];
        }

        $groups[$groupId]['tables'][] = [
            'id' => (int) $row['table_id'],
            'area_id' => (int) $row['area_id'],
            'table_number' => (int) $row['table_number'],
            'capacity' => (int) $row['capacity'],
            'active' => (int) $row['table_active'],
            'auto_assign_enabled' => (int) $row['auto_assign_enabled'],
            'joinable' => (int) $row['joinable'],
            'assignment_priority' => (int) $row['assignment_priority'],
            'preferred_min_guests' => $row['preferred_min_guests'] === null ? null : (int) $row['preferred_min_guests'],
            'preferred_max_guests' => $row['preferred_max_guests'] === null ? null : (int) $row['preferred_max_guests'],
            'keep_for_walkins' => (int) $row['keep_for_walkins'],
            'accessibility_friendly' => (int) $row['accessibility_friendly'],
        ];
    }

    return array_values($groups);
}

function assignment_max_joined_tables(array $area): int
{
    $areaMax = assignment_nullable_int($area, 'max_joined_tables') ?? 12;

    return min(max($areaMax, 1), 12);
}

function assignment_table_key(array $tableNumbers): string
{
    $numbers = array_map('intval', $tableNumbers);
    sort($numbers);

    return json_encode($numbers, JSON_UNESCAPED_SLASHES);
}

function assignment_history_profile(int $guestCount, string $startTime): array
{
    $venueId = current_venue_id();
    $guestMin = max($guestCount - 2, 1);
    $guestMax = $guestCount + 2;
    $startHour = (int) substr($startTime, 0, 2);
    $hourMin = max($startHour - 2, 0);
    $hourMax = min($startHour + 2, 23);

    $profile = [
        'exact_seen' => [],
        'exact_selected' => [],
        'exact_final' => [],
        'area_seen' => [],
        'area_selected' => [],
        'sample_count' => 0,
    ];

    $candidateStmt = db()->prepare(
        'SELECT c.area_id, c.table_numbers_json, c.selected
         FROM ai_assignment_candidates c
         JOIN bookings b ON b.id = c.booking_id
         WHERE c.venue_id = :candidate_venue_id
           AND b.venue_id = :booking_venue_id
           AND b.guest_count BETWEEN :guest_min AND :guest_max
           AND HOUR(b.start_time) BETWEEN :hour_min AND :hour_max
           AND b.status NOT IN ("cancelled", "declined", "no_show")
         ORDER BY c.id DESC
         LIMIT 800'
    );
    $candidateStmt->execute([
        'candidate_venue_id' => $venueId,
        'booking_venue_id' => $venueId,
        'guest_min' => $guestMin,
        'guest_max' => $guestMax,
        'hour_min' => $hourMin,
        'hour_max' => $hourMax,
    ]);

    foreach ($candidateStmt->fetchAll() as $row) {
        $tableKey = (string) $row['table_numbers_json'];
        $areaKey = $row['area_id'] === null ? '' : (string) (int) $row['area_id'];
        $selected = (int) $row['selected'] === 1;
        $profile['sample_count']++;
        $profile['exact_seen'][$tableKey] = ($profile['exact_seen'][$tableKey] ?? 0) + 1;
        if ($areaKey !== '') {
            $profile['area_seen'][$areaKey] = ($profile['area_seen'][$areaKey] ?? 0) + 1;
        }
        if ($selected) {
            $profile['exact_selected'][$tableKey] = ($profile['exact_selected'][$tableKey] ?? 0) + 1;
            if ($areaKey !== '') {
                $profile['area_selected'][$areaKey] = ($profile['area_selected'][$areaKey] ?? 0) + 1;
            }
        }
    }

    $finalStmt = db()->prepare(
        'SELECT l.final_table_numbers_json
         FROM ai_assignment_logs l
         JOIN bookings b ON b.id = l.booking_id
         WHERE l.venue_id = :log_venue_id
           AND b.venue_id = :booking_venue_id
           AND b.guest_count BETWEEN :guest_min AND :guest_max
           AND HOUR(b.start_time) BETWEEN :hour_min AND :hour_max
           AND b.status NOT IN ("cancelled", "declined", "no_show")
         ORDER BY l.id DESC
         LIMIT 400'
    );
    $finalStmt->execute([
        'log_venue_id' => $venueId,
        'booking_venue_id' => $venueId,
        'guest_min' => $guestMin,
        'guest_max' => $guestMax,
        'hour_min' => $hourMin,
        'hour_max' => $hourMax,
    ]);

    foreach ($finalStmt->fetchAll() as $row) {
        $tableKey = (string) $row['final_table_numbers_json'];
        $profile['exact_final'][$tableKey] = ($profile['exact_final'][$tableKey] ?? 0) + 1;
    }

    return $profile;
}

function apply_assignment_learning(array $candidates, array $history): array
{
    if ($candidates === []) {
        return [];
    }

    foreach ($candidates as &$candidate) {
        $tableKey = assignment_table_key($candidate['table_numbers'] ?? []);
        $areaKey = isset($candidate['area_id']) ? (string) (int) $candidate['area_id'] : '';
        $exactSeen = (int) ($history['exact_seen'][$tableKey] ?? 0);
        $exactSelected = (int) ($history['exact_selected'][$tableKey] ?? 0);
        $exactFinal = (int) ($history['exact_final'][$tableKey] ?? 0);
        $areaSeen = $areaKey !== '' ? (int) ($history['area_seen'][$areaKey] ?? 0) : 0;
        $areaSelected = $areaKey !== '' ? (int) ($history['area_selected'][$areaKey] ?? 0) : 0;
        $adjustment = 0.0;

        if ($exactFinal > 0) {
            $adjustment -= min(18, $exactFinal * 3);
        }

        if ($exactSeen >= 3) {
            $exactRate = $exactSelected / max($exactSeen, 1);
            $adjustment -= min(16, $exactSelected * 4);
            if ($exactRate < 0.2) {
                $adjustment += min(14, ($exactSeen - $exactSelected) * 2);
            }
        }

        if ($areaSeen >= 5) {
            $areaRate = $areaSelected / max($areaSeen, 1);
            $adjustment -= min(8, $areaSelected);
            if ($areaRate < 0.15) {
                $adjustment += min(8, $areaSeen - $areaSelected);
            }
        }

        $candidate['learning_adjustment'] = $adjustment;
        $candidate['score'] = (float) $candidate['score'] + $adjustment;
        $candidate['score_details']['learning_adjustment'] = $adjustment;
        $candidate['score_details']['history'] = [
            'exact_seen' => $exactSeen,
            'exact_selected' => $exactSelected,
            'exact_final' => $exactFinal,
            'area_seen' => $areaSeen,
            'area_selected' => $areaSelected,
            'sample_count' => (int) ($history['sample_count'] ?? 0),
        ];
    }
    unset($candidate);

    return $candidates;
}

function assignment_candidates_for_area(
    array $area,
    int $guestCount,
    array $unavailableIds,
    ?int $preferredAreaId,
    array $settings
): array {
    if (!assignment_db_bool($area, 'auto_assign_enabled', true)) {
        return [];
    }

    $areaId = (int) $area['id'];
    $available = array_values(array_filter(
        get_area_tables($areaId),
        static fn (array $table): bool =>
            assignment_db_bool($table, 'active', true)
            && assignment_db_bool($table, 'auto_assign_enabled', true)
            && !assignment_db_bool($table, 'keep_for_walkins', false)
            && !in_array((int) $table['id'], $unavailableIds, true)
    ));

    if ($available === []) {
        return [];
    }

    usort($available, static function (array $left, array $right): int {
        return [(int) $left['capacity'], (int) $left['table_number']] <=> [(int) $right['capacity'], (int) $right['table_number']];
    });

    $candidates = [];
    $seen = [];
    $addCandidate = function (array $tables, string $source, ?array $joinGroup = null) use (
        &$candidates,
        &$seen,
        $area,
        $guestCount,
        $preferredAreaId,
        $settings
    ): void {
        if ($tables === []) {
            return;
        }

        usort($tables, static fn (array $left, array $right): int => (int) $left['table_number'] <=> (int) $right['table_number']);
        $tableIds = array_map(static fn (array $table): int => (int) $table['id'], $tables);
        sort($tableIds);
        $key = implode('-', $tableIds);
        if (isset($seen[$key])) {
            return;
        }

        $score = table_assignment_score($tables, $guestCount, $preferredAreaId, $area, $settings, $joinGroup);
        if ($score['capacity'] < $guestCount) {
            return;
        }

        $seen[$key] = true;
        $numbers = array_map(static fn (array $table): int => (int) $table['table_number'], $tables);
        $candidates[] = [
            'area_id' => (int) $area['id'],
            'area_name' => (string) $area['name'],
            'tables' => $tables,
            'table_ids' => $tableIds,
            'table_numbers' => $numbers,
            'capacity' => $score['capacity'],
            'score' => $score['score'],
            'score_details' => $score,
            'source' => $source,
            'join_group_id' => $joinGroup['id'] ?? null,
            'join_group_name' => $joinGroup['name'] ?? null,
        ];
    };

    foreach ($available as $table) {
        if ((int) $table['capacity'] >= $guestCount) {
            $addCandidate([$table], 'single');
        }
    }

    if (!assignment_db_bool($area, 'allow_table_joins', true)) {
        return $candidates;
    }

    $joinableTables = array_values(array_filter(
        $available,
        static fn (array $table): bool => assignment_db_bool($table, 'joinable', true)
    ));
    if (count($joinableTables) < 2) {
        return $candidates;
    }

    usort($joinableTables, static fn (array $left, array $right): int => (int) $left['table_number'] <=> (int) $right['table_number']);
    $maxTableCount = min(assignment_max_joined_tables($area), count($joinableTables));

    for ($startIndex = 0; $startIndex < count($joinableTables); $startIndex++) {
        $combo = [];
        $previousNumber = null;

        for ($index = $startIndex; $index < count($joinableTables) && count($combo) < $maxTableCount; $index++) {
            $table = $joinableTables[$index];
            $tableNumber = (int) $table['table_number'];
            if ($previousNumber !== null && $tableNumber !== $previousNumber + 1) {
                break;
            }

            $combo[] = $table;
            $previousNumber = $tableNumber;

            if (count($combo) >= 2) {
                $addCandidate($combo, 'adjacent_tables');
            }
        }
    }

    return $candidates;
}

function compare_assignment_candidates(array $left, array $right): int
{
    $leftScore = $left['score_details'];
    $rightScore = $right['score_details'];

    return [
        (float) $left['score'],
        (int) $leftScore['table_count'],
        (int) $leftScore['waste'],
        (int) $leftScore['gap_count'],
        (int) $left['capacity'],
    ] <=> [
        (float) $right['score'],
        (int) $rightScore['table_count'],
        (int) $rightScore['waste'],
        (int) $rightScore['gap_count'],
        (int) $right['capacity'],
    ];
}

function recommend_tables(
    int $guestCount,
    string $date,
    string $startTime,
    string $endTime,
    ?int $preferredAreaId,
    ?int $excludeBookingId = null,
    array $allowedAreaIds = [],
    ?int $excludeEventSessionId = null
): array
{
    $settings = auto_assignment_settings();
    if (!$settings['enabled']) {
        fail('Automatic table assignment is turned off.', 422);
    }

    $allowedAreaIds = normalized_area_ids($allowedAreaIds);
    $unavailableIds = overlapping_table_ids($date, $startTime, $endTime, $excludeBookingId);
    $blockedAreaIds = array_values(array_unique(array_merge(
        blocked_function_area_ids($date, $startTime, $endTime, $excludeBookingId),
        blocked_event_area_ids($date, $startTime, $endTime, $excludeEventSessionId)
    )));
    $areas = active_areas(false);
    if ($allowedAreaIds !== []) {
        $areas = array_values(array_filter(
            $areas,
            static fn (array $area): bool => in_array((int) $area['id'], $allowedAreaIds, true)
        ));
    }

    $durationMinutes = max(minutes_from_time(substr($endTime, 0, 5)) - minutes_from_time(substr($startTime, 0, 5)), 0);
    $candidates = [];
    foreach ($areas as $area) {
        $areaId = (int) $area['id'];
        if (in_array($areaId, $blockedAreaIds, true)) {
            continue;
        }

        $candidates = array_merge(
            $candidates,
            assignment_candidates_for_area($area, $guestCount, $unavailableIds, $preferredAreaId, $settings)
        );
    }

    if ($candidates !== []) {
        $candidates = apply_assignment_learning($candidates, assignment_history_profile($guestCount, $startTime));
        usort($candidates, 'compare_assignment_candidates');
        $best = $candidates[0];
        $score = $best['score_details'];
        $preferredText = $preferredAreaId !== null && $preferredAreaId === (int) $best['area_id']
            ? ' The customer preferred this area.'
            : '';
        $sourceText = match ($best['source']) {
            'adjacent_tables' => ' using adjacent tables',
            'join_group' => $best['join_group_name'] ? ' from ' . $best['join_group_name'] : '',
            default => '',
        };

        return [
            'area_id' => (int) $best['area_id'],
            'area_name' => (string) $best['area_name'],
            'table_ids' => $best['table_ids'],
            'table_numbers' => $best['table_numbers'],
            'capacity' => (int) $best['capacity'],
            'explanation' => 'Recommended ' . $best['area_name'] . ' table(s) ' . implode(', ', $best['table_numbers']) .
                "{$sourceText} because they cover {$guestCount} guests with {$score['waste']} spare seat(s)." . $preferredText,
            'rules_snapshot' => [
                'guest_count' => $guestCount,
                'preferred_area_id' => $preferredAreaId,
                'duration_minutes' => $durationMinutes,
                'ranking_style' => $settings['ranking_style'],
                'auto_assignment_score' => $score['score'],
                'wasted_seats' => $score['waste'],
                'table_count' => $score['table_count'],
                'gap_count' => $score['gap_count'],
                'source' => $best['source'],
                'join_group_id' => $best['join_group_id'],
                'join_group_name' => $best['join_group_name'],
                'allowed_area_ids' => $allowedAreaIds,
                'blocked_area_ids' => $blockedAreaIds,
                'candidate_count' => count($candidates),
            ],
            'candidates' => array_slice($candidates, 0, 20),
        ];
    }

    fail('No suitable tables are available for that booking window.', 409);
}

function manual_table_assignment(
    array $tableIds,
    int $guestCount,
    string $date,
    string $startTime,
    string $endTime,
    ?int $excludeBookingId = null,
    array $allowedAreaIds = [],
    ?int $excludeEventSessionId = null
): array
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
         WHERE vt.venue_id = ?
           AND a.venue_id = vt.venue_id
           AND a.active = 1
           AND vt.id IN ({$placeholders})
         ORDER BY vt.table_number"
    );
    $stmt->execute(array_merge([current_venue_id()], $tableIds));
    $tables = $stmt->fetchAll();

    if (count($tables) !== count($tableIds)) {
        fail('One or more selected tables are unavailable.', 422);
    }

    $areaIds = array_values(array_unique(array_map(fn (array $table) => (int) $table['area_id'], $tables)));
    if (count($areaIds) !== 1) {
        fail('Selected tables must be in one area.', 422);
    }

    $areaId = $areaIds[0];
    $allowedAreaIds = normalized_area_ids($allowedAreaIds);
    if ($allowedAreaIds !== [] && !in_array($areaId, $allowedAreaIds, true)) {
        fail('Selected tables must be inside the reserved event area.', 422);
    }

    $blockedAreaIds = array_values(array_unique(array_merge(
        blocked_function_area_ids($date, $startTime, $endTime, $excludeBookingId),
        blocked_event_area_ids($date, $startTime, $endTime, $excludeEventSessionId)
    )));
    if (in_array($areaId, $blockedAreaIds, true)) {
        fail('That area is blocked during the selected time.', 409);
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
    $stmt = db()->prepare("SELECT id FROM areas WHERE venue_id = ? AND active = 1 AND function_enabled = 1 AND id IN ({$placeholders})");
    $stmt->execute(array_merge([current_venue_id()], $areaIds));
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
    $stmt = db()->prepare("SELECT name FROM areas WHERE venue_id = ? AND id IN ({$placeholders}) ORDER BY sort_order, id");
    $stmt->execute(array_merge([current_venue_id()], $clashingAreaIds));
    $areaNames = array_column($stmt->fetchAll(), 'name');

    fail('One or more selected function areas already have an approved function at that time.', 409, [
        'area_ids' => $clashingAreaIds,
        'areas' => $areaNames,
    ]);
}

function log_ai_assignment(int $bookingId, array $recommendation, ?int $acceptedByUserId, bool $overridden = false): void
{
    $venueId = current_venue_id();
    $stmt = db()->prepare(
        'INSERT INTO ai_assignment_logs
            (venue_id, booking_id, suggested_area_id, suggested_table_numbers_json, explanation, rules_snapshot_json,
             accepted_by_user_id, accepted_at, final_table_numbers_json, overridden, created_at)
         VALUES
            (:venue_id, :booking_id, :suggested_area_id, :suggested_table_numbers_json, :explanation, :rules_snapshot_json,
             :accepted_by_user_id, NOW(), :final_table_numbers_json, :overridden, NOW())'
    );
    $stmt->execute([
        'venue_id' => $venueId,
        'booking_id' => $bookingId,
        'suggested_area_id' => $recommendation['area_id'] ?? null,
        'suggested_table_numbers_json' => json_encode($recommendation['table_numbers'] ?? [], JSON_UNESCAPED_SLASHES),
        'explanation' => $recommendation['explanation'] ?? 'Manager override recorded.',
        'rules_snapshot_json' => json_encode($recommendation['rules_snapshot'] ?? [], JSON_UNESCAPED_SLASHES),
        'accepted_by_user_id' => $acceptedByUserId,
        'final_table_numbers_json' => json_encode($recommendation['table_numbers'] ?? [], JSON_UNESCAPED_SLASHES),
        'overridden' => $overridden ? 1 : 0,
    ]);

    $assignmentLogId = (int) db()->lastInsertId();
    $candidates = $recommendation['candidates'] ?? [];
    if (!is_array($candidates) || $candidates === []) {
        return;
    }

    $selectedTableIds = array_map('intval', $recommendation['table_ids'] ?? []);
    sort($selectedTableIds);
    $insertCandidate = db()->prepare(
        'INSERT INTO ai_assignment_candidates
            (venue_id, assignment_log_id, booking_id, candidate_rank, area_id, table_ids_json, table_numbers_json,
             capacity, score, selected, feature_snapshot_json, created_at)
         VALUES
            (:venue_id, :assignment_log_id, :booking_id, :candidate_rank, :area_id, :table_ids_json, :table_numbers_json,
             :capacity, :score, :selected, :feature_snapshot_json, NOW())'
    );

    foreach (array_values($candidates) as $index => $candidate) {
        if (!is_array($candidate)) {
            continue;
        }

        $candidateTableIds = array_map('intval', $candidate['table_ids'] ?? []);
        sort($candidateTableIds);
        $features = [
            'source' => $candidate['source'] ?? null,
            'area_name' => $candidate['area_name'] ?? null,
            'join_group_id' => $candidate['join_group_id'] ?? null,
            'join_group_name' => $candidate['join_group_name'] ?? null,
            'score_details' => $candidate['score_details'] ?? [],
        ];

        $insertCandidate->execute([
            'venue_id' => $venueId,
            'assignment_log_id' => $assignmentLogId,
            'booking_id' => $bookingId,
            'candidate_rank' => $index + 1,
            'area_id' => $candidate['area_id'] ?? null,
            'table_ids_json' => json_encode($candidate['table_ids'] ?? [], JSON_UNESCAPED_SLASHES),
            'table_numbers_json' => json_encode($candidate['table_numbers'] ?? [], JSON_UNESCAPED_SLASHES),
            'capacity' => (int) ($candidate['capacity'] ?? 0),
            'score' => (float) ($candidate['score'] ?? 0),
            'selected' => $candidateTableIds === $selectedTableIds ? 1 : 0,
            'feature_snapshot_json' => json_encode($features, JSON_UNESCAPED_SLASHES),
        ]);
    }
}

function create_table_booking(array $data, ?array $manager = null): array
{
    require_fields($data, ['name', 'email', 'phone', 'date', 'time', 'guest_count']);

    $venueId = current_venue_id($manager);
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
    $requestedBookingTypeId = nullable_int($data['booking_type_id'] ?? null);
    $requestedBookingType = $manager === null
        ? public_booking_type_for_category($requestedBookingTypeId, 'dining')
        : null;
    $minGuests = $requestedBookingType ? (int) $requestedBookingType['min_guests'] : (int) setting('min_table_guests', '8');
    $maxGuests = $requestedBookingType ? nullable_int($requestedBookingType['max_guests'] ?? null) : (int) setting('max_table_guests', '29');

    validate_email_address($email);
    validate_phone_number($phone);

    if ($manager === null) {
        require_online_booking_date_available($date);
    }

    if ($guestCount < $minGuests) {
        fail("Online bookings are for groups of {$minGuests} or more. Smaller groups are welcome to walk in.", 422);
    }

    if ($maxGuests !== null && $guestCount > $maxGuests) {
        if ($requestedBookingType) {
            fail("{$requestedBookingType['name']} accepts up to {$maxGuests} guests.", 422);
        }
        fail("Groups over {$maxGuests} guests should use the function request form.", 422);
    }

    [$startTime, $endTime] = validate_booking_window($date, $time, $durationMinutes, $manager === null);
    if ($requestedBookingType) {
        validate_dining_booking_type_time($requestedBookingType, $startTime);
    }
    $bookingTypeId = $requestedBookingType ? (int) $requestedBookingType['id'] : default_booking_type_id_for_table_time($startTime);
    $recommendation = null;
    if ($manager) {
        $recommendation = manual_table_assignment(normalized_table_ids($data['table_ids'] ?? []), $guestCount, $date, $startTime, $endTime);
    } elseif (setting_enabled('auto_assignment_enabled', true)) {
        $recommendation = recommend_tables($guestCount, $date, $startTime, $endTime, $preferredAreaId);
    }
    $status = $recommendation !== null ? 'confirmed' : 'pending';
    $customerId = find_or_create_customer(['name' => $name, 'email' => $email, 'phone' => $phone]);
    $reference = booking_reference();

    $stmt = db()->prepare(
        'INSERT INTO bookings
            (venue_id, booking_reference, booking_type, booking_type_id, status, customer_id, customer_name_snapshot, customer_email_snapshot,
             customer_phone_snapshot, guest_count, booking_date, start_time, end_time, preferred_area_id,
             assigned_area_id, notes, staff_notes, created_by_user_id, updated_by_user_id, created_at, updated_at)
         VALUES
            (:venue_id, :reference, "table", :booking_type_id, :status, :customer_id, :customer_name, :customer_email, :customer_phone,
             :guest_count, :booking_date, :start_time, :end_time, :preferred_area_id, :assigned_area_id, :notes,
             :staff_notes, :created_by_user_id, :updated_by_user_id, NOW(), NOW())'
    );
    $stmt->execute([
        'venue_id' => $venueId,
        'reference' => $reference,
        'booking_type_id' => $bookingTypeId,
        'status' => $status,
        'customer_id' => $customerId,
        'customer_name' => $name,
        'customer_email' => $email,
        'customer_phone' => $phone,
        'guest_count' => $guestCount,
        'booking_date' => $date,
        'start_time' => $startTime,
        'end_time' => $endTime,
        'preferred_area_id' => $preferredAreaId,
        'assigned_area_id' => $recommendation['area_id'] ?? null,
        'notes' => $notes,
        'staff_notes' => $staffNotes,
        'created_by_user_id' => $manager['id'] ?? null,
        'updated_by_user_id' => $manager['id'] ?? null,
    ]);

    $bookingId = (int) db()->lastInsertId();
    if ($recommendation !== null) {
        attach_tables_to_booking($bookingId, $recommendation['table_ids']);
        log_ai_assignment($bookingId, $recommendation, $manager['id'] ?? null, $manager !== null);
    }

    $venueName = venue_display_name();
    $statusLabel = $status === 'confirmed' ? 'confirmed' : 'received';
    $subject = "{$venueName} booking {$reference} {$statusLabel}";
    $body = $recommendation !== null
        ? "Hi {$name}, your table booking for {$guestCount} guests on {$date} at {$startTime} is confirmed. " .
            "Your table area is {$recommendation['area_name']} and your reference is {$reference}."
        : "Hi {$name}, your table booking for {$guestCount} guests on {$date} at {$startTime} has been received. " .
            "A manager will assign your table before confirmation. Your reference is {$reference}.";
    create_email_log($bookingId, $email, $subject, $body);
    log_activity($manager['id'] ?? null, 'created', 'booking', $bookingId, ['reference' => $reference, 'source' => $manager ? 'manager' : 'public']);

    return [
        'id' => $bookingId,
        'booking_reference' => $reference,
        'status' => $status,
        'assigned_area' => $recommendation['area_name'] ?? 'to be assigned',
        'assigned_tables' => $recommendation['table_numbers'] ?? [],
        'message' => $recommendation !== null
            ? 'Booking confirmed and confirmation email logged.'
            : 'Booking received and acknowledgement email logged.',
    ];
}

function create_function_request(array $data): array
{
    require_fields($data, ['name', 'email', 'phone', 'event_date', 'start_time', 'guest_count']);

    $venueId = current_venue_id();
    $name = clean_string($data['name']);
    $email = strtolower(clean_string($data['email']));
    $phone = clean_string($data['phone']);
    $guestCount = (int) $data['guest_count'];
    $date = clean_string($data['event_date']);
    $time = clean_string($data['start_time']);
    $requestedBookingTypeId = nullable_int($data['booking_type_id'] ?? null);
    $requestedBookingType = public_booking_type_for_category($requestedBookingTypeId, 'function');
    $eventType = clean_string($data['event_type'] ?? ($requestedBookingType['name'] ?? 'Function'));
    $notes = clean_string($data['notes'] ?? '');
    $preferredAreaId = nullable_int($data['preferred_area_id'] ?? null);
    $durationMinutes = max((int) ($data['duration_minutes'] ?? 180), 120);

    validate_email_address($email);
    validate_phone_number($phone);
    require_online_booking_date_available($date);

    $minGuests = $requestedBookingType ? (int) $requestedBookingType['min_guests'] : 8;
    $maxGuests = $requestedBookingType ? nullable_int($requestedBookingType['max_guests'] ?? null) : null;
    if ($guestCount < $minGuests) {
        fail("Function requests must be for at least {$minGuests} guests.", 422);
    }
    if ($maxGuests !== null && $guestCount > $maxGuests) {
        fail("This function type accepts up to {$maxGuests} guests.", 422);
    }

    [$startTime, $endTime] = validate_booking_window($date, $time, $durationMinutes, true);
    $bookingTypeId = $requestedBookingType ? (int) $requestedBookingType['id'] : default_function_booking_type_id();
    $customerId = find_or_create_customer(['name' => $name, 'email' => $email, 'phone' => $phone]);
    $reference = booking_reference();

    $stmt = db()->prepare(
        'INSERT INTO bookings
            (venue_id, booking_reference, booking_type, booking_type_id, status, customer_id, customer_name_snapshot, customer_email_snapshot,
             customer_phone_snapshot, guest_count, booking_date, start_time, end_time, preferred_area_id, notes,
             event_type, created_at, updated_at)
         VALUES
            (:venue_id, :reference, "function", :booking_type_id, "pending", :customer_id, :customer_name, :customer_email, :customer_phone,
             :guest_count, :booking_date, :start_time, :end_time, :preferred_area_id, :notes, :event_type, NOW(), NOW())'
    );
    $stmt->execute([
        'venue_id' => $venueId,
        'reference' => $reference,
        'booking_type_id' => $bookingTypeId,
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
        venue_display_name() . " function request {$reference} received",
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

    $venueId = current_venue_id($manager);
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
    $bookingTypeId = default_function_booking_type_id();

    if (in_array($status, ['approved', 'confirmed'], true)) {
        validate_function_area_assignment($assignedAreaIds, $date, $startTime, $endTime);
    }

    $customerId = find_or_create_customer(['name' => $name, 'email' => $email, 'phone' => $phone]);
    $reference = booking_reference();

    $stmt = db()->prepare(
        'INSERT INTO bookings
            (venue_id, booking_reference, booking_type, booking_type_id, status, customer_id, customer_name_snapshot, customer_email_snapshot,
             customer_phone_snapshot, guest_count, booking_date, start_time, end_time, assigned_area_id, notes,
             staff_notes, event_type, manager_message, created_by_user_id, updated_by_user_id, created_at, updated_at)
         VALUES
            (:venue_id, :reference, "function", :booking_type_id, :status, :customer_id, :customer_name, :customer_email, :customer_phone,
             :guest_count, :booking_date, :start_time, :end_time, :assigned_area_id, :notes, :staff_notes,
             :event_type, :manager_message, :created_by_user_id,
             :updated_by_user_id, NOW(), NOW())'
    );
    $stmt->execute([
        'venue_id' => $venueId,
        'reference' => $reference,
        'booking_type_id' => $bookingTypeId,
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
            venue_display_name() . " function booking {$reference} created",
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
    $typeWhere = $type === null
        ? 'WHERE b.venue_id = :venue_id'
        : 'WHERE b.venue_id = :venue_id AND b.booking_type = :type';

    return
        'SELECT b.*,
                COALESCE(NULLIF(b.customer_name_snapshot, ""), c.name) AS customer_name,
                COALESCE(NULLIF(b.customer_email_snapshot, ""), c.email) AS customer_email,
                COALESCE(NULLIF(b.customer_phone_snapshot, ""), c.phone) AS customer_phone,
                preferred.name AS preferred_area_name, assigned.name AS assigned_area_name,
                btype.name AS booking_type_name, btype.category AS booking_type_category,
                btype.colour AS booking_type_colour, btype.icon AS booking_type_icon,
                bs.date AS booking_session_date, bs.arrival_time AS booking_session_arrival_time,
                bs.reserved_area_ids_json AS event_reserved_area_ids_json,
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
                ) AS table_ids,
                (
                    SELECT GROUP_CONCAT(CONCAT(COALESCE(bcf.label, bca.field_label_snapshot), ": ", bca.answer) ORDER BY bca.id SEPARATOR "\n")
                    FROM booking_custom_answers bca
                    LEFT JOIN booking_custom_fields bcf ON bcf.id = bca.field_id
                    WHERE bca.booking_id = b.id
                ) AS custom_answers_summary
         FROM bookings b
         JOIN customers c ON c.id = b.customer_id
         LEFT JOIN areas preferred ON preferred.id = b.preferred_area_id
         LEFT JOIN areas assigned ON assigned.id = b.assigned_area_id
         LEFT JOIN booking_types btype ON btype.id = b.booking_type_id
         LEFT JOIN booking_sessions bs ON bs.id = b.booking_session_id
         ' . $typeWhere;
}

function normalize_booking_record(array $booking): array
{
    $eventReservedAreaIds = decode_json_int_list($booking['event_reserved_area_ids_json'] ?? null);
    $booking['event_reserved_area_ids'] = $eventReservedAreaIds !== [] ? implode(',', $eventReservedAreaIds) : null;
    $booking['event_reserved_area_names'] = $eventReservedAreaIds !== [] ? area_names_for_ids($eventReservedAreaIds) : null;

    return $booking;
}

function list_bookings(?string $type): void
{
    $manager = require_manager();

    $page = max((int) ($_GET['page'] ?? 1), 1);
    $perPage = min(max((int) ($_GET['per_page'] ?? 50), 5), 100);
    $offset = ($page - 1) * $perPage;
    $params = ['venue_id' => current_venue_id($manager)];
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

    if (!empty($_GET['type']) && in_array($_GET['type'], ['table', 'function', 'event'], true) && $type === null) {
        $where .= ' AND b.booking_type = :booking_type_filter';
        $params['booking_type_filter'] = clean_string($_GET['type']);
    }

    if (!empty($_GET['booking_type_id'])) {
        $where .= ' AND b.booking_type_id = :booking_type_id';
        $params['booking_type_id'] = (int) $_GET['booking_type_id'];
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
         ' . ($type === null ? 'WHERE b.venue_id = :venue_id' : 'WHERE b.venue_id = :venue_id AND b.booking_type = :type') . $where
    );
    $count->execute($params);
    $total = (int) $count->fetchColumn();

    $sql = booking_select_sql($type) . $where . ' ORDER BY b.booking_date ASC, b.start_time ASC LIMIT ' . $perPage . ' OFFSET ' . $offset;
    $stmt = db()->prepare($sql);
    $stmt->execute($params);

    respond([
        'items' => array_map('normalize_booking_record', $stmt->fetchAll()),
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

    $allowedStatuses = ['pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show', 'approved', 'declined', 'waitlist'];
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
    } elseif ((string) $existing['booking_type'] === 'event') {
        $durationMinutes = max(
            minutes_from_time(substr((string) $existing['end_time'], 0, 5)) - minutes_from_time(substr((string) $existing['start_time'], 0, 5)),
            15
        );
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
    $manualTableIds = $hasManualTableIds ? normalized_table_ids($data['table_ids']) : [];
    $manualRecommendation = null;
    $clearManualTables = false;
    if (in_array((string) $existing['booking_type'], ['table', 'event'], true) && $hasManualTableIds) {
        if ($manualTableIds !== []) {
            $isEventBooking = (string) $existing['booking_type'] === 'event';
            $manualRecommendation = manual_table_assignment(
                $manualTableIds,
                $guestCount,
                $bookingDate,
                $startTime,
                $endTime,
                $bookingId,
                $isEventBooking ? event_reserved_area_ids_for_booking($existing) : [],
                $isEventBooking ? nullable_int($existing['booking_session_id'] ?? null) : null
            );
            $assignedAreaId = (int) $manualRecommendation['area_id'];
        } elseif ((string) $existing['booking_type'] === 'event') {
            $assignedAreaId = null;
            $clearManualTables = true;
        }
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
        (string) $existing['booking_type'] === 'event'
        && !in_array($nextStatus, ['pending', 'waitlist', 'cancelled', 'declined', 'no_show'], true)
    ) {
        $existingTableIds = normalized_table_ids(explode(',', (string) ($existing['table_ids'] ?? '')));
        $hasAssignedTables = $manualRecommendation !== null || (!$clearManualTables && $existingTableIds !== []);
        if (!$hasAssignedTables) {
            fail('Event bookings must be assigned to at least one table.', 422);
        }
    }

    if (
        (string) $existing['booking_type'] === 'function'
        && in_array($nextStatus, ['approved', 'confirmed'], true)
    ) {
        validate_function_area_assignment($assignedAreaIds, $bookingDate, $startTime, $endTime, $bookingId);
    }

    $updates = ['updated_by_user_id = :updated_by_user_id', 'updated_at = NOW()'];
    $params = ['id' => $bookingId, 'venue_id' => current_venue_id($manager), 'updated_by_user_id' => $manager['id']];

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
    if (array_key_exists('assigned_area_id', $data) || array_key_exists('assigned_area_ids', $data) || $recommendation !== null || $manualRecommendation !== null || $clearManualTables) {
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

    $stmt = db()->prepare('UPDATE bookings SET ' . implode(', ', $updates) . ' WHERE id = :id AND venue_id = :venue_id');
    $stmt->execute($params);

    if ($recommendation !== null) {
        attach_tables_to_booking($bookingId, $recommendation['table_ids']);
        log_ai_assignment($bookingId, $recommendation, (int) $manager['id'], false);
    } elseif ($manualRecommendation !== null) {
        attach_tables_to_booking($bookingId, $manualRecommendation['table_ids']);
        log_ai_assignment($bookingId, $manualRecommendation, (int) $manager['id'], true);
    } elseif ($clearManualTables) {
        attach_tables_to_booking($bookingId, []);
    }

    if ((string) $existing['booking_type'] === 'function' && (array_key_exists('assigned_area_ids', $data) || array_key_exists('assigned_area_id', $data))) {
        attach_function_areas_to_booking($bookingId, $assignedAreaIds);
    }

    $booking = fetch_booking($bookingId);
    if ($booking && $managerMessage !== '') {
        create_email_log(
            $bookingId,
            $booking['customer_email'],
            venue_display_name() . " booking {$booking['booking_reference']} update",
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
                btype.name AS booking_type_name, btype.category AS booking_type_category,
                btype.colour AS booking_type_colour, btype.icon AS booking_type_icon,
                bs.date AS booking_session_date, bs.arrival_time AS booking_session_arrival_time,
                bs.reserved_area_ids_json AS event_reserved_area_ids_json,
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
                ) AS table_ids,
                (
                    SELECT GROUP_CONCAT(CONCAT(COALESCE(bcf.label, bca.field_label_snapshot), ": ", bca.answer) ORDER BY bca.id SEPARATOR "\n")
                    FROM booking_custom_answers bca
                    LEFT JOIN booking_custom_fields bcf ON bcf.id = bca.field_id
                    WHERE bca.booking_id = b.id
                ) AS custom_answers_summary
         FROM bookings b
         JOIN customers c ON c.id = b.customer_id
         LEFT JOIN areas preferred ON preferred.id = b.preferred_area_id
         LEFT JOIN areas assigned ON assigned.id = b.assigned_area_id
         LEFT JOIN booking_types btype ON btype.id = b.booking_type_id
         LEFT JOIN booking_sessions bs ON bs.id = b.booking_session_id
         WHERE b.id = :id
           AND b.venue_id = :venue_id
         LIMIT 1';
    $stmt = db()->prepare($sql);
    $stmt->execute(['id' => $bookingId, 'venue_id' => current_venue_id()]);
    $booking = $stmt->fetch();

    return $booking ? normalize_booking_record($booking) : null;
}

function meta_payload(bool $publicBookingTypesOnly = false): array
{
    $venue = current_venue();
    $venueId = (int) $venue['id'];
    $settings = settings_defaults();
    $storedSettings = [];
    $settingsStmt = db()->prepare('SELECT setting_key, setting_value FROM settings WHERE venue_id = :venue_id ORDER BY setting_key');
    $settingsStmt->execute(['venue_id' => $venueId]);
    foreach ($settingsStmt->fetchAll() as $row) {
        $storedSettings[$row['setting_key']] = $row['setting_value'];
        $settings[$row['setting_key']] = $row['setting_value'];
    }

    if (!array_key_exists('annual_closed_days', $storedSettings)) {
        $settings['annual_closed_days'] = $storedSettings['annual_closed_day'] ?? $settings['annual_closed_day'];
    }
    $settings['venue_image_url'] = public_asset_url($settings['venue_image_url'] ?? '');

    $areasStmt = db()->prepare('SELECT * FROM areas WHERE venue_id = :venue_id AND active = 1 ORDER BY sort_order, id');
    $areasStmt->execute(['venue_id' => $venueId]);
    $functionAreasStmt = db()->prepare('SELECT id, venue_id, code, name FROM areas WHERE venue_id = :venue_id AND active = 1 AND function_enabled = 1 ORDER BY sort_order, id');
    $functionAreasStmt->execute(['venue_id' => $venueId]);
    $openingHoursStmt = db()->prepare('SELECT day_of_week, opens_at, closes_at, is_closed FROM opening_hours WHERE venue_id = :venue_id ORDER BY day_of_week');
    $openingHoursStmt->execute(['venue_id' => $venueId]);

    return [
        'venue' => $venue,
        'areas' => $areasStmt->fetchAll(),
        'function_areas' => $functionAreasStmt->fetchAll(),
        'settings' => $settings,
        'opening_hours' => $openingHoursStmt->fetchAll(),
        'online_booking_blocks' => fetch_online_booking_blocks(),
        'booking_types' => fetch_booking_types($publicBookingTypesOnly, true),
    ];
}

function dashboard_guest_chart_points(string $startDate, int $days): array
{
    $venueId = current_venue_id();
    $start = new DateTimeImmutable($startDate);
    $end = $start->modify('+' . max($days - 1, 0) . ' days')->format('Y-m-d');
    $stmt = db()->prepare(
        'SELECT booking_date, COALESCE(SUM(guest_count), 0) AS guests
         FROM bookings
         WHERE venue_id = :venue_id
           AND booking_date BETWEEN :start_date AND :end_date
           AND status NOT IN ("cancelled", "declined", "no_show")
         GROUP BY booking_date'
    );
    $stmt->execute(['venue_id' => $venueId, 'start_date' => $startDate, 'end_date' => $end]);
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
    $manager = require_manager();
    $venueId = current_venue_id($manager);
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
         WHERE venue_id = :venue_id
           AND booking_date = :today
           AND status NOT IN ("cancelled", "declined", "no_show")'
    );
    $todayMetricsStmt->execute(['venue_id' => $venueId, 'today' => $today]);
    $todayMetrics = $todayMetricsStmt->fetch() ?: [];

    $pendingFunctionRequests = scalar_query(
        'SELECT COUNT(*) FROM bookings WHERE venue_id = ? AND booking_type = "function" AND status = "pending"',
        [$venueId]
    );
    $bookingsWithoutTables = scalar_query(
        'SELECT COUNT(*)
         FROM bookings b
         WHERE b.venue_id = ?
           AND b.booking_type IN ("table", "event")
           AND b.booking_date >= ?
           AND b.status NOT IN ("cancelled", "declined", "no_show", "waitlist")
           AND NOT EXISTS (SELECT 1 FROM booking_tables bt WHERE bt.booking_id = b.id)',
        [$venueId, $today]
    );

    $cards = [
        'today_bookings' => scalar_query('SELECT COUNT(*) FROM bookings WHERE venue_id = ? AND booking_type = "table" AND booking_date = ?', [$venueId, $today]),
        'pending_functions' => scalar_query('SELECT COUNT(*) FROM bookings WHERE venue_id = ? AND booking_type = "function" AND status = "pending"', [$venueId]),
        'guests_next_7_days' => scalar_query('SELECT COALESCE(SUM(guest_count), 0) FROM bookings WHERE venue_id = ? AND booking_date BETWEEN ? AND ? AND status NOT IN ("cancelled", "declined", "no_show")', [$venueId, $today, $nextWeek]),
        'emails_logged' => scalar_query('SELECT COUNT(*) FROM email_logs WHERE venue_id = ?', [$venueId]),
    ];

    $recentStmt = db()->prepare(
        'SELECT b.id, b.booking_reference, b.booking_type, b.status, b.booking_date, b.start_time, b.guest_count,
                COALESCE(NULLIF(b.customer_name_snapshot, ""), c.name) AS customer_name,
                a.name AS assigned_area_name
         FROM bookings b
         JOIN customers c ON c.id = b.customer_id
         LEFT JOIN areas a ON a.id = b.assigned_area_id
         WHERE b.venue_id = :venue_id
         ORDER BY b.created_at DESC
         LIMIT 8'
    );
    $recentStmt->execute(['venue_id' => $venueId]);
    $recent = $recentStmt->fetchAll();

    $areaMixStmt = db()->prepare(
        'SELECT COALESCE(a.name, "Unassigned") AS area_name, COUNT(*) AS total
         FROM bookings b
         LEFT JOIN areas a ON a.id = b.assigned_area_id
         WHERE b.venue_id = :venue_id
           AND b.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         GROUP BY COALESCE(a.name, "Unassigned")
         ORDER BY total DESC'
    );
    $areaMixStmt->execute(['venue_id' => $venueId]);
    $areaMix = $areaMixStmt->fetchAll();

    $statusMixStmt = db()->prepare(
        'SELECT status, COUNT(*) AS total
         FROM bookings
         WHERE venue_id = :venue_id
         GROUP BY status
         ORDER BY total DESC'
    );
    $statusMixStmt->execute(['venue_id' => $venueId]);
    $statusMix = $statusMixStmt->fetchAll();

    $upcomingStmt = db()->prepare(
        'SELECT b.id, b.booking_reference, b.booking_type, b.status, b.booking_date, b.start_time, b.guest_count,
                COALESCE(NULLIF(b.customer_name_snapshot, ""), c.name) AS customer_name,
                a.name AS assigned_area_name
         FROM bookings b
         JOIN customers c ON c.id = b.customer_id
         LEFT JOIN areas a ON a.id = b.assigned_area_id
         WHERE b.venue_id = :venue_id
           AND b.booking_date >= CURDATE()
           AND b.status NOT IN ("cancelled", "declined", "no_show")
         ORDER BY b.booking_date ASC, b.start_time ASC
        LIMIT 8'
    );
    $upcomingStmt->execute(['venue_id' => $venueId]);
    $upcoming = $upcomingStmt->fetchAll();

    $todayBookingsStmt = db()->prepare(
        booking_select_sql(null) .
        ' AND b.booking_date = :today
          AND b.status NOT IN ("cancelled", "declined", "no_show")
          ORDER BY b.start_time ASC, b.created_at ASC'
    );
    $todayBookingsStmt->execute(['venue_id' => $venueId, 'today' => $today]);
    $todayBookings = $todayBookingsStmt->fetchAll();

    $upcomingFunctionsStmt = db()->prepare(
        booking_select_sql('function') .
        ' AND b.booking_date >= :today
          AND b.status NOT IN ("cancelled", "declined", "no_show", "completed")
          ORDER BY b.booking_date ASC, b.start_time ASC
          LIMIT 6'
    );
    $upcomingFunctionsStmt->execute(['venue_id' => $venueId, 'type' => 'function', 'today' => $today]);
    $upcomingFunctions = $upcomingFunctionsStmt->fetchAll();

    $activityStmt = db()->prepare(
        'SELECT l.*, u.name AS user_name
         FROM activity_logs l
         LEFT JOIN users u ON u.id = l.user_id
         WHERE l.venue_id = :venue_id
         ORDER BY l.created_at DESC
         LIMIT 8'
    );
    $activityStmt->execute(['venue_id' => $venueId]);
    $activity = $activityStmt->fetchAll();

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

function save_setting_value_for_venue(int $venueId, string $key, string $value): void
{
    $stmt = db()->prepare(
        'INSERT INTO settings (venue_id, setting_key, setting_value, updated_at)
         VALUES (:venue_id, :setting_key, :setting_value, NOW())
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()'
    );
    $stmt->execute([
        'venue_id' => $venueId,
        'setting_key' => clean_string($key),
        'setting_value' => clean_string($value),
    ]);
}

function save_setting_value(string $key, string $value): void
{
    save_setting_value_for_venue(current_venue_id(), $key, $value);
}

function ensure_default_settings_for_venue(int $venueId, array $venue = []): void
{
    $defaults = settings_defaults();
    if (($venue['name'] ?? '') !== '') {
        $defaults['venue_name'] = (string) $venue['name'];
    }
    if (($venue['phone'] ?? '') !== '') {
        $defaults['venue_phone'] = (string) $venue['phone'];
    }
    if (($venue['email'] ?? '') !== '') {
        $defaults['venue_email'] = (string) $venue['email'];
    }

    $stmt = db()->prepare(
        'INSERT IGNORE INTO settings (venue_id, setting_key, setting_value, updated_at)
         VALUES (:venue_id, :setting_key, :setting_value, NOW())'
    );
    foreach ($defaults as $key => $value) {
        $stmt->execute([
            'venue_id' => $venueId,
            'setting_key' => $key,
            'setting_value' => $value,
        ]);
    }
}

function ensure_default_opening_hours_for_venue(int $venueId): void
{
    $stmt = db()->prepare(
        'INSERT IGNORE INTO opening_hours (venue_id, day_of_week, opens_at, closes_at, is_closed, updated_at)
         VALUES (:venue_id, :day_of_week, "12:00", "21:00", 0, NOW())'
    );

    for ($day = 0; $day <= 6; $day++) {
        $stmt->execute(['venue_id' => $venueId, 'day_of_week' => $day]);
    }
}

function copy_settings_between_venues(int $sourceVenueId, int $targetVenueId): void
{
    $stmt = db()->prepare(
        'INSERT INTO settings (venue_id, setting_key, setting_value, updated_at)
         SELECT :target_venue_id, setting_key, setting_value, NOW()
         FROM settings
         WHERE venue_id = :source_venue_id
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()'
    );
    $stmt->execute([
        'source_venue_id' => $sourceVenueId,
        'target_venue_id' => $targetVenueId,
    ]);
}

function copy_opening_hours_between_venues(int $sourceVenueId, int $targetVenueId): void
{
    $stmt = db()->prepare(
        'INSERT INTO opening_hours (venue_id, day_of_week, opens_at, closes_at, is_closed, updated_at)
         SELECT :target_venue_id, day_of_week, opens_at, closes_at, is_closed, NOW()
         FROM opening_hours
         WHERE venue_id = :source_venue_id
         ON DUPLICATE KEY UPDATE
            opens_at = VALUES(opens_at),
            closes_at = VALUES(closes_at),
            is_closed = VALUES(is_closed),
            updated_at = NOW()'
    );
    $stmt->execute([
        'source_venue_id' => $sourceVenueId,
        'target_venue_id' => $targetVenueId,
    ]);
}

function remap_json_ids(?string $json, array $idMap): string
{
    $ids = json_decode((string) ($json ?? '[]'), true);
    if (!is_array($ids) || $ids === []) {
        return '[]';
    }

    $mapped = [];
    foreach ($ids as $id) {
        $oldId = (int) $id;
        if (isset($idMap[$oldId])) {
            $mapped[] = (int) $idMap[$oldId];
        }
    }

    return json_encode(array_values(array_unique($mapped)), JSON_UNESCAPED_SLASHES);
}

function copy_areas_tables_between_venues(int $sourceVenueId, int $targetVenueId): array
{
    $areaMap = [];
    $tableMap = [];

    $areas = db()->prepare('SELECT * FROM areas WHERE venue_id = :venue_id ORDER BY sort_order, id');
    $areas->execute(['venue_id' => $sourceVenueId]);

    $insertArea = db()->prepare(
        'INSERT INTO areas
            (venue_id, code, name, table_start, table_end, function_enabled, auto_assign_enabled,
             allow_table_joins, max_joined_tables, assignment_priority, preferred_min_guests,
             preferred_max_guests, active, sort_order)
         VALUES
            (:venue_id, :code, :name, :table_start, :table_end, :function_enabled, :auto_assign_enabled,
             :allow_table_joins, :max_joined_tables, :assignment_priority, :preferred_min_guests,
             :preferred_max_guests, :active, :sort_order)'
    );

    foreach ($areas->fetchAll() as $area) {
        $insertArea->execute([
            'venue_id' => $targetVenueId,
            'code' => $area['code'],
            'name' => $area['name'],
            'table_start' => (int) $area['table_start'],
            'table_end' => (int) $area['table_end'],
            'function_enabled' => (int) $area['function_enabled'],
            'auto_assign_enabled' => (int) ($area['auto_assign_enabled'] ?? 1),
            'allow_table_joins' => (int) ($area['allow_table_joins'] ?? 1),
            'max_joined_tables' => nullable_int($area['max_joined_tables'] ?? null),
            'assignment_priority' => (int) ($area['assignment_priority'] ?? 0),
            'preferred_min_guests' => nullable_int($area['preferred_min_guests'] ?? null),
            'preferred_max_guests' => nullable_int($area['preferred_max_guests'] ?? null),
            'active' => (int) $area['active'],
            'sort_order' => (int) ($area['sort_order'] ?? 0),
        ]);
        $areaMap[(int) $area['id']] = (int) db()->lastInsertId();
    }

    if ($areaMap === []) {
        return ['areas' => [], 'tables' => []];
    }

    $tables = db()->prepare('SELECT * FROM venue_tables WHERE venue_id = :venue_id ORDER BY table_number, id');
    $tables->execute(['venue_id' => $sourceVenueId]);
    $insertTable = db()->prepare(
        'INSERT INTO venue_tables
            (venue_id, area_id, table_number, capacity, active, auto_assign_enabled, joinable,
             assignment_priority, preferred_min_guests, preferred_max_guests, keep_for_walkins,
             accessibility_friendly, created_at, updated_at)
         VALUES
            (:venue_id, :area_id, :table_number, :capacity, :active, :auto_assign_enabled, :joinable,
             :assignment_priority, :preferred_min_guests, :preferred_max_guests, :keep_for_walkins,
             :accessibility_friendly, NOW(), NOW())'
    );

    foreach ($tables->fetchAll() as $table) {
        $oldAreaId = (int) $table['area_id'];
        if (!isset($areaMap[$oldAreaId])) {
            continue;
        }

        $insertTable->execute([
            'venue_id' => $targetVenueId,
            'area_id' => $areaMap[$oldAreaId],
            'table_number' => (int) $table['table_number'],
            'capacity' => (int) $table['capacity'],
            'active' => (int) $table['active'],
            'auto_assign_enabled' => (int) ($table['auto_assign_enabled'] ?? 1),
            'joinable' => (int) ($table['joinable'] ?? 1),
            'assignment_priority' => (int) ($table['assignment_priority'] ?? 0),
            'preferred_min_guests' => nullable_int($table['preferred_min_guests'] ?? null),
            'preferred_max_guests' => nullable_int($table['preferred_max_guests'] ?? null),
            'keep_for_walkins' => (int) ($table['keep_for_walkins'] ?? 0),
            'accessibility_friendly' => (int) ($table['accessibility_friendly'] ?? 0),
        ]);
        $tableMap[(int) $table['id']] = (int) db()->lastInsertId();
    }

    $groups = db()->prepare('SELECT * FROM table_join_groups WHERE venue_id = :venue_id ORDER BY priority, id');
    $groups->execute(['venue_id' => $sourceVenueId]);
    $insertGroup = db()->prepare(
        'INSERT INTO table_join_groups (venue_id, area_id, name, max_tables, active, priority, created_at, updated_at)
         VALUES (:venue_id, :area_id, :name, :max_tables, :active, :priority, NOW(), NOW())'
    );
    $groupTables = db()->prepare('SELECT table_id FROM table_join_group_tables WHERE join_group_id = :join_group_id');
    $insertGroupTable = db()->prepare(
        'INSERT IGNORE INTO table_join_group_tables (join_group_id, table_id)
         VALUES (:join_group_id, :table_id)'
    );

    foreach ($groups->fetchAll() as $group) {
        $oldAreaId = (int) $group['area_id'];
        if (!isset($areaMap[$oldAreaId])) {
            continue;
        }

        $insertGroup->execute([
            'venue_id' => $targetVenueId,
            'area_id' => $areaMap[$oldAreaId],
            'name' => $group['name'],
            'max_tables' => nullable_int($group['max_tables'] ?? null),
            'active' => (int) $group['active'],
            'priority' => (int) $group['priority'],
        ]);
        $newGroupId = (int) db()->lastInsertId();

        $groupTables->execute(['join_group_id' => (int) $group['id']]);
        foreach ($groupTables->fetchAll() as $groupTable) {
            $oldTableId = (int) $groupTable['table_id'];
            if (isset($tableMap[$oldTableId])) {
                $insertGroupTable->execute([
                    'join_group_id' => $newGroupId,
                    'table_id' => $tableMap[$oldTableId],
                ]);
            }
        }
    }

    return ['areas' => $areaMap, 'tables' => $tableMap];
}

function copy_booking_types_between_venues(int $sourceVenueId, int $targetVenueId, array $areaMap = []): void
{
    $types = db()->prepare('SELECT * FROM booking_types WHERE venue_id = :venue_id AND deleted_at IS NULL ORDER BY sort_order, id');
    $types->execute(['venue_id' => $sourceVenueId]);

    $insertType = db()->prepare(
        'INSERT INTO booking_types
            (venue_id, name, slug, category, description, customer_button_label, internal_label, is_active,
             display_to_customers, colour, icon, capacity_mode, min_guests, max_guests, max_capacity,
             max_bookings, requires_approval, auto_confirm, allow_waitlist, booking_cutoff_minutes,
             booking_window_days, cancellation_cutoff_minutes, sort_order, created_at, updated_at)
         VALUES
            (:venue_id, :name, :slug, :category, :description, :customer_button_label, :internal_label, :is_active,
             :display_to_customers, :colour, :icon, :capacity_mode, :min_guests, :max_guests, :max_capacity,
             :max_bookings, :requires_approval, :auto_confirm, :allow_waitlist, :booking_cutoff_minutes,
             :booking_window_days, :cancellation_cutoff_minutes, :sort_order, NOW(), NOW())'
    );
    $schedules = db()->prepare('SELECT * FROM booking_type_schedules WHERE booking_type_id = :booking_type_id ORDER BY id');
    $insertSchedule = db()->prepare(
        'INSERT INTO booking_type_schedules
            (booking_type_id, recurrence_type, day_of_week, day_of_month, start_time, end_time, arrival_time,
             duration_minutes, start_date, end_date, custom_dates_json, reserved_area_ids_json, created_at, updated_at)
         VALUES
            (:booking_type_id, :recurrence_type, :day_of_week, :day_of_month, :start_time, :end_time, :arrival_time,
             :duration_minutes, :start_date, :end_date, :custom_dates_json, :reserved_area_ids_json, NOW(), NOW())'
    );
    $fields = db()->prepare('SELECT * FROM booking_custom_fields WHERE booking_type_id = :booking_type_id ORDER BY display_order, id');
    $insertField = db()->prepare(
        'INSERT INTO booking_custom_fields
            (booking_type_id, label, field_type, is_required, options_json, display_order, created_at, updated_at)
         VALUES
            (:booking_type_id, :label, :field_type, :is_required, :options_json, :display_order, NOW(), NOW())'
    );

    foreach ($types->fetchAll() as $type) {
        $insertType->execute([
            'venue_id' => $targetVenueId,
            'name' => $type['name'],
            'slug' => unique_booking_type_slug_for_venue($targetVenueId, (string) $type['slug']),
            'category' => $type['category'],
            'description' => $type['description'],
            'customer_button_label' => $type['customer_button_label'],
            'internal_label' => $type['internal_label'],
            'is_active' => (int) $type['is_active'],
            'display_to_customers' => (int) $type['display_to_customers'],
            'colour' => $type['colour'],
            'icon' => $type['icon'],
            'capacity_mode' => $type['capacity_mode'],
            'min_guests' => (int) $type['min_guests'],
            'max_guests' => nullable_int($type['max_guests'] ?? null),
            'max_capacity' => nullable_int($type['max_capacity'] ?? null),
            'max_bookings' => nullable_int($type['max_bookings'] ?? null),
            'requires_approval' => (int) $type['requires_approval'],
            'auto_confirm' => (int) $type['auto_confirm'],
            'allow_waitlist' => (int) $type['allow_waitlist'],
            'booking_cutoff_minutes' => (int) $type['booking_cutoff_minutes'],
            'booking_window_days' => (int) ($type['booking_window_days'] ?? 90),
            'cancellation_cutoff_minutes' => (int) $type['cancellation_cutoff_minutes'],
            'sort_order' => (int) $type['sort_order'],
        ]);
        $newTypeId = (int) db()->lastInsertId();

        $schedules->execute(['booking_type_id' => (int) $type['id']]);
        foreach ($schedules->fetchAll() as $schedule) {
            $insertSchedule->execute([
                'booking_type_id' => $newTypeId,
                'recurrence_type' => $schedule['recurrence_type'],
                'day_of_week' => nullable_int($schedule['day_of_week'] ?? null),
                'day_of_month' => nullable_int($schedule['day_of_month'] ?? null),
                'start_time' => $schedule['start_time'],
                'end_time' => $schedule['end_time'],
                'arrival_time' => $schedule['arrival_time'],
                'duration_minutes' => (int) $schedule['duration_minutes'],
                'start_date' => $schedule['start_date'],
                'end_date' => $schedule['end_date'],
                'custom_dates_json' => $schedule['custom_dates_json'] ?: null,
                'reserved_area_ids_json' => remap_json_ids($schedule['reserved_area_ids_json'] ?? null, $areaMap),
            ]);
        }

        $fields->execute(['booking_type_id' => (int) $type['id']]);
        foreach ($fields->fetchAll() as $field) {
            $insertField->execute([
                'booking_type_id' => $newTypeId,
                'label' => $field['label'],
                'field_type' => $field['field_type'],
                'is_required' => (int) $field['is_required'],
                'options_json' => $field['options_json'] ?: null,
                'display_order' => (int) $field['display_order'],
            ]);
        }
    }
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

    return ['url' => $url, ...auth_payload(current_user())];
}

function area_code_from_name(string $name): string
{
    $code = strtoupper((string) preg_replace('/[^A-Za-z0-9]+/', '_', $name));
    $code = trim($code, '_');
    $code = substr($code !== '' ? $code : 'AREA', 0, 20);
    $base = $code;
    $suffix = 2;

    while (scalar_query('SELECT COUNT(*) FROM areas WHERE venue_id = ? AND code = ?', [current_venue_id(), $code]) > 0) {
        $suffixText = '_' . $suffix;
        $code = substr($base, 0, 20 - strlen($suffixText)) . $suffixText;
        $suffix++;
    }

    return $code;
}

function ensure_area_exists(int $areaId): void
{
    if ($areaId <= 0 || scalar_query('SELECT COUNT(*) FROM areas WHERE id = ? AND venue_id = ?', [$areaId, current_venue_id()]) === 0) {
        fail('Please choose a valid area.', 422, ['area_id' => $areaId]);
    }
}

function ensure_table_number_available(int $tableNumber, ?int $excludeId = null): void
{
    if ($tableNumber <= 0) {
        fail('Table number must be greater than zero.', 422, ['table_number' => $tableNumber]);
    }

    $sql = 'SELECT COUNT(*) FROM venue_tables WHERE venue_id = ? AND table_number = ?';
    $params = [current_venue_id(), $tableNumber];
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
         WHERE venue_id = :venue_id AND area_id = :area_id'
    );
    $stmt->execute(['venue_id' => current_venue_id(), 'area_id' => $areaId]);
    $range = $stmt->fetch() ?: ['table_start' => 0, 'table_end' => 0];

    $update = db()->prepare('UPDATE areas SET table_start = :table_start, table_end = :table_end WHERE id = :id AND venue_id = :venue_id');
    $update->execute([
        'table_start' => (int) $range['table_start'],
        'table_end' => (int) $range['table_end'],
        'id' => $areaId,
        'venue_id' => current_venue_id(),
    ]);
}

function fetch_table_join_groups(?int $areaId = null): array
{
    $sql =
        'SELECT g.id, g.area_id, g.name, g.max_tables, g.active, g.priority, g.created_at, g.updated_at,
                vt.id AS table_id, vt.table_number
         FROM table_join_groups g
         LEFT JOIN table_join_group_tables jgt ON jgt.join_group_id = g.id
         LEFT JOIN venue_tables vt ON vt.id = jgt.table_id
         WHERE g.venue_id = :venue_id';
    $params = ['venue_id' => current_venue_id()];
    if ($areaId !== null) {
        $sql .= ' AND g.area_id = :area_id';
        $params['area_id'] = $areaId;
    }
    $sql .= ' ORDER BY g.area_id, g.priority, g.id, vt.table_number';

    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $groups = [];

    foreach ($stmt->fetchAll() as $row) {
        $groupId = (int) $row['id'];
        if (!isset($groups[$groupId])) {
            $groups[$groupId] = [
                'id' => $groupId,
                'area_id' => (int) $row['area_id'],
                'name' => (string) $row['name'],
                'max_tables' => $row['max_tables'] === null ? null : (int) $row['max_tables'],
                'active' => (int) $row['active'],
                'priority' => (int) $row['priority'],
                'created_at' => $row['created_at'],
                'updated_at' => $row['updated_at'],
                'table_ids' => [],
                'table_numbers' => [],
            ];
        }

        if ($row['table_id'] !== null) {
            $groups[$groupId]['table_ids'][] = (int) $row['table_id'];
            $groups[$groupId]['table_numbers'][] = (int) $row['table_number'];
        }
    }

    return array_values($groups);
}

function validated_join_group_table_ids(int $areaId, mixed $value): array
{
    $tableIds = normalized_table_ids($value);
    if (count($tableIds) < 2) {
        fail('Choose at least two tables for this join group.', 422);
    }

    $placeholders = implode(',', array_fill(0, count($tableIds), '?'));
    $stmt = db()->prepare("SELECT id FROM venue_tables WHERE venue_id = ? AND area_id = ? AND id IN ({$placeholders}) ORDER BY table_number");
    $stmt->execute(array_merge([current_venue_id(), $areaId], $tableIds));
    $validIds = array_map('intval', array_column($stmt->fetchAll(), 'id'));

    if (count($validIds) !== count($tableIds)) {
        fail('Join group tables must all belong to the selected section.', 422);
    }

    return $validIds;
}

function save_table_join_group_tables(int $joinGroupId, array $tableIds): void
{
    db()->prepare('DELETE FROM table_join_group_tables WHERE join_group_id = :join_group_id')
        ->execute(['join_group_id' => $joinGroupId]);

    $insert = db()->prepare(
        'INSERT INTO table_join_group_tables (join_group_id, table_id)
         VALUES (:join_group_id, :table_id)'
    );
    foreach ($tableIds as $tableId) {
        $insert->execute([
            'join_group_id' => $joinGroupId,
            'table_id' => (int) $tableId,
        ]);
    }
}

function create_default_join_group_for_area(int $areaId, string $areaName, int $priority = 0): void
{
    $stmt = db()->prepare(
        'INSERT INTO table_join_groups (venue_id, area_id, name, max_tables, active, priority, created_at, updated_at)
         VALUES (:venue_id, :area_id, :name, 4, 1, :priority, NOW(), NOW())'
    );
    $stmt->execute([
        'venue_id' => current_venue_id(),
        'area_id' => $areaId,
        'name' => $areaName . ' join group',
        'priority' => $priority,
    ]);
}

function attach_table_to_single_join_group(int $areaId, int $tableId): void
{
    $stmt = db()->prepare('SELECT id FROM table_join_groups WHERE venue_id = :venue_id AND area_id = :area_id ORDER BY priority, id');
    $stmt->execute(['venue_id' => current_venue_id(), 'area_id' => $areaId]);
    $groups = array_map('intval', array_column($stmt->fetchAll(), 'id'));

    if (count($groups) !== 1) {
        return;
    }

    db()->prepare(
        'INSERT IGNORE INTO table_join_group_tables (join_group_id, table_id)
         VALUES (:join_group_id, :table_id)'
    )->execute([
        'join_group_id' => $groups[0],
        'table_id' => $tableId,
    ]);
}

try {
    ensure_booking_customer_snapshots();
    ensure_online_booking_blocks_table();
    ensure_user_avatar_column();
    ensure_multi_venue_schema();
    ensure_booking_type_schema();
    ensure_assignment_schema();

    $method = $_SERVER['REQUEST_METHOD'];
    $route = trim((string) ($_GET['r'] ?? 'meta'), '/');
    $segments = $route === '' ? [] : explode('/', $route);

    if ($method === 'GET' && $route === 'meta') {
        respond(meta_payload(current_user() === null));
    }

    if ($method === 'POST' && $route === 'auth/login') {
        $data = json_body();
        require_fields($data, ['email', 'password']);

        $stmt = db()->prepare('SELECT id, name, email, role, password_hash, status, avatar_url, is_platform_admin FROM users WHERE email = :email LIMIT 1');
        $stmt->execute(['email' => strtolower(clean_string($data['email']))]);
        $user = $stmt->fetch();

        if (!$user || $user['status'] !== 'active' || !password_verify((string) $data['password'], $user['password_hash'])) {
            fail('Invalid email or password.', 401);
        }

        $_SESSION['user_id'] = (int) $user['id'];
        log_activity((int) $user['id'], 'signed_in', 'user', (int) $user['id']);
        unset($user['password_hash']);
        respond(auth_payload($user));
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
        respond(auth_payload(current_user()));
    }

    ensure_platform_support_context_for_route(current_user(), $route);

    if ($method === 'POST' && $route === 'support/start') {
        $manager = require_platform_admin();
        $data = json_body();
        $venueId = (int) ($data['venue_id'] ?? 0);
        if ($venueId <= 0) {
            fail('Please choose a venue to support.', 422);
        }

        require_venue_access($manager, $venueId);
        $_SESSION['support_venue_id'] = $venueId;
        $_SESSION['venue_id'] = $venueId;
        respond(auth_payload($manager));
    }

    if (($method === 'POST' || $method === 'DELETE') && $route === 'support/stop') {
        $manager = require_platform_admin();
        unset($_SESSION['support_venue_id'], $_SESSION['venue_id']);
        respond(auth_payload($manager));
    }

    if ($method === 'GET' && $route === 'platform/venues') {
        require_platform_admin();
        $stmt = db()->query(
            'SELECT v.id, v.account_id, v.name, v.slug, v.timezone, v.address, v.phone, v.email, v.active,
                    a.business_name AS account_name, "platform_admin" AS access_role
             FROM venues v
             JOIN accounts a ON a.id = v.account_id
             ORDER BY a.business_name, v.name, v.id'
        );
        respond(['items' => $stmt->fetchAll()]);
    }

    if ($method === 'GET' && $route === 'accounts') {
        $manager = require_manager();
        respond(['items' => accessible_accounts_for_user((int) $manager['id'])]);
    }

    if ($method === 'POST' && $route === 'accounts') {
        $manager = require_platform_admin();
        $data = json_body();
        require_fields($data, ['business_name', 'venue_name']);

        $currentVenue = current_venue($manager);
        $sourceVenueId = (int) ($data['copy_from_venue_id'] ?? $currentVenue['id']);
        $sourceVenue = require_venue_access($manager, $sourceVenueId);
        $businessName = clean_string($data['business_name']);
        $venueName = clean_string($data['venue_name']);
        $rawSlug = clean_string($data['venue_slug'] ?? $data['slug'] ?? '');
        $slugSource = $rawSlug !== '' ? $rawSlug : $venueName;
        $slug = unique_venue_slug($slugSource);
        $timezone = clean_string($data['timezone'] ?? '') ?: (string) ($sourceVenue['timezone'] ?? 'Australia/Sydney');
        $address = clean_string($data['address'] ?? '');
        $phone = clean_string($data['phone'] ?? '');
        $email = clean_string($data['email'] ?? '');
        $plan = clean_string($data['plan'] ?? 'standard') ?: 'standard';
        $billingStatus = clean_string($data['billing_status'] ?? 'active') ?: 'active';

        db()->beginTransaction();
        $accountStmt = db()->prepare(
            'INSERT INTO accounts (business_name, plan, billing_status, created_at, updated_at)
             VALUES (:business_name, :plan, :billing_status, NOW(), NOW())'
        );
        $accountStmt->execute([
            'business_name' => $businessName,
            'plan' => $plan,
            'billing_status' => $billingStatus,
        ]);
        $accountId = (int) db()->lastInsertId();

        $venueStmt = db()->prepare(
            'INSERT INTO venues
                (account_id, name, slug, timezone, address, phone, email, active, created_at, updated_at)
             VALUES
                (:account_id, :name, :slug, :timezone, :address, :phone, :email, 1, NOW(), NOW())'
        );
        $venueStmt->execute([
            'account_id' => $accountId,
            'name' => $venueName,
            'slug' => $slug,
            'timezone' => $timezone,
            'address' => $address,
            'phone' => $phone,
            'email' => $email,
        ]);
        $venueId = (int) db()->lastInsertId();

        db()->prepare(
            'INSERT INTO user_venues (user_id, venue_id, role, created_at, updated_at)
             VALUES (:user_id, :venue_id, "owner", NOW(), NOW())'
        )->execute([
            'user_id' => (int) $manager['id'],
            'venue_id' => $venueId,
        ]);

        ensure_default_settings_for_venue($venueId, [
            'name' => $venueName,
            'phone' => $phone,
            'email' => $email,
        ]);
        ensure_default_opening_hours_for_venue($venueId);

        $copySettings = !array_key_exists('copy_settings', $data) || bool_int($data['copy_settings']) === 1;
        $copyOpeningHours = !array_key_exists('copy_opening_hours', $data) || bool_int($data['copy_opening_hours']) === 1;
        $copyAreasTables = !array_key_exists('copy_areas_tables', $data) || bool_int($data['copy_areas_tables']) === 1;
        $copyBookingTypes = !array_key_exists('copy_booking_types', $data) || bool_int($data['copy_booking_types']) === 1;

        if ($copySettings) {
            copy_settings_between_venues($sourceVenueId, $venueId);
        }
        if ($copyOpeningHours) {
            copy_opening_hours_between_venues($sourceVenueId, $venueId);
        }

        $areaCopy = ['areas' => [], 'tables' => []];
        if ($copyAreasTables) {
            $areaCopy = copy_areas_tables_between_venues($sourceVenueId, $venueId);
        }
        if ($copyBookingTypes) {
            copy_booking_types_between_venues($sourceVenueId, $venueId, $areaCopy['areas'] ?? []);
        }

        save_setting_value_for_venue($venueId, 'venue_name', $venueName);
        save_setting_value_for_venue($venueId, 'venue_phone', $phone);
        save_setting_value_for_venue($venueId, 'venue_email', $email);

        db()->commit();
        log_activity((int) $manager['id'], 'created', 'account', $accountId, [
            'business_name' => $businessName,
            'venue_id' => $venueId,
        ]);
        respond([
            'item' => require_account_access($manager, $accountId),
            'venue' => require_venue_access($manager, $venueId),
        ], 201);
    }

    if (($segments[0] ?? '') === 'accounts' && isset($segments[1]) && !isset($segments[2]) && $method === 'PUT') {
        $manager = require_platform_admin();
        $accountId = (int) $segments[1];
        require_account_access($manager, $accountId);
        $data = json_body();

        $updates = ['updated_at = NOW()'];
        $params = ['id' => $accountId];

        if (array_key_exists('business_name', $data)) {
            $businessName = clean_string($data['business_name']);
            if ($businessName === '') {
                fail('Client name is required.', 422);
            }
            $updates[] = 'business_name = :business_name';
            $params['business_name'] = $businessName;
        }
        foreach (['plan', 'billing_status'] as $field) {
            if (array_key_exists($field, $data)) {
                $updates[] = "{$field} = :{$field}";
                $params[$field] = clean_string($data[$field]);
            }
        }

        db()->prepare('UPDATE accounts SET ' . implode(', ', $updates) . ' WHERE id = :id')
            ->execute($params);
        log_activity((int) $manager['id'], 'updated', 'account', $accountId);
        respond(['item' => require_account_access($manager, $accountId)]);
    }

    if ($method === 'GET' && $route === 'venues') {
        $manager = require_manager();
        respond([
            'items' => accessible_venues_for_user((int) $manager['id'], false),
            'current_venue' => current_venue($manager),
        ]);
    }

    if ($method === 'POST' && $route === 'venues') {
        $manager = require_manager();
        $data = json_body();
        require_fields($data, ['name']);

        $currentVenue = current_venue($manager);
        $accountId = (int) ($data['account_id'] ?? $currentVenue['account_id']);
        require_account_access($manager, $accountId);
        $sourceVenueId = (int) ($data['copy_from_venue_id'] ?? $currentVenue['id']);
        $sourceVenue = require_venue_access($manager, $sourceVenueId);
        $name = clean_string($data['name']);
        $slugSource = clean_string($data['slug'] ?? '') !== '' ? clean_string($data['slug']) : $name;
        $slug = unique_venue_slug($slugSource);
        $timezone = clean_string($data['timezone'] ?? '') ?: (string) ($sourceVenue['timezone'] ?? 'Australia/Sydney');
        $address = clean_string($data['address'] ?? '');
        $phone = clean_string($data['phone'] ?? '');
        $email = clean_string($data['email'] ?? '');

        db()->beginTransaction();
        $insert = db()->prepare(
            'INSERT INTO venues
                (account_id, name, slug, timezone, address, phone, email, active, created_at, updated_at)
             VALUES
                (:account_id, :name, :slug, :timezone, :address, :phone, :email, 1, NOW(), NOW())'
        );
        $insert->execute([
            'account_id' => $accountId,
            'name' => $name,
            'slug' => $slug,
            'timezone' => $timezone,
            'address' => $address,
            'phone' => $phone,
            'email' => $email,
        ]);
        $venueId = (int) db()->lastInsertId();

        db()->prepare(
            'INSERT INTO user_venues (user_id, venue_id, role, created_at, updated_at)
             VALUES (:user_id, :venue_id, "owner", NOW(), NOW())'
        )->execute([
            'user_id' => (int) $manager['id'],
            'venue_id' => $venueId,
        ]);

        ensure_default_settings_for_venue($venueId, [
            'name' => $name,
            'phone' => $phone,
            'email' => $email,
        ]);
        ensure_default_opening_hours_for_venue($venueId);

        $copySettings = !array_key_exists('copy_settings', $data) || bool_int($data['copy_settings']) === 1;
        $copyOpeningHours = !array_key_exists('copy_opening_hours', $data) || bool_int($data['copy_opening_hours']) === 1;
        $copyAreasTables = !array_key_exists('copy_areas_tables', $data) || bool_int($data['copy_areas_tables']) === 1;
        $copyBookingTypes = !array_key_exists('copy_booking_types', $data) || bool_int($data['copy_booking_types']) === 1;

        if ($copySettings) {
            copy_settings_between_venues($sourceVenueId, $venueId);
        }
        if ($copyOpeningHours) {
            copy_opening_hours_between_venues($sourceVenueId, $venueId);
        }

        $areaCopy = ['areas' => [], 'tables' => []];
        if ($copyAreasTables) {
            $areaCopy = copy_areas_tables_between_venues($sourceVenueId, $venueId);
        }
        if ($copyBookingTypes) {
            copy_booking_types_between_venues($sourceVenueId, $venueId, $areaCopy['areas'] ?? []);
        }

        save_setting_value_for_venue($venueId, 'venue_name', $name);
        save_setting_value_for_venue($venueId, 'venue_phone', $phone);
        save_setting_value_for_venue($venueId, 'venue_email', $email);

        db()->commit();
        log_activity((int) $manager['id'], 'created', 'venue', $venueId, ['name' => $name, 'slug' => $slug]);
        respond(['item' => require_venue_access($manager, $venueId)], 201);
    }

    if ($method === 'POST' && $route === 'venues/switch') {
        $manager = require_manager();
        $data = json_body();
        $venueId = (int) ($data['venue_id'] ?? 0);
        $venueIds = array_map(static fn (array $venue): int => (int) $venue['id'], accessible_venues_for_user((int) $manager['id']));
        if ($venueId <= 0 || !in_array($venueId, $venueIds, true)) {
            fail('You do not have access to that venue.', 403);
        }

        $_SESSION['venue_id'] = $venueId;
        respond(auth_payload($manager));
    }

    if (($segments[0] ?? '') === 'venues' && isset($segments[1]) && !isset($segments[2]) && $method === 'PUT') {
        $manager = require_manager();
        $venueId = (int) $segments[1];
        $venue = require_venue_access($manager, $venueId);
        $data = json_body();

        $updates = ['updated_at = NOW()'];
        $params = ['id' => $venueId];
        $identitySettings = [];

        if (array_key_exists('name', $data)) {
            $name = clean_string($data['name']);
            if ($name === '') {
                fail('Venue name is required.', 422);
            }
            $updates[] = 'name = :name';
            $params['name'] = $name;
            $identitySettings['venue_name'] = $name;
        }

        if (array_key_exists('slug', $data)) {
            $slugSource = clean_string($data['slug']);
            if ($slugSource === '') {
                fail('Venue URL ID is required.', 422);
            }
            $updates[] = 'slug = :slug';
            $params['slug'] = unique_venue_slug($slugSource, $venueId);
        }

        foreach (['timezone', 'address', 'phone', 'email'] as $field) {
            if (array_key_exists($field, $data)) {
                $updates[] = "{$field} = :{$field}";
                $params[$field] = clean_string($data[$field]);
                if ($field === 'phone') {
                    $identitySettings['venue_phone'] = $params[$field];
                }
                if ($field === 'email') {
                    $identitySettings['venue_email'] = $params[$field];
                }
            }
        }

        if (array_key_exists('active', $data)) {
            $active = bool_int($data['active']);
            if ($active === 0 && $venueId === current_venue_id($manager) && count(accessible_venues_for_user((int) $manager['id'])) <= 1) {
                fail('Add or switch to another active venue before disabling this one.', 422);
            }
            $updates[] = 'active = :active';
            $params['active'] = $active;
        }

        $stmt = db()->prepare('UPDATE venues SET ' . implode(', ', $updates) . ' WHERE id = :id');
        $stmt->execute($params);

        foreach ($identitySettings as $key => $value) {
            save_setting_value_for_venue($venueId, $key, (string) $value);
        }

        log_activity((int) $manager['id'], 'updated', 'venue', $venueId);
        respond(['item' => require_venue_access($manager, $venueId)]);
    }

    if (($segments[0] ?? '') === 'venues' && isset($segments[1]) && ($segments[2] ?? '') === 'users' && $method === 'GET') {
        $manager = require_manager();
        $venueId = (int) $segments[1];
        $venue = require_venue_access($manager, $venueId);

        $stmt = db()->prepare(
            'SELECT u.id, u.name, u.email, u.role, u.status, u.avatar_url, u.created_at, u.updated_at,
                    uv_target.role AS venue_role,
                    CASE WHEN uv_target.user_id IS NULL THEN 0 ELSE 1 END AS has_access
             FROM users u
             LEFT JOIN user_venues uv_target
                ON uv_target.user_id = u.id AND uv_target.venue_id = :target_venue_id
             LEFT JOIN user_venues uv_account ON uv_account.user_id = u.id
             LEFT JOIN venues v_account ON v_account.id = uv_account.venue_id
             WHERE u.role = "manager"
               AND (v_account.account_id = :account_id OR u.id = :manager_id)
             GROUP BY u.id, u.name, u.email, u.role, u.status, u.avatar_url, u.created_at, u.updated_at, uv_target.role, uv_target.user_id
             ORDER BY u.name, u.email'
        );
        $stmt->execute([
            'target_venue_id' => $venueId,
            'account_id' => (int) $venue['account_id'],
            'manager_id' => (int) $manager['id'],
        ]);

        respond(['items' => normalize_user_records($stmt->fetchAll())]);
    }

    if (($segments[0] ?? '') === 'venues' && isset($segments[1]) && ($segments[2] ?? '') === 'users' && $method === 'PUT') {
        $manager = require_manager();
        $venueId = (int) $segments[1];
        require_venue_access($manager, $venueId);
        $data = json_body();

        $selected = [];
        foreach (($data['user_ids'] ?? []) as $userId) {
            $id = (int) $userId;
            if ($id > 0) {
                $selected[] = $id;
            }
        }

        $ownerStmt = db()->prepare('SELECT user_id FROM user_venues WHERE venue_id = :venue_id AND role = "owner"');
        $ownerStmt->execute(['venue_id' => $venueId]);
        foreach ($ownerStmt->fetchAll() as $owner) {
            $selected[] = (int) $owner['user_id'];
        }
        $selected[] = (int) $manager['id'];
        $selected = array_values(array_unique($selected));

        $placeholders = implode(',', array_fill(0, count($selected), '?'));
        $activeManagers = scalar_query(
            "SELECT COUNT(*) FROM users WHERE role = 'manager' AND status = 'active' AND id IN ({$placeholders})",
            $selected
        );
        if ($activeManagers < 1) {
            fail('At least one active manager is required for each venue.', 422);
        }

        db()->beginTransaction();
        db()->prepare("DELETE FROM user_venues WHERE venue_id = ? AND user_id NOT IN ({$placeholders})")
            ->execute(array_merge([$venueId], $selected));

        $roleStmt = db()->prepare('SELECT role FROM user_venues WHERE venue_id = :venue_id AND user_id = :user_id LIMIT 1');
        $upsert = db()->prepare(
            'INSERT INTO user_venues (user_id, venue_id, role, created_at, updated_at)
             VALUES (:user_id, :venue_id, :role, NOW(), NOW())
             ON DUPLICATE KEY UPDATE updated_at = NOW()'
        );
        foreach ($selected as $userId) {
            $roleStmt->execute(['venue_id' => $venueId, 'user_id' => $userId]);
            $role = $roleStmt->fetchColumn() ?: 'manager';
            $upsert->execute([
                'user_id' => $userId,
                'venue_id' => $venueId,
                'role' => $role,
            ]);
        }
        db()->commit();

        log_activity((int) $manager['id'], 'updated', 'venue_users', $venueId, ['user_ids' => $selected]);
        respond(['ok' => true]);
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
        respond(auth_payload(current_user()));
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
        respond(['ok' => true, ...auth_payload(current_user())]);
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

    if ($method === 'POST' && $route === 'public/event-bookings') {
        db()->beginTransaction();
        $result = create_event_booking(json_body());
        db()->commit();
        respond($result, 201);
    }

    if ($method === 'GET' && $route === 'dashboard') {
        respond(dashboard_payload());
    }

    if ($method === 'GET' && $route === 'booking-types') {
        require_manager();
        respond(['items' => fetch_booking_types(false, true)]);
    }

    if ($method === 'POST' && $route === 'booking-types') {
        $manager = require_manager();
        db()->beginTransaction();
        $result = create_booking_type(json_body(), $manager);
        db()->commit();
        respond(['item' => $result], 201);
    }

    if (($segments[0] ?? '') === 'booking-types' && isset($segments[1]) && $method === 'PUT') {
        $manager = require_manager();
        db()->beginTransaction();
        $result = update_booking_type((int) $segments[1], json_body(), $manager);
        db()->commit();
        respond(['item' => $result]);
    }

    if (($segments[0] ?? '') === 'booking-types' && isset($segments[1]) && $method === 'DELETE') {
        $manager = require_manager();
        db()->beginTransaction();
        $result = delete_booking_type((int) $segments[1], $manager);
        db()->commit();
        respond($result);
    }

    if ($method === 'GET' && $route === 'bookings') {
        $type = clean_string($_GET['type'] ?? 'table');
        list_bookings(match ($type) {
            'all' => null,
            'function' => 'function',
            'event' => 'event',
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
            'INSERT INTO online_booking_blocks (venue_id, block_date, created_by_user_id, created_at, updated_at)
             VALUES (:venue_id, :block_date, :created_by_user_id, NOW(), NOW())
             ON DUPLICATE KEY UPDATE created_by_user_id = VALUES(created_by_user_id), updated_at = NOW()'
        );
        $stmt->execute([
            'venue_id' => current_venue_id($manager),
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
        db()->prepare('DELETE FROM online_booking_blocks WHERE venue_id = :venue_id AND block_date = :block_date')
            ->execute(['venue_id' => current_venue_id($manager), 'block_date' => $date]);
        log_activity((int) $manager['id'], 'unblocked_online_bookings', 'date', null, ['date' => $date]);
        respond(['ok' => true]);
    }

    if ($method === 'GET' && $route === 'calendar') {
        $manager = require_manager();
        $stmt = db()->prepare(
            booking_select_sql(null) .
            ' AND b.status NOT IN ("cancelled", "declined", "no_show")
             ORDER BY b.booking_date, b.start_time'
        );
        $stmt->execute(['venue_id' => current_venue_id($manager)]);
        respond(['items' => $stmt->fetchAll(), 'online_booking_blocks' => fetch_online_booking_blocks()]);
    }

    if ($method === 'GET' && $route === 'tables') {
        $manager = require_manager();
        $venueId = current_venue_id($manager);
        $areasStmt = db()->prepare('SELECT * FROM areas WHERE venue_id = :venue_id ORDER BY sort_order, id');
        $areasStmt->execute(['venue_id' => $venueId]);
        $tablesStmt = db()->prepare('SELECT * FROM venue_tables WHERE venue_id = :venue_id ORDER BY table_number');
        $tablesStmt->execute(['venue_id' => $venueId]);
        $areas = $areasStmt->fetchAll();
        $tables = $tablesStmt->fetchAll();
        respond(['areas' => $areas, 'tables' => $tables, 'join_groups' => fetch_table_join_groups()]);
    }

    if ($method === 'POST' && $route === 'table-join-groups') {
        $manager = require_manager();
        $data = json_body();
        $areaId = (int) ($data['area_id'] ?? 0);
        ensure_area_exists($areaId);
        $name = clean_string($data['name'] ?? '');
        if ($name === '') {
            fail('Join group name is required.', 422);
        }
        $tableIds = validated_join_group_table_ids($areaId, $data['table_ids'] ?? []);

        $stmt = db()->prepare(
            'INSERT INTO table_join_groups (venue_id, area_id, name, max_tables, active, priority, created_at, updated_at)
             VALUES (:venue_id, :area_id, :name, :max_tables, :active, :priority, NOW(), NOW())'
        );
        $stmt->execute([
            'venue_id' => current_venue_id($manager),
            'area_id' => $areaId,
            'name' => $name,
            'max_tables' => nullable_int($data['max_tables'] ?? null),
            'active' => bool_int($data['active'] ?? true),
            'priority' => (int) ($data['priority'] ?? 0),
        ]);
        $joinGroupId = (int) db()->lastInsertId();
        save_table_join_group_tables($joinGroupId, $tableIds);
        log_activity((int) $manager['id'], 'created', 'table_join_group', $joinGroupId);
        respond(['ok' => true, 'id' => $joinGroupId], 201);
    }

    if (($segments[0] ?? '') === 'table-join-groups' && isset($segments[1]) && $method === 'PUT') {
        $manager = require_manager();
        $joinGroupId = (int) $segments[1];
        $existingStmt = db()->prepare('SELECT * FROM table_join_groups WHERE id = :id AND venue_id = :venue_id');
        $existingStmt->execute(['id' => $joinGroupId, 'venue_id' => current_venue_id($manager)]);
        $existing = $existingStmt->fetch();
        if (!$existing) {
            fail('Join group not found.', 404);
        }

        $data = json_body();
        $areaId = array_key_exists('area_id', $data) ? (int) $data['area_id'] : (int) $existing['area_id'];
        ensure_area_exists($areaId);
        $name = clean_string($data['name'] ?? $existing['name']);
        if ($name === '') {
            fail('Join group name is required.', 422);
        }
        $tableIds = validated_join_group_table_ids($areaId, $data['table_ids'] ?? []);

        $stmt = db()->prepare(
            'UPDATE table_join_groups
             SET area_id = :area_id, name = :name, max_tables = :max_tables,
                 active = :active, priority = :priority, updated_at = NOW()
             WHERE id = :id AND venue_id = :venue_id'
        );
        $stmt->execute([
            'area_id' => $areaId,
            'name' => $name,
            'max_tables' => nullable_int($data['max_tables'] ?? null),
            'active' => bool_int($data['active'] ?? true),
            'priority' => (int) ($data['priority'] ?? 0),
            'id' => $joinGroupId,
            'venue_id' => current_venue_id($manager),
        ]);
        save_table_join_group_tables($joinGroupId, $tableIds);
        log_activity((int) $manager['id'], 'updated', 'table_join_group', $joinGroupId);
        respond(['ok' => true]);
    }

    if (($segments[0] ?? '') === 'table-join-groups' && isset($segments[1]) && $method === 'DELETE') {
        $manager = require_manager();
        $joinGroupId = (int) $segments[1];
        if (scalar_query('SELECT COUNT(*) FROM table_join_groups WHERE id = ? AND venue_id = ?', [$joinGroupId, current_venue_id($manager)]) === 0) {
            fail('Join group not found.', 404);
        }

        db()->prepare('DELETE FROM table_join_groups WHERE id = :id AND venue_id = :venue_id')
            ->execute(['id' => $joinGroupId, 'venue_id' => current_venue_id($manager)]);
        log_activity((int) $manager['id'], 'deleted', 'table_join_group', $joinGroupId);
        respond(['ok' => true]);
    }

    if ($method === 'POST' && $route === 'tables') {
        $manager = require_manager();
        $data = json_body();
        $areaId = (int) ($data['area_id'] ?? 0);
        $tableNumber = (int) ($data['table_number'] ?? 0);

        ensure_area_exists($areaId);
        ensure_table_number_available($tableNumber);

        $stmt = db()->prepare(
            'INSERT INTO venue_tables
                (venue_id, area_id, table_number, capacity, active, auto_assign_enabled, joinable,
                 assignment_priority, preferred_min_guests, preferred_max_guests,
                 keep_for_walkins, accessibility_friendly, created_at, updated_at)
             VALUES
                (:venue_id, :area_id, :table_number, :capacity, :active, :auto_assign_enabled, :joinable,
                 :assignment_priority, :preferred_min_guests, :preferred_max_guests,
                 :keep_for_walkins, :accessibility_friendly, NOW(), NOW())'
        );
        $stmt->execute([
            'venue_id' => current_venue_id($manager),
            'area_id' => $areaId,
            'table_number' => $tableNumber,
            'capacity' => max((int) ($data['capacity'] ?? 8), 1),
            'active' => bool_int($data['active'] ?? true),
            'auto_assign_enabled' => bool_int($data['auto_assign_enabled'] ?? true),
            'joinable' => bool_int($data['joinable'] ?? true),
            'assignment_priority' => (int) ($data['assignment_priority'] ?? 0),
            'preferred_min_guests' => nullable_int($data['preferred_min_guests'] ?? null),
            'preferred_max_guests' => nullable_int($data['preferred_max_guests'] ?? null),
            'keep_for_walkins' => bool_int($data['keep_for_walkins'] ?? false),
            'accessibility_friendly' => bool_int($data['accessibility_friendly'] ?? false),
        ]);
        $tableId = (int) db()->lastInsertId();
        attach_table_to_single_join_group($areaId, $tableId);
        sync_area_table_range($areaId);
        log_activity((int) $manager['id'], 'created', 'table', $tableId);
        respond(['ok' => true, 'id' => $tableId], 201);
    }

    if (($segments[0] ?? '') === 'tables' && isset($segments[1]) && $method === 'PUT') {
        $manager = require_manager();
        $data = json_body();
        $tableId = (int) $segments[1];
        $existingStmt = db()->prepare('SELECT * FROM venue_tables WHERE id = :id AND venue_id = :venue_id');
        $existingStmt->execute(['id' => $tableId, 'venue_id' => current_venue_id($manager)]);
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
             SET area_id = :area_id, table_number = :table_number, capacity = :capacity, active = :active,
                 auto_assign_enabled = :auto_assign_enabled, joinable = :joinable,
                 assignment_priority = :assignment_priority, preferred_min_guests = :preferred_min_guests,
                 preferred_max_guests = :preferred_max_guests, keep_for_walkins = :keep_for_walkins,
                 accessibility_friendly = :accessibility_friendly, updated_at = NOW()
             WHERE id = :id AND venue_id = :venue_id'
        );
        $stmt->execute([
            'area_id' => $areaId,
            'table_number' => $tableNumber,
            'capacity' => max((int) ($data['capacity'] ?? 8), 1),
            'active' => bool_int($data['active'] ?? true),
            'auto_assign_enabled' => bool_int($data['auto_assign_enabled'] ?? true),
            'joinable' => bool_int($data['joinable'] ?? true),
            'assignment_priority' => (int) ($data['assignment_priority'] ?? 0),
            'preferred_min_guests' => nullable_int($data['preferred_min_guests'] ?? null),
            'preferred_max_guests' => nullable_int($data['preferred_max_guests'] ?? null),
            'keep_for_walkins' => bool_int($data['keep_for_walkins'] ?? false),
            'accessibility_friendly' => bool_int($data['accessibility_friendly'] ?? false),
            'id' => $tableId,
            'venue_id' => current_venue_id($manager),
        ]);
        if ($areaId !== (int) $existing['area_id']) {
            db()->prepare('DELETE FROM table_join_group_tables WHERE table_id = :table_id')
                ->execute(['table_id' => $tableId]);
            attach_table_to_single_join_group($areaId, $tableId);
        }
        sync_area_table_range((int) $existing['area_id']);
        sync_area_table_range($areaId);
        log_activity((int) $manager['id'], 'updated', 'table', $tableId);
        respond(['ok' => true]);
    }

    if (($segments[0] ?? '') === 'tables' && isset($segments[1]) && $method === 'DELETE') {
        $manager = require_manager();
        $tableId = (int) $segments[1];
        $stmt = db()->prepare('SELECT area_id FROM venue_tables WHERE id = :id AND venue_id = :venue_id');
        $stmt->execute(['id' => $tableId, 'venue_id' => current_venue_id($manager)]);
        $table = $stmt->fetch();
        if (!$table) {
            fail('Table not found.', 404);
        }

        if (scalar_query('SELECT COUNT(*) FROM booking_tables WHERE table_id = ?', [$tableId]) > 0) {
            fail('This table is used by existing bookings. Mark it not reservable instead.', 409);
        }

        db()->prepare('DELETE FROM venue_tables WHERE id = :id AND venue_id = :venue_id')
            ->execute(['id' => $tableId, 'venue_id' => current_venue_id($manager)]);
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
        if (scalar_query('SELECT COUNT(*) FROM areas WHERE venue_id = ? AND code = ?', [current_venue_id($manager), $code]) > 0) {
            fail('That area code already exists.', 409, ['code' => $code]);
        }

        $sortOrder = array_key_exists('sort_order', $data)
            ? (int) $data['sort_order']
            : scalar_query('SELECT COALESCE(MAX(sort_order), 0) + 10 FROM areas WHERE venue_id = ?', [current_venue_id($manager)]);
        $stmt = db()->prepare(
            'INSERT INTO areas
                (venue_id, code, name, table_start, table_end, function_enabled, auto_assign_enabled,
                 allow_table_joins, max_joined_tables, assignment_priority,
                 preferred_min_guests, preferred_max_guests, active, sort_order)
             VALUES
                (:venue_id, :code, :name, 0, 0, :function_enabled, :auto_assign_enabled,
                 :allow_table_joins, :max_joined_tables, :assignment_priority,
                 :preferred_min_guests, :preferred_max_guests, 1, :sort_order)'
        );
        $stmt->execute([
            'venue_id' => current_venue_id($manager),
            'code' => $code,
            'name' => $name,
            'function_enabled' => bool_int($data['function_enabled'] ?? false),
            'auto_assign_enabled' => bool_int($data['auto_assign_enabled'] ?? true),
            'allow_table_joins' => bool_int($data['allow_table_joins'] ?? true),
            'max_joined_tables' => nullable_int($data['max_joined_tables'] ?? 4),
            'assignment_priority' => (int) ($data['assignment_priority'] ?? 0),
            'preferred_min_guests' => nullable_int($data['preferred_min_guests'] ?? null),
            'preferred_max_guests' => nullable_int($data['preferred_max_guests'] ?? null),
            'sort_order' => $sortOrder,
        ]);
        $areaId = (int) db()->lastInsertId();
        create_default_join_group_for_area($areaId, $name, $sortOrder);
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
        if (scalar_query('SELECT COUNT(*) FROM areas WHERE venue_id = ? AND code = ? AND id <> ?', [current_venue_id($manager), $code, $areaId]) > 0) {
            fail('That area code already exists.', 409, ['code' => $code]);
        }

        $stmt = db()->prepare(
            'UPDATE areas
             SET code = :code, name = :name, function_enabled = :function_enabled,
                 auto_assign_enabled = :auto_assign_enabled, allow_table_joins = :allow_table_joins,
                 max_joined_tables = :max_joined_tables, assignment_priority = :assignment_priority,
                 preferred_min_guests = :preferred_min_guests, preferred_max_guests = :preferred_max_guests,
                 sort_order = :sort_order
             WHERE id = :id AND venue_id = :venue_id'
        );
        $stmt->execute([
            'code' => $code,
            'name' => $name,
            'function_enabled' => bool_int($data['function_enabled'] ?? false),
            'auto_assign_enabled' => bool_int($data['auto_assign_enabled'] ?? true),
            'allow_table_joins' => bool_int($data['allow_table_joins'] ?? true),
            'max_joined_tables' => nullable_int($data['max_joined_tables'] ?? null),
            'assignment_priority' => (int) ($data['assignment_priority'] ?? 0),
            'preferred_min_guests' => nullable_int($data['preferred_min_guests'] ?? null),
            'preferred_max_guests' => nullable_int($data['preferred_max_guests'] ?? null),
            'sort_order' => (int) ($data['sort_order'] ?? 0),
            'id' => $areaId,
            'venue_id' => current_venue_id($manager),
        ]);
        log_activity((int) $manager['id'], 'updated', 'area', $areaId);
        respond(['ok' => true]);
    }

    if (($segments[0] ?? '') === 'areas' && isset($segments[1]) && $method === 'DELETE') {
        $manager = require_manager();
        $areaId = (int) $segments[1];
        ensure_area_exists($areaId);
        if (scalar_query('SELECT COUNT(*) FROM venue_tables WHERE venue_id = ? AND area_id = ?', [current_venue_id($manager), $areaId]) > 0) {
            fail('Move or delete this area’s tables before removing the area.', 409);
        }

        try {
            db()->prepare('DELETE FROM areas WHERE id = :id AND venue_id = :venue_id')
                ->execute(['id' => $areaId, 'venue_id' => current_venue_id($manager)]);
        } catch (PDOException) {
            db()->prepare('UPDATE areas SET active = 0 WHERE id = :id AND venue_id = :venue_id')
                ->execute(['id' => $areaId, 'venue_id' => current_venue_id($manager)]);
        }

        log_activity((int) $manager['id'], 'deleted', 'area', $areaId);
        respond(['ok' => true]);
    }

    if ($method === 'GET' && $route === 'ai-logs') {
        $manager = require_manager();
        $stmt = db()->prepare(
            'SELECT l.*, b.booking_reference, b.booking_date, b.start_time,
                    COALESCE(NULLIF(b.customer_name_snapshot, ""), c.name) AS customer_name,
                    a.name AS suggested_area_name
             FROM ai_assignment_logs l
             JOIN bookings b ON b.id = l.booking_id
             JOIN customers c ON c.id = b.customer_id
             LEFT JOIN areas a ON a.id = l.suggested_area_id
             WHERE l.venue_id = :venue_id
             ORDER BY l.created_at DESC
             LIMIT 100'
        );
        $stmt->execute(['venue_id' => current_venue_id($manager)]);
        $items = $stmt->fetchAll();
        respond(['items' => $items]);
    }

    if ($method === 'GET' && $route === 'email-logs') {
        $manager = require_manager();
        $stmt = db()->prepare(
            'SELECT e.*, b.booking_reference
             FROM email_logs e
             LEFT JOIN bookings b ON b.id = e.booking_id
             WHERE e.venue_id = :venue_id
             ORDER BY e.created_at DESC
             LIMIT 100'
        );
        $stmt->execute(['venue_id' => current_venue_id($manager)]);
        $items = $stmt->fetchAll();
        respond(['items' => $items]);
    }

    if ($method === 'GET' && $route === 'activity-logs') {
        $manager = require_manager();
        $stmt = db()->prepare(
            'SELECT l.*, u.name AS user_name
             FROM activity_logs l
             LEFT JOIN users u ON u.id = l.user_id
             WHERE l.venue_id = :venue_id
             ORDER BY l.created_at DESC
             LIMIT 100'
        );
        $stmt->execute(['venue_id' => current_venue_id($manager)]);
        $items = $stmt->fetchAll();
        respond(['items' => $items]);
    }

    if ($method === 'GET' && $route === 'users') {
        $manager = require_manager();
        $stmt = db()->prepare(
            'SELECT u.id, u.name, u.email, u.role, u.status, u.avatar_url, u.created_at, u.updated_at,
                    uv.role AS venue_role
             FROM users u
             JOIN user_venues uv ON uv.user_id = u.id
             WHERE uv.venue_id = :venue_id
             ORDER BY u.created_at DESC'
        );
        $stmt->execute(['venue_id' => current_venue_id($manager)]);
        $items = $stmt->fetchAll();
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
        $newUserId = (int) db()->lastInsertId();
        db()->prepare(
            'INSERT IGNORE INTO user_venues (user_id, venue_id, role, created_at, updated_at)
             VALUES (:user_id, :venue_id, "manager", NOW(), NOW())'
        )->execute(['user_id' => $newUserId, 'venue_id' => current_venue_id($manager)]);
        log_activity((int) $manager['id'], 'created', 'user', $newUserId);
        respond(['ok' => true], 201);
    }

    if (($segments[0] ?? '') === 'users' && isset($segments[1]) && $method === 'PUT') {
        $manager = require_manager();
        $data = json_body();
        $targetUserId = (int) $segments[1];
        $existingStmt = db()->prepare(
            'SELECT u.id, u.role, u.status
             FROM users u
             JOIN user_venues uv ON uv.user_id = u.id
             WHERE u.id = :id AND uv.venue_id = :venue_id
             LIMIT 1'
        );
        $existingStmt->execute(['id' => $targetUserId, 'venue_id' => current_venue_id($manager)]);
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
                    'SELECT COUNT(*)
                     FROM users u
                     JOIN user_venues uv ON uv.user_id = u.id
                     WHERE uv.venue_id = ? AND u.role = "manager" AND u.status = "active" AND u.id <> ?',
                    [current_venue_id($manager), $targetUserId]
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
                'INSERT INTO opening_hours (venue_id, day_of_week, opens_at, closes_at, is_closed, updated_at)
                 VALUES (:venue_id, :day_of_week, :opens_at, :closes_at, :is_closed, NOW())
                 ON DUPLICATE KEY UPDATE
                    opens_at = VALUES(opens_at),
                    closes_at = VALUES(closes_at),
                    is_closed = VALUES(is_closed),
                    updated_at = NOW()'
            );

            foreach ($data['opening_hours'] as $hours) {
                $stmt->execute([
                    'venue_id' => current_venue_id($manager),
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
