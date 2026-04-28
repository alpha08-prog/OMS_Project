import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/http_service.dart';
import '../../theme/app_theme.dart';
import 'verification_queue_page.dart';
import 'train_queue_page.dart';
import 'tour_queue_page.dart';

/// Admin Action Center — same pending data as the dashboard's Pending
/// Approvals list, but separated by type into 3 sections with inline
/// verify / approve / accept actions.
class ActionCenterPage extends StatefulWidget {
  final String role;
  const ActionCenterPage({super.key, required this.role});

  @override
  State<ActionCenterPage> createState() => _ActionCenterPageState();
}

class _ActionCenterPageState extends State<ActionCenterPage> {
  bool _loading = true;
  String? _error;

  List<Map<String, dynamic>> _pendingGrievances = [];
  List<Map<String, dynamic>> _pendingTrainRequests = [];
  List<Map<String, dynamic>> _pendingTourPrograms = [];

  // Per-row busy ids
  final Set<String> _busyIds = {};

  // Dropdown selection: which section to show
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

  int get _totalPending =>
      _pendingGrievances.length +
      _pendingTrainRequests.length +
      _pendingTourPrograms.length;

  // ===== Inline actions =====

  Future<void> _verifyGrievance(Map<String, dynamic> g) async {
    final id = g["id"]?.toString() ?? "";
    if (id.isEmpty || _busyIds.contains(id)) return;
    setState(() => _busyIds.add(id));
    try {
      final res = await HttpService.patch("/api/grievances/$id/verify", {});
      if (!mounted) return;
      if (res.statusCode == 200) {
        _toast("Grievance verified", AppTheme.successGreen);
        await _loadAll();
      } else {
        _toastError(res);
      }
    } catch (_) {
      if (mounted) _toast("Server error / No internet", Colors.red);
    } finally {
      if (mounted) setState(() => _busyIds.remove(id));
    }
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
        _toast("Train request approved", AppTheme.successGreen);
        await _loadAll();
      } else {
        _toastError(res);
      }
    } catch (_) {
      if (mounted) _toast("Server error / No internet", Colors.red);
    } finally {
      if (mounted) setState(() => _busyIds.remove(id));
    }
  }

  Future<void> _rejectTrain(Map<String, dynamic> t) async {
    final id = t["id"]?.toString() ?? "";
    if (id.isEmpty || _busyIds.contains(id)) return;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("Reject Train Request"),
        content: Text(
            "Reject train request for ${t["passengerName"] ?? "this passenger"}?"),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text("Cancel")),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style:
                ElevatedButton.styleFrom(backgroundColor: AppTheme.destructiveRed),
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
        _toast("Train request rejected", AppTheme.destructiveRed);
        await _loadAll();
      } else {
        _toastError(res);
      }
    } catch (_) {
      if (mounted) _toast("Server error / No internet", Colors.red);
    } finally {
      if (mounted) setState(() => _busyIds.remove(id));
    }
  }

  Future<void> _decideTour(Map<String, dynamic> p, String decision) async {
    final id = p["id"]?.toString() ?? "";
    if (id.isEmpty || _busyIds.contains(id)) return;

    if (decision == "REGRET") {
      final confirm = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text("Regret Tour Program"),
          content: Text(
              "Send regret for ${p["eventName"] ?? "this event"}?"),
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
    }

    setState(() => _busyIds.add(id));
    try {
      final res = await HttpService.patch(
        "/api/tour-programs/$id/decision",
        {"decision": decision, "decisionNote": ""},
      );
      if (!mounted) return;
      if (res.statusCode == 200) {
        _toast(
          decision == "ACCEPTED"
              ? "Tour accepted"
              : "Tour marked regret",
          decision == "ACCEPTED"
              ? AppTheme.successGreen
              : AppTheme.destructiveRed,
        );
        await _loadAll();
      } else {
        _toastError(res);
      }
    } catch (_) {
      if (mounted) _toast("Server error / No internet", Colors.red);
    } finally {
      if (mounted) setState(() => _busyIds.remove(id));
    }
  }

  void _toast(String msg, Color bg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: bg),
    );
  }

  void _toastError(dynamic res) {
    String msg = "Failed";
    try {
      msg = jsonDecode(res.body)["message"] ?? msg;
    } catch (_) {}
    _toast(msg, Colors.red);
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
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        backgroundColor: AppTheme.primaryIndigo,
        title: const Text(
          "Action Center",
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white),
            onPressed: _loadAll,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadAll,
        child: _loading
            ? ListView(children: const [
                SizedBox(height: 60),
                Center(child: CircularProgressIndicator()),
              ])
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
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
              ),
      ),
    );
  }

  // =================== TOP BANNER ===================
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
              color: Colors.white,
              fontSize: 22,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            "Items awaiting your action, separated by type",
            style: TextStyle(color: Colors.white70, fontSize: 12),
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

  // =================== TYPE DROPDOWN ===================
  Widget _typeDropdown() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.border),
        boxShadow: AppTheme.shadowSm,
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: _selectedType,
          isExpanded: true,
          icon: const Icon(Icons.keyboard_arrow_down,
              color: AppTheme.primaryIndigo),
          items: [
            DropdownMenuItem(
              value: "GRIEVANCE",
              child: _dropdownItem(
                Icons.assignment,
                const Color(0xFFC2410C),
                "Pending Grievances",
                _pendingGrievances.length,
              ),
            ),
            DropdownMenuItem(
              value: "TRAIN",
              child: _dropdownItem(
                Icons.train,
                const Color(0xFF0369A1),
                "Pending Train Requests",
                _pendingTrainRequests.length,
              ),
            ),
            DropdownMenuItem(
              value: "TOUR",
              child: _dropdownItem(
                Icons.event,
                const Color(0xFF6D28D9),
                "Pending Tour Programs",
                _pendingTourPrograms.length,
              ),
            ),
          ],
          onChanged: (v) {
            if (v != null) setState(() => _selectedType = v);
          },
        ),
      ),
    );
  }

  Widget _dropdownItem(IconData icon, Color accent, String label, int count) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: accent.withOpacity(0.12),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Icon(icon, color: accent, size: 16),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(label,
              style: const TextStyle(
                  fontSize: 14, fontWeight: FontWeight.w600)),
        ),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: accent.withOpacity(0.12),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            "$count",
            style: TextStyle(
                fontSize: 12, fontWeight: FontWeight.bold, color: accent),
          ),
        ),
      ],
    );
  }

  // =================== SECTIONS ===================
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
        color: Colors.white,
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
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.foreground,
                  ),
                ),
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
            SizedBox(
              width: double.infinity,
              child: TextButton.icon(
                onPressed: onOpenQueue,
                icon: const Icon(Icons.arrow_forward, size: 16),
                label: Text(openLabel),
                style: TextButton.styleFrom(
                  foregroundColor: accent,
                  textStyle: const TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w600),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  // =================== GRIEVANCE SECTION ===================
  Widget _grievancesSection() {
    return _sectionShell(
      icon: Icons.assignment,
      accent: const Color(0xFFC2410C),
      title: "Pending Grievances",
      count: _pendingGrievances.length,
      openLabel: "Open Verify Queue",
      onOpenQueue: () => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const VerificationQueuePage()),
      ),
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
            style: TextStyle(fontSize: 11, color: Colors.grey.shade700),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: isBusy ? null : () => _verifyGrievance(g),
                  icon: isBusy
                      ? const SizedBox(
                          width: 12,
                          height: 12,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.check_circle, size: 14),
                  label: const Text("Verify"),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.successGreen,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8)),
                    textStyle: const TextStyle(
                        fontSize: 11, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // =================== TRAIN SECTION ===================
  Widget _trainSection() {
    return _sectionShell(
      icon: Icons.train,
      accent: const Color(0xFF0369A1),
      title: "Pending Train Requests",
      count: _pendingTrainRequests.length,
      openLabel: "Open Train Queue",
      onOpenQueue: () => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const TrainQueuePage()),
      ),
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
            style: TextStyle(fontSize: 11, color: Colors.grey.shade700),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: isBusy ? null : () => _approveTrain(t),
                  icon: isBusy
                      ? const SizedBox(
                          width: 12,
                          height: 12,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.check, size: 14),
                  label: const Text("Approve"),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.successGreen,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8)),
                    textStyle: const TextStyle(
                        fontSize: 11, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: isBusy ? null : () => _rejectTrain(t),
                  icon: const Icon(Icons.close, size: 14),
                  label: const Text("Reject"),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppTheme.destructiveRed,
                    side: const BorderSide(
                        color: AppTheme.destructiveRed),
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8)),
                    textStyle: const TextStyle(
                        fontSize: 11, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // =================== TOUR SECTION ===================
  Widget _tourSection() {
    return _sectionShell(
      icon: Icons.event,
      accent: const Color(0xFF6D28D9),
      title: "Pending Tour Programs",
      count: _pendingTourPrograms.length,
      openLabel: "Open Tour Queue",
      onOpenQueue: () => Navigator.push(
        context,
        MaterialPageRoute(builder: (_) => const TourQueuePage()),
      ),
      child: _pendingTourPrograms.isEmpty
          ? _emptyMini("No pending tour programs")
          : Column(
              children: _pendingTourPrograms.take(8).map(_tourRow).toList(),
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
            style: TextStyle(fontSize: 11, color: Colors.grey.shade700),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  onPressed:
                      isBusy ? null : () => _decideTour(p, "ACCEPTED"),
                  icon: isBusy
                      ? const SizedBox(
                          width: 12,
                          height: 12,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.check, size: 14),
                  label: const Text("Accept"),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.successGreen,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8)),
                    textStyle: const TextStyle(
                        fontSize: 11, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed:
                      isBusy ? null : () => _decideTour(p, "REGRET"),
                  icon: const Icon(Icons.close, size: 14),
                  label: const Text("Regret"),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppTheme.destructiveRed,
                    side: const BorderSide(
                        color: AppTheme.destructiveRed),
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8)),
                    textStyle: const TextStyle(
                        fontSize: 11, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // =================== HELPERS ===================
  Widget _emptyMini(String msg) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 18),
      child: Center(
        child: Text(
          msg,
          style: TextStyle(
            color: Colors.grey.shade500,
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
            Icon(Icons.celebration,
                size: 56, color: AppTheme.successGreen.withOpacity(0.7)),
            const SizedBox(height: 12),
            const Text("All caught up!",
                style: TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            Text("No pending items right now.",
                style: TextStyle(
                    color: Colors.grey.shade600, fontSize: 13)),
          ],
        ),
      ),
    );
  }
}
