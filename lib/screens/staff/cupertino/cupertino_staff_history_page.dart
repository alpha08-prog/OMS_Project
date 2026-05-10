import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';

import '../../../services/http_service.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/cupertino/cupertino_date_range_filter.dart';
import '../../../widgets/cupertino/cupertino_staff_history_detail_dialog.dart';
import '../../../widgets/date_range_filter.dart' show dateInRange;

class CupertinoStaffHistoryPage extends StatefulWidget {
  const CupertinoStaffHistoryPage({super.key});

  @override
  State<CupertinoStaffHistoryPage> createState() =>
      _CupertinoStaffHistoryPageState();
}

class _CupertinoStaffHistoryPageState
    extends State<CupertinoStaffHistoryPage> {
  bool _loading = true;
  String _selectedType = 'All';
  DateTime? _dateFrom;
  DateTime? _dateTo;

  List<Map<String, dynamic>> _grievances = [];
  List<Map<String, dynamic>> _trainRequests = [];
  List<Map<String, dynamic>> _tourPrograms = [];
  List<Map<String, dynamic>> _visitors = [];

  @override
  void initState() {
    super.initState();
    _fetchAll();
  }

  Future<void> _fetchAll() async {
    setState(() => _loading = true);
    try {
      await Future.wait([
        _fetchGrievances(),
        _fetchTrainRequests(),
        _fetchTourPrograms(),
        _fetchVisitors(),
      ]);
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _fetchGrievances() async {
    final res = await HttpService.get("/api/grievances?limit=50");
    if (res.statusCode == 200) {
      final decoded = jsonDecode(res.body);
      final List list =
          decoded is List ? decoded : (decoded["data"] ?? []);
      _grievances = list
          .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
          .toList();
    }
  }

  Future<void> _fetchTrainRequests() async {
    final res = await HttpService.get("/api/train-requests?limit=50");
    if (res.statusCode == 200) {
      final decoded = jsonDecode(res.body);
      final List list =
          decoded is List ? decoded : (decoded["data"] ?? []);
      _trainRequests = list
          .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
          .toList();
    }
  }

  Future<void> _fetchTourPrograms() async {
    final res = await HttpService.get("/api/tour-programs?limit=50");
    if (res.statusCode == 200) {
      final decoded = jsonDecode(res.body);
      final List list =
          decoded is List ? decoded : (decoded["data"] ?? []);
      _tourPrograms = list
          .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
          .toList();
    }
  }

  Future<void> _fetchVisitors() async {
    final res = await HttpService.get("/api/visitors?limit=50");
    if (res.statusCode == 200) {
      final decoded = jsonDecode(res.body);
      final List list =
          decoded is List ? decoded : (decoded["data"] ?? []);
      _visitors = list
          .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
          .toList();
    }
  }

  List<Map<String, dynamic>> get _filteredItems {
    List<Map<String, dynamic>> items = [];

    if (_selectedType == 'All' || _selectedType == 'Grievance') {
      for (var g in _grievances) {
        items.add({
          'type': 'GRIEVANCE',
          'title': g['petitionerName'] ?? '-',
          'subtitle':
              g['grievanceType']?.toString().replaceAll('_', ' ') ?? '-',
          'status': g['status'] ?? 'OPEN',
          'date': g['createdAt'],
          'iconData': CupertinoIcons.doc_text,
          'color': const Color(0xFF4338CA),
          'raw': g,
        });
      }
    }
    if (_selectedType == 'All' || _selectedType == 'Train') {
      for (var t in _trainRequests) {
        items.add({
          'type': 'TRAIN_REQUEST',
          'title': 'PNR: ${t['pnrNumber'] ?? '-'}',
          'subtitle':
              '${t['trainName'] ?? ''} | ${t['fromStation'] ?? ''} -> ${t['toStation'] ?? ''}',
          'status': t['status'] ?? 'PENDING',
          'date': t['createdAt'],
          'iconData': CupertinoIcons.train_style_one,
          'color': CupertinoColors.activeBlue,
          'raw': t,
        });
      }
    }
    if (_selectedType == 'All' || _selectedType == 'Tour') {
      for (var tp in _tourPrograms) {
        items.add({
          'type': 'TOUR_PROGRAM',
          'title': tp['eventName'] ?? '-',
          'subtitle': 'by ${tp['organizer'] ?? '-'}',
          'status': tp['decision'] ?? 'PENDING',
          'date': tp['createdAt'],
          'iconData': CupertinoIcons.calendar,
          'color': const Color(0xFF9333EA),
          'raw': tp,
        });
      }
    }
    if (_selectedType == 'All' || _selectedType == 'Visitor') {
      for (var v in _visitors) {
        items.add({
          'type': 'VISITOR',
          'title': v['name'] ?? '-',
          'subtitle': v['purpose'] ?? '-',
          'status': 'LOGGED',
          'date': v['createdAt'],
          'iconData': CupertinoIcons.person_2,
          'color': const Color(0xFF0D9488),
          'raw': v,
        });
      }
    }

    // Sort by date descending
    items.sort((a, b) {
      final aDate = DateTime.tryParse(a['date'] ?? '') ?? DateTime(2000);
      final bDate = DateTime.tryParse(b['date'] ?? '') ?? DateTime(2000);
      return bDate.compareTo(aDate);
    });

    if (_dateFrom != null || _dateTo != null) {
      items = items.where((i) {
        final dt = DateTime.tryParse(i['date']?.toString() ?? '');
        return dateInRange(dt, from: _dateFrom, to: _dateTo);
      }).toList();
    }

    return items;
  }

  Color _statusColor(String status) {
    switch (status.toUpperCase()) {
      case 'OPEN':
      case 'PENDING':
        return CupertinoColors.activeOrange;
      case 'IN_PROGRESS':
      case 'ASSIGNED':
        return CupertinoColors.activeBlue;
      case 'VERIFIED':
      case 'APPROVED':
      case 'ACCEPTED':
      case 'COMPLETED':
      case 'RESOLVED':
        return CupertinoColors.activeGreen;
      case 'REJECTED':
      case 'REGRET':
        return CupertinoColors.destructiveRed;
      default:
        return CupertinoColors.systemGrey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = _filteredItems;

    return CupertinoPageScaffold(
      backgroundColor: AppTheme.background,
      navigationBar: CupertinoNavigationBar(
        middle: const Text("My Submissions"),
        backgroundColor: AppTheme.primaryIndigo,
        brightness: Brightness.dark,
        trailing: CupertinoButton(
          padding: EdgeInsets.zero,
          onPressed: _fetchAll,
          child: const Icon(CupertinoIcons.refresh,
              color: CupertinoColors.white),
        ),
      ),
      child: SafeArea(
        child: Column(
          children: [
            // Stats
            Container(
              margin: const EdgeInsets.all(16),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: AppTheme.primaryGradient,
                borderRadius: BorderRadius.circular(16),
                boxShadow: AppTheme.shadowMd,
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _statCol("Grievances", _grievances.length),
                  _statCol("Train", _trainRequests.length),
                  _statCol("Tours", _tourPrograms.length),
                  _statCol("Visitors", _visitors.length),
                ],
              ),
            ),

            // Filter chips
            SizedBox(
              height: 40,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: [
                  'All',
                  'Grievance',
                  'Train',
                  'Tour',
                  'Visitor'
                ].map((type) {
                  final selected = _selectedType == type;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: GestureDetector(
                      onTap: () =>
                          setState(() => _selectedType = type),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 8),
                        decoration: BoxDecoration(
                          color: selected
                              ? AppTheme.primaryIndigo
                              : AppTheme.backgroundAlt,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          type,
                          style: TextStyle(
                            color: selected
                                ? CupertinoColors.white
                                : CupertinoColors.label,
                            fontWeight: FontWeight.w600,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
            const SizedBox(height: 4),
            CupertinoDateRangeFilter(
              from: _dateFrom,
              to: _dateTo,
              tint: AppTheme.primaryIndigo,
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              onFromChanged: (d) => setState(() => _dateFrom = d),
              onToChanged: (d) => setState(() => _dateTo = d),
              onClear: () => setState(() {
                _dateFrom = null;
                _dateTo = null;
              }),
            ),

            // List
            Expanded(
              child: _loading
                  ? const Center(child: CupertinoActivityIndicator())
                  : items.isEmpty
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(CupertinoIcons.clock,
                                  size: 64,
                                  color: CupertinoColors.systemGrey4),
                              const SizedBox(height: 16),
                              Text("No submissions found",
                                  style: TextStyle(
                                      color:
                                          CupertinoColors.systemGrey)),
                            ],
                          ),
                        )
                      : CustomScrollView(
                          slivers: [
                            CupertinoSliverRefreshControl(
                                onRefresh: _fetchAll),
                            SliverPadding(
                              padding: const EdgeInsets.all(16),
                              sliver: SliverList(
                                delegate: SliverChildBuilderDelegate(
                                  (_, i) =>
                                      _buildItemCard(items[i]),
                                  childCount: items.length,
                                ),
                              ),
                            ),
                          ],
                        ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _statCol(String label, int count) {
    return Column(
      children: [
        Text("$count",
            style: const TextStyle(
                color: CupertinoColors.white,
                fontSize: 20,
                fontWeight: FontWeight.bold)),
        Text(label,
            style: TextStyle(
                color: CupertinoColors.white.withOpacity(0.7),
                fontSize: 11)),
      ],
    );
  }

  Widget _buildItemCard(Map<String, dynamic> item) {
    String dateStr = "";
    try {
      dateStr =
          DateFormat('dd MMM yyyy').format(DateTime.parse(item['date']));
    } catch (_) {}

    final raw = item['raw'] is Map
        ? Map<String, dynamic>.from(item['raw'] as Map)
        : <String, dynamic>{};

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => _openDetail(item, raw),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: CupertinoColors.white,
          borderRadius: BorderRadius.circular(12),
          boxShadow: AppTheme.shadowSm,
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: (item['color'] as Color).withOpacity(0.1),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Icon(item['iconData'] as IconData,
                  color: item['color'] as Color, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item['title'],
                      style: const TextStyle(
                          fontSize: 14, fontWeight: FontWeight.bold)),
                  Text(item['subtitle'],
                      style: TextStyle(
                          fontSize: 12,
                          color: CupertinoColors.systemGrey),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: _statusColor(item['status'])
                              .withOpacity(0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          item['status']
                              .toString()
                              .replaceAll('_', ' '),
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: _statusColor(item['status']),
                          ),
                        ),
                      ),
                      const Spacer(),
                      Text(dateStr,
                          style: TextStyle(
                              fontSize: 11,
                              color: CupertinoColors.systemGrey)),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            CupertinoButton(
              padding: const EdgeInsets.all(6),
              minSize: 0,
              onPressed: () => _openDetail(item, raw),
              child: const Icon(
                CupertinoIcons.eye,
                size: 20,
                color: CupertinoColors.systemGrey,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _openDetail(Map<String, dynamic> item, Map<String, dynamic> raw) {
    CupertinoStaffHistoryDetailDialog.show(
      context: context,
      type: item['type']?.toString() ?? '',
      title: item['title']?.toString() ?? '-',
      status: item['status']?.toString() ?? '',
      date: item['date'],
      raw: raw,
    );
  }
}
