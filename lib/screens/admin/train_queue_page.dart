import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:open_filex/open_filex.dart';

import '../../services/http_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/date_range_filter.dart';

/// Admin-only "Train EQ Requests" page.
/// Shows all train EQ requests with status filter. Per-card actions vary by
/// status: Pending → Preview/Download/Verify+Assign/Reject. Approved → +
/// Mark resolved. Resolved/Rejected → Preview/Download only.
class TrainQueuePage extends StatefulWidget {
  const TrainQueuePage({super.key});

  @override
  State<TrainQueuePage> createState() => _TrainQueuePageState();
}

class _TrainQueuePageState extends State<TrainQueuePage> {
  bool _loading = true;
  String? _error;

  List<Map<String, dynamic>> _requests = [];
  List<Map<String, dynamic>> _staffList = [];

  String _statusFilter = "All";
  DateTime? _dateFrom;
  DateTime? _dateTo;
  static const _statuses = ["All", "PENDING", "APPROVED", "RESOLVED", "REJECTED"];

  final Set<String> _busyIds = {};

  @override
  void initState() {
    super.initState();
    _loadAll();
  }

  Future<void> _loadAll() async {
    await Future.wait([_fetchRequests(), _fetchStaff()]);
  }

  Future<void> _fetchRequests() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final params = <String, String>{'limit': '200'};
      if (_statusFilter != "All") params['status'] = _statusFilter;
      final qs = params.entries
          .map((e) => "${e.key}=${Uri.encodeComponent(e.value)}")
          .join("&");
      final res = await HttpService.get("/api/train-requests?$qs");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list = decoded is List ? decoded : (decoded["data"] ?? []);
        if (mounted) {
          setState(() {
            _requests = list
                .map<Map<String, dynamic>>(
                    (e) => Map<String, dynamic>.from(e))
                .toList();
            _loading = false;
          });
        }
      } else {
        if (mounted) {
          setState(() {
            _error = "Failed to load (${res.statusCode})";
            _loading = false;
          });
        }
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = "Server error / No internet";
          _loading = false;
        });
      }
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

  Future<void> _downloadPdf(Map<String, dynamic> r) async {
    final id = r["id"]?.toString() ?? "";
    if (id.isEmpty || _busyIds.contains(id)) return;
    setState(() => _busyIds.add(id));
    try {
      final res = await HttpService.downloadFile("/api/pdf/train-eq/$id");
      if (res.statusCode == 200) {
        final dir = await getTemporaryDirectory();
        final file = File("${dir.path}/train_eq_$id.pdf");
        await file.writeAsBytes(res.bodyBytes);
        final result = await OpenFilex.open(file.path);
        if (!mounted) return;
        if (result.type != ResultType.done) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text("Could not open PDF: ${result.message}")),
          );
        }
      } else {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("PDF failed (${res.statusCode})")),
        );
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Download error / No internet")),
      );
    } finally {
      if (mounted) setState(() => _busyIds.remove(id));
    }
  }

  Future<void> _reject(Map<String, dynamic> r) async {
    final id = r["id"]?.toString() ?? "";
    if (id.isEmpty) return;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("Reject Train EQ"),
        content: Text(
            "Reject train EQ request for ${r["passengerName"] ?? "this passenger"}?"),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text("Cancel")),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.destructiveRed),
            child: const Text("Reject"),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    try {
      final res = await HttpService.patch(
        "/api/train-requests/$id/reject",
        {"rejectionReason": ""},
      );
      if (!mounted) return;
      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Train EQ rejected"),
            backgroundColor: AppTheme.destructiveRed,
          ),
        );
        _fetchRequests();
      } else {
        _toastError(res);
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server error / No internet")),
      );
    }
  }

  Future<void> _markResolved(Map<String, dynamic> r) async {
    final id = r["id"]?.toString() ?? "";
    if (id.isEmpty) return;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("Mark Resolved"),
        content: const Text(
            "Mark this train EQ as resolved? This indicates the assigned staff has completed the task."),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text("Cancel")),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF7C3AED)),
            child: const Text("Resolve"),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    try {
      final res =
          await HttpService.patch("/api/train-requests/$id/resolve", {});
      if (!mounted) return;
      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Train EQ marked resolved"),
            backgroundColor: AppTheme.successGreen,
          ),
        );
        _fetchRequests();
      } else {
        _toastError(res);
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server error / No internet")),
      );
    }
  }

  Future<void> _openVerifyAssign(Map<String, dynamic> r) async {
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
      builder: (_) => _VerifyAssignTrainSheet(
        request: r,
        staffList: _staffList,
      ),
    );
    if (result == true) _fetchRequests();
  }

  void _openPreview(Map<String, dynamic> r) {
    showDialog(
      context: context,
      builder: (_) => _TrainPreviewDialog(request: r),
    );
  }

  void _toastError(dynamic res) {
    String msg = "Failed";
    try {
      msg = jsonDecode(res.body)["message"] ?? msg;
    } catch (_) {}
    if (mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(msg)));
    }
  }

  List<Map<String, dynamic>> get _visibleRequests {
    if (_dateFrom == null && _dateTo == null) return _requests;
    return _requests.where((r) {
      final dt = DateTime.tryParse(r['createdAt']?.toString() ?? '');
      return dateInRange(dt, from: _dateFrom, to: _dateTo);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final visible = _visibleRequests;
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        backgroundColor: AppTheme.primaryIndigo,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const [
            Text(
              "Train EQ Requests",
              style: TextStyle(
                  color: Colors.white, fontWeight: FontWeight.bold),
            ),
            Text(
              "Review and issue emergency quota letters",
              style: TextStyle(color: Colors.white70, fontSize: 11),
            ),
          ],
        ),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.15),
                borderRadius: BorderRadius.circular(8),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: _statusFilter,
                  iconEnabledColor: Colors.white,
                  dropdownColor: Colors.white,
                  style: const TextStyle(
                      color: Colors.white, fontSize: 12),
                  items: _statuses
                      .map((s) => DropdownMenuItem(
                            value: s,
                            child: Text(
                              s == "All" ? "All" : s,
                              style: const TextStyle(
                                  color: Colors.black87, fontSize: 12),
                            ),
                          ))
                      .toList(),
                  onChanged: (v) {
                    setState(() => _statusFilter = v ?? "All");
                    _fetchRequests();
                  },
                ),
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white),
            onPressed: _loadAll,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _fetchRequests,
        child: _loading
            ? ListView(children: const [
                SizedBox(height: 60),
                Center(child: CircularProgressIndicator()),
              ])
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Card(
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                      side: BorderSide(color: Colors.grey.shade200),
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
                  _buildSectionHeader(),
                  const SizedBox(height: 12),
                  if (_error != null)
                    _buildError()
                  else if (visible.isEmpty)
                    _buildEmpty()
                  else
                    ...visible.map(_buildCard),
                  const SizedBox(height: 24),
                ],
              ),
      ),
    );
  }

  Widget _buildSectionHeader() {
    final label = switch (_statusFilter) {
      "PENDING" => "Pending EQ Requests",
      "APPROVED" => "Approved EQ Requests",
      "RESOLVED" => "Resolved EQ Requests",
      "REJECTED" => "Rejected EQ Requests",
      _ => "All EQ Requests",
    };
    return Text(
      "$label (${_visibleRequests.length})",
      style: const TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.bold,
        color: AppTheme.foreground,
      ),
    );
  }

  Widget _buildCard(Map<String, dynamic> r) {
    final status = (r["status"] ?? "PENDING").toString();
    final passenger = r["passengerName"] ?? "—";
    final pnr = r["pnrNumber"] ?? "—";
    final from = r["fromStation"] ?? "—";
    final to = r["toStation"] ?? "—";
    final cls = r["journeyClass"] ?? "—";
    final dateOfJourney = _shortDate(r["dateOfJourney"]?.toString());
    final contact = r["contactNumber"]?.toString() ?? "";
    final trainNo = r["trainNumber"]?.toString() ?? "";
    final trainName = r["trainName"]?.toString() ?? "";
    final createdBy = r["createdBy"]?["name"] ?? "—";
    final createdAt = _shortDate(r["createdAt"]?.toString());

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
                  color: const Color(0xFFEFF6FF),
                  borderRadius: BorderRadius.circular(10),
                ),
                child:
                    const Icon(Icons.train, color: Color(0xFF1D4ED8)),
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
                            passenger,
                            style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.bold,
                              color: AppTheme.foreground,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 6),
                        _statusPill(status),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      "PNR: $pnr · $from → $to · $dateOfJourney · $cls",
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey.shade700,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (contact.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        "Contact: $contact",
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.primaryIndigo,
                        ),
                      ),
                    ],
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(Icons.train_outlined,
                            size: 12, color: Colors.grey.shade600),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            "$trainNo${trainName.isNotEmpty ? ' - $trainName' : ''}",
                            style: TextStyle(
                                fontSize: 11,
                                color: Colors.grey.shade700),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    Text(
                      "Created by: $createdBy · $createdAt",
                      style: TextStyle(
                          fontSize: 11, color: Colors.grey.shade600),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _cardActions(r, status),
        ],
      ),
    );
  }

  Widget _cardActions(Map<String, dynamic> r, String status) {
    final id = r["id"]?.toString() ?? "";
    final isBusy = _busyIds.contains(id);

    final actions = <Widget>[
      // Preview — always
      _actionBtn(
        label: "Preview",
        icon: Icons.visibility_outlined,
        bg: Colors.white,
        fg: Colors.grey.shade800,
        border: Colors.grey.shade300,
        onPressed: () => _openPreview(r),
      ),
      // Download PDF — always
      _actionBtn(
        label: "Download PDF",
        icon: Icons.download_outlined,
        bg: AppTheme.saffron,
        fg: Colors.white,
        loading: isBusy,
        onPressed: () => _downloadPdf(r),
      ),
    ];

    if (status == "PENDING") {
      actions.addAll([
        _actionBtn(
          label: "Verify and Assign to Staff",
          icon: Icons.check_circle_outline,
          bg: AppTheme.saffron,
          fg: Colors.white,
          onPressed: () => _openVerifyAssign(r),
        ),
        _actionBtn(
          label: "Reject",
          icon: Icons.cancel_outlined,
          bg: AppTheme.destructiveRed,
          fg: Colors.white,
          onPressed: () => _reject(r),
        ),
      ]);
    } else if (status == "APPROVED") {
      actions.add(
        _actionBtn(
          label: "Mark resolved",
          icon: Icons.check_circle,
          bg: const Color(0xFF7C3AED),
          fg: Colors.white,
          onPressed: () => _markResolved(r),
        ),
      );
    }

    return Wrap(
      spacing: 6,
      runSpacing: 6,
      alignment: WrapAlignment.start,
      children: actions,
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
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation(fg),
              ),
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
        textStyle: const TextStyle(
            fontSize: 11, fontWeight: FontWeight.w600),
      ),
    );
  }

  Widget _statusPill(String status) {
    Color bg;
    Color fg;
    switch (status.toUpperCase()) {
      case "PENDING":
        bg = const Color(0xFFFFFBEB);
        fg = const Color(0xFFB45309);
        break;
      case "APPROVED":
        bg = const Color(0xFFECFDF5);
        fg = const Color(0xFF065F46);
        break;
      case "RESOLVED":
        bg = const Color(0xFFE0F2FE);
        fg = const Color(0xFF0369A1);
        break;
      case "REJECTED":
        bg = const Color(0xFFFEE2E2);
        fg = const Color(0xFFB91C1C);
        break;
      default:
        bg = Colors.grey.shade200;
        fg = Colors.grey.shade700;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
      child: Text(
        status,
        style: TextStyle(
            fontSize: 10, fontWeight: FontWeight.bold, color: fg),
      ),
    );
  }

  String _shortDate(String? iso) {
    if (iso == null || iso.isEmpty) return "—";
    try {
      return DateFormat('M/d/yyyy').format(DateTime.parse(iso));
    } catch (_) {
      return iso;
    }
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
      padding: const EdgeInsets.symmetric(vertical: 60),
      child: Center(
        child: Column(
          children: [
            Icon(Icons.inbox_outlined,
                size: 56, color: Colors.grey.shade300),
            const SizedBox(height: 12),
            Text("No train EQ requests",
                style: TextStyle(
                    color: Colors.grey.shade600, fontSize: 14)),
          ],
        ),
      ),
    );
  }
}

// =====================================================
// VERIFY & ASSIGN TRAIN BOTTOM SHEET
// =====================================================
class _VerifyAssignTrainSheet extends StatefulWidget {
  final Map<String, dynamic> request;
  final List<Map<String, dynamic>> staffList;
  const _VerifyAssignTrainSheet({
    required this.request,
    required this.staffList,
  });

  @override
  State<_VerifyAssignTrainSheet> createState() =>
      _VerifyAssignTrainSheetState();
}

class _VerifyAssignTrainSheetState extends State<_VerifyAssignTrainSheet> {
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
    final r = widget.request;
    final pnr = r["pnrNumber"] ?? "—";
    final passenger = r["passengerName"] ?? "—";
    final from = r["fromStation"] ?? "—";
    final to = r["toStation"] ?? "—";
    final dateOfJourney = r["dateOfJourney"]?.toString() ?? "";
    final cls = r["journeyClass"] ?? "—";

    titleController = TextEditingController(
        text: "Process Train EQ - PNR $pnr - $passenger");
    descriptionController = TextEditingController(
      text: "PNR: $pnr\n"
          "Passenger: $passenger\n"
          "Route: $from → $to\n"
          "Date: $dateOfJourney\n"
          "Class: $cls",
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
      initialDate: _dueDate ?? DateTime.now().add(const Duration(days: 3)),
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

    final id = widget.request["id"]?.toString() ?? "";

    try {
      // Step 1: approve
      final approveRes =
          await HttpService.patch("/api/train-requests/$id/approve", {});
      if (approveRes.statusCode != 200) {
        if (!mounted) return;
        String msg = "Approve failed (${approveRes.statusCode})";
        try {
          msg = jsonDecode(approveRes.body)["message"] ?? msg;
        } catch (_) {}
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(msg)));
        setState(() => _submitting = false);
        return;
      }

      // Step 2: create task
      final taskBody = <String, dynamic>{
        "title": titleController.text.trim(),
        "taskType": "TRAIN_REQUEST",
        "assignedToId": _selectedStaffId,
        "description": descriptionController.text.trim(),
        "priority": _selectedPriority,
        "referenceId": id,
        "referenceType": "TRAIN_REQUEST",
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
            content: Text("Approved & assigned to ${staff["name"]}"),
            backgroundColor: AppTheme.successGreen,
          ),
        );
        Navigator.pop(context, true);
      } else {
        String msg =
            "Approved, but assignment failed (${taskRes.statusCode})";
        try {
          final m = jsonDecode(taskRes.body)["message"];
          if (m != null) msg = "Approved, but $m";
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
    final r = widget.request;
    final pnr = r["pnrNumber"] ?? "—";
    final passenger = r["passengerName"] ?? "—";
    final dateOfJourney = _shortDate(r["dateOfJourney"]?.toString());
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
                            "Verify & Assign Train EQ",
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
                        "Approves the train EQ and assigns a follow-up task to a staff member",
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
                            "Approving Train EQ",
                            style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: AppTheme.primaryIndigo),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            "$passenger • PNR $pnr • $dateOfJourney",
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
                                : "Approve & Assign"),
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
    return Text(
      text,
      style: const TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: AppTheme.foreground,
      ),
    );
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

  String _shortDate(String? iso) {
    if (iso == null || iso.isEmpty) return "—";
    try {
      return DateFormat('d MMM yyyy').format(DateTime.parse(iso));
    } catch (_) {
      return iso;
    }
  }
}

// =====================================================
// TRAIN PREVIEW DIALOG
// =====================================================
class _TrainPreviewDialog extends StatelessWidget {
  final Map<String, dynamic> request;
  const _TrainPreviewDialog({required this.request});

  String _formatDateTime(dynamic v) {
    if (v == null) return "—";
    try {
      return DateFormat('d MMM yyyy, hh:mm a')
          .format(DateTime.parse(v.toString()));
    } catch (_) {
      return "—";
    }
  }

  String _formatDate(dynamic v) {
    if (v == null) return "—";
    try {
      return DateFormat('d MMM yyyy').format(DateTime.parse(v.toString()));
    } catch (_) {
      return "—";
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = request;
    final passengers = (r["train_passengers"] is List)
        ? List.from(r["train_passengers"])
        : <dynamic>[];

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
                    child: Text(
                      "Train EQ Preview",
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
                  _pill((r["status"] ?? "").toString()),
                  if ((r["bookingType"] ?? "").toString().isNotEmpty)
                    _outlinedPill(r["bookingType"].toString()),
                  if ((r["journeyClass"] ?? "").toString().isNotEmpty)
                    _outlinedPill("Class: ${r["journeyClass"]}"),
                ],
              ),
              const SizedBox(height: 12),
              _kv("Passenger", r["passengerName"]?.toString() ?? "—"),
              _kv("PNR", r["pnrNumber"]?.toString() ?? "—"),
              _kv("Contact", r["contactNumber"]?.toString() ?? "—"),
              _kv("Train",
                  "${r["trainNumber"] ?? ""} ${r["trainName"] ?? ""}".trim()),
              _kv("Route",
                  "${r["fromStation"] ?? "—"} → ${r["toStation"] ?? "—"}"),
              _kv("Date of Journey", _formatDate(r["dateOfJourney"])),
              if ((r["referencedBy"] ?? "").toString().isNotEmpty)
                _kv("Referenced By", r["referencedBy"].toString()),
              if ((r["remarks"] ?? "").toString().isNotEmpty)
                _kv("Remarks", r["remarks"].toString()),
              if (passengers.isNotEmpty) ...[
                const SizedBox(height: 12),
                const Text("Passengers",
                    style: TextStyle(
                        fontSize: 13, fontWeight: FontWeight.bold)),
                const SizedBox(height: 6),
                ...passengers.map((p) {
                  final m = Map<String, dynamic>.from(p);
                  return Container(
                    margin: const EdgeInsets.only(bottom: 6),
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.grey.shade50,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.grey.shade200),
                    ),
                    child: Text(
                      "${m["name"] ?? "—"} · ${m["age"] ?? "—"} ${m["gender"] ?? ""}${m["berthPreference"] != null ? " · ${m["berthPreference"]}" : ""}",
                      style: const TextStyle(fontSize: 12),
                    ),
                  );
                }),
              ],
              const SizedBox(height: 12),
              _kv("Created by",
                  r["createdBy"]?["name"]?.toString() ?? "—"),
              _kv("Created at", _formatDateTime(r["createdAt"])),
              if (r["approvedAt"] != null) ...[
                _kv("Approved by",
                    r["approvedBy"]?["name"]?.toString() ?? "—"),
                _kv("Approved at", _formatDateTime(r["approvedAt"])),
              ],
              if ((r["rejectionReason"] ?? "").toString().isNotEmpty)
                _kv("Rejection Reason",
                    r["rejectionReason"].toString()),
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
            child: Text(
              value,
              style: const TextStyle(
                  fontSize: 13, fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }

  Widget _pill(String text) {
    Color bg;
    Color fg;
    switch (text.toUpperCase()) {
      case "PENDING":
        bg = const Color(0xFFFFFBEB);
        fg = const Color(0xFFB45309);
        break;
      case "APPROVED":
        bg = const Color(0xFFECFDF5);
        fg = const Color(0xFF065F46);
        break;
      case "RESOLVED":
        bg = const Color(0xFFE0F2FE);
        fg = const Color(0xFF0369A1);
        break;
      case "REJECTED":
        bg = const Color(0xFFFEE2E2);
        fg = const Color(0xFFB91C1C);
        break;
      default:
        bg = Colors.grey.shade200;
        fg = Colors.grey.shade700;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Text(text,
          style: TextStyle(
              fontSize: 11, fontWeight: FontWeight.bold, color: fg)),
    );
  }

  Widget _outlinedPill(String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(text,
          style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: Colors.grey.shade800)),
    );
  }
}
