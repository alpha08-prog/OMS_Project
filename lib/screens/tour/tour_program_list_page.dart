import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/http_service.dart';
import '../../utils/access_control.dart';
import '../../widgets/date_range_filter.dart';
import 'tour_program_create_page.dart';

class TourProgramListPage extends StatefulWidget {
  final String role;
  const TourProgramListPage({super.key, required this.role});

  @override
  State<TourProgramListPage> createState() => _TourProgramListPageState();
}

class _TourProgramListPageState extends State<TourProgramListPage>
    with SingleTickerProviderStateMixin {
  static const Color primaryBlue = Color(0xFF0A2E5C);
  static const Color bgLight = Color(0xFFF4F6FB);
  static const Color accentGreen = Color(0xFF10B981);
  static const Color accentOrange = Color(0xFFF59E0B);
  static const Color accentRed = Color(0xFFEF4444);

  late TabController _tabController;

  bool loadingAll = true;
  bool loadingToday = true;
  bool loadingUpcoming = true;

  List<Map<String, dynamic>> allList = [];
  List<Map<String, dynamic>> todayList = [];
  List<Map<String, dynamic>> upcomingList = [];

  // Stats
  int totalPrograms = 0;
  int pendingCount = 0;
  int approvedCount = 0;
  int rejectedCount = 0;

  DateTime? _dateFrom;
  DateTime? _dateTo;

  List<Map<String, dynamic>> _applyDate(List<Map<String, dynamic>> list) {
    if (_dateFrom == null && _dateTo == null) return list;
    return list.where((e) {
      // Tour programs use `dateTime` (event date) more naturally than
      // `createdAt`. Fall back to createdAt if dateTime is missing.
      final raw = (e['dateTime'] ?? e['createdAt'])?.toString();
      final dt = DateTime.tryParse(raw ?? '');
      return dateInRange(dt, from: _dateFrom, to: _dateTo);
    }).toList();
  }

  @override
  void initState() {
    super.initState();
    _tabController = TabController(
      length: widget.role == Roles.superAdmin ? 1 : 3,
      vsync: this,
    );
    _loadAll();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
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
      pendingCount = allList.where((e) =>
        (e["decision"] ?? "PENDING").toString().toUpperCase() == "PENDING"
      ).length;
      approvedCount = allList.where((e) =>
        (e["decision"] ?? "").toString().toUpperCase() == "ACCEPTED"
      ).length;
      rejectedCount = allList.where((e) =>
        (e["decision"] ?? "").toString().toUpperCase() == "REGRET"
      ).length;
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
      final res = await HttpService.get("/api/tour-programs/schedule/today");
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
    final canCreate = AccessControl.can(widget.role, ActionPermission.create);

    if (!canCreate) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("You have view-only access.")),
      );
      return;
    }

    final result = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => TourProgramCreatePage(onCreated: () => _fetchAll()),
      ),
    );
    if (result == true) _fetchAll();
    return;

    // Legacy bottom sheet (kept for reference but no longer reached)
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => _CreateTourProgramSheet(
        onCreated: () async {
          Navigator.pop(context);
          await _loadAll();
        },
      ),
    );
  }

  String? _getId(Map<String, dynamic> item) {
    final id = item["id"];
    if (id is int) return id.toString();
    if (id is String) return id;
    return null;
  }

  Future<void> _updateDecision(String id, String decision) async {
    // Only ADMIN can set decision
    if (widget.role != Roles.admin && widget.role != Roles.superAdmin) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Only ADMIN can update decision.")),
      );
      return;
    }

    try {
      final res = await HttpService.patch(
        "/api/tour-programs/$id/decision",
        {"decision": decision},
      );

      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(decision == "ACCEPTED" ? "Accepted" : "Regret"),
            backgroundColor: decision == "ACCEPTED" ? accentGreen : accentRed,
          ),
        );
        _loadAll();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Failed (${res.statusCode})")),
        );
      }
    } catch (_) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server error / No internet")),
      );
    }
  }

  Future<void> _deleteProgram(String id) async {
    if (widget.role != Roles.admin && widget.role != Roles.superAdmin) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Only ADMIN can delete.")),
      );
      return;
    }

    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text("Delete Tour Program"),
        content: const Text("Are you sure you want to delete this program?"),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text("Cancel"),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: accentRed),
            onPressed: () => Navigator.pop(context, true),
            child: const Text("Delete", style: TextStyle(color: Colors.white)),
          )
        ],
      ),
    );

    if (confirm != true) return;

    try {
      final res = await HttpService.delete("/api/tour-programs/$id");
      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Deleted"), backgroundColor: accentGreen),
        );
        _loadAll();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Delete failed (${res.statusCode})")),
        );
      }
    } catch (_) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server error / No internet")),
      );
    }
  }

  void _showDetailSheet(Map<String, dynamic> item) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => _TourDetailSheet(
        item: item,
        role: widget.role,
        onDecisionUpdate: _updateDecision,
        onDelete: _deleteProgram,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final canCreate = AccessControl.can(widget.role, ActionPermission.create);

    return Scaffold(
      backgroundColor: bgLight,
      appBar: AppBar(
        title: const Text("Tour Programs"),
        backgroundColor: primaryBlue,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadAll,
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(100),
          child: Column(
            children: [
              // Stats Row
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _miniStat("Total", totalPrograms.toString(), Colors.white),
                    _miniStat("Pending", pendingCount.toString(), accentOrange),
                    _miniStat("Approved", approvedCount.toString(), accentGreen),
                    _miniStat("Rejected", rejectedCount.toString(), accentRed),
                  ],
                ),
              ),
              // Tab Bar
              if (widget.role != Roles.superAdmin)
                TabBar(
                  controller: _tabController,
                  labelColor: Colors.white,
                  unselectedLabelColor: Colors.white70,
                  indicatorColor: Colors.white,
                  indicatorWeight: 3,
                  tabs: [
                    Tab(text: "All (${allList.length})"),
                    Tab(text: "Today (${todayList.length})"),
                    Tab(text: "Upcoming (${upcomingList.length})"),
                  ],
                ),
            ],
          ),
        ),
      ),
      floatingActionButton: canCreate
          ? FloatingActionButton.extended(
              backgroundColor: primaryBlue,
              onPressed: _openCreateSheet,
              icon: const Icon(Icons.add, color: Colors.white),
              label: const Text("New Program", style: TextStyle(color: Colors.white)),
            )
          : null,
      body: Column(
        children: [
          DateRangeFilter(
            from: _dateFrom,
            to: _dateTo,
            tint: primaryBlue,
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            onFromChanged: (d) => setState(() => _dateFrom = d),
            onToChanged: (d) => setState(() => _dateTo = d),
            onClear: () => setState(() {
              _dateFrom = null;
              _dateTo = null;
            }),
          ),
          Expanded(
            child: widget.role == Roles.superAdmin
                ? _categoriesView()
                : TabBarView(
                    controller: _tabController,
                    children: [
                      _listView(loadingAll, _applyDate(allList)),
                      _listView(loadingToday, _applyDate(todayList)),
                      _listView(loadingUpcoming, _applyDate(upcomingList)),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget _miniStat(String label, String value, Color color) {
    return Column(
      children: [
        Text(
          value,
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
        Text(
          label,
          style: TextStyle(
            fontSize: 11,
            color: Colors.white.withOpacity(0.8),
          ),
        ),
      ],
    );
  }

  Widget _categoriesView() {
    if (loadingToday && loadingUpcoming) {
      return const Center(child: CircularProgressIndicator());
    }

    final today = _applyDate(todayList);
    final upcoming = _applyDate(upcomingList);

    if (today.isEmpty && upcoming.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.event_busy, size: 64, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            Text(
              "No today's or upcoming programs",
              style: TextStyle(fontSize: 16, color: Colors.grey.shade600),
            ),
          ],
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(0, 8, 0, 16),
      children: [
        _categorySectionHeader(
          icon: Icons.wb_sunny,
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
          icon: Icons.calendar_month,
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
          style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
        ),
      ),
    );
  }

  Widget _listView(bool loading, List<Map<String, dynamic>> list) {
    if (loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (list.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.event_busy, size: 64, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            Text(
              "No programs found",
              style: TextStyle(fontSize: 16, color: Colors.grey.shade600),
            ),
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
    final status = (item["decision"] ?? "PENDING").toString().toUpperCase();
    final chiefGuest = item["chiefGuest"] ?? "";
    final expectedFootfall = item["expectedFootfall"];
    final description = item["description"] ?? "";
    final organizer = item["organizer"] ?? "";

    // Format date and time
    String formattedDate = dateStr;
    String formattedTime = "";
    try {
      if (dateStr.isNotEmpty) {
        final parsed = DateTime.parse(dateStr);
        formattedDate = DateFormat('EEE, MMM d, yyyy').format(parsed);
        formattedTime = DateFormat('h:mm a').format(parsed);
      }
    } catch (_) {}

    // Check if today
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

    final isAdmin = widget.role == Roles.admin || widget.role == Roles.superAdmin;

    return GestureDetector(
      onTap: () => _showDetailSheet(item),
      child: Container(
        margin: const EdgeInsets.only(bottom: 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: isToday ? Border.all(color: accentOrange, width: 2) : null,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.06),
              blurRadius: 10,
              offset: const Offset(0, 4),
            )
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header with status
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: _getStatusColor(status).withOpacity(0.1),
                borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: primaryBlue.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(Icons.event, color: primaryBlue, size: 24),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title.toString(),
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            Icon(Icons.calendar_today, size: 14, color: Colors.grey.shade600),
                            const SizedBox(width: 4),
                            Flexible(
                              child: Text(
                                formattedTime.isNotEmpty ? "$formattedDate at $formattedTime" : formattedDate,
                                style: TextStyle(
                                  fontSize: 13,
                                  color: isToday ? accentOrange : Colors.grey.shade600,
                                  fontWeight: isToday ? FontWeight.bold : FontWeight.normal,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            if (isToday) ...[
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: accentOrange,
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: const Text(
                                  "TODAY",
                                  style: TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.bold,
                                    color: Colors.white,
                                  ),
                                ),
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
                  // Location
                  Row(
                    children: [
                      Icon(Icons.location_on, size: 18, color: Colors.grey.shade500),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          location.toString(),
                          style: const TextStyle(fontSize: 14),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),

                  // Chief Guest
                  if (chiefGuest.toString().isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Icon(Icons.person, size: 18, color: Colors.grey.shade500),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            "Chief Guest: $chiefGuest",
                            style: const TextStyle(fontSize: 14),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ],

                  // Expected Footfall
                  if (expectedFootfall != null) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Icon(Icons.groups, size: 18, color: Colors.grey.shade500),
                        const SizedBox(width: 6),
                        Text(
                          "Expected: $expectedFootfall people",
                          style: const TextStyle(fontSize: 14),
                        ),
                      ],
                    ),
                  ],

                  // Organizer
                  if (organizer.toString().isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Icon(Icons.business, size: 18, color: Colors.grey.shade500),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            "By: $organizer",
                            style: const TextStyle(fontSize: 14),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ],

                  // Description preview
                  if (description.toString().isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      description.toString(),
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.grey.shade600,
                        fontStyle: FontStyle.italic,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],

                  // Admin Action Buttons
                  if (isAdmin && id != null && status == "PENDING") ...[
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () => _updateDecision(id, "REGRET"),
                            icon: const Icon(Icons.close, size: 18),
                            label: const Text("Regret"),
                            style: OutlinedButton.styleFrom(
                              foregroundColor: accentRed,
                              side: const BorderSide(color: accentRed),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                              padding: const EdgeInsets.symmetric(vertical: 10),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: () => _updateDecision(id, "ACCEPTED"),
                            icon: const Icon(Icons.check, size: 18),
                            label: const Text("Accept"),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: accentGreen,
                              foregroundColor: Colors.white,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                              padding: const EdgeInsets.symmetric(vertical: 10),
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
    return Colors.grey;
  }

  Widget _statusChip(String status) {
    final s = status.toUpperCase();

    Color bg = Colors.grey.shade200;
    Color text = Colors.grey.shade800;
    IconData icon = Icons.schedule;
    String displayText = status;

    if (s == "PENDING") {
      bg = accentOrange.withOpacity(0.15);
      text = accentOrange;
      icon = Icons.schedule;
      displayText = "Pending";
    } else if (s == "ACCEPTED") {
      bg = accentGreen.withOpacity(0.15);
      text = accentGreen;
      icon = Icons.check_circle;
      displayText = "Accepted";
    } else if (s == "REGRET") {
      bg = accentRed.withOpacity(0.15);
      text = accentRed;
      icon = Icons.cancel;
      displayText = "Regret";
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: text),
          const SizedBox(width: 4),
          Text(
            displayText,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: text,
            ),
          ),
        ],
      ),
    );
  }
}

// ================= TOUR DETAIL SHEET =================

class _TourDetailSheet extends StatelessWidget {
  final Map<String, dynamic> item;
  final String role;
  final Function(String, String) onDecisionUpdate;
  final Function(String) onDelete;

  const _TourDetailSheet({
    required this.item,
    required this.role,
    required this.onDecisionUpdate,
    required this.onDelete,
  });

  static const Color primaryBlue = Color(0xFF0A2E5C);
  static const Color accentGreen = Color(0xFF10B981);
  static const Color accentOrange = Color(0xFFF59E0B);
  static const Color accentRed = Color(0xFFEF4444);

  @override
  Widget build(BuildContext context) {
    final id = item["id"]?.toString();
    final title = item["eventName"] ?? "Tour Program";
    final location = item["venue"] ?? "-";
    final dateStr = item["dateTime"] ?? "";
    final status = (item["decision"] ?? "PENDING").toString().toUpperCase();
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
        formattedDate = DateFormat('EEEE, MMMM d, yyyy \'at\' h:mm a').format(parsed);
      }
    } catch (_) {}

    String formattedCreatedAt = "";
    try {
      if (createdAt.isNotEmpty) {
        final parsed = DateTime.parse(createdAt);
        formattedCreatedAt = DateFormat('MMM d, yyyy h:mm a').format(parsed);
      }
    } catch (_) {}

    final isAdmin = role == Roles.admin || role == Roles.superAdmin;

    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) {
        return SingleChildScrollView(
          controller: scrollController,
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Handle bar
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
                    child: const Icon(Icons.event, color: primaryBlue, size: 28),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title.toString(),
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 8),
                        _buildStatusChip(status),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Details Section
              _detailCard([
                _detailRow(Icons.calendar_today, "Date & Time", formattedDate),
                _detailRow(Icons.location_on, "Venue", location.toString()),
                if (venueLink.toString().isNotEmpty)
                  _detailRow(Icons.link, "Venue Link", venueLink.toString()),
                if (organizer.toString().isNotEmpty)
                  _detailRow(Icons.business, "Organizer", organizer.toString()),
                if (chiefGuest.toString().isNotEmpty)
                  _detailRow(Icons.person, "Chief Guest", chiefGuest.toString()),
                if (contactPhone.toString().isNotEmpty)
                  _detailRow(Icons.phone, "Contact", contactPhone.toString()),
                if (expectedFootfall != null)
                  _detailRow(Icons.groups, "Expected Footfall", "$expectedFootfall people"),
                if (referencedBy.toString().isNotEmpty)
                  _detailRow(Icons.person_outline, "Referenced By", referencedBy.toString()),
              ]),
              const SizedBox(height: 16),

              // Description Section
              if (description.toString().isNotEmpty) ...[
                const Text(
                  "Description",
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: Colors.grey,
                  ),
                ),
                const SizedBox(height: 8),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    description.toString(),
                    style: const TextStyle(fontSize: 14),
                  ),
                ),
                const SizedBox(height: 16),
              ],

              // Decision Note Section
              if (decisionNote.toString().isNotEmpty) ...[
                const Text(
                  "Decision Note",
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: Colors.grey,
                  ),
                ),
                const SizedBox(height: 8),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Colors.amber.shade50,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    decisionNote.toString(),
                    style: const TextStyle(fontSize: 14),
                  ),
                ),
                const SizedBox(height: 16),
              ],

              // Created At
              if (formattedCreatedAt.isNotEmpty) ...[
                Center(
                  child: Text(
                    "Created: $formattedCreatedAt",
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
                  ),
                ),
                const SizedBox(height: 20),
              ],

              // Admin Actions
              if (isAdmin && id != null) ...[
                const Divider(),
                const SizedBox(height: 12),
                const Text(
                  "Actions",
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: Colors.grey,
                  ),
                ),
                const SizedBox(height: 12),

                if (status == "PENDING") ...[
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () {
                            Navigator.pop(context);
                            onDecisionUpdate(id, "REGRET");
                          },
                          icon: const Icon(Icons.close),
                          label: const Text("Regret"),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: accentRed,
                            side: const BorderSide(color: accentRed),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            padding: const EdgeInsets.symmetric(vertical: 14),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: () {
                            Navigator.pop(context);
                            onDecisionUpdate(id, "ACCEPTED");
                          },
                          icon: const Icon(Icons.check),
                          label: const Text("Accept"),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: accentGreen,
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            padding: const EdgeInsets.symmetric(vertical: 14),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                ],

                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () {
                      Navigator.pop(context);
                      onDelete(id);
                    },
                    icon: const Icon(Icons.delete),
                    label: const Text("Delete Program"),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: accentRed,
                      side: const BorderSide(color: accentRed),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 20),
            ],
          ),
        );
      },
    );
  }

  Widget _detailCard(List<Widget> children) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        children: children.expand((w) => [w, const SizedBox(height: 12)]).toList()
          ..removeLast(),
      ),
    );
  }

  Widget _detailRow(IconData icon, String label, String value) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: Colors.grey.shade600),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.grey.shade500,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                value,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildStatusChip(String status) {
    final s = status.toUpperCase();

    Color bg = Colors.grey.shade200;
    Color text = Colors.grey.shade800;
    IconData icon = Icons.schedule;
    String displayText = status;

    if (s == "PENDING") {
      bg = accentOrange.withOpacity(0.15);
      text = accentOrange;
      icon = Icons.schedule;
      displayText = "Pending";
    } else if (s == "ACCEPTED") {
      bg = accentGreen.withOpacity(0.15);
      text = accentGreen;
      icon = Icons.check_circle;
      displayText = "Accepted";
    } else if (s == "REGRET") {
      bg = accentRed.withOpacity(0.15);
      text = accentRed;
      icon = Icons.cancel;
      displayText = "Regret";
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: text),
          const SizedBox(width: 6),
          Text(
            displayText,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.bold,
              color: text,
            ),
          ),
        ],
      ),
    );
  }
}

// ================= CREATE TOUR PROGRAM SHEET =================

class _CreateTourProgramSheet extends StatefulWidget {
  final Future<void> Function() onCreated;
  const _CreateTourProgramSheet({required this.onCreated});

  @override
  State<_CreateTourProgramSheet> createState() => __CreateTourProgramSheetState();
}

class __CreateTourProgramSheetState extends State<_CreateTourProgramSheet> {
  final _formKey = GlobalKey<FormState>();

  final eventNameController = TextEditingController();
  final organizerController = TextEditingController();
  final venueController = TextEditingController();
  final venueLinkController = TextEditingController();
  final chiefGuestController = TextEditingController();
  final contactPhoneController = TextEditingController();
  final expectedFootfallController = TextEditingController();
  final descriptionController = TextEditingController();
  final referencedByController = TextEditingController();

  DateTime? selectedDate;
  TimeOfDay? selectedTime;
  bool submitting = false;

  @override
  void dispose() {
    eventNameController.dispose();
    organizerController.dispose();
    venueController.dispose();
    venueLinkController.dispose();
    chiefGuestController.dispose();
    contactPhoneController.dispose();
    expectedFootfallController.dispose();
    descriptionController.dispose();
    referencedByController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final date = await showDatePicker(
      context: context,
      initialDate: selectedDate ?? DateTime.now(),
      firstDate: DateTime.now().subtract(const Duration(days: 30)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );

    if (date != null) {
      setState(() => selectedDate = date);
    }
  }

  Future<void> _pickTime() async {
    final time = await showTimePicker(
      context: context,
      initialTime: selectedTime ?? TimeOfDay.now(),
    );

    if (time != null) {
      setState(() => selectedTime = time);
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (selectedDate == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Please select a date")),
      );
      return;
    }

    setState(() => submitting = true);

    try {
      // Combine date and time into ISO DateTime string
      final dateTime = DateTime(
        selectedDate!.year,
        selectedDate!.month,
        selectedDate!.day,
        selectedTime?.hour ?? 10,
        selectedTime?.minute ?? 0,
      );

      final body = <String, dynamic>{
        "eventName": eventNameController.text.trim(),
        "organizer": organizerController.text.trim(),
        "venue": venueController.text.trim(),
        "dateTime": dateTime.toIso8601String(),
      };

      if (venueLinkController.text.trim().isNotEmpty) {
        body["venueLink"] = venueLinkController.text.trim();
      }
      if (chiefGuestController.text.trim().isNotEmpty) {
        body["chiefGuest"] = chiefGuestController.text.trim();
      }
      if (contactPhoneController.text.trim().isNotEmpty) {
        body["contactPhone"] = contactPhoneController.text.trim();
      }
      if (expectedFootfallController.text.trim().isNotEmpty) {
        body["expectedFootfall"] = expectedFootfallController.text.trim();
      }
      if (descriptionController.text.trim().isNotEmpty) {
        body["description"] = descriptionController.text.trim();
      }
      if (referencedByController.text.trim().isNotEmpty) {
        body["referencedBy"] = referencedByController.text.trim();
      }

      final res = await HttpService.post("/api/tour-programs", body);

      if (res.statusCode == 201 || res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Tour program created"),
            backgroundColor: Color(0xFF10B981),
          ),
        );
        await widget.onCreated();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Failed (${res.statusCode})")),
        );
      }
    } catch (_) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server error / No internet")),
      );
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;

    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) {
        return Padding(
          padding: EdgeInsets.only(left: 20, right: 20, bottom: bottom + 20, top: 12),
          child: Form(
            key: _formKey,
            child: ListView(
              controller: scrollController,
              children: [
                // Handle bar
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
                const SizedBox(height: 20),
                const Text(
                  "Create Tour Program",
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),

                // Event Name
                TextFormField(
                  controller: eventNameController,
                  decoration: _inputDecoration("Event Name *", Icons.event),
                  validator: (v) =>
                      (v == null || v.trim().length < 3) ? "Enter valid event name" : null,
                ),
                const SizedBox(height: 16),

                // Organizer
                TextFormField(
                  controller: organizerController,
                  decoration: _inputDecoration("Organizer *", Icons.business),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? "Enter organizer" : null,
                ),
                const SizedBox(height: 16),

                // Venue
                TextFormField(
                  controller: venueController,
                  decoration: _inputDecoration("Venue *", Icons.location_on),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? "Enter venue" : null,
                ),
                const SizedBox(height: 16),

                // Date Picker
                InkWell(
                  onTap: _pickDate,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.grey.shade400),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.calendar_today, color: Colors.grey.shade600),
                        const SizedBox(width: 12),
                        Text(
                          selectedDate != null
                              ? DateFormat('EEE, MMM d, yyyy').format(selectedDate!)
                              : "Select Date *",
                          style: TextStyle(
                            fontSize: 16,
                            color: selectedDate != null ? Colors.black : Colors.grey.shade600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Time Picker
                InkWell(
                  onTap: _pickTime,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.grey.shade400),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        Icon(Icons.access_time, color: Colors.grey.shade600),
                        const SizedBox(width: 12),
                        Text(
                          selectedTime != null
                              ? selectedTime!.format(context)
                              : "Select Time (optional, default 10:00 AM)",
                          style: TextStyle(
                            fontSize: 16,
                            color: selectedTime != null ? Colors.black : Colors.grey.shade600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),

                // Venue Link
                TextFormField(
                  controller: venueLinkController,
                  decoration: _inputDecoration("Venue Link (optional)", Icons.link),
                  keyboardType: TextInputType.url,
                ),
                const SizedBox(height: 16),

                // Chief Guest
                TextFormField(
                  controller: chiefGuestController,
                  decoration: _inputDecoration("Chief Guest (optional)", Icons.person),
                ),
                const SizedBox(height: 16),

                // Contact Phone
                TextFormField(
                  controller: contactPhoneController,
                  decoration: _inputDecoration("Contact Phone (optional)", Icons.phone),
                  keyboardType: TextInputType.phone,
                ),
                const SizedBox(height: 16),

                // Expected Footfall
                TextFormField(
                  controller: expectedFootfallController,
                  decoration: _inputDecoration("Expected Footfall (optional)", Icons.groups),
                  keyboardType: TextInputType.text,
                ),
                const SizedBox(height: 16),

                // Referenced By
                TextFormField(
                  controller: referencedByController,
                  decoration: _inputDecoration("Referenced By (optional)", Icons.person_outline),
                ),
                const SizedBox(height: 16),

                // Description
                TextFormField(
                  controller: descriptionController,
                  decoration: _inputDecoration("Description (optional)", Icons.description),
                  maxLines: 3,
                ),
                const SizedBox(height: 24),

                // Submit Button
                SizedBox(
                  width: double.infinity,
                  height: 52,
                  child: ElevatedButton(
                    onPressed: submitting ? null : _submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF0A2E5C),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: submitting
                        ? const SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(
                              color: Colors.white,
                              strokeWidth: 2,
                            ),
                          )
                        : const Text(
                            "Create Program",
                            style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                          ),
                  ),
                ),
                const SizedBox(height: 20),
              ],
            ),
          ),
        );
      },
    );
  }

  InputDecoration _inputDecoration(String label, IconData icon) {
    return InputDecoration(
      labelText: label,
      prefixIcon: Icon(icon),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
    );
  }
}
