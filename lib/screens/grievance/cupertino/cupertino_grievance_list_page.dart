import 'dart:convert';
import 'dart:io';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:open_filex/open_filex.dart';

import '../../../services/http_service.dart';
import '../../../utils/access_control.dart';
import '../../../utils/app_navigator.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../widgets/cupertino/cupertino_filter_row.dart';
import '../../../widgets/cupertino/cupertino_form_helpers.dart';
import '../../../widgets/cupertino/cupertino_styled_card.dart';
import '../../../widgets/cupertino/cupertino_admin_grievance_detail_dialog.dart';
import 'cupertino_grievance_type_picker_page.dart';

class CupertinoGrievanceListPage extends StatefulWidget {
  final String role;
  const CupertinoGrievanceListPage({super.key, required this.role});

  @override
  State<CupertinoGrievanceListPage> createState() =>
      _CupertinoGrievanceListPageState();
}

class _CupertinoGrievanceListPageState
    extends State<CupertinoGrievanceListPage> {
  String selectedStatus = "All";
  String _searchQuery = "";
  String _constituencyQuery = "";
  DateTime? _startDate;
  DateTime? _endDate;

  bool _loading = true;
  String? _error;
  bool _showFilters = false;
  final Set<String> _downloadingIds = {};

  final TextEditingController _searchController = TextEditingController();
  final TextEditingController _constituencyController = TextEditingController();
  List<Map<String, dynamic>> _allGrievances = [];

  // Stats
  int _totalCount = 0;
  int _openCount = 0;
  int _inProgressCount = 0;
  int _closedCount = 0;

  @override
  void initState() {
    super.initState();
    _fetchGrievances();
  }

  @override
  void dispose() {
    _searchController.dispose();
    _constituencyController.dispose();
    super.dispose();
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
        return "";
    }
  }

  String _toUiStatus(String backendStatus) {
    switch (backendStatus.toUpperCase()) {
      case "OPEN":
        return "Open";
      case "IN_PROGRESS":
        return "In Progress";
      case "CLOSED":
      case "RESOLVED":
        return "Closed";
      case "VERIFIED":
        return "Verified";
      default:
        return "Open";
    }
  }

  Future<void> _fetchGrievances() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final Map<String, String> queryParams = {};

      if (selectedStatus != "All") {
        queryParams['status'] = _toBackendStatus(selectedStatus);
      }

      if (_searchQuery.isNotEmpty) {
        queryParams['search'] = _searchQuery;
      }

      if (_constituencyQuery.isNotEmpty) {
        queryParams['constituency'] = _constituencyQuery;
      }

      if (_startDate != null) {
        queryParams['startDate'] = _startDate!.toIso8601String();
      }

      if (_endDate != null) {
        queryParams['endDate'] =
            _endDate!.add(const Duration(days: 1)).toIso8601String();
      }

      String queryString = "";
      if (queryParams.isNotEmpty) {
        queryString = "?" +
            queryParams.entries
                .map((e) => "${e.key}=${Uri.encodeComponent(e.value)}")
                .join("&");
      }

      final res = await HttpService.get("/api/grievances$queryString");

      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list = decoded is List ? decoded : (decoded["data"] ?? []);

        final items = list.map<Map<String, dynamic>>((e) {
          final m = Map<String, dynamic>.from(e);
          m["uiStatus"] = _toUiStatus(m["status"] ?? "OPEN");
          return m;
        }).toList();

        int open = 0, inProgress = 0, closed = 0;
        for (var g in items) {
          final status = g["status"]?.toString().toUpperCase() ?? "OPEN";
          if (status == "OPEN") {
            open++;
          } else if (status == "IN_PROGRESS" || status == "VERIFIED") {
            inProgress++;
          } else if (status == "RESOLVED" || status == "CLOSED") {
            closed++;
          }
        }

        setState(() {
          _allGrievances = items;
          _totalCount = items.length;
          _openCount = open;
          _inProgressCount = inProgress;
          _closedCount = closed;
          _loading = false;
        });
      } else {
        setState(() {
          _error = "Failed to load grievances (${res.statusCode})";
          _loading = false;
        });
      }
    } catch (e) {
      setState(() {
        _error = "Server error / No internet";
        _loading = false;
      });
    }
  }

  void _onSearch(String query) {
    setState(() {
      _searchQuery = query;
    });
    _fetchGrievances();
  }

  void _selectDate(bool isStart) {
    CupertinoFormHelpers.showDatePicker(
      context: context,
      initialDate: isStart
          ? (_startDate ?? DateTime.now())
          : (_endDate ?? DateTime.now()),
      minimumDate: DateTime(2020),
      maximumDate: DateTime.now().add(const Duration(days: 365)),
      onDateSelected: (picked) {
        setState(() {
          if (isStart) {
            _startDate = picked;
          } else {
            _endDate = picked;
          }
        });
        _fetchGrievances();
      },
    );
  }

  void _clearFilters() {
    setState(() {
      _startDate = null;
      _endDate = null;
      _searchQuery = "";
      _searchController.clear();
      _constituencyQuery = "";
      _constituencyController.clear();
      selectedStatus = "All";
    });
    _fetchGrievances();
  }

  Future<void> _downloadPdf(Map<String, dynamic> grievance) async {
    final id = grievance["id"]?.toString() ?? "";
    if (id.isEmpty) return;
    if (_downloadingIds.contains(id)) return;

    // TEMPLE_VISIT uses a dedicated endpoint that streams the Darshan
    // letter and atomically marks the grievance RESOLVED — so the status
    // flips only once staff actually downloads.
    final isTempleVisit = grievance['grievanceType'] == 'TEMPLE_VISIT';
    final endpoint = isTempleVisit
        ? "/api/pdf/grievance/$id/temple-visit"
        : "/api/pdf/grievance/$id";
    final fileName =
        isTempleVisit ? "Darshan_Letter_$id.pdf" : "grievance_$id.pdf";

    setState(() => _downloadingIds.add(id));

    try {
      final res = await HttpService.downloadFile(endpoint);

      if (res.statusCode == 200) {
        final dir = await getTemporaryDirectory();
        final file = File("${dir.path}/$fileName");
        await file.writeAsBytes(res.bodyBytes);

        final result = await OpenFilex.open(file.path);
        if (!mounted) return;
        if (result.type != ResultType.done) {
          CupertinoToast.show(context,
              "Could not open PDF: ${result.message}",
              isError: true);
        } else if (isTempleVisit) {
          CupertinoToast.show(
              context, "Letter downloaded. Grievance resolved.");
        }
        if (isTempleVisit) _fetchGrievances();
      } else {
        if (!mounted) return;
        CupertinoToast.show(context,
            "PDF download failed (${res.statusCode})",
            isError: true);
      }
    } catch (e) {
      if (!mounted) return;
      CupertinoToast.show(context, "Download error / no internet",
          isError: true);
    } finally {
      if (mounted) setState(() => _downloadingIds.remove(id));
    }
  }

  void _openAdminDetailDialog(Map<String, dynamic> grievance) {
    CupertinoAdminGrievanceDetailDialog.show(
      context: context,
      grievance: grievance,
    );
  }

  Future<void> _openCreate() async {
    final canCreate = AccessControl.can(widget.role, ActionPermission.create) &&
        widget.role != Roles.superAdmin;

    if (!canCreate) {
      CupertinoToast.show(context, "You have view-only access.", isError: true);
      return;
    }

    final result = await Navigator.push<bool>(
      context,
      CupertinoPageRoute(
        builder: (_) => CupertinoGrievanceTypePickerPage(
          role: widget.role,
          onCreated: () => _fetchGrievances(),
        ),
      ),
    );
    if (result == true) _fetchGrievances();
  }

  @override
  Widget build(BuildContext context) {
    final canCreate = AccessControl.can(widget.role, ActionPermission.create) &&
        widget.role != Roles.superAdmin;
    final hasFilters = _startDate != null ||
        _endDate != null ||
        _searchQuery.isNotEmpty ||
        _constituencyQuery.isNotEmpty;

    return CupertinoPageScaffold(
      backgroundColor: AppTheme.background,
      child: Column(
        children: [
          // ================= PINNED PURPLE HEADER =================
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [AppTheme.primaryIndigo, Color(0xFF4F46E5)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            child: SafeArea(
              bottom: false,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Nav row
                  Padding(
                    padding: const EdgeInsets.fromLTRB(4, 4, 8, 4),
                    child: Row(
                      children: [
                        CupertinoButton(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 6),
                          onPressed: () => Navigator.pop(context),
                          child: const Icon(CupertinoIcons.chevron_left,
                              color: CupertinoColors.white, size: 22),
                        ),
                        const Expanded(
                          child: Text(
                            "Old Grievances",
                            style: TextStyle(
                              inherit: false,
                              color: CupertinoColors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                              decoration: TextDecoration.none,
                              letterSpacing: -0.4,
                            ),
                            textAlign: TextAlign.center,
                          ),
                        ),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            GestureDetector(
                              onTap: () =>
                                  setState(() => _showFilters = !_showFilters),
                              child: Stack(
                                children: [
                                  Icon(
                                    _showFilters
                                        ? CupertinoIcons
                                            .line_horizontal_3_decrease_circle_fill
                                        : CupertinoIcons
                                            .line_horizontal_3_decrease_circle,
                                    color: CupertinoColors.white,
                                    size: 24,
                                  ),
                                  if (hasFilters)
                                    Positioned(
                                      right: 0,
                                      top: 0,
                                      child: Container(
                                        width: 8,
                                        height: 8,
                                        decoration: const BoxDecoration(
                                          color: CupertinoColors.activeOrange,
                                          shape: BoxShape.circle,
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 12),
                            GestureDetector(
                              onTap: _fetchGrievances,
                              child: const Icon(CupertinoIcons.refresh,
                                  color: CupertinoColors.white, size: 22),
                            ),
                            if (canCreate && widget.role != Roles.superAdmin) ...[
                              const SizedBox(width: 12),
                              GestureDetector(
                                onTap: _openCreate,
                                child: const Icon(
                                    CupertinoIcons.add_circled_solid,
                                    color: CupertinoColors.white,
                                    size: 24),
                              ),
                            ],
                          ],
                        ),
                      ],
                    ),
                  ),
                  // Stats card inside header
                  Container(
                    margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: CupertinoColors.white.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                          color: CupertinoColors.white.withOpacity(0.2)),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceAround,
                      children: [
                        _statItem(
                            "Total", _totalCount, CupertinoIcons.folder, null),
                        _statItem("Open", _openCount,
                            CupertinoIcons.folder_open, const Color(0xFF10B981)),
                        _statItem("Progress", _inProgressCount,
                            CupertinoIcons.clock, const Color(0xFFF59E0B)),
                        _statItem("Closed", _closedCount,
                            CupertinoIcons.checkmark_circle,
                            const Color(0xFF9CA3AF)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          // ================= SCROLLABLE BODY =================
          Expanded(
            child: Column(
              children: [

            // ================= SEARCH & FILTERS =================
            if (_showFilters)
              Container(
                margin: const EdgeInsets.symmetric(horizontal: 16),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: CupertinoColors.white,
                  borderRadius: BorderRadius.circular(12),
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
                    // Search by name / phone
                    CupertinoTextField(
                      controller: _searchController,
                      placeholder: "Search by name or phone...",
                      prefix: const Padding(
                        padding: EdgeInsets.only(left: 12),
                        child: Icon(CupertinoIcons.search,
                            color: CupertinoColors.systemGrey, size: 20),
                      ),
                      suffix: _searchQuery.isNotEmpty
                          ? GestureDetector(
                              onTap: () {
                                _searchController.clear();
                                _onSearch("");
                              },
                              child: const Padding(
                                padding: EdgeInsets.only(right: 8),
                                child: Icon(CupertinoIcons.clear_circled_solid,
                                    size: 18,
                                    color: CupertinoColors.systemGrey),
                              ),
                            )
                          : null,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 14),
                      decoration: BoxDecoration(
                        color: CupertinoColors.systemGrey6,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      onSubmitted: _onSearch,
                      onChanged: (v) {
                        if (v.isEmpty && _searchQuery.isNotEmpty) {
                          _onSearch("");
                        }
                      },
                    ),
                    const SizedBox(height: 12),

                    // Constituency
                    CupertinoTextField(
                      controller: _constituencyController,
                      placeholder: "Filter by constituency...",
                      prefix: const Padding(
                        padding: EdgeInsets.only(left: 12),
                        child: Icon(CupertinoIcons.location,
                            color: CupertinoColors.systemGrey, size: 20),
                      ),
                      suffix: _constituencyQuery.isNotEmpty
                          ? GestureDetector(
                              onTap: () {
                                _constituencyController.clear();
                                setState(() => _constituencyQuery = "");
                                _fetchGrievances();
                              },
                              child: const Padding(
                                padding: EdgeInsets.only(right: 8),
                                child: Icon(CupertinoIcons.clear_circled_solid,
                                    size: 18,
                                    color: CupertinoColors.systemGrey),
                              ),
                            )
                          : null,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 14),
                      decoration: BoxDecoration(
                        color: CupertinoColors.systemGrey6,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      onSubmitted: (v) {
                        setState(() => _constituencyQuery = v.trim());
                        _fetchGrievances();
                      },
                      onChanged: (v) {
                        if (v.isEmpty && _constituencyQuery.isNotEmpty) {
                          setState(() => _constituencyQuery = "");
                          _fetchGrievances();
                        }
                      },
                    ),
                    const SizedBox(height: 16),

                    // Date Filters
                    const Text(
                      "Filter by Date",
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                        color: CupertinoColors.systemGrey,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: _datePickerButton(
                            label: "Start Date",
                            date: _startDate,
                            onTap: () => _selectDate(true),
                            onClear: () {
                              setState(() => _startDate = null);
                              _fetchGrievances();
                            },
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _datePickerButton(
                            label: "End Date",
                            date: _endDate,
                            onTap: () => _selectDate(false),
                            onClear: () {
                              setState(() => _endDate = null);
                              _fetchGrievances();
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),

                    // Clear all filters
                    if (hasFilters)
                      SizedBox(
                        width: double.infinity,
                        child: CupertinoButton(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          onPressed: _clearFilters,
                          child: const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(CupertinoIcons.clear_circled,
                                  size: 18,
                                  color: CupertinoColors.destructiveRed),
                              SizedBox(width: 6),
                              Text(
                                "Clear All Filters",
                                style: TextStyle(
                                    color: CupertinoColors.destructiveRed),
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),

            if (_showFilters) const SizedBox(height: 12),

            // ================= STATUS FILTER CHIPS =================
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: CupertinoFilterRow(
                options: const ["All", "Open", "In Progress", "Closed"],
                selected: selectedStatus,
                onSelected: (status) async {
                  setState(() {
                    selectedStatus = status;
                  });
                  await _fetchGrievances();
                },
              ),
            ),

            const SizedBox(height: 12),

            // Active filters indicator
            if (hasFilters)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  children: [
                    Icon(CupertinoIcons.line_horizontal_3_decrease,
                        size: 14, color: CupertinoColors.systemGrey),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        _buildFilterSummary(),
                        style: const TextStyle(
                          fontSize: 12,
                          color: CupertinoColors.systemGrey,
                          fontStyle: FontStyle.italic,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),

            // ================= LIST =================
            Expanded(
              child: _loading
                  ? const Center(child: CupertinoActivityIndicator())
                  : _error != null
                      ? Center(
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(CupertinoIcons.exclamationmark_circle,
                                  size: 48,
                                  color: CupertinoColors.systemGrey3),
                              const SizedBox(height: 16),
                              Text(
                                _error!,
                                style: const TextStyle(
                                    fontSize: 15,
                                    color: CupertinoColors.systemGrey),
                                textAlign: TextAlign.center,
                              ),
                              const SizedBox(height: 16),
                              CupertinoButton.filled(
                                onPressed: _fetchGrievances,
                                child: const Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(CupertinoIcons.refresh, size: 18),
                                    SizedBox(width: 6),
                                    Text("Retry"),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        )
                      : _allGrievances.isEmpty
                          ? Center(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  const Icon(CupertinoIcons.tray,
                                      size: 64,
                                      color: CupertinoColors.systemGrey4),
                                  const SizedBox(height: 16),
                                  Text(
                                    hasFilters
                                        ? "No grievances match your filters"
                                        : "No grievances found",
                                    style: const TextStyle(
                                        fontSize: 16,
                                        color: CupertinoColors.systemGrey),
                                  ),
                                  if (hasFilters) ...[
                                    const SizedBox(height: 8),
                                    CupertinoButton(
                                      onPressed: _clearFilters,
                                      child: const Text("Clear filters"),
                                    ),
                                  ],
                                ],
                              ),
                            )
                          : CustomScrollView(
                              slivers: [
                                CupertinoSliverRefreshControl(
                                  onRefresh: _fetchGrievances,
                                ),
                                SliverPadding(
                                  padding:
                                      const EdgeInsets.fromLTRB(16, 8, 16, 16),
                                  sliver: SliverList(
                                    delegate: SliverChildBuilderDelegate(
                                      (context, index) {
                                        final grievance =
                                            _allGrievances[index];
                                        return _buildGrievanceCard(grievance);
                                      },
                                      childCount: _allGrievances.length,
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

  String _buildFilterSummary() {
    List<String> parts = [];
    if (_searchQuery.isNotEmpty) {
      parts.add('Search: "$_searchQuery"');
    }
    if (_constituencyQuery.isNotEmpty) {
      parts.add('Constituency: "$_constituencyQuery"');
    }
    if (_startDate != null) {
      parts.add('From: ${DateFormat('dd/MM/yy').format(_startDate!)}');
    }
    if (_endDate != null) {
      parts.add('To: ${DateFormat('dd/MM/yy').format(_endDate!)}');
    }
    return parts.join(' | ');
  }

  Widget _statItem(String label, int count, IconData icon, [Color? color]) {
    return Column(
      children: [
        Icon(icon, color: color ?? CupertinoColors.white.withOpacity(0.7), size: 20),
        const SizedBox(height: 4),
        Text(
          count.toString(),
          style: const TextStyle(
            color: CupertinoColors.white,
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        Text(
          label,
          style: TextStyle(
            color: CupertinoColors.white.withOpacity(0.7),
            fontSize: 11,
          ),
        ),
      ],
    );
  }

  Widget _datePickerButton({
    required String label,
    required DateTime? date,
    required VoidCallback onTap,
    required VoidCallback onClear,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: CupertinoColors.systemGrey6,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: date != null
                ? AppTheme.primaryIndigo
                : CupertinoColors.systemGrey4,
          ),
        ),
        child: Row(
          children: [
            Icon(
              CupertinoIcons.calendar,
              size: 18,
              color: date != null
                  ? AppTheme.primaryIndigo
                  : CupertinoColors.systemGrey,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: const TextStyle(
                      fontSize: 10,
                      color: CupertinoColors.systemGrey,
                    ),
                  ),
                  Text(
                    date != null
                        ? DateFormat('dd MMM yyyy').format(date)
                        : "Select",
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: date != null
                          ? CupertinoColors.black
                          : CupertinoColors.systemGrey,
                    ),
                  ),
                ],
              ),
            ),
            if (date != null)
              GestureDetector(
                onTap: onClear,
                child: const Icon(CupertinoIcons.clear_circled_solid,
                    size: 16, color: CupertinoColors.systemGrey),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildGrievanceCard(Map<String, dynamic> grievance) {
    final status = grievance["uiStatus"] ?? "Open";
    final isLocked = grievance["isLocked"] == true;
    final isOffice =
        (grievance["source"] ?? "PUBLIC").toString().toUpperCase() == "OFFICE";
    final currentStage = grievance["currentStage"] ?? "RECEIVED";
    final createdAt = grievance["createdAt"];

    String formattedDate = "";
    if (createdAt != null) {
      try {
        final date = DateTime.parse(createdAt);
        formattedDate = DateFormat('dd MMM yyyy').format(date);
      } catch (_) {}
    }

    final id = grievance["id"];
    final grievanceId = id is int ? id.toString() : (id?.toString() ?? "");

    return GestureDetector(
      onTap: () async {
        if (widget.role == Roles.admin ||
            widget.role == Roles.superAdmin) {
          _openAdminDetailDialog(grievance);
        } else {
          AppNavigator.toGrievanceView(context,
              grievanceData: grievance, role: widget.role);
        }
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: CupertinoColors.white,
          borderRadius: BorderRadius.circular(16),
          border: isLocked
              ? Border.all(color: CupertinoColors.systemGrey4)
              : null,
          boxShadow: [
            BoxShadow(
              color: CupertinoColors.black.withOpacity(0.05),
              blurRadius: 8,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Icon
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: isLocked
                        ? CupertinoColors.systemGrey5
                        : AppTheme.primaryIndigo.withOpacity(0.1),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    isLocked
                        ? CupertinoIcons.lock_fill
                        : CupertinoIcons.doc_text,
                    color: isLocked
                        ? CupertinoColors.systemGrey
                        : AppTheme.primaryIndigo,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 14),

                // Info
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              grievance["petitionerName"] ?? "-",
                              style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.bold,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          _statusChip(status),
                          if (isOffice) ...[
                            const SizedBox(width: 6),
                            _officeChip(),
                          ],
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        grievance["grievanceType"]
                                ?.toString()
                                .replaceAll('_', ' ') ??
                            "-",
                        style: const TextStyle(
                          fontSize: 13,
                          color: CupertinoColors.systemGrey,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        grievance["constituency"] ?? "-",
                        style: const TextStyle(
                          fontSize: 12,
                          color: CupertinoColors.systemGrey2,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),

            const SizedBox(height: 12),
            Container(height: 0.5, color: CupertinoColors.systemGrey4),
            const SizedBox(height: 8),

            // Footer
            Row(
              children: [
                // Stage
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppTheme.primaryIndigo.withOpacity(0.08),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        CupertinoIcons.chart_bar_alt_fill,
                        size: 12,
                        color: AppTheme.primaryIndigo.withOpacity(0.7),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        _formatStage(currentStage),
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w500,
                          color: AppTheme.primaryIndigo.withOpacity(0.8),
                        ),
                      ),
                    ],
                  ),
                ),
                const Spacer(),
                // Date
                const Icon(CupertinoIcons.clock,
                    size: 12, color: CupertinoColors.systemGrey3),
                const SizedBox(width: 4),
                Text(
                  formattedDate,
                  style: const TextStyle(
                    fontSize: 11,
                    color: CupertinoColors.systemGrey2,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            // Action buttons
            Row(
              children: [
                Expanded(
                  child: CupertinoButton(
                    onPressed: () {
                      if (widget.role == Roles.admin ||
                          widget.role == Roles.superAdmin) {
                        _openAdminDetailDialog(grievance);
                      } else {
                        AppNavigator.toGrievanceView(context,
                            grievanceData: grievance, role: widget.role);
                      }
                    },
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    color: CupertinoColors.systemGrey6,
                    borderRadius: BorderRadius.circular(10),
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(CupertinoIcons.eye,
                            size: 16, color: AppTheme.primaryIndigo),
                        SizedBox(width: 6),
                        Text(
                          "View",
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.primaryIndigo,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: CupertinoButton(
                    onPressed: _downloadingIds
                            .contains(grievance["id"]?.toString() ?? "")
                        ? null
                        : () => _downloadPdf(grievance),
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    color: AppTheme.primaryIndigo,
                    borderRadius: BorderRadius.circular(10),
                    child: _downloadingIds
                            .contains(grievance["id"]?.toString() ?? "")
                        ? const CupertinoActivityIndicator(
                            color: CupertinoColors.white)
                        : const Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(CupertinoIcons.cloud_download,
                                  size: 16, color: CupertinoColors.white),
                              SizedBox(width: 6),
                              Text(
                                "PDF",
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: CupertinoColors.white,
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
      ),
    );
  }

  String _formatStage(String stage) {
    return stage.replaceAll('_', ' ').split(' ').map((w) {
      if (w.isEmpty) return '';
      return '${w[0].toUpperCase()}${w.substring(1).toLowerCase()}';
    }).join(' ');
  }

  Widget _statusChip(String status) {
    Color bg;
    Color text;

    switch (status) {
      case "Open":
        bg = const Color(0xFFECFDF5);
        text = const Color(0xFF10B981);
        break;
      case "In Progress":
      case "Verified":
        bg = const Color(0xFFFFF7ED);
        text = const Color(0xFFF59E0B);
        break;
      case "Closed":
        bg = CupertinoColors.systemGrey5;
        text = CupertinoColors.systemGrey;
        break;
      default:
        bg = CupertinoColors.systemGrey5;
        text = CupertinoColors.systemGrey;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        status,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.bold,
          color: text,
        ),
      ),
    );
  }

  Widget _officeChip() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: AppTheme.primaryIndigo,
        borderRadius: BorderRadius.circular(20),
      ),
      child: const Text(
        "Office",
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.bold,
          color: CupertinoColors.white,
        ),
      ),
    );
  }
}
