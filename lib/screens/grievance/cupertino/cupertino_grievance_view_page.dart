import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show Colors;

import '../../../services/http_service.dart';
import '../../../utils/access_control.dart';
import '../../../widgets/cupertino/cupertino_page_header.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';

/// Grievance details — single-pane view. Timeline + Tracking-history
/// segments were removed 2026-05-22 (only the Details pane is shown). Admin
/// can still Verify and Complete & Lock from the bottom action bar.
class CupertinoGrievanceViewPage extends StatefulWidget {
  final String grievanceId;
  final String role;

  const CupertinoGrievanceViewPage({
    super.key,
    required this.grievanceId,
    required this.role,
  });

  @override
  State<CupertinoGrievanceViewPage> createState() =>
      _CupertinoGrievanceViewPageState();
}

class _CupertinoGrievanceViewPageState
    extends State<CupertinoGrievanceViewPage> {
  static const Color primaryBlue = Color(0xFF0A2E5C);
  static const Color successGreen = Color(0xFF10B981);
  static const Color warningOrange = Color(0xFFF59E0B);

  Map<String, dynamic> grievanceData = {};
  bool _loading = true;
  bool _updating = false;

  @override
  void initState() {
    super.initState();
    _fetchGrievanceDetail();
  }

  Future<void> _fetchGrievanceDetail() async {
    setState(() => _loading = true);
    try {
      final res =
          await HttpService.get("/api/grievances/${widget.grievanceId}");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final data = decoded["data"] ?? decoded;
        if (!mounted) return;
        setState(() {
          grievanceData = Map<String, dynamic>.from(data);
          _loading = false;
        });
      } else {
        if (!mounted) return;
        setState(() => _loading = false);
        CupertinoToast.show(
            context, "Failed to load grievance (${res.statusCode})",
            isError: true);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
      CupertinoToast.show(context, "Server error / No internet", isError: true);
    }
  }

  void _deny() {
    CupertinoToast.show(context, "Access denied for role: ${widget.role}",
        isError: true);
  }

  Future<void> _approveGrievance() async {
    final canApprove = AccessControl.can(widget.role, ActionPermission.approve);
    if (!canApprove) return _deny();

    if (grievanceData["isLocked"] == true) {
      CupertinoToast.show(context, "Grievance is locked.", isError: true);
      return;
    }

    setState(() => _updating = true);

    try {
      final res = await HttpService.patch(
          "/api/grievances/${widget.grievanceId}/verify", {});

      if (res.statusCode == 200) {
        if (!mounted) return;
        setState(() {
          grievanceData["status"] = "VERIFIED";
        });
        CupertinoToast.show(context, "Approved / Verified");
      } else {
        String msg = "Approval failed (${res.statusCode})";
        try {
          final data = jsonDecode(res.body);
          msg = data["message"] ?? msg;
        } catch (_) {}
        if (!mounted) return;
        CupertinoToast.show(context, msg, isError: true);
      }
    } catch (_) {
      if (!mounted) return;
      CupertinoToast.show(context, "Server error / No internet", isError: true);
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  Future<void> _completeGrievance() async {
    final canApprove = AccessControl.can(widget.role, ActionPermission.approve);
    if (!canApprove) return _deny();

    if (grievanceData["isLocked"] == true) {
      CupertinoToast.show(context, "Grievance is already locked.",
          isError: true);
      return;
    }

    final confirm = await showCupertinoDialog<bool>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: const [
            Icon(CupertinoIcons.lock, color: warningOrange, size: 20),
            SizedBox(width: 8),
            Flexible(child: Text("Complete Grievance")),
          ],
        ),
        content: const Text(
          "Are you sure you want to mark this grievance as completed?\n\nThis will LOCK the grievance and no further modifications will be allowed.",
        ),
        actions: [
          CupertinoDialogAction(
            isDefaultAction: true,
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text("Cancel"),
          ),
          CupertinoDialogAction(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text("Complete"),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    setState(() => _updating = true);

    try {
      final res = await HttpService.patch(
          "/api/grievances/${widget.grievanceId}/complete", {
        "remarks": "Grievance resolved and closed",
      });

      if (res.statusCode == 200) {
        if (!mounted) return;
        setState(() {
          grievanceData["isLocked"] = true;
          grievanceData["status"] = "RESOLVED";
          grievanceData["currentStage"] = "CLOSED";
        });
        CupertinoToast.show(context, "Grievance completed and locked");
      } else {
        String msg = "Failed (${res.statusCode})";
        try {
          final data = jsonDecode(res.body);
          msg = data["message"] ?? msg;
        } catch (_) {}
        if (!mounted) return;
        CupertinoToast.show(context, msg, isError: true);
      }
    } catch (_) {
      if (!mounted) return;
      CupertinoToast.show(context, "Server error", isError: true);
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return CupertinoPageScaffold(
        backgroundColor: const Color(0xFFF4F6FB),
        child: Column(
          children: const [
            OmsPageHeader(title: "Grievance Details"),
            Expanded(child: Center(child: CupertinoActivityIndicator())),
          ],
        ),
      );
    }

    final canEdit = AccessControl.can(widget.role, ActionPermission.edit);
    final canApprove = AccessControl.can(widget.role, ActionPermission.approve);
    final isLocked = grievanceData["isLocked"] == true;

    return CupertinoPageScaffold(
      backgroundColor: const Color(0xFFF4F6FB),
      child: Column(
        children: [
          OmsPageHeader(
            title: "Grievance Details",
            trailing: _updating
                ? const Padding(
                    padding: EdgeInsets.only(right: 8),
                    child:
                        CupertinoActivityIndicator(color: CupertinoColors.white),
                  )
                : null,
          ),
          Expanded(
            child: Column(
              children: [
                Expanded(child: _buildDetailsBody(canEdit, canApprove)),
            if (isLocked)
              Container(
                padding: const EdgeInsets.all(16),
                decoration: const BoxDecoration(
                  color: CupertinoColors.systemGrey6,
                  border: Border(
                      top: BorderSide(color: CupertinoColors.systemGrey4)),
                ),
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(CupertinoIcons.lock_fill,
                        color: CupertinoColors.systemGrey),
                    SizedBox(width: 8),
                    Text(
                      "This grievance is locked",
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: CupertinoColors.systemGrey,
                      ),
                    ),
                  ],
                ),
              )
            else if (canApprove)
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: CupertinoColors.white,
                  boxShadow: [
                    BoxShadow(
                      color: CupertinoColors.black.withOpacity(0.05),
                      blurRadius: 10,
                      offset: const Offset(0, -2),
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: CupertinoButton(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        color: CupertinoColors.activeBlue,
                        borderRadius: BorderRadius.circular(12),
                        onPressed: _updating ? null : _approveGrievance,
                        child: const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(CupertinoIcons.checkmark_seal,
                                size: 18, color: CupertinoColors.white),
                            SizedBox(width: 6),
                            Text("Verify",
                                style: TextStyle(color: CupertinoColors.white)),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: CupertinoButton(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        color: successGreen,
                        borderRadius: BorderRadius.circular(12),
                        onPressed: _updating ? null : _completeGrievance,
                        child: const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(CupertinoIcons.checkmark_alt_circle,
                                size: 18, color: CupertinoColors.white),
                            SizedBox(width: 6),
                            Text("Complete & Lock",
                                style: TextStyle(
                                    color: CupertinoColors.white,
                                    fontSize: 13)),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
        ],
      ),
    );
  }

  Widget _buildDetailsBody(bool canEdit, bool canApprove) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          _mainCard(),
          const SizedBox(height: 16),
          _statusCard(),
          const SizedBox(height: 16),
          if (!canEdit && !canApprove)
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: CupertinoColors.white,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Row(
                children: [
                  Icon(CupertinoIcons.lock, color: CupertinoColors.systemGrey),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      "You have view-only access.",
                      style: TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  String _formatStage(String stage) {
    return stage.replaceAll('_', ' ').split(' ').map((w) {
      if (w.isEmpty) return '';
      return '${w[0].toUpperCase()}${w.substring(1).toLowerCase()}';
    }).join(' ');
  }

  Widget _mainCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: _cardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _section("PETITIONER INFORMATION"),
          _row("Petitioner Name", grievanceData["petitionerName"]),
          _row("Mobile Number", grievanceData["mobileNumber"]),
          const SizedBox(height: 20),
          _section("GRIEVANCE INFORMATION"),
          _row("Constituency / Ward", grievanceData["constituency"]),
          _row("Grievance Type", grievanceData["grievanceType"]),
          _block("Description", grievanceData["description"]),
          _row("Monetary Value", grievanceData["monetaryValue"]),
          const SizedBox(height: 20),
          _section("ACTION & LETTER PROCESSING"),
          _row("Action Required", grievanceData["actionRequired"]),
          _row("Letter Template", grievanceData["letterTemplate"]),
          _row("Referenced By", grievanceData["referencedBy"]),
        ],
      ),
    );
  }

  Widget _statusCard() {
    final status = grievanceData["status"] ?? "-";
    final currentStage = grievanceData["currentStage"] ?? "RECEIVED";
    final isLocked = grievanceData["isLocked"] == true;

    Color bg = Colors.grey.shade200;
    Color text = Colors.grey;

    if (status == "Open" || status == "OPEN") {
      bg = Colors.green.shade50;
      text = Colors.green;
    } else if (status == "In Progress" || status == "IN_PROGRESS") {
      bg = Colors.orange.shade50;
      text = Colors.orange;
    } else if (status == "Closed" || status == "RESOLVED") {
      bg = Colors.grey.shade300;
      text = Colors.grey.shade800;
    } else if (status == "VERIFIED") {
      bg = Colors.blue.shade50;
      text = Colors.blue;
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: _cardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            "STATUS & STAGE",
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.bold,
              color: primaryBlue,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: bg,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    status.toString().replaceAll('_', ' '),
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      color: text,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: isLocked
                        ? Colors.grey.shade200
                        : primaryBlue.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (isLocked) ...[
                        const Icon(CupertinoIcons.lock_fill,
                            size: 14, color: CupertinoColors.systemGrey),
                        const SizedBox(width: 4),
                      ],
                      Flexible(
                        child: Text(
                          _formatStage(currentStage),
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                            color: isLocked
                                ? CupertinoColors.systemGrey
                                : primaryBlue,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
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

  BoxDecoration _cardDecoration() => BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: CupertinoColors.black.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      );

  Widget _section(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Text(
          t,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.bold,
            color: primaryBlue,
          ),
        ),
      );

  Widget _row(String label, dynamic value) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: const TextStyle(fontSize: 12, color: Colors.grey),
            ),
            const SizedBox(height: 4),
            Text(
              (value == null || value.toString().isEmpty)
                  ? "-"
                  : value.toString(),
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      );

  Widget _block(String label, dynamic value) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: const TextStyle(fontSize: 12, color: Colors.grey)),
            const SizedBox(height: 6),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFF4F6FB),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                (value == null || value.toString().isEmpty)
                    ? "-"
                    : value.toString(),
              ),
            ),
          ],
        ),
      );
}
