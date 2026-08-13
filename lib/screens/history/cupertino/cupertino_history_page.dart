import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';

import '../../../services/http_service.dart';
import '../../../theme/app_theme.dart';
import '../../../utils/csv_export.dart';
import '../../../widgets/cupertino/cupertino_form_helpers.dart';
import '../../../widgets/cupertino/cupertino_page_header.dart';
import '../../../widgets/cupertino/cupertino_date_range_filter.dart';
import '../../../widgets/date_range_filter.dart' show dateInRange;
import '../../../widgets/oms_loader.dart';

class CupertinoHistoryPage extends StatefulWidget {
  final String role;
  const CupertinoHistoryPage({super.key, required this.role});

  @override
  State<CupertinoHistoryPage> createState() => _CupertinoHistoryPageState();
}

class _CupertinoHistoryPageState extends State<CupertinoHistoryPage> {
  static const Color primaryBlue = Color(0xFF0A2E5C);
  static const Color bgLight = Color(0xFFF4F6FB);

  bool loading = true;
  String? error;
  List<Map<String, dynamic>> historyList = [];

  // Filters
  String? selectedEntityType;
  String? selectedAction;
  DateTime? startDate;
  DateTime? endDate;

  // Client-side visible date range for the export / filter row.
  DateTime? _dateFrom;
  DateTime? _dateTo;

  final List<String> entityTypes = [
    'All',
    'GRIEVANCE',
    'TRAIN_REQUEST',
    'TOUR_PROGRAM',
    'VISITOR',
    'NEWS',
    'BIRTHDAY',
  ];

  final List<String> actions = [
    'All',
    'CREATE',
    'UPDATE',
    'DELETE',
    'VERIFY',
    'APPROVE',
    'REJECT',
  ];

  @override
  void initState() {
    super.initState();
    _fetchHistory();
  }

  Future<void> _fetchHistory() async {
    setState(() {
      loading = true;
      error = null;
    });

    try {
      String url = "/api/history?limit=100";

      if (selectedEntityType != null && selectedEntityType != 'All') {
        url += "&type=$selectedEntityType";
      }
      if (selectedAction != null && selectedAction != 'All') {
        url += "&action=$selectedAction";
      }
      if (startDate != null) {
        url += "&startDate=${startDate!.toIso8601String()}";
      }
      if (endDate != null) {
        url += "&endDate=${endDate!.toIso8601String()}";
      }

      final res = await HttpService.get(url);

      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list = decoded is List ? decoded : (decoded["data"] ?? []);

        setState(() {
          historyList = list
              .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
              .toList();
          loading = false;
        });
      } else {
        setState(() {
          error = "Failed to load history (${res.statusCode})";
          loading = false;
        });
      }
    } catch (e) {
      setState(() {
        error = "Server error / No internet";
        loading = false;
      });
    }
  }

  List<Map<String, dynamic>> get _visibleHistory {
    if (_dateFrom == null && _dateTo == null) return historyList;
    return historyList.where((h) {
      final dt = DateTime.tryParse(h['createdAt']?.toString() ?? '');
      return dateInRange(dt, from: _dateFrom, to: _dateTo);
    }).toList();
  }

  void _exportCsv() {
    CsvExport.export(
      context,
      fileName: 'activity_history',
      headers: const ['Action', 'Module', 'User', 'Role', 'Date'],
      rows: _visibleHistory.map((item) {
        final user = item['user'];
        String date = '';
        try {
          date = DateFormat(
            'dd MMM yyyy, hh:mm a',
          ).format(DateTime.parse(item['createdAt'].toString()));
        } catch (_) {}
        return [
          _formatAction((item['action'] ?? '').toString()),
          _formatEntityType(
            (item['type'] ?? item['entityType'] ?? '').toString(),
          ),
          user?['name'] ?? '',
          user?['role'] ?? '',
          date,
        ];
      }).toList(),
    );
  }

  void _showFilterSheet() {
    showCupertinoModalPopup(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) {
          return Container(
            padding: EdgeInsets.only(
              left: 16,
              right: 16,
              top: 16,
              bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
            ),
            decoration: const BoxDecoration(
              color: CupertinoColors.systemBackground,
              borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
            ),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
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
                  const Text(
                    "Filter History",
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 20),

                  // Entity Type
                  const Text(
                    "Module",
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: entityTypes.map((type) {
                      final isSelected =
                          selectedEntityType == type ||
                          (selectedEntityType == null && type == 'All');
                      return GestureDetector(
                        onTap: () {
                          setSheetState(() {
                            selectedEntityType = type == 'All' ? null : type;
                          });
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 8,
                          ),
                          decoration: BoxDecoration(
                            color: isSelected
                                ? primaryBlue.withOpacity(0.2)
                                : CupertinoColors.systemGrey6,
                            borderRadius: BorderRadius.circular(20),
                            border: isSelected
                                ? Border.all(
                                    color: primaryBlue.withOpacity(0.5),
                                  )
                                : null,
                          ),
                          child: Text(
                            _formatEntityType(type),
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: isSelected
                                  ? FontWeight.w600
                                  : FontWeight.normal,
                              color: isSelected
                                  ? primaryBlue
                                  : CupertinoColors.label,
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 16),

                  // Action
                  const Text(
                    "Action",
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: actions.map((action) {
                      final isSelected =
                          selectedAction == action ||
                          (selectedAction == null && action == 'All');
                      return GestureDetector(
                        onTap: () {
                          setSheetState(() {
                            selectedAction = action == 'All' ? null : action;
                          });
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 8,
                          ),
                          decoration: BoxDecoration(
                            color: isSelected
                                ? primaryBlue.withOpacity(0.2)
                                : CupertinoColors.systemGrey6,
                            borderRadius: BorderRadius.circular(20),
                            border: isSelected
                                ? Border.all(
                                    color: primaryBlue.withOpacity(0.5),
                                  )
                                : null,
                          ),
                          child: Text(
                            action,
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: isSelected
                                  ? FontWeight.w600
                                  : FontWeight.normal,
                              color: isSelected
                                  ? primaryBlue
                                  : CupertinoColors.label,
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 16),

                  // Date Range
                  const Text(
                    "Date Range",
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: CupertinoButton(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          color: CupertinoColors.systemGrey6,
                          onPressed: () {
                            CupertinoFormHelpers.showDatePicker(
                              context: ctx,
                              initialDate: startDate ?? DateTime.now(),
                              minimumDate: DateTime(2020),
                              maximumDate: DateTime.now(),
                              onDateSelected: (date) =>
                                  setSheetState(() => startDate = date),
                            );
                          },
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(CupertinoIcons.calendar, size: 16),
                              const SizedBox(width: 4),
                              Text(
                                startDate != null
                                    ? DateFormat('dd/MM/yy').format(startDate!)
                                    : "Start",
                                style: const TextStyle(fontSize: 14),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: CupertinoButton(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          color: CupertinoColors.systemGrey6,
                          onPressed: () {
                            CupertinoFormHelpers.showDatePicker(
                              context: ctx,
                              initialDate: endDate ?? DateTime.now(),
                              minimumDate: DateTime(2020),
                              maximumDate: DateTime.now(),
                              onDateSelected: (date) =>
                                  setSheetState(() => endDate = date),
                            );
                          },
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(CupertinoIcons.calendar, size: 16),
                              const SizedBox(width: 4),
                              Text(
                                endDate != null
                                    ? DateFormat('dd/MM/yy').format(endDate!)
                                    : "End",
                                style: const TextStyle(fontSize: 14),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),

                  // Buttons
                  Row(
                    children: [
                      Expanded(
                        child: CupertinoButton(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          color: CupertinoColors.systemGrey5,
                          onPressed: () {
                            setSheetState(() {
                              selectedEntityType = null;
                              selectedAction = null;
                              startDate = null;
                              endDate = null;
                            });
                            setState(() {
                              selectedEntityType = null;
                              selectedAction = null;
                              startDate = null;
                              endDate = null;
                            });
                          },
                          child: const Text(
                            "Clear",
                            style: TextStyle(color: CupertinoColors.label),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: CupertinoButton.filled(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          onPressed: () {
                            setState(() {});
                            Navigator.pop(ctx);
                            _fetchHistory();
                          },
                          child: const Text("Apply"),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  String _formatEntityType(String type) {
    switch (type) {
      case 'GRIEVANCE':
        return 'Grievance';
      case 'TRAIN_REQUEST':
        return 'Train';
      case 'TOUR_PROGRAM':
        return 'Tour';
      case 'VISITOR':
        return 'Visitor';
      case 'NEWS':
        return 'News';
      case 'BIRTHDAY':
        return 'Birthday';
      default:
        return type;
    }
  }

  String _formatAction(String action) {
    return action
        .replaceAll('_', ' ')
        .split(' ')
        .map(
          (w) => w.isNotEmpty
              ? '${w[0].toUpperCase()}${w.substring(1).toLowerCase()}'
              : '',
        )
        .join(' ');
  }

  IconData _getActionIcon(String action) {
    final a = action.toUpperCase();
    if (a.contains('CREATE')) return CupertinoIcons.add_circled;
    if (a.contains('UPDATE')) return CupertinoIcons.pencil;
    if (a.contains('DELETE')) return CupertinoIcons.delete;
    if (a.contains('VERIFY')) return CupertinoIcons.checkmark_seal;
    if (a.contains('APPROVE')) return CupertinoIcons.checkmark_circle;
    if (a.contains('REJECT')) return CupertinoIcons.xmark_circle;
    if (a.contains('COMPLETE')) return CupertinoIcons.checkmark_alt_circle;
    if (a.contains('SEND')) return CupertinoIcons.paperplane;
    return CupertinoIcons.clock;
  }

  Color _getActionColor(String action) {
    final a = action.toUpperCase();
    if (a.contains('CREATE')) return CupertinoColors.activeGreen;
    if (a.contains('UPDATE')) return CupertinoColors.activeBlue;
    if (a.contains('DELETE')) return CupertinoColors.destructiveRed;
    if (a.contains('VERIFY')) return const Color(0xFF9333EA);
    if (a.contains('APPROVE')) return const Color(0xFF0D9488);
    if (a.contains('REJECT')) return CupertinoColors.activeOrange;
    if (a.contains('COMPLETE')) return CupertinoColors.activeGreen;
    if (a.contains('SEND')) return const Color(0xFF4338CA);
    return CupertinoColors.systemGrey;
  }

  @override
  Widget build(BuildContext context) {
    final hasFilters =
        selectedEntityType != null ||
        selectedAction != null ||
        startDate != null ||
        endDate != null;

    return CupertinoPageScaffold(
      backgroundColor: bgLight,
      child: Column(
        children: [
          OmsPageHeader(
            title: "Activity History",
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                CupertinoButton(
                  padding: EdgeInsets.zero,
                  onPressed: _showFilterSheet,
                  child: Stack(
                    children: [
                      const Icon(
                        CupertinoIcons.line_horizontal_3_decrease,
                        color: CupertinoColors.white,
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
                CupertinoButton(
                  padding: EdgeInsets.zero,
                  onPressed: _visibleHistory.isEmpty ? null : _exportCsv,
                  child: const Icon(
                    CupertinoIcons.arrow_down_doc,
                    size: 22,
                    color: CupertinoColors.white,
                  ),
                ),
                CupertinoButton(
                  padding: EdgeInsets.zero,
                  onPressed: _fetchHistory,
                  child: const Icon(
                    CupertinoIcons.refresh,
                    color: CupertinoColors.white,
                  ),
                ),
              ],
            ),
          ),
          Container(
            color: CupertinoColors.white,
            child: CupertinoDateRangeFilter(
              from: _dateFrom,
              to: _dateTo,
              tint: primaryBlue,
              onFromChanged: (d) => setState(() => _dateFrom = d),
              onToChanged: (d) => setState(() => _dateTo = d),
              onClear: () => setState(() {
                _dateFrom = null;
                _dateTo = null;
              }),
            ),
          ),
          Expanded(
            child: loading
                ? OmsLoader(size: 56)
                : error != null
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          error!,
                          style: const TextStyle(
                            color: CupertinoColors.destructiveRed,
                          ),
                        ),
                        const SizedBox(height: 16),
                        CupertinoButton.filled(
                          onPressed: _fetchHistory,
                          child: const Text("Retry"),
                        ),
                      ],
                    ),
                  )
                : _visibleHistory.isEmpty
                ? const Center(child: Text("No activity found"))
                : ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _visibleHistory.length,
                    itemBuilder: (context, index) {
                      final item = _visibleHistory[index];
                      return _buildHistoryCard(item);
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildHistoryCard(Map<String, dynamic> item) {
    final action = item["action"] ?? "UNKNOWN";
    final entityType = item["type"] ?? item["entityType"] ?? "UNKNOWN";
    final user = item["user"];
    final userName = user?["name"] ?? "Unknown User";
    final userRole = user?["role"] ?? "";
    final createdAt = item["createdAt"];

    String formattedDate = "-";
    if (createdAt != null) {
      try {
        final date = DateTime.parse(createdAt);
        formattedDate = DateFormat('dd MMM yyyy, hh:mm a').format(date);
      } catch (_) {}
    }

    final actionColor = _getActionColor(action);
    final actionIcon = _getActionIcon(action);

    return GestureDetector(
      onTap: () => _showDetailDialog(item),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
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
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Action Icon
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: actionColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(actionIcon, color: actionColor, size: 22),
              ),
              const SizedBox(width: 14),

              // Content
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            _formatAction(action),
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 15,
                            ),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: primaryBlue.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            _formatEntityType(entityType),
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: primaryBlue,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),

                    // User info
                    Row(
                      children: [
                        Icon(
                          CupertinoIcons.person,
                          size: 14,
                          color: CupertinoColors.systemGrey,
                        ),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            "$userName ${userRole.isNotEmpty ? '($userRole)' : ''}",
                            style: TextStyle(
                              fontSize: 13,
                              color: CupertinoColors.systemGrey,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),

                    // Date
                    Row(
                      children: [
                        Icon(
                          CupertinoIcons.time,
                          size: 14,
                          color: CupertinoColors.systemGrey,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          formattedDate,
                          style: TextStyle(
                            fontSize: 12,
                            color: CupertinoColors.systemGrey,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              // Arrow
              Icon(
                CupertinoIcons.chevron_right,
                color: CupertinoColors.systemGrey4,
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showDetailDialog(Map<String, dynamic> item) {
    final action = item["action"] ?? "UNKNOWN";
    final entityType = item["type"] ?? item["entityType"] ?? "UNKNOWN";
    final user = item["user"];
    final userName = user?["name"] ?? "Unknown";
    final userEmail = user?["email"] ?? "-";
    final userRole = user?["role"] ?? "-";
    final entityId = item["entityId"] ?? "-";
    final oldData = item["oldData"];
    final newData = item["newData"];
    final ipAddress = item["ipAddress"] ?? "-";
    final createdAt = item["createdAt"];

    String formattedDate = "-";
    if (createdAt != null) {
      try {
        final date = DateTime.parse(createdAt);
        formattedDate = DateFormat('dd MMM yyyy, hh:mm:ss a').format(date);
      } catch (_) {}
    }

    showCupertinoDialog(
      context: context,
      builder: (ctx) => CupertinoPageScaffold(
        backgroundColor: CupertinoColors.systemBackground,
        child: Column(
          children: [
            OmsPageHeader(
              title: _formatAction(action),
              leading: CupertinoButton(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                onPressed: () => Navigator.pop(ctx),
                child: const Icon(
                  CupertinoIcons.xmark,
                  color: CupertinoColors.white,
                ),
              ),
              showBack: false,
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _detailRow("Module", _formatEntityType(entityType)),
                    _detailRow("Entity ID", entityId.toString()),
                    Container(
                      height: 1,
                      margin: const EdgeInsets.symmetric(vertical: 12),
                      color: AppTheme.border,
                    ),
                    _detailRow("User", userName),
                    _detailRow("Email", userEmail),
                    _detailRow("Role", userRole),
                    Container(
                      height: 1,
                      margin: const EdgeInsets.symmetric(vertical: 12),
                      color: AppTheme.border,
                    ),
                    _detailRow("Date/Time", formattedDate),
                    _detailRow("IP Address", ipAddress),
                    if (oldData != null) ...[
                      Container(
                        height: 1,
                        margin: const EdgeInsets.symmetric(vertical: 12),
                        color: AppTheme.border,
                      ),
                      const Text(
                        "Previous Data",
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFEF2F2),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          _formatJson(oldData),
                          style: const TextStyle(fontSize: 12),
                        ),
                      ),
                    ],
                    if (newData != null) ...[
                      const SizedBox(height: 16),
                      const Text(
                        "New Data",
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFFECFDF5),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          _formatJson(newData),
                          style: const TextStyle(fontSize: 12),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _detailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(
              label,
              style: TextStyle(fontSize: 13, color: CupertinoColors.systemGrey),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }

  String _formatJson(dynamic data) {
    try {
      if (data is String) {
        return data;
      }
      const encoder = JsonEncoder.withIndent('  ');
      return encoder.convert(data);
    } catch (_) {
      return data.toString();
    }
  }
}
