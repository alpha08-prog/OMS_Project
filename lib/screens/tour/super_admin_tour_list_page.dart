import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/http_service.dart';
import '../../widgets/date_range_filter.dart';

enum TourCategory { today, upcoming, all }

/// Super Admin Tour Programs list — view-only.
/// No add / edit / delete / accept / regret actions. Status (Pending /
/// Approved / Rejected / All) and date range filters apply on the client.
class SuperAdminTourListPage extends StatefulWidget {
  final TourCategory category;
  const SuperAdminTourListPage({super.key, required this.category});

  @override
  State<SuperAdminTourListPage> createState() =>
      _SuperAdminTourListPageState();
}

class _SuperAdminTourListPageState extends State<SuperAdminTourListPage> {
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
        return Colors.grey;
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
    return Scaffold(
      backgroundColor: bgLight,
      appBar: AppBar(
        title: Text(_title),
        backgroundColor: primaryBlue,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        titleTextStyle: const TextStyle(
          color: Colors.white,
          fontSize: 18,
          fontWeight: FontWeight.bold,
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white),
            onPressed: _load,
          ),
        ],
      ),
      body: Column(
        children: [
          // Status filter chips
          SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
              children: _statuses.map((s) {
                final selected = _statusFilter == s;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(s),
                    selected: selected,
                    onSelected: (_) => setState(() => _statusFilter = s),
                    selectedColor: primaryBlue,
                    labelStyle: TextStyle(
                      color: selected ? Colors.white : Colors.black87,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                    backgroundColor: Colors.white,
                    side: BorderSide(color: Colors.grey.shade300),
                  ),
                );
              }).toList(),
            ),
          ),

          // Date range
          DateRangeFilter(
            from: _dateFrom,
            to: _dateTo,
            tint: primaryBlue,
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
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
                  style: TextStyle(
                    fontSize: 13,
                    color: Colors.grey.shade700,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),

          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : list.isEmpty
                    ? _emptyView()
                    : RefreshIndicator(
                        onRefresh: _load,
                        child: ListView.builder(
                          padding:
                              const EdgeInsets.fromLTRB(16, 4, 16, 16),
                          itemCount: list.length,
                          itemBuilder: (_, i) => _programCard(list[i]),
                        ),
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

    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () => _showDetailSheet(item),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: isToday
              ? Border.all(color: accentOrange, width: 2)
              : Border.all(color: Colors.grey.shade200),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.04),
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
                    child:
                        const Icon(Icons.event, color: primaryBlue, size: 18),
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
                        color: Colors.white,
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
                          Icon(Icons.person_outline,
                              size: 14, color: Colors.grey.shade600),
                          const SizedBox(width: 6),
                          Text(
                            organizer,
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade700,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  Row(
                    children: [
                      Icon(Icons.location_on_outlined,
                          size: 14, color: Colors.grey.shade600),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          venue,
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade700,
                          ),
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
                        Icon(Icons.calendar_today,
                            size: 13, color: Colors.grey.shade600),
                        const SizedBox(width: 6),
                        Text(
                          "$formattedDate${formattedTime.isNotEmpty ? ' · $formattedTime' : ''}",
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade700,
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

  void _showDetailSheet(Map<String, dynamic> item) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => _TourDetailSheet(item: item),
    );
  }
}

class _TourDetailSheet extends StatelessWidget {
  final Map<String, dynamic> item;
  const _TourDetailSheet({required this.item});

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
    final decision = (item["decision"] ?? "PENDING").toString().toUpperCase();
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
        statusColor = Colors.grey;
    }

    return Padding(
      padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        top: false,
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.85,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 12, 8),
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
                    IconButton(
                      icon: const Icon(Icons.close, size: 20),
                      color: Colors.grey,
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                      onPressed: () => Navigator.of(context).pop(),
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
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
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
                          Text(
                            "No additional details",
                            style: TextStyle(
                              fontSize: 13,
                              color: Colors.grey.shade600,
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
