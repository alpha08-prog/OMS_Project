import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/http_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/date_range_filter.dart';

class StaffTasksPage extends StatefulWidget {
  const StaffTasksPage({super.key});

  @override
  State<StaffTasksPage> createState() => _StaffTasksPageState();
}

class _StaffTasksPageState extends State<StaffTasksPage> {
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
          _tasks = list.map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e)).toList();
        });
      }
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _showUpdateProgressDialog(Map<String, dynamic> task) async {
    final noteCtrl = TextEditingController();
    String newStatus = task["status"] ?? "IN_PROGRESS";

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Padding(
          padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(ctx).viewInsets.bottom + 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40, height: 4,
                  decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2)),
                ),
              ),
              const SizedBox(height: 16),
              Text("Update Progress: ${task['title']}", style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                value: newStatus,
                decoration: const InputDecoration(labelText: "Status", border: OutlineInputBorder()),
                items: ['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD']
                    .map((s) => DropdownMenuItem(value: s, child: Text(s.replaceAll('_', ' '))))
                    .toList(),
                onChanged: (v) => setSheetState(() => newStatus = v!),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: noteCtrl,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: "Progress Note",
                  border: OutlineInputBorder(),
                  hintText: "What did you work on?",
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  style: AppTheme.primaryButton(),
                  onPressed: () async {
                    final body = <String, dynamic>{"status": newStatus};
                    if (noteCtrl.text.trim().isNotEmpty) {
                      body["note"] = noteCtrl.text.trim();
                    }

                    final res = await HttpService.patch("/api/tasks/${task['id']}/progress", body);
                    if (res.statusCode == 200) {
                      Navigator.pop(ctx);
                      _fetchTasks();
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text("Progress updated")),
                      );
                    } else {
                      String msg = "Failed";
                      try { msg = jsonDecode(res.body)["message"] ?? msg; } catch (_) {}
                      ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(content: Text(msg)));
                    }
                  },
                  child: const Text("Update Progress", style: TextStyle(fontWeight: FontWeight.bold)),
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
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Container(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.6),
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40, height: 4,
                decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 16),
            const Text("Progress History", style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            if (history.isEmpty)
              const Center(child: Padding(padding: EdgeInsets.all(32), child: Text("No history yet")))
            else
              Flexible(
                child: ListView.builder(
                  shrinkWrap: true,
                  itemCount: history.length,
                  itemBuilder: (_, i) {
                    final entry = history[i];
                    String dateStr = "";
                    try {
                      dateStr = DateFormat('dd MMM, hh:mm a').format(DateTime.parse(entry["createdAt"]));
                    } catch (_) {}

                    return Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.grey.shade50,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              if (entry["status"] != null)
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: AppTheme.primaryIndigo.withOpacity(0.1),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Text(entry["status"].toString().replaceAll('_', ' '),
                                      style: TextStyle(fontSize: 11, color: AppTheme.primaryIndigo, fontWeight: FontWeight.w600)),
                                ),
                              const Spacer(),
                              Text(dateStr, style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
                            ],
                          ),
                          if (entry["note"]?.toString().isNotEmpty == true) ...[
                            const SizedBox(height: 6),
                            Text(entry["note"], style: const TextStyle(fontSize: 13)),
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
      case 'ASSIGNED': return Colors.blue;
      case 'IN_PROGRESS': return Colors.orange;
      case 'COMPLETED': return Colors.green;
      case 'ON_HOLD': return Colors.grey;
      default: return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text("My Tasks"),
        backgroundColor: AppTheme.primaryIndigo,
        actions: [
          IconButton(icon: const Icon(Icons.refresh, color: Colors.white), onPressed: _fetchTasks),
        ],
      ),
      body: Column(
        children: [
          // Filter chips
          Container(
            height: 56,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: ['All', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD'].map((s) {
                final selected = _statusFilter == s;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: Text(s == 'All' ? 'All' : s.replaceAll('_', ' ')),
                    selected: selected,
                    onSelected: (_) {
                      setState(() => _statusFilter = s);
                      _fetchTasks();
                    },
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
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _visibleTasks.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.task_alt, size: 64, color: Colors.grey.shade300),
                            const SizedBox(height: 16),
                            Text("No tasks assigned", style: TextStyle(color: Colors.grey.shade500)),
                          ],
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: _fetchTasks,
                        child: ListView.builder(
                          padding: const EdgeInsets.all(16),
                          itemCount: _visibleTasks.length,
                          itemBuilder: (_, i) => _buildTaskCard(_visibleTasks[i]),
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildTaskCard(Map<String, dynamic> task) {
    final status = task["status"] ?? "ASSIGNED";
    final progress = task["progressPercent"] ?? 0;
    final dueDate = task["dueDate"];
    String dueDateStr = "";
    if (dueDate != null) {
      try { dueDateStr = DateFormat('dd MMM yyyy').format(DateTime.parse(dueDate)); } catch (_) {}
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
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
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: _statusColor(status).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(status.replaceAll('_', ' '),
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: _statusColor(status))),
              ),
            ],
          ),
          if (task["description"]?.toString().isNotEmpty == true) ...[
            const SizedBox(height: 6),
            Text(task["description"], style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
          ],
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: (progress as num).toDouble() / 100,
              backgroundColor: Colors.grey.shade200,
              valueColor: AlwaysStoppedAnimation(_statusColor(status)),
              minHeight: 6,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Text("${progress}%", style: TextStyle(fontSize: 12, color: Colors.grey.shade600, fontWeight: FontWeight.w600)),
              if (dueDateStr.isNotEmpty) ...[
                const SizedBox(width: 16),
                Icon(Icons.calendar_today, size: 12, color: Colors.grey.shade500),
                const SizedBox(width: 4),
                Text(dueDateStr, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
              ],
              const Spacer(),
              TextButton.icon(
                onPressed: () => _showHistoryDialog(task["id"]),
                icon: const Icon(Icons.history, size: 16),
                label: const Text("History", style: TextStyle(fontSize: 12)),
                style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 8)),
              ),
              const SizedBox(width: 4),
              if (status != 'COMPLETED')
                ElevatedButton(
                  onPressed: () => _showUpdateProgressDialog(task),
                  style: AppTheme.primaryButton().copyWith(
                    padding: WidgetStateProperty.all(const EdgeInsets.symmetric(horizontal: 12, vertical: 8)),
                  ),
                  child: const Text("Update", style: TextStyle(fontSize: 12)),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
