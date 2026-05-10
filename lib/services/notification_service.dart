import 'dart:convert';
import '../models/notification_model.dart';
import 'http_service.dart';

class NotificationService {
  static Future<List<AppNotification>> fetchAll({bool unreadOnly = false}) async {
    final qs = unreadOnly ? '?unread=true' : '';
    final res = await HttpService.get('/api/notifications$qs');
    if (res.statusCode != 200) return [];
    try {
      final decoded = jsonDecode(res.body);
      final list = decoded is List ? decoded : (decoded['data'] ?? []);
      return (list as List)
          .map((e) => AppNotification.fromJson(Map<String, dynamic>.from(e)))
          .toList();
    } catch (_) {
      return [];
    }
  }

  static Future<int> unreadCount() async {
    final res = await HttpService.get('/api/notifications/unread-count');
    if (res.statusCode != 200) return 0;
    try {
      final decoded = jsonDecode(res.body);
      final data = decoded is Map<String, dynamic>
          ? (decoded['data'] ?? decoded)
          : {};
      final raw = (data is Map) ? data['count'] : null;
      if (raw is num) return raw.toInt();
      if (raw is String) return int.tryParse(raw) ?? 0;
      return 0;
    } catch (_) {
      return 0;
    }
  }

  static Future<bool> markRead(String id) async {
    final res = await HttpService.patch('/api/notifications/$id/read', {});
    return res.statusCode >= 200 && res.statusCode < 300;
  }

  static Future<bool> markAllRead() async {
    final res = await HttpService.post('/api/notifications/read-all', {});
    return res.statusCode >= 200 && res.statusCode < 300;
  }
}
