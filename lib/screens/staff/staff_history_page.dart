import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/http_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/date_range_filter.dart';
import '../../widgets/staff_history_detail_dialog.dart';

class StaffHistoryPage extends StatefulWidget {
  const StaffHistoryPage({super.key});

  @override
  State<StaffHistoryPage> createState() => _StaffHistoryPageState();
}

class _StaffHistoryPageState extends State<StaffHistoryPage> {
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
      final List list = decoded is List ? decoded : (decoded["data"] ?? []);
      _grievances = list.map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e)).toList();
    }
  }

  Future<void> _fetchTrainRequests() async {
    final res = await HttpService.get("/api/train-requests?limit=50");
    if (res.statusCode == 200) {
      final decoded = jsonDecode(res.body);
      final List list = decoded is List ? decoded : (decoded["data"] ?? []);
      _trainRequests = list.map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e)).toList();
    }
  }

  Future<void> _fetchTourPrograms() async {
    final res = await HttpService.get("/api/tour-programs?limit=50");
    if (res.statusCode == 200) {
      final decoded = jsonDecode(res.body);
      final List list = decoded is List ? decoded : (decoded["data"] ?? []);
      _tourPrograms = list.map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e)).toList();
    }
  }

  Future<void> _fetchVisitors() async {
    final res = await HttpService.get("/api/visitors?limit=50");
    if (res.statusCode == 200) {
      final decoded = jsonDecode(res.body);
      final List list = decoded is List ? decoded : (decoded["data"] ?? []);
      _visitors = list.map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e)).toList();
    }
  }

  List<Map<String, dynamic>> get _filteredItems {
    List<Map<String, dynamic>> items = [];

    if (_selectedType == 'All' || _selectedType == 'Grievance') {
      for (var g in _grievances) {
        items.add({
          'type': 'GRIEVANCE',
          'title': g['petitionerName'] ?? '-',
          'subtitle': g['grievanceType']?.toString().replaceAll('_', ' ') ?? '-',
          'status': g['status'] ?? 'OPEN',
          'date': g['createdAt'],
          'icon': Icons.assignment,
          'color': Colors.indigo,
          'raw': g,
        });
      }
    }
    if (_selectedType == 'All' || _selectedType == 'Train') {
      for (var t in _trainRequests) {
        items.add({
          'type': 'TRAIN_REQUEST',
          'title': 'PNR: ${t['pnrNumber'] ?? '-'}',
          'subtitle': '${t['trainName'] ?? ''} | ${t['fromStation'] ?? ''} -> ${t['toStation'] ?? ''}',
          'status': t['status'] ?? 'PENDING',
          'date': t['createdAt'],
          'icon': Icons.train,
          'color': Colors.blue,
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
          'icon': Icons.event,
          'color': Colors.purple,
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
          'icon': Icons.people,
          'color': Colors.teal,
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
      case 'PENDING': return Colors.orange;
      case 'IN_PROGRESS':
      case 'ASSIGNED': return Colors.blue;
      case 'VERIFIED':
      case 'APPROVED':
      case 'ACCEPTED':
      case 'COMPLETED':
      case 'RESOLVED': return Colors.green;
      case 'REJECTED':
      case 'REGRET': return Colors.red;
      default: return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = _filteredItems;

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text("My Submissions"),
        backgroundColor: AppTheme.primaryIndigo,
        actions: [
          IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _fetchAll),
        ],
      ),
      body: Column(
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
              children: ['All', 'Grievance', 'Train', 'Tour', 'Visitor'].map((type) {
                final selected = _selectedType == type;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: Text(type),
                    selected: selected,
                    onSelected: (_) => setState(() => _selectedType = type),
                    selectedColor: AppTheme.primaryIndigo,
                    labelStyle: TextStyle(
                      color: selected ? Colors.white : Colors.black87,
                      fontWeight: FontWeight.w600, fontSize: 12,
                    ),
                    checkmarkColor: Colors.white,
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 4),
          DateRangeFilter(
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
                ? const Center(child: CircularProgressIndicator())
                : items.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.history, size: 64, color: Colors.grey.shade300),
                            const SizedBox(height: 16),
                            Text("No submissions found", style: TextStyle(color: Colors.grey.shade500)),
                          ],
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: _fetchAll,
                        child: ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: items.length,
                          itemBuilder: (_, i) => _buildItemCard(items[i]),
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _statCol(String label, int count) {
    return Column(
      children: [
        Text("$count", style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
        Text(label, style: const TextStyle(color: Colors.white70, fontSize: 11)),
      ],
    );
  }

  Widget _buildItemCard(Map<String, dynamic> item) {
    String dateStr = "";
    try {
      dateStr = DateFormat('dd MMM yyyy').format(DateTime.parse(item['date']));
    } catch (_) {}

    final raw = item['raw'] is Map
        ? Map<String, dynamic>.from(item['raw'] as Map)
        : <String, dynamic>{};

    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => _openDetail(item, raw),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          boxShadow: AppTheme.shadowSm,
        ),
        child: Row(
          children: [
            CircleAvatar(
              radius: 20,
              backgroundColor: (item['color'] as Color).withOpacity(0.1),
              child: Icon(item['icon'] as IconData, color: item['color'] as Color, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item['title'], style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                  Text(item['subtitle'], style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: _statusColor(item['status']).withOpacity(0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(item['status'].toString().replaceAll('_', ' '),
                            style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: _statusColor(item['status']))),
                      ),
                      const Spacer(),
                      Text(dateStr, style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton(
                  icon: Icon(Icons.visibility_outlined,
                      size: 20, color: Colors.grey.shade600),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  tooltip: 'View details',
                  onPressed: () => _openDetail(item, raw),
                ),
                if (_isEditable(item)) ...[
                  const SizedBox(height: 8),
                  IconButton(
                    icon: const Icon(Icons.edit_outlined,
                        size: 20, color: AppTheme.primaryIndigo),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    tooltip: 'Edit',
                    onPressed: () => _editItem(item, raw),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _openDetail(Map<String, dynamic> item, Map<String, dynamic> raw) {
    StaffHistoryDetailDialog.show(
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

  InputDecoration _editDeco(String label) => InputDecoration(
        labelText: label,
        isDense: true,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppTheme.radiusMd)),
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

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => Padding(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 16,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
          ),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Edit ${_typeLabel(type)}',
                    style: const TextStyle(
                        fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 16),
                ...fields.map((f) {
                  Widget field;
                  if (f.kind == 'date') {
                    final d = dates[f.key];
                    field = InkWell(
                      onTap: () async {
                        final picked = await showDatePicker(
                          context: ctx,
                          initialDate: d ?? DateTime.now(),
                          firstDate: DateTime(2020),
                          lastDate:
                              DateTime.now().add(const Duration(days: 365 * 3)),
                        );
                        if (picked != null) {
                          setSheet(() => dates[f.key] = picked);
                        }
                      },
                      borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                      child: InputDecorator(
                        decoration: _editDeco(f.label),
                        child: Text(
                          d == null
                              ? 'Not set'
                              : DateFormat('dd MMM yyyy').format(d),
                          style: const TextStyle(fontSize: 14),
                        ),
                      ),
                    );
                  } else if (f.kind == 'dropdown') {
                    field = DropdownButtonFormField<String>(
                      value: dropdowns[f.key],
                      isExpanded: true,
                      decoration: _editDeco(f.label),
                      items: f.options
                          .map((o) => DropdownMenuItem(
                              value: o, child: Text(o.replaceAll('_', ' '))))
                          .toList(),
                      onChanged: (v) => setSheet(() => dropdowns[f.key] = v),
                    );
                  } else {
                    field = TextField(
                      controller: controllers[f.key],
                      minLines: f.kind == 'multiline' ? 2 : 1,
                      maxLines: f.kind == 'multiline' ? 4 : 1,
                      decoration: _editDeco(f.label),
                    );
                  }
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: field,
                  );
                }),
                const SizedBox(height: 8),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton(
                    style: AppTheme.primaryButton(),
                    onPressed: saving
                        ? null
                        : () async {
                            final messenger = ScaffoldMessenger.of(context);
                            final nav = Navigator.of(ctx);
                            setSheet(() => saving = true);
                            final body = <String, dynamic>{};
                            for (final f in fields) {
                              if (f.kind == 'date') {
                                body[f.key] = dates[f.key]?.toIso8601String();
                              } else if (f.kind == 'dropdown') {
                                if (dropdowns[f.key] != null) {
                                  body[f.key] = dropdowns[f.key];
                                }
                              } else {
                                body[f.key] = controllers[f.key]!.text.trim();
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
                                  msg = jsonDecode(res.body)['message'] ?? msg;
                                } catch (_) {}
                                setSheet(() => saving = false);
                                messenger.showSnackBar(
                                    SnackBar(content: Text(msg)));
                              }
                            } catch (e) {
                              setSheet(() => saving = false);
                              messenger.showSnackBar(
                                  SnackBar(content: Text('Error: $e')));
                            }
                          },
                    child: saving
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white),
                          )
                        : const Text('Save Changes',
                            style: TextStyle(fontWeight: FontWeight.bold)),
                  ),
                ),
              ],
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
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Updated')));
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
