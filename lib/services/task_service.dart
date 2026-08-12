import 'dart:convert';
import 'http_service.dart';

/// Wraps the /api/tasks endpoints that power the master task list, the
/// forwarded-to-me inbox and the forward/status actions. Mirrors the web
/// admin/staff task screens. Backend is offset-paginated
/// (`page`/`limit` in, `meta:{page,limit,total,totalPages}` out).
class TaskService {
  /// GET /api/tasks/all — office-wide master task list (any authenticated
  /// user; STAFF automatically has OFFICE-source tasks filtered out server-side).
  /// Returns `(rows, totalPages)`.
  static Future<({List<Map<String, dynamic>> rows, int totalPages})> getAllTasks({
    int page = 1,
    int limit = 20,
    String? status,
    String? taskType,
    String? assignedToId,
    String? search,
  }) async {
    final qp = <String, String>{'page': '$page', 'limit': '$limit'};
    if (status != null && status != 'All') qp['status'] = status;
    if (taskType != null && taskType != 'All') qp['taskType'] = taskType;
    if (assignedToId != null && assignedToId.isNotEmpty) {
      qp['assignedToId'] = assignedToId;
    }
    if (search != null && search.trim().isNotEmpty) qp['search'] = search.trim();
    final qs = Uri(queryParameters: qp).query;

    final res = await HttpService.get('/api/tasks/all?$qs');
    if (res.statusCode != 200) return (rows: <Map<String, dynamic>>[], totalPages: 1);
    try {
      final decoded = jsonDecode(res.body);
      final List list = decoded is List ? decoded : (decoded['data'] ?? []);
      final int totalPages = (decoded is Map && decoded['meta'] is Map)
          ? ((decoded['meta']['totalPages'] as num?)?.toInt() ?? 1)
          : 1;
      return (
        rows: list
            .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
            .toList(),
        totalPages: totalPages == 0 ? 1 : totalPages,
      );
    } catch (_) {
      return (rows: <Map<String, dynamic>>[], totalPages: 1);
    }
  }

  /// GET /api/tasks/forwarded — tasks + grievances forwarded to the caller.
  static Future<List<Map<String, dynamic>>> getForwarded() async {
    final res = await HttpService.get('/api/tasks/forwarded');
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

  /// GET /api/tasks/staff — active STAFF users for the forward picker (admin).
  static Future<List<Map<String, dynamic>>> getStaff() async {
    final res = await HttpService.get('/api/tasks/staff');
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

  /// PATCH /api/tasks/:id/forward — reassign a task to another user.
  /// Returns (ok, message).
  static Future<({bool ok, String message})> forward(
    String taskId, {
    required String recipientId,
    String? remark,
  }) async {
    final body = <String, dynamic>{'recipientId': recipientId};
    if (remark != null && remark.trim().isNotEmpty) body['remark'] = remark.trim();
    final res = await HttpService.patch('/api/tasks/$taskId/forward', body);
    final ok = res.statusCode >= 200 && res.statusCode < 300;
    String msg = ok ? 'Task forwarded' : 'Failed to forward task';
    try {
      msg = jsonDecode(res.body)['message'] ?? msg;
    } catch (_) {}
    return (ok: ok, message: msg);
  }

  /// PATCH /api/tasks/:id/status — admin status override.
  static Future<({bool ok, String message})> updateStatus(
    String taskId,
    String status,
  ) async {
    final res =
        await HttpService.patch('/api/tasks/$taskId/status', {'status': status});
    final ok = res.statusCode >= 200 && res.statusCode < 300;
    String msg = ok ? 'Status updated' : 'Failed to update status';
    try {
      msg = jsonDecode(res.body)['message'] ?? msg;
    } catch (_) {}
    return (ok: ok, message: msg);
  }

  /// PATCH /api/tasks/:id — edit a task's core fields (admin). Send only the
  /// fields that changed. Mirrors the web "Edit Task" form. Returns
  /// (ok, message) with the backend message surfaced on failure.
  static Future<({bool ok, String message})> updateTask(
    String taskId,
    Map<String, dynamic> body,
  ) async {
    final res = await HttpService.patch('/api/tasks/$taskId', body);
    final ok = res.statusCode >= 200 && res.statusCode < 300;
    String msg = ok ? 'Task updated' : 'Failed to update task';
    try {
      msg = jsonDecode(res.body)['message'] ?? msg;
    } catch (_) {}
    return (ok: ok, message: msg);
  }
}
