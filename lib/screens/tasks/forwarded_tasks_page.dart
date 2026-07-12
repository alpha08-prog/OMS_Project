import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/task_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/csv_export.dart';
import '../../widgets/date_range_filter.dart';

/// "Forwarded to Me" inbox — tasks + grievances another user forwarded to the
/// current user (GET /api/tasks/forwarded). Mirrors the web screen. Read-only
/// list showing who forwarded it, when, and any remark.
class ForwardedTasksPage extends StatefulWidget {
  const ForwardedTasksPage({super.key});

  @override
  State<ForwardedTasksPage> createState() => _ForwardedTasksPageState();
}

class _ForwardedTasksPageState extends State<ForwardedTasksPage> {
  bool _loading = true;
  List<Map<String, dynamic>> _items = [];
  DateTime? _dateFrom;
  DateTime? _dateTo;

  List<Map<String, dynamic>> get _visibleItems {
    if (_dateFrom == null && _dateTo == null) return _items;
    return _items.where((it) {
      final dt = DateTime.tryParse(it['createdAt']?.toString() ?? '');
      return dateInRange(dt, from: _dateFrom, to: _dateTo);
    }).toList();
  }

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  void _exportCsv() {
    CsvExport.export(
      context,
      fileName: 'forwarded_tasks',
      headers: ['Title', 'Type', 'Status', 'Reference No', 'Forwarded By', 'Created'],
      rows: _visibleItems.map((it) {
        String created = '';
        try {
          created = DateFormat('dd MMM yyyy')
              .format(DateTime.parse(it['createdAt'].toString()));
        } catch (_) {}
        return [
          it['title'] ?? '',
          it['entityType'] ?? '',
          (it['status'] ?? '').toString().replaceAll('_', ' '),
          it['referenceNo'] ?? '',
          (it['forwardedBy'] is Map ? it['forwardedBy']['name'] : '') ?? '',
          created,
        ];
      }).toList(),
    );
  }

  Future<void> _fetch() async {
    setState(() => _loading = true);
    final items = await TaskService.getForwarded();
    if (!mounted) return;
    setState(() {
      _items = items;
      _loading = false;
    });
  }

  Color _statusColor(String s) {
    switch (s) {
      case 'ASSIGNED':
        return Colors.blue;
      case 'IN_PROGRESS':
        return AppTheme.saffronDark;
      case 'COMPLETED':
        return AppTheme.successGreen;
      case 'ON_HOLD':
        return Colors.grey;
      default:
        return AppTheme.primaryIndigo;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: Text('Forwarded to Me${_items.isNotEmpty ? ' (${_items.length})' : ''}'),
        backgroundColor: AppTheme.primaryIndigo,
        actions: [
          IconButton(
            tooltip: 'Export CSV',
            icon: const Icon(Icons.download, color: Colors.white),
            onPressed: _visibleItems.isEmpty ? null : _exportCsv,
          ),
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white),
            onPressed: _fetch,
          ),
        ],
      ),
      body: Column(
        children: [
          DateRangeFilter(
            from: _dateFrom,
            to: _dateTo,
            tint: AppTheme.primaryIndigo,
            onFromChanged: (d) => setState(() => _dateFrom = d),
            onToChanged: (d) => setState(() => _dateTo = d),
            onClear: () => setState(() {
              _dateFrom = null;
              _dateTo = null;
            }),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _visibleItems.isEmpty
                    ? _empty()
                    : RefreshIndicator(
                        onRefresh: _fetch,
                        child: ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _visibleItems.length,
                          itemBuilder: (_, i) => _card(_visibleItems[i]),
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _empty() => ListView(
        children: [
          const SizedBox(height: 140),
          Icon(Icons.move_to_inbox_outlined,
              size: 64, color: Colors.grey.shade300),
          const SizedBox(height: 16),
          Center(
            child: Text('Nothing forwarded to you',
                style: TextStyle(color: Colors.grey.shade500)),
          ),
        ],
      );

  Widget _card(Map<String, dynamic> item) {
    final status = item['status']?.toString() ?? '';
    final entityType = item['entityType']?.toString() ?? 'TASK';
    final refNo = item['referenceNo']?.toString();
    final forwardedBy =
        item['forwardedBy'] is Map ? item['forwardedBy']['name'] : null;
    final remark = item['forwardRemark']?.toString();
    String forwardedAt = '';
    if (item['forwardedAt'] != null) {
      try {
        forwardedAt = DateFormat('dd MMM, hh:mm a')
            .format(DateTime.parse(item['forwardedAt'].toString()));
      } catch (_) {}
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppTheme.radiusMd),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: (entityType == 'GRIEVANCE'
                          ? AppTheme.saffronDark
                          : AppTheme.primaryIndigo)
                      .withOpacity(0.1),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(entityType,
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        color: entityType == 'GRIEVANCE'
                            ? AppTheme.saffronDark
                            : AppTheme.primaryIndigo)),
              ),
              const Spacer(),
              if (status.isNotEmpty)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: _statusColor(status).withOpacity(0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(status.replaceAll('_', ' '),
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: _statusColor(status))),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text(item['title']?.toString() ?? '-',
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
          if (refNo != null && refNo.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(refNo,
                style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
          ],
          if (item['description']?.toString().isNotEmpty == true) ...[
            const SizedBox(height: 6),
            Text(item['description'],
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
          ],
          if (remark != null && remark.isNotEmpty) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: AppTheme.saffronSoft,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.chat_bubble_outline,
                      size: 14, color: AppTheme.saffronDark),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(remark,
                        style: const TextStyle(
                            fontSize: 12, color: Color(0xFF92400E))),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 8),
          Row(
            children: [
              Icon(Icons.forward, size: 13, color: Colors.grey.shade500),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  forwardedBy != null
                      ? 'From $forwardedBy${forwardedAt.isNotEmpty ? ' · $forwardedAt' : ''}'
                      : forwardedAt,
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
