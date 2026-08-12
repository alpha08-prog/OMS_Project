import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/task_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/access_control.dart';
import '../../utils/csv_export.dart';
import '../../widgets/date_range_filter.dart';
import '../../widgets/task_forward_sheet.dart';

/// Office-wide master task list — mirrors the web "All Tasks" screen.
/// Filter by status / type / staff + free-text search, inline status change
/// and forward for admins, CSV export. Works for both STAFF and ADMIN
/// (the backend scopes OFFICE tasks out for staff automatically).
class AllTasksPage extends StatefulWidget {
  final String role;

  /// Optional page title (e.g. "Office Tasks"). Defaults to "All Tasks".
  final String title;

  /// Optional initial task-type filter (e.g. "GENERAL" for the Office Tasks
  /// view). Defaults to "All".
  final String initialType;

  const AllTasksPage({
    super.key,
    required this.role,
    this.title = 'All Tasks',
    this.initialType = 'All',
  });

  @override
  State<AllTasksPage> createState() => _AllTasksPageState();
}

class _AllTasksPageState extends State<AllTasksPage> {
  bool _loading = true;
  List<Map<String, dynamic>> _tasks = [];
  List<Map<String, dynamic>> _staff = [];

  String _status = 'All';
  late String _type;
  String? _assignedToId; // null = everyone
  String _search = '';
  final _searchCtrl = TextEditingController();
  DateTime? _dateFrom;
  DateTime? _dateTo;

  List<Map<String, dynamic>> get _visibleTasks {
    if (_dateFrom == null && _dateTo == null) return _tasks;
    return _tasks.where((t) {
      final dt = DateTime.tryParse(t['createdAt']?.toString() ?? '');
      return dateInRange(dt, from: _dateFrom, to: _dateTo);
    }).toList();
  }

  int _page = 1;
  int _totalPages = 1;

  static const _statuses = [
    'All',
    'UNASSIGNED',
    'ASSIGNED',
    'IN_PROGRESS',
    'COMPLETED',
    'ON_HOLD',
  ];
  static const _types = [
    'All',
    'GRIEVANCE',
    'TRAIN_REQUEST',
    'TOUR_PROGRAM',
    'GENERAL',
  ];

  bool get _isAdmin => widget.role != Roles.staff;

  @override
  void initState() {
    super.initState();
    _type = widget.initialType;
    _fetch();
    // Load the staff list for everyone — staff now get the same per-card
    // actions (View / Edit / Status / Forward) as admin, and Edit's assignee
    // picker + the forward sheet need this list.
    _loadStaff();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadStaff() async {
    final staff = await TaskService.getStaff();
    if (mounted) setState(() => _staff = staff);
  }

  Future<void> _fetch() async {
    setState(() => _loading = true);
    final res = await TaskService.getAllTasks(
      page: _page,
      limit: 20,
      status: _status,
      taskType: _type,
      assignedToId: _assignedToId,
      search: _search,
    );
    if (!mounted) return;
    setState(() {
      _tasks = res.rows;
      _totalPages = res.totalPages;
      _loading = false;
    });
  }

  void _resetAndFetch() {
    _page = 1;
    _fetch();
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
      case 'UNASSIGNED':
        return AppTheme.destructiveRed;
      default:
        return Colors.grey;
    }
  }

  Future<void> _changeStatus(Map<String, dynamic> task) async {
    String selected = task['status']?.toString() ?? 'ASSIGNED';
    final newStatus = await showModalBottomSheet<String>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Change Status',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 16),
              ...['ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD'].map(
                (s) => RadioListTile<String>(
                  value: s,
                  groupValue: selected,
                  title: Text(s.replaceAll('_', ' ')),
                  activeColor: AppTheme.primaryIndigo,
                  onChanged: (v) => setSheet(() => selected = v!),
                ),
              ),
              const SizedBox(height: 8),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  style: AppTheme.primaryButton(),
                  onPressed: () => Navigator.pop(ctx, selected),
                  child: const Text('Save',
                      style: TextStyle(fontWeight: FontWeight.bold)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (newStatus == null || newStatus == task['status']) return;
    final res = await TaskService.updateStatus(task['id'].toString(), newStatus);
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(res.message)));
    if (res.ok) _fetch();
  }

  Future<void> _forward(Map<String, dynamic> task) async {
    final ok = await showForwardTaskSheet(
      context,
      taskId: task['id'].toString(),
      taskTitle: task['title']?.toString() ?? 'Task',
    );
    if (ok) _fetch();
  }

  // ===================== VIEW (read-only detail) =====================
  void _viewTask(Map<String, dynamic> task) {
    final status = task['status']?.toString() ?? 'ASSIGNED';
    final type = (task['taskType'] ?? '').toString().replaceAll('_', ' ');
    final assignee = task['assignedTo'] is Map
        ? task['assignedTo']['name']?.toString()
        : null;
    final createdBy = task['createdBy'] is Map
        ? task['createdBy']['name']?.toString()
        : null;
    final refNo = task['referenceNo']?.toString();
    final desc = task['description']?.toString();
    final progress = task['progressNotes']?.toString();
    final due = _fmtDate(task['dueDate']);
    final created = _fmtDate(task['createdAt']);
    final isForwarded = task['isForwarded'] == true;

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                task['title']?.toString() ?? 'Task',
                style: const TextStyle(
                    fontSize: 17, fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(width: 8),
            _badge(status.replaceAll('_', ' '), _statusColor(status)),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (type.isNotEmpty) _detailRow('Type', type),
              if (refNo != null && refNo.isNotEmpty)
                _detailRow('Reference', refNo),
              if (assignee != null && assignee.isNotEmpty)
                _detailRow('Assigned to', assignee),
              if (due.isNotEmpty) _detailRow('Due', due),
              if (created.isNotEmpty) _detailRow('Created', created),
              if (createdBy != null && createdBy.isNotEmpty)
                _detailRow('Created by', createdBy),
              if (isForwarded) _detailRow('Forwarded', 'Yes'),
              if (desc != null && desc.trim().isNotEmpty)
                _detailBlock('Description', desc),
              if (progress != null && progress.trim().isNotEmpty)
                _detailBlock('Progress notes', progress),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Close'),
          ),
          if (_isAdmin)
            ElevatedButton(
              style: AppTheme.primaryButton(),
              onPressed: () {
                Navigator.pop(ctx);
                _editTask(task);
              },
              child: const Text('Edit'),
            ),
        ],
      ),
    );
  }

  Widget _detailRow(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 96,
              child: Text(label,
                  style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey.shade600,
                      fontWeight: FontWeight.w600)),
            ),
            Expanded(
                child: Text(value, style: const TextStyle(fontSize: 13))),
          ],
        ),
      );

  Widget _detailBlock(String label, String value) => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade600,
                    fontWeight: FontWeight.w600)),
            const SizedBox(height: 2),
            Text(value, style: const TextStyle(fontSize: 13)),
          ],
        ),
      );

  InputDecoration _inputDeco(String label) => InputDecoration(
        labelText: label,
        isDense: true,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppTheme.radiusMd)),
      );

  // ===================== EDIT (admin) =====================
  Future<void> _editTask(Map<String, dynamic> task) async {
    final titleCtrl =
        TextEditingController(text: task['title']?.toString() ?? '');
    final descCtrl =
        TextEditingController(text: task['description']?.toString() ?? '');
    final statusOptions =
        _statuses.where((s) => s != 'All' && s != 'UNASSIGNED').toList();
    String status = task['status']?.toString() ?? 'ASSIGNED';
    if (!statusOptions.contains(status)) status = statusOptions.first;
    String? assigneeId = task['assignedTo'] is Map
        ? task['assignedTo']['id']?.toString()
        : null;
    DateTime? due = DateTime.tryParse(task['dueDate']?.toString() ?? '');
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
                const Text('Edit Task',
                    style: TextStyle(
                        fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 16),
                TextField(
                    controller: titleCtrl, decoration: _inputDeco('Title')),
                const SizedBox(height: 12),
                TextField(
                  controller: descCtrl,
                  minLines: 2,
                  maxLines: 4,
                  decoration: _inputDeco('Description'),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: status,
                  decoration: _inputDeco('Status'),
                  items: statusOptions
                      .map((s) => DropdownMenuItem(
                          value: s, child: Text(s.replaceAll('_', ' '))))
                      .toList(),
                  onChanged: (v) => setSheet(() => status = v ?? status),
                ),
                if (_staff.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String?>(
                    value: _staff.any((s) => s['id']?.toString() == assigneeId)
                        ? assigneeId
                        : null,
                    isExpanded: true,
                    decoration: _inputDeco('Assigned to'),
                    items: [
                      const DropdownMenuItem(
                          value: null, child: Text('Unassigned')),
                      ..._staff.map((s) => DropdownMenuItem(
                            value: s['id']?.toString(),
                            child: Text(s['name']?.toString() ?? '-',
                                overflow: TextOverflow.ellipsis),
                          )),
                    ],
                    onChanged: (v) => setSheet(() => assigneeId = v),
                  ),
                ],
                const SizedBox(height: 12),
                InkWell(
                  onTap: () async {
                    final picked = await showDatePicker(
                      context: ctx,
                      initialDate: due ?? DateTime.now(),
                      firstDate: DateTime(2020),
                      lastDate:
                          DateTime.now().add(const Duration(days: 365 * 3)),
                    );
                    if (picked != null) setSheet(() => due = picked);
                  },
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                  child: InputDecorator(
                    decoration: _inputDeco('Due date'),
                    child: Text(
                      due == null
                          ? 'Not set'
                          : DateFormat('dd MMM yyyy').format(due!),
                      style: const TextStyle(fontSize: 14),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton(
                    style: AppTheme.primaryButton(),
                    onPressed: saving
                        ? null
                        : () async {
                            final title = titleCtrl.text.trim();
                            final messenger = ScaffoldMessenger.of(context);
                            if (title.isEmpty) {
                              messenger.showSnackBar(const SnackBar(
                                  content: Text('Title cannot be empty')));
                              return;
                            }
                            setSheet(() => saving = true);
                            final nav = Navigator.of(ctx);
                            final res = await TaskService.updateTask(
                              task['id'].toString(),
                              {
                                'title': title,
                                'description': descCtrl.text.trim(),
                                'status': status,
                                'assignedToId': assigneeId,
                                'dueDate': due?.toIso8601String(),
                              },
                            );
                            if (res.ok) {
                              nav.pop(true);
                            } else {
                              setSheet(() => saving = false);
                              messenger.showSnackBar(
                                  SnackBar(content: Text(res.message)));
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
    titleCtrl.dispose();
    descCtrl.dispose();
    if (saved == true && mounted) {
      _fetch();
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Task updated')));
    }
  }

  void _exportCsv() {
    CsvExport.export(
      context,
      fileName: 'all_tasks',
      headers: ['Task', 'Type', 'Status', 'Assigned To', 'Due', 'Created'],
      rows: _visibleTasks.map((t) {
        return [
          t['title'] ?? '',
          (t['taskType'] ?? '').toString().replaceAll('_', ' '),
          (t['status'] ?? '').toString().replaceAll('_', ' '),
          (t['assignedTo'] is Map ? t['assignedTo']['name'] : '') ?? '',
          _fmtDate(t['dueDate']),
          _fmtDate(t['createdAt']),
        ];
      }).toList(),
    );
  }

  static String _fmtDate(dynamic v) {
    if (v == null) return '';
    try {
      return DateFormat('dd MMM yyyy').format(DateTime.parse(v.toString()));
    } catch (_) {
      return v.toString();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: Text(widget.title),
        backgroundColor: AppTheme.primaryIndigo,
        actions: [
          IconButton(
            tooltip: 'Export CSV',
            icon: const Icon(Icons.download, color: Colors.white),
            onPressed: _visibleTasks.isEmpty ? null : _exportCsv,
          ),
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white),
            onPressed: _fetch,
          ),
        ],
      ),
      body: Column(
        children: [
          _buildFilters(),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _visibleTasks.isEmpty
                    ? _emptyState()
                    : RefreshIndicator(
                        onRefresh: _fetch,
                        child: ListView.builder(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                          itemCount: _visibleTasks.length,
                          itemBuilder: (_, i) => _taskCard(_visibleTasks[i]),
                        ),
                      ),
          ),
          if (!_loading && _totalPages > 1) _pager(),
        ],
      ),
    );
  }

  Widget _emptyState() => ListView(
        children: [
          const SizedBox(height: 120),
          Icon(Icons.assignment_outlined, size: 64, color: Colors.grey.shade300),
          const SizedBox(height: 16),
          Center(
            child: Text('No tasks found',
                style: TextStyle(color: Colors.grey.shade500)),
          ),
        ],
      );

  Widget _buildFilters() {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Column(
        children: [
          TextField(
            controller: _searchCtrl,
            decoration: InputDecoration(
              hintText: 'Search tasks…',
              prefixIcon: const Icon(Icons.search, size: 20),
              isDense: true,
              border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(AppTheme.radiusMd)),
              suffixIcon: _search.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear, size: 18),
                      onPressed: () {
                        _searchCtrl.clear();
                        setState(() => _search = '');
                        _resetAndFetch();
                      },
                    )
                  : null,
            ),
            onSubmitted: (v) {
              setState(() => _search = v);
              _resetAndFetch();
            },
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _dropdown(
                  label: 'Status',
                  value: _status,
                  items: _statuses,
                  display: (s) => s == 'All' ? 'All Status' : s.replaceAll('_', ' '),
                  onChanged: (v) {
                    setState(() => _status = v!);
                    _resetAndFetch();
                  },
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _dropdown(
                  label: 'Type',
                  value: _type,
                  items: _types,
                  display: (s) => s == 'All' ? 'All Types' : s.replaceAll('_', ' '),
                  onChanged: (v) {
                    setState(() => _type = v!);
                    _resetAndFetch();
                  },
                ),
              ),
            ],
          ),
          if (_isAdmin && _staff.isNotEmpty) ...[
            const SizedBox(height: 8),
            _staffDropdown(),
          ],
          const SizedBox(height: 8),
          DateRangeFilter(
            from: _dateFrom,
            to: _dateTo,
            tint: AppTheme.primaryIndigo,
            padding: EdgeInsets.zero,
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
  }

  Widget _dropdown({
    required String label,
    required String value,
    required List<String> items,
    required String Function(String) display,
    required ValueChanged<String?> onChanged,
  }) {
    return DropdownButtonFormField<String>(
      value: value,
      isExpanded: true,
      decoration: InputDecoration(
        labelText: label,
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppTheme.radiusMd)),
      ),
      items: items
          .map((s) => DropdownMenuItem(
              value: s,
              child: Text(display(s),
                  style: const TextStyle(fontSize: 13),
                  overflow: TextOverflow.ellipsis)))
          .toList(),
      onChanged: onChanged,
    );
  }

  Widget _staffDropdown() {
    return DropdownButtonFormField<String?>(
      value: _assignedToId,
      isExpanded: true,
      decoration: InputDecoration(
        labelText: 'Assigned to',
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(AppTheme.radiusMd)),
      ),
      items: [
        const DropdownMenuItem(value: null, child: Text('Everyone', style: TextStyle(fontSize: 13))),
        ..._staff.map((s) => DropdownMenuItem(
              value: s['id']?.toString(),
              child: Text(s['name']?.toString() ?? '-',
                  style: const TextStyle(fontSize: 13),
                  overflow: TextOverflow.ellipsis),
            )),
      ],
      onChanged: (v) {
        setState(() => _assignedToId = v);
        _resetAndFetch();
      },
    );
  }

  Widget _taskCard(Map<String, dynamic> task) {
    final status = task['status']?.toString() ?? 'ASSIGNED';
    final type = task['taskType']?.toString() ?? '';
    final assignee = task['assignedTo'] is Map ? task['assignedTo']['name'] : null;
    final refNo = task['referenceNo']?.toString();
    final due = _fmtDate(task['dueDate']);
    final isForwarded = task['isForwarded'] == true;

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
              Expanded(
                child: Text(task['title']?.toString() ?? '-',
                    style: const TextStyle(
                        fontSize: 15, fontWeight: FontWeight.bold)),
              ),
              _badge(status.replaceAll('_', ' '), _statusColor(status)),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 4,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (type.isNotEmpty)
                _chip(Icons.category_outlined, type.replaceAll('_', ' ')),
              if (refNo != null && refNo.isNotEmpty)
                _chip(Icons.tag, refNo),
              if (assignee != null)
                _chip(Icons.person_outline, assignee.toString()),
              if (due.isNotEmpty) _chip(Icons.event_outlined, 'Due $due'),
              if (isForwarded)
                _chip(Icons.forward, 'Forwarded', color: AppTheme.saffronDark),
            ],
          ),
          const Divider(height: 20),
          Align(
            alignment: Alignment.centerRight,
            child: Wrap(
              alignment: WrapAlignment.end,
              spacing: 2,
              children: [
                TextButton.icon(
                  onPressed: () => _viewTask(task),
                  icon: const Icon(Icons.visibility_outlined, size: 16),
                  label: const Text('View', style: TextStyle(fontSize: 12)),
                ),
                TextButton.icon(
                  onPressed: () => _editTask(task),
                  icon: const Icon(Icons.edit_outlined, size: 16),
                  label: const Text('Edit', style: TextStyle(fontSize: 12)),
                  style: TextButton.styleFrom(
                      foregroundColor: AppTheme.primaryIndigo),
                ),
                TextButton.icon(
                  onPressed: () => _changeStatus(task),
                  icon: const Icon(Icons.sync_alt, size: 16),
                  label: const Text('Status', style: TextStyle(fontSize: 12)),
                ),
                TextButton.icon(
                  onPressed: () => _forward(task),
                  icon: const Icon(Icons.forward, size: 16),
                  label:
                      const Text('Forward', style: TextStyle(fontSize: 12)),
                  style: TextButton.styleFrom(
                      foregroundColor: AppTheme.saffronDark),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _badge(String text, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: color.withOpacity(0.12),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(text,
            style: TextStyle(
                fontSize: 11, fontWeight: FontWeight.bold, color: color)),
      );

  Widget _chip(IconData icon, String text, {Color? color}) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: color ?? Colors.grey.shade500),
          const SizedBox(width: 3),
          Text(text,
              style: TextStyle(
                  fontSize: 12, color: color ?? Colors.grey.shade600)),
        ],
      );

  Widget _pager() {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          IconButton(
            icon: const Icon(Icons.chevron_left),
            onPressed: _page > 1
                ? () {
                    setState(() => _page--);
                    _fetch();
                  }
                : null,
          ),
          Text('Page $_page of $_totalPages',
              style: const TextStyle(fontWeight: FontWeight.w600)),
          IconButton(
            icon: const Icon(Icons.chevron_right),
            onPressed: _page < _totalPages
                ? () {
                    setState(() => _page++);
                    _fetch();
                  }
                : null,
          ),
        ],
      ),
    );
  }
}
