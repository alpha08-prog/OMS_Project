import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/activity_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/csv_export.dart';
import '../../widgets/date_range_filter.dart';
import '../../widgets/oms_app_bar.dart';

/// Admin "Activity Log" — the global who-did-what feed (GET /api/activity).
/// Mirrors the web screen: When / Module(entity) / Action / Record(label) / By,
/// with entity + action filters, load-more, and CSV export.
class ActivityLogPage extends StatefulWidget {
  const ActivityLogPage({super.key});

  @override
  State<ActivityLogPage> createState() => _ActivityLogPageState();
}

class _ActivityLogPageState extends State<ActivityLogPage> {
  final List<Map<String, dynamic>> _rows = [];
  bool _loading = true;
  bool _loadingMore = false;
  int _page = 1;
  int _totalPages = 1;

  String _entity = 'All';
  String _action = 'All';
  DateTime? _dateFrom;
  DateTime? _dateTo;

  static const _entities = [
    'All',
    'Grievance',
    'Visitor',
    'Train Request',
    'Tour Program',
    'News',
    'Birthday',
    'Meeting',
    'Task',
  ];
  static const _actions = ['All', 'CREATED', 'EDITED'];

  @override
  void initState() {
    super.initState();
    _fetch(reset: true);
  }

  Future<void> _fetch({bool reset = false}) async {
    if (reset) {
      setState(() {
        _loading = true;
        _page = 1;
      });
    } else {
      setState(() => _loadingMore = true);
    }
    final res = await ActivityService.list(
      page: _page,
      limit: 50,
      entity: _entity,
      action: _action,
    );
    if (!mounted) return;
    setState(() {
      if (reset) _rows.clear();
      _rows.addAll(res.rows);
      _totalPages = res.totalPages;
      _loading = false;
      _loadingMore = false;
    });
  }

  Future<void> _loadMore() async {
    if (_page >= _totalPages || _loadingMore) return;
    _page++;
    await _fetch();
  }

  Color _entityColor(String e) {
    switch (e) {
      case 'Grievance':
        return AppTheme.primaryIndigo;
      case 'Train Request':
        return Colors.teal;
      case 'Tour Program':
        return AppTheme.saffronDark;
      case 'News':
        return Colors.deepPurple;
      case 'Birthday':
        return AppTheme.birthdayPink;
      case 'Meeting':
        return Colors.indigo;
      case 'Task':
        return Colors.blueGrey;
      case 'Visitor':
        return Colors.green;
      default:
        return Colors.grey;
    }
  }

  String _fmt(dynamic v) {
    if (v == null) return '';
    try {
      return DateFormat('dd MMM, hh:mm a')
          .format(DateTime.parse(v.toString().replaceFirst(' ', 'T')));
    } catch (_) {
      return v.toString();
    }
  }

  /// Rows narrowed by the client-side date range (on the `at` timestamp).
  List<Map<String, dynamic>> get _visibleRows {
    if (_dateFrom == null && _dateTo == null) return _rows;
    return _rows.where((r) {
      final dt = DateTime.tryParse(
          (r['at']?.toString() ?? '').replaceFirst(' ', 'T'));
      return dateInRange(dt, from: _dateFrom, to: _dateTo);
    }).toList();
  }

  void _exportCsv() {
    CsvExport.export(
      context,
      fileName: 'activity_log',
      headers: ['When', 'Module', 'Action', 'Record', 'By'],
      rows: _visibleRows
          .map((r) => [
                _fmt(r['at']),
                r['entity'] ?? '',
                r['action'] ?? '',
                r['label'] ?? '',
                r['by'] ?? '',
              ])
          .toList(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: omsAppBar(
        context,
        title: 'Activity Log',
        actions: [
          IconButton(
            tooltip: 'Export CSV',
            icon: const Icon(Icons.download, color: Colors.white),
            onPressed: _visibleRows.isEmpty ? null : _exportCsv,
          ),
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white),
            onPressed: () => _fetch(reset: true),
          ),
        ],
      ),
      body: Column(
        children: [
          _filters(),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _visibleRows.isEmpty
                    ? _empty()
                    : RefreshIndicator(
                        onRefresh: () => _fetch(reset: true),
                        child: ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _visibleRows.length + 1,
                          itemBuilder: (_, i) {
                            if (i == _visibleRows.length) return _footer();
                            return _row(_visibleRows[i]);
                          },
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _filters() => Container(
        color: Colors.white,
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: _entity,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Module',
                      isDense: true,
                      border: OutlineInputBorder(),
                    ),
                    items: _entities
                        .map((e) => DropdownMenuItem(
                            value: e,
                            child: Text(e == 'All' ? 'All Modules' : e,
                                style: const TextStyle(fontSize: 13),
                                overflow: TextOverflow.ellipsis)))
                        .toList(),
                    onChanged: (v) {
                      setState(() => _entity = v!);
                      _fetch(reset: true);
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: _action,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Action',
                      isDense: true,
                      border: OutlineInputBorder(),
                    ),
                    items: _actions
                        .map((a) => DropdownMenuItem(
                            value: a,
                            child: Text(a == 'All' ? 'All Actions' : a,
                                style: const TextStyle(fontSize: 13))))
                        .toList(),
                    onChanged: (v) {
                      setState(() => _action = v!);
                      _fetch(reset: true);
                    },
                  ),
                ),
              ],
            ),
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
          ],
        ),
      );

  Widget _empty() => ListView(
        children: [
          const SizedBox(height: 140),
          Icon(Icons.history, size: 64, color: Colors.grey.shade300),
          const SizedBox(height: 16),
          Center(
              child: Text('No activity',
                  style: TextStyle(color: Colors.grey.shade500))),
        ],
      );

  Widget _footer() {
    if (_page >= _totalPages) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Center(
          child: Text('${_visibleRows.length} entries',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Center(
        child: OutlinedButton(
          onPressed: _loadingMore ? null : _loadMore,
          child: _loadingMore
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Load more'),
        ),
      ),
    );
  }

  Widget _row(Map<String, dynamic> r) {
    final entity = r['entity']?.toString() ?? '';
    final action = r['action']?.toString() ?? '';
    final by = r['by']?.toString();
    final color = _entityColor(entity);
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(AppTheme.radiusMd),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: color.withOpacity(0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
                action == 'CREATED' ? Icons.add : Icons.edit,
                size: 18,
                color: color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: color.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(entity,
                          style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.bold,
                              color: color)),
                    ),
                    const SizedBox(width: 6),
                    Text(action,
                        style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: Colors.grey.shade600)),
                    const Spacer(),
                    Text(_fmt(r['at']),
                        style: TextStyle(
                            fontSize: 11, color: Colors.grey.shade500)),
                  ],
                ),
                const SizedBox(height: 4),
                Text(r['label']?.toString() ?? '-',
                    style: const TextStyle(
                        fontSize: 14, fontWeight: FontWeight.w500)),
                if (by != null && by.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text('by $by',
                      style: TextStyle(
                          fontSize: 12, color: Colors.grey.shade500)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
