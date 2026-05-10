import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';

import '../../../services/http_service.dart';
import '../../../widgets/cupertino/cupertino_date_range_filter.dart';
import '../../../widgets/cupertino/cupertino_filter_row.dart';
import '../../../widgets/cupertino/cupertino_page_header.dart';
import '../../../widgets/date_range_filter.dart' show dateInRange;
import '../super_admin_tour_list_page.dart' show TourCategory;

/// Super Admin Tour Programs list (Cupertino) — view-only.
/// No add / edit / delete / accept / regret actions. Status (All / Pending /
/// Approved / Rejected) and date range filters apply on the client.
class CupertinoSuperAdminTourListPage extends StatefulWidget {
  final TourCategory category;
  const CupertinoSuperAdminTourListPage({super.key, required this.category});

  @override
  State<CupertinoSuperAdminTourListPage> createState() =>
      _CupertinoSuperAdminTourListPageState();
}

class _CupertinoSuperAdminTourListPageState
    extends State<CupertinoSuperAdminTourListPage> {
  static const Color primaryBlue = Color(0xFF0A2E5C);
  static const Color bgLight = Color(0xFFF4F6FB);
  static const Color accentGreen = Color(0xFF10B981);
  static const Color accentOrange = Color(0xFFF59E0B);
  static const Color accentRed = Color(0xFFEF4444);

  bool _loading = true;
  List<Map<String, dynamic>> _items = [];

  String _statusFilter = "All";
  DateTime? _dateFrom;
  DateTime? _dateTo;

  static const _statuses = ["All", "Pending", "Approved", "Rejected"];

  String get _endpoint {
    switch (widget.category) {
      case TourCategory.today:
        return "/api/tour-programs/schedule/today";
      case TourCategory.upcoming:
        return "/api/tour-programs/upcoming";
      case TourCategory.all:
        return "/api/tour-programs";
    }
  }

  String get _title {
    switch (widget.category) {
      case TourCategory.today:
        return "Today's Programs";
      case TourCategory.upcoming:
        return "Upcoming Programs";
      case TourCategory.all:
        return "All Programs";
    }
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await HttpService.get(_endpoint);
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list =
            decoded is List ? decoded : (decoded["data"] ?? []);
        setState(() {
          _items = list
              .map<Map<String, dynamic>>(
                  (e) => Map<String, dynamic>.from(e))
              .toList();
          _loading = false;
        });
      } else {
        setState(() => _loading = false);
      }
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  bool _matchesStatus(Map<String, dynamic> e) {
    if (_statusFilter == "All") return true;
    final d = (e['decision'] ?? 'PENDING').toString().toUpperCase();
    switch (_statusFilter) {
      case "Pending":
        return d == "PENDING";
      case "Approved":
        return d == "ACCEPTED" || d == "APPROVED";
      case "Rejected":
        return d == "REGRET" || d == "REJECTED";
      default:
        return true;
    }
  }

  List<Map<String, dynamic>> get _visible {
    return _items.where((e) {
      if (!_matchesStatus(e)) return false;
      if (_dateFrom != null || _dateTo != null) {
        final raw = (e['dateTime'] ?? e['createdAt'])?.toString();
        final dt = DateTime.tryParse(raw ?? '');
        if (!dateInRange(dt, from: _dateFrom, to: _dateTo)) return false;
      }
      return true;
    }).toList();
  }

  Color _statusColor(String s) {
    switch (s.toUpperCase()) {
      case 'ACCEPTED':
      case 'APPROVED':
        return accentGreen;
      case 'PENDING':
        return accentOrange;
      case 'REGRET':
      case 'REJECTED':
        return accentRed;
      default:
        return CupertinoColors.systemGrey;
    }
  }

  String _statusLabel(String s) {
    final u = s.toUpperCase();
    if (u == 'ACCEPTED') return 'APPROVED';
    if (u == 'REGRET') return 'REJECTED';
    return u;
  }

  @override
  Widget build(BuildContext context) {
    final list = _visible;
    return CupertinoPageScaffold(
      backgroundColor: bgLight,
      child: Column(
        children: [
          OmsPageHeader(
            title: _title,
            showBack: false,
            trailing: CupertinoButton(
              padding: EdgeInsets.zero,
              onPressed: _load,
              child: const Icon(CupertinoIcons.refresh,
                  color: CupertinoColors.white),
            ),
          ),
          Expanded(
            child: Column(
              children: [
            // Status chips
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
              child: CupertinoFilterRow(
                options: _statuses,
                selected: _statusFilter,
                selectedColor: primaryBlue,
                onSelected: (v) => setState(() => _statusFilter = v),
              ),
            ),

            // Date range
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

            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
              child: Row(
                children: [
                  Text(
                    "${list.length} program${list.length == 1 ? '' : 's'}",
                    style: const TextStyle(
                      fontSize: 13,
                      color: CupertinoColors.systemGrey,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),

            Expanded(
              child: _loading
                  ? const Center(child: CupertinoActivityIndicator())
                  : list.isEmpty
                      ? _emptyView()
                      : CustomScrollView(
                          slivers: [
                            CupertinoSliverRefreshControl(
                              onRefresh: _load,
                            ),
                            SliverPadding(
                              padding: const EdgeInsets.fromLTRB(
                                  16, 4, 16, 16),
                              sliver: SliverList(
                                delegate: SliverChildBuilderDelegate(
                                  (_, i) => _programCard(list[i]),
                                  childCount: list.length,
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

  Widget _emptyView() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(CupertinoIcons.calendar_badge_minus,
              size: 64, color: CupertinoColors.systemGrey3),
          const SizedBox(height: 16),
          const Text("No programs found",
              style: TextStyle(
                  fontSize: 16, color: CupertinoColors.systemGrey)),
        ],
      ),
    );
  }

  Widget _programCard(Map<String, dynamic> item) {
    final title = (item["eventName"] ?? "Tour Program").toString();
    final venue = (item["venue"] ?? "-").toString();
    final organizer = (item["organizer"] ?? "").toString();
    final dateStr = item["dateTime"]?.toString() ?? "";
    final status = (item["decision"] ?? "PENDING").toString().toUpperCase();

    String formattedDate = dateStr;
    String formattedTime = "";
    bool isToday = false;
    try {
      if (dateStr.isNotEmpty) {
        final parsed = DateTime.parse(dateStr);
        formattedDate = DateFormat('EEE, MMM d, yyyy').format(parsed);
        formattedTime = DateFormat('h:mm a').format(parsed);
        final now = DateTime.now();
        isToday = parsed.year == now.year &&
            parsed.month == now.month &&
            parsed.day == now.day;
      }
    } catch (_) {}

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => _showDetailSheet(item),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: CupertinoColors.white,
          borderRadius: BorderRadius.circular(14),
          border: isToday
              ? Border.all(color: accentOrange, width: 2)
              : Border.all(color: CupertinoColors.systemGrey5),
          boxShadow: [
            BoxShadow(
              color: CupertinoColors.black.withOpacity(0.04),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: _statusColor(status).withOpacity(0.08),
                borderRadius:
                    const BorderRadius.vertical(top: Radius.circular(14)),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(9),
                    decoration: BoxDecoration(
                      color: primaryBlue.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(CupertinoIcons.calendar,
                        color: primaryBlue, size: 18),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      title,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: _statusColor(status),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      _statusLabel(status),
                      style: const TextStyle(
                        color: CupertinoColors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 0.3,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (organizer.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Row(
                        children: [
                          const Icon(CupertinoIcons.person,
                              size: 14,
                              color: CupertinoColors.systemGrey),
                          const SizedBox(width: 6),
                          Text(
                            organizer,
                            style: const TextStyle(
                              fontSize: 12,
                              color: CupertinoColors.systemGrey,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  Row(
                    children: [
                      const Icon(CupertinoIcons.location,
                          size: 14, color: CupertinoColors.systemGrey),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          venue,
                          style: const TextStyle(
                              fontSize: 12,
                              color: CupertinoColors.systemGrey),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  if (formattedDate.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        const Icon(CupertinoIcons.calendar_today,
                            size: 13,
                            color: CupertinoColors.systemGrey),
                        const SizedBox(width: 6),
                        Text(
                          "$formattedDate${formattedTime.isNotEmpty ? ' · $formattedTime' : ''}",
                          style: const TextStyle(
                              fontSize: 12,
                              color: CupertinoColors.systemGrey),
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

  void _showDetailSheet(Map<String, dynamic> item) {
    showCupertinoModalPopup(
      context: context,
      builder: (_) => _CupertinoTourDetailSheet(item: item),
    );
  }
}

class _CupertinoTourDetailSheet extends StatelessWidget {
  final Map<String, dynamic> item;
  const _CupertinoTourDetailSheet({required this.item});

  String _fmt(dynamic v) {
    if (v == null) return '';
    try {
      final dt = DateTime.parse(v.toString()).toLocal();
      return DateFormat('EEE, dd MMM yyyy · hh:mm a').format(dt);
    } catch (_) {
      return v.toString();
    }
  }

  @override
  Widget build(BuildContext context) {
    final title = (item["eventName"] ?? "Tour Program").toString();
    final organizer = (item["organizer"] ?? "").toString();
    final venue = (item["venue"] ?? "").toString();
    final location = (item["location"] ?? "").toString();
    final constituency = (item["constituency"] ?? "").toString();
    final desc = (item["description"] ?? "").toString();
    final remarks = (item["remarks"] ?? "").toString();
    final decision =
        (item["decision"] ?? "PENDING").toString().toUpperCase();
    final dateStr = _fmt(item["dateTime"]);

    final fields = <MapEntry<String, String>>[];
    void put(String k, String v) {
      if (v.trim().isNotEmpty) fields.add(MapEntry(k, v));
    }

    put("Organizer", organizer);
    put("Date / Time", dateStr);
    put("Venue", venue);
    put("Location", location);
    put("Constituency", constituency);
    put("Description", desc);
    put("Remarks", remarks);

    Color statusColor;
    String statusLabel = decision;
    switch (decision) {
      case 'ACCEPTED':
      case 'APPROVED':
        statusColor = const Color(0xFF10B981);
        statusLabel = 'APPROVED';
        break;
      case 'PENDING':
        statusColor = const Color(0xFFF59E0B);
        break;
      case 'REGRET':
      case 'REJECTED':
        statusColor = const Color(0xFFEF4444);
        statusLabel = 'REJECTED';
        break;
      default:
        statusColor = CupertinoColors.systemGrey;
    }

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 60),
      decoration: BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(16),
      ),
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.8,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 12, 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    title,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                CupertinoButton(
                  padding: EdgeInsets.zero,
                  minSize: 32,
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Icon(CupertinoIcons.xmark,
                      size: 20, color: CupertinoColors.systemGrey),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusColor.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    statusLabel,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: statusColor,
                      letterSpacing: 0.3,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFFF3F4F6),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (var i = 0; i < fields.length; i++) ...[
                      if (i > 0) const SizedBox(height: 14),
                      Text(
                        fields[i].key.toUpperCase(),
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF6B7280),
                          letterSpacing: 0.5,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        fields[i].value,
                        style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                    ],
                    if (fields.isEmpty)
                      const Text(
                        "No additional details",
                        style: TextStyle(
                          fontSize: 13,
                          color: CupertinoColors.systemGrey,
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
