import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';

import '../../../services/http_service.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../widgets/cupertino/cupertino_form_helpers.dart';
import '../../../widgets/cupertino/cupertino_date_range_filter.dart';
import '../../../widgets/date_range_filter.dart' show dateInRange;

class CupertinoTaskListPage extends StatefulWidget {
  final String role;
  const CupertinoTaskListPage({super.key, required this.role});

  @override
  State<CupertinoTaskListPage> createState() => _CupertinoTaskListPageState();
}

class _CupertinoTaskListPageState extends State<CupertinoTaskListPage> {
  bool _loading = true;
  String? _error;

  int _total = 0;
  int _assigned = 0;
  int _inProgress = 0;
  int _completed = 0;
  int _onHold = 0;
  List<Map<String, dynamic>> _staffWorkload = [];

  List<Map<String, dynamic>> _tasks = [];
  List<Map<String, dynamic>> _staffList = [];

  String _typeFilter = "All";
  String _statusFilter = "All";
  String? _staffFilterId;
  DateTime? _dateFrom;
  DateTime? _dateTo;

  // Tracks which task cards are expanded to show Recent Activity. Cards are
  // collapsed by default to match the web Task Tracker layout.
  final Set<String> _expandedTaskIds = {};

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
        final stats = Map<String, dynamic>.from(data["stats"] ?? {});
        _total = (stats["total"] ?? 0) as int;
        _assigned = (stats["assigned"] ?? 0) as int;
        _inProgress = (stats["inProgress"] ?? 0) as int;
        _completed = (stats["completed"] ?? 0) as int;
        _onHold = (stats["onHold"] ?? 0) as int;

        final List wl = (data["staffTaskCounts"] ?? []) as List;
        _staffWorkload = wl
            .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
            .toList();
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

    final confirm = await showCupertinoDialog<bool>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: const Text("Resolve Task"),
        content: const Text("Mark this task as completed?"),
        actions: [
          CupertinoDialogAction(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text("Cancel"),
          ),
          CupertinoDialogAction(
            onPressed: () => Navigator.pop(ctx, true),
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
        CupertinoToast.show(context, "Task resolved");
        _loadAll();
      } else {
        String msg = "Failed (${res.statusCode})";
        try {
          msg = jsonDecode(res.body)["message"] ?? msg;
        } catch (_) {}
        CupertinoToast.show(context, msg, isError: true);
      }
    } catch (_) {
      if (!mounted) return;
      CupertinoToast.show(context, "Server error / No internet",
          isError: true);
    }
  }

  Future<void> _delete(Map<String, dynamic> task) async {
    final id = task["id"]?.toString() ?? "";
    if (id.isEmpty) return;

    final confirm = await showCupertinoDialog<bool>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: const Text("Delete Task"),
        content: Text(
            "Delete \"${task["title"] ?? "this task"}\"? This cannot be undone."),
        actions: [
          CupertinoDialogAction(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text("Cancel"),
          ),
          CupertinoDialogAction(
            isDestructiveAction: true,
            onPressed: () => Navigator.pop(ctx, true),
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
        CupertinoToast.show(context, "Task deleted");
        _loadAll();
      } else {
        String msg = "Failed (${res.statusCode})";
        try {
          msg = jsonDecode(res.body)["message"] ?? msg;
        } catch (_) {}
        CupertinoToast.show(context, msg, isError: true);
      }
    } catch (_) {
      if (!mounted) return;
      CupertinoToast.show(context, "Server error / No internet",
          isError: true);
    }
  }

  void _viewDetails(Map<String, dynamic> task) {
    showCupertinoModalPopup(
      context: context,
      builder: (_) => _CupertinoTaskDetailsSheet(task: task),
    );
  }

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      backgroundColor: AppTheme.background,
      navigationBar: CupertinoNavigationBar(
        backgroundColor: AppTheme.primaryIndigo,
        brightness: Brightness.dark,
        middle: const Text(
          "Task Tracker",
          style: TextStyle(color: CupertinoColors.white),
        ),
        leading: CupertinoButton(
          padding: EdgeInsets.zero,
          onPressed: () => Navigator.pop(context),
          child:
              const Icon(CupertinoIcons.back, color: CupertinoColors.white),
        ),
        trailing: GestureDetector(
          onTap: _loadAll,
          child: const Icon(CupertinoIcons.refresh,
              color: CupertinoColors.white, size: 22),
        ),
      ),
      child: SafeArea(
        child: CustomScrollView(
          slivers: [
            CupertinoSliverRefreshControl(onRefresh: _loadAll),
            SliverPadding(
              padding: const EdgeInsets.all(16),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  if (_loading)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 60),
                      child: Center(child: CupertinoActivityIndicator()),
                    )
                  else ...[
                    _buildStatsRow(),
                    const SizedBox(height: 16),
                    _buildStaffWorkload(),
                    const SizedBox(height: 16),
                    _buildFilterBar(),
                    const SizedBox(height: 8),
                    Container(
                      decoration: BoxDecoration(
                        color: CupertinoColors.systemBackground,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: CupertinoColors.systemGrey5),
                      ),
                      child: CupertinoDateRangeFilter(
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
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatsRow() {
    final cards = [
      _StatCardData(
          "Total Tasks", _total, const Color(0xFFEFF6FF), const Color(0xFF1E3A8A)),
      _StatCardData(
          "Assigned", _assigned, CupertinoColors.white, AppTheme.primaryIndigo),
      _StatCardData("In Progress", _inProgress, const Color(0xFFFFFBEB),
          const Color(0xFFB45309)),
      _StatCardData("Completed", _completed, const Color(0xFFECFDF5),
          const Color(0xFF065F46)),
      _StatCardData(
          "On Hold", _onHold, const Color(0xFFF8FAFC), const Color(0xFF475569)),
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
          Text("${c.value}",
              style: TextStyle(
                  fontSize: 26, fontWeight: FontWeight.bold, color: c.fg)),
          const SizedBox(height: 2),
          Text(c.label,
              style: TextStyle(
                  fontSize: 12,
                  color: c.fg,
                  fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }

  Widget _buildStaffWorkload() {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: const [
              Icon(CupertinoIcons.person_2_fill,
                  color: AppTheme.primaryIndigo, size: 20),
              SizedBox(width: 8),
              Text("Staff Workload",
                  style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.foreground)),
            ],
          ),
          const SizedBox(height: 12),
          if (_staffWorkload.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text("No active workload",
                  style: TextStyle(
                      color: CupertinoColors.systemGrey, fontSize: 12)),
            )
          else
            ..._staffWorkload.map(_buildWorkloadRow),
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
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: staffId == null ? null : () => _toggleStaffFilter(staffId),
        child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: isSelected
                ? AppTheme.primaryIndigo.withOpacity(0.18)
                : AppTheme.primaryIndigo50,
            borderRadius: BorderRadius.circular(10),
            border: isSelected
                ? Border.all(color: AppTheme.primaryIndigo, width: 1.4)
                : null,
          ),
          child: Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: const BoxDecoration(
                  color: CupertinoColors.white,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                    isSelected
                        ? CupertinoIcons.checkmark_alt
                        : CupertinoIcons.person,
                    color: AppTheme.primaryIndigo,
                    size: 18),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name,
                        style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.bold,
                            color: AppTheme.foreground),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis),
                    Text("$pending pending tasks",
                        style: const TextStyle(
                            fontSize: 11, color: CupertinoColors.systemGrey)),
                  ],
                ),
              ),
              Icon(
                isSelected
                    ? CupertinoIcons.line_horizontal_3_decrease_circle_fill
                    : CupertinoIcons.line_horizontal_3_decrease_circle,
                size: 18,
                color: isSelected
                    ? AppTheme.primaryIndigo
                    : CupertinoColors.systemGrey2,
              ),
            ],
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

  Widget _buildFilterBar() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Row(
        children: [
          const Icon(CupertinoIcons.line_horizontal_3_decrease,
              size: 18, color: CupertinoColors.systemGrey),
          const SizedBox(width: 6),
          const Text("Filter:",
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
          const SizedBox(width: 8),
          Expanded(
            child: _filterPicker(
              hint: "All types",
              currentLabel: _typeFilter == "All"
                  ? "All types"
                  : _typeFilter.replaceAll('_', ' '),
              options: _types,
              labelFor: (v) =>
                  v == "All" ? "All types" : v.replaceAll('_', ' '),
              onSelected: (v) {
                setState(() => _typeFilter = v);
                _onFilterChanged();
              },
              currentValue: _typeFilter,
            ),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: _filterPicker(
              hint: "All Status",
              currentLabel: _statusFilter == "All"
                  ? "All Status"
                  : _statusFilter.replaceAll('_', ' '),
              options: _statuses,
              labelFor: (v) =>
                  v == "All" ? "All Status" : v.replaceAll('_', ' '),
              onSelected: (v) {
                setState(() => _statusFilter = v);
                _onFilterChanged();
              },
              currentValue: _statusFilter,
            ),
          ),
          const SizedBox(width: 6),
          Expanded(child: _staffPicker()),
        ],
      ),
    );
  }

  Widget _filterPicker({
    required String hint,
    required String currentLabel,
    required List<String> options,
    required String currentValue,
    required String Function(String) labelFor,
    required ValueChanged<String> onSelected,
  }) {
    return GestureDetector(
      onTap: () {
        final labels = options.map(labelFor).toList();
        CupertinoFormHelpers.showPicker(
          context: context,
          items: labels,
          currentValue: labelFor(currentValue),
          title: hint,
          onSelected: (label) {
            final idx = labels.indexOf(label);
            if (idx >= 0) onSelected(options[idx]);
          },
        );
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        decoration: BoxDecoration(
          color: CupertinoColors.systemGrey6,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: CupertinoColors.systemGrey4),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                currentLabel,
                style: const TextStyle(fontSize: 12),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const Icon(CupertinoIcons.chevron_down,
                size: 12, color: CupertinoColors.systemGrey),
          ],
        ),
      ),
    );
  }

  /// Merge `_staffList` with any staff that show up in `_staffWorkload`
  /// but aren't in `_staffList`. The /tasks/staff and /tasks/tracking
  /// endpoints can return different IDs for the same person (legacyId vs
  /// Catalyst ROWID), so this prevents a workload-row tap from leaving the
  /// picker stuck on "All Staff" when its ID isn't in the staff list.
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

  Widget _staffPicker() {
    final mergedStaff = _mergedStaffList();
    final selected = _staffFilterId == null
        ? "All Staff"
        : (mergedStaff.firstWhere(
              (s) => s["id"]?.toString() == _staffFilterId,
              orElse: () => {"name": "All Staff"},
            )["name"]?.toString() ??
            "All Staff");

    return GestureDetector(
      onTap: () {
        final labels = ["All Staff"] +
            mergedStaff.map((s) => s["name"]?.toString() ?? "—").toList();
        CupertinoFormHelpers.showPicker(
          context: context,
          items: labels,
          currentValue: selected,
          title: "Staff",
          onSelected: (name) {
            if (name == "All Staff") {
              setState(() => _staffFilterId = null);
            } else {
              final s = mergedStaff.firstWhere(
                (s) => s["name"]?.toString() == name,
                orElse: () => {},
              );
              if (s.isNotEmpty) {
                setState(() => _staffFilterId = s["id"]?.toString());
              }
            }
            _onFilterChanged();
          },
        );
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        decoration: BoxDecoration(
          color: CupertinoColors.systemGrey6,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: CupertinoColors.systemGrey4),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                selected,
                style: const TextStyle(fontSize: 12),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const Icon(CupertinoIcons.chevron_down,
                size: 12, color: CupertinoColors.systemGrey),
          ],
        ),
      ),
    );
  }

  Widget _buildTrackerHeader() {
    return Row(
      children: [
        const Icon(CupertinoIcons.chart_bar_alt_fill,
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

  Widget _buildTaskCard(Map<String, dynamic> task) {
    final id = task["id"]?.toString() ?? "";
    final title = task["title"]?.toString() ?? "—";
    final status = (task["status"] ?? "ASSIGNED").toString();
    final type = (task["taskType"] ?? "GENERAL").toString();
    final assignedTo = task["assignedTo"];
    final assignedName =
        (assignedTo is Map) ? (assignedTo["name"]?.toString() ?? "—") : "—";
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
        color: CupertinoColors.white,
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
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: toggleExpand,
                child: Padding(
                  padding: const EdgeInsets.only(right: 6, top: 1),
                  child: Icon(
                    isExpanded
                        ? CupertinoIcons.chevron_down
                        : CupertinoIcons.chevron_right,
                    size: 18,
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
                      Text(title,
                          style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.bold,
                              color: AppTheme.primaryIndigoDark),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis),
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
                      Text("Assigned to: $assignedName",
                          style: const TextStyle(
                              fontSize: 12,
                              color: CupertinoColors.systemGrey)),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              _cardActions(task, isCompleted),
            ],
          ),
          if (isExpanded) ...[
            const SizedBox(height: 10),
            Container(height: 0.5, color: CupertinoColors.systemGrey4),
            const SizedBox(height: 8),
            Row(
              children: const [
                Icon(CupertinoIcons.clock,
                    size: 13, color: CupertinoColors.systemGrey),
                SizedBox(width: 6),
                Text("Recent Activity",
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.foreground)),
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
                  color: CupertinoColors.systemGrey,
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
        _iconBtn(
          icon: CupertinoIcons.eye,
          color: CupertinoColors.black,
          bg: CupertinoColors.systemGrey6,
          onTap: () => _viewDetails(task),
        ),
        if (!isCompleted) ...[
          const SizedBox(width: 6),
          GestureDetector(
            onTap: () => _resolve(task),
            child: Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: CupertinoColors.white,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppTheme.successGreen),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(CupertinoIcons.checkmark_circle,
                      size: 14, color: AppTheme.successGreen),
                  SizedBox(width: 4),
                  Text(
                    "Resolve",
                    style: TextStyle(
                      color: AppTheme.successGreen,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
        const SizedBox(width: 6),
        _iconBtn(
          icon: CupertinoIcons.delete,
          color: CupertinoColors.white,
          bg: AppTheme.destructiveRed,
          onTap: () => _delete(task),
        ),
      ],
    );
  }

  Widget _iconBtn({
    required IconData icon,
    required Color color,
    required Color bg,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 36,
        height: 36,
        decoration:
            BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
        child: Icon(icon, color: color, size: 18),
      ),
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
        bg = CupertinoColors.systemGrey5;
        fg = CupertinoColors.systemGrey;
        break;
      default:
        bg = CupertinoColors.systemGrey5;
        fg = CupertinoColors.systemGrey;
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
        border: Border.all(color: CupertinoColors.systemGrey4),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(label,
          style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: CupertinoColors.systemGrey)),
    );
  }

  Widget _buildError() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 40),
      child: Center(
        child: Column(
          children: [
            const Icon(CupertinoIcons.exclamationmark_circle,
                size: 48, color: CupertinoColors.systemGrey3),
            const SizedBox(height: 12),
            Text(_error!,
                style:
                    const TextStyle(color: CupertinoColors.systemGrey)),
            const SizedBox(height: 12),
            CupertinoButton.filled(
              onPressed: _loadAll,
              child: const Text("Retry"),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmpty() {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 40),
      child: Center(
        child: Column(
          children: [
            Icon(CupertinoIcons.tray,
                size: 56, color: CupertinoColors.systemGrey4),
            SizedBox(height: 12),
            Text("No tasks match",
                style: TextStyle(
                    color: CupertinoColors.systemGrey, fontSize: 14)),
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
// CUPERTINO TASK DETAILS MODAL
// =====================================================
class _CupertinoTaskDetailsSheet extends StatelessWidget {
  final Map<String, dynamic> task;
  const _CupertinoTaskDetailsSheet({required this.task});

  String _formatDateTime(dynamic v) {
    if (v == null) return "—";
    try {
      return DateFormat('d MMM yyyy, hh:mm a')
          .format(DateTime.parse(v.toString()));
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

    return Container(
      decoration: const BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 12),
                  decoration: BoxDecoration(
                    color: CupertinoColors.systemGrey4,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Row(
                children: [
                  const Expanded(
                    child: Text("Task Details",
                        style: TextStyle(
                            fontSize: 18, fontWeight: FontWeight.bold)),
                  ),
                  CupertinoButton(
                    padding: EdgeInsets.zero,
                    minSize: 0,
                    onPressed: () => Navigator.pop(context),
                    child: const Icon(CupertinoIcons.xmark,
                        size: 20, color: CupertinoColors.systemGrey),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  _pillFor(_statusLabel(status), _statusColors(status)),
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
                    style: const TextStyle(
                        fontSize: 13,
                        color: CupertinoColors.systemGrey)),
              ],
              const SizedBox(height: 18),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: _kv("Assigned To",
                        assignedTo["name"]?.toString() ?? "—",
                        assignedTo["email"]?.toString()),
                  ),
                  Expanded(
                    child: _kv("Assigned By",
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
              Container(height: 0.5, color: CupertinoColors.systemGrey4),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  CupertinoButton(
                    color: CupertinoColors.systemGrey6,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 18, vertical: 10),
                    borderRadius: BorderRadius.circular(8),
                    onPressed: () => Navigator.pop(context),
                    child: const Text("Close",
                        style: TextStyle(
                            color: CupertinoColors.black,
                            fontWeight: FontWeight.w600)),
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
            style: const TextStyle(
                fontSize: 12, color: CupertinoColors.systemGrey)),
        const SizedBox(height: 2),
        Text(value,
            style: const TextStyle(
                fontSize: 14, fontWeight: FontWeight.w600)),
        if (sub != null && sub.isNotEmpty)
          Text(sub,
              style: const TextStyle(
                  fontSize: 11, color: CupertinoColors.systemGrey)),
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
      child: Text(text,
          style: TextStyle(
              fontSize: 11, fontWeight: FontWeight.bold, color: colors[1])),
    );
  }

  Widget _outlinedPill(String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        border: Border.all(color: CupertinoColors.systemGrey4),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(text,
          style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: CupertinoColors.systemGrey)),
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
        return [CupertinoColors.systemGrey5, CupertinoColors.systemGrey];
      default:
        return [CupertinoColors.systemGrey5, CupertinoColors.systemGrey];
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
        return [CupertinoColors.systemGrey5, CupertinoColors.systemGrey];
    }
  }

  String _statusLabel(String s) => switch (s.toUpperCase()) {
        "COMPLETED" => "Completed",
        "IN_PROGRESS" => "In Progress",
        "ASSIGNED" => "Assigned",
        "ON_HOLD" => "On Hold",
        _ => s,
      };

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
