import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';

import '../../../services/http_service.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../widgets/cupertino/cupertino_form_helpers.dart';

class CupertinoTourQueuePage extends StatefulWidget {
  const CupertinoTourQueuePage({super.key});

  @override
  State<CupertinoTourQueuePage> createState() =>
      _CupertinoTourQueuePageState();
}

class _CupertinoTourQueuePageState extends State<CupertinoTourQueuePage> {
  bool _loading = true;
  String? _error;

  List<Map<String, dynamic>> _pending = [];
  List<Map<String, dynamic>> _staffList = [];
  final Set<String> _busyIds = {};

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

    final confirm = await showCupertinoDialog<bool>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: const Text("Regret Tour Program"),
        content: Text("Send regret for ${p["eventName"] ?? "this event"}?"),
        actions: [
          CupertinoDialogAction(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text("Cancel"),
          ),
          CupertinoDialogAction(
            isDestructiveAction: true,
            onPressed: () => Navigator.pop(ctx, true),
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
        CupertinoToast.show(context, "Tour invitation marked regret");
        _fetchPending();
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
    } finally {
      if (mounted) setState(() => _busyIds.remove(id));
    }
  }

  Future<void> _openVerifyAssign(Map<String, dynamic> p) async {
    if (_staffList.isEmpty) await _fetchStaff();
    if (_staffList.isEmpty) {
      if (!mounted) return;
      CupertinoToast.show(context, "No staff available to assign",
          isError: true);
      return;
    }

    final result = await showCupertinoModalPopup<bool>(
      context: context,
      builder: (_) => _CupertinoVerifyAssignTourSheet(
        invitation: p,
        staffList: _staffList,
      ),
    );
    if (result == true) _fetchPending();
  }

  void _viewDetails(Map<String, dynamic> p) {
    showCupertinoModalPopup(
      context: context,
      builder: (_) => _CupertinoTourInvitationDetailsSheet(invitation: p),
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

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      backgroundColor: AppTheme.background,
      navigationBar: CupertinoNavigationBar(
        backgroundColor: AppTheme.primaryIndigo,
        brightness: Brightness.dark,
        middle: const Text(
          "Tour Invitations",
          style: TextStyle(color: CupertinoColors.white),
        ),
        leading: CupertinoButton(
          padding: EdgeInsets.zero,
          onPressed: () => Navigator.pop(context),
          child: const Icon(CupertinoIcons.back,
              color: CupertinoColors.white),
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
            CupertinoSliverRefreshControl(onRefresh: _fetchPending),
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
                    Text(
                      "Pending Invitations (${_pending.length})",
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.foreground,
                      ),
                    ),
                    const SizedBox(height: 12),
                    if (_error != null)
                      _buildError()
                    else if (_pending.isEmpty)
                      _buildEmpty()
                    else
                      ..._pending.map(_buildCard),
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
                  color: const Color(0xFFF5F3FF),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(CupertinoIcons.calendar,
                    color: Color(0xFF7C3AED)),
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
                    _metaLine(CupertinoIcons.briefcase, organizer),
                    const SizedBox(height: 2),
                    _metaLine(CupertinoIcons.clock, date),
                    const SizedBox(height: 2),
                    _metaLine(CupertinoIcons.location, venue),
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
              _btn(
                label: "View",
                icon: CupertinoIcons.eye,
                bg: CupertinoColors.systemGrey6,
                fg: CupertinoColors.black,
                onTap: () => _viewDetails(p),
              ),
              _btn(
                label: "Verify and Assign to Staff",
                icon: CupertinoIcons.checkmark_seal,
                bg: AppTheme.saffron,
                fg: CupertinoColors.white,
                onTap: () => _openVerifyAssign(p),
              ),
              _btn(
                label: "Regret",
                icon: CupertinoIcons.xmark_circle,
                bg: AppTheme.destructiveRed,
                fg: CupertinoColors.white,
                loading: isBusy,
                onTap: () => _regret(p),
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
          child:
              Icon(icon, size: 12, color: CupertinoColors.systemGrey),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(
                fontSize: 12, color: CupertinoColors.systemGrey),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
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
                Text(label,
                    style: TextStyle(
                        color: fg,
                        fontSize: 11,
                        fontWeight: FontWeight.w600)),
              ],
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
            const Icon(CupertinoIcons.exclamationmark_circle,
                size: 48, color: CupertinoColors.systemGrey3),
            const SizedBox(height: 12),
            Text(_error!,
                style:
                    const TextStyle(color: CupertinoColors.systemGrey)),
            const SizedBox(height: 12),
            CupertinoButton.filled(
              onPressed: _fetchPending,
              child: const Text("Retry"),
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
            Icon(CupertinoIcons.checkmark_seal_fill,
                size: 56,
                color: AppTheme.successGreen.withOpacity(0.7)),
            const SizedBox(height: 12),
            const Text("All caught up!",
                style: TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            const Text("No pending invitations right now.",
                style: TextStyle(
                    color: CupertinoColors.systemGrey, fontSize: 13)),
          ],
        ),
      ),
    );
  }
}

// =====================================================
// CUPERTINO VERIFY & ASSIGN TOUR MODAL
// =====================================================
class _CupertinoVerifyAssignTourSheet extends StatefulWidget {
  final Map<String, dynamic> invitation;
  final List<Map<String, dynamic>> staffList;
  const _CupertinoVerifyAssignTourSheet({
    required this.invitation,
    required this.staffList,
  });

  @override
  State<_CupertinoVerifyAssignTourSheet> createState() =>
      _CupertinoVerifyAssignTourSheetState();
}

class _CupertinoVerifyAssignTourSheetState
    extends State<_CupertinoVerifyAssignTourSheet> {
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

  void _pickDueDate() {
    CupertinoFormHelpers.showDatePicker(
      context: context,
      initialDate: _dueDate ?? DateTime.now().add(const Duration(days: 5)),
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
    _titleError =
        titleController.text.trim().isEmpty ? "Required" : null;
    if (_titleError != null) ok = false;
    setState(() {});
    return ok;
  }

  Future<void> _submit() async {
    if (!_validate()) return;
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
        CupertinoToast.show(context, msg, isError: true);
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
        CupertinoToast.show(
            context, "Accepted & assigned to ${staff["name"]}");
        Navigator.pop(context, true);
      } else {
        String msg =
            "Accepted, but assignment failed (${taskRes.statusCode})";
        try {
          final m = jsonDecode(taskRes.body)["message"];
          if (m != null) msg = "Accepted, but $m";
        } catch (_) {}
        CupertinoToast.show(context, msg, isError: true);
        Navigator.pop(context, true);
      }
    } catch (_) {
      if (!mounted) return;
      CupertinoToast.show(context, "Server error / No internet",
          isError: true);
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
                          "Verify & Assign Tour",
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
                        onPressed: _submitting
                            ? null
                            : () => Navigator.pop(context),
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
                        const Text("Accepting Tour Invitation",
                            style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: AppTheme.primaryIndigo)),
                        const SizedBox(height: 2),
                        Text("$eventName • $dateStr • $venue",
                            style: const TextStyle(
                                fontSize: 13,
                                color: AppTheme.primaryIndigo)),
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
                          onPressed: _submitting
                              ? null
                              : () => Navigator.pop(context),
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
                                  mainAxisAlignment:
                                      MainAxisAlignment.center,
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(CupertinoIcons.person_add,
                                        size: 18,
                                        color: CupertinoColors.white),
                                    SizedBox(width: 6),
                                    Text("Accept & Assign",
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
        final names = widget.staffList
            .map((s) => s["name"]?.toString() ?? "-")
            .toList();
        CupertinoFormHelpers.showPicker(
          context: context,
          items: names,
          currentValue: _selectedStaffId == null
              ? names.first
              : (widget.staffList.firstWhere(
                  (s) => s["id"]?.toString() == _selectedStaffId,
                  orElse: () => widget.staffList.first,
                )["name"]?.toString() ??
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
                    fontSize: 12,
                    color: CupertinoColors.destructiveRed)),
          ),
      ],
    );
  }
}

// =====================================================
// CUPERTINO TOUR INVITATION DETAILS MODAL
// =====================================================
class _CupertinoTourInvitationDetailsSheet extends StatelessWidget {
  final Map<String, dynamic> invitation;
  const _CupertinoTourInvitationDetailsSheet({required this.invitation});

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
                      child: Text("Tour Invitation",
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
                  _kv("Organizer Phone", p["organizerPhone"].toString()),
                if ((p["organizerEmail"] ?? "").toString().isNotEmpty)
                  _kv("Organizer Email", p["organizerEmail"].toString()),
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
                style: const TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w500)),
          ),
        ],
      ),
    );
  }
}
