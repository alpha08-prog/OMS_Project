import 'dart:convert';
import 'http_service.dart';

/// Wraps the admin-only /api/meetings CRUD endpoints. Mirrors the web
/// "Meetings" module (schedule meetings + record a summary per meeting).
///
/// Meeting fields (from the backend `shapeMeeting`): `id`, `title`,
/// `dateTime` (IST "YYYY-MM-DD HH:mm:ss"), `location`, `attendees` (plain
/// string), `agenda`, `status` (SCHEDULED|COMPLETED|CANCELLED), `summary`,
/// `googleSynced`, `createdBy{id,name,email}`, `createdAt`, `updatedAt`.
class MeetingService {
  /// GET /api/meetings — optionally scoped to `upcoming`/`past` and/or status.
  static Future<List<Map<String, dynamic>>> list({
    String? scope, // 'upcoming' | 'past'
    String? status, // SCHEDULED | COMPLETED | CANCELLED
    int page = 1,
    int limit = 100,
  }) async {
    final qp = <String, String>{'page': '$page', 'limit': '$limit'};
    if (scope != null && scope.isNotEmpty) qp['scope'] = scope;
    if (status != null && status.isNotEmpty && status != 'All') {
      qp['status'] = status;
    }
    final qs = Uri(queryParameters: qp).query;
    final res = await HttpService.get('/api/meetings?$qs');
    if (res.statusCode != 200) return [];
    try {
      final decoded = jsonDecode(res.body);
      final List list = decoded is List ? decoded : (decoded['data'] ?? []);
      return list
          .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
          .toList();
    } catch (_) {
      return [];
    }
  }

  /// POST /api/meetings — schedule a meeting. `dateTime` accepts any
  /// parseable date/time string (we send ISO). Returns (ok, message).
  static Future<({bool ok, String message})> create({
    required String title,
    required String dateTime,
    String? location,
    String? attendees,
    String? agenda,
    String? summary,
  }) async {
    final body = <String, dynamic>{'title': title, 'dateTime': dateTime};
    if (location != null && location.trim().isNotEmpty) body['location'] = location.trim();
    if (attendees != null && attendees.trim().isNotEmpty) body['attendees'] = attendees.trim();
    if (agenda != null && agenda.trim().isNotEmpty) body['agenda'] = agenda.trim();
    if (summary != null && summary.trim().isNotEmpty) body['summary'] = summary.trim();
    final res = await HttpService.post('/api/meetings', body);
    return _result(res, okMsg: 'Meeting scheduled');
  }

  /// PATCH /api/meetings/:id — partial update (edit details / set status /
  /// record summary).
  static Future<({bool ok, String message})> update(
    String id,
    Map<String, dynamic> patch,
  ) async {
    final res = await HttpService.patch('/api/meetings/$id', patch);
    return _result(res, okMsg: 'Meeting updated');
  }

  /// DELETE /api/meetings/:id
  static Future<({bool ok, String message})> delete(String id) async {
    final res = await HttpService.delete('/api/meetings/$id');
    return _result(res, okMsg: 'Meeting deleted');
  }

  static ({bool ok, String message}) _result(res, {required String okMsg}) {
    final ok = res.statusCode >= 200 && res.statusCode < 300;
    String msg = ok ? okMsg : 'Request failed';
    try {
      msg = jsonDecode(res.body)['message'] ?? msg;
    } catch (_) {}
    return (ok: ok, message: msg);
  }
}
