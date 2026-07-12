import 'dart:convert';
import 'http_service.dart';

/// Wraps GET /api/activity (admin-only) — the global "who did what" feed.
/// Each row: `entity`, `entityId`, `label`, `action` (CREATED|EDITED),
/// `at` (timestamp string), `byId`, `by` (actor name string).
class ActivityService {
  static Future<({List<Map<String, dynamic>> rows, int totalPages})> list({
    int page = 1,
    int limit = 50,
    String? entity,
    String? action,
    String? search,
  }) async {
    final qp = <String, String>{'page': '$page', 'limit': '$limit'};
    if (entity != null && entity.isNotEmpty && entity != 'All') qp['entity'] = entity;
    if (action != null && action.isNotEmpty && action != 'All') qp['action'] = action;
    if (search != null && search.trim().isNotEmpty) qp['search'] = search.trim();
    final qs = Uri(queryParameters: qp).query;

    final res = await HttpService.get('/api/activity?$qs');
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
}
