import 'dart:convert';

import 'http_service.dart';

enum AttendanceStatus { present, halfDay, leave, absent }

extension AttendanceStatusX on AttendanceStatus {
  String get wire {
    switch (this) {
      case AttendanceStatus.present:
        return 'PRESENT';
      case AttendanceStatus.halfDay:
        return 'HALF_DAY';
      case AttendanceStatus.leave:
        return 'LEAVE';
      case AttendanceStatus.absent:
        return 'ABSENT';
    }
  }

  String get label {
    switch (this) {
      case AttendanceStatus.present:
        return 'Present';
      case AttendanceStatus.halfDay:
        return 'Half Day';
      case AttendanceStatus.leave:
        return 'Leave';
      case AttendanceStatus.absent:
        return 'Absent';
    }
  }

  static AttendanceStatus? fromWire(String? s) {
    switch (s) {
      case 'PRESENT':
        return AttendanceStatus.present;
      case 'HALF_DAY':
        return AttendanceStatus.halfDay;
      case 'LEAVE':
        return AttendanceStatus.leave;
      case 'ABSENT':
        return AttendanceStatus.absent;
      default:
        return null;
    }
  }
}

class AttendanceRecord {
  final String id;
  final String userId;
  final String userName;
  final String userRole;
  final String date;
  final AttendanceStatus status;
  final String? reason;
  final String? markedAt;
  final String? checkOutAt;

  AttendanceRecord({
    required this.id,
    required this.userId,
    required this.userName,
    required this.userRole,
    required this.date,
    required this.status,
    required this.reason,
    required this.markedAt,
    required this.checkOutAt,
  });

  factory AttendanceRecord.fromJson(Map<String, dynamic> json) {
    return AttendanceRecord(
      id: json['id']?.toString() ?? '',
      userId: json['userId']?.toString() ?? '',
      userName: json['userName']?.toString() ?? '',
      userRole: json['userRole']?.toString() ?? '',
      date: json['date']?.toString() ?? '',
      status: AttendanceStatusX.fromWire(json['status']?.toString()) ??
          AttendanceStatus.absent,
      reason: json['reason']?.toString(),
      markedAt: json['markedAt']?.toString(),
      checkOutAt: json['checkOutAt']?.toString(),
    );
  }
}

class AttendanceStats {
  final String date;
  final int totalStaff;
  final int present;
  final int halfDay;
  final int leave;
  final int absent;

  AttendanceStats({
    required this.date,
    required this.totalStaff,
    required this.present,
    required this.halfDay,
    required this.leave,
    required this.absent,
  });

  factory AttendanceStats.empty() => AttendanceStats(
      date: '', totalStaff: 0, present: 0, halfDay: 0, leave: 0, absent: 0);

  factory AttendanceStats.fromJson(Map<String, dynamic> json) {
    return AttendanceStats(
      date: json['date']?.toString() ?? '',
      totalStaff: _asInt(json['totalStaff']),
      present: _asInt(json['present']),
      halfDay: _asInt(json['halfDay']),
      leave: _asInt(json['leave']),
      absent: _asInt(json['absent']),
    );
  }
}

class AttendanceAggregateRow {
  final String userId;
  final String userName;
  final int present;
  final int halfDay;
  final int leave;
  final int totalMarked;

  AttendanceAggregateRow({
    required this.userId,
    required this.userName,
    required this.present,
    required this.halfDay,
    required this.leave,
    required this.totalMarked,
  });

  factory AttendanceAggregateRow.fromJson(Map<String, dynamic> json) {
    return AttendanceAggregateRow(
      userId: json['userId']?.toString() ?? '',
      userName: json['userName']?.toString() ?? '',
      present: _asInt(json['present']),
      halfDay: _asInt(json['halfDay']),
      leave: _asInt(json['leave']),
      totalMarked: _asInt(json['totalMarked']),
    );
  }
}

class AttendanceAggregate {
  final String startDate;
  final String endDate;
  final int totalStaff;
  final List<AttendanceAggregateRow> staff;

  AttendanceAggregate({
    required this.startDate,
    required this.endDate,
    required this.totalStaff,
    required this.staff,
  });

  factory AttendanceAggregate.empty() => AttendanceAggregate(
      startDate: '', endDate: '', totalStaff: 0, staff: const []);
}

class AttendanceHistoryPage {
  final List<AttendanceRecord> rows;
  final String? nextCursor;

  AttendanceHistoryPage({required this.rows, required this.nextCursor});
}

int _asInt(dynamic v) {
  if (v is int) return v;
  if (v is num) return v.toInt();
  return int.tryParse('$v') ?? 0;
}

/// Thin wrapper around the deployed `/api/attendance` endpoints. Throws
/// [AttendanceException] on non-2xx so callers can surface backend messages.
class AttendanceService {
  /// POST /api/attendance — staff marks attendance. `date` is only meaningful
  /// for HALF_DAY / LEAVE (backend rejects past/non-today for PRESENT).
  static Future<AttendanceRecord> mark({
    required AttendanceStatus status,
    String? reason,
    String? date,
  }) async {
    final body = <String, dynamic>{'status': status.wire};
    if (reason != null && reason.trim().isNotEmpty) body['reason'] = reason.trim();
    if (date != null && date.isNotEmpty) body['date'] = date;

    final res = await HttpService.post('/api/attendance', body);
    final decoded = _decode(res.body);
    if (res.statusCode == 200 || res.statusCode == 201) {
      final data = decoded['data'];
      return AttendanceRecord.fromJson(Map<String, dynamic>.from(data as Map));
    }
    throw AttendanceException(
      _extractMessage(decoded, res.statusCode),
      res.statusCode,
    );
  }

  /// POST /api/attendance/checkout — stamps `checkOutAt` on today's row.
  /// Backend requires the user to already be PRESENT/HALF_DAY today (rejects
  /// unmarked days and LEAVE days). Re-tapping just refreshes the timestamp.
  static Future<AttendanceRecord> checkOut() async {
    final res = await HttpService.post('/api/attendance/checkout', {});
    final decoded = _decode(res.body);
    if (res.statusCode == 200 || res.statusCode == 201) {
      final data = decoded['data'];
      return AttendanceRecord.fromJson(Map<String, dynamic>.from(data as Map));
    }
    throw AttendanceException(
      _extractMessage(decoded, res.statusCode),
      res.statusCode,
    );
  }

  /// POST /api/attendance/leave-range — applies LEAVE for [startDate, endDate].
  /// Returns the API result including any days `skipped` because they were
  /// already PRESENT/HALF_DAY.
  static Future<Map<String, dynamic>> markLeaveRange({
    required String startDate,
    required String endDate,
    required String reason,
  }) async {
    final res = await HttpService.post('/api/attendance/leave-range', {
      'startDate': startDate,
      'endDate': endDate,
      'reason': reason.trim(),
    });
    final decoded = _decode(res.body);
    if (res.statusCode == 200 || res.statusCode == 201) {
      final data = decoded['data'];
      return data is Map
          ? Map<String, dynamic>.from(data)
          : <String, dynamic>{};
    }
    throw AttendanceException(
      _extractMessage(decoded, res.statusCode),
      res.statusCode,
    );
  }

  /// GET /api/attendance/me/today — null if not yet marked.
  static Future<AttendanceRecord?> getMyToday() async {
    final res = await HttpService.get('/api/attendance/me/today');
    if (res.statusCode != 200) {
      throw AttendanceException(
        _extractMessage(_decode(res.body), res.statusCode),
        res.statusCode,
      );
    }
    final decoded = _decode(res.body);
    final data = decoded['data'];
    if (data == null) return null;
    return AttendanceRecord.fromJson(Map<String, dynamic>.from(data as Map));
  }

  /// GET /api/attendance/me — paged history (newest first).
  static Future<AttendanceHistoryPage> getMyHistory({
    String? startDate,
    String? endDate,
    int limit = 50,
    String? cursor,
  }) async {
    final qp = <String, String>{'limit': '$limit'};
    if (startDate != null) qp['startDate'] = startDate;
    if (endDate != null) qp['endDate'] = endDate;
    if (cursor != null && cursor.isNotEmpty) qp['cursor'] = cursor;

    final res = await HttpService.get(_withQuery('/api/attendance/me', qp));
    if (res.statusCode != 200) {
      throw AttendanceException(
        _extractMessage(_decode(res.body), res.statusCode),
        res.statusCode,
      );
    }
    final decoded = _decode(res.body);
    final list = (decoded['data'] as List? ?? const [])
        .map<AttendanceRecord>(
            (e) => AttendanceRecord.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    final meta = decoded['meta'];
    final next = (meta is Map ? meta['nextCursor'] : null)?.toString();
    return AttendanceHistoryPage(
      rows: list,
      nextCursor: (next == null || next.isEmpty) ? null : next,
    );
  }

  /// GET /api/attendance — admin day view (pads in ABSENT entries when a single
  /// date is queried).
  static Future<List<AttendanceRecord>> getAllForDate(String date) async {
    final res =
        await HttpService.get(_withQuery('/api/attendance', {'date': date}));
    if (res.statusCode != 200) {
      throw AttendanceException(
        _extractMessage(_decode(res.body), res.statusCode),
        res.statusCode,
      );
    }
    final decoded = _decode(res.body);
    return (decoded['data'] as List? ?? const [])
        .map<AttendanceRecord>(
            (e) => AttendanceRecord.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  /// GET /api/attendance/stats — today's totals for the admin dashboard.
  static Future<AttendanceStats> getTodayStats() async {
    final res = await HttpService.get('/api/attendance/stats');
    if (res.statusCode != 200) {
      throw AttendanceException(
        _extractMessage(_decode(res.body), res.statusCode),
        res.statusCode,
      );
    }
    final decoded = _decode(res.body);
    final data = decoded['data'];
    if (data is Map) {
      return AttendanceStats.fromJson(Map<String, dynamic>.from(data));
    }
    return AttendanceStats.empty();
  }

  /// GET /api/attendance/aggregate — per-staff totals for admin month/year.
  static Future<AttendanceAggregate> getAggregate({
    required String startDate,
    required String endDate,
  }) async {
    final res = await HttpService.get(_withQuery('/api/attendance/aggregate', {
      'startDate': startDate,
      'endDate': endDate,
    }));
    if (res.statusCode != 200) {
      throw AttendanceException(
        _extractMessage(_decode(res.body), res.statusCode),
        res.statusCode,
      );
    }
    final decoded = _decode(res.body);
    final data = decoded['data'];
    if (data is! Map) return AttendanceAggregate.empty();
    final staff = (data['staff'] as List? ?? const [])
        .map<AttendanceAggregateRow>((e) =>
            AttendanceAggregateRow.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    return AttendanceAggregate(
      startDate: data['startDate']?.toString() ?? startDate,
      endDate: data['endDate']?.toString() ?? endDate,
      totalStaff: _asInt(data['totalStaff']),
      staff: staff,
    );
  }

  static Map<String, dynamic> _decode(String body) {
    if (body.isEmpty) return const {};
    try {
      final decoded = jsonDecode(body);
      return decoded is Map ? Map<String, dynamic>.from(decoded) : const {};
    } catch (_) {
      return const {};
    }
  }

  static String _extractMessage(Map<String, dynamic> decoded, int status) {
    final msg = decoded['message']?.toString();
    if (msg != null && msg.isNotEmpty) return msg;
    final errs = decoded['errors'];
    if (errs is List && errs.isNotEmpty) {
      final first = errs.first;
      if (first is Map && first['message'] != null) {
        return first['message'].toString();
      }
    }
    return 'Request failed ($status)';
  }

  static String _withQuery(String path, Map<String, String> qp) {
    if (qp.isEmpty) return path;
    final q = qp.entries
        .map((e) =>
            '${Uri.encodeQueryComponent(e.key)}=${Uri.encodeQueryComponent(e.value)}')
        .join('&');
    return '$path?$q';
  }
}

class AttendanceException implements Exception {
  final String message;
  final int statusCode;
  AttendanceException(this.message, this.statusCode);
  @override
  String toString() => message;
}
