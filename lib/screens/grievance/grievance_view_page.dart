import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

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

class _GrievanceViewPageState extends State<GrievanceViewPage>
    with SingleTickerProviderStateMixin {
  static const Color primaryBlue = Color(0xFF0A2E5C);
  static const Color successGreen = Color(0xFF10B981);
  static const Color warningOrange = Color(0xFFF59E0B);

  late TabController _tabController;
  late Map<String, dynamic> grievanceData;

  bool _updating = false;
  bool _loadingTracking = false;
  List<Map<String, dynamic>> trackingHistory = [];

  // All stages in order
  final List<Map<String, String>> stages = [
    {'value': 'RECEIVED', 'label': 'Received', 'icon': 'inbox'},
    {'value': 'UNDER_REVIEW', 'label': 'Under Review', 'icon': 'search'},
    {'value': 'FORWARDED_TO_DEPT', 'label': 'Forwarded', 'icon': 'send'},
    {'value': 'DEPT_PROCESSING', 'label': 'Processing', 'icon': 'settings'},
    {'value': 'AWAITING_RESPONSE', 'label': 'Awaiting', 'icon': 'hourglass'},
    {'value': 'RESPONSE_RECEIVED', 'label': 'Response', 'icon': 'mail'},
    {'value': 'LETTER_GENERATED', 'label': 'Letter Gen', 'icon': 'description'},
    {'value': 'LETTER_SENT', 'label': 'Letter Sent', 'icon': 'outbox'},
    {'value': 'FOLLOW_UP', 'label': 'Follow Up', 'icon': 'repeat'},
    {'value': 'COMPLETED', 'label': 'Completed', 'icon': 'check_circle'},
    {'value': 'CLOSED', 'label': 'Closed', 'icon': 'lock'},
  ];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    grievanceData = Map<String, dynamic>.from(widget.grievanceData);
    _fetchTrackingHistory();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  String? _getId() {
    final id = grievanceData["id"];
    if (id is int) return id.toString();
    if (id is String) return id;
    return null;
  }

  int _getStageIndex(String stage) {
    return stages.indexWhere((s) => s['value'] == stage);
  }

  Future<void> _fetchTrackingHistory() async {
    final id = _getId();
    if (id == null) return;

    setState(() => _loadingTracking = true);

    try {
      final res = await HttpService.get("/api/grievances/$id/tracking");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final data = decoded["data"] ?? decoded;
        final List history = data["trackingHistory"] ?? [];

        setState(() {
          trackingHistory = history
              .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
              .toList();
          if (data["grievance"] != null) {
            grievanceData["currentStage"] = data["grievance"]["currentStage"];
            grievanceData["isLocked"] = data["grievance"]["isLocked"];
            grievanceData["status"] = data["grievance"]["status"];
          }
          _loadingTracking = false;
        });
      } else {
        setState(() => _loadingTracking = false);
      }
    } catch (_) {
      setState(() => _loadingTracking = false);
    }
  }

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

  void _deny() {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text("Access denied for role: ${widget.role}")),
    );
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

    if (grievanceData["isLocked"] == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Grievance is locked and cannot be modified.")),
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
        await _fetchTrackingHistory();

        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Status updated")),
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
    if (id == null) return;

    if (grievanceData["isLocked"] == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Grievance is locked.")),
      );
      return;
    }

    setState(() => _updating = true);

    try {
      final res = await HttpService.patch("/api/grievances/$id/verify", {});

      if (res.statusCode == 200) {
        await _fetchTrackingHistory();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Approved / Verified")),
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
            child: const Text("Complete", style: TextStyle(color: Colors.white)),
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
        setState(() {
          grievanceData["isLocked"] = true;
          grievanceData["status"] = "RESOLVED";
          grievanceData["currentStage"] = "CLOSED";
        });
        await _fetchTrackingHistory();

        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Grievance completed and locked")),
        );
      } else {
        String msg = "Failed (${res.statusCode})";
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
        const SnackBar(content: Text("Server error")),
      );
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  void _showAddTrackingSheet({String? preselectedStage}) {
    if (grievanceData["isLocked"] == true) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Grievance is locked.")),
      );
      return;
    }

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => _AddTrackingSheet(
        grievanceId: _getId()!,
        stages: stages,
        currentStage: preselectedStage ?? grievanceData["currentStage"] ?? "RECEIVED",
        onAdded: () async {
          Navigator.pop(context);
          await _fetchTrackingHistory();
        },
      ),
    );
  }

  void _onStageTap(String stageValue) {
    final canEdit = AccessControl.can(widget.role, ActionPermission.edit);
    final isLocked = grievanceData["isLocked"] == true;

    if (!canEdit) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("You don't have permission to update")),
      );
      return;
    }

    if (isLocked) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Grievance is locked")),
      );
      return;
    }

    _showAddTrackingSheet(preselectedStage: stageValue);
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
        title: const Text("Grievance Details", style: TextStyle(fontWeight: FontWeight.w600)),
        backgroundColor: primaryBlue,
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: Colors.white,
          indicatorWeight: 3,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white70,
          labelStyle: const TextStyle(fontWeight: FontWeight.w600),
          tabs: const [
            Tab(text: "Details", icon: Icon(Icons.info_outline, size: 20)),
            Tab(text: "Timeline", icon: Icon(Icons.timeline, size: 20)),
            Tab(text: "History", icon: Icon(Icons.history, size: 20)),
          ],
        ),
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
          : (canEdit || canApprove)
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
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (canEdit) _statusButtons(),
                      if (canApprove) ...[
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Expanded(
                              child: ElevatedButton.icon(
                                onPressed: _updating ? null : _approveGrievance,
                                icon: const Icon(Icons.verified, size: 18),
                                label: const Text("Verify"),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: Colors.blue,
                                  foregroundColor: Colors.white,
                                  padding: const EdgeInsets.symmetric(vertical: 12),
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
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
                          ],
                        ),
                      ],
                    ],
                  ),
                )
              : null,
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildDetailsTab(),
          _buildTimelineTab(),
          _buildHistoryTab(),
        ],
      ),
    );
  }

  // =================== DETAILS TAB ===================
  Widget _buildDetailsTab() {
    final canEdit = AccessControl.can(widget.role, ActionPermission.edit);
    final canApprove = AccessControl.can(widget.role, ActionPermission.approve);

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

  // =================== TIMELINE TAB (Visual Stepper) ===================
  Widget _buildTimelineTab() {
    final currentStage = grievanceData["currentStage"] ?? "RECEIVED";
    final currentIndex = _getStageIndex(currentStage);
    final canEdit = AccessControl.can(widget.role, ActionPermission.edit);
    final isLocked = grievanceData["isLocked"] == true;

    return Column(
      children: [
        // Current Stage Banner
        Container(
          width: double.infinity,
          margin: const EdgeInsets.all(16),
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: isLocked
                  ? [Colors.grey.shade400, Colors.grey.shade500]
                  : [primaryBlue, primaryBlue.withOpacity(0.8)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: (isLocked ? Colors.grey : primaryBlue).withOpacity(0.3),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (isLocked)
                    const Icon(Icons.lock, color: Colors.white, size: 20),
                  if (isLocked) const SizedBox(width: 8),
                  const Text(
                    "Current Stage",
                    style: TextStyle(
                      fontSize: 13,
                      color: Colors.white70,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                _formatStage(currentStage),
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                "Step ${currentIndex + 1} of ${stages.length}",
                style: const TextStyle(
                  fontSize: 12,
                  color: Colors.white70,
                ),
              ),
            ],
          ),
        ),

        // Progress Indicator
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              value: (currentIndex + 1) / stages.length,
              backgroundColor: Colors.grey.shade200,
              valueColor: AlwaysStoppedAnimation<Color>(
                isLocked ? Colors.grey : successGreen,
              ),
              minHeight: 8,
            ),
          ),
        ),

        const SizedBox(height: 8),

        // Hint text for admin
        if (canEdit && !isLocked)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.touch_app, size: 16, color: Colors.grey.shade600),
                const SizedBox(width: 4),
                Text(
                  "Tap any stage to update",
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade600,
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ],
            ),
          ),

        const SizedBox(height: 16),

        // Visual Stage Grid
        Expanded(
          child: GridView.builder(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              childAspectRatio: 1.0,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
            ),
            itemCount: stages.length,
            itemBuilder: (context, index) {
              final stage = stages[index];
              final isCompleted = index <= currentIndex;
              final isCurrent = index == currentIndex;

              return _buildStageCard(
                stage: stage,
                index: index,
                isCompleted: isCompleted,
                isCurrent: isCurrent,
                isLocked: isLocked,
                canEdit: canEdit,
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildStageCard({
    required Map<String, String> stage,
    required int index,
    required bool isCompleted,
    required bool isCurrent,
    required bool isLocked,
    required bool canEdit,
  }) {
    Color bgColor;
    Color borderColor;
    Color iconColor;
    Color textColor;

    if (isCurrent) {
      bgColor = primaryBlue.withOpacity(0.1);
      borderColor = primaryBlue;
      iconColor = primaryBlue;
      textColor = primaryBlue;
    } else if (isCompleted) {
      bgColor = successGreen.withOpacity(0.1);
      borderColor = successGreen;
      iconColor = successGreen;
      textColor = successGreen;
    } else {
      bgColor = Colors.grey.shade50;
      borderColor = Colors.grey.shade300;
      iconColor = Colors.grey.shade400;
      textColor = Colors.grey.shade500;
    }

    return GestureDetector(
      onTap: canEdit && !isLocked ? () => _onStageTap(stage['value']!) : null,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: borderColor,
            width: isCurrent ? 2 : 1,
          ),
          boxShadow: isCurrent
              ? [
                  BoxShadow(
                    color: primaryBlue.withOpacity(0.2),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ]
              : null,
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Step number badge
            Container(
              width: 24,
              height: 24,
              decoration: BoxDecoration(
                color: isCompleted ? successGreen : (isCurrent ? primaryBlue : Colors.grey.shade300),
                shape: BoxShape.circle,
              ),
              child: Center(
                child: isCompleted && !isCurrent
                    ? const Icon(Icons.check, color: Colors.white, size: 14)
                    : Text(
                        "${index + 1}",
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: isCurrent ? Colors.white : Colors.white,
                        ),
                      ),
              ),
            ),
            const SizedBox(height: 8),
            // Icon
            Icon(
              _getStageIcon(stage['icon']!),
              color: iconColor,
              size: 24,
            ),
            const SizedBox(height: 6),
            // Label
            Text(
              stage['label']!,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 11,
                fontWeight: isCurrent ? FontWeight.bold : FontWeight.w500,
                color: textColor,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }

  IconData _getStageIcon(String iconName) {
    switch (iconName) {
      case 'inbox':
        return Icons.inbox;
      case 'search':
        return Icons.search;
      case 'send':
        return Icons.send;
      case 'settings':
        return Icons.settings;
      case 'hourglass':
        return Icons.hourglass_empty;
      case 'mail':
        return Icons.mail;
      case 'description':
        return Icons.description;
      case 'outbox':
        return Icons.outbox;
      case 'repeat':
        return Icons.repeat;
      case 'check_circle':
        return Icons.check_circle;
      case 'lock':
        return Icons.lock;
      default:
        return Icons.circle;
    }
  }

  // =================== HISTORY TAB (Tracking Timeline) ===================
  Widget _buildHistoryTab() {
    final canEdit = AccessControl.can(widget.role, ActionPermission.edit);
    final isLocked = grievanceData["isLocked"] == true;

    return Column(
      children: [
        // Add Tracking Button
        if (canEdit && !isLocked)
          Padding(
            padding: const EdgeInsets.all(16),
            child: SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () => _showAddTrackingSheet(),
                icon: const Icon(Icons.add),
                label: const Text("Add Tracking Update"),
                style: ElevatedButton.styleFrom(
                  backgroundColor: primaryBlue,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),
          ),

        // Timeline
        Expanded(
          child: _loadingTracking
              ? const Center(child: CircularProgressIndicator())
              : trackingHistory.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.history, size: 64, color: Colors.grey.shade300),
                          const SizedBox(height: 16),
                          Text(
                            "No tracking history yet",
                            style: TextStyle(
                              fontSize: 16,
                              color: Colors.grey.shade500,
                            ),
                          ),
                        ],
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      itemCount: trackingHistory.length,
                      itemBuilder: (context, index) {
                        final item = trackingHistory[index];
                        final isFirst = index == 0;
                        final isLast = index == trackingHistory.length - 1;
                        return _buildTimelineItem(item, isFirst, isLast, index);
                      },
                    ),
        ),
      ],
    );
  }

  Widget _buildTimelineItem(Map<String, dynamic> item, bool isFirst, bool isLast, int index) {
    final stage = item["stage"] ?? "UNKNOWN";
    final remarks = item["remarks"] ?? "";
    final department = item["department"] ?? "";
    final officerName = item["officerName"] ?? "";
    final fileLocation = item["fileLocation"] ?? "";
    final createdBy = item["createdBy"];
    final createdByName = createdBy?["name"] ?? "Unknown";
    final createdAt = item["createdAt"];

    String formattedDate = "-";
    if (createdAt != null) {
      try {
        final date = DateTime.parse(createdAt);
        formattedDate = DateFormat('dd MMM yyyy, hh:mm a').format(date);
      } catch (_) {}
    }

    final stageIndex = _getStageIndex(stage);
    final stageColor = isLast ? primaryBlue : successGreen;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Timeline indicator
          SizedBox(
            width: 40,
            child: Column(
              children: [
                // Top line
                if (!isFirst)
                  Container(
                    width: 2,
                    height: 16,
                    color: successGreen.withOpacity(0.5),
                  ),
                // Circle with number
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: stageColor,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: stageColor.withOpacity(0.3),
                        blurRadius: 6,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Center(
                    child: isLast
                        ? const Icon(Icons.flag, color: Colors.white, size: 16)
                        : Text(
                            "${index + 1}",
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                              fontSize: 12,
                            ),
                          ),
                  ),
                ),
                // Bottom line
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 2,
                      color: successGreen.withOpacity(0.5),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),

          // Content Card
          Expanded(
            child: Container(
              margin: EdgeInsets.only(
                bottom: isLast ? 16 : 12,
                top: isFirst ? 0 : 0,
              ),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: isLast ? Border.all(color: primaryBlue, width: 1.5) : null,
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.05),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Stage Badge
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: stageColor.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              _getStageIcon(stages[stageIndex >= 0 ? stageIndex : 0]['icon']!),
                              size: 14,
                              color: stageColor,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              _formatStage(stage),
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: stageColor,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const Spacer(),
                      if (isLast)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: primaryBlue,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Text(
                            "LATEST",
                            style: TextStyle(
                              fontSize: 9,
                              fontWeight: FontWeight.bold,
                              color: Colors.white,
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // Remarks
                  if (remarks.toString().isNotEmpty) ...[
                    Text(
                      remarks.toString(),
                      style: const TextStyle(
                        fontSize: 14,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],

                  // Details Grid
                  if (department.toString().isNotEmpty ||
                      officerName.toString().isNotEmpty ||
                      fileLocation.toString().isNotEmpty)
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.grey.shade50,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(
                        children: [
                          if (department.toString().isNotEmpty)
                            _detailRow(Icons.business, "Department", department.toString()),
                          if (officerName.toString().isNotEmpty)
                            _detailRow(Icons.person, "Officer", officerName.toString()),
                          if (fileLocation.toString().isNotEmpty)
                            _detailRow(Icons.folder, "File Location", fileLocation.toString()),
                        ],
                      ),
                    ),

                  const SizedBox(height: 12),

                  // Footer
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 12,
                        backgroundColor: primaryBlue.withOpacity(0.1),
                        child: Icon(Icons.person, size: 14, color: primaryBlue),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          createdByName,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            color: Colors.grey.shade700,
                          ),
                        ),
                      ),
                      Icon(Icons.access_time, size: 14, color: Colors.grey.shade500),
                      const SizedBox(width: 4),
                      Text(
                        formattedDate,
                        style: TextStyle(
                          fontSize: 11,
                          color: Colors.grey.shade500,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _detailRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: Colors.grey.shade600),
          const SizedBox(width: 8),
          SizedBox(
            width: 80,
            child: Text(
              label,
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey.shade600,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
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

  Widget _statusButtons() {
    return Row(
      children: [
        Expanded(
          child: OutlinedButton(
            onPressed: _updating ? null : () => _updateStatus("Open"),
            style: OutlinedButton.styleFrom(
              side: const BorderSide(color: primaryBlue),
              padding: const EdgeInsets.symmetric(vertical: 12),
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
              side: const BorderSide(color: warningOrange),
              foregroundColor: warningOrange,
              padding: const EdgeInsets.symmetric(vertical: 12),
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
              side: BorderSide(color: Colors.grey.shade400),
              foregroundColor: Colors.grey.shade600,
              padding: const EdgeInsets.symmetric(vertical: 12),
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
                    color: isLocked ? Colors.grey.shade200 : primaryBlue.withOpacity(0.1),
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

// ================= ADD TRACKING SHEET =================

class _AddTrackingSheet extends StatefulWidget {
  final String grievanceId;
  final List<Map<String, String>> stages;
  final String currentStage;
  final Future<void> Function() onAdded;

  const _AddTrackingSheet({
    required this.grievanceId,
    required this.stages,
    required this.currentStage,
    required this.onAdded,
  });

  @override
  State<_AddTrackingSheet> createState() => __AddTrackingSheetState();
}

class __AddTrackingSheetState extends State<_AddTrackingSheet> {
  final _formKey = GlobalKey<FormState>();

  String? selectedStage;
  final remarksController = TextEditingController();
  final departmentController = TextEditingController();
  final officerNameController = TextEditingController();
  final fileLocationController = TextEditingController();

  bool submitting = false;

  @override
  void initState() {
    super.initState();
    selectedStage = widget.currentStage;
  }

  @override
  void dispose() {
    remarksController.dispose();
    departmentController.dispose();
    officerNameController.dispose();
    fileLocationController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => submitting = true);

    try {
      final res = await HttpService.post(
        "/api/grievances/${widget.grievanceId}/tracking",
        {
          "stage": selectedStage,
          "remarks": remarksController.text.trim(),
          "department": departmentController.text.trim(),
          "officerName": officerNameController.text.trim(),
          "fileLocation": fileLocationController.text.trim(),
        },
      );

      if (res.statusCode == 201 || res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Tracking update added")),
        );
        await widget.onAdded();
      } else {
        String msg = "Failed (${res.statusCode})";
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
        const SnackBar(content: Text("Server error")),
      );
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.only(left: 16, right: 16, bottom: bottom + 16, top: 16),
      child: SingleChildScrollView(
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Handle
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Title
              const Center(
                child: Text(
                  "Add Tracking Update",
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ),
              const SizedBox(height: 8),
              Center(
                child: Text(
                  "Update the grievance stage and add details",
                  style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
                ),
              ),
              const SizedBox(height: 24),

              // Stage dropdown
              DropdownButtonFormField<String>(
                value: selectedStage,
                decoration: InputDecoration(
                  labelText: "Stage",
                  prefixIcon: const Icon(Icons.timeline),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  filled: true,
                  fillColor: Colors.grey.shade50,
                ),
                items: widget.stages.map((s) {
                  return DropdownMenuItem(
                    value: s['value'],
                    child: Text(s['label']!),
                  );
                }).toList(),
                onChanged: (v) => setState(() => selectedStage = v),
              ),
              const SizedBox(height: 16),

              // Remarks
              TextFormField(
                controller: remarksController,
                maxLines: 3,
                decoration: InputDecoration(
                  labelText: "Remarks *",
                  prefixIcon: const Padding(
                    padding: EdgeInsets.only(bottom: 48),
                    child: Icon(Icons.notes),
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  filled: true,
                  fillColor: Colors.grey.shade50,
                  hintText: "Describe what action was taken...",
                ),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? "Enter remarks" : null,
              ),
              const SizedBox(height: 16),

              // Department
              TextFormField(
                controller: departmentController,
                decoration: InputDecoration(
                  labelText: "Department (optional)",
                  prefixIcon: const Icon(Icons.business),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  filled: true,
                  fillColor: Colors.grey.shade50,
                ),
              ),
              const SizedBox(height: 16),

              // Officer Name
              TextFormField(
                controller: officerNameController,
                decoration: InputDecoration(
                  labelText: "Officer Name (optional)",
                  prefixIcon: const Icon(Icons.person),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  filled: true,
                  fillColor: Colors.grey.shade50,
                ),
              ),
              const SizedBox(height: 16),

              // File Location
              TextFormField(
                controller: fileLocationController,
                decoration: InputDecoration(
                  labelText: "File Location (optional)",
                  prefixIcon: const Icon(Icons.folder),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  filled: true,
                  fillColor: Colors.grey.shade50,
                  hintText: "e.g., Room 205, Cabinet B",
                ),
              ),
              const SizedBox(height: 24),

              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton.icon(
                  onPressed: submitting ? null : _submit,
                  icon: submitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Icon(Icons.add),
                  label: Text(submitting ? "Adding..." : "Add Update"),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF0A2E5C),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
