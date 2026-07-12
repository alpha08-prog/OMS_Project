import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/http_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/csv_export.dart';
import '../../widgets/date_range_filter.dart';

/// Admin-only "Tour Invitations" page — list of pending tour programs with
/// View / Verify-and-Assign / Regret actions per card. Verify+Assign creates
/// a TaskAssignment of type TOUR_PROGRAM and sets decision=ACCEPTED.
class TourQueuePage extends StatefulWidget {
  const TourQueuePage({super.key});

  @override
  State<TourQueuePage> createState() => _TourQueuePageState();
}

class _TourQueuePageState extends State<TourQueuePage> {
  bool _loading = true;
  String? _error;

  List<Map<String, dynamic>> _pending = [];
  List<Map<String, dynamic>> _staffList = [];
  final Set<String> _busyIds = {};

  // Date-range filter (applied client-side on the event date).
  DateTime? _dateFrom;
  DateTime? _dateTo;

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
    await Future.wait([_fetchPending(), _fetchStaff()]);
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _fetchPending() async {
    try {
      final res = await HttpService.get("/api/tour-programs/pending");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list = decoded is List ? decoded : (decoded["data"] ?? []);
        _pending = list
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

  Future<void> _regret(Map<String, dynamic> p) async {
    final id = p["id"]?.toString() ?? "";
    if (id.isEmpty || _busyIds.contains(id)) return;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("Regret Tour Program"),
        content:
            Text("Send regret for ${p["eventName"] ?? "this event"}?"),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text("Cancel")),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.destructiveRed),
            child: const Text("Regret"),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    setState(() => _busyIds.add(id));
    try {
      final res = await HttpService.patch(
        "/api/tour-programs/$id/decision",
        {"decision": "REGRET", "decisionNote": ""},
      );
      if (!mounted) return;
      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Tour invitation marked regret"),
            backgroundColor: AppTheme.destructiveRed,
          ),
        );
        _fetchPending();
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
    } finally {
      if (mounted) setState(() => _busyIds.remove(id));
    }
  }

  Future<void> _openVerifyAssign(Map<String, dynamic> p) async {
    if (_staffList.isEmpty) {
      await _fetchStaff();
      if (_staffList.isEmpty) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("No staff available to assign")),
        );
        return;
      }
    }
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _VerifyAssignTourSheet(
        invitation: p,
        staffList: _staffList,
      ),
    );
    if (result == true) _fetchPending();
  }

  void _viewDetails(Map<String, dynamic> p) {
    showDialog(
      context: context,
      builder: (_) => _TourInvitationDetailsDialog(invitation: p),
    );
  }

  String _formatEventDateTime(String? iso) {
    if (iso == null || iso.isEmpty) return "—";
    try {
      return DateFormat('d MMM yyyy, h:mm a').format(DateTime.parse(iso));
    } catch (_) {
      return iso;
    }
  }

  // The card's primary date is the event `dateTime`, so filter on that.
  List<Map<String, dynamic>> get _visiblePending {
    if (_dateFrom == null && _dateTo == null) return _pending;
    return _pending.where((p) {
      final dt = DateTime.tryParse(p['dateTime']?.toString() ?? '');
      return dateInRange(dt, from: _dateFrom, to: _dateTo);
    }).toList();
  }

  void _exportCsv() {
    CsvExport.export(
      context,
      fileName: 'tour_queue',
      headers: const [
        'Event',
        'Organizer',
        'Venue',
        'Date',
        'Status',
        'Created'
      ],
      rows: _visiblePending.map((p) {
        String eventDate = '';
        try {
          eventDate = DateFormat('dd MMM yyyy')
              .format(DateTime.parse(p['dateTime'].toString()));
        } catch (_) {}
        String created = '';
        try {
          created = DateFormat('dd MMM yyyy')
              .format(DateTime.parse(p['createdAt'].toString()));
        } catch (_) {}
        return [
          p['eventName'] ?? '',
          p['organizer'] ?? '',
          p['venue'] ?? '',
          eventDate,
          'PENDING',
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
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const [
            Text("Tour Invitations",
                style: TextStyle(
                    color: Colors.white, fontWeight: FontWeight.bold)),
            Text("Review and decide on event invitations",
                style: TextStyle(color: Colors.white70, fontSize: 11)),
          ],
        ),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          IconButton(
            tooltip: "Export CSV",
            icon: const Icon(Icons.download, color: Colors.white),
            onPressed: _visiblePending.isEmpty ? null : _exportCsv,
          ),
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white),
            onPressed: _loadAll,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _fetchPending,
        child: _loading
            ? ListView(children: const [
                SizedBox(height: 60),
                Center(child: CircularProgressIndicator()),
              ])
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Text(
                    "Pending Invitations (${_visiblePending.length})",
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.foreground,
                    ),
                  ),
                  const SizedBox(height: 12),
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
                  const SizedBox(height: 12),
                  if (_error != null)
                    _buildError()
                  else if (_visiblePending.isEmpty)
                    _buildEmpty()
                  else
                    ..._visiblePending.map(_buildCard),
                  const SizedBox(height: 24),
                ],
              ),
      ),
    );
  }

  Widget _buildCard(Map<String, dynamic> p) {
    final id = p["id"]?.toString() ?? "";
    final isBusy = _busyIds.contains(id);
    final eventName = p["eventName"] ?? "—";
    final organizer = p["organizer"] ?? "—";
    final venue = p["venue"] ?? "—";
    final date = _formatEventDateTime(p["dateTime"]?.toString());

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.border),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: const Color(0xFFF5F3FF),
                  borderRadius: BorderRadius.circular(10),
                ),
                child:
                    const Icon(Icons.event, color: Color(0xFF7C3AED)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            eventName,
                            style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.bold,
                                color: AppTheme.foreground),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 6),
                        _statusPill("PENDING"),
                      ],
                    ),
                    const SizedBox(height: 4),
                    _metaLine(Icons.business_center, organizer),
                    const SizedBox(height: 2),
                    _metaLine(Icons.access_time, date),
                    const SizedBox(height: 2),
                    _metaLine(Icons.location_on, venue),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              _actionBtn(
                label: "View",
                icon: Icons.visibility_outlined,
                bg: Colors.white,
                fg: Colors.grey.shade800,
                border: Colors.grey.shade300,
                onPressed: () => _viewDetails(p),
              ),
              _actionBtn(
                label: "Accept and Assign to Staff",
                icon: Icons.check_circle_outline,
                bg: AppTheme.saffron,
                fg: Colors.white,
                onPressed: () => _openVerifyAssign(p),
              ),
              _actionBtn(
                label: "Regret",
                icon: Icons.cancel_outlined,
                bg: AppTheme.destructiveRed,
                fg: Colors.white,
                loading: isBusy,
                onPressed: () => _regret(p),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _metaLine(IconData icon, String text) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Icon(icon, size: 12, color: Colors.grey.shade600),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            text,
            style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }

  Widget _actionBtn({
    required String label,
    required IconData icon,
    required Color bg,
    required Color fg,
    Color? border,
    bool loading = false,
    required VoidCallback onPressed,
  }) {
    final isOutlined = border != null;
    return ElevatedButton.icon(
      onPressed: loading ? null : onPressed,
      icon: loading
          ? SizedBox(
              width: 12,
              height: 12,
              child: CircularProgressIndicator(
                  strokeWidth: 2, valueColor: AlwaysStoppedAnimation(fg)),
            )
          : Icon(icon, size: 14, color: fg),
      label: Text(label),
      style: ElevatedButton.styleFrom(
        backgroundColor: bg,
        foregroundColor: fg,
        elevation: 0,
        side: isOutlined ? BorderSide(color: border) : null,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8)),
        textStyle:
            const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
      ),
    );
  }

  Widget _statusPill(String status) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFBEB),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(status,
          style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: Color(0xFFB45309))),
    );
  }

  Widget _buildError() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 60),
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
              onPressed: _fetchPending,
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
      padding: const EdgeInsets.symmetric(vertical: 60),
      child: Center(
        child: Column(
          children: [
            Icon(Icons.celebration,
                size: 56,
                color: AppTheme.successGreen.withOpacity(0.7)),
            const SizedBox(height: 12),
            const Text("All caught up!",
                style: TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            Text("No pending invitations right now.",
                style: TextStyle(
                    color: Colors.grey.shade600, fontSize: 13)),
          ],
        ),
      ),
    );
  }
}

// =====================================================
// VERIFY & ASSIGN TOUR BOTTOM SHEET
// =====================================================
class _VerifyAssignTourSheet extends StatefulWidget {
  final Map<String, dynamic> invitation;
  final List<Map<String, dynamic>> staffList;
  const _VerifyAssignTourSheet({
    required this.invitation,
    required this.staffList,
  });

  @override
  State<_VerifyAssignTourSheet> createState() =>
      _VerifyAssignTourSheetState();
}

class _VerifyAssignTourSheetState extends State<_VerifyAssignTourSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController titleController;
  late final TextEditingController descriptionController;
  String? _selectedStaffId;
  String _selectedPriority = "NORMAL";
  DateTime? _dueDate;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    final p = widget.invitation;
    final eventName = p["eventName"] ?? "Event";
    final organizer = p["organizer"] ?? "—";
    final venue = p["venue"] ?? "—";
    final dt = p["dateTime"]?.toString() ?? "";

    titleController =
        TextEditingController(text: "Prepare for $eventName");
    descriptionController = TextEditingController(
      text: "Event: $eventName\n"
          "Organizer: $organizer\n"
          "Venue: $venue\n"
          "Date/Time: $dt",
    );
  }

  @override
  void dispose() {
    titleController.dispose();
    descriptionController.dispose();
    super.dispose();
  }

  Future<void> _pickDueDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _dueDate ?? DateTime.now().add(const Duration(days: 5)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null) setState(() => _dueDate = picked);
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedStaffId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Please select a staff member")),
      );
      return;
    }

    setState(() => _submitting = true);
    final id = widget.invitation["id"]?.toString() ?? "";

    try {
      final decisionRes = await HttpService.patch(
        "/api/tour-programs/$id/decision",
        {"decision": "ACCEPTED", "decisionNote": ""},
      );
      if (decisionRes.statusCode != 200) {
        if (!mounted) return;
        String msg = "Accept failed (${decisionRes.statusCode})";
        try {
          msg = jsonDecode(decisionRes.body)["message"] ?? msg;
        } catch (_) {}
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(msg)));
        setState(() => _submitting = false);
        return;
      }

      final taskBody = <String, dynamic>{
        "title": titleController.text.trim(),
        "taskType": "TOUR_PROGRAM",
        "assignedToId": _selectedStaffId,
        "description": descriptionController.text.trim(),
        "priority": _selectedPriority,
        "referenceId": id,
        "referenceType": "TOUR_PROGRAM",
      };
      if (_dueDate != null) {
        taskBody["dueDate"] = _dueDate!.toIso8601String();
      }

      final taskRes = await HttpService.post("/api/tasks", taskBody);
      if (!mounted) return;

      if (taskRes.statusCode == 200 || taskRes.statusCode == 201) {
        final staff = widget.staffList.firstWhere(
          (s) => s["id"]?.toString() == _selectedStaffId,
          orElse: () => {"name": "staff"},
        );
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text("Accepted & assigned to ${staff["name"]}"),
            backgroundColor: AppTheme.successGreen,
          ),
        );
        Navigator.pop(context, true);
      } else {
        String msg =
            "Accepted, but assignment failed (${taskRes.statusCode})";
        try {
          final m = jsonDecode(taskRes.body)["message"];
          if (m != null) msg = "Accepted, but $m";
        } catch (_) {}
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), backgroundColor: Colors.orange),
        );
        Navigator.pop(context, true);
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server error / No internet")),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.invitation;
    final eventName = p["eventName"] ?? "—";
    final venue = p["venue"] ?? "—";
    final dt = p["dateTime"]?.toString();
    final dateStr = dt != null
        ? DateFormat('d MMM yyyy, h:mm a').format(
            DateTime.tryParse(dt) ?? DateTime.now())
        : "—";
    final viewInsetsBottom = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: viewInsetsBottom),
      child: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
              child: Form(
                key: _formKey,
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
                          color: Colors.grey.shade300,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    Row(
                      children: [
                        const Icon(Icons.person_add_alt_1,
                            color: AppTheme.foreground, size: 22),
                        const SizedBox(width: 8),
                        const Expanded(
                          child: Text(
                            "Accept & Assign Tour",
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                              color: AppTheme.foreground,
                            ),
                          ),
                        ),
                        IconButton(
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(),
                          onPressed: _submitting
                              ? null
                              : () => Navigator.pop(context),
                          icon: const Icon(Icons.close),
                          color: Colors.grey.shade600,
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Padding(
                      padding: const EdgeInsets.only(left: 30),
                      child: Text(
                        "Accepts the invitation and assigns a follow-up task to a staff member",
                        style: TextStyle(
                            fontSize: 12, color: Colors.grey.shade600),
                      ),
                    ),
                    const SizedBox(height: 14),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppTheme.primaryIndigo50,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            "Accepting Tour Invitation",
                            style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: AppTheme.primaryIndigo),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            "$eventName • $dateStr • $venue",
                            style: const TextStyle(
                                fontSize: 13,
                                color: AppTheme.primaryIndigo),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    _label("Assign To Staff *"),
                    const SizedBox(height: 4),
                    DropdownButtonFormField<String>(
                      value: _selectedStaffId,
                      isExpanded: true,
                      hint: const Text("Select staff member"),
                      decoration: _decoration(),
                      items: widget.staffList
                          .map((s) => DropdownMenuItem<String>(
                                value: s["id"]?.toString(),
                                child: Text(
                                  s["name"]?.toString() ?? "—",
                                  style: const TextStyle(fontSize: 14),
                                ),
                              ))
                          .toList(),
                      onChanged: (v) =>
                          setState(() => _selectedStaffId = v),
                      validator: (v) => v == null ? "Required" : null,
                    ),
                    const SizedBox(height: 12),
                    _label("Task Title *"),
                    const SizedBox(height: 4),
                    TextFormField(
                      controller: titleController,
                      decoration: _decoration(),
                      validator: (v) => (v == null || v.trim().isEmpty)
                          ? "Required"
                          : null,
                    ),
                    const SizedBox(height: 12),
                    _label("Task Description"),
                    const SizedBox(height: 4),
                    TextFormField(
                      controller: descriptionController,
                      maxLines: 4,
                      decoration: _decoration(),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _label("Priority"),
                              const SizedBox(height: 4),
                              DropdownButtonFormField<String>(
                                value: _selectedPriority,
                                isExpanded: true,
                                decoration: _decoration(),
                                items: const [
                                  DropdownMenuItem(
                                      value: "LOW", child: Text("Low")),
                                  DropdownMenuItem(
                                      value: "NORMAL",
                                      child: Text("Normal")),
                                  DropdownMenuItem(
                                      value: "HIGH", child: Text("High")),
                                ],
                                onChanged: (v) => setState(() =>
                                    _selectedPriority = v ?? "NORMAL"),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _label("Due Date"),
                              const SizedBox(height: 4),
                              InkWell(
                                onTap: _pickDueDate,
                                child: InputDecorator(
                                  decoration: _decoration(),
                                  child: Text(
                                    _dueDate != null
                                        ? DateFormat('dd/MM/yyyy')
                                            .format(_dueDate!)
                                        : "dd-mm-yyyy",
                                    style: TextStyle(
                                      fontSize: 14,
                                      color: _dueDate != null
                                          ? Colors.black87
                                          : Colors.grey,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: _submitting
                                ? null
                                : () => Navigator.pop(context),
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(
                                  vertical: 14),
                              foregroundColor: Colors.grey.shade800,
                              side:
                                  BorderSide(color: Colors.grey.shade300),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(10)),
                            ),
                            child: const Text("Cancel"),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: _submitting ? null : _submit,
                            icon: _submitting
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        valueColor: AlwaysStoppedAnimation(
                                            Colors.white)))
                                : const Icon(Icons.person_add, size: 18),
                            label: Text(_submitting
                                ? "Submitting..."
                                : "Accept & Assign"),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppTheme.saffron,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(
                                  vertical: 14),
                              elevation: 0,
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(10)),
                              textStyle: const TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.bold),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _label(String text) {
    return Text(text,
        style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: AppTheme.foreground));
  }

  InputDecoration _decoration() {
    return InputDecoration(
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: Colors.grey.shade300),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: Colors.grey.shade300),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide:
            const BorderSide(color: AppTheme.saffron, width: 1.5),
      ),
    );
  }
}

// =====================================================
// TOUR INVITATION DETAILS DIALOG
// =====================================================
class _TourInvitationDetailsDialog extends StatelessWidget {
  final Map<String, dynamic> invitation;
  const _TourInvitationDetailsDialog({required this.invitation});

  String _fmtDateTime(dynamic v) {
    if (v == null) return "—";
    try {
      return DateFormat('d MMM yyyy, h:mm a')
          .format(DateTime.parse(v.toString()));
    } catch (_) {
      return "—";
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = invitation;

    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      shape:
          RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 540, maxHeight: 600),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text("Tour Invitation",
                        style: TextStyle(
                            fontSize: 18, fontWeight: FontWeight.bold)),
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
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFFBEB),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text("PENDING",
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFFB45309))),
              ),
              const SizedBox(height: 12),
              Text(
                p["eventName"]?.toString() ?? "—",
                style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              _kv("Organizer", p["organizer"]?.toString() ?? "—"),
              _kv("Date / Time", _fmtDateTime(p["dateTime"])),
              _kv("Venue", p["venue"]?.toString() ?? "—"),
              if ((p["venueLink"] ?? "").toString().isNotEmpty)
                _kv("Venue Link", p["venueLink"].toString()),
              if ((p["chiefGuest"] ?? "").toString().isNotEmpty)
                _kv("Chief Guest", p["chiefGuest"].toString()),
              if (p["expectedFootfall"] != null)
                _kv("Expected Footfall",
                    p["expectedFootfall"].toString()),
              if ((p["contactPhone"] ?? "").toString().isNotEmpty)
                _kv("Contact Phone", p["contactPhone"].toString()),
              if ((p["organizerPhone"] ?? "").toString().isNotEmpty)
                _kv("Organizer Phone",
                    p["organizerPhone"].toString()),
              if ((p["organizerEmail"] ?? "").toString().isNotEmpty)
                _kv("Organizer Email",
                    p["organizerEmail"].toString()),
              if ((p["referencedBy"] ?? "").toString().isNotEmpty)
                _kv("Referenced By", p["referencedBy"].toString()),
              if ((p["description"] ?? "").toString().isNotEmpty) ...[
                const SizedBox(height: 8),
                const Text("Description",
                    style: TextStyle(
                        fontSize: 13, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                Text(p["description"].toString(),
                    style: const TextStyle(fontSize: 13)),
              ],
              const SizedBox(height: 12),
              _kv("Created by",
                  p["createdBy"]?["name"]?.toString() ?? "—"),
              _kv("Created at", _fmtDateTime(p["createdAt"])),
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
                      padding: const EdgeInsets.symmetric(
                          horizontal: 18, vertical: 10),
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

  Widget _kv(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 130,
            child: Text(label,
                style: TextStyle(
                    fontSize: 12, color: Colors.grey.shade600)),
          ),
          Expanded(
            child: Text(value,
                style: const TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w500)),
          ),
        ],
      ),
    );
  }
}
