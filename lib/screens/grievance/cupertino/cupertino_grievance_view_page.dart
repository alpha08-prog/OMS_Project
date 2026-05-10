import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show LinearProgressIndicator, AlwaysStoppedAnimation;
import 'package:intl/intl.dart';

import '../../../services/http_service.dart';
import '../../../utils/access_control.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../widgets/cupertino/cupertino_form_helpers.dart';
import '../../../widgets/cupertino/cupertino_page_header.dart';

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

  int _selectedSegment = 0;
  Map<String, dynamic> grievanceData = {};

  bool _loading = true;
  bool _updating = false;
  bool _loadingTracking = false;
  List<Map<String, dynamic>> trackingHistory = [];

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
        setState(() {
          grievanceData = Map<String, dynamic>.from(data);
          _loading = false;
        });
        _fetchTrackingHistory();
      } else {
        setState(() => _loading = false);
        if (mounted) {
          CupertinoToast.show(
              context, "Failed to load grievance (${res.statusCode})",
              isError: true);
        }
      }
    } catch (e) {
      setState(() => _loading = false);
      if (mounted) {
        CupertinoToast.show(context, "Server error / No internet",
            isError: true);
      }
    }
  }

  int _getStageIndex(String stage) {
    return stages.indexWhere((s) => s['value'] == stage);
  }

  Future<void> _fetchTrackingHistory() async {
    setState(() => _loadingTracking = true);

    try {
      final res = await HttpService.get(
          "/api/grievances/${widget.grievanceId}/tracking");
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
    CupertinoToast.show(
        context, "Access denied for role: ${widget.role}",
        isError: true);
  }

  Future<void> _updateStatus(String newUiStatus) async {
    final canEdit = AccessControl.can(widget.role, ActionPermission.edit);
    if (!canEdit) return _deny();

    if (grievanceData["isLocked"] == true) {
      CupertinoToast.show(
          context, "Grievance is locked and cannot be modified.",
          isError: true);
      return;
    }

    setState(() => _updating = true);

    try {
      final backendStatus = _toBackendStatus(newUiStatus);

      final res = await HttpService.patch(
        "/api/grievances/${widget.grievanceId}/status",
        {"status": backendStatus},
      );

      if (res.statusCode == 200) {
        setState(() {
          grievanceData["status"] = newUiStatus;
        });
        await _fetchTrackingHistory();

        if (mounted) CupertinoToast.show(context, "Status updated");
      } else {
        String msg = "Failed to update status (${res.statusCode})";
        try {
          final data = jsonDecode(res.body);
          msg = data["message"] ?? msg;
        } catch (_) {}

        if (mounted) CupertinoToast.show(context, msg, isError: true);
      }
    } catch (e) {
      if (mounted) {
        CupertinoToast.show(context, "Server error / No internet",
            isError: true);
      }
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  Future<void> _approveGrievance() async {
    final canApprove =
        AccessControl.can(widget.role, ActionPermission.approve);
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
        await _fetchTrackingHistory();
        if (mounted) CupertinoToast.show(context, "Approved / Verified");
      } else {
        String msg = "Approval failed (${res.statusCode})";
        try {
          final data = jsonDecode(res.body);
          msg = data["message"] ?? msg;
        } catch (_) {}

        if (mounted) CupertinoToast.show(context, msg, isError: true);
      }
    } catch (_) {
      if (mounted) {
        CupertinoToast.show(context, "Server error / No internet",
            isError: true);
      }
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  Future<void> _completeGrievance() async {
    final canApprove =
        AccessControl.can(widget.role, ActionPermission.approve);
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
          children: [
            Icon(CupertinoIcons.lock, color: warningOrange, size: 20),
            const SizedBox(width: 8),
            const Flexible(child: Text("Complete Grievance")),
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
            isDestructiveAction: false,
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
        setState(() {
          grievanceData["isLocked"] = true;
          grievanceData["status"] = "RESOLVED";
          grievanceData["currentStage"] = "CLOSED";
        });
        await _fetchTrackingHistory();

        if (mounted) {
          CupertinoToast.show(context, "Grievance completed and locked");
        }
      } else {
        String msg = "Failed (${res.statusCode})";
        try {
          final data = jsonDecode(res.body);
          msg = data["message"] ?? msg;
        } catch (_) {}

        if (mounted) CupertinoToast.show(context, msg, isError: true);
      }
    } catch (_) {
      if (mounted) {
        CupertinoToast.show(context, "Server error", isError: true);
      }
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  void _showAddTrackingSheet({String? preselectedStage}) {
    if (grievanceData["isLocked"] == true) {
      CupertinoToast.show(context, "Grievance is locked.", isError: true);
      return;
    }

    showCupertinoModalPopup(
      context: context,
      builder: (_) => _CupertinoAddTrackingSheet(
        grievanceId: widget.grievanceId,
        stages: stages,
        currentStage:
            preselectedStage ?? grievanceData["currentStage"] ?? "RECEIVED",
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
      CupertinoToast.show(
          context, "You don't have permission to update",
          isError: true);
      return;
    }

    if (isLocked) {
      CupertinoToast.show(context, "Grievance is locked", isError: true);
      return;
    }

    _showAddTrackingSheet(preselectedStage: stageValue);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return CupertinoPageScaffold(
        backgroundColor: const Color(0xFFF4F6FB),
        child: Column(
          children: [
            OmsPageHeader(title: "Grievance Details"),
            const Expanded(child: Center(child: CupertinoActivityIndicator())),
          ],
        ),
      );
    }

    final canEdit = AccessControl.can(widget.role, ActionPermission.edit);
    final canApprove =
        AccessControl.can(widget.role, ActionPermission.approve);
    final isLocked = grievanceData["isLocked"] == true;

    // Staff: details only — no tabs, no action buttons
    if (widget.role == Roles.staff) {
      return CupertinoPageScaffold(
        backgroundColor: const Color(0xFFF4F6FB),
        child: Column(
          children: [
            OmsPageHeader(title: "Grievance Details"),
            Expanded(child: _buildDetailsTab()),
          ],
        ),
      );
    }

    return CupertinoPageScaffold(
      backgroundColor: const Color(0xFFF4F6FB),
      child: Column(
        children: [
          OmsPageHeader(
            title: "Grievance Details",
            trailing: _updating
                ? const Padding(
                    padding: EdgeInsets.only(right: 8),
                    child: CupertinoActivityIndicator(
                        color: CupertinoColors.white),
                  )
                : null,
          ),
          Expanded(child: Column(
          children: [
            // Segmented Control (replaces TabBar)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: SizedBox(
                width: double.infinity,
                child: CupertinoSlidingSegmentedControl<int>(
                  groupValue: _selectedSegment,
                  thumbColor: primaryBlue,
                  children: {
                    0: Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 6),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(CupertinoIcons.info_circle,
                              size: 16,
                              color: _selectedSegment == 0
                                  ? CupertinoColors.white
                                  : CupertinoColors.label),
                          const SizedBox(width: 4),
                          Text("Details",
                              style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: _selectedSegment == 0
                                      ? CupertinoColors.white
                                      : CupertinoColors.label)),
                        ],
                      ),
                    ),
                    1: Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 6),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(CupertinoIcons.chart_bar_alt_fill,
                              size: 16,
                              color: _selectedSegment == 1
                                  ? CupertinoColors.white
                                  : CupertinoColors.label),
                          const SizedBox(width: 4),
                          Text("Timeline",
                              style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: _selectedSegment == 1
                                      ? CupertinoColors.white
                                      : CupertinoColors.label)),
                        ],
                      ),
                    ),
                    2: Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 6),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(CupertinoIcons.clock,
                              size: 16,
                              color: _selectedSegment == 2
                                  ? CupertinoColors.white
                                  : CupertinoColors.label),
                          const SizedBox(width: 4),
                          Text("History",
                              style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: _selectedSegment == 2
                                      ? CupertinoColors.white
                                      : CupertinoColors.label)),
                        ],
                      ),
                    ),
                  },
                  onValueChanged: (value) {
                    if (value != null) {
                      setState(() => _selectedSegment = value);
                    }
                  },
                ),
              ),
            ),

            // Content
            Expanded(
              child: _selectedSegment == 0
                  ? _buildDetailsTab()
                  : _selectedSegment == 1
                      ? _buildTimelineTab()
                      : _buildHistoryTab(),
            ),

            // Bottom bar
            if (isLocked)
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: CupertinoColors.systemGrey6,
                  border: const Border(
                      top: BorderSide(color: CupertinoColors.systemGrey4)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(CupertinoIcons.lock_fill,
                        color: CupertinoColors.systemGrey),
                    const SizedBox(width: 8),
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
            else if (canEdit || canApprove)
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
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (canEdit) _statusButtons(),
                    if (canApprove) ...[
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: CupertinoButton(
                              padding:
                                  const EdgeInsets.symmetric(vertical: 12),
                              color: CupertinoColors.activeBlue,
                              borderRadius: BorderRadius.circular(12),
                              onPressed:
                                  _updating ? null : _approveGrievance,
                              child: const Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(CupertinoIcons.checkmark_seal,
                                      size: 18,
                                      color: CupertinoColors.white),
                                  SizedBox(width: 6),
                                  Text("Verify",
                                      style: TextStyle(
                                          color: CupertinoColors.white)),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: CupertinoButton(
                              padding:
                                  const EdgeInsets.symmetric(vertical: 12),
                              color: successGreen,
                              borderRadius: BorderRadius.circular(12),
                              onPressed:
                                  _updating ? null : _completeGrievance,
                              child: const Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(CupertinoIcons.checkmark_alt_circle,
                                      size: 18,
                                      color: CupertinoColors.white),
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
                    ],
                  ],
                ),
              ),
          ],
        )),
        ],
      ),
    );
  }

  // =================== DETAILS TAB ===================
  Widget _buildDetailsTab() {
    final canEdit = AccessControl.can(widget.role, ActionPermission.edit);
    final canApprove =
        AccessControl.can(widget.role, ActionPermission.approve);

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
                  Icon(CupertinoIcons.lock,
                      color: CupertinoColors.systemGrey),
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

  // =================== TIMELINE TAB ===================
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
                  ? [
                      CupertinoColors.systemGrey3,
                      CupertinoColors.systemGrey2,
                    ]
                  : [primaryBlue, primaryBlue.withOpacity(0.8)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color:
                    (isLocked ? CupertinoColors.systemGrey : primaryBlue)
                        .withOpacity(0.3),
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
                    const Icon(CupertinoIcons.lock_fill,
                        color: CupertinoColors.white, size: 20),
                  if (isLocked) const SizedBox(width: 8),
                  Text(
                    "Current Stage",
                    style: TextStyle(
                      fontSize: 13,
                      color: CupertinoColors.white.withOpacity(0.7),
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
                  color: CupertinoColors.white,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                "Step ${currentIndex + 1} of ${stages.length}",
                style: TextStyle(
                  fontSize: 12,
                  color: CupertinoColors.white.withOpacity(0.7),
                ),
              ),
            ],
          ),
        ),

        // Progress bar
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: SizedBox(
              height: 8,
              child: LinearProgressIndicator(
                value: (currentIndex + 1) / stages.length,
                backgroundColor: CupertinoColors.systemGrey5,
                valueColor: AlwaysStoppedAnimation<Color>(
                  isLocked ? CupertinoColors.systemGrey : successGreen,
                ),
              ),
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
                Icon(CupertinoIcons.hand_draw,
                    size: 16, color: CupertinoColors.systemGrey),
                const SizedBox(width: 4),
                Text(
                  "Tap any stage to update",
                  style: TextStyle(
                    fontSize: 12,
                    color: CupertinoColors.systemGrey,
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
      bgColor = CupertinoColors.systemGrey6;
      borderColor = CupertinoColors.systemGrey4;
      iconColor = CupertinoColors.systemGrey3;
      textColor = CupertinoColors.systemGrey2;
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
                color: isCompleted
                    ? successGreen
                    : (isCurrent
                        ? primaryBlue
                        : CupertinoColors.systemGrey4),
                shape: BoxShape.circle,
              ),
              child: Center(
                child: isCompleted && !isCurrent
                    ? const Icon(CupertinoIcons.checkmark,
                        color: CupertinoColors.white, size: 14)
                    : Text(
                        "${index + 1}",
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color: CupertinoColors.white,
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
        return CupertinoIcons.tray_arrow_down;
      case 'search':
        return CupertinoIcons.search;
      case 'send':
        return CupertinoIcons.paperplane;
      case 'settings':
        return CupertinoIcons.gear;
      case 'hourglass':
        return CupertinoIcons.hourglass;
      case 'mail':
        return CupertinoIcons.mail;
      case 'description':
        return CupertinoIcons.doc_text;
      case 'outbox':
        return CupertinoIcons.tray_arrow_up;
      case 'repeat':
        return CupertinoIcons.repeat;
      case 'check_circle':
        return CupertinoIcons.checkmark_circle;
      case 'lock':
        return CupertinoIcons.lock;
      default:
        return CupertinoIcons.circle;
    }
  }

  // =================== HISTORY TAB ===================
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
              child: CupertinoButton(
                color: primaryBlue,
                borderRadius: BorderRadius.circular(12),
                padding: const EdgeInsets.symmetric(vertical: 14),
                onPressed: () => _showAddTrackingSheet(),
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(CupertinoIcons.add,
                        size: 18, color: CupertinoColors.white),
                    SizedBox(width: 6),
                    Text("Add Tracking Update",
                        style: TextStyle(color: CupertinoColors.white)),
                  ],
                ),
              ),
            ),
          ),

        // Timeline
        Expanded(
          child: _loadingTracking
              ? const Center(child: CupertinoActivityIndicator())
              : trackingHistory.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(CupertinoIcons.clock,
                              size: 64,
                              color: CupertinoColors.systemGrey4),
                          const SizedBox(height: 16),
                          Text(
                            "No tracking history yet",
                            style: TextStyle(
                              fontSize: 16,
                              color: CupertinoColors.systemGrey2,
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
                        final isLast =
                            index == trackingHistory.length - 1;
                        return _buildTimelineItem(
                            item, isFirst, isLast, index);
                      },
                    ),
        ),
      ],
    );
  }

  Widget _buildTimelineItem(
      Map<String, dynamic> item, bool isFirst, bool isLast, int index) {
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
                        ? const Icon(CupertinoIcons.flag_fill,
                            color: CupertinoColors.white, size: 16)
                        : Text(
                            "${index + 1}",
                            style: const TextStyle(
                              color: CupertinoColors.white,
                              fontWeight: FontWeight.bold,
                              fontSize: 12,
                            ),
                          ),
                  ),
                ),
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
              ),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: CupertinoColors.white,
                borderRadius: BorderRadius.circular(12),
                border: isLast
                    ? Border.all(color: primaryBlue, width: 1.5)
                    : null,
                boxShadow: [
                  BoxShadow(
                    color: CupertinoColors.black.withOpacity(0.05),
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
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: stageColor.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              _getStageIcon(stages[
                                      stageIndex >= 0 ? stageIndex : 0]
                                  ['icon']!),
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
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: primaryBlue,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Text(
                            "LATEST",
                            style: TextStyle(
                              fontSize: 9,
                              fontWeight: FontWeight.bold,
                              color: CupertinoColors.white,
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
                        color: CupertinoColors.systemGrey6,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(
                        children: [
                          if (department.toString().isNotEmpty)
                            _detailRow(CupertinoIcons.building_2_fill,
                                "Department", department.toString()),
                          if (officerName.toString().isNotEmpty)
                            _detailRow(CupertinoIcons.person,
                                "Officer", officerName.toString()),
                          if (fileLocation.toString().isNotEmpty)
                            _detailRow(CupertinoIcons.folder,
                                "File Location", fileLocation.toString()),
                        ],
                      ),
                    ),

                  const SizedBox(height: 12),

                  // Footer
                  Row(
                    children: [
                      Container(
                        width: 24,
                        height: 24,
                        decoration: BoxDecoration(
                          color: primaryBlue.withOpacity(0.1),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(CupertinoIcons.person,
                            size: 14, color: primaryBlue),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          createdByName,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            color: CupertinoColors.systemGrey,
                          ),
                        ),
                      ),
                      Icon(CupertinoIcons.clock,
                          size: 14,
                          color: CupertinoColors.systemGrey2),
                      const SizedBox(width: 4),
                      Text(
                        formattedDate,
                        style: TextStyle(
                          fontSize: 11,
                          color: CupertinoColors.systemGrey2,
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
          Icon(icon, size: 16, color: CupertinoColors.systemGrey),
          const SizedBox(width: 8),
          SizedBox(
            width: 80,
            child: Text(
              label,
              style: const TextStyle(
                fontSize: 12,
                color: CupertinoColors.systemGrey,
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
          child: CupertinoButton(
            padding: const EdgeInsets.symmetric(vertical: 12),
            borderRadius: BorderRadius.circular(12),
            color: CupertinoColors.white,
            onPressed: _updating ? null : () => _updateStatus("Open"),
            child: Text("Open",
                style: TextStyle(color: primaryBlue, fontSize: 14)),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: CupertinoButton(
            padding: const EdgeInsets.symmetric(vertical: 12),
            borderRadius: BorderRadius.circular(12),
            color: CupertinoColors.white,
            onPressed:
                _updating ? null : () => _updateStatus("In Progress"),
            child: Text("In Progress",
                style: TextStyle(color: warningOrange, fontSize: 14)),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: CupertinoButton(
            padding: const EdgeInsets.symmetric(vertical: 12),
            borderRadius: BorderRadius.circular(12),
            color: CupertinoColors.white,
            onPressed: _updating ? null : () => _updateStatus("Closed"),
            child: Text("Closed",
                style: TextStyle(
                    color: CupertinoColors.systemGrey, fontSize: 14)),
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

    Color bg = CupertinoColors.systemGrey5;
    Color text = CupertinoColors.systemGrey;

    if (status == "Open" || status == "OPEN") {
      bg = const Color(0xFFECFDF5);
      text = const Color(0xFF10B981);
    } else if (status == "In Progress" || status == "IN_PROGRESS") {
      bg = const Color(0xFFFFF7ED);
      text = const Color(0xFFF59E0B);
    } else if (status == "Closed" || status == "RESOLVED") {
      bg = CupertinoColors.systemGrey4;
      text = CupertinoColors.systemGrey;
    } else if (status == "VERIFIED") {
      bg = const Color(0xFFEFF6FF);
      text = CupertinoColors.activeBlue;
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
                        ? CupertinoColors.systemGrey5
                        : primaryBlue.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (isLocked) ...[
                        const Icon(CupertinoIcons.lock,
                            size: 14,
                            color: CupertinoColors.systemGrey),
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
              style: const TextStyle(
                  fontSize: 12, color: CupertinoColors.systemGrey),
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
                style: const TextStyle(
                    fontSize: 12, color: CupertinoColors.systemGrey)),
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

class _CupertinoAddTrackingSheet extends StatefulWidget {
  final String grievanceId;
  final List<Map<String, String>> stages;
  final String currentStage;
  final Future<void> Function() onAdded;

  const _CupertinoAddTrackingSheet({
    required this.grievanceId,
    required this.stages,
    required this.currentStage,
    required this.onAdded,
  });

  @override
  State<_CupertinoAddTrackingSheet> createState() =>
      _CupertinoAddTrackingSheetState();
}

class _CupertinoAddTrackingSheetState
    extends State<_CupertinoAddTrackingSheet> {
  String? selectedStage;
  final remarksController = TextEditingController();
  final departmentController = TextEditingController();
  final officerNameController = TextEditingController();
  final fileLocationController = TextEditingController();

  bool submitting = false;
  String? _remarksError;

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

  String _getLabelForStage(String? stageValue) {
    if (stageValue == null) return "";
    final match = widget.stages.firstWhere(
      (s) => s['value'] == stageValue,
      orElse: () => {'label': stageValue},
    );
    return match['label'] ?? stageValue;
  }

  Future<void> _submit() async {
    if (remarksController.text.trim().isEmpty) {
      setState(() => _remarksError = "Enter remarks");
      return;
    }
    setState(() => _remarksError = null);

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
        if (mounted) {
          CupertinoToast.show(context, "Tracking update added");
        }
        await widget.onAdded();
      } else {
        String msg = "Failed (${res.statusCode})";
        try {
          final data = jsonDecode(res.body);
          msg = data["message"] ?? msg;
        } catch (_) {}

        if (mounted) CupertinoToast.show(context, msg, isError: true);
      }
    } catch (_) {
      if (mounted) {
        CupertinoToast.show(context, "Server error", isError: true);
      }
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      padding:
          EdgeInsets.only(left: 16, right: 16, bottom: bottom + 16, top: 16),
      decoration: const BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SingleChildScrollView(
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
                  color: CupertinoColors.systemGrey4,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Title
            const Center(
              child: Text(
                "Add Tracking Update",
                style:
                    TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(height: 8),
            Center(
              child: Text(
                "Update the grievance stage and add details",
                style: TextStyle(
                    fontSize: 13, color: CupertinoColors.systemGrey),
              ),
            ),
            const SizedBox(height: 24),

            // Stage picker
            GestureDetector(
              onTap: () {
                CupertinoFormHelpers.showPicker(
                  context: context,
                  items: widget.stages
                      .map((s) => s['label']!)
                      .toList(),
                  currentValue: _getLabelForStage(selectedStage),
                  title: "Stage",
                  onSelected: (label) {
                    final match = widget.stages.firstWhere(
                      (s) => s['label'] == label,
                      orElse: () => {'value': 'RECEIVED'},
                    );
                    setState(() => selectedStage = match['value']);
                  },
                );
              },
              child: Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 12, vertical: 14),
                decoration: BoxDecoration(
                  color: CupertinoColors.systemGrey6,
                  borderRadius: BorderRadius.circular(12),
                  border:
                      Border.all(color: CupertinoColors.systemGrey4),
                ),
                child: Row(
                  children: [
                    const Icon(CupertinoIcons.chart_bar_alt_fill,
                        color: CupertinoColors.systemGrey, size: 20),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text("Stage",
                              style: TextStyle(
                                  fontSize: 11,
                                  color: CupertinoColors.systemGrey)),
                          const SizedBox(height: 2),
                          Text(
                            _getLabelForStage(selectedStage),
                            style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w500),
                          ),
                        ],
                      ),
                    ),
                    const Icon(CupertinoIcons.chevron_down,
                        size: 16,
                        color: CupertinoColors.systemGrey),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Remarks
            CupertinoTextField(
              controller: remarksController,
              maxLines: 3,
              placeholder: "Remarks *",
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(
                color: CupertinoColors.systemGrey6,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: _remarksError != null
                      ? CupertinoColors.destructiveRed
                      : CupertinoColors.systemGrey4,
                ),
              ),
            ),
            if (_remarksError != null)
              Padding(
                padding: const EdgeInsets.only(top: 4, left: 4),
                child: Text(
                  _remarksError!,
                  style: const TextStyle(
                    fontSize: 12,
                    color: CupertinoColors.destructiveRed,
                  ),
                ),
              ),
            const SizedBox(height: 16),

            // Department
            CupertinoTextField(
              controller: departmentController,
              placeholder: "Department (optional)",
              prefix: const Padding(
                padding: EdgeInsets.only(left: 12),
                child: Icon(CupertinoIcons.building_2_fill,
                    color: CupertinoColors.systemGrey, size: 20),
              ),
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(
                color: CupertinoColors.systemGrey6,
                borderRadius: BorderRadius.circular(12),
                border:
                    Border.all(color: CupertinoColors.systemGrey4),
              ),
            ),
            const SizedBox(height: 16),

            // Officer Name
            CupertinoTextField(
              controller: officerNameController,
              placeholder: "Officer Name (optional)",
              prefix: const Padding(
                padding: EdgeInsets.only(left: 12),
                child: Icon(CupertinoIcons.person,
                    color: CupertinoColors.systemGrey, size: 20),
              ),
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(
                color: CupertinoColors.systemGrey6,
                borderRadius: BorderRadius.circular(12),
                border:
                    Border.all(color: CupertinoColors.systemGrey4),
              ),
            ),
            const SizedBox(height: 16),

            // File Location
            CupertinoTextField(
              controller: fileLocationController,
              placeholder: "File Location (optional)",
              prefix: const Padding(
                padding: EdgeInsets.only(left: 12),
                child: Icon(CupertinoIcons.folder,
                    color: CupertinoColors.systemGrey, size: 20),
              ),
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              decoration: BoxDecoration(
                color: CupertinoColors.systemGrey6,
                borderRadius: BorderRadius.circular(12),
                border:
                    Border.all(color: CupertinoColors.systemGrey4),
              ),
            ),
            const SizedBox(height: 24),

            SizedBox(
              width: double.infinity,
              child: CupertinoButton.filled(
                borderRadius: BorderRadius.circular(12),
                onPressed: submitting ? null : _submit,
                child: submitting
                    ? const CupertinoActivityIndicator(
                        color: CupertinoColors.white)
                    : const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(CupertinoIcons.add,
                              size: 18, color: CupertinoColors.white),
                          SizedBox(width: 6),
                          Text("Add Update",
                              style: TextStyle(
                                  color: CupertinoColors.white)),
                        ],
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
