import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';

import '../../../services/http_service.dart';
import '../../../theme/app_theme.dart';
import '../../../utils/app_navigator.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../widgets/cupertino/cupertino_form_helpers.dart';
import 'cupertino_verification_queue_page.dart' show CupertinoVerifyAssignSheet;

class CupertinoActionCenterPage extends StatefulWidget {
  final String role;
  const CupertinoActionCenterPage({super.key, required this.role});

  @override
  State<CupertinoActionCenterPage> createState() =>
      _CupertinoActionCenterPageState();
}

class _CupertinoActionCenterPageState
    extends State<CupertinoActionCenterPage> {
  bool _loading = true;
  String? _error;

  List<Map<String, dynamic>> _pendingGrievances = [];
  List<Map<String, dynamic>> _pendingTrainRequests = [];
  List<Map<String, dynamic>> _pendingTourPrograms = [];
  List<Map<String, dynamic>> _staffList = [];

  final Set<String> _busyIds = {};
  String _selectedType = "GRIEVANCE";

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
      await Future.wait([
        _fetchGrievances(),
        _fetchTrainRequests(),
        _fetchTourPrograms(),
        _fetchStaff(),
      ]);
    } catch (_) {
      _error = "Server error / No internet";
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _fetchGrievances() async {
    try {
      final res = await HttpService.get("/api/grievances/queue/verification");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list = decoded is List ? decoded : (decoded["data"] ?? []);
        _pendingGrievances = list
            .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
            .toList();
      }
    } catch (_) {}
  }

  Future<void> _fetchTrainRequests() async {
    try {
      final res = await HttpService.get("/api/train-requests/queue/pending");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list = decoded is List ? decoded : (decoded["data"] ?? []);
        _pendingTrainRequests = list
            .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
            .toList();
      }
    } catch (_) {}
  }

  Future<void> _fetchTourPrograms() async {
    try {
      final res = await HttpService.get("/api/tour-programs/pending");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list = decoded is List ? decoded : (decoded["data"] ?? []);
        _pendingTourPrograms = list
            .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
            .toList();
      }
    } catch (_) {}
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

  int get _totalPending =>
      _pendingGrievances.length +
      _pendingTrainRequests.length +
      _pendingTourPrograms.length;

  // ===== Inline actions =====

  Future<void> _verifyGrievance(Map<String, dynamic> g) async {
    if (_staffList.isEmpty) {
      await _fetchStaff();
      if (_staffList.isEmpty) {
        if (!mounted) return;
        CupertinoToast.show(context, "No staff available to assign",
            isError: true);
        return;
      }
    }

    final result = await showCupertinoModalPopup<bool>(
      context: context,
      builder: (_) => CupertinoVerifyAssignSheet(
        grievance: g,
        staffList: _staffList,
      ),
    );
    if (result == true) await _loadAll();
  }

  Future<void> _approveTrain(Map<String, dynamic> t) async {
    final id = t["id"]?.toString() ?? "";
    if (id.isEmpty || _busyIds.contains(id)) return;
    setState(() => _busyIds.add(id));
    try {
      final res =
          await HttpService.patch("/api/train-requests/$id/approve", {});
      if (!mounted) return;
      if (res.statusCode == 200) {
        CupertinoToast.show(context, "Train request approved");
        await _loadAll();
      } else {
        CupertinoToast.show(context, _errorMsg(res), isError: true);
      }
    } catch (_) {
      if (mounted) {
        CupertinoToast.show(context, "Server error / No internet",
            isError: true);
      }
    } finally {
      if (mounted) setState(() => _busyIds.remove(id));
    }
  }

  Future<void> _rejectTrain(Map<String, dynamic> t) async {
    final id = t["id"]?.toString() ?? "";
    if (id.isEmpty || _busyIds.contains(id)) return;

    final confirm = await showCupertinoDialog<bool>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: const Text("Reject Train Request"),
        content: Text(
            "Reject train request for ${t["passengerName"] ?? "this passenger"}?"),
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

    setState(() => _busyIds.add(id));
    try {
      final res = await HttpService.patch(
        "/api/train-requests/$id/reject",
        {"rejectionReason": ""},
      );
      if (!mounted) return;
      if (res.statusCode == 200) {
        CupertinoToast.show(context, "Train request rejected");
        await _loadAll();
      } else {
        CupertinoToast.show(context, _errorMsg(res), isError: true);
      }
    } catch (_) {
      if (mounted) {
        CupertinoToast.show(context, "Server error / No internet",
            isError: true);
      }
    } finally {
      if (mounted) setState(() => _busyIds.remove(id));
    }
  }

  Future<void> _decideTour(Map<String, dynamic> p, String decision) async {
    final id = p["id"]?.toString() ?? "";
    if (id.isEmpty || _busyIds.contains(id)) return;

    if (decision == "REGRET") {
      final confirm = await showCupertinoDialog<bool>(
        context: context,
        builder: (ctx) => CupertinoAlertDialog(
          title: const Text("Regret Tour Program"),
          content:
              Text("Send regret for ${p["eventName"] ?? "this event"}?"),
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
    }

    setState(() => _busyIds.add(id));
    try {
      final res = await HttpService.patch(
        "/api/tour-programs/$id/decision",
        {"decision": decision, "decisionNote": ""},
      );
      if (!mounted) return;
      if (res.statusCode == 200) {
        CupertinoToast.show(context,
            decision == "ACCEPTED" ? "Tour accepted" : "Tour marked regret");
        await _loadAll();
      } else {
        CupertinoToast.show(context, _errorMsg(res), isError: true);
      }
    } catch (_) {
      if (mounted) {
        CupertinoToast.show(context, "Server error / No internet",
            isError: true);
      }
    } finally {
      if (mounted) setState(() => _busyIds.remove(id));
    }
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
      return DateFormat('d MMM yyyy').format(DateTime.parse(iso));
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
          "Action Center",
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
                    _topBanner(),
                    const SizedBox(height: 16),
                    if (_error != null)
                      _buildError()
                    else if (_totalPending == 0)
                      _buildEmpty()
                    else ...[
                      _typeDropdown(),
                      const SizedBox(height: 12),
                      if (_selectedType == "GRIEVANCE") _grievancesSection(),
                      if (_selectedType == "TRAIN") _trainSection(),
                      if (_selectedType == "TOUR") _tourSection(),
                    ],
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

  Widget _topBanner() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: AppTheme.primaryGradient,
        borderRadius: BorderRadius.circular(16),
        boxShadow: AppTheme.shadowColored(AppTheme.primaryIndigo),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            "$_totalPending Pending Item${_totalPending == 1 ? '' : 's'}",
            style: const TextStyle(
              color: CupertinoColors.white,
              fontSize: 22,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            "Items awaiting your action, separated by type",
            style: TextStyle(
                color: CupertinoColors.white.withOpacity(0.85), fontSize: 12),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              _bannerChip("Grievances", _pendingGrievances.length,
                  const Color(0xFFFFEDD5), const Color(0xFFC2410C)),
              _bannerChip("Train EQ", _pendingTrainRequests.length,
                  const Color(0xFFE0F2FE), const Color(0xFF0369A1)),
              _bannerChip("Tours", _pendingTourPrograms.length,
                  const Color(0xFFF3E8FF), const Color(0xFF6D28D9)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _bannerChip(String label, int n, Color bg, Color fg) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Text("$label: $n",
          style:
              TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: fg)),
    );
  }

  Widget _typeDropdown() {
    final selected = _typeMeta(_selectedType);
    return GestureDetector(
      onTap: () {
        final labels = ["Pending Grievances", "Pending Train Requests", "Pending Tour Programs"];
        final values = ["GRIEVANCE", "TRAIN", "TOUR"];
        final currentLabel = _typeMeta(_selectedType).$3;
        CupertinoFormHelpers.showPicker(
          context: context,
          items: labels,
          currentValue: currentLabel,
          title: "Select Type",
          onSelected: (label) {
            final idx = labels.indexOf(label);
            if (idx >= 0) {
              setState(() => _selectedType = values[idx]);
            }
          },
        );
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: CupertinoColors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppTheme.border),
          boxShadow: AppTheme.shadowSm,
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: selected.$2.withOpacity(0.12),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Icon(selected.$1, color: selected.$2, size: 16),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                selected.$3,
                style: const TextStyle(
                    fontSize: 14, fontWeight: FontWeight.w600),
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: selected.$2.withOpacity(0.12),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                "${selected.$4}",
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: selected.$2),
              ),
            ),
            const SizedBox(width: 8),
            Icon(CupertinoIcons.chevron_down,
                color: selected.$2, size: 16),
          ],
        ),
      ),
    );
  }

  (IconData, Color, String, int) _typeMeta(String type) {
    switch (type) {
      case "TRAIN":
        return (
          CupertinoIcons.tram_fill,
          const Color(0xFF0369A1),
          "Pending Train Requests",
          _pendingTrainRequests.length,
        );
      case "TOUR":
        return (
          CupertinoIcons.calendar,
          const Color(0xFF6D28D9),
          "Pending Tour Programs",
          _pendingTourPrograms.length,
        );
      default:
        return (
          CupertinoIcons.doc_text,
          const Color(0xFFC2410C),
          "Pending Grievances",
          _pendingGrievances.length,
        );
    }
  }

  Widget _sectionShell({
    required IconData icon,
    required Color accent,
    required String title,
    required int count,
    required Widget child,
    required VoidCallback onOpenQueue,
    required String openLabel,
  }) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
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
            children: [
              Container(
                padding: const EdgeInsets.all(7),
                decoration: BoxDecoration(
                  color: accent.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(icon, color: accent, size: 18),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(title,
                    style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.foreground)),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: accent.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  "$count",
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: accent,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          child,
          if (count > 0) ...[
            const SizedBox(height: 8),
            CupertinoButton(
              padding: const EdgeInsets.symmetric(vertical: 6),
              onPressed: onOpenQueue,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    openLabel,
                    style: TextStyle(
                      color: accent,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Icon(CupertinoIcons.chevron_right,
                      size: 14, color: accent),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _grievancesSection() {
    return _sectionShell(
      icon: CupertinoIcons.doc_text,
      accent: const Color(0xFFC2410C),
      title: "Pending Grievances",
      count: _pendingGrievances.length,
      openLabel: "Open Verify Queue",
      onOpenQueue: () => AppNavigator.toVerificationQueue(context),
      child: _pendingGrievances.isEmpty
          ? _emptyMini("No pending grievances")
          : Column(
              children: _pendingGrievances
                  .take(8)
                  .map(_grievanceRow)
                  .toList(),
            ),
    );
  }

  Widget _grievanceRow(Map<String, dynamic> g) {
    final id = g["id"]?.toString() ?? "";
    final isBusy = _busyIds.contains(id);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFBEB),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFFFEDD5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            "${g["petitionerName"] ?? "—"} · ${(g["grievanceType"] ?? "").toString().replaceAll('_', ' ')}",
            style: const TextStyle(
                fontSize: 13, fontWeight: FontWeight.bold),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 2),
          Text(
            "${g["constituency"] ?? "—"} · ${_shortDate(g["createdAt"]?.toString())}",
            style: const TextStyle(
                fontSize: 11, color: CupertinoColors.systemGrey),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: CupertinoButton(
              padding: const EdgeInsets.symmetric(vertical: 6),
              color: AppTheme.successGreen,
              borderRadius: BorderRadius.circular(8),
              onPressed: isBusy ? null : () => _verifyGrievance(g),
              child: isBusy
                  ? const CupertinoActivityIndicator(
                      color: CupertinoColors.white)
                  : const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(CupertinoIcons.checkmark_circle,
                            size: 14, color: CupertinoColors.white),
                        SizedBox(width: 4),
                        Text("Verify",
                            style: TextStyle(
                                color: CupertinoColors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.w600)),
                      ],
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _trainSection() {
    return _sectionShell(
      icon: CupertinoIcons.tram_fill,
      accent: const Color(0xFF0369A1),
      title: "Pending Train Requests",
      count: _pendingTrainRequests.length,
      openLabel: "Open Train Queue",
      onOpenQueue: () => AppNavigator.toTrainQueue(context),
      child: _pendingTrainRequests.isEmpty
          ? _emptyMini("No pending train requests")
          : Column(
              children: _pendingTrainRequests
                  .take(8)
                  .map(_trainRow)
                  .toList(),
            ),
    );
  }

  Widget _trainRow(Map<String, dynamic> t) {
    final id = t["id"]?.toString() ?? "";
    final isBusy = _busyIds.contains(id);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFFEFF6FF),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFDBEAFE)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            "${t["passengerName"] ?? "—"} · ${t["pnrNumber"] ?? "—"}",
            style: const TextStyle(
                fontSize: 13, fontWeight: FontWeight.bold),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 2),
          Text(
            "${t["fromStation"] ?? "—"} → ${t["toStation"] ?? "—"} · ${_shortDate(t["dateOfJourney"]?.toString())}",
            style: const TextStyle(
                fontSize: 11, color: CupertinoColors.systemGrey),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: CupertinoButton(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  color: AppTheme.successGreen,
                  borderRadius: BorderRadius.circular(8),
                  onPressed: isBusy ? null : () => _approveTrain(t),
                  child: isBusy
                      ? const CupertinoActivityIndicator(
                          color: CupertinoColors.white)
                      : const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(CupertinoIcons.checkmark,
                                size: 14, color: CupertinoColors.white),
                            SizedBox(width: 4),
                            Text("Approve",
                                style: TextStyle(
                                    color: CupertinoColors.white,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600)),
                          ],
                        ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: CupertinoButton(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  color: CupertinoColors.white,
                  borderRadius: BorderRadius.circular(8),
                  onPressed: isBusy ? null : () => _rejectTrain(t),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(CupertinoIcons.xmark,
                          size: 14, color: AppTheme.destructiveRed),
                      SizedBox(width: 4),
                      Text("Reject",
                          style: TextStyle(
                              color: AppTheme.destructiveRed,
                              fontSize: 11,
                              fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _tourSection() {
    return _sectionShell(
      icon: CupertinoIcons.calendar,
      accent: const Color(0xFF6D28D9),
      title: "Pending Tour Programs",
      count: _pendingTourPrograms.length,
      openLabel: "Open Tour Queue",
      onOpenQueue: () => AppNavigator.toTourQueue(context),
      child: _pendingTourPrograms.isEmpty
          ? _emptyMini("No pending tour programs")
          : Column(
              children:
                  _pendingTourPrograms.take(8).map(_tourRow).toList(),
            ),
    );
  }

  Widget _tourRow(Map<String, dynamic> p) {
    final id = p["id"]?.toString() ?? "";
    final isBusy = _busyIds.contains(id);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFFF5F3FF),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFEDE9FE)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            "${p["eventName"] ?? "—"}",
            style: const TextStyle(
                fontSize: 13, fontWeight: FontWeight.bold),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 2),
          Text(
            "${p["organizer"] ?? "—"} · ${_shortDate(p["dateTime"]?.toString())}",
            style: const TextStyle(
                fontSize: 11, color: CupertinoColors.systemGrey),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: CupertinoButton(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  color: AppTheme.successGreen,
                  borderRadius: BorderRadius.circular(8),
                  onPressed:
                      isBusy ? null : () => _decideTour(p, "ACCEPTED"),
                  child: isBusy
                      ? const CupertinoActivityIndicator(
                          color: CupertinoColors.white)
                      : const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(CupertinoIcons.checkmark,
                                size: 14, color: CupertinoColors.white),
                            SizedBox(width: 4),
                            Text("Accept",
                                style: TextStyle(
                                    color: CupertinoColors.white,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600)),
                          ],
                        ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: CupertinoButton(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  color: CupertinoColors.white,
                  borderRadius: BorderRadius.circular(8),
                  onPressed:
                      isBusy ? null : () => _decideTour(p, "REGRET"),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(CupertinoIcons.xmark,
                          size: 14, color: AppTheme.destructiveRed),
                      SizedBox(width: 4),
                      Text("Regret",
                          style: TextStyle(
                              color: AppTheme.destructiveRed,
                              fontSize: 11,
                              fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _emptyMini(String msg) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 18),
      child: Center(
        child: Text(
          msg,
          style: const TextStyle(
            color: CupertinoColors.systemGrey,
            fontSize: 12,
            fontStyle: FontStyle.italic,
          ),
        ),
      ),
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
              onPressed: _loadAll,
              child: const Text("Retry"),
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
            Icon(CupertinoIcons.checkmark_seal_fill,
                size: 56, color: AppTheme.successGreen.withOpacity(0.7)),
            const SizedBox(height: 12),
            const Text("All caught up!",
                style: TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            const Text("No pending items right now.",
                style: TextStyle(
                    color: CupertinoColors.systemGrey, fontSize: 13)),
          ],
        ),
      ),
    );
  }
}
