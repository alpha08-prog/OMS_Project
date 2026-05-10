import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';

import '../../../services/http_service.dart';
import '../../../utils/access_control.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../widgets/cupertino/cupertino_styled_card.dart';
import '../../../widgets/cupertino/cupertino_date_range_filter.dart';
import '../../../widgets/date_range_filter.dart' show dateInRange;
import 'cupertino_tour_program_create_page.dart';

class CupertinoTourProgramListPage extends StatefulWidget {
  final String role;
  const CupertinoTourProgramListPage({super.key, required this.role});

  @override
  State<CupertinoTourProgramListPage> createState() =>
      _CupertinoTourProgramListPageState();
}

class _CupertinoTourProgramListPageState
    extends State<CupertinoTourProgramListPage> {
  static const Color primaryBlue = Color(0xFF0A2E5C);
  static const Color bgLight = Color(0xFFF4F6FB);
  static const Color accentGreen = Color(0xFF10B981);
  static const Color accentOrange = Color(0xFFF59E0B);
  static const Color accentRed = Color(0xFFEF4444);

  // Segmented control value
  String _selectedTab = "All";

  bool loadingAll = true;
  bool loadingToday = true;
  bool loadingUpcoming = true;

  List<Map<String, dynamic>> allList = [];
  List<Map<String, dynamic>> todayList = [];
  List<Map<String, dynamic>> upcomingList = [];

  DateTime? _dateFrom;
  DateTime? _dateTo;

  List<Map<String, dynamic>> _applyDate(List<Map<String, dynamic>> list) {
    if (_dateFrom == null && _dateTo == null) return list;
    return list.where((e) {
      final raw = (e['dateTime'] ?? e['createdAt'])?.toString();
      final dt = DateTime.tryParse(raw ?? '');
      return dateInRange(dt, from: _dateFrom, to: _dateTo);
    }).toList();
  }

  // Stats
  int totalPrograms = 0;
  int pendingCount = 0;
  int approvedCount = 0;
  int rejectedCount = 0;

  @override
  void initState() {
    super.initState();
    _loadAll();
  }

  Future<void> _loadAll() async {
    await Future.wait([
      _fetchAll(),
      _fetchToday(),
      _fetchUpcoming(),
    ]);
    _calculateStats();
  }

  void _calculateStats() {
    setState(() {
      totalPrograms = allList.length;
      pendingCount = allList
          .where((e) =>
              (e["decision"] ?? "PENDING").toString().toUpperCase() ==
              "PENDING")
          .length;
      approvedCount = allList
          .where((e) =>
              (e["decision"] ?? "").toString().toUpperCase() == "ACCEPTED")
          .length;
      rejectedCount = allList
          .where((e) =>
              (e["decision"] ?? "").toString().toUpperCase() == "REGRET")
          .length;
    });
  }

  Future<void> _fetchAll() async {
    setState(() => loadingAll = true);
    try {
      final res = await HttpService.get("/api/tour-programs");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list =
            decoded is List ? decoded : (decoded["data"] ?? []);
        setState(() {
          allList = list
              .map<Map<String, dynamic>>(
                  (e) => Map<String, dynamic>.from(e))
              .toList();
          loadingAll = false;
        });
      } else {
        setState(() => loadingAll = false);
      }
    } catch (_) {
      setState(() => loadingAll = false);
    }
  }

  Future<void> _fetchToday() async {
    setState(() => loadingToday = true);
    try {
      final res =
          await HttpService.get("/api/tour-programs/schedule/today");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list =
            decoded is List ? decoded : (decoded["data"] ?? []);
        setState(() {
          todayList = list
              .map<Map<String, dynamic>>(
                  (e) => Map<String, dynamic>.from(e))
              .toList();
          loadingToday = false;
        });
      } else {
        setState(() => loadingToday = false);
      }
    } catch (_) {
      setState(() => loadingToday = false);
    }
  }

  Future<void> _fetchUpcoming() async {
    setState(() => loadingUpcoming = true);
    try {
      final res = await HttpService.get("/api/tour-programs/upcoming");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list =
            decoded is List ? decoded : (decoded["data"] ?? []);
        setState(() {
          upcomingList = list
              .map<Map<String, dynamic>>(
                  (e) => Map<String, dynamic>.from(e))
              .toList();
          loadingUpcoming = false;
        });
      } else {
        setState(() => loadingUpcoming = false);
      }
    } catch (_) {
      setState(() => loadingUpcoming = false);
    }
  }

  void _openCreateSheet() async {
    final canCreate =
        AccessControl.can(widget.role, ActionPermission.create);

    if (!canCreate) {
      CupertinoToast.show(context, "You have view-only access.",
          isError: true);
      return;
    }

    final result = await Navigator.push(
      context,
      CupertinoPageRoute(
        builder: (_) => CupertinoTourProgramCreatePage(
          role: widget.role,
          onCreated: () => _fetchAll(),
        ),
      ),
    );
    if (result == true) _fetchAll();
  }

  String? _getId(Map<String, dynamic> item) {
    final id = item["id"];
    if (id is int) return id.toString();
    if (id is String) return id;
    return null;
  }

  Future<void> _updateDecision(String id, String decision) async {
    if (widget.role != Roles.admin &&
        widget.role != Roles.superAdmin) {
      CupertinoToast.show(
          context, "Only ADMIN can update decision.",
          isError: true);
      return;
    }

    try {
      final res = await HttpService.patch(
        "/api/tour-programs/$id/decision",
        {"decision": decision},
      );

      if (res.statusCode == 200) {
        CupertinoToast.show(
            context, decision == "ACCEPTED" ? "Accepted" : "Regret");
        _loadAll();
      } else {
        CupertinoToast.show(
            context, "Failed (${res.statusCode})",
            isError: true);
      }
    } catch (_) {
      CupertinoToast.show(context, "Server error / No internet",
          isError: true);
    }
  }

  Future<void> _deleteProgram(String id) async {
    if (widget.role != Roles.admin &&
        widget.role != Roles.superAdmin) {
      CupertinoToast.show(context, "Only ADMIN can delete.",
          isError: true);
      return;
    }

    final confirm = await showCupertinoDialog<bool>(
      context: context,
      builder: (_) => CupertinoAlertDialog(
        title: const Text("Delete Tour Program"),
        content:
            const Text("Are you sure you want to delete this program?"),
        actions: [
          CupertinoDialogAction(
            isDefaultAction: true,
            onPressed: () => Navigator.pop(context, false),
            child: const Text("Cancel"),
          ),
          CupertinoDialogAction(
            isDestructiveAction: true,
            onPressed: () => Navigator.pop(context, true),
            child: const Text("Delete"),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    try {
      final res = await HttpService.delete("/api/tour-programs/$id");
      if (res.statusCode == 200) {
        CupertinoToast.show(context, "Deleted");
        _loadAll();
      } else {
        CupertinoToast.show(
            context, "Delete failed (${res.statusCode})",
            isError: true);
      }
    } catch (_) {
      CupertinoToast.show(context, "Server error / No internet",
          isError: true);
    }
  }

  void _showDetailSheet(Map<String, dynamic> item) {
    final id = item["id"]?.toString();
    final title = item["eventName"] ?? "Tour Program";
    final location = item["venue"] ?? "-";
    final dateStr = item["dateTime"] ?? "";
    final status =
        (item["decision"] ?? "PENDING").toString().toUpperCase();
    final chiefGuest = item["chiefGuest"] ?? "";
    final contactPhone = item["contactPhone"] ?? "";
    final expectedFootfall = item["expectedFootfall"];
    final description = item["description"] ?? "";
    final organizer = item["organizer"] ?? "";
    final venueLink = item["venueLink"] ?? "";
    final referencedBy = item["referencedBy"] ?? "";
    final decisionNote = item["decisionNote"] ?? "";
    final createdAt = item["createdAt"] ?? "";

    String formattedDate = dateStr;
    try {
      if (dateStr.isNotEmpty) {
        final parsed = DateTime.parse(dateStr);
        formattedDate =
            DateFormat("EEEE, MMMM d, yyyy 'at' h:mm a").format(parsed);
      }
    } catch (_) {}

    String formattedCreatedAt = "";
    try {
      if (createdAt.isNotEmpty) {
        final parsed = DateTime.parse(createdAt);
        formattedCreatedAt =
            DateFormat('MMM d, yyyy h:mm a').format(parsed);
      }
    } catch (_) {}

    final isAdmin = widget.role == Roles.admin ||
        widget.role == Roles.superAdmin;

    showCupertinoModalPopup(
      context: context,
      builder: (ctx) => Container(
        height: MediaQuery.of(context).size.height * 0.8,
        decoration: const BoxDecoration(
          color: CupertinoColors.systemBackground,
          borderRadius:
              BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
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
              const SizedBox(height: 20),

              // Title and Status
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: primaryBlue.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(CupertinoIcons.calendar,
                        color: primaryBlue, size: 28),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title.toString(),
                            style: const TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.bold)),
                        const SizedBox(height: 8),
                        _statusChip(status),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Details
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: CupertinoColors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                      color: CupertinoColors.systemGrey5),
                ),
                child: Column(
                  children: [
                    _detailRow(CupertinoIcons.calendar,
                        "Date & Time", formattedDate),
                    const SizedBox(height: 12),
                    _detailRow(CupertinoIcons.location,
                        "Venue", location.toString()),
                    if (venueLink.toString().isNotEmpty) ...[
                      const SizedBox(height: 12),
                      _detailRow(CupertinoIcons.link,
                          "Venue Link", venueLink.toString()),
                    ],
                    if (organizer.toString().isNotEmpty) ...[
                      const SizedBox(height: 12),
                      _detailRow(CupertinoIcons.building_2_fill,
                          "Organizer", organizer.toString()),
                    ],
                    if (chiefGuest.toString().isNotEmpty) ...[
                      const SizedBox(height: 12),
                      _detailRow(CupertinoIcons.person,
                          "Chief Guest", chiefGuest.toString()),
                    ],
                    if (contactPhone.toString().isNotEmpty) ...[
                      const SizedBox(height: 12),
                      _detailRow(CupertinoIcons.phone,
                          "Contact", contactPhone.toString()),
                    ],
                    if (expectedFootfall != null) ...[
                      const SizedBox(height: 12),
                      _detailRow(CupertinoIcons.person_3,
                          "Expected Footfall",
                          "$expectedFootfall people"),
                    ],
                    if (referencedBy.toString().isNotEmpty) ...[
                      const SizedBox(height: 12),
                      _detailRow(CupertinoIcons.person_circle,
                          "Referenced By",
                          referencedBy.toString()),
                    ],
                  ],
                ),
              ),

              // Description
              if (description.toString().isNotEmpty) ...[
                const SizedBox(height: 16),
                const Text("Description",
                    style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: CupertinoColors.systemGrey)),
                const SizedBox(height: 8),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: CupertinoColors.systemGrey6,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(description.toString(),
                      style: const TextStyle(fontSize: 14)),
                ),
              ],

              // Decision Note
              if (decisionNote.toString().isNotEmpty) ...[
                const SizedBox(height: 16),
                const Text("Decision Note",
                    style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: CupertinoColors.systemGrey)),
                const SizedBox(height: 8),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF8E1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(decisionNote.toString(),
                      style: const TextStyle(fontSize: 14)),
                ),
              ],

              // Created At
              if (formattedCreatedAt.isNotEmpty) ...[
                const SizedBox(height: 16),
                Center(
                  child: Text("Created: $formattedCreatedAt",
                      style: TextStyle(
                          fontSize: 12,
                          color: CupertinoColors.systemGrey)),
                ),
              ],

              // Admin Actions
              if (isAdmin && id != null) ...[
                const SizedBox(height: 20),
                Container(
                    height: 1,
                    color: CupertinoColors.systemGrey5),
                const SizedBox(height: 12),
                const Text("Actions",
                    style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: CupertinoColors.systemGrey)),
                const SizedBox(height: 12),
                if (status == "PENDING") ...[
                  Row(
                    children: [
                      Expanded(
                        child: CupertinoButton(
                          padding: const EdgeInsets.symmetric(
                              vertical: 14),
                          color: CupertinoColors.white,
                          borderRadius: BorderRadius.circular(12),
                          onPressed: () {
                            Navigator.pop(ctx);
                            _updateDecision(id, "REGRET");
                          },
                          child: Row(
                            mainAxisAlignment:
                                MainAxisAlignment.center,
                            children: [
                              Icon(CupertinoIcons.xmark,
                                  color: accentRed, size: 18),
                              const SizedBox(width: 6),
                              Text("Regret",
                                  style: TextStyle(
                                      color: accentRed)),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: CupertinoButton(
                          padding: const EdgeInsets.symmetric(
                              vertical: 14),
                          color: accentGreen,
                          borderRadius: BorderRadius.circular(12),
                          onPressed: () {
                            Navigator.pop(ctx);
                            _updateDecision(id, "ACCEPTED");
                          },
                          child: const Row(
                            mainAxisAlignment:
                                MainAxisAlignment.center,
                            children: [
                              Icon(CupertinoIcons.check_mark,
                                  color: CupertinoColors.white,
                                  size: 18),
                              SizedBox(width: 6),
                              Text("Accept",
                                  style: TextStyle(
                                      color:
                                          CupertinoColors.white)),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                ],
                SizedBox(
                  width: double.infinity,
                  child: CupertinoButton(
                    padding:
                        const EdgeInsets.symmetric(vertical: 14),
                    color: CupertinoColors.white,
                    borderRadius: BorderRadius.circular(12),
                    onPressed: () {
                      Navigator.pop(ctx);
                      _deleteProgram(id);
                    },
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(CupertinoIcons.delete,
                            color: accentRed, size: 18),
                        const SizedBox(width: 6),
                        Text("Delete Program",
                            style: TextStyle(color: accentRed)),
                      ],
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }

  Widget _detailRow(IconData icon, String label, String value) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: CupertinoColors.systemGrey),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label,
                  style: TextStyle(
                      fontSize: 12,
                      color: CupertinoColors.systemGrey)),
              const SizedBox(height: 2),
              Text(value,
                  style: const TextStyle(
                      fontSize: 15, fontWeight: FontWeight.w500)),
            ],
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final canCreate =
        AccessControl.can(widget.role, ActionPermission.create);

    return CupertinoPageScaffold(
      backgroundColor: bgLight,
      navigationBar: CupertinoNavigationBar(
        middle: const Text("Tour Programs"),
        backgroundColor: primaryBlue,
        brightness: Brightness.dark,
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (canCreate)
              CupertinoButton(
                padding: EdgeInsets.zero,
                onPressed: _openCreateSheet,
                child: const Icon(CupertinoIcons.add,
                    color: CupertinoColors.white),
              ),
            CupertinoButton(
              padding: EdgeInsets.zero,
              onPressed: _loadAll,
              child: const Icon(CupertinoIcons.refresh,
                  color: CupertinoColors.white),
            ),
          ],
        ),
      ),
      child: SafeArea(
        child: Column(
          children: [
            // Stats Row
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: primaryBlue,
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _miniStat("Total",
                          totalPrograms.toString(), CupertinoColors.white),
                      _miniStat("Pending", pendingCount.toString(),
                          accentOrange),
                      _miniStat("Approved",
                          approvedCount.toString(), accentGreen),
                      _miniStat("Rejected",
                          rejectedCount.toString(), accentRed),
                    ],
                  ),
                  if (widget.role != Roles.superAdmin) ...[
                    const SizedBox(height: 12),
                    // Segmented Control replacing TabBar
                    SizedBox(
                      width: double.infinity,
                      child: CupertinoSlidingSegmentedControl<String>(
                        groupValue: _selectedTab,
                        backgroundColor:
                            CupertinoColors.white.withOpacity(0.2),
                        thumbColor: CupertinoColors.white,
                        children: {
                          "All": Padding(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 4, vertical: 6),
                            child: Text("All (${allList.length})",
                                style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: _selectedTab == "All"
                                        ? primaryBlue
                                        : CupertinoColors.white)),
                          ),
                          "Today": Padding(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 4, vertical: 6),
                            child: Text(
                                "Today (${todayList.length})",
                                style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: _selectedTab == "Today"
                                        ? primaryBlue
                                        : CupertinoColors.white)),
                          ),
                          "Upcoming": Padding(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 4, vertical: 6),
                            child: Text(
                                "Upcoming (${upcomingList.length})",
                                style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w600,
                                    color: _selectedTab == "Upcoming"
                                        ? primaryBlue
                                        : CupertinoColors.white)),
                          ),
                        },
                        onValueChanged: (value) {
                          if (value != null) {
                            setState(() => _selectedTab = value);
                          }
                        },
                      ),
                    ),
                  ],
                ],
              ),
            ),

            CupertinoDateRangeFilter(
              from: _dateFrom,
              to: _dateTo,
              tint: primaryBlue,
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
              onFromChanged: (d) => setState(() => _dateFrom = d),
              onToChanged: (d) => setState(() => _dateTo = d),
              onClear: () => setState(() {
                _dateFrom = null;
                _dateTo = null;
              }),
            ),

            // List
            Expanded(
              child: widget.role == Roles.superAdmin
                  ? _categoriesView()
                  : _buildListForTab(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildListForTab() {
    switch (_selectedTab) {
      case "Today":
        return _listView(loadingToday, _applyDate(todayList));
      case "Upcoming":
        return _listView(loadingUpcoming, _applyDate(upcomingList));
      default:
        return _listView(loadingAll, _applyDate(allList));
    }
  }

  Widget _categoriesView() {
    if (loadingToday && loadingUpcoming) {
      return const Center(child: CupertinoActivityIndicator());
    }

    final today = _applyDate(todayList);
    final upcoming = _applyDate(upcomingList);

    if (today.isEmpty && upcoming.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(CupertinoIcons.calendar_badge_minus,
                size: 64, color: CupertinoColors.systemGrey3),
            const SizedBox(height: 16),
            const Text("No today's or upcoming programs",
                style: TextStyle(
                    fontSize: 16, color: CupertinoColors.systemGrey)),
          ],
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(0, 8, 0, 16),
      children: [
        _categorySectionHeader(
          icon: CupertinoIcons.sun_max_fill,
          color: accentOrange,
          title: "Today's Programs",
          count: today.length,
        ),
        if (today.isEmpty)
          _emptyCategoryRow("No programs scheduled for today")
        else
          ...today.map((e) => Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: _programCard(e),
              )),
        const SizedBox(height: 8),
        _categorySectionHeader(
          icon: CupertinoIcons.calendar,
          color: primaryBlue,
          title: "Upcoming Programs",
          count: upcoming.length,
        ),
        if (upcoming.isEmpty)
          _emptyCategoryRow("No upcoming programs")
        else
          ...upcoming.map((e) => Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: _programCard(e),
              )),
      ],
    );
  }

  Widget _categorySectionHeader({
    required IconData icon,
    required Color color,
    required String title,
    required int count,
  }) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Row(
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 8),
          Text(
            title,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.bold,
              color: AppTheme.foreground,
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: color.withOpacity(0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              "$count",
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _emptyCategoryRow(String text) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        decoration: BoxDecoration(
          color: bgLight,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(
          text,
          style: const TextStyle(
            fontSize: 13,
            color: CupertinoColors.systemGrey,
          ),
        ),
      ),
    );
  }

  Widget _miniStat(String label, String value, Color color) {
    return Column(
      children: [
        Text(value,
            style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color: color)),
        Text(label,
            style: TextStyle(
                fontSize: 11,
                color: CupertinoColors.white.withOpacity(0.8))),
      ],
    );
  }

  Widget _listView(
      bool loading, List<Map<String, dynamic>> list) {
    if (loading) {
      return const Center(child: CupertinoActivityIndicator());
    }

    if (list.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(CupertinoIcons.calendar_badge_minus,
                size: 64, color: CupertinoColors.systemGrey3),
            const SizedBox(height: 16),
            Text("No programs found",
                style: TextStyle(
                    fontSize: 16,
                    color: CupertinoColors.systemGrey)),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: list.length,
      itemBuilder: (context, index) {
        final item = list[index];
        return _programCard(item);
      },
    );
  }

  Widget _programCard(Map<String, dynamic> item) {
    final id = _getId(item);
    final title = item["eventName"] ?? "Tour Program";
    final location = item["venue"] ?? "-";
    final dateStr = item["dateTime"] ?? "";
    final status =
        (item["decision"] ?? "PENDING").toString().toUpperCase();
    final chiefGuest = item["chiefGuest"] ?? "";
    final expectedFootfall = item["expectedFootfall"];
    final description = item["description"] ?? "";
    final organizer = item["organizer"] ?? "";

    String formattedDate = dateStr;
    String formattedTime = "";
    try {
      if (dateStr.isNotEmpty) {
        final parsed = DateTime.parse(dateStr);
        formattedDate = DateFormat('EEE, MMM d, yyyy').format(parsed);
        formattedTime = DateFormat('h:mm a').format(parsed);
      }
    } catch (_) {}

    bool isToday = false;
    try {
      if (dateStr.isNotEmpty) {
        final parsed = DateTime.parse(dateStr);
        final now = DateTime.now();
        isToday = parsed.year == now.year &&
            parsed.month == now.month &&
            parsed.day == now.day;
      }
    } catch (_) {}

    final isAdmin = widget.role == Roles.admin ||
        widget.role == Roles.superAdmin;

    return GestureDetector(
      onTap: () => _showDetailSheet(item),
      child: Container(
        margin: const EdgeInsets.only(bottom: 14),
        decoration: BoxDecoration(
          color: CupertinoColors.white,
          borderRadius: BorderRadius.circular(16),
          border: isToday
              ? Border.all(color: accentOrange, width: 2)
              : null,
          boxShadow: [
            BoxShadow(
              color: CupertinoColors.black.withOpacity(0.06),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header with status
            Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: _getStatusColor(status).withOpacity(0.1),
                borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(16)),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: primaryBlue.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(CupertinoIcons.calendar,
                        color: primaryBlue, size: 24),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title.toString(),
                            style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            Icon(CupertinoIcons.calendar,
                                size: 14,
                                color:
                                    CupertinoColors.systemGrey),
                            const SizedBox(width: 4),
                            Flexible(
                              child: Text(
                                formattedTime.isNotEmpty
                                    ? "$formattedDate at $formattedTime"
                                    : formattedDate,
                                style: TextStyle(
                                  fontSize: 13,
                                  color: isToday
                                      ? accentOrange
                                      : CupertinoColors
                                          .systemGrey,
                                  fontWeight: isToday
                                      ? FontWeight.bold
                                      : FontWeight.normal,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            if (isToday) ...[
                              const SizedBox(width: 8),
                              Container(
                                padding:
                                    const EdgeInsets.symmetric(
                                        horizontal: 6,
                                        vertical: 2),
                                decoration: BoxDecoration(
                                  color: accentOrange,
                                  borderRadius:
                                      BorderRadius.circular(4),
                                ),
                                child: const Text("TODAY",
                                    style: TextStyle(
                                        fontSize: 9,
                                        fontWeight:
                                            FontWeight.bold,
                                        color: CupertinoColors
                                            .white)),
                              ),
                            ],
                          ],
                        ),
                      ],
                    ),
                  ),
                  _statusChip(status),
                ],
              ),
            ),

            // Body
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(CupertinoIcons.location,
                          size: 18,
                          color: CupertinoColors.systemGrey),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(location.toString(),
                            style: const TextStyle(fontSize: 14),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis),
                      ),
                    ],
                  ),
                  if (chiefGuest.toString().isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Icon(CupertinoIcons.person,
                            size: 18,
                            color:
                                CupertinoColors.systemGrey),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                              "Chief Guest: $chiefGuest",
                              style:
                                  const TextStyle(fontSize: 14),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis),
                        ),
                      ],
                    ),
                  ],
                  if (expectedFootfall != null) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Icon(CupertinoIcons.person_3,
                            size: 18,
                            color:
                                CupertinoColors.systemGrey),
                        const SizedBox(width: 6),
                        Text(
                            "Expected: $expectedFootfall people",
                            style:
                                const TextStyle(fontSize: 14)),
                      ],
                    ),
                  ],
                  if (organizer.toString().isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Icon(CupertinoIcons.building_2_fill,
                            size: 18,
                            color:
                                CupertinoColors.systemGrey),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text("By: $organizer",
                              style:
                                  const TextStyle(fontSize: 14),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis),
                        ),
                      ],
                    ),
                  ],
                  if (description.toString().isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(description.toString(),
                        style: TextStyle(
                            fontSize: 13,
                            color: CupertinoColors.systemGrey,
                            fontStyle: FontStyle.italic),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis),
                  ],

                  // Admin Actions
                  if (isAdmin &&
                      id != null &&
                      status == "PENDING") ...[
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: CupertinoButton(
                            padding: const EdgeInsets.symmetric(
                                vertical: 10),
                            color: CupertinoColors.white,
                            borderRadius:
                                BorderRadius.circular(10),
                            onPressed: () =>
                                _updateDecision(id, "REGRET"),
                            child: Row(
                              mainAxisAlignment:
                                  MainAxisAlignment.center,
                              children: [
                                Icon(CupertinoIcons.xmark,
                                    size: 18,
                                    color: accentRed),
                                const SizedBox(width: 6),
                                Text("Regret",
                                    style: TextStyle(
                                        color: accentRed)),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: CupertinoButton(
                            padding: const EdgeInsets.symmetric(
                                vertical: 10),
                            color: accentGreen,
                            borderRadius:
                                BorderRadius.circular(10),
                            onPressed: () => _updateDecision(
                                id, "ACCEPTED"),
                            child: const Row(
                              mainAxisAlignment:
                                  MainAxisAlignment.center,
                              children: [
                                Icon(CupertinoIcons.check_mark,
                                    size: 18,
                                    color:
                                        CupertinoColors.white),
                                SizedBox(width: 6),
                                Text("Accept",
                                    style: TextStyle(
                                        color: CupertinoColors
                                            .white)),
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
        ),
      ),
    );
  }

  Color _getStatusColor(String status) {
    final s = status.toUpperCase();
    if (s == "PENDING") return accentOrange;
    if (s == "ACCEPTED") return accentGreen;
    if (s == "REGRET") return accentRed;
    return CupertinoColors.systemGrey;
  }

  Widget _statusChip(String status) {
    final s = status.toUpperCase();

    Color bg = CupertinoColors.systemGrey5;
    Color text = CupertinoColors.systemGrey;
    IconData icon = CupertinoIcons.clock;
    String displayText = status;

    if (s == "PENDING") {
      bg = accentOrange.withOpacity(0.15);
      text = accentOrange;
      icon = CupertinoIcons.clock;
      displayText = "Pending";
    } else if (s == "ACCEPTED") {
      bg = accentGreen.withOpacity(0.15);
      text = accentGreen;
      icon = CupertinoIcons.check_mark_circled;
      displayText = "Accepted";
    } else if (s == "REGRET") {
      bg = accentRed.withOpacity(0.15);
      text = accentRed;
      icon = CupertinoIcons.xmark_circle;
      displayText = "Regret";
    }

    return Container(
      padding:
          const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: text),
          const SizedBox(width: 4),
          Text(displayText,
              style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  color: text)),
        ],
      ),
    );
  }
}
