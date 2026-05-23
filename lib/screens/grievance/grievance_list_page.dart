import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:open_filex/open_filex.dart';

import '../../services/http_service.dart';
import '../../utils/access_control.dart';
import '../../theme/app_theme.dart';
import '../../widgets/widgets.dart';
import '../../widgets/admin_grievance_detail_dialog.dart';
import 'grievance_view_page.dart';
import 'grievance_type_picker_page.dart';

class GrievanceListPage extends StatefulWidget {
  final String role;
  const GrievanceListPage({super.key, required this.role});

  @override
  State<GrievanceListPage> createState() => _GrievanceListPageState();
}

class _GrievanceListPageState extends State<GrievanceListPage> {
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
      // Build query parameters
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
        // Add one day to include the end date fully
        queryParams['endDate'] = _endDate!.add(const Duration(days: 1)).toIso8601String();
      }

      String queryString = "";
      if (queryParams.isNotEmpty) {
        queryString = "?" + queryParams.entries.map((e) => "${e.key}=${Uri.encodeComponent(e.value)}").join("&");
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

        // Calculate stats
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

  Future<void> _selectDate(bool isStart) async {
    final DateTime? picked = await showDatePicker(
      context: context,
      initialDate: isStart ? (_startDate ?? DateTime.now()) : (_endDate ?? DateTime.now()),
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 365)),
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.light(
              primary: AppTheme.primaryIndigo,
              onPrimary: Colors.white,
              surface: Colors.white,
              onSurface: Colors.black,
            ),
          ),
          child: child!,
        );
      },
    );

    if (picked != null) {
      setState(() {
        if (isStart) {
          _startDate = picked;
        } else {
          _endDate = picked;
        }
      });
      _fetchGrievances();
    }
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

  void _openGrievance(Map<String, dynamic> grievance) async {
    if (widget.role == Roles.admin || widget.role == Roles.superAdmin) {
      AdminGrievanceDetailDialog.show(
        context: context,
        grievance: grievance,
      );
      return;
    }
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => GrievanceViewPage(
          grievanceData: grievance,
          role: widget.role,
        ),
      ),
    );
    _fetchGrievances();
  }

  Future<void> _downloadPdf(Map<String, dynamic> grievance) async {
    final id = grievance["id"]?.toString() ?? "";
    if (id.isEmpty) return;
    if (_downloadingIds.contains(id)) return;

    // TEMPLE_VISIT uses a dedicated endpoint that returns the Darshan letter
    // and atomically marks the grievance RESOLVED on success — so the row
    // becomes Resolved only once the staff actually downloads.
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
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
                content: Text("Could not open PDF: ${result.message}")),
          );
        } else if (isTempleVisit) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
                content: Text("Letter downloaded. Grievance resolved.")),
          );
        }
        // Refresh so the new RESOLVED status (for temple-visit) shows up.
        if (isTempleVisit) _fetchGrievances();
      } else {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("PDF download failed (${res.statusCode})")),
        );
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Download error / no internet")),
      );
    } finally {
      if (mounted) setState(() => _downloadingIds.remove(id));
    }
  }

  Future<void> _openCreate() async {
    final canCreate = AccessControl.can(widget.role, ActionPermission.create) &&
        widget.role != Roles.superAdmin;

    if (!canCreate) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("You have view-only access.")),
      );
      return;
    }

    final result = await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => GrievanceTypePickerPage(
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

    return Scaffold(
      backgroundColor: AppTheme.background,
      floatingActionButton: canCreate
          ? FloatingActionButton(
              backgroundColor: AppTheme.primaryIndigo,
              onPressed: _openCreate,
              child: const Icon(Icons.add, color: Colors.white),
            )
          : null,
      appBar: AppBar(
        elevation: 0,
        backgroundColor: AppTheme.primaryIndigo,
        title: const Text(
          "Old Grievances",
          style: TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        actions: [
          // Filter toggle
          Stack(
            children: [
              IconButton(
                icon: Icon(
                  _showFilters ? Icons.filter_list_off : Icons.filter_list,
                  color: Colors.white,
                ),
                onPressed: () {
                  setState(() {
                    _showFilters = !_showFilters;
                  });
                },
              ),
              if (hasFilters)
                Positioned(
                  right: 8,
                  top: 8,
                  child: Container(
                    width: 8,
                    height: 8,
                    decoration: const BoxDecoration(
                      color: Colors.orange,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
            ],
          ),
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white),
            onPressed: _fetchGrievances,
          ),
        ],
      ),
      body: Column(
        children: [
          // ================= STATS CARD =================
          Container(
            margin: const EdgeInsets.all(16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [AppTheme.primaryIndigo, AppTheme.primaryIndigo.withOpacity(0.8)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: AppTheme.primaryIndigo.withOpacity(0.3),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _statItem("Total", _totalCount, Icons.folder_copy_outlined),
                    _statItem("Open", _openCount, Icons.folder_open, Colors.green),
                    _statItem("Progress", _inProgressCount, Icons.pending, Colors.orange),
                    _statItem("Closed", _closedCount, Icons.check_circle, Colors.grey),
                  ],
                ),
              ],
            ),
          ),

          // ================= SEARCH & FILTERS =================
          AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            height: _showFilters ? null : 0,
            child: _showFilters
                ? Container(
                    margin: const EdgeInsets.symmetric(horizontal: 16),
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
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
                        // Search by name / phone
                        TextField(
                          controller: _searchController,
                          decoration: InputDecoration(
                            hintText: "Search by name or phone...",
                            prefixIcon: const Icon(Icons.search, color: Colors.grey),
                            suffixIcon: _searchQuery.isNotEmpty
                                ? IconButton(
                                    icon: const Icon(Icons.clear, size: 20),
                                    onPressed: () {
                                      _searchController.clear();
                                      _onSearch("");
                                    },
                                  )
                                : null,
                            filled: true,
                            fillColor: Colors.grey.shade50,
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: BorderSide.none,
                            ),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
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
                        TextField(
                          controller: _constituencyController,
                          decoration: InputDecoration(
                            hintText: "Filter by constituency...",
                            prefixIcon: const Icon(Icons.location_on, color: Colors.grey),
                            suffixIcon: _constituencyQuery.isNotEmpty
                                ? IconButton(
                                    icon: const Icon(Icons.clear, size: 20),
                                    onPressed: () {
                                      _constituencyController.clear();
                                      setState(() => _constituencyQuery = "");
                                      _fetchGrievances();
                                    },
                                  )
                                : null,
                            filled: true,
                            fillColor: Colors.grey.shade50,
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: BorderSide.none,
                            ),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
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
                            color: Colors.grey,
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
                            child: TextButton.icon(
                              onPressed: _clearFilters,
                              icon: const Icon(Icons.clear_all, size: 18),
                              label: const Text("Clear All Filters"),
                              style: TextButton.styleFrom(
                                foregroundColor: Colors.red,
                              ),
                            ),
                          ),
                      ],
                    ),
                  )
                : const SizedBox.shrink(),
          ),

          if (_showFilters) const SizedBox(height: 12),

          // ================= STATUS FILTER CHIPS =================
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(30),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.06),
                  blurRadius: 6,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Row(
              children: [
                _filterChip("All"),
                _filterChip("Open"),
                _filterChip("In Progress"),
                _filterChip("Closed"),
              ],
            ),
          ),

          const SizedBox(height: 12),

          // Active filters indicator
          if (hasFilters)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  Icon(Icons.filter_alt, size: 14, color: Colors.grey.shade600),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      _buildFilterSummary(),
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey.shade600,
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
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.error_outline, size: 48, color: Colors.grey.shade400),
                            const SizedBox(height: 16),
                            Text(
                              _error!,
                              style: TextStyle(fontSize: 15, color: Colors.grey.shade600),
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 16),
                            ElevatedButton.icon(
                              onPressed: _fetchGrievances,
                              icon: const Icon(Icons.refresh),
                              label: const Text("Retry"),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppTheme.primaryIndigo,
                                foregroundColor: Colors.white,
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
                                Icon(Icons.inbox_outlined, size: 64, color: Colors.grey.shade300),
                                const SizedBox(height: 16),
                                Text(
                                  hasFilters ? "No grievances match your filters" : "No grievances found",
                                  style: TextStyle(fontSize: 16, color: Colors.grey.shade500),
                                ),
                                if (hasFilters) ...[
                                  const SizedBox(height: 8),
                                  TextButton(
                                    onPressed: _clearFilters,
                                    child: const Text("Clear filters"),
                                  ),
                                ],
                              ],
                            ),
                          )
                        : RefreshIndicator(
                            onRefresh: _fetchGrievances,
                            child: ListView.builder(
                              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                              itemCount: _allGrievances.length,
                              itemBuilder: (context, index) {
                                final grievance = _allGrievances[index];
                                return _buildGrievanceCard(grievance);
                              },
                            ),
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
        Icon(icon, color: color ?? Colors.white70, size: 20),
        const SizedBox(height: 4),
        Text(
          count.toString(),
          style: const TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white70,
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
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: Colors.grey.shade50,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: date != null ? AppTheme.primaryIndigo : Colors.grey.shade200,
          ),
        ),
        child: Row(
          children: [
            Icon(
              Icons.calendar_today,
              size: 18,
              color: date != null ? AppTheme.primaryIndigo : Colors.grey,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 10,
                      color: Colors.grey.shade600,
                    ),
                  ),
                  Text(
                    date != null ? DateFormat('dd MMM yyyy').format(date) : "Select",
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: date != null ? Colors.black87 : Colors.grey,
                    ),
                  ),
                ],
              ),
            ),
            if (date != null)
              GestureDetector(
                onTap: onClear,
                child: const Icon(Icons.close, size: 16, color: Colors.grey),
              ),
          ],
        ),
      ),
    );
  }

  Widget _filterChip(String status) {
    final bool isSelected = selectedStatus == status;

    return Expanded(
      child: GestureDetector(
        onTap: () async {
          setState(() {
            selectedStatus = status;
          });
          await _fetchGrievances();
        },
        child: Container(
          height: 40,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: isSelected ? AppTheme.primaryIndigo : Colors.transparent,
            borderRadius: BorderRadius.circular(24),
          ),
          child: Text(
            status,
            style: TextStyle(
              color: isSelected ? Colors.white : Colors.black87,
              fontWeight: FontWeight.w600,
              fontSize: 12,
            ),
          ),
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

    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: () => _openGrievance(grievance),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: isLocked ? Border.all(color: Colors.grey.shade300) : null,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
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
                CircleAvatar(
                  radius: 22,
                  backgroundColor: isLocked
                      ? Colors.grey.shade100
                      : AppTheme.primaryIndigo.withOpacity(0.1),
                  child: Icon(
                    isLocked ? Icons.lock : Icons.assignment,
                    color: isLocked ? Colors.grey : AppTheme.primaryIndigo,
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
                        grievance["grievanceType"]?.toString().replaceAll('_', ' ') ?? "-",
                        style: TextStyle(
                          fontSize: 13,
                          color: Colors.grey.shade700,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        grievance["constituency"] ?? "-",
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey.shade500,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),

            const SizedBox(height: 12),
            const Divider(height: 1),
            const SizedBox(height: 8),

            // Footer
            Row(
              children: [
                // Stage
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppTheme.primaryIndigo.withOpacity(0.08),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.timeline,
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
                Icon(Icons.access_time, size: 12, color: Colors.grey.shade400),
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
            const SizedBox(height: 8),
            // Action buttons
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _openGrievance(grievance),
                    icon: const Icon(Icons.visibility_outlined, size: 16),
                    label: const Text("View"),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppTheme.primaryIndigo,
                      side: BorderSide(
                          color: AppTheme.primaryIndigo.withOpacity(0.4)),
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10)),
                      textStyle: const TextStyle(
                          fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: _downloadingIds
                            .contains(grievance["id"]?.toString() ?? "")
                        ? null
                        : () => _downloadPdf(grievance),
                    icon: _downloadingIds
                            .contains(grievance["id"]?.toString() ?? "")
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation(Colors.white),
                            ),
                          )
                        : const Icon(Icons.picture_as_pdf, size: 16),
                    label: const Text("PDF"),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.primaryIndigo,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10)),
                      textStyle: const TextStyle(
                          fontSize: 12, fontWeight: FontWeight.w600),
                      elevation: 0,
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
        bg = Colors.green.shade50;
        text = Colors.green;
        break;
      case "In Progress":
      case "Verified":
        bg = Colors.orange.shade50;
        text = Colors.orange;
        break;
      case "Closed":
        bg = Colors.grey.shade200;
        text = Colors.grey.shade700;
        break;
      default:
        bg = Colors.grey.shade200;
        text = Colors.grey;
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
          color: Colors.white,
        ),
      ),
    );
  }
}
