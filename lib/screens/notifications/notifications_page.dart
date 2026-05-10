import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../models/notification_model.dart';
import '../../services/notification_service.dart';
import '../../utils/access_control.dart';
import '../../utils/app_navigator.dart';

class NotificationsPage extends StatefulWidget {
  final String role;
  const NotificationsPage({super.key, required this.role});

  @override
  State<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends State<NotificationsPage> {
  static const Color primarySaffron = Color(0xFFF59E0B);
  static const Color darkSaffron = Color(0xFF92400E);

  bool _loading = true;
  bool _busyMarkingAll = false;
  List<AppNotification> _items = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    // Bell list = unread queue only. Once tapped or marked read, an item
    // disappears from this view (it's still in the DB / history).
    final list = await NotificationService.fetchAll(unreadOnly: true);
    if (!mounted) return;
    setState(() {
      _items = list;
      _loading = false;
    });
  }

  Future<void> _markAllRead() async {
    if (_busyMarkingAll) return;
    setState(() => _busyMarkingAll = true);
    final ok = await NotificationService.markAllRead();
    if (!mounted) {
      return;
    }
    setState(() {
      _busyMarkingAll = false;
      // Once everything is marked read, the unread queue is empty.
      if (ok) _items = [];
    });
    if (ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('All notifications cleared')),
      );
    }
  }

  Future<void> _onTap(AppNotification n) async {
    // Optimistic: remove from the unread list immediately. Fire-and-forget
    // the backend call — if it fails, next pull-to-refresh will resync.
    setState(() {
      _items = _items.where((x) => x.id != n.id).toList();
    });
    NotificationService.markRead(n.id);
    _routeFor(n);
  }

  void _routeFor(AppNotification n) {
    final role = widget.role;
    switch (n.type) {
      case 'TASK_ASSIGNED':
        if (role == Roles.staff) {
          AppNavigator.toStaffTasks(context);
        } else {
          AppNavigator.toTaskList(context, role: role);
        }
        break;
      case 'TOUR_DECIDED':
        if (role == Roles.staff) {
          AppNavigator.toEventReports(context);
        } else {
          AppNavigator.toTourQueue(context);
        }
        break;
      case 'NEWS_CRITICAL':
        AppNavigator.toNewsList(context, role: role);
        break;
      case 'GRIEVANCE_REJECTED':
        AppNavigator.toRejectedGrievances(context, role: role);
        break;
      default:
        // Unknown type — just stay on the list.
        break;
    }
  }

  IconData _iconFor(String type) {
    switch (type) {
      case 'TASK_ASSIGNED':
        return Icons.task_alt;
      case 'TOUR_DECIDED':
        return Icons.event_available;
      case 'NEWS_CRITICAL':
        return Icons.campaign;
      case 'GRIEVANCE_REJECTED':
        return Icons.report_gmailerrorred;
      default:
        return Icons.notifications;
    }
  }

  Color _colorFor(String type) {
    switch (type) {
      case 'TASK_ASSIGNED':
        return const Color(0xFF2563EB);
      case 'TOUR_DECIDED':
        return const Color(0xFF059669);
      case 'NEWS_CRITICAL':
        return const Color(0xFFDC2626);
      case 'GRIEVANCE_REJECTED':
        return const Color(0xFFB45309);
      default:
        return Colors.indigo;
    }
  }

  String _relativeTime(DateTime? dt) {
    if (dt == null) return '';
    final diff = DateTime.now().difference(dt);
    if (diff.inSeconds < 60) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return DateFormat('d MMM').format(dt);
  }

  @override
  Widget build(BuildContext context) {
    final unread = _items.where((n) => !n.isRead).length;
    return Scaffold(
      backgroundColor: const Color(0xFFFFF7ED),
      appBar: AppBar(
        elevation: 0,
        backgroundColor: Colors.transparent,
        flexibleSpace: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              colors: [primarySaffron, darkSaffron],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
        ),
        title: const Text(
          'Notifications',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
        ),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          if (unread > 0)
            TextButton(
              onPressed: _busyMarkingAll ? null : _markAllRead,
              child: Text(
                _busyMarkingAll ? 'Marking…' : 'Mark all read',
                style: const TextStyle(color: Colors.white),
              ),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_items.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [
          SizedBox(height: 120),
          Icon(Icons.notifications_off_outlined,
              size: 72, color: Colors.black26),
          SizedBox(height: 12),
          Center(
            child: Text(
              'You\'re all caught up',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: Colors.black54,
              ),
            ),
          ),
          SizedBox(height: 6),
          Center(
            child: Text(
              'No notifications yet',
              style: TextStyle(color: Colors.black45),
            ),
          ),
        ],
      );
    }
    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
      itemBuilder: (_, i) => _tile(_items[i]),
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemCount: _items.length,
    );
  }

  Widget _tile(AppNotification n) {
    final color = _colorFor(n.type);
    return Material(
      color: n.isRead ? Colors.white : const Color(0xFFFFF3E0),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => _onTap(n),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: color.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(_iconFor(n.type), color: color, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            n.title,
                            style: TextStyle(
                              fontWeight:
                                  n.isRead ? FontWeight.w500 : FontWeight.w700,
                              fontSize: 14,
                            ),
                          ),
                        ),
                        if (!n.isRead)
                          Container(
                            width: 8,
                            height: 8,
                            decoration: const BoxDecoration(
                              color: Colors.redAccent,
                              shape: BoxShape.circle,
                            ),
                          ),
                      ],
                    ),
                    if (n.body.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        n.body,
                        style: const TextStyle(
                          color: Colors.black87,
                          fontSize: 13,
                        ),
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                    const SizedBox(height: 6),
                    Text(
                      _relativeTime(n.createdAt),
                      style: TextStyle(
                        color: Colors.grey.shade600,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
