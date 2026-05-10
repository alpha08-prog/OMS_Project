import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:open_filex/open_filex.dart';

import '../../services/http_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/date_range_filter.dart';
import '../../widgets/admin_grievance_detail_dialog.dart';

class VerificationQueuePage extends StatefulWidget {
  const VerificationQueuePage({super.key});

  @override
  State<VerificationQueuePage> createState() => _VerificationQueuePageState();
}

class _VerificationQueuePageState extends State<VerificationQueuePage> {
  bool _loading = true;
  String? _error;

  // Data
  List<Map<String, dynamic>> _grievances = [];
  List<Map<String, dynamic>> _staffList = [];

  // Filters
  final _searchController = TextEditingController();
  final _constituencyController = TextEditingController();
  String _searchQuery = "";
  String _constituencyQuery = "";
  String _typeFilter = "All";
  String _statusFilter = "Pending"; // Pending = isVerified=false
  DateTime? _dateFrom;
  DateTime? _dateTo;
  bool _showFilters = false;
  final Set<String> _downloadingIds = {};

  static const _grievanceTypes = [
    'All',
    'WATER',
    'ROAD',
    'POLICE',
    'HEALTH',
    'TRANSFER',
    'FINANCIAL_AID',
    'ELECTRICITY',
    'EDUCATION',
    'HOUSING',
    'OTHER',
  ];

  @override
  void initState() {
    super.initState();
    _fetchAll();
  }

  @override
  void dispose() {
    _searchController.dispose();
    _constituencyController.dispose();
    super.dispose();
  }

  Future<void> _fetchAll() async {
    await Future.wait([_fetchGrievances(), _fetchStaff()]);
  }

  Future<void> _fetchGrievances() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final params = <String, String>{'limit': '100'};

      // Status filter
      switch (_statusFilter) {
        case "Pending":
          params['isVerified'] = 'false';
          break;
        case "Verified":
          params['status'] = 'VERIFIED';
          break;
        case "Rejected":
          params['status'] = 'REJECTED';
          break;
        case "All":
          break;
      }

      if (_searchQuery.isNotEmpty) params['search'] = _searchQuery;
      if (_constituencyQuery.isNotEmpty) {
        params['constituency'] = _constituencyQuery;
      }
      if (_typeFilter != "All") params['grievanceType'] = _typeFilter;

      final qs = params.entries
          .map((e) => "${e.key}=${Uri.encodeComponent(e.value)}")
          .join("&");
      final res = await HttpService.get("/api/grievances?$qs");

      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list = decoded is List ? decoded : (decoded["data"] ?? []);
        if (mounted) {
          setState(() {
            _grievances = list
                .map<Map<String, dynamic>>(
                    (e) => Map<String, dynamic>.from(e))
                .toList();
            _loading = false;
          });
        }
      } else {
        if (mounted) {
          setState(() {
            _error = "Failed to load (${res.statusCode})";
            _loading = false;
          });
        }
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = "Server error / No internet";
          _loading = false;
        });
      }
    }
  }

  Future<void> _fetchStaff() async {
    try {
      final res = await HttpService.get("/api/tasks/staff");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list =
            decoded is List ? decoded : (decoded["data"] ?? []);
        _staffList = list
            .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
            .toList();
      }
    } catch (_) {}
  }

  void _openAdminDetailDialog(Map<String, dynamic> g) {
    AdminGrievanceDetailDialog.show(
      context: context,
      grievance: g,
    );
  }

  Future<void> _downloadPdf(Map<String, dynamic> g) async {
    final id = g["id"]?.toString() ?? "";
    if (id.isEmpty || _downloadingIds.contains(id)) return;
    setState(() => _downloadingIds.add(id));

    try {
      final res = await HttpService.downloadFile("/api/pdf/grievance/$id");
      if (res.statusCode == 200) {
        final dir = await getTemporaryDirectory();
        final file = File("${dir.path}/grievance_$id.pdf");
        await file.writeAsBytes(res.bodyBytes);
        final result = await OpenFilex.open(file.path);
        if (!mounted) return;
        if (result.type != ResultType.done) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text("Could not open PDF: ${result.message}")),
          );
        }
      } else {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("PDF failed (${res.statusCode})")),
        );
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Download error / No internet")),
      );
    } finally {
      if (mounted) setState(() => _downloadingIds.remove(id));
    }
  }

  Future<void> _reject(Map<String, dynamic> g) async {
    final id = g["id"]?.toString() ?? "";
    if (id.isEmpty) return;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("Reject Grievance"),
        content: Text(
            "Reject grievance from ${g["petitionerName"] ?? "this petitioner"}? This cannot be undone."),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text("Cancel")),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text("Reject"),
          ),
        ],
      ),
    );
    if (confirm != true) return;

    try {
      final res = await HttpService.patch(
        "/api/grievances/$id/status",
        {"status": "REJECTED"},
      );
      if (!mounted) return;
      if (res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text("Grievance rejected"),
              backgroundColor: Colors.red),
        );
        _fetchGrievances();
      } else {
        String msg = "Failed (${res.statusCode})";
        try {
          msg = jsonDecode(res.body)["message"] ?? msg;
        } catch (_) {}
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(msg)));
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server error / No internet")),
      );
    }
  }

  Future<void> _openVerifyAssign(Map<String, dynamic> g) async {
    if (_staffList.isEmpty) {
      // Try to fetch one more time
      await _fetchStaff();
      if (_staffList.isEmpty) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("No staff available to assign")),
        );
        return;
      }
    }

    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => VerifyAssignSheet(
        grievance: g,
        staffList: _staffList,
      ),
    );

    if (result == true) {
      _fetchGrievances();
    }
  }

  void _clearFilters() {
    setState(() {
      _searchQuery = "";
      _searchController.clear();
      _constituencyQuery = "";
      _constituencyController.clear();
      _typeFilter = "All";
      _statusFilter = "Pending";
      _dateFrom = null;
      _dateTo = null;
    });
    _fetchGrievances();
  }

  List<Map<String, dynamic>> get _visibleGrievances {
    if (_dateFrom == null && _dateTo == null) return _grievances;
    return _grievances.where((g) {
      final dt = DateTime.tryParse(g['createdAt']?.toString() ?? '');
      return dateInRange(dt, from: _dateFrom, to: _dateTo);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final hasFilters = _searchQuery.isNotEmpty ||
        _constituencyQuery.isNotEmpty ||
        _typeFilter != "All" ||
        _statusFilter != "Pending" ||
        _dateFrom != null ||
        _dateTo != null;
    final visible = _visibleGrievances;

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        backgroundColor: AppTheme.primaryIndigo,
        title: const Text(
          "Verify Grievance",
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          Stack(
            children: [
              IconButton(
                icon: Icon(
                  _showFilters ? Icons.filter_list_off : Icons.filter_list,
                  color: Colors.white,
                ),
                onPressed: () =>
                    setState(() => _showFilters = !_showFilters),
              ),
              if (hasFilters)
                Positioned(
                  right: 8,
                  top: 8,
                  child: Container(
                    width: 8,
                    height: 8,
                    decoration: const BoxDecoration(
                        color: Colors.orange, shape: BoxShape.circle),
                  ),
                ),
            ],
          ),
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white),
            onPressed: _fetchAll,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _fetchGrievances,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (_showFilters) ...[
              _buildFilters(hasFilters),
              const SizedBox(height: 12),
            ],
            _buildSectionHeader(),
            const SizedBox(height: 12),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 60),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null)
              _buildError()
            else if (visible.isEmpty)
              _buildEmpty()
            else
              ...visible.map(_buildCard),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionHeader() {
    final title = switch (_statusFilter) {
      "Verified" => "Verified Grievances",
      "Rejected" => "Rejected Grievances",
      "All" => "All Grievances",
      _ => "Pending Verification Queue",
    };
    return Text(
      "$title (${_visibleGrievances.length})",
      style: const TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.bold,
        color: AppTheme.foreground,
      ),
    );
  }

  Widget _buildFilters(bool hasFilters) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: _searchController,
            decoration: InputDecoration(
              hintText: "Search by name or phone...",
              prefixIcon: const Icon(Icons.search, color: Colors.grey),
              suffixIcon: _searchQuery.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear, size: 18),
                      onPressed: () {
                        _searchController.clear();
                        setState(() => _searchQuery = "");
                        _fetchGrievances();
                      },
                    )
                  : null,
              filled: true,
              fillColor: Colors.grey.shade50,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide.none,
              ),
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            ),
            onSubmitted: (v) {
              setState(() => _searchQuery = v.trim());
              _fetchGrievances();
            },
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _constituencyController,
            decoration: InputDecoration(
              hintText: "Filter by constituency...",
              prefixIcon: const Icon(Icons.location_on, color: Colors.grey),
              suffixIcon: _constituencyQuery.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear, size: 18),
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
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide.none,
              ),
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            ),
            onSubmitted: (v) {
              setState(() => _constituencyQuery = v.trim());
              _fetchGrievances();
            },
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  value: _typeFilter,
                  isExpanded: true,
                  decoration: InputDecoration(
                    labelText: "Type",
                    isDense: true,
                    filled: true,
                    fillColor: Colors.grey.shade50,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: BorderSide.none,
                    ),
                  ),
                  items: _grievanceTypes
                      .map((t) => DropdownMenuItem(
                          value: t,
                          child: Text(
                            t == 'All' ? 'All types' : t.replaceAll('_', ' '),
                            style: const TextStyle(fontSize: 13),
                          )))
                      .toList(),
                  onChanged: (v) {
                    setState(() => _typeFilter = v ?? 'All');
                    _fetchGrievances();
                  },
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: DropdownButtonFormField<String>(
                  value: _statusFilter,
                  isExpanded: true,
                  decoration: InputDecoration(
                    labelText: "Status",
                    isDense: true,
                    filled: true,
                    fillColor: Colors.grey.shade50,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: BorderSide.none,
                    ),
                  ),
                  items: const [
                    DropdownMenuItem(value: "Pending", child: Text("Pending")),
                    DropdownMenuItem(value: "Verified", child: Text("Verified")),
                    DropdownMenuItem(value: "Rejected", child: Text("Rejected")),
                    DropdownMenuItem(value: "All", child: Text("All")),
                  ],
                  onChanged: (v) {
                    setState(() => _statusFilter = v ?? 'Pending');
                    _fetchGrievances();
                  },
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          DateRangeFilter(
            from: _dateFrom,
            to: _dateTo,
            tint: AppTheme.primaryIndigo,
            padding: EdgeInsets.zero,
            onFromChanged: (d) => setState(() => _dateFrom = d),
            onToChanged: (d) => setState(() => _dateTo = d),
            onClear: () => setState(() {
              _dateFrom = null;
              _dateTo = null;
            }),
          ),
          if (hasFilters) ...[
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: TextButton.icon(
                onPressed: _clearFilters,
                icon: const Icon(Icons.clear_all, size: 18),
                label: const Text("Clear filters"),
                style: TextButton.styleFrom(foregroundColor: Colors.red),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildError() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 60),
        child: Column(
          children: [
            Icon(Icons.error_outline,
                size: 48, color: Colors.grey.shade400),
            const SizedBox(height: 12),
            Text(_error!,
                style: TextStyle(color: Colors.grey.shade700)),
            const SizedBox(height: 12),
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
      ),
    );
  }

  Widget _buildEmpty() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 60),
        child: Column(
          children: [
            Icon(Icons.inbox_outlined, size: 56, color: Colors.grey.shade300),
            const SizedBox(height: 12),
            Text("No grievances match",
                style: TextStyle(
                    color: Colors.grey.shade600, fontSize: 14)),
          ],
        ),
      ),
    );
  }

  Widget _buildCard(Map<String, dynamic> g) {
    final status = (g["status"] ?? "OPEN").toString();
    final isOffice =
        (g["source"] ?? "PUBLIC").toString().toUpperCase() == "OFFICE";
    final petitioner = g["petitionerName"] ?? "-";
    final type = (g["grievanceType"] ?? "").toString();
    final constituency = g["constituency"] ?? "-";
    final phone = g["mobileNumber"] ?? "";
    final desc = g["description"] ?? "";
    final monetary = g["monetaryValue"];
    final createdBy = g["createdBy"]?["name"] ?? "—";
    final id = g["id"]?.toString() ?? "";
    final isDownloading = _downloadingIds.contains(id);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
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
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppTheme.primaryIndigo50,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.description,
                    color: AppTheme.primaryIndigo),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            petitioner,
                            style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.bold,
                                color: AppTheme.foreground),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 6),
                        _statusPill(status),
                        if (isOffice) ...[
                          const SizedBox(width: 6),
                          _officeChip(),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [
                        type.replaceAll('_', ' '),
                        constituency,
                        if (monetary != null) "₹${_formatMoney(monetary)}",
                      ].join(" · "),
                      style: TextStyle(
                          fontSize: 12, color: Colors.grey.shade700),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(Icons.phone,
                            size: 12, color: Colors.pink.shade300),
                        const SizedBox(width: 4),
                        Text(
                          phone,
                          style: TextStyle(
                              fontSize: 11, color: Colors.grey.shade700),
                        ),
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            "· Created by: $createdBy",
                            style: TextStyle(
                                fontSize: 11,
                                color: Colors.grey.shade600),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            desc,
            style: const TextStyle(fontSize: 13, height: 1.4),
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 12),
          // 4 action buttons
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _openAdminDetailDialog(g),
                  icon: const Icon(Icons.visibility_outlined, size: 14),
                  label: const Text("View"),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.grey.shade800,
                    side: BorderSide(color: Colors.grey.shade300),
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8)),
                    textStyle: const TextStyle(
                        fontSize: 11, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: g["isVerified"] == true
                      ? null
                      : () => _openVerifyAssign(g),
                  icon: const Icon(Icons.check_circle, size: 14),
                  label: const Text("Verify"),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.saffron,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8)),
                    textStyle: const TextStyle(
                        fontSize: 11, fontWeight: FontWeight.w600),
                    elevation: 0,
                  ),
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: isDownloading ? null : () => _downloadPdf(g),
                  icon: isDownloading
                      ? const SizedBox(
                          width: 12,
                          height: 12,
                          child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor:
                                  AlwaysStoppedAnimation(Colors.white)),
                        )
                      : const Icon(Icons.picture_as_pdf, size: 14),
                  label: const Text("PDF"),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.saffronDark,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8)),
                    textStyle: const TextStyle(
                        fontSize: 11, fontWeight: FontWeight.w600),
                    elevation: 0,
                  ),
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: status == "REJECTED" ? null : () => _reject(g),
                  icon: const Icon(Icons.cancel, size: 14),
                  label: const Text("Reject"),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.destructiveRed,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8)),
                    textStyle: const TextStyle(
                        fontSize: 11, fontWeight: FontWeight.w600),
                    elevation: 0,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _formatMoney(dynamic v) {
    try {
      final n = (v is num) ? v : num.parse(v.toString());
      return NumberFormat('#,##,###').format(n);
    } catch (_) {
      return v.toString();
    }
  }

  Widget _statusPill(String status) {
    Color bg;
    Color fg;
    switch (status.toUpperCase()) {
      case "OPEN":
        bg = const Color(0xFFEEF2FF);
        fg = const Color(0xFF4338CA);
        break;
      case "IN_PROGRESS":
        bg = const Color(0xFFFFFBEB);
        fg = const Color(0xFFB45309);
        break;
      case "VERIFIED":
        bg = const Color(0xFFECFDF5);
        fg = const Color(0xFF065F46);
        break;
      case "RESOLVED":
        bg = const Color(0xFFE0F2FE);
        fg = const Color(0xFF0369A1);
        break;
      case "REJECTED":
        bg = const Color(0xFFFEE2E2);
        fg = const Color(0xFFB91C1C);
        break;
      default:
        bg = Colors.grey.shade200;
        fg = Colors.grey.shade700;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        status,
        style: TextStyle(
            fontSize: 10, fontWeight: FontWeight.bold, color: fg),
      ),
    );
  }

  Widget _officeChip() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: AppTheme.primaryIndigo,
        borderRadius: BorderRadius.circular(8),
      ),
      child: const Text(
        "Office",
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.bold,
          color: Colors.white,
        ),
      ),
    );
  }
}

// =====================================================
// VERIFY & ASSIGN BOTTOM SHEET
// =====================================================
class VerifyAssignSheet extends StatefulWidget {
  final Map<String, dynamic> grievance;
  final List<Map<String, dynamic>> staffList;
  const VerifyAssignSheet({
    required this.grievance,
    required this.staffList,
  });

  @override
  State<VerifyAssignSheet> createState() => VerifyAssignSheetState();
}

class VerifyAssignSheetState extends State<VerifyAssignSheet> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController titleController;
  late final TextEditingController descriptionController;
  String? _selectedStaffId;
  String? _selectedPriority;
  DateTime? _dueDate;
  bool _submitting = false;
  String? _dueDateError;

  @override
  void initState() {
    super.initState();
    final g = widget.grievance;
    final type = (g["grievanceType"] ?? "").toString();
    final petitioner = g["petitionerName"] ?? "-";
    final constituency = g["constituency"] ?? "-";
    final desc = g["description"] ?? "";

    titleController =
        TextEditingController(text: "Follow up on $type - $petitioner");
    descriptionController = TextEditingController(
      text: "Grievance Type: $type\n"
          "Petitioner: $petitioner\n"
          "Constituency: $constituency\n"
          "Description: $desc",
    );
  }

  @override
  void dispose() {
    titleController.dispose();
    descriptionController.dispose();
    super.dispose();
  }

  Future<void> _pickDueDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _dueDate ?? DateTime.now().add(const Duration(days: 7)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null) {
      setState(() {
        _dueDate = picked;
        _dueDateError = null;
      });
    }
  }

  Future<void> _submit() async {
    final formOk = _formKey.currentState?.validate() ?? false;
    final dueOk = _dueDate != null;
    if (!dueOk) {
      setState(() => _dueDateError = "Please select a due date");
    }
    if (!formOk || !dueOk) return;
    if (_selectedStaffId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Please select a staff member")),
      );
      return;
    }
    setState(() => _submitting = true);

    final id = widget.grievance["id"]?.toString() ?? "";

    try {
      // Step 1: verify grievance
      final verifyRes =
          await HttpService.patch("/api/grievances/$id/verify", {});
      if (verifyRes.statusCode != 200) {
        if (!mounted) return;
        String msg = "Verify failed (${verifyRes.statusCode})";
        try {
          msg = jsonDecode(verifyRes.body)["message"] ?? msg;
        } catch (_) {}
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(msg)));
        setState(() => _submitting = false);
        return;
      }

      // Step 2: create task assignment
      final taskBody = <String, dynamic>{
        "title": titleController.text.trim(),
        "taskType": "GRIEVANCE",
        "assignedToId": _selectedStaffId,
        "description": descriptionController.text.trim(),
        "priority": _selectedPriority,
        "dueDate": _dueDate!.toIso8601String(),
        "referenceId": id,
        "referenceType": "GRIEVANCE",
      };

      final taskRes = await HttpService.post("/api/tasks", taskBody);

      if (!mounted) return;

      if (taskRes.statusCode == 200 || taskRes.statusCode == 201) {
        final staff = widget.staffList.firstWhere(
          (s) => s["id"]?.toString() == _selectedStaffId,
          orElse: () => {"name": "staff"},
        );
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text("Verified & assigned to ${staff["name"]}"),
            backgroundColor: AppTheme.successGreen,
          ),
        );
        Navigator.pop(context, true);
      } else {
        // Verified but task failed
        String msg = "Verified, but assignment failed (${taskRes.statusCode})";
        try {
          final m = jsonDecode(taskRes.body)["message"];
          if (m != null) msg = "Verified, but $m";
        } catch (_) {}
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), backgroundColor: Colors.orange),
        );
        Navigator.pop(context, true); // still refresh list — verify worked
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server error / No internet")),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final g = widget.grievance;
    final petitioner = g["petitionerName"] ?? "-";
    final type = (g["grievanceType"] ?? "").toString().replaceAll('_', ' ');
    final constituency = g["constituency"] ?? "-";
    final viewInsetsBottom = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: viewInsetsBottom),
      child: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Center(
                      child: Container(
                        width: 36,
                        height: 4,
                        margin: const EdgeInsets.only(bottom: 12),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade300,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.person_add_alt_1,
                            color: AppTheme.foreground, size: 22),
                        const SizedBox(width: 8),
                        const Expanded(
                          child: Text(
                            "Verify & Assign Task",
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                              color: AppTheme.foreground,
                            ),
                          ),
                        ),
                        IconButton(
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(),
                          onPressed: _submitting
                              ? null
                              : () => Navigator.pop(context),
                          icon: const Icon(Icons.close),
                          color: Colors.grey.shade600,
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Padding(
                      padding: const EdgeInsets.only(left: 30),
                      child: Text(
                        "Submitting this form will verify the grievance and assign a follow-up task to a staff member",
                        style: TextStyle(
                            fontSize: 12, color: Colors.grey.shade600),
                      ),
                    ),
                    const SizedBox(height: 14),
                    // Verified Grievance context box
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppTheme.primaryIndigo50,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            "Verified Grievance",
                            style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: AppTheme.primaryIndigo),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            "$petitioner • $type • $constituency",
                            style: const TextStyle(
                                fontSize: 13, color: AppTheme.primaryIndigo),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    _label("Assign To Staff *"),
                    const SizedBox(height: 4),
                    DropdownButtonFormField<String>(
                      value: _selectedStaffId,
                      isExpanded: true,
                      hint: const Text("Select staff member"),
                      decoration: InputDecoration(
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 12),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide:
                              BorderSide(color: Colors.grey.shade300),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide:
                              const BorderSide(color: AppTheme.saffron, width: 1.5),
                        ),
                      ),
                      items: widget.staffList
                          .map((s) => DropdownMenuItem<String>(
                                value: s["id"]?.toString(),
                                child: Text(
                                  s["name"]?.toString() ?? "-",
                                  style: const TextStyle(fontSize: 14),
                                ),
                              ))
                          .toList(),
                      onChanged: (v) =>
                          setState(() => _selectedStaffId = v),
                      validator: (v) => v == null ? "Required" : null,
                    ),
                    const SizedBox(height: 12),
                    _label("Task Title *"),
                    const SizedBox(height: 4),
                    TextFormField(
                      controller: titleController,
                      decoration: _inputDecoration(),
                      validator: (v) => (v == null || v.trim().isEmpty)
                          ? "Required"
                          : null,
                    ),
                    const SizedBox(height: 12),
                    _label("Task Description"),
                    const SizedBox(height: 4),
                    TextFormField(
                      controller: descriptionController,
                      maxLines: 4,
                      decoration: _inputDecoration(),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _label("Priority *"),
                              const SizedBox(height: 4),
                              DropdownButtonFormField<String>(
                                value: _selectedPriority,
                                isExpanded: true,
                                decoration: _inputDecoration().copyWith(
                                  hintText: "Select priority",
                                ),
                                items: const [
                                  DropdownMenuItem(
                                      value: "LOW", child: Text("Low")),
                                  DropdownMenuItem(
                                      value: "NORMAL", child: Text("Normal")),
                                  DropdownMenuItem(
                                      value: "HIGH", child: Text("High")),
                                ],
                                onChanged: (v) =>
                                    setState(() => _selectedPriority = v),
                                validator: (v) => v == null
                                    ? "Please select a priority"
                                    : null,
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _label("Due Date *"),
                              const SizedBox(height: 4),
                              InkWell(
                                onTap: _pickDueDate,
                                child: InputDecorator(
                                  decoration: _inputDecoration().copyWith(
                                    errorText: _dueDateError,
                                  ),
                                  child: Text(
                                    _dueDate != null
                                        ? DateFormat('dd/MM/yyyy')
                                            .format(_dueDate!)
                                        : "dd-mm-yyyy",
                                    style: TextStyle(
                                      fontSize: 14,
                                      color: _dueDate != null
                                          ? Colors.black87
                                          : Colors.grey,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: _submitting
                                ? null
                                : () => Navigator.pop(context),
                            style: OutlinedButton.styleFrom(
                              padding:
                                  const EdgeInsets.symmetric(vertical: 14),
                              foregroundColor: Colors.grey.shade800,
                              side: BorderSide(color: Colors.grey.shade300),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                            ),
                            child: const Text("Cancel"),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: _submitting ? null : _submit,
                            icon: _submitting
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      valueColor: AlwaysStoppedAnimation(
                                          Colors.white),
                                    ),
                                  )
                                : const Icon(Icons.person_add, size: 18),
                            label: Text(_submitting
                                ? "Submitting..."
                                : "Verify & Assign"),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppTheme.saffron,
                              foregroundColor: Colors.white,
                              padding:
                                  const EdgeInsets.symmetric(vertical: 14),
                              elevation: 0,
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                              textStyle: const TextStyle(
                                  fontSize: 14, fontWeight: FontWeight.bold),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _label(String text) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: AppTheme.foreground,
      ),
    );
  }

  InputDecoration _inputDecoration() {
    return InputDecoration(
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: Colors.grey.shade300),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: Colors.grey.shade300),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide:
            const BorderSide(color: AppTheme.saffron, width: 1.5),
      ),
    );
  }
}
