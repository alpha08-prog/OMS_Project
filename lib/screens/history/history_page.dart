import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/http_service.dart';

class HistoryPage extends StatefulWidget {
  final String role;
  const HistoryPage({super.key, required this.role});

  @override
  State<HistoryPage> createState() => _HistoryPageState();
}

class _HistoryPageState extends State<HistoryPage> {
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

  void _showFilterSheet() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) {
          return Padding(
            padding: EdgeInsets.only(
              left: 16,
              right: 16,
              top: 16,
              bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  "Filter History",
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 20),

                // Entity Type
                const Text("Module",
                    style: TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: entityTypes.map((type) {
                    final isSelected = selectedEntityType == type ||
                        (selectedEntityType == null && type == 'All');
                    return ChoiceChip(
                      label: Text(_formatEntityType(type)),
                      selected: isSelected,
                      onSelected: (_) {
                        setSheetState(() {
                          selectedEntityType = type == 'All' ? null : type;
                        });
                      },
                      selectedColor: primaryBlue.withOpacity(0.2),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 16),

                // Action
                const Text("Action",
                    style: TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: actions.map((action) {
                    final isSelected = selectedAction == action ||
                        (selectedAction == null && action == 'All');
                    return ChoiceChip(
                      label: Text(action),
                      selected: isSelected,
                      onSelected: (_) {
                        setSheetState(() {
                          selectedAction = action == 'All' ? null : action;
                        });
                      },
                      selectedColor: primaryBlue.withOpacity(0.2),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 16),

                // Date Range
                const Text("Date Range",
                    style: TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          final date = await showDatePicker(
                            context: ctx,
                            initialDate: startDate ?? DateTime.now(),
                            firstDate: DateTime(2020),
                            lastDate: DateTime.now(),
                          );
                          if (date != null) {
                            setSheetState(() => startDate = date);
                          }
                        },
                        icon: const Icon(Icons.calendar_today, size: 16),
                        label: Text(
                          startDate != null
                              ? DateFormat('dd/MM/yy').format(startDate!)
                              : "Start",
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () async {
                          final date = await showDatePicker(
                            context: ctx,
                            initialDate: endDate ?? DateTime.now(),
                            firstDate: DateTime(2020),
                            lastDate: DateTime.now(),
                          );
                          if (date != null) {
                            setSheetState(() => endDate = date);
                          }
                        },
                        icon: const Icon(Icons.calendar_today, size: 16),
                        label: Text(
                          endDate != null
                              ? DateFormat('dd/MM/yy').format(endDate!)
                              : "End",
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
                      child: OutlinedButton(
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
                        child: const Text("Clear"),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: () {
                          setState(() {});
                          Navigator.pop(ctx);
                          _fetchHistory();
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: primaryBlue,
                          foregroundColor: Colors.white,
                        ),
                        child: const Text("Apply"),
                      ),
                    ),
                  ],
                ),
              ],
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
        .map((w) => w.isNotEmpty
            ? '${w[0].toUpperCase()}${w.substring(1).toLowerCase()}'
            : '')
        .join(' ');
  }

  IconData _getActionIcon(String action) {
    final a = action.toUpperCase();
    if (a.contains('CREATE')) return Icons.add_circle;
    if (a.contains('UPDATE')) return Icons.edit;
    if (a.contains('DELETE')) return Icons.delete;
    if (a.contains('VERIFY')) return Icons.verified;
    if (a.contains('APPROVE')) return Icons.check_circle;
    if (a.contains('REJECT')) return Icons.cancel;
    if (a.contains('COMPLETE')) return Icons.done_all;
    if (a.contains('SEND')) return Icons.send;
    return Icons.history;
  }

  Color _getActionColor(String action) {
    final a = action.toUpperCase();
    if (a.contains('CREATE')) return Colors.green;
    if (a.contains('UPDATE')) return Colors.blue;
    if (a.contains('DELETE')) return Colors.red;
    if (a.contains('VERIFY')) return Colors.purple;
    if (a.contains('APPROVE')) return Colors.teal;
    if (a.contains('REJECT')) return Colors.orange;
    if (a.contains('COMPLETE')) return Colors.green;
    if (a.contains('SEND')) return Colors.indigo;
    return Colors.grey;
  }

  @override
  Widget build(BuildContext context) {
    final hasFilters = selectedEntityType != null ||
        selectedAction != null ||
        startDate != null ||
        endDate != null;

    return Scaffold(
      backgroundColor: bgLight,
      appBar: AppBar(
        title: const Text("Activity History"),
        backgroundColor: primaryBlue,
        actions: [
          IconButton(
            icon: Stack(
              children: [
                const Icon(Icons.filter_list),
                if (hasFilters)
                  Positioned(
                    right: 0,
                    top: 0,
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
            onPressed: _showFilterSheet,
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _fetchHistory,
          ),
        ],
      ),
      body: loading
          ? const Center(child: CircularProgressIndicator())
          : error != null
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(error!, style: const TextStyle(color: Colors.red)),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: _fetchHistory,
                        child: const Text("Retry"),
                      ),
                    ],
                  ),
                )
              : historyList.isEmpty
                  ? const Center(
                      child: Text("No activity found"),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: historyList.length,
                      itemBuilder: (context, index) {
                        final item = historyList[index];
                        return _buildHistoryCard(item);
                      },
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
    final entityId = item["entityId"] ?? "";

    String formattedDate = "-";
    if (createdAt != null) {
      try {
        final date = DateTime.parse(createdAt);
        formattedDate = DateFormat('dd MMM yyyy, hh:mm a').format(date);
      } catch (_) {}
    }

    final actionColor = _getActionColor(action);
    final actionIcon = _getActionIcon(action);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
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
      child: InkWell(
        onTap: () => _showDetailDialog(item),
        borderRadius: BorderRadius.circular(12),
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
                    // Action & Entity
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
                              horizontal: 8, vertical: 4),
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
                        Icon(Icons.person_outline,
                            size: 14, color: Colors.grey.shade600),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            "$userName ${userRole.isNotEmpty ? '($userRole)' : ''}",
                            style: TextStyle(
                              fontSize: 13,
                              color: Colors.grey.shade700,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),

                    // Date
                    Row(
                      children: [
                        Icon(Icons.access_time,
                            size: 14, color: Colors.grey.shade600),
                        const SizedBox(width: 4),
                        Text(
                          formattedDate,
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade600,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              // Arrow
              Icon(Icons.chevron_right, color: Colors.grey.shade400),
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

    showDialog(
      context: context,
      builder: (ctx) => Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        child: Container(
          constraints: const BoxConstraints(maxWidth: 400, maxHeight: 600),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Header
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: primaryBlue,
                  borderRadius:
                      const BorderRadius.vertical(top: Radius.circular(16)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.history, color: Colors.white),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        _formatAction(action),
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                        ),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, color: Colors.white),
                      onPressed: () => Navigator.pop(ctx),
                    ),
                  ],
                ),
              ),

              // Content
              Flexible(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _detailRow("Module", _formatEntityType(entityType)),
                      _detailRow("Entity ID", entityId),
                      const Divider(height: 24),
                      _detailRow("User", userName),
                      _detailRow("Email", userEmail),
                      _detailRow("Role", userRole),
                      const Divider(height: 24),
                      _detailRow("Date/Time", formattedDate),
                      _detailRow("IP Address", ipAddress),
                      if (oldData != null) ...[
                        const Divider(height: 24),
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
                            color: Colors.red.shade50,
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
                            color: Colors.green.shade50,
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
              style: TextStyle(
                fontSize: 13,
                color: Colors.grey.shade600,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w500,
              ),
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
