import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';

import '../../../services/http_service.dart';
import '../../../utils/access_control.dart';
import '../../../utils/csv_export.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../widgets/cupertino/cupertino_styled_card.dart';
import '../../../widgets/cupertino/cupertino_date_range_filter.dart';
import '../../../widgets/date_range_filter.dart' show dateInRange;

class CupertinoVisitorListPage extends StatefulWidget {
  final String role;
  const CupertinoVisitorListPage({super.key, required this.role});

  @override
  State<CupertinoVisitorListPage> createState() =>
      _CupertinoVisitorListPageState();
}

class _CupertinoVisitorListPageState
    extends State<CupertinoVisitorListPage> {
  static const Color primaryBlue = Color(0xFF0A2E5C);
  static const Color bgLight = Color(0xFFF4F6FB);

  bool loading = true;
  String? error;
  DateTime? _dateFrom;
  DateTime? _dateTo;

  List<Map<String, dynamic>> visitors = [];

  List<Map<String, dynamic>> get _visibleVisitors {
    if (_dateFrom == null && _dateTo == null) return visitors;
    return visitors.where((v) {
      final dt = DateTime.tryParse(v['createdAt']?.toString() ?? '');
      return dateInRange(dt, from: _dateFrom, to: _dateTo);
    }).toList();
  }

  @override
  void initState() {
    super.initState();
    fetchVisitors();
  }

  Future<void> fetchVisitors() async {
    setState(() {
      loading = true;
      error = null;
    });

    try {
      final res = await HttpService.get("/api/visitors");

      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list =
            decoded is List ? decoded : (decoded["data"] ?? []);

        setState(() {
          visitors = list
              .map<Map<String, dynamic>>(
                  (e) => Map<String, dynamic>.from(e))
              .toList();
          loading = false;
        });
      } else {
        setState(() {
          error = "Failed to load visitors (${res.statusCode})";
          loading = false;
        });
      }
    } catch (_) {
      setState(() {
        error = "Server error / No internet";
        loading = false;
      });
    }
  }

  void _openAddVisitor() {
    final canCreate =
        AccessControl.can(widget.role, ActionPermission.create);

    if (!canCreate) {
      CupertinoToast.show(context, "You have view-only access.",
          isError: true);
      return;
    }

    showCupertinoModalPopup(
      context: context,
      builder: (_) => _CupertinoAddVisitorSheet(
        onCreated: () async {
          Navigator.pop(context);
          await fetchVisitors();
        },
      ),
    );
  }

  Future<void> _deleteVisitor(int id) async {
    final canDelete = widget.role == Roles.admin;
    if (!canDelete) {
      CupertinoToast.show(context, "Only ADMIN can delete.",
          isError: true);
      return;
    }

    final confirm = await showCupertinoDialog<bool>(
      context: context,
      builder: (_) => CupertinoAlertDialog(
        title: const Text("Delete Visitor"),
        content: const Text(
            "Are you sure you want to delete this visitor?"),
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
      final res = await HttpService.delete("/api/visitors/$id");
      if (res.statusCode == 200) {
        CupertinoToast.show(context, "Deleted");
        fetchVisitors();
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

  void _exportCsv() {
    CsvExport.export(
      context,
      fileName: 'visitors',
      headers: const ['Name', 'Designation', 'Phone', 'Purpose', 'Date'],
      rows: _visibleVisitors.map((v) {
        final raw =
            (v['date'] ?? v['visitDate'] ?? v['createdAt'] ?? '').toString();
        String dateStr = raw;
        final dt = DateTime.tryParse(raw);
        if (dt != null) dateStr = DateFormat('dd MMM yyyy').format(dt);
        return [
          v['name'] ?? v['visitorName'] ?? '',
          v['designation'] ?? '',
          v['phone'] ?? v['mobile'] ?? '',
          v['purpose'] ?? v['note'] ?? '',
          dateStr,
        ];
      }).toList(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final canCreate = widget.role != Roles.admin &&
        AccessControl.can(widget.role, ActionPermission.create);

    return CupertinoPageScaffold(
      backgroundColor: bgLight,
      navigationBar: CupertinoNavigationBar(
        middle: const Text("Visitors"),
        backgroundColor: primaryBlue,
        brightness: Brightness.dark,
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CupertinoButton(
              padding: EdgeInsets.zero,
              onPressed: _visibleVisitors.isEmpty ? null : _exportCsv,
              child: const Icon(CupertinoIcons.arrow_down_doc,
                  size: 22, color: CupertinoColors.white),
            ),
            if (canCreate)
              CupertinoButton(
                padding: EdgeInsets.zero,
                onPressed: _openAddVisitor,
                child: const Icon(CupertinoIcons.add,
                    color: CupertinoColors.white),
              ),
            CupertinoButton(
              padding: EdgeInsets.zero,
              onPressed: fetchVisitors,
              child: const Icon(CupertinoIcons.refresh,
                  color: CupertinoColors.white),
            ),
          ],
        ),
      ),
      child: SafeArea(
        child: Column(
          children: [
            CupertinoDateRangeFilter(
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
              child: loading
            ? const Center(child: CupertinoActivityIndicator())
            : error != null
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(CupertinoIcons.exclamationmark_circle,
                            size: 48,
                            color: CupertinoColors.systemGrey3),
                        const SizedBox(height: 16),
                        Text(error!,
                            style: TextStyle(
                                color:
                                    CupertinoColors.systemGrey)),
                        const SizedBox(height: 16),
                        CupertinoButton.filled(
                          onPressed: fetchVisitors,
                          child: const Text("Retry"),
                        ),
                      ],
                    ),
                  )
                : _visibleVisitors.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment:
                              MainAxisAlignment.center,
                          children: [
                            Icon(CupertinoIcons.person_2,
                                size: 64,
                                color:
                                    CupertinoColors.systemGrey4),
                            const SizedBox(height: 16),
                            Text("No visitors found",
                                style: TextStyle(
                                    fontSize: 16,
                                    color: CupertinoColors
                                        .systemGrey)),
                          ],
                        ),
                      )
                    : CustomScrollView(
                        slivers: [
                          CupertinoSliverRefreshControl(
                            onRefresh: fetchVisitors,
                          ),
                          SliverPadding(
                            padding: const EdgeInsets.all(16),
                            sliver: SliverList(
                              delegate:
                                  SliverChildBuilderDelegate(
                                (context, index) {
                                  final v = _visibleVisitors[index];

                                  final int? id = v["id"] is int
                                      ? v["id"]
                                      : int.tryParse(
                                          v["id"]?.toString() ??
                                              "");

                                  final name = v["name"] ??
                                      v["visitorName"] ??
                                      "Unknown";
                                  final phone = v["phone"] ??
                                      v["mobile"] ??
                                      "-";
                                  final purpose = v["purpose"] ??
                                      v["note"] ??
                                      "-";
                                  final date = v["date"] ??
                                      v["visitDate"] ??
                                      "-";

                                  return CupertinoStyledCard(
                                    margin: const EdgeInsets.only(
                                        bottom: 12),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                        Container(
                                          width: 44,
                                          height: 44,
                                          decoration:
                                              BoxDecoration(
                                            color: primaryBlue
                                                .withOpacity(
                                                    0.1),
                                            borderRadius:
                                                BorderRadius
                                                    .circular(
                                                        22),
                                          ),
                                          child: const Icon(
                                              CupertinoIcons
                                                  .person,
                                              color:
                                                  primaryBlue),
                                        ),
                                        const SizedBox(
                                            width: 14),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment
                                                    .start,
                                            children: [
                                              Text(
                                                name.toString(),
                                                style:
                                                    const TextStyle(
                                                  fontSize: 15,
                                                  fontWeight:
                                                      FontWeight
                                                          .bold,
                                                ),
                                              ),
                                              const SizedBox(
                                                  height: 6),
                                              Text(
                                                "Phone: $phone",
                                                style:
                                                    TextStyle(
                                                  fontSize: 13,
                                                  color: CupertinoColors
                                                      .systemGrey,
                                                ),
                                              ),
                                              const SizedBox(
                                                  height: 4),
                                              Text(
                                                "Date: $date",
                                                style:
                                                    TextStyle(
                                                  fontSize: 13,
                                                  color: CupertinoColors
                                                      .systemGrey,
                                                ),
                                              ),
                                              const SizedBox(
                                                  height: 4),
                                              Text(
                                                "Purpose: $purpose",
                                                style:
                                                    const TextStyle(
                                                        fontSize:
                                                            13),
                                              ),
                                            ],
                                          ),
                                        ),
                                          ],
                                        ),
                                        if (widget.role ==
                                                Roles.admin &&
                                            id != null) ...[
                                          const SizedBox(height: 8),
                                          Align(
                                            alignment:
                                                Alignment.centerRight,
                                            child: CupertinoButton(
                                              padding: EdgeInsets.zero,
                                              minSize: 0,
                                              onPressed: () =>
                                                  _deleteVisitor(id),
                                              child: const Icon(
                                                  CupertinoIcons.delete,
                                                  color: AppTheme
                                                      .destructiveRed),
                                            ),
                                          ),
                                        ],
                                      ],
                                    ),
                                  );
                                },
                                childCount: _visibleVisitors.length,
                              ),
                            ),
                          ),
                        ],
                      ),
            ),
          ],
        ),
      ),
    );
  }
}

// ================= ADD VISITOR SHEET (Cupertino) =================

class _CupertinoAddVisitorSheet extends StatefulWidget {
  final Future<void> Function() onCreated;
  const _CupertinoAddVisitorSheet({required this.onCreated});

  @override
  State<_CupertinoAddVisitorSheet> createState() =>
      __CupertinoAddVisitorSheetState();
}

class __CupertinoAddVisitorSheetState
    extends State<_CupertinoAddVisitorSheet> {
  static const Color primaryBlue = Color(0xFF0A2E5C);

  final nameController = TextEditingController();
  final phoneController = TextEditingController();
  final purposeController = TextEditingController();

  bool submitting = false;

  // Validation errors
  String? _nameError;
  String? _phoneError;
  String? _purposeError;

  @override
  void dispose() {
    nameController.dispose();
    phoneController.dispose();
    purposeController.dispose();
    super.dispose();
  }

  bool _validate() {
    bool valid = true;
    setState(() {
      _nameError = (nameController.text.trim().length < 3)
          ? "Enter valid name"
          : null;
      _phoneError = (phoneController.text.trim().length < 10)
          ? "Enter valid phone"
          : null;
      _purposeError = purposeController.text.trim().isEmpty
          ? "Enter purpose"
          : null;
    });

    if (_nameError != null ||
        _phoneError != null ||
        _purposeError != null) {
      valid = false;
    }
    return valid;
  }

  Future<void> _submit() async {
    if (!_validate()) return;

    setState(() => submitting = true);

    try {
      final res = await HttpService.post("/api/visitors", {
        "name": nameController.text.trim(),
        "phone": phoneController.text.trim(),
        "purpose": purposeController.text.trim(),
      });

      if (res.statusCode == 201 || res.statusCode == 200) {
        CupertinoToast.show(context, "Visitor added");
        await widget.onCreated();
      } else {
        CupertinoToast.show(
            context, "Failed (${res.statusCode})",
            isError: true);
      }
    } catch (_) {
      CupertinoToast.show(context, "Server error / No internet",
          isError: true);
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      decoration: const BoxDecoration(
        color: CupertinoColors.systemBackground,
        borderRadius:
            BorderRadius.vertical(top: Radius.circular(18)),
      ),
      padding: EdgeInsets.only(
          left: 16, right: 16, bottom: bottom + 16, top: 16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
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
          const SizedBox(height: 12),
          const Text("Add Visitor",
              style: TextStyle(
                  fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 16),

          // Name
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CupertinoTextField(
                controller: nameController,
                placeholder: "Visitor Name",
                padding: const EdgeInsets.symmetric(
                    horizontal: 12, vertical: 14),
                decoration: BoxDecoration(
                  color: AppTheme.backgroundAlt,
                  borderRadius:
                      BorderRadius.circular(AppTheme.radiusMd),
                  border: Border.all(
                      color: _nameError != null
                          ? AppTheme.destructiveRed
                          : AppTheme.border),
                ),
              ),
              if (_nameError != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4, left: 4),
                  child: Text(_nameError!,
                      style: const TextStyle(
                          color: AppTheme.destructiveRed,
                          fontSize: 12)),
                ),
            ],
          ),
          const SizedBox(height: 12),

          // Phone
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CupertinoTextField(
                controller: phoneController,
                placeholder: "Phone",
                keyboardType: TextInputType.phone,
                padding: const EdgeInsets.symmetric(
                    horizontal: 12, vertical: 14),
                decoration: BoxDecoration(
                  color: AppTheme.backgroundAlt,
                  borderRadius:
                      BorderRadius.circular(AppTheme.radiusMd),
                  border: Border.all(
                      color: _phoneError != null
                          ? AppTheme.destructiveRed
                          : AppTheme.border),
                ),
              ),
              if (_phoneError != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4, left: 4),
                  child: Text(_phoneError!,
                      style: const TextStyle(
                          color: AppTheme.destructiveRed,
                          fontSize: 12)),
                ),
            ],
          ),
          const SizedBox(height: 12),

          // Purpose
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              CupertinoTextField(
                controller: purposeController,
                placeholder: "Purpose",
                padding: const EdgeInsets.symmetric(
                    horizontal: 12, vertical: 14),
                decoration: BoxDecoration(
                  color: AppTheme.backgroundAlt,
                  borderRadius:
                      BorderRadius.circular(AppTheme.radiusMd),
                  border: Border.all(
                      color: _purposeError != null
                          ? AppTheme.destructiveRed
                          : AppTheme.border),
                ),
              ),
              if (_purposeError != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4, left: 4),
                  child: Text(_purposeError!,
                      style: const TextStyle(
                          color: AppTheme.destructiveRed,
                          fontSize: 12)),
                ),
            ],
          ),
          const SizedBox(height: 16),

          // Submit
          SizedBox(
            width: double.infinity,
            child: CupertinoButton.filled(
              onPressed: submitting ? null : _submit,
              padding: const EdgeInsets.symmetric(vertical: 14),
              borderRadius: BorderRadius.circular(12),
              child: submitting
                  ? const CupertinoActivityIndicator(
                      color: CupertinoColors.white)
                  : const Text("Save"),
            ),
          ),
        ],
      ),
    );
  }
}
