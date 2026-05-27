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

    $stmt = db()->prepare('SELECT id, name, email, role, status, created_at, updated_at FROM users WHERE id = :id AND status = "active"');
    $stmt->execute(['id' => $_SESSION['user_id']]);
    $user = $stmt->fetch();

    return $user ?: null;
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

function validate_booking_window(string $date, string $time, int $durationMinutes): array
{
    $dateObj = DateTime::createFromFormat('Y-m-d', $date);
    if (!$dateObj || $dateObj->format('Y-m-d') !== $date) {
        fail('Please choose a valid booking date.', 422, ['date' => $date]);
    }

    $today = new DateTime('today');
    if ($dateObj < $today) {
        fail('Bookings cannot be made in the past.', 422, ['date' => $date]);
    }

    if ($dateObj->format('m-d') === setting('annual_closed_day', '12-25')) {
        fail('Old Canberra Inn is closed on Christmas Day.', 422, ['date' => $date]);
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

function find_or_create_customer(array $data): int
{
    $email = strtolower(clean_string($data['email']));
    $name = clean_string($data['name']);
    $phone = clean_string($data['phone']);

    $stmt = db()->prepare('SELECT id FROM customers WHERE email = :email LIMIT 1');
    $stmt->execute(['email' => $email]);
    $existingId = $stmt->fetchColumn();

    if ($existingId !== false) {
        $update = db()->prepare('UPDATE customers SET name = :name, phone = :phone, updated_at = NOW() WHERE id = :id');
        $update->execute(['name' => $name, 'phone' => $phone, 'id' => $existingId]);

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

function create_email_log(int $bookingId, string $email, string $subject, string $body): void
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
        "SELECT vt.id, vt.table_number, vt.capacity, vt.area_id, a.name AS area_name
         FROM venue_tables vt
         JOIN areas a ON a.id = vt.area_id
         WHERE vt.active = 1
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
            'strategy' => 'Manager manual table assignment.',
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

    if ($guestCount < $minGuests) {
        fail("Online bookings are for groups of {$minGuests} or more. Smaller groups are welcome to walk in.", 422);
    }

    if ($guestCount > $maxGuests) {
        fail("Groups over {$maxGuests} guests should use the function request form.", 422);
    }

    [$startTime, $endTime] = validate_booking_window($date, $time, $durationMinutes);
    $recommendation = $manager
        ? manual_table_assignment(normalized_table_ids($data['table_ids'] ?? []), $guestCount, $date, $startTime, $endTime)
        : recommend_tables($guestCount, $date, $startTime, $endTime, $preferredAreaId);
    $customerId = find_or_create_customer(['name' => $name, 'email' => $email, 'phone' => $phone]);
    $reference = booking_reference();

    $stmt = db()->prepare(
        'INSERT INTO bookings
            (booking_reference, booking_type, status, customer_id, guest_count, booking_date, start_time, end_time,
             preferred_area_id, assigned_area_id, notes, staff_notes, created_by_user_id, updated_by_user_id, created_at, updated_at)
         VALUES
            (:reference, "table", "confirmed", :customer_id, :guest_count, :booking_date, :start_time, :end_time,
             :preferred_area_id, :assigned_area_id, :notes, :staff_notes, :created_by_user_id, :updated_by_user_id, NOW(), NOW())'
    );
    $stmt->execute([
        'reference' => $reference,
        'customer_id' => $customerId,
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

    if ($guestCount < 8) {
        fail('Function requests must be for at least 8 guests.', 422);
    }

    [$startTime, $endTime] = validate_booking_window($date, $time, $durationMinutes);
    $customerId = find_or_create_customer(['name' => $name, 'email' => $email, 'phone' => $phone]);
    $reference = booking_reference();

    $stmt = db()->prepare(
        'INSERT INTO bookings
            (booking_reference, booking_type, status, customer_id, guest_count, booking_date, start_time, end_time,
             preferred_area_id, notes, event_type, created_at, updated_at)
         VALUES
            (:reference, "function", "pending", :customer_id, :guest_count, :booking_date, :start_time, :end_time,
             :preferred_area_id, :notes, :event_type, NOW(), NOW())'
    );
    $stmt->execute([
        'reference' => $reference,
        'customer_id' => $customerId,
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
            (booking_reference, booking_type, status, customer_id, guest_count, booking_date, start_time, end_time,
             assigned_area_id, notes, staff_notes, event_type, manager_message, created_by_user_id, updated_by_user_id,
             created_at, updated_at)
         VALUES
            (:reference, "function", :status, :customer_id, :guest_count, :booking_date, :start_time, :end_time,
             :assigned_area_id, :notes, :staff_notes, :event_type, :manager_message, :created_by_user_id,
             :updated_by_user_id, NOW(), NOW())'
    );
    $stmt->execute([
        'reference' => $reference,
        'status' => $status,
        'customer_id' => $customerId,
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
        'SELECT b.*, c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone,
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
        $where .= ' AND (b.booking_reference LIKE :search OR c.name LIKE :search OR c.email LIKE :search OR c.phone LIKE :search)';
        $params['search'] = '%' . clean_string($_GET['search']) . '%';
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

    if ((string) $existing['booking_type'] === 'function') {
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

    if (array_key_exists('name', $data) || array_key_exists('email', $data) || array_key_exists('phone', $data)) {
        $customerName = clean_string($data['name'] ?? $existing['customer_name']);
        $customerEmail = strtolower(clean_string($data['email'] ?? $existing['customer_email']));
        $customerPhone = clean_string($data['phone'] ?? $existing['customer_phone']);
        validate_email_address($customerEmail);
        validate_phone_number($customerPhone);

        $customerStmt = db()->prepare('UPDATE customers SET name = :name, email = :email, phone = :phone, updated_at = NOW() WHERE id = :id');
        $customerStmt->execute([
            'name' => $customerName,
            'email' => $customerEmail,
            'phone' => $customerPhone,
            'id' => (int) $existing['customer_id'],
        ]);
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
    $shouldSendFunctionConfirmation = (string) $existing['booking_type'] === 'function'
        && $status !== ''
        && in_array($nextStatus, ['approved', 'confirmed'], true)
        && $nextStatus !== (string) $existing['status'];
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
    if ($booking && $shouldSendFunctionConfirmation) {
        create_function_confirmation_email($booking, $managerMessage);
    } elseif ($booking && $managerMessage !== '') {
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
        'SELECT b.*, c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone,
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
    $settings = [];
    foreach (db()->query('SELECT setting_key, setting_value FROM settings ORDER BY setting_key')->fetchAll() as $row) {
        $settings[$row['setting_key']] = $row['setting_value'];
    }

    return [
        'areas' => db()->query('SELECT id, code, name, function_enabled, active FROM areas WHERE active = 1 ORDER BY sort_order, id')->fetchAll(),
        'function_areas' => db()->query('SELECT id, code, name FROM areas WHERE active = 1 AND function_enabled = 1 ORDER BY sort_order, id')->fetchAll(),
        'settings' => $settings,
        'opening_hours' => db()->query('SELECT day_of_week, opens_at, closes_at, is_closed FROM opening_hours ORDER BY day_of_week')->fetchAll(),
    ];
}

function dashboard_payload(): array
{
    require_manager();
    $today = date('Y-m-d');
    $nextWeek = (new DateTime('+7 days'))->format('Y-m-d');

    $cards = [
        'today_bookings' => scalar_query('SELECT COUNT(*) FROM bookings WHERE booking_type = "table" AND booking_date = ?', [$today]),
        'pending_functions' => scalar_query('SELECT COUNT(*) FROM bookings WHERE booking_type = "function" AND status = "pending"', []),
        'guests_next_7_days' => scalar_query('SELECT COALESCE(SUM(guest_count), 0) FROM bookings WHERE booking_date BETWEEN ? AND ? AND status NOT IN ("cancelled", "declined", "no_show")', [$today, $nextWeek]),
        'emails_logged' => scalar_query('SELECT COUNT(*) FROM email_logs', []),
    ];

    $recent = db()->query(
        'SELECT b.id, b.booking_reference, b.booking_type, b.status, b.booking_date, b.start_time, b.guest_count,
                c.name AS customer_name, a.name AS assigned_area_name
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
                c.name AS customer_name, a.name AS assigned_area_name
         FROM bookings b
         JOIN customers c ON c.id = b.customer_id
         LEFT JOIN areas a ON a.id = b.assigned_area_id
         WHERE b.booking_date >= CURDATE()
           AND b.status NOT IN ("cancelled", "declined", "no_show")
         ORDER BY b.booking_date ASC, b.start_time ASC
         LIMIT 8'
    )->fetchAll();

    $activity = db()->query(
        'SELECT l.*, u.name AS user_name
         FROM activity_logs l
         LEFT JOIN users u ON u.id = l.user_id
         ORDER BY l.created_at DESC
         LIMIT 8'
    )->fetchAll();

    return [
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

try {
    $method = $_SERVER['REQUEST_METHOD'];
    $route = trim((string) ($_GET['r'] ?? 'meta'), '/');
    $segments = $route === '' ? [] : explode('/', $route);

    if ($method === 'GET' && $route === 'meta') {
        respond(meta_payload());
    }

    if ($method === 'POST' && $route === 'auth/login') {
        $data = json_body();
        require_fields($data, ['email', 'password']);

        $stmt = db()->prepare('SELECT id, name, email, role, password_hash, status FROM users WHERE email = :email LIMIT 1');
        $stmt->execute(['email' => strtolower(clean_string($data['email']))]);
        $user = $stmt->fetch();

        if (!$user || $user['status'] !== 'active' || !password_verify((string) $data['password'], $user['password_hash'])) {
            fail('Invalid email or password.', 401);
        }

        $_SESSION['user_id'] = (int) $user['id'];
        log_activity((int) $user['id'], 'signed_in', 'user', (int) $user['id']);
        unset($user['password_hash']);
        respond(['user' => $user]);
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

    if ($method === 'POST' && $route === 'public/table-bookings') {
        db()->beginTransaction();
        $result = create_table_booking(json_body());
        db()->commit();
        respond($result, 201);
    }

    if ($method === 'POST' && $route === 'public/function-requests') {
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

    if ($method === 'GET' && $route === 'calendar') {
        require_manager();
        $stmt = db()->query(
            booking_select_sql(null) .
            ' AND b.status NOT IN ("cancelled", "declined", "no_show")
             ORDER BY b.booking_date, b.start_time'
        );
        respond(['items' => $stmt->fetchAll()]);
    }

    if ($method === 'GET' && $route === 'tables') {
        require_manager();
        $areas = db()->query('SELECT * FROM areas ORDER BY sort_order, id')->fetchAll();
        $tables = db()->query('SELECT * FROM venue_tables ORDER BY table_number')->fetchAll();
        respond(['areas' => $areas, 'tables' => $tables]);
    }

    if (($segments[0] ?? '') === 'tables' && isset($segments[1]) && $method === 'PUT') {
        $manager = require_manager();
        $data = json_body();
        $stmt = db()->prepare('UPDATE venue_tables SET capacity = :capacity, active = :active, updated_at = NOW() WHERE id = :id');
        $stmt->execute([
            'capacity' => max((int) ($data['capacity'] ?? 8), 1),
            'active' => bool_int($data['active'] ?? true),
            'id' => (int) $segments[1],
        ]);
        log_activity((int) $manager['id'], 'updated', 'table', (int) $segments[1]);
        respond(['ok' => true]);
    }

    if ($method === 'GET' && $route === 'ai-logs') {
        require_manager();
        $items = db()->query(
            'SELECT l.*, b.booking_reference, b.booking_date, b.start_time, c.name AS customer_name, a.name AS suggested_area_name
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
        $items = db()->query('SELECT id, name, email, role, status, created_at, updated_at FROM users ORDER BY created_at DESC')->fetchAll();
        respond(['items' => $items]);
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
        $updates = ['updated_at = NOW()'];
        $params = ['id' => (int) $segments[1]];

        if (isset($data['name'])) {
            $updates[] = 'name = :name';
            $params['name'] = clean_string($data['name']);
        }
        if (isset($data['status'])) {
            $updates[] = 'status = :status';
            $params['status'] = clean_string($data['status']) === 'inactive' ? 'inactive' : 'active';
        }
        if (!empty($data['password'])) {
            $updates[] = 'password_hash = :password_hash';
            $params['password_hash'] = password_hash((string) $data['password'], PASSWORD_DEFAULT);
        }

        $stmt = db()->prepare('UPDATE users SET ' . implode(', ', $updates) . ' WHERE id = :id');
        $stmt->execute($params);
        log_activity((int) $manager['id'], 'updated', 'user', (int) $segments[1]);
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
            $stmt = db()->prepare(
                'INSERT INTO settings (setting_key, setting_value, updated_at)
                 VALUES (:setting_key, :setting_value, NOW())
                 ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()'
            );

            foreach ($data['settings'] as $key => $value) {
                $stmt->execute(['setting_key' => clean_string($key), 'setting_value' => clean_string($value)]);
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
