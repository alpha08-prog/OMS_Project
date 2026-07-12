import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/http_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/csv_export.dart';
import '../../widgets/date_range_filter.dart';
import '../../widgets/task_forward_sheet.dart';

/// Admin-only Task Tracker page.
/// Shows stats, staff workload, filterable list with View / Resolve / Delete
/// actions per task, and a task details modal.
class TaskListPage extends StatefulWidget {
  final String role;
  const TaskListPage({super.key, required this.role});

  @override
  State<TaskListPage> createState() => _TaskListPageState();
}

class _TaskListPageState extends State<TaskListPage> {
  bool _loading = true;
  String? _error;

  // Tracking stats
  int _total = 0;
  int _assigned = 0;
  int _inProgress = 0;
  int _completed = 0;
  int _onHold = 0;
  List<Map<String, dynamic>> _staffWorkload = [];

  // Tasks + staff list
  List<Map<String, dynamic>> _tasks = [];
  List<Map<String, dynamic>> _staffList = [];

  // Filters
  String _typeFilter = "All";
  String _statusFilter = "All";
  String? _staffFilterId; // null = "All Staff"
  DateTime? _dateFrom;
  DateTime? _dateTo;

  // Tracks which task cards are expanded to show Recent Activity. Cards are
  // collapsed by default to match the web Task Tracker layout.
  final Set<String> _expandedTaskIds = {};

  // Staff Workload list is collapsed into a dropdown by default to keep the
  // top of the screen scannable when there are many staff.
  bool _staffWorkloadExpanded = false;

  static const _types = [
    "All",
    "GRIEVANCE",
    "TRAIN_REQUEST",
    "TOUR_PROGRAM",
    "GENERAL"
  ];
  static const _statuses = [
    "All",
    "ASSIGNED",
    "IN_PROGRESS",
    "COMPLETED",
    "ON_HOLD"
  ];

  @override
  void initState() {
    super.initState();
    _loadAll();
  }

  Future<void> _loadAll() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await Future.wait([_fetchTracking(), _fetchTasks(), _fetchStaff()]);
    } catch (_) {
      _error = "Server error / No internet";
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _fetchTracking() async {
    try {
      final res = await HttpService.get("/api/tasks/tracking");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final data = Map<String, dynamic>.from(decoded["data"] ?? decoded);
        // Backend returns `summary` (older builds used `stats`) — accept both.
        final stats =
            Map<String, dynamic>.from(data["summary"] ?? data["stats"] ?? {});
        _total = (stats["total"] ?? 0) as int;
        _assigned = (stats["assigned"] ?? 0) as int;
        _inProgress = (stats["inProgress"] ?? 0) as int;
        _completed = (stats["completed"] ?? 0) as int;
        _onHold = (stats["onHold"] ?? 0) as int;

        final List wl = (data["staffTaskCounts"] ?? []) as List;
        _staffWorkload =
            wl.map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e)).toList();
      }
    } catch (_) {}
  }

  Future<void> _fetchTasks() async {
    try {
      final params = <String, String>{'limit': '200'};
      if (_typeFilter != "All") params['taskType'] = _typeFilter;
      if (_statusFilter != "All") params['status'] = _statusFilter;
      if (_staffFilterId != null) params['assignedToId'] = _staffFilterId!;

      final qs = params.entries
          .map((e) => "${e.key}=${Uri.encodeComponent(e.value)}")
          .join("&");
      final res = await HttpService.get("/api/tasks?$qs");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list = decoded is List ? decoded : (decoded["data"] ?? []);
        _tasks = list
            .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
            .toList();
      } else {
        _error = "Failed to load (${res.statusCode})";
      }
    } catch (_) {
      _error = "Server error / No internet";
    }
  }

  Future<void> _fetchStaff() async {
    try {
      final res = await HttpService.get("/api/tasks/staff");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list =
            decoded is List ? decoded : (decoded["data"] ?? []);
        _staffList = list
            .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
            .toList();
      }
    } catch (_) {}
  }

  Future<void> _onFilterChanged() async {
    setState(() => _loading = true);
    await _fetchTasks();
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _resolve(Map<String, dynamic> task) async {
    final id = task["id"]?.toString() ?? "";
    if (id.isEmpty) return;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("Resolve Task"),
        content: const Text("Mark this task as completed?"),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text("Cancel")),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style:
                ElevatedButton.styleFrom(backgroundColor: AppTheme.successGreen),
            child: const Text("Resolve"),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    try {
      final res = await HttpService.patch(
        "/api/tasks/$id/status",
        {"status": "COMPLETED"},
      );
      if (!mounted) return;
      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text("Task resolved"),
              backgroundColor: AppTheme.successGreen),
        );
        _loadAll();
      } else {
        String msg = "Failed (${res.statusCode})";
        try {
          msg = jsonDecode(res.body)["message"] ?? msg;
        } catch (_) {}
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(msg)));
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server error / No internet")),
      );
    }
  }

  Future<void> _delete(Map<String, dynamic> task) async {
    final id = task["id"]?.toString() ?? "";
    if (id.isEmpty) return;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("Delete Task"),
        content: Text(
            "Delete \"${task["title"] ?? "this task"}\"? This cannot be undone."),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text("Cancel")),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.destructiveRed),
            child: const Text("Delete"),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    try {
      final res = await HttpService.delete("/api/tasks/$id");
      if (!mounted) return;
      if (res.statusCode == 200 || res.statusCode == 204) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text("Task deleted"),
              backgroundColor: AppTheme.destructiveRed),
        );
        _loadAll();
      } else {
        String msg = "Failed (${res.statusCode})";
        try {
          msg = jsonDecode(res.body)["message"] ?? msg;
        } catch (_) {}
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(msg)));
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server error / No internet")),
      );
    }
  }

  void _viewDetails(Map<String, dynamic> task) {
    showDialog(
      context: context,
      builder: (_) => _TaskDetailsDialog(task: task),
    );
  }

  Future<void> _forward(Map<String, dynamic> task) async {
    final ok = await showForwardTaskSheet(
      context,
      taskId: task["id"]?.toString() ?? "",
      taskTitle: task["title"]?.toString() ?? "Task",
    );
    if (ok) _loadAll();
  }

  void _exportCsv() {
    CsvExport.export(
      context,
      fileName: 'task_tracker',
      headers: ['Title', 'Type', 'Status', 'Assigned To', 'Reference No', 'Created'],
      rows: _visibleTasks.map((t) {
        String created = '';
        try {
          created = DateFormat('dd MMM yyyy')
              .format(DateTime.parse(t['createdAt'].toString()));
        } catch (_) {}
        return [
          t['title'] ?? '',
          (t['taskType'] ?? '').toString().replaceAll('_', ' '),
          (t['status'] ?? '').toString().replaceAll('_', ' '),
          (t['assignedTo'] is Map ? t['assignedTo']['name'] : '') ?? '',
          t['referenceNo'] ?? '',
          created,
        ];
      }).toList(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        backgroundColor: AppTheme.primaryIndigo,
        title: const Text(
          "Task Tracker",
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          IconButton(
            tooltip: "Export CSV",
            icon: const Icon(Icons.download, color: Colors.white),
            onPressed: _visibleTasks.isEmpty ? null : _exportCsv,
          ),
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white),
            onPressed: _loadAll,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadAll,
        child: _loading
            ? ListView(
                children: const [
                  SizedBox(height: 60),
                  Center(child: CircularProgressIndicator()),
                ],
              )
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _buildStatsRow(),
                  const SizedBox(height: 16),
                  _buildStaffWorkload(),
                  const SizedBox(height: 16),
                  _buildFilterBar(),
                  const SizedBox(height: 8),
                  Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: AppTheme.shadowSm,
                    ),
                    child: DateRangeFilter(
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
                  ),
                  const SizedBox(height: 16),
                  _buildTrackerHeader(),
                  const SizedBox(height: 12),
                  if (_error != null)
                    _buildError()
                  else if (_visibleTasks.isEmpty)
                    _buildEmpty()
                  else
                    ..._visibleTasks.map(_buildTaskCard),
                  const SizedBox(height: 24),
                ],
              ),
      ),
    );
  }

  // ===================== STATS ROW =====================
  Widget _buildStatsRow() {
    final cards = [
      _StatCardData("Total Tasks", _total, const Color(0xFFEFF6FF), const Color(0xFF1E3A8A)),
      _StatCardData("Assigned", _assigned, Colors.white, AppTheme.primaryIndigo),
      _StatCardData("In Progress", _inProgress, const Color(0xFFFFFBEB), const Color(0xFFB45309)),
      _StatCardData("Completed", _completed, const Color(0xFFECFDF5), const Color(0xFF065F46)),
      _StatCardData("On Hold", _onHold, const Color(0xFFF8FAFC), const Color(0xFF475569)),
    ];

    return SizedBox(
      height: 90,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: cards.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (_, i) => _buildStatCard(cards[i]),
      ),
    );
  }

  Widget _buildStatCard(_StatCardData c) {
    return Container(
      width: 130,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: c.bg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            "${c.value}",
            style: TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.bold,
              color: c.fg,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            c.label,
            style: TextStyle(
              fontSize: 12,
              color: c.fg,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  // ===================== STAFF WORKLOAD =====================
  Widget _buildStaffWorkload() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(8),
            onTap: () => setState(
                () => _staffWorkloadExpanded = !_staffWorkloadExpanded),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                children: [
                  const Icon(Icons.groups,
                      color: AppTheme.primaryIndigo, size: 20),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      "Staff Workload",
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.foreground,
                      ),
                    ),
                  ),
                  if (_staffWorkload.isNotEmpty)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppTheme.primaryIndigo50,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        "${_staffWorkload.length}",
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.primaryIndigo,
                        ),
                      ),
                    ),
                  const SizedBox(width: 6),
                  Icon(
                    _staffWorkloadExpanded
                        ? Icons.keyboard_arrow_up
                        : Icons.keyboard_arrow_down,
                    color: Colors.grey.shade600,
                    size: 22,
                  ),
                ],
              ),
            ),
          ),
          if (_staffWorkloadExpanded) ...[
            const SizedBox(height: 12),
            if (_staffWorkload.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text(
                  "No active workload",
                  style:
                      TextStyle(color: Colors.grey.shade600, fontSize: 12),
                ),
              )
            else
              ..._staffWorkload.map(_buildWorkloadRow),
          ],
        ],
      ),
    );
  }

  Widget _buildWorkloadRow(Map<String, dynamic> w) {
    final staff = Map<String, dynamic>.from(w["staff"] ?? {});
    final name = staff["name"]?.toString() ?? "—";
    final staffId = staff["id"]?.toString();
    final pending = w["pendingTasks"] ?? 0;
    final isSelected = staffId != null && _staffFilterId == staffId;

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: isSelected
            ? AppTheme.primaryIndigo.withOpacity(0.18)
            : AppTheme.primaryIndigo50,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: staffId == null ? null : () => _toggleStaffFilter(staffId),
          child: Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              border: isSelected
                  ? Border.all(color: AppTheme.primaryIndigo, width: 1.4)
                  : null,
            ),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 16,
                  backgroundColor: Colors.white,
                  child: Icon(
                    isSelected ? Icons.check : Icons.person,
                    color: AppTheme.primaryIndigo,
                    size: 18,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.foreground,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        "$pending pending tasks",
                        style: TextStyle(
                            fontSize: 11, color: Colors.grey.shade700),
                      ),
                    ],
                  ),
                ),
                Icon(
                  isSelected
                      ? Icons.filter_alt
                      : Icons.filter_alt_outlined,
                  size: 18,
                  color: isSelected
                      ? AppTheme.primaryIndigo
                      : Colors.grey.shade500,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// Tap a workload row → filter the task list to that staff. Tap again
  /// (same staff) → clear the filter.
  void _toggleStaffFilter(String staffId) {
    setState(() {
      _staffFilterId = _staffFilterId == staffId ? null : staffId;
    });
    _onFilterChanged();
  }

  List<Map<String, dynamic>> get _visibleTasks {
    if (_dateFrom == null && _dateTo == null) return _tasks;
    return _tasks.where((t) {
      final dt = DateTime.tryParse(t['createdAt']?.toString() ?? '');
      return dateInRange(dt, from: _dateFrom, to: _dateTo);
    }).toList();
  }

  // ===================== FILTER BAR =====================
  Widget _buildFilterBar() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.filter_list, size: 18, color: Colors.grey),
              const SizedBox(width: 6),
              const Text("Filter:",
                  style: TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w600)),
              const SizedBox(width: 8),
              Expanded(
                child: _filterDropdown(
                  hint: "All types",
                  value: _typeFilter,
                  options: _types,
                  labelFor: (v) =>
                      v == "All" ? "All types" : v.replaceAll('_', ' '),
                  onChanged: (v) {
                    setState(() => _typeFilter = v ?? "All");
                    _onFilterChanged();
                  },
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: _filterDropdown(
                  hint: "All Status",
                  value: _statusFilter,
                  options: _statuses,
                  labelFor: (v) =>
                      v == "All" ? "All Status" : v.replaceAll('_', ' '),
                  onChanged: (v) {
                    setState(() => _statusFilter = v ?? "All");
                    _onFilterChanged();
                  },
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          _staffFilterDropdown(),
        ],
      ),
    );
  }

  Widget _filterDropdown({
    required String hint,
    required String value,
    required List<String> options,
    required String Function(String) labelFor,
    required ValueChanged<String?> onChanged,
  }) {
    return DropdownButtonFormField<String>(
      value: value,
      isExpanded: true,
      isDense: true,
      decoration: InputDecoration(
        isDense: true,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: Colors.grey.shade300),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: Colors.grey.shade300),
        ),
      ),
      items: options
          .map((o) => DropdownMenuItem(
                value: o,
                child: Text(
                  labelFor(o),
                  style: const TextStyle(fontSize: 12),
                  overflow: TextOverflow.ellipsis,
                ),
              ))
          .toList(),
      onChanged: onChanged,
    );
  }

  /// Merge `_staffList` with any staff that show up in `_staffWorkload`
  /// but aren't in `_staffList`. The two endpoints can return different
  /// staff IDs (legacyId vs Catalyst ROWID), so a workload row tap can
  /// set `_staffFilterId` to a value that has no matching DropdownMenuItem
  /// — which throws a Flutter assertion. Deduping by id makes the dropdown
  /// resilient to that mismatch.
  List<Map<String, dynamic>> _mergedStaffList() {
    final byId = <String, Map<String, dynamic>>{};
    for (final s in _staffList) {
      final id = s["id"]?.toString();
      if (id != null && id.isNotEmpty) byId[id] = s;
    }
    for (final w in _staffWorkload) {
      final s = (w["staff"] is Map)
          ? Map<String, dynamic>.from(w["staff"])
          : null;
      final id = s?["id"]?.toString();
      if (id != null && id.isNotEmpty && !byId.containsKey(id)) {
        byId[id] = s!;
      }
    }
    final merged = byId.values.toList();
    merged.sort((a, b) => (a["name"]?.toString() ?? "")
        .compareTo(b["name"]?.toString() ?? ""));
    return merged;
  }

  Widget _staffFilterDropdown() {
    final items = _mergedStaffList();
    final hasMatch = _staffFilterId == null ||
        items.any((s) => s["id"]?.toString() == _staffFilterId);
    final dropdownValue = hasMatch ? _staffFilterId : null;

    return DropdownButtonFormField<String?>(
      value: dropdownValue,
      isExpanded: true,
      isDense: true,
      decoration: InputDecoration(
        isDense: true,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: Colors.grey.shade300),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: Colors.grey.shade300),
        ),
      ),
      items: [
        const DropdownMenuItem<String?>(
            value: null,
            child: Text("All Staff", style: TextStyle(fontSize: 12))),
        ...items.map((s) => DropdownMenuItem<String?>(
              value: s["id"]?.toString(),
              child: Text(
                s["name"]?.toString() ?? "—",
                style: const TextStyle(fontSize: 12),
                overflow: TextOverflow.ellipsis,
              ),
            )),
      ],
      onChanged: (v) {
        setState(() => _staffFilterId = v);
        _onFilterChanged();
      },
    );
  }

  // ===================== TRACKER HEADER =====================
  Widget _buildTrackerHeader() {
    return Row(
      children: [
        const Icon(Icons.trending_up,
            color: AppTheme.primaryIndigo, size: 20),
        const SizedBox(width: 8),
        Text(
          "Task Progress Tracker (${_visibleTasks.length})",
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: AppTheme.foreground,
          ),
        ),
      ],
    );
  }

  // ===================== TASK CARD =====================
  Widget _buildTaskCard(Map<String, dynamic> task) {
    final id = task["id"]?.toString() ?? "";
    final title = task["title"]?.toString() ?? "—";
    final status = (task["status"] ?? "ASSIGNED").toString();
    final type = (task["taskType"] ?? "GENERAL").toString();
    final assignedTo = task["assignedTo"];
    final assignedName = (assignedTo is Map)
        ? (assignedTo["name"]?.toString() ?? "—")
        : "—";
    final progress = task["progressNotes"]?.toString();
    final isCompleted = status == "COMPLETED";
    final isExpanded = _expandedTaskIds.contains(id);

    void toggleExpand() {
      if (id.isEmpty) return;
      setState(() {
        if (isExpanded) {
          _expandedTaskIds.remove(id);
        } else {
          _expandedTaskIds.add(id);
        }
      });
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.border),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              InkWell(
                onTap: toggleExpand,
                borderRadius: BorderRadius.circular(6),
                child: Padding(
                  padding: const EdgeInsets.only(right: 6, top: 1),
                  child: Icon(
                    isExpanded
                        ? Icons.keyboard_arrow_down
                        : Icons.chevron_right,
                    size: 22,
                    color: AppTheme.primaryIndigoDark,
                  ),
                ),
              ),
              Expanded(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: toggleExpand,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.primaryIndigoDark,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 6,
                        runSpacing: 4,
                        children: [
                          _statusPill(status),
                          _typePill(type),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        "Assigned to: $assignedName",
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          // Actions on their own full-width row so the title / chips / assigned
          // text above get the full card width (no mid-word wrapping).
          Align(
            alignment: Alignment.centerRight,
            child: _cardActions(task, isCompleted),
          ),
          if (isExpanded) ...[
            const SizedBox(height: 10),
            Divider(color: Colors.grey.shade200, height: 1),
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.access_time,
                    size: 13, color: Colors.grey.shade600),
                const SizedBox(width: 6),
                const Text(
                  "Recent Activity",
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.foreground,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Padding(
              padding: const EdgeInsets.only(left: 19),
              child: Text(
                (progress == null || progress.isEmpty)
                    ? "No activity yet"
                    : progress,
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey.shade600,
                  fontStyle: (progress == null || progress.isEmpty)
                      ? FontStyle.italic
                      : FontStyle.normal,
                ),
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _cardActions(Map<String, dynamic> task, bool isCompleted) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        // View
        IconButton(
          tooltip: "View",
          onPressed: () => _viewDetails(task),
          padding: EdgeInsets.zero,
          constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
          icon: const Icon(Icons.visibility_outlined,
              size: 20, color: Colors.black87),
          style: IconButton.styleFrom(
            backgroundColor: Colors.grey.shade100,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8)),
          ),
        ),
        const SizedBox(width: 6),
        IconButton(
          tooltip: "Forward",
          onPressed: () => _forward(task),
          padding: EdgeInsets.zero,
          constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
          icon: const Icon(Icons.forward,
              size: 20, color: AppTheme.saffronDark),
          style: IconButton.styleFrom(
            backgroundColor: AppTheme.saffronSoft,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8)),
          ),
        ),
        if (!isCompleted) ...[
          const SizedBox(width: 6),
          OutlinedButton.icon(
            onPressed: () => _resolve(task),
            icon: const Icon(Icons.check_circle_outline,
                size: 16, color: AppTheme.successGreen),
            label: const Text("Resolve"),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppTheme.successGreen,
              backgroundColor: Colors.white,
              side: const BorderSide(color: AppTheme.successGreen),
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              minimumSize: const Size(0, 36),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8)),
              textStyle: const TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w600),
            ),
          ),
        ],
        const SizedBox(width: 6),
        IconButton(
          tooltip: "Delete",
          onPressed: () => _delete(task),
          padding: EdgeInsets.zero,
          constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
          icon: const Icon(Icons.delete_outline,
              size: 20, color: Colors.white),
          style: IconButton.styleFrom(
            backgroundColor: AppTheme.destructiveRed,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8)),
          ),
        ),
      ],
    );
  }

  Widget _statusPill(String status) {
    Color bg;
    Color fg;
    switch (status.toUpperCase()) {
      case "ASSIGNED":
        bg = const Color(0xFFFFEDD5);
        fg = const Color(0xFFC2410C);
        break;
      case "IN_PROGRESS":
        bg = const Color(0xFFFEF3C7);
        fg = const Color(0xFFB45309);
        break;
      case "COMPLETED":
        bg = const Color(0xFFFFEDD5);
        fg = const Color(0xFFC2410C);
        break;
      case "ON_HOLD":
        bg = Colors.grey.shade200;
        fg = Colors.grey.shade700;
        break;
      default:
        bg = Colors.grey.shade200;
        fg = Colors.grey.shade700;
    }
    final label = status == "COMPLETED"
        ? "Completed"
        : status[0].toUpperCase() +
            status.substring(1).toLowerCase().replaceAll('_', ' ');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Text(label,
          style: TextStyle(
              fontSize: 10, fontWeight: FontWeight.bold, color: fg)),
    );
  }

  Widget _typePill(String type) {
    final label = switch (type) {
      "GRIEVANCE" => "Grievance",
      "TRAIN_REQUEST" => "Train EQ",
      "TOUR_PROGRAM" => "Tour",
      "GENERAL" => "General",
      _ => type,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(label,
          style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: Colors.grey.shade800)),
    );
  }

  Widget _buildError() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 40),
      child: Center(
        child: Column(
          children: [
            Icon(Icons.error_outline,
                size: 48, color: Colors.grey.shade400),
            const SizedBox(height: 12),
            Text(_error!,
                style: TextStyle(color: Colors.grey.shade700)),
            const SizedBox(height: 12),
            ElevatedButton.icon(
              onPressed: _loadAll,
              icon: const Icon(Icons.refresh),
              label: const Text("Retry"),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primaryIndigo,
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmpty() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 40),
      child: Center(
        child: Column(
          children: [
            Icon(Icons.inbox_outlined,
                size: 56, color: Colors.grey.shade300),
            const SizedBox(height: 12),
            Text("No tasks match",
                style: TextStyle(
                    color: Colors.grey.shade600, fontSize: 14)),
          ],
        ),
      ),
    );
  }
}

class _StatCardData {
  final String label;
  final int value;
  final Color bg;
  final Color fg;
  const _StatCardData(this.label, this.value, this.bg, this.fg);
}

// =====================================================
// TASK DETAILS DIALOG
// =====================================================
class _TaskDetailsDialog extends StatelessWidget {
  final Map<String, dynamic> task;
  const _TaskDetailsDialog({required this.task});

  String _formatDateTime(dynamic v) {
    if (v == null) return "—";
    try {
      return DateFormat('d MMM yyyy, hh:mm a').format(DateTime.parse(v.toString()));
    } catch (_) {
      return "—";
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = (task["status"] ?? "ASSIGNED").toString();
    final type = (task["taskType"] ?? "GENERAL").toString();
    final priority = (task["priority"] ?? "NORMAL").toString();
    final title = task["title"]?.toString() ?? "—";
    final desc = task["description"]?.toString() ?? "";
    final assignedTo = (task["assignedTo"] is Map)
        ? Map<String, dynamic>.from(task["assignedTo"])
        : <String, dynamic>{};
    final assignedBy = (task["assignedBy"] is Map)
        ? Map<String, dynamic>.from(task["assignedBy"])
        : <String, dynamic>{};

    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      shape:
          RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 540),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      "Task Details",
                      style: TextStyle(
                          fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                  ),
                  IconButton(
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    icon: const Icon(Icons.close),
                    color: Colors.grey.shade600,
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  _pillFor(status, _statusColors(status)),
                  _outlinedPill(_typeLabel(type)),
                  _pillFor(_priorityLabel(priority).toUpperCase(),
                      _priorityColors(priority)),
                ],
              ),
              const SizedBox(height: 14),
              Text(title,
                  style: const TextStyle(
                      fontSize: 16, fontWeight: FontWeight.bold)),
              if (desc.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(desc,
                    style: TextStyle(
                        fontSize: 13, color: Colors.grey.shade700)),
              ],
              const SizedBox(height: 18),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: _kv(
                        "Assigned To",
                        assignedTo["name"]?.toString() ?? "—",
                        assignedTo["email"]?.toString()),
                  ),
                  Expanded(
                    child: _kv(
                        "Assigned By",
                        assignedBy["name"]?.toString() ?? "—",
                        assignedBy["email"]?.toString()),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: _kv("Assigned At",
                        _formatDateTime(task["assignedAt"]), null),
                  ),
                  Expanded(
                    child: _kv(
                        "Due Date", _formatDateTime(task["dueDate"]), null),
                  ),
                ],
              ),
              if (task["completedAt"] != null) ...[
                const SizedBox(height: 12),
                _kv("Completed At",
                    _formatDateTime(task["completedAt"]), null),
              ],
              if ((task["progressNotes"]?.toString() ?? "").isNotEmpty) ...[
                const SizedBox(height: 12),
                _kv("Progress Notes",
                    task["progressNotes"].toString(), null),
              ],
              const SizedBox(height: 18),
              Divider(color: Colors.grey.shade200),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  OutlinedButton(
                    onPressed: () => Navigator.pop(context),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.grey.shade800,
                      side: BorderSide(color: Colors.grey.shade300),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8)),
                      padding:
                          const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
                    ),
                    child: const Text("Close"),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _kv(String label, String value, String? sub) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: TextStyle(
                fontSize: 12, color: Colors.grey.shade600)),
        const SizedBox(height: 2),
        Text(value,
            style: const TextStyle(
                fontSize: 14, fontWeight: FontWeight.w600)),
        if (sub != null && sub.isNotEmpty)
          Text(sub,
              style: TextStyle(
                  fontSize: 11, color: Colors.grey.shade600)),
      ],
    );
  }

  Widget _pillFor(String text, List<Color> colors) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: colors[0],
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.bold,
          color: colors[1],
        ),
      ),
    );
  }

  Widget _outlinedPill(String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        text,
        style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: Colors.grey.shade800),
      ),
    );
  }

  List<Color> _statusColors(String status) {
    switch (status.toUpperCase()) {
      case "COMPLETED":
        return [const Color(0xFFFFEDD5), const Color(0xFFC2410C)];
      case "IN_PROGRESS":
        return [const Color(0xFFFEF3C7), const Color(0xFFB45309)];
      case "ASSIGNED":
        return [const Color(0xFFFFEDD5), const Color(0xFFC2410C)];
      case "ON_HOLD":
        return [Colors.grey.shade200, Colors.grey.shade700];
      default:
        return [Colors.grey.shade200, Colors.grey.shade700];
    }
  }

  List<Color> _priorityColors(String p) {
    switch (p.toUpperCase()) {
      case "URGENT":
      case "HIGH":
        return [const Color(0xFFFEE2E2), const Color(0xFFB91C1C)];
      case "LOW":
        return [const Color(0xFFE0E7FF), const Color(0xFF4338CA)];
      default:
        return [Colors.grey.shade200, Colors.grey.shade700];
    }
  }

  String _typeLabel(String t) => switch (t) {
        "GRIEVANCE" => "Grievance",
        "TRAIN_REQUEST" => "Train EQ",
        "TOUR_PROGRAM" => "Tour",
        "GENERAL" => "General",
        _ => t,
      };

  String _priorityLabel(String p) => switch (p.toUpperCase()) {
        "LOW" => "Low",
        "HIGH" => "High",
        "URGENT" => "Urgent",
        _ => "Normal",
      };
}
