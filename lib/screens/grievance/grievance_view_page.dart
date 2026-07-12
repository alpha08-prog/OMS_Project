import 'dart:convert';
import 'package:flutter/material.dart';

import '../../services/http_service.dart';
import '../../utils/access_control.dart';
import '../../widgets/attachments_section.dart';

/// Grievance details — single-pane view. Timeline + History tabs were removed
/// 2026-05-22 (only the Details pane is shown). Admin can still Verify and
/// Complete & Lock from the bottom action bar.
class GrievanceViewPage extends StatefulWidget {
  final Map<String, dynamic> grievanceData;
  final String role;

  const GrievanceViewPage({
    super.key,
    required this.grievanceData,
    required this.role,
  });

  @override
  State<GrievanceViewPage> createState() => _GrievanceViewPageState();
}

class _GrievanceViewPageState extends State<GrievanceViewPage> {
  static const Color primaryBlue = Color(0xFF0A2E5C);
  static const Color successGreen = Color(0xFF10B981);

  late Map<String, dynamic> grievanceData;
  bool _updating = false;

  @override
  void initState() {
    super.initState();
    grievanceData = Map<String, dynamic>.from(widget.grievanceData);
  }

  String? _getId() {
    final id = grievanceData["id"];
    if (id is int) return id.toString();
    if (id is String) return id;
    return null;
  }

  void _deny() {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text("Access denied for role: ${widget.role}")),
    );
  }

  Future<void> _completeGrievance() async {
    final canApprove = AccessControl.can(widget.role, ActionPermission.approve);
    if (!canApprove) return _deny();

    final id = _getId();
    if (id == null) return;

    if (grievanceData["isLocked"] == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Grievance is already locked.")),
      );
      return;
    }

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Row(
          children: [
            Icon(Icons.lock_outline, color: Colors.orange),
            SizedBox(width: 8),
            Text("Complete Grievance"),
          ],
        ),
        content: const Text(
          "Are you sure you want to mark this grievance as completed?\n\nThis will LOCK the grievance and no further modifications will be allowed.",
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text("Cancel"),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: successGreen),
            child:
                const Text("Complete", style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    setState(() => _updating = true);

    try {
      final res = await HttpService.patch("/api/grievances/$id/complete", {
        "remarks": "Grievance resolved and closed",
      });

      if (res.statusCode == 200) {
        if (!mounted) return;
        setState(() {
          grievanceData["isLocked"] = true;
          grievanceData["status"] = "RESOLVED";
          grievanceData["currentStage"] = "CLOSED";
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Grievance completed and locked")),
        );
      } else {
        String msg = "Failed (${res.statusCode})";
        try {
          final data = jsonDecode(res.body);
          msg = data["message"] ?? msg;
        } catch (_) {}
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server error")),
      );
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final canEdit = AccessControl.can(widget.role, ActionPermission.edit);
    final canApprove = AccessControl.can(widget.role, ActionPermission.approve);
    final isLocked = grievanceData["isLocked"] == true;

    return Scaffold(
      backgroundColor: const Color(0xFFF4F6FB),
      appBar: AppBar(
        elevation: 0,
        title: const Text("Grievance Details",
            style: TextStyle(fontWeight: FontWeight.w600)),
        backgroundColor: primaryBlue,
        actions: [
          if (_updating)
            const Padding(
              padding: EdgeInsets.only(right: 16),
              child: Center(
                child: SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
        ],
      ),
      bottomNavigationBar: isLocked
          ? Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                border: Border(top: BorderSide(color: Colors.grey.shade300)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.lock, color: Colors.grey.shade600),
                  const SizedBox(width: 8),
                  Text(
                    "This grievance is locked",
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Colors.grey.shade600,
                    ),
                  ),
                ],
              ),
            )
          : canApprove
              ? Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.05),
                        blurRadius: 10,
                        offset: const Offset(0, -2),
                      ),
                    ],
                  ),
                  child: SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: _updating ? null : _completeGrievance,
                      icon: const Icon(Icons.done_all, size: 18),
                      label: const Text("Complete & Lock"),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: successGreen,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                  ),
                )
              : null,
      body: _buildDetailsBody(canEdit, canApprove),
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
          if (_getId() != null) ...[
            _attachmentsCard(_getId()!),
            const SizedBox(height: 16),
          ],
          if (!canEdit && !canApprove)
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Row(
                children: [
                  Icon(Icons.lock_outline, color: Colors.grey),
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

  Widget _attachmentsCard(String id) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: _cardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.attach_file, size: 18, color: primaryBlue),
              SizedBox(width: 6),
              Text(
                "ATTACHMENTS",
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.bold,
                  color: primaryBlue,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          AttachmentsSection(contextId: id),
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
                        const Icon(Icons.lock, size: 14, color: Colors.grey),
                        const SizedBox(width: 4),
                      ],
                      Flexible(
                        child: Text(
                          _formatStage(currentStage),
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                            color: isLocked ? Colors.grey : primaryBlue,
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
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
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
