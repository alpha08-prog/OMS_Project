import 'dart:convert';
import 'dart:io';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:open_filex/open_filex.dart';

import '../../../services/http_service.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../widgets/cupertino/cupertino_form_helpers.dart';
import '../../../widgets/cupertino/cupertino_date_range_filter.dart';
import '../../../widgets/cupertino/cupertino_admin_grievance_detail_dialog.dart';
import '../../../widgets/cupertino/cupertino_page_header.dart';
import '../../../widgets/date_range_filter.dart' show dateInRange;

class CupertinoVerificationQueuePage extends StatefulWidget {
  const CupertinoVerificationQueuePage({super.key});

  @override
  State<CupertinoVerificationQueuePage> createState() =>
      _CupertinoVerificationQueuePageState();
}

class _CupertinoVerificationQueuePageState
    extends State<CupertinoVerificationQueuePage> {
  bool _loading = true;
  String? _error;

  List<Map<String, dynamic>> _grievances = [];
  List<Map<String, dynamic>> _staffList = [];

  final _searchController = TextEditingController();
  final _constituencyController = TextEditingController();
  String _searchQuery = "";
  String _constituencyQuery = "";
  String _typeFilter = "All";
  String _statusFilter = "Pending";
  DateTime? _dateFrom;
  DateTime? _dateTo;
  bool _showFilters = false;
  final Set<String> _downloadingIds = {};

  static const _grievanceTypes = [
    'All', 'WATER', 'ROAD', 'POLICE', 'HEALTH', 'TRANSFER',
    'FINANCIAL_AID', 'ELECTRICITY', 'EDUCATION', 'HOUSING', 'OTHER'
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
          CupertinoToast.show(context,
              "Could not open PDF: ${result.message}",
              isError: true);
        }
      } else {
        if (!mounted) return;
        CupertinoToast.show(
            context, "PDF failed (${res.statusCode})",
            isError: true);
      }
    } catch (_) {
      if (!mounted) return;
      CupertinoToast.show(context, "Download error / No internet",
          isError: true);
    } finally {
      if (mounted) setState(() => _downloadingIds.remove(id));
    }
  }

  Future<void> _reject(Map<String, dynamic> g) async {
    final id = g["id"]?.toString() ?? "";
    if (id.isEmpty) return;

    final confirm = await showCupertinoDialog<bool>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: const Text("Reject Grievance"),
        content: Text(
            "Reject grievance from ${g["petitionerName"] ?? "this petitioner"}? This cannot be undone."),
        actions: [
          CupertinoDialogAction(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text("Cancel"),
          ),
          CupertinoDialogAction(
            isDestructiveAction: true,
            onPressed: () => Navigator.pop(ctx, true),
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
        CupertinoToast.show(context, "Grievance rejected");
        _fetchGrievances();
      } else {
        String msg = "Failed (${res.statusCode})";
        try {
          msg = jsonDecode(res.body)["message"] ?? msg;
        } catch (_) {}
        CupertinoToast.show(context, msg, isError: true);
      }
    } catch (_) {
      if (!mounted) return;
      CupertinoToast.show(context, "Server error / No internet",
          isError: true);
    }
  }

  void _openDetailDialog(Map<String, dynamic> g) {
    CupertinoAdminGrievanceDetailDialog.show(
      context: context,
      grievance: g,
    );
  }

  Future<void> _openVerifyAssign(Map<String, dynamic> g) async {
    if (_staffList.isEmpty) await _fetchStaff();
    if (_staffList.isEmpty) {
      if (!mounted) return;
      CupertinoToast.show(context, "No staff available to assign",
          isError: true);
      return;
    }

    final result = await showCupertinoModalPopup<bool>(
      context: context,
      builder: (_) => CupertinoVerifyAssignSheet(
        grievance: g,
        staffList: _staffList,
      ),
    );
    if (result == true) _fetchGrievances();
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
    final visible = _visibleGrievances;
    final hasFilters = _searchQuery.isNotEmpty ||
        _constituencyQuery.isNotEmpty ||
        _typeFilter != "All" ||
        _statusFilter != "Pending" ||
        _dateFrom != null ||
        _dateTo != null;

    return CupertinoPageScaffold(
      backgroundColor: AppTheme.background,
      child: Column(
        children: [
          OmsPageHeader(
            title: "Verify Grievance",
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                GestureDetector(
                  onTap: () => setState(() => _showFilters = !_showFilters),
                  child: Stack(
                    children: [
                      Icon(
                        _showFilters
                            ? CupertinoIcons.line_horizontal_3_decrease_circle_fill
                            : CupertinoIcons.line_horizontal_3_decrease_circle,
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
                  onTap: _fetchAll,
                  child: const Icon(CupertinoIcons.refresh,
                      color: CupertinoColors.white, size: 22),
                ),
              ],
            ),
          ),
          Expanded(child: CustomScrollView(
          slivers: [
            CupertinoSliverRefreshControl(onRefresh: _fetchGrievances),
            SliverPadding(
              padding: const EdgeInsets.all(16),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  if (_showFilters) ...[
                    _buildFilters(hasFilters),
                    const SizedBox(height: 12),
                  ],
                  _buildSectionHeader(),
                  const SizedBox(height: 12),
                  if (_loading)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 60),
                      child: Center(child: CupertinoActivityIndicator()),
                    )
                  else if (_error != null)
                    _buildError()
                  else if (visible.isEmpty)
                    _buildEmpty()
                  else
                    ...visible.map(_buildCard),
                  const SizedBox(height: 24),
                ]),
              ),
            ),
          ],
        )),
        ],
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
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Column(
        children: [
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
                      setState(() => _searchQuery = "");
                      _fetchGrievances();
                    },
                    child: const Padding(
                      padding: EdgeInsets.only(right: 8),
                      child: Icon(CupertinoIcons.clear_circled_solid,
                          size: 18, color: CupertinoColors.systemGrey),
                    ),
                  )
                : null,
            padding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: BoxDecoration(
              color: CupertinoColors.systemGrey6,
              borderRadius: BorderRadius.circular(10),
            ),
            onSubmitted: (v) {
              setState(() => _searchQuery = v.trim());
              _fetchGrievances();
            },
          ),
          const SizedBox(height: 10),
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
                          size: 18, color: CupertinoColors.systemGrey),
                    ),
                  )
                : null,
            padding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: BoxDecoration(
              color: CupertinoColors.systemGrey6,
              borderRadius: BorderRadius.circular(10),
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
                child: _filterPicker(
                  label: "Type",
                  value: _typeFilter,
                  options: _grievanceTypes,
                  onSelected: (v) {
                    setState(() => _typeFilter = v);
                    _fetchGrievances();
                  },
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _filterPicker(
                  label: "Status",
                  value: _statusFilter,
                  options: const ["Pending", "Verified", "Rejected", "All"],
                  onSelected: (v) {
                    setState(() => _statusFilter = v);
                    _fetchGrievances();
                  },
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          CupertinoDateRangeFilter(
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
            CupertinoButton(
              padding: const EdgeInsets.symmetric(vertical: 8),
              onPressed: _clearFilters,
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(CupertinoIcons.clear_circled,
                      size: 16, color: CupertinoColors.destructiveRed),
                  SizedBox(width: 6),
                  Text("Clear filters",
                      style: TextStyle(
                          color: CupertinoColors.destructiveRed)),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _filterPicker({
    required String label,
    required String value,
    required List<String> options,
    required ValueChanged<String> onSelected,
  }) {
    return GestureDetector(
      onTap: () {
        CupertinoFormHelpers.showPicker(
          context: context,
          items: options,
          currentValue: value,
          title: label,
          onSelected: onSelected,
        );
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: CupertinoColors.systemGrey6,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label,
                      style: const TextStyle(
                          fontSize: 10,
                          color: CupertinoColors.systemGrey)),
                  const SizedBox(height: 2),
                  Text(
                    value.replaceAll('_', ' '),
                    style: const TextStyle(
                        fontSize: 13, fontWeight: FontWeight.w500),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const Icon(CupertinoIcons.chevron_down,
                size: 14, color: CupertinoColors.systemGrey),
          ],
        ),
      ),
    );
  }

  Widget _buildError() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 60),
        child: Column(
          children: [
            const Icon(CupertinoIcons.exclamationmark_circle,
                size: 48, color: CupertinoColors.systemGrey3),
            const SizedBox(height: 12),
            Text(_error!,
                style:
                    const TextStyle(color: CupertinoColors.systemGrey)),
            const SizedBox(height: 12),
            CupertinoButton.filled(
              onPressed: _fetchGrievances,
              child: const Text("Retry"),
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
            const Icon(CupertinoIcons.tray,
                size: 56, color: CupertinoColors.systemGrey4),
            const SizedBox(height: 12),
            const Text("No grievances match",
                style: TextStyle(
                    color: CupertinoColors.systemGrey, fontSize: 14)),
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
        color: CupertinoColors.white,
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
                child: const Icon(CupertinoIcons.doc_text,
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
                      style: const TextStyle(
                          fontSize: 12, color: CupertinoColors.systemGrey),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        const Icon(CupertinoIcons.phone,
                            size: 12, color: Color(0xFFEC4899)),
                        const SizedBox(width: 4),
                        Text(
                          phone,
                          style: const TextStyle(
                              fontSize: 11,
                              color: CupertinoColors.systemGrey),
                        ),
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            "· Created by: $createdBy",
                            style: const TextStyle(
                                fontSize: 11,
                                color: CupertinoColors.systemGrey),
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
          Row(
            children: [
              Expanded(
                child: CupertinoButton(
                  onPressed: () => _openDetailDialog(g),
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  color: CupertinoColors.systemGrey6,
                  borderRadius: BorderRadius.circular(8),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(CupertinoIcons.eye,
                          size: 14, color: CupertinoColors.black),
                      SizedBox(width: 4),
                      Text("View",
                          style: TextStyle(
                              color: CupertinoColors.black,
                              fontSize: 11,
                              fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: CupertinoButton(
                  onPressed: g["isVerified"] == true
                      ? null
                      : () => _openVerifyAssign(g),
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  color: AppTheme.saffron,
                  borderRadius: BorderRadius.circular(8),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(CupertinoIcons.checkmark_circle,
                          size: 14, color: CupertinoColors.white),
                      SizedBox(width: 4),
                      Text("Verify",
                          style: TextStyle(
                              color: CupertinoColors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: CupertinoButton(
                  onPressed: isDownloading ? null : () => _downloadPdf(g),
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  color: AppTheme.saffronDark,
                  borderRadius: BorderRadius.circular(8),
                  child: isDownloading
                      ? const CupertinoActivityIndicator(
                          color: CupertinoColors.white)
                      : const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(CupertinoIcons.cloud_download,
                                size: 14, color: CupertinoColors.white),
                            SizedBox(width: 4),
                            Text("PDF",
                                style: TextStyle(
                                    color: CupertinoColors.white,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600)),
                          ],
                        ),
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: CupertinoButton(
                  onPressed:
                      status == "REJECTED" ? null : () => _reject(g),
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  color: AppTheme.destructiveRed,
                  borderRadius: BorderRadius.circular(8),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(CupertinoIcons.xmark_circle,
                          size: 14, color: CupertinoColors.white),
                      SizedBox(width: 4),
                      Text("Reject",
                          style: TextStyle(
                              color: CupertinoColors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w600)),
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
        bg = CupertinoColors.systemGrey5;
        fg = CupertinoColors.systemGrey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
      child: Text(status,
          style:
              TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: fg)),
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
          color: CupertinoColors.white,
        ),
      ),
    );
  }
}

// =====================================================
// CUPERTINO VERIFY & ASSIGN MODAL
// =====================================================
class CupertinoVerifyAssignSheet extends StatefulWidget {
  final Map<String, dynamic> grievance;
  final List<Map<String, dynamic>> staffList;
  const CupertinoVerifyAssignSheet({
    required this.grievance,
    required this.staffList,
  });

  @override
  State<CupertinoVerifyAssignSheet> createState() =>
      CupertinoVerifyAssignSheetState();
}

class CupertinoVerifyAssignSheetState
    extends State<CupertinoVerifyAssignSheet> {
  late final TextEditingController titleController;
  late final TextEditingController descriptionController;
  String? _selectedStaffId;
  String? _selectedPriority;
  DateTime? _dueDate;
  bool _submitting = false;
  String? _staffError;
  String? _titleError;
  String? _priorityError;
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

  void _pickDueDate() {
    CupertinoFormHelpers.showDatePicker(
      context: context,
      initialDate: _dueDate ?? DateTime.now().add(const Duration(days: 7)),
      minimumDate: DateTime.now(),
      maximumDate: DateTime.now().add(const Duration(days: 365)),
      onDateSelected: (d) => setState(() {
        _dueDate = d;
        _dueDateError = null;
      }),
    );
  }

  bool _validate() {
    bool ok = true;
    _staffError =
        _selectedStaffId == null ? "Please select a staff member" : null;
    if (_staffError != null) ok = false;
    _titleError =
        titleController.text.trim().isEmpty ? "Required" : null;
    if (_titleError != null) ok = false;
    _priorityError =
        _selectedPriority == null ? "Please select a priority" : null;
    if (_priorityError != null) ok = false;
    _dueDateError = _dueDate == null ? "Please select a due date" : null;
    if (_dueDateError != null) ok = false;
    setState(() {});
    return ok;
  }

  Future<void> _submit() async {
    if (!_validate()) return;
    setState(() => _submitting = true);

    final id = widget.grievance["id"]?.toString() ?? "";

    try {
      final verifyRes =
          await HttpService.patch("/api/grievances/$id/verify", {});
      if (verifyRes.statusCode != 200) {
        if (!mounted) return;
        String msg = "Verify failed (${verifyRes.statusCode})";
        try {
          msg = jsonDecode(verifyRes.body)["message"] ?? msg;
        } catch (_) {}
        CupertinoToast.show(context, msg, isError: true);
        setState(() => _submitting = false);
        return;
      }

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
        CupertinoToast.show(
            context, "Verified & assigned to ${staff["name"]}");
        Navigator.pop(context, true);
      } else {
        String msg =
            "Verified, but assignment failed (${taskRes.statusCode})";
        try {
          final m = jsonDecode(taskRes.body)["message"];
          if (m != null) msg = "Verified, but $m";
        } catch (_) {}
        CupertinoToast.show(context, msg, isError: true);
        Navigator.pop(context, true);
      }
    } catch (_) {
      if (!mounted) return;
      CupertinoToast.show(context, "Server error / No internet",
          isError: true);
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
          color: CupertinoColors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
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
                        color: CupertinoColors.systemGrey4,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(CupertinoIcons.person_badge_plus,
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
                      CupertinoButton(
                        padding: EdgeInsets.zero,
                        minSize: 0,
                        onPressed: _submitting
                            ? null
                            : () => Navigator.pop(context),
                        child: const Icon(CupertinoIcons.xmark,
                            size: 20, color: CupertinoColors.systemGrey),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  const Padding(
                    padding: EdgeInsets.only(left: 30),
                    child: Text(
                      "Submitting this form will verify the grievance and assign a follow-up task to a staff member",
                      style: TextStyle(
                          fontSize: 12, color: CupertinoColors.systemGrey),
                    ),
                  ),
                  const SizedBox(height: 14),
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
                        const Text("Verified Grievance",
                            style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.bold,
                                color: AppTheme.primaryIndigo)),
                        const SizedBox(height: 2),
                        Text("$petitioner • $type • $constituency",
                            style: const TextStyle(
                                fontSize: 13,
                                color: AppTheme.primaryIndigo)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  _label("Assign To Staff *"),
                  const SizedBox(height: 4),
                  _staffPicker(),
                  if (_staffError != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 4, left: 4),
                      child: Text(_staffError!,
                          style: const TextStyle(
                              fontSize: 12,
                              color: CupertinoColors.destructiveRed)),
                    ),
                  const SizedBox(height: 12),
                  _label("Task Title *"),
                  const SizedBox(height: 4),
                  _cupertinoInput(titleController, error: _titleError),
                  const SizedBox(height: 12),
                  _label("Task Description"),
                  const SizedBox(height: 4),
                  _cupertinoInput(descriptionController, maxLines: 4),
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
                            _priorityPicker(),
                            if (_priorityError != null)
                              Padding(
                                padding:
                                    const EdgeInsets.only(top: 4, left: 4),
                                child: Text(_priorityError!,
                                    style: const TextStyle(
                                        fontSize: 12,
                                        color: CupertinoColors
                                            .destructiveRed)),
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
                            GestureDetector(
                              onTap: _pickDueDate,
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 12, vertical: 13),
                                decoration: BoxDecoration(
                                  color: CupertinoColors.systemGrey6,
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                    color: _dueDateError != null
                                        ? CupertinoColors.destructiveRed
                                        : CupertinoColors.systemGrey4,
                                  ),
                                ),
                                child: Text(
                                  _dueDate != null
                                      ? DateFormat('dd/MM/yyyy')
                                          .format(_dueDate!)
                                      : "dd-mm-yyyy",
                                  style: TextStyle(
                                    fontSize: 14,
                                    color: _dueDate != null
                                        ? CupertinoColors.black
                                        : CupertinoColors.systemGrey,
                                  ),
                                ),
                              ),
                            ),
                            if (_dueDateError != null)
                              Padding(
                                padding:
                                    const EdgeInsets.only(top: 4, left: 4),
                                child: Text(_dueDateError!,
                                    style: const TextStyle(
                                        fontSize: 12,
                                        color: CupertinoColors
                                            .destructiveRed)),
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
                        child: CupertinoButton(
                          color: CupertinoColors.systemGrey6,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          borderRadius: BorderRadius.circular(10),
                          onPressed: _submitting
                              ? null
                              : () => Navigator.pop(context),
                          child: const Text("Cancel",
                              style: TextStyle(
                                  fontWeight: FontWeight.w600,
                                  color: CupertinoColors.black)),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: CupertinoButton(
                          color: AppTheme.saffron,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          borderRadius: BorderRadius.circular(10),
                          onPressed: _submitting ? null : _submit,
                          child: _submitting
                              ? const CupertinoActivityIndicator(
                                  color: CupertinoColors.white)
                              : const Row(
                                  mainAxisAlignment:
                                      MainAxisAlignment.center,
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(CupertinoIcons.person_add,
                                        size: 18,
                                        color: CupertinoColors.white),
                                    SizedBox(width: 6),
                                    Text("Verify & Assign",
                                        style: TextStyle(
                                            fontSize: 14,
                                            fontWeight: FontWeight.bold,
                                            color: CupertinoColors.white)),
                                  ],
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
    );
  }

  Widget _label(String text) {
    return Text(text,
        style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: AppTheme.foreground));
  }

  Widget _staffPicker() {
    final staffName = _selectedStaffId == null
        ? "Select staff member"
        : (widget.staffList.firstWhere(
              (s) => s["id"]?.toString() == _selectedStaffId,
              orElse: () => {"name": "—"},
            )["name"] ??
            "—");

    return GestureDetector(
      onTap: () {
        if (widget.staffList.isEmpty) return;
        final names =
            widget.staffList.map((s) => s["name"]?.toString() ?? "-").toList();
        CupertinoFormHelpers.showPicker(
          context: context,
          items: names,
          currentValue: _selectedStaffId == null
              ? names.first
              : (widget.staffList.firstWhere(
                  (s) => s["id"]?.toString() == _selectedStaffId,
                  orElse: () => widget.staffList.first,
                )["name"]?.toString() ??
                  names.first),
          title: "Assign To Staff",
          onSelected: (name) {
            final s = widget.staffList.firstWhere(
              (s) => s["name"]?.toString() == name,
              orElse: () => widget.staffList.first,
            );
            setState(() {
              _selectedStaffId = s["id"]?.toString();
              _staffError = null;
            });
          },
        );
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
        decoration: BoxDecoration(
          color: CupertinoColors.systemGrey6,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: _staffError != null
                ? CupertinoColors.destructiveRed
                : CupertinoColors.systemGrey4,
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                staffName,
                style: TextStyle(
                  fontSize: 14,
                  color: _selectedStaffId == null
                      ? CupertinoColors.systemGrey
                      : CupertinoColors.black,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const Icon(CupertinoIcons.chevron_down,
                size: 14, color: CupertinoColors.systemGrey),
          ],
        ),
      ),
    );
  }

  Widget _priorityPicker() {
    final label = switch (_selectedPriority) {
      "LOW" => "Low",
      "NORMAL" => "Normal",
      "HIGH" => "High",
      _ => "Select priority",
    };
    final isPlaceholder = _selectedPriority == null;
    return GestureDetector(
      onTap: () {
        CupertinoFormHelpers.showPicker(
          context: context,
          items: const ["Low", "Normal", "High"],
          currentValue: isPlaceholder ? "Normal" : label,
          title: "Priority",
          onSelected: (v) {
            setState(() {
              _selectedPriority = v.toUpperCase();
              _priorityError = null;
            });
          },
        );
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
        decoration: BoxDecoration(
          color: CupertinoColors.systemGrey6,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: _priorityError != null
                ? CupertinoColors.destructiveRed
                : CupertinoColors.systemGrey4,
          ),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 14,
                  color: isPlaceholder
                      ? CupertinoColors.systemGrey
                      : CupertinoColors.black,
                ),
              ),
            ),
            const Icon(CupertinoIcons.chevron_down,
                size: 14, color: CupertinoColors.systemGrey),
          ],
        ),
      ),
    );
  }

  Widget _cupertinoInput(TextEditingController controller,
      {int maxLines = 1, String? error}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CupertinoTextField(
          controller: controller,
          maxLines: maxLines,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: BoxDecoration(
            color: CupertinoColors.systemGrey6,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: error != null
                  ? CupertinoColors.destructiveRed
                  : CupertinoColors.systemGrey4,
            ),
          ),
        ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 4),
            child: Text(error,
                style: const TextStyle(
                    fontSize: 12,
                    color: CupertinoColors.destructiveRed)),
          ),
      ],
    );
  }
}
