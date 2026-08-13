import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';

import '../../../services/http_service.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/cupertino/cupertino_date_range_filter.dart';
import '../../../widgets/cupertino/cupertino_page_header.dart';
import '../../../widgets/cupertino/cupertino_staff_history_detail_dialog.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
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
      child: Column(
        children: [
          OmsPageHeader(
            title: "My Submissions",
            trailing: CupertinoButton(
              padding: EdgeInsets.zero,
              onPressed: _fetchAll,
              child: const Icon(CupertinoIcons.refresh,
                  color: CupertinoColors.white),
            ),
          ),
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
            Column(
              mainAxisSize: MainAxisSize.min,
              children: [
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
                if (_isEditable(item))
                  CupertinoButton(
                    padding: const EdgeInsets.all(6),
                    minSize: 0,
                    onPressed: () => _editItem(item, raw),
                    child: const Icon(
                      CupertinoIcons.pencil,
                      size: 20,
                      color: AppTheme.primaryIndigo,
                    ),
                  ),
              ],
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

  // ===================== EDIT =====================
  // Staff can correct their own submissions while they are still editable
  // (i.e. before an admin has acted on them). Edits the core fields per type
  // and PATCHes /api/<entity>/:id. Backend is unchanged — if an endpoint is
  // restricted/absent the backend message is surfaced.

  bool _isEditable(Map<String, dynamic> item) {
    final type = item['type']?.toString() ?? '';
    final status = (item['status']?.toString() ?? '').toUpperCase();
    switch (type) {
      case 'GRIEVANCE':
        return status == 'OPEN';
      case 'TRAIN_REQUEST':
        return status == 'PENDING';
      case 'TOUR_PROGRAM':
        return status == 'PENDING';
      case 'VISITOR':
        return true;
      default:
        return false;
    }
  }

  String? _endpointFor(String type, Map<String, dynamic> raw) {
    final id = raw['id']?.toString();
    if (id == null || id.isEmpty) return null;
    switch (type) {
      case 'GRIEVANCE':
        return '/api/grievances/$id';
      case 'TRAIN_REQUEST':
        return '/api/train-requests/$id';
      case 'TOUR_PROGRAM':
        return '/api/tour-programs/$id';
      case 'VISITOR':
        return '/api/visitors/$id';
      default:
        return null;
    }
  }

  String _typeLabel(String type) {
    switch (type) {
      case 'GRIEVANCE':
        return 'Grievance';
      case 'TRAIN_REQUEST':
        return 'Train Request';
      case 'TOUR_PROGRAM':
        return 'Tour Program';
      case 'VISITOR':
        return 'Visitor';
      default:
        return 'Item';
    }
  }

  List<_EditField> _editFieldsFor(String type) {
    switch (type) {
      case 'GRIEVANCE':
        return const [
          _EditField('petitionerName', 'Petitioner Name'),
          _EditField('mobileNumber', 'Mobile Number'),
          _EditField('grievanceType', 'Grievance Type',
              kind: 'dropdown', options: _grievanceTypes),
          _EditField('description', 'Description', kind: 'multiline'),
        ];
      case 'TRAIN_REQUEST':
        return const [
          _EditField('passengerName', 'Passenger Name'),
          _EditField('pnrNumber', 'PNR Number'),
          _EditField('contactNumber', 'Contact Number'),
          _EditField('trainName', 'Train Name'),
          _EditField('trainNumber', 'Train Number'),
          _EditField('journeyClass', 'Class'),
          _EditField('fromStation', 'From Station'),
          _EditField('toStation', 'To Station'),
          _EditField('dateOfJourney', 'Date of Journey', kind: 'date'),
        ];
      case 'TOUR_PROGRAM':
        return const [
          _EditField('eventName', 'Event Name'),
          _EditField('organizer', 'Organizer'),
          _EditField('venue', 'Venue'),
          _EditField('dateTime', 'Date & Time', kind: 'date'),
        ];
      case 'VISITOR':
        return const [
          _EditField('name', 'Name'),
          _EditField('designation', 'Designation'),
          _EditField('purpose', 'Purpose'),
        ];
      default:
        return const [];
    }
  }

  BoxDecoration get _fieldBoxDeco => BoxDecoration(
        color: AppTheme.backgroundAlt,
        borderRadius: BorderRadius.circular(AppTheme.radiusMd),
        border: Border.all(color: AppTheme.border),
      );

  Future<void> _editItem(
      Map<String, dynamic> item, Map<String, dynamic> raw) async {
    final type = item['type']?.toString() ?? '';
    final fields = _editFieldsFor(type);
    final endpoint = _endpointFor(type, raw);
    if (fields.isEmpty || endpoint == null) return;

    final controllers = <String, TextEditingController>{};
    final dropdowns = <String, String?>{};
    final dates = <String, DateTime?>{};
    for (final f in fields) {
      switch (f.kind) {
        case 'date':
          dates[f.key] = DateTime.tryParse(raw[f.key]?.toString() ?? '');
          break;
        case 'dropdown':
          final cur = raw[f.key]?.toString();
          dropdowns[f.key] = f.options.contains(cur) ? cur : null;
          break;
        default:
          controllers[f.key] =
              TextEditingController(text: raw[f.key]?.toString() ?? '');
      }
    }
    bool saving = false;

    final saved = await showCupertinoModalPopup<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => Container(
          decoration: BoxDecoration(
            color: CupertinoColors.systemBackground.resolveFrom(ctx),
            borderRadius:
                const BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Padding(
            padding: EdgeInsets.only(
              left: 16,
              right: 16,
              top: 12,
              bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Edit ${_typeLabel(type)}',
                          style: const TextStyle(
                              fontSize: 18, fontWeight: FontWeight.bold)),
                      CupertinoButton(
                        padding: EdgeInsets.zero,
                        minSize: 0,
                        onPressed: () => Navigator.of(ctx).pop(),
                        child: const Icon(CupertinoIcons.xmark_circle_fill,
                            color: CupertinoColors.systemGrey3, size: 26),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  ...fields.map((f) {
                    Widget input;
                    if (f.kind == 'date') {
                      final d = dates[f.key];
                      input = GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () {
                          DateTime temp = d ??
                              DateTime.now();
                          showCupertinoModalPopup(
                            context: ctx,
                            builder: (pctx) => Container(
                              height: 300,
                              color: CupertinoColors.systemBackground
                                  .resolveFrom(pctx),
                              child: Column(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 16, vertical: 8),
                                    child: Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.spaceBetween,
                                      children: [
                                        CupertinoButton(
                                          padding: EdgeInsets.zero,
                                          child: const Text('Cancel'),
                                          onPressed: () =>
                                              Navigator.pop(pctx),
                                        ),
                                        CupertinoButton(
                                          padding: EdgeInsets.zero,
                                          child: const Text('Done'),
                                          onPressed: () {
                                            setSheet(
                                                () => dates[f.key] = temp);
                                            Navigator.pop(pctx);
                                          },
                                        ),
                                      ],
                                    ),
                                  ),
                                  Expanded(
                                    child: CupertinoDatePicker(
                                      initialDateTime: d ?? DateTime.now(),
                                      minimumDate: DateTime(2020),
                                      maximumDate: DateTime.now().add(
                                          const Duration(days: 365 * 3)),
                                      mode: CupertinoDatePickerMode.date,
                                      onDateTimeChanged: (v) => temp = v,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                        child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(
                              horizontal: 16, vertical: 14),
                          decoration: _fieldBoxDeco,
                          child: Text(
                            d == null
                                ? 'Not set'
                                : DateFormat('dd MMM yyyy').format(d),
                            style: TextStyle(
                              fontSize: 15,
                              color: d == null
                                  ? CupertinoColors.systemGrey
                                  : CupertinoColors.label,
                            ),
                          ),
                        ),
                      );
                    } else if (f.kind == 'dropdown') {
                      final cur = dropdowns[f.key];
                      input = GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () {
                          int index = cur == null
                              ? 0
                              : f.options.indexOf(cur);
                          if (index < 0) index = 0;
                          String temp = f.options[index];
                          showCupertinoModalPopup(
                            context: ctx,
                            builder: (pctx) => Container(
                              height: 300,
                              color: CupertinoColors.systemBackground
                                  .resolveFrom(pctx),
                              child: Column(
                                children: [
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 16, vertical: 8),
                                    child: Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.spaceBetween,
                                      children: [
                                        CupertinoButton(
                                          padding: EdgeInsets.zero,
                                          child: const Text('Cancel'),
                                          onPressed: () =>
                                              Navigator.pop(pctx),
                                        ),
                                        CupertinoButton(
                                          padding: EdgeInsets.zero,
                                          child: const Text('Done'),
                                          onPressed: () {
                                            setSheet(() =>
                                                dropdowns[f.key] = temp);
                                            Navigator.pop(pctx);
                                          },
                                        ),
                                      ],
                                    ),
                                  ),
                                  Expanded(
                                    child: CupertinoPicker(
                                      scrollController:
                                          FixedExtentScrollController(
                                              initialItem: index),
                                      itemExtent: 36,
                                      onSelectedItemChanged: (i) =>
                                          temp = f.options[i],
                                      children: f.options
                                          .map((o) => Center(
                                                child: Text(
                                                    o.replaceAll('_', ' '),
                                                    style: const TextStyle(
                                                        fontSize: 16)),
                                              ))
                                          .toList(),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          );
                        },
                        child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(
                              horizontal: 16, vertical: 14),
                          decoration: _fieldBoxDeco,
                          child: Row(
                            mainAxisAlignment:
                                MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                cur == null
                                    ? 'Select'
                                    : cur.replaceAll('_', ' '),
                                style: TextStyle(
                                  fontSize: 15,
                                  color: cur == null
                                      ? CupertinoColors.systemGrey
                                      : CupertinoColors.label,
                                ),
                              ),
                              const Icon(CupertinoIcons.chevron_down,
                                  size: 16,
                                  color: CupertinoColors.systemGrey),
                            ],
                          ),
                        ),
                      );
                    } else {
                      input = CupertinoTextField(
                        controller: controllers[f.key],
                        minLines: f.kind == 'multiline' ? 3 : 1,
                        maxLines: f.kind == 'multiline' ? 4 : 1,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 14),
                        decoration: _fieldBoxDeco,
                        style: const TextStyle(fontSize: 15),
                      );
                    }
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(f.label,
                              style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: CupertinoColors.systemGrey)),
                          const SizedBox(height: 6),
                          input,
                        ],
                      ),
                    );
                  }),
                  const SizedBox(height: 4),
                  SizedBox(
                    width: double.infinity,
                    child: CupertinoButton.filled(
                      onPressed: saving
                          ? null
                          : () async {
                              final nav = Navigator.of(ctx);
                              setSheet(() => saving = true);
                              final body = <String, dynamic>{};
                              for (final f in fields) {
                                if (f.kind == 'date') {
                                  body[f.key] =
                                      dates[f.key]?.toIso8601String();
                                } else if (f.kind == 'dropdown') {
                                  if (dropdowns[f.key] != null) {
                                    body[f.key] = dropdowns[f.key];
                                  }
                                } else {
                                  body[f.key] =
                                      controllers[f.key]!.text.trim();
                                }
                              }
                              try {
                                final res =
                                    await HttpService.patch(endpoint, body);
                                if (res.statusCode >= 200 &&
                                    res.statusCode < 300) {
                                  nav.pop(true);
                                } else {
                                  String msg =
                                      'Update failed (${res.statusCode})';
                                  try {
                                    msg = jsonDecode(res.body)['message'] ??
                                        msg;
                                  } catch (_) {}
                                  setSheet(() => saving = false);
                                  if (mounted) {
                                    CupertinoToast.show(context, msg,
                                        isError: true);
                                  }
                                }
                              } catch (e) {
                                setSheet(() => saving = false);
                                if (mounted) {
                                  CupertinoToast.show(context, 'Error: $e',
                                      isError: true);
                                }
                              }
                            },
                      child: saving
                          ? const CupertinoActivityIndicator(
                              color: CupertinoColors.white)
                          : const Text('Save Changes',
                              style:
                                  TextStyle(fontWeight: FontWeight.bold)),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );

    for (final c in controllers.values) {
      c.dispose();
    }
    if (saved == true && mounted) {
      _fetchAll();
      CupertinoToast.show(context, 'Updated');
    }
  }
}

const List<String> _grievanceTypes = [
  'WATER',
  'ROAD',
  'POLICE',
  'HEALTH',
  'TRANSFER',
  'FINANCIAL_AID',
  'ELECTRICITY',
  'EDUCATION',
  'HOUSING',
  'TEMPLE_VISIT',
  'OTHER',
];

/// Declarative descriptor for one editable field in the staff-history edit
/// sheet. `kind` is 'text' | 'multiline' | 'dropdown' | 'date'.
class _EditField {
  final String key;
  final String label;
  final String kind;
  final List<String> options;
  const _EditField(this.key, this.label,
      {this.kind = 'text', this.options = const []});
}
