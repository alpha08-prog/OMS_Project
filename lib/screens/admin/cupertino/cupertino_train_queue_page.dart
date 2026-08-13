import 'dart:convert';
import 'dart:io';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:open_filex/open_filex.dart';

import '../../../services/http_service.dart';
import '../../../theme/app_theme.dart';
import '../../../utils/csv_export.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../widgets/cupertino/cupertino_form_helpers.dart';
import '../../../widgets/cupertino/cupertino_date_range_filter.dart';
import '../../../widgets/cupertino/cupertino_page_header.dart';
import '../../../widgets/date_range_filter.dart' show dateInRange;
import '../../../widgets/oms_loader.dart';

class CupertinoTrainQueuePage extends StatefulWidget {
  const CupertinoTrainQueuePage({super.key});

  @override
  State<CupertinoTrainQueuePage> createState() =>
      _CupertinoTrainQueuePageState();
}

class _CupertinoTrainQueuePageState extends State<CupertinoTrainQueuePage> {
  bool _loading = true;
  String? _error;

  List<Map<String, dynamic>> _requests = [];
  List<Map<String, dynamic>> _staffList = [];

  String _statusFilter = "All";
  DateTime? _dateFrom;
  DateTime? _dateTo;
  static const _statuses = [
    "All",
    "PENDING",
    "APPROVED",
    "RESOLVED",
    "REJECTED"
  ];

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
                .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
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
        final List list = decoded is List ? decoded : (decoded["data"] ?? []);
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
          CupertinoToast.show(context, "Could not open PDF: ${result.message}",
              isError: true);
        }
      } else {
        if (!mounted) return;
        CupertinoToast.show(context, "PDF failed (${res.statusCode})",
            isError: true);
      }
    } catch (_) {
      if (!mounted) return;
      CupertinoToast.show(context, "Download error / No internet",
          isError: true);
    } finally {
      if (mounted) setState(() => _busyIds.remove(id));
    }
  }

  Future<void> _reject(Map<String, dynamic> r) async {
    final id = r["id"]?.toString() ?? "";
    if (id.isEmpty) return;

    final confirm = await showCupertinoDialog<bool>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: const Text("Reject Train EQ"),
        content: Text(
            "Reject train EQ request for ${r["passengerName"] ?? "this passenger"}?"),
        actions: [
          CupertinoDialogAction(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text("Cancel"),
          ),
          CupertinoDialogAction(
            isDestructiveAction: true,
            onPressed: () => Navigator.pop(ctx, true),
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
        CupertinoToast.show(context, "Train EQ rejected");
        _fetchRequests();
      } else {
        CupertinoToast.show(context, _errorMsg(res), isError: true);
      }
    } catch (_) {
      if (!mounted) return;
      CupertinoToast.show(context, "Server error / No internet", isError: true);
    }
  }

  Future<void> _markResolved(Map<String, dynamic> r) async {
    final id = r["id"]?.toString() ?? "";
    if (id.isEmpty) return;

    final confirm = await showCupertinoDialog<bool>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: const Text("Mark Resolved"),
        content: const Text(
            "Mark this train EQ as resolved? This indicates the assigned staff has completed the task."),
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
      final res =
          await HttpService.patch("/api/train-requests/$id/resolve", {});
      if (!mounted) return;
      if (res.statusCode == 200) {
        CupertinoToast.show(context, "Train EQ marked resolved");
        _fetchRequests();
      } else {
        CupertinoToast.show(context, _errorMsg(res), isError: true);
      }
    } catch (_) {
      if (!mounted) return;
      CupertinoToast.show(context, "Server error / No internet", isError: true);
    }
  }

  Future<void> _openVerifyAssign(Map<String, dynamic> r) async {
    if (_staffList.isEmpty) await _fetchStaff();
    if (_staffList.isEmpty) {
      if (!mounted) return;
      CupertinoToast.show(context, "No staff available to assign",
          isError: true);
      return;
    }

    final result = await showCupertinoModalPopup<bool>(
      context: context,
      builder: (_) => _CupertinoVerifyAssignTrainSheet(
        request: r,
        staffList: _staffList,
      ),
    );
    if (result == true) _fetchRequests();
  }

  void _openPreview(Map<String, dynamic> r) {
    showCupertinoModalPopup(
      context: context,
      builder: (_) => _CupertinoTrainPreviewSheet(request: r),
    );
  }

  String _errorMsg(dynamic res) {
    String msg = "Failed";
    try {
      msg = jsonDecode(res.body)["message"] ?? msg;
    } catch (_) {}
    return msg;
  }

  String _shortDate(String? iso) {
    if (iso == null || iso.isEmpty) return "—";
    try {
      return DateFormat('M/d/yyyy').format(DateTime.parse(iso));
    } catch (_) {
      return iso;
    }
  }

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      backgroundColor: AppTheme.background,
      child: Column(
        children: [
          OmsPageHeader(
            title: "Train EQ Requests",
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                GestureDetector(
                  onTap: () {
                    CupertinoFormHelpers.showPicker(
                      context: context,
                      items: _statuses,
                      currentValue: _statusFilter,
                      title: "Status",
                      onSelected: (v) {
                        setState(() => _statusFilter = v);
                        _fetchRequests();
                      },
                    );
                  },
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: CupertinoColors.white.withOpacity(0.18),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        Text(_statusFilter,
                            style: const TextStyle(
                                color: CupertinoColors.white, fontSize: 12)),
                        const SizedBox(width: 4),
                        const Icon(CupertinoIcons.chevron_down,
                            color: CupertinoColors.white, size: 12),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                CupertinoButton(
                  padding: EdgeInsets.zero,
                  onPressed: _visibleRequests.isEmpty ? null : _exportCsv,
                  child: const Icon(CupertinoIcons.arrow_down_doc,
                      color: CupertinoColors.white, size: 22),
                ),
                GestureDetector(
                  onTap: _loadAll,
                  child: const Icon(CupertinoIcons.refresh,
                      color: CupertinoColors.white, size: 22),
                ),
              ],
            ),
          ),
          Expanded(
              child: CustomScrollView(
            slivers: [
              CupertinoSliverRefreshControl(onRefresh: _fetchRequests),
              SliverPadding(
                padding: const EdgeInsets.all(16),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    if (_loading)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 60),
                        child: OmsLoader(size: 56),
                      )
                    else ...[
                      Container(
                        decoration: BoxDecoration(
                          color: CupertinoColors.systemBackground,
                          borderRadius: BorderRadius.circular(12),
                          border:
                              Border.all(color: CupertinoColors.systemGrey5),
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
                      const SizedBox(height: 12),
                      _buildSectionHeader(),
                      const SizedBox(height: 12),
                      if (_error != null)
                        _buildError()
                      else if (_visibleRequests.isEmpty)
                        _buildEmpty()
                      else
                        ..._visibleRequests.map(_buildCard),
                      const SizedBox(height: 24),
                    ],
                  ]),
                ),
              ),
            ],
          )),
        ],
      ),
    );
  }

  List<Map<String, dynamic>> get _visibleRequests {
    if (_dateFrom == null && _dateTo == null) return _requests;
    return _requests.where((r) {
      final dt = DateTime.tryParse(r['createdAt']?.toString() ?? '');
      return dateInRange(dt, from: _dateFrom, to: _dateTo);
    }).toList();
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

  void _exportCsv() {
    CsvExport.export(
      context,
      fileName: 'train_eq_requests',
      headers: [
        'Passenger',
        'PNR',
        'From',
        'To',
        'Journey Date',
        'Class',
        'Train',
        'Created By',
        'Created'
      ],
      rows: _visibleRequests.map((r) {
        String created = '';
        try {
          created = DateFormat('dd MMM yyyy')
              .format(DateTime.parse(r['createdAt'].toString()));
        } catch (_) {}
        String journey = '';
        try {
          journey = DateFormat('dd MMM yyyy')
              .format(DateTime.parse(r['dateOfJourney'].toString()));
        } catch (_) {}
        final trainNo = r['trainNumber']?.toString() ?? '';
        final trainName = r['trainName']?.toString() ?? '';
        final train = '$trainNo${trainName.isNotEmpty ? ' - $trainName' : ''}';
        return [
          r['passengerName'] ?? '',
          r['pnrNumber'] ?? '',
          r['fromStation'] ?? '',
          r['toStation'] ?? '',
          journey,
          r['journeyClass'] ?? '',
          train,
          r['createdBy']?['name'] ?? '',
          created,
        ];
      }).toList(),
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
        color: CupertinoColors.white,
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
                child: const Icon(CupertinoIcons.tram_fill,
                    color: Color(0xFF1D4ED8)),
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
                                color: AppTheme.foreground),
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
                      style: const TextStyle(
                          fontSize: 12, color: CupertinoColors.systemGrey),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (contact.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text("Contact: $contact",
                          style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.primaryIndigo)),
                    ],
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        const Icon(CupertinoIcons.train_style_one,
                            size: 12, color: CupertinoColors.systemGrey),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            "$trainNo${trainName.isNotEmpty ? ' - $trainName' : ''}",
                            style: const TextStyle(
                                fontSize: 11,
                                color: CupertinoColors.systemGrey),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    Text(
                      "Created by: $createdBy · $createdAt",
                      style: const TextStyle(
                          fontSize: 11, color: CupertinoColors.systemGrey),
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
      _btn(
        label: "Preview",
        icon: CupertinoIcons.eye,
        bg: CupertinoColors.systemGrey6,
        fg: CupertinoColors.black,
        onTap: () => _openPreview(r),
      ),
      _btn(
        label: "Download PDF",
        icon: CupertinoIcons.cloud_download,
        bg: AppTheme.saffron,
        fg: CupertinoColors.white,
        loading: isBusy,
        onTap: () => _downloadPdf(r),
      ),
    ];

    if (status == "PENDING") {
      actions.addAll([
        _btn(
          label: "Verify and Assign to Staff",
          icon: CupertinoIcons.checkmark_seal,
          bg: AppTheme.saffron,
          fg: CupertinoColors.white,
          onTap: () => _openVerifyAssign(r),
        ),
        _btn(
          label: "Reject",
          icon: CupertinoIcons.xmark_circle,
          bg: AppTheme.destructiveRed,
          fg: CupertinoColors.white,
          onTap: () => _reject(r),
        ),
      ]);
    } else if (status == "APPROVED") {
      actions.add(
        _btn(
          label: "Mark resolved",
          icon: CupertinoIcons.checkmark_circle_fill,
          bg: const Color(0xFF7C3AED),
          fg: CupertinoColors.white,
          onTap: () => _markResolved(r),
        ),
      );
    }

    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: actions,
    );
  }

  Widget _btn({
    required String label,
    required IconData icon,
    required Color bg,
    required Color fg,
    bool loading = false,
    required VoidCallback onTap,
  }) {
    return CupertinoButton(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      color: bg,
      borderRadius: BorderRadius.circular(8),
      onPressed: loading ? null : onTap,
      child: loading
          ? CupertinoActivityIndicator(color: fg)
          : Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, color: fg, size: 14),
                const SizedBox(width: 4),
                Text(
                  label,
                  style: TextStyle(
                    color: fg,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
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
        bg = CupertinoColors.systemGrey5;
        fg = CupertinoColors.systemGrey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
      child: Text(status,
          style:
              TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: fg)),
    );
  }

  Widget _buildError() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 60),
      child: Center(
        child: Column(
          children: [
            const Icon(CupertinoIcons.exclamationmark_circle,
                size: 48, color: CupertinoColors.systemGrey3),
            const SizedBox(height: 12),
            Text(_error!,
                style: const TextStyle(color: CupertinoColors.systemGrey)),
            const SizedBox(height: 12),
            CupertinoButton.filled(
              onPressed: _fetchRequests,
              child: const Text("Retry"),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmpty() {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 60),
      child: Center(
        child: Column(
          children: [
            Icon(CupertinoIcons.tray,
                size: 56, color: CupertinoColors.systemGrey4),
            SizedBox(height: 12),
            Text("No train EQ requests",
                style:
                    TextStyle(color: CupertinoColors.systemGrey, fontSize: 14)),
          ],
        ),
      ),
    );
  }
}

// =====================================================
// CUPERTINO VERIFY & ASSIGN TRAIN MODAL
// =====================================================
class _CupertinoVerifyAssignTrainSheet extends StatefulWidget {
  final Map<String, dynamic> request;
  final List<Map<String, dynamic>> staffList;
  const _CupertinoVerifyAssignTrainSheet({
    required this.request,
    required this.staffList,
  });

  @override
  State<_CupertinoVerifyAssignTrainSheet> createState() =>
      _CupertinoVerifyAssignTrainSheetState();
}

class _CupertinoVerifyAssignTrainSheetState
    extends State<_CupertinoVerifyAssignTrainSheet> {
  late final TextEditingController titleController;
  late final TextEditingController descriptionController;
  String? _selectedStaffId;
  String _selectedPriority = "NORMAL";
  DateTime? _dueDate;
  bool _submitting = false;
  String? _staffError;
  String? _titleError;

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

    titleController =
        TextEditingController(text: "Process Train EQ - PNR $pnr - $passenger");
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

  void _pickDueDate() {
    CupertinoFormHelpers.showDatePicker(
      context: context,
      initialDate: _dueDate ?? DateTime.now().add(const Duration(days: 3)),
      minimumDate: DateTime.now(),
      maximumDate: DateTime.now().add(const Duration(days: 365)),
      onDateSelected: (d) => setState(() => _dueDate = d),
    );
  }

  bool _validate() {
    bool ok = true;
    _staffError =
        _selectedStaffId == null ? "Please select a staff member" : null;
    if (_staffError != null) ok = false;
    _titleError = titleController.text.trim().isEmpty ? "Required" : null;
    if (_titleError != null) ok = false;
    setState(() {});
    return ok;
  }

  Future<void> _submit() async {
    if (!_validate()) return;
    setState(() => _submitting = true);

    final id = widget.request["id"]?.toString() ?? "";

    try {
      final approveRes =
          await HttpService.patch("/api/train-requests/$id/approve", {});
      if (approveRes.statusCode != 200) {
        if (!mounted) return;
        String msg = "Approve failed (${approveRes.statusCode})";
        try {
          msg = jsonDecode(approveRes.body)["message"] ?? msg;
        } catch (_) {}
        CupertinoToast.show(context, msg, isError: true);
        setState(() => _submitting = false);
        return;
      }

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
        CupertinoToast.show(context, "Approved & assigned to ${staff["name"]}");
        Navigator.pop(context, true);
      } else {
        String msg = "Approved, but assignment failed (${taskRes.statusCode})";
        try {
          final m = jsonDecode(taskRes.body)["message"];
          if (m != null) msg = "Approved, but $m";
        } catch (_) {}
        CupertinoToast.show(context, msg, isError: true);
        Navigator.pop(context, true);
      }
    } catch (_) {
      if (!mounted) return;
      CupertinoToast.show(context, "Server error / No internet", isError: true);
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
          color: CupertinoColors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            child: Padding(
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
                      const Icon(CupertinoIcons.person_badge_plus,
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
                      CupertinoButton(
                        padding: EdgeInsets.zero,
                        minSize: 0,
                        onPressed:
                            _submitting ? null : () => Navigator.pop(context),
                        child: const Icon(CupertinoIcons.xmark,
                            size: 20, color: CupertinoColors.systemGrey),
                      ),
                    ],
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
                        const Text("Approving Train EQ",
                            style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: AppTheme.primaryIndigo)),
                        const SizedBox(height: 2),
                        Text("$passenger • PNR $pnr • $dateOfJourney",
                            style: const TextStyle(
                                fontSize: 13, color: AppTheme.primaryIndigo)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  _label("Assign To Staff *"),
                  const SizedBox(height: 4),
                  _staffPicker(),
                  if (_staffError != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 4, left: 4),
                      child: Text(_staffError!,
                          style: const TextStyle(
                              fontSize: 12,
                              color: CupertinoColors.destructiveRed)),
                    ),
                  const SizedBox(height: 12),
                  _label("Task Title *"),
                  const SizedBox(height: 4),
                  _input(titleController, error: _titleError),
                  const SizedBox(height: 12),
                  _label("Task Description"),
                  const SizedBox(height: 4),
                  _input(descriptionController, maxLines: 4),
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
                            _priorityPicker(),
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
                            GestureDetector(
                              onTap: _pickDueDate,
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 12, vertical: 13),
                                decoration: BoxDecoration(
                                  color: CupertinoColors.systemGrey6,
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                      color: CupertinoColors.systemGrey4),
                                ),
                                child: Text(
                                  _dueDate != null
                                      ? DateFormat('dd/MM/yyyy')
                                          .format(_dueDate!)
                                      : "dd-mm-yyyy",
                                  style: TextStyle(
                                    fontSize: 14,
                                    color: _dueDate != null
                                        ? CupertinoColors.black
                                        : CupertinoColors.systemGrey,
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
                        child: CupertinoButton(
                          color: CupertinoColors.systemGrey6,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          borderRadius: BorderRadius.circular(10),
                          onPressed:
                              _submitting ? null : () => Navigator.pop(context),
                          child: const Text("Cancel",
                              style: TextStyle(
                                  fontWeight: FontWeight.w600,
                                  color: CupertinoColors.black)),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: CupertinoButton(
                          color: AppTheme.saffron,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          borderRadius: BorderRadius.circular(10),
                          onPressed: _submitting ? null : _submit,
                          child: _submitting
                              ? const CupertinoActivityIndicator(
                                  color: CupertinoColors.white)
                              : const Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(CupertinoIcons.person_add,
                                        size: 18, color: CupertinoColors.white),
                                    SizedBox(width: 6),
                                    Text("Approve & Assign",
                                        style: TextStyle(
                                            fontSize: 14,
                                            fontWeight: FontWeight.bold,
                                            color: CupertinoColors.white)),
                                  ],
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
    );
  }

  Widget _label(String text) {
    return Text(text,
        style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: AppTheme.foreground));
  }

  Widget _staffPicker() {
    final staffName = _selectedStaffId == null
        ? "Select staff member"
        : (widget.staffList.firstWhere(
              (s) => s["id"]?.toString() == _selectedStaffId,
              orElse: () => {"name": "—"},
            )["name"] ??
            "—");

    return GestureDetector(
      onTap: () {
        if (widget.staffList.isEmpty) return;
        final names =
            widget.staffList.map((s) => s["name"]?.toString() ?? "-").toList();
        CupertinoFormHelpers.showPicker(
          context: context,
          items: names,
          currentValue: _selectedStaffId == null
              ? names.first
              : (widget.staffList
                      .firstWhere(
                        (s) => s["id"]?.toString() == _selectedStaffId,
                        orElse: () => widget.staffList.first,
                      )["name"]
                      ?.toString() ??
                  names.first),
          title: "Assign To Staff",
          onSelected: (name) {
            final s = widget.staffList.firstWhere(
              (s) => s["name"]?.toString() == name,
              orElse: () => widget.staffList.first,
            );
            setState(() {
              _selectedStaffId = s["id"]?.toString();
              _staffError = null;
            });
          },
        );
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
        decoration: BoxDecoration(
          color: CupertinoColors.systemGrey6,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: _staffError != null
                ? CupertinoColors.destructiveRed
                : CupertinoColors.systemGrey4,
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                staffName,
                style: TextStyle(
                  fontSize: 14,
                  color: _selectedStaffId == null
                      ? CupertinoColors.systemGrey
                      : CupertinoColors.black,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const Icon(CupertinoIcons.chevron_down,
                size: 14, color: CupertinoColors.systemGrey),
          ],
        ),
      ),
    );
  }

  Widget _priorityPicker() {
    final label = switch (_selectedPriority) {
      "LOW" => "Low",
      "HIGH" => "High",
      _ => "Normal",
    };
    return GestureDetector(
      onTap: () {
        CupertinoFormHelpers.showPicker(
          context: context,
          items: const ["Low", "Normal", "High"],
          currentValue: label,
          title: "Priority",
          onSelected: (v) {
            setState(() => _selectedPriority = v.toUpperCase());
          },
        );
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
        decoration: BoxDecoration(
          color: CupertinoColors.systemGrey6,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: CupertinoColors.systemGrey4),
        ),
        child: Row(
          children: [
            Expanded(child: Text(label, style: const TextStyle(fontSize: 14))),
            const Icon(CupertinoIcons.chevron_down,
                size: 14, color: CupertinoColors.systemGrey),
          ],
        ),
      ),
    );
  }

  Widget _input(TextEditingController controller,
      {int maxLines = 1, String? error}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CupertinoTextField(
          controller: controller,
          maxLines: maxLines,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: BoxDecoration(
            color: CupertinoColors.systemGrey6,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: error != null
                  ? CupertinoColors.destructiveRed
                  : CupertinoColors.systemGrey4,
            ),
          ),
        ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 4),
            child: Text(error,
                style: const TextStyle(
                    fontSize: 12, color: CupertinoColors.destructiveRed)),
          ),
      ],
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
// CUPERTINO TRAIN PREVIEW MODAL
// =====================================================
class _CupertinoTrainPreviewSheet extends StatelessWidget {
  final Map<String, dynamic> request;
  const _CupertinoTrainPreviewSheet({required this.request});

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

    return Container(
      decoration: const BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        top: false,
        child: ConstrainedBox(
          constraints: BoxConstraints(
              maxHeight: MediaQuery.of(context).size.height * 0.85),
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
                      child: Text("Train EQ Preview",
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
                      style:
                          TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 6),
                  ...passengers.map((p) {
                    final m = Map<String, dynamic>.from(p);
                    return Container(
                      margin: const EdgeInsets.only(bottom: 6),
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: CupertinoColors.systemGrey6,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        "${m["name"] ?? "—"} · ${m["age"] ?? "—"} ${m["gender"] ?? ""}${m["berthPreference"] != null ? " · ${m["berthPreference"]}" : ""}",
                        style: const TextStyle(fontSize: 12),
                      ),
                    );
                  }),
                ],
                const SizedBox(height: 12),
                _kv("Created by", r["createdBy"]?["name"]?.toString() ?? "—"),
                _kv("Created at", _formatDateTime(r["createdAt"])),
                if (r["approvedAt"] != null) ...[
                  _kv("Approved by",
                      r["approvedBy"]?["name"]?.toString() ?? "—"),
                  _kv("Approved at", _formatDateTime(r["approvedAt"])),
                ],
                if ((r["rejectionReason"] ?? "").toString().isNotEmpty)
                  _kv("Rejection Reason", r["rejectionReason"].toString()),
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
                style: const TextStyle(
                    fontSize: 12, color: CupertinoColors.systemGrey)),
          ),
          Expanded(
            child: Text(value,
                style:
                    const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
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
        bg = CupertinoColors.systemGrey5;
        fg = CupertinoColors.systemGrey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Text(text,
          style:
              TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: fg)),
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
}
