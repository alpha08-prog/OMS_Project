import 'dart:convert';
import 'package:flutter/material.dart';

import '../../services/http_service.dart';
import '../../utils/access_control.dart';

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

  late Map<String, dynamic> grievanceData;

  bool _updating = false;

  @override
  void initState() {
    super.initState();
    grievanceData = Map<String, dynamic>.from(widget.grievanceData);
  }

  // ✅ Backend expects: OPEN / IN_PROGRESS / RESOLVED
  String _toBackendStatus(String uiStatus) {
    switch (uiStatus) {
      case "Open":
        return "OPEN";
      case "In Progress":
        return "IN_PROGRESS";
      case "Closed":
        return "RESOLVED";
      default:
        return "OPEN";
    }
  }

  // ✅ Show role-based access denied
  void _deny() {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text("Access denied for role: ${widget.role}")),
    );
  }

  int? _getId() {
    final id = grievanceData["id"];
    if (id is int) return id;
    if (id is String) return int.tryParse(id);
    return null;
  }

  Future<void> _updateStatus(String newUiStatus) async {
    final canEdit = AccessControl.can(widget.role, ActionPermission.edit);
    if (!canEdit) return _deny();

    final id = _getId();
    if (id == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Grievance ID missing.")),
      );
      return;
    }

    setState(() => _updating = true);

    try {
      final backendStatus = _toBackendStatus(newUiStatus);

      final res = await HttpService.patch(
        "/api/grievances/$id/status",
        {"status": backendStatus},
      );

      if (res.statusCode == 200) {
        setState(() {
          grievanceData["status"] = newUiStatus;
        });

        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Status updated ✅")),
        );
      } else {
        String msg = "Failed to update status (${res.statusCode})";
        try {
          final data = jsonDecode(res.body);
          msg = data["message"] ?? msg;
        } catch (_) {}

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg)),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server error / No internet")),
      );
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  Future<void> _approveGrievance() async {
    final canApprove = AccessControl.can(widget.role, ActionPermission.approve);
    if (!canApprove) return _deny();

    final id = _getId();
    if (id == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Grievance ID missing.")),
      );
      return;
    }

    setState(() => _updating = true);

    try {
      final res = await HttpService.patch(
        "/api/grievances/$id/verify",
        {}, // verify doesn't need body usually
      );

      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Approved / Verified ✅")),
        );
      } else {
        String msg = "Approval failed (${res.statusCode})";
        try {
          final data = jsonDecode(res.body);
          msg = data["message"] ?? msg;
        } catch (_) {}

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg)),
        );
      }
    } catch (_) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server error / No internet")),
      );
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final canEdit = AccessControl.can(widget.role, ActionPermission.edit);
    final canApprove = AccessControl.can(widget.role, ActionPermission.approve);

    return Scaffold(
      backgroundColor: const Color(0xFFF4F6FB),
      appBar: AppBar(
        title: const Text("Grievance Details"),
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
            )
        ],
      ),

      // ✅ Buttons fixed at bottom (Role based)
      bottomNavigationBar: (canEdit || canApprove)
          ? Container(
              padding: const EdgeInsets.all(12),
              color: Colors.white,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // ✅ STAFF + ADMIN can edit status
                  if (canEdit) _statusButtons(),

                  // ✅ Only ADMIN can approve
                  if (canApprove) ...[
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: ElevatedButton.icon(
                        onPressed: _updating ? null : _approveGrievance,
                        icon: const Icon(Icons.verified),
                        label: const Text(
                          "Approve / Verify",
                          style: TextStyle(fontWeight: FontWeight.bold),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.green,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            )
          : null,

      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            _mainCard(),
            const SizedBox(height: 16),
            _statusCard(),
            const SizedBox(height: 16),

            // ✅ Read-only hint for Super Admin
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
      ),
    );
  }

  // ✅ Status Buttons
  Widget _statusButtons() {
    return Row(
      children: [
        Expanded(
          child: OutlinedButton(
            onPressed: _updating ? null : () => _updateStatus("Open"),
            style: OutlinedButton.styleFrom(
              side: const BorderSide(color: primaryBlue),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: const Text("Open"),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: OutlinedButton(
            onPressed: _updating ? null : () => _updateStatus("In Progress"),
            style: OutlinedButton.styleFrom(
              side: const BorderSide(color: primaryBlue),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: const Text("In Progress"),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: OutlinedButton(
            onPressed: _updating ? null : () => _updateStatus("Closed"),
            style: OutlinedButton.styleFrom(
              side: const BorderSide(color: primaryBlue),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: const Text("Closed"),
          ),
        ),
      ],
    );
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
        ],
      ),
    );
  }

  Widget _statusCard() {
    final status = grievanceData["status"] ?? "-";

    Color bg = Colors.grey.shade200;
    Color text = Colors.grey;

    if (status == "Open") {
      bg = Colors.green.shade50;
      text = Colors.green;
    } else if (status == "In Progress") {
      bg = Colors.orange.shade50;
      text = Colors.orange;
    } else if (status == "Closed") {
      bg = Colors.grey.shade300;
      text = Colors.grey.shade800;
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: _cardDecoration(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            "TICKET STATUS",
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.bold,
              color: primaryBlue,
            ),
          ),
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 12),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: bg,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              status,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: text,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ---------- helpers ----------
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
              (value == null || value.toString().isEmpty) ? "-" : value.toString(),
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
                (value == null || value.toString().isEmpty) ? "-" : value.toString(),
              ),
            ),
          ],
        ),
      );
}
