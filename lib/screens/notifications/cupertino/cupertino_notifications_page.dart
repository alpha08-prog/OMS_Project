import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show Material, InkWell;
import 'package:intl/intl.dart';

import '../../../models/notification_model.dart';
import '../../../services/notification_service.dart';
import '../../../utils/access_control.dart';
import '../../../utils/app_navigator.dart';

class CupertinoNotificationsPage extends StatefulWidget {
  final String role;
  const CupertinoNotificationsPage({super.key, required this.role});

  @override
  State<CupertinoNotificationsPage> createState() =>
      _CupertinoNotificationsPageState();
}

class _CupertinoNotificationsPageState
    extends State<CupertinoNotificationsPage> {
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
    if (!mounted) return;
    setState(() {
      _busyMarkingAll = false;
      if (ok) _items = [];
    });
  }

  Future<void> _onTap(AppNotification n) async {
    // Optimistic: remove from the unread list immediately. Backend call
    // is fire-and-forget; next pull-to-refresh resyncs on failure.
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
        break;
    }
  }

  IconData _iconFor(String type) {
    switch (type) {
      case 'TASK_ASSIGNED':
        return CupertinoIcons.checkmark_seal;
      case 'TOUR_DECIDED':
        return CupertinoIcons.calendar_badge_plus;
      case 'NEWS_CRITICAL':
        return CupertinoIcons.exclamationmark_bubble;
      case 'GRIEVANCE_REJECTED':
        return CupertinoIcons.xmark_octagon;
      default:
        return CupertinoIcons.bell;
    }
  }

  Color _colorFor(String type) {
    switch (type) {
      case 'TASK_ASSIGNED':
        return CupertinoColors.activeBlue;
      case 'TOUR_DECIDED':
        return CupertinoColors.activeGreen;
      case 'NEWS_CRITICAL':
        return CupertinoColors.systemRed;
      case 'GRIEVANCE_REJECTED':
        return CupertinoColors.systemOrange;
      default:
        return CupertinoColors.activeBlue;
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
    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: const Text('Notifications'),
        trailing: unread > 0
            ? CupertinoButton(
                padding: EdgeInsets.zero,
                onPressed: _busyMarkingAll ? null : _markAllRead,
                child: Text(_busyMarkingAll ? 'Marking…' : 'Mark all read'),
              )
            : null,
      ),
      child: SafeArea(
        child: CustomScrollView(
          physics: const BouncingScrollPhysics(
            parent: AlwaysScrollableScrollPhysics(),
          ),
          slivers: [
            CupertinoSliverRefreshControl(onRefresh: _load),
            if (_loading)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: Center(child: CupertinoActivityIndicator()),
              )
            else if (_items.isEmpty)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: _EmptyState(),
              )
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
                sliver: SliverList(
                  delegate: SliverChildBuilderDelegate(
                    (_, i) => Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: _tile(_items[i]),
                    ),
                    childCount: _items.length,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _tile(AppNotification n) {
    final color = _colorFor(n.type);
    return Material(
      color: n.isRead ? CupertinoColors.white : const Color(0xFFFFF3E0),
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
                              color: CupertinoColors.systemRed,
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
                          color: CupertinoColors.label,
                          fontSize: 13,
                        ),
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                    const SizedBox(height: 6),
                    Text(
                      _relativeTime(n.createdAt),
                      style: const TextStyle(
                        color: CupertinoColors.secondaryLabel,
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

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(CupertinoIcons.bell_slash,
              size: 64, color: CupertinoColors.systemGrey2),
          SizedBox(height: 12),
          Text(
            "You're all caught up",
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          ),
          SizedBox(height: 6),
          Text(
            'No notifications yet',
            style: TextStyle(color: CupertinoColors.secondaryLabel),
          ),
        ],
      ),
    );
  }
}
