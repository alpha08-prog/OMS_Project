import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';

import '../../../services/http_service.dart';
import '../../../theme/app_theme.dart';
import '../../../utils/csv_export.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../widgets/cupertino/cupertino_form_helpers.dart';
import '../../../widgets/cupertino/cupertino_date_range_filter.dart';
import '../../../widgets/cupertino/cupertino_page_header.dart';
import '../../../widgets/date_range_filter.dart' show dateInRange;

class CupertinoStaffTasksPage extends StatefulWidget {
  const CupertinoStaffTasksPage({super.key});

  @override
  State<CupertinoStaffTasksPage> createState() =>
      _CupertinoStaffTasksPageState();
}

class _CupertinoStaffTasksPageState extends State<CupertinoStaffTasksPage> {
  bool _loading = true;
  List<Map<String, dynamic>> _tasks = [];
  String _statusFilter = 'All';
  DateTime? _dateFrom;
  DateTime? _dateTo;

  List<Map<String, dynamic>> get _visibleTasks {
    if (_dateFrom == null && _dateTo == null) return _tasks;
    return _tasks.where((t) {
      final dt = DateTime.tryParse(t['createdAt']?.toString() ?? '');
      return dateInRange(dt, from: _dateFrom, to: _dateTo);
    }).toList();
  }

  @override
  void initState() {
    super.initState();
    _fetchTasks();
  }

  Future<void> _fetchTasks() async {
    setState(() => _loading = true);
    try {
      String url = "/api/tasks/my-tasks";
      if (_statusFilter != 'All') url += "?status=$_statusFilter";

      final res = await HttpService.get(url);
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list = decoded is List ? decoded : (decoded["data"] ?? []);
        setState(() {
          _tasks = list
              .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
              .toList();
        });
      }
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  void _exportCsv() {
    CsvExport.export(
      context,
      fileName: 'my_tasks',
      headers: [
        'Title',
        'Type',
        'Status',
        'Assigned To',
        'Reference No',
        'Created'
      ],
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

  Future<void> _showUpdateProgressDialog(Map<String, dynamic> task) async {
    final noteCtrl = TextEditingController();
    String newStatus = task["status"] ?? "IN_PROGRESS";

    await showCupertinoModalPopup(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Container(
          padding: EdgeInsets.fromLTRB(
              16, 16, 16, MediaQuery.of(ctx).viewInsets.bottom + 16),
          decoration: const BoxDecoration(
            color: CupertinoColors.systemBackground,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: CupertinoColors.systemGrey4,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text("Update Progress: ${task['title']}",
                  style: const TextStyle(
                      fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 16),
              GestureDetector(
                onTap: () {
                  CupertinoFormHelpers.showPicker(
                    context: ctx,
                    items: ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD'],
                    currentValue: newStatus,
                    title: "Status",
                    onSelected: (v) => setSheetState(() => newStatus = v),
                  );
                },
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    border: Border.all(color: AppTheme.border),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          newStatus.replaceAll('_', ' '),
                          style: const TextStyle(fontSize: 15),
                        ),
                      ),
                      const Icon(CupertinoIcons.chevron_down,
                          size: 16, color: CupertinoColors.systemGrey),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              CupertinoTextField(
                controller: noteCtrl,
                placeholder: "What did you work on?",
                maxLines: 3,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  border: Border.all(color: AppTheme.border),
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: CupertinoButton.filled(
                  onPressed: () async {
                    final body = <String, dynamic>{"status": newStatus};
                    if (noteCtrl.text.trim().isNotEmpty) {
                      body["note"] = noteCtrl.text.trim();
                    }

                    final res = await HttpService.patch(
                        "/api/tasks/${task['id']}/progress", body);
                    if (res.statusCode == 200) {
                      Navigator.pop(ctx);
                      _fetchTasks();
                      CupertinoToast.show(context, "Progress updated");
                    } else {
                      String msg = "Failed";
                      try {
                        msg = jsonDecode(res.body)["message"] ?? msg;
                      } catch (_) {}
                      CupertinoToast.show(ctx, msg, isError: true);
                    }
                  },
                  child: const Text("Update Progress",
                      style: TextStyle(fontWeight: FontWeight.bold)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showHistoryDialog(String taskId) async {
    final res = await HttpService.get("/api/tasks/$taskId/history");
    if (res.statusCode != 200) return;

    final decoded = jsonDecode(res.body);
    final List history = decoded is List ? decoded : (decoded["data"] ?? []);

    if (!mounted) return;
    showCupertinoModalPopup(
      context: context,
      builder: (ctx) => Container(
        constraints:
            BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.6),
        padding: const EdgeInsets.all(16),
        decoration: const BoxDecoration(
          color: CupertinoColors.systemBackground,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: CupertinoColors.systemGrey4,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            const Text("Progress History",
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            if (history.isEmpty)
              const Center(
                  child: Padding(
                      padding: EdgeInsets.all(32),
                      child: Text("No history yet")))
            else
              Flexible(
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: history.length,
                  itemBuilder: (_, i) {
                    final entry = history[i];
                    String dateStr = "";
                    try {
                      dateStr = DateFormat('dd MMM, hh:mm a')
                          .format(DateTime.parse(entry["createdAt"]));
                    } catch (_) {}

                    return Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: CupertinoColors.systemGrey6,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              if (entry["status"] != null)
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 8, vertical: 2),
                                  decoration: BoxDecoration(
                                    color:
                                        AppTheme.primaryIndigo.withOpacity(0.1),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Text(
                                    entry["status"]
                                        .toString()
                                        .replaceAll('_', ' '),
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: AppTheme.primaryIndigo,
                                      fontWeight: FontWeight.w600,
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
                          if (entry["note"]?.toString().isNotEmpty == true) ...[
                            const SizedBox(height: 6),
                            Text(entry["note"],
                                style: const TextStyle(fontSize: 13)),
                          ],
                        ],
                      ),
                    );
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'ASSIGNED':
        return CupertinoColors.activeBlue;
      case 'IN_PROGRESS':
        return CupertinoColors.activeOrange;
      case 'COMPLETED':
        return CupertinoColors.activeGreen;
      case 'ON_HOLD':
        return CupertinoColors.systemGrey;
      default:
        return CupertinoColors.systemGrey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      backgroundColor: AppTheme.background,
      child: Column(
        children: [
          OmsPageHeader(
            title: "My Tasks",
            showBack: false,
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                CupertinoButton(
                  padding: EdgeInsets.zero,
                  onPressed: _visibleTasks.isEmpty ? null : _exportCsv,
                  child: const Icon(CupertinoIcons.arrow_down_doc,
                      color: CupertinoColors.white, size: 22),
                ),
                CupertinoButton(
                  padding: EdgeInsets.zero,
                  onPressed: _fetchTasks,
                  child: const Icon(CupertinoIcons.refresh,
                      color: CupertinoColors.white),
                ),
              ],
            ),
          ),
          // Filter chips
          Container(
            height: 56,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                'All',
                'ASSIGNED',
                'IN_PROGRESS',
                'COMPLETED',
                'ON_HOLD'
              ].map((s) {
                final selected = _statusFilter == s;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: GestureDetector(
                    onTap: () {
                      setState(() => _statusFilter = s);
                      _fetchTasks();
                    },
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
                        s == 'All' ? 'All' : s.replaceAll('_', ' '),
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
          Expanded(
            child: _loading
                ? const Center(child: CupertinoActivityIndicator())
                : _visibleTasks.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(CupertinoIcons.checkmark_seal,
                                size: 64, color: CupertinoColors.systemGrey4),
                            const SizedBox(height: 16),
                            Text("No tasks assigned",
                                style: TextStyle(
                                    color: CupertinoColors.systemGrey)),
                          ],
                        ),
                      )
                    : CustomScrollView(
                        slivers: [
                          CupertinoSliverRefreshControl(onRefresh: _fetchTasks),
                          SliverPadding(
                            padding: const EdgeInsets.all(16),
                            sliver: SliverList(
                              delegate: SliverChildBuilderDelegate(
                                (_, i) => _buildTaskCard(_visibleTasks[i]),
                                childCount: _visibleTasks.length,
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

  Widget _buildTaskCard(Map<String, dynamic> task) {
    final status = task["status"] ?? "ASSIGNED";
    final dueDate = task["dueDate"];
    String dueDateStr = "";
    if (dueDate != null) {
      try {
        dueDateStr = DateFormat('dd MMM yyyy').format(DateTime.parse(dueDate));
      } catch (_) {}
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(task["title"] ?? "-",
                    style: const TextStyle(
                        fontSize: 15, fontWeight: FontWeight.bold)),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: _statusColor(status).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  status.replaceAll('_', ' '),
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: _statusColor(status),
                  ),
                ),
              ),
            ],
          ),
          if (task["description"]?.toString().isNotEmpty == true) ...[
            const SizedBox(height: 6),
            Text(task["description"],
                style:
                    TextStyle(fontSize: 13, color: CupertinoColors.systemGrey)),
          ],
          const SizedBox(height: 8),
          Row(
            children: [
              if (dueDateStr.isNotEmpty) ...[
                Icon(CupertinoIcons.calendar,
                    size: 12, color: CupertinoColors.systemGrey),
                const SizedBox(width: 4),
                Text(dueDateStr,
                    style: TextStyle(
                        fontSize: 12, color: CupertinoColors.systemGrey)),
              ],
              const Spacer(),
              CupertinoButton(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                minSize: 0,
                onPressed: () => _showHistoryDialog(task["id"].toString()),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(CupertinoIcons.clock,
                        size: 16, color: AppTheme.primaryIndigo),
                    const SizedBox(width: 4),
                    Text("History",
                        style: TextStyle(
                            fontSize: 12, color: AppTheme.primaryIndigo)),
                  ],
                ),
              ),
              const SizedBox(width: 4),
              if (status != 'COMPLETED')
                CupertinoButton.filled(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  minSize: 0,
                  onPressed: () => _showUpdateProgressDialog(task),
                  child: const Text("Update", style: TextStyle(fontSize: 12)),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
