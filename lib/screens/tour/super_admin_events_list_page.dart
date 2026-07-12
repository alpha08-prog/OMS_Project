import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/http_service.dart';
import '../../utils/csv_export.dart';
import '../../widgets/date_range_filter.dart';

enum EventsCategory { today, upcoming, all }

/// Super Admin Events list — single category at a time. Read-only:
/// no Add / Edit / Delete actions. Date + name filters apply only when
/// the category is `upcoming` or `all`. Today's view stays unfiltered.
class SuperAdminEventsListPage extends StatefulWidget {
  final EventsCategory category;
  const SuperAdminEventsListPage({super.key, required this.category});

  @override
  State<SuperAdminEventsListPage> createState() =>
      _SuperAdminEventsListPageState();
}

class _SuperAdminEventsListPageState extends State<SuperAdminEventsListPage> {
  static const Color primaryBlue = Color(0xFF0A2E5C);
  static const Color bgLight = Color(0xFFF4F6FB);
  static const Color accentGreen = Color(0xFF10B981);
  static const Color accentOrange = Color(0xFFF59E0B);
  static const Color accentRed = Color(0xFFEF4444);

  bool _loading = true;
  List<Map<String, dynamic>> _items = [];

  DateTime? _dateFrom;
  DateTime? _dateTo;
  final TextEditingController _nameCtrl = TextEditingController();
  String _nameQuery = "";

  String get _endpoint {
    switch (widget.category) {
      case EventsCategory.today:
        return "/api/tour-programs/schedule/today";
      case EventsCategory.upcoming:
        return "/api/tour-programs/upcoming";
      case EventsCategory.all:
        return "/api/tour-programs";
    }
  }

  String get _title {
    switch (widget.category) {
      case EventsCategory.today:
        return "Today's Events";
      case EventsCategory.upcoming:
        return "Upcoming Events";
      case EventsCategory.all:
        return "All Events";
    }
  }

  bool get _showFilters => widget.category != EventsCategory.today;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    super.dispose();
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

  List<Map<String, dynamic>> get _visible {
    if (!_showFilters) return _items;
    final q = _nameQuery.trim().toLowerCase();
    return _items.where((e) {
      if (_dateFrom != null || _dateTo != null) {
        final raw = (e['dateTime'] ?? e['createdAt'])?.toString();
        final dt = DateTime.tryParse(raw ?? '');
        if (!dateInRange(dt, from: _dateFrom, to: _dateTo)) return false;
      }
      if (q.isNotEmpty) {
        final name = (e['eventName'] ?? '').toString().toLowerCase();
        if (!name.contains(q)) return false;
      }
      return true;
    }).toList();
  }

  void _showDetailSheet(Map<String, dynamic> item) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (_) => _EventDetailSheet(item: item),
    );
  }

  void _exportCsv() {
    CsvExport.export(
      context,
      fileName: 'events',
      headers: const [
        'Event',
        'Organizer',
        'Venue',
        'Date & Time',
        'Status',
        'Created'
      ],
      rows: _visible.map((r) {
        String dateTime = '';
        try {
          dateTime = DateFormat('dd MMM yyyy, h:mm a')
              .format(DateTime.parse(r['dateTime'].toString()));
        } catch (_) {}
        String created = '';
        try {
          created = DateFormat('dd MMM yyyy')
              .format(DateTime.parse(r['createdAt'].toString()));
        } catch (_) {}
        return [
          r['eventName'] ?? '',
          r['organizer'] ?? '',
          r['venue'] ?? '',
          dateTime,
          _statusLabel((r['decision'] ?? 'PENDING').toString().toUpperCase()),
          created,
        ];
      }).toList(),
    );
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
            tooltip: "Export CSV",
            icon: const Icon(Icons.download, color: Colors.white),
            onPressed: list.isEmpty ? null : _exportCsv,
          ),
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white),
            onPressed: _load,
          ),
        ],
      ),
      body: Column(
        children: [
          if (_showFilters) ...[
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
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: TextField(
                controller: _nameCtrl,
                onChanged: (v) => setState(() => _nameQuery = v),
                decoration: InputDecoration(
                  isDense: true,
                  hintText: "Search by event name",
                  prefixIcon: const Icon(Icons.search, size: 20),
                  suffixIcon: _nameQuery.isEmpty
                      ? null
                      : IconButton(
                          icon: const Icon(Icons.clear, size: 18),
                          onPressed: () {
                            _nameCtrl.clear();
                            setState(() => _nameQuery = "");
                          },
                        ),
                  contentPadding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 10),
                  filled: true,
                  fillColor: Colors.white,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide(color: Colors.grey.shade300),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide(color: Colors.grey.shade300),
                  ),
                ),
              ),
            ),
          ],
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
            child: Row(
              children: [
                Text(
                  "${list.length} event${list.length == 1 ? '' : 's'}",
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
                          padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                          itemCount: list.length,
                          itemBuilder: (_, i) => _eventCard(list[i]),
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
            "No events found",
            style: TextStyle(fontSize: 16, color: Colors.grey.shade600),
          ),
        ],
      ),
    );
  }

  Widget _eventCard(Map<String, dynamic> item) {
    final title = item["eventName"] ?? "Tour Program";
    final location = item["venue"] ?? "-";
    final dateStr = item["dateTime"] ?? "";
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
      onTap: () => _showDetailSheet(item),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: isToday ? Border.all(color: accentOrange, width: 2) : null,
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
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
                        const Icon(Icons.event, color: primaryBlue, size: 22),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title.toString(),
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.bold,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            Icon(Icons.calendar_today,
                                size: 12, color: Colors.grey.shade600),
                            const SizedBox(width: 4),
                            Flexible(
                              child: Text(
                                formattedTime.isNotEmpty
                                    ? "$formattedDate at $formattedTime"
                                    : formattedDate,
                                style: TextStyle(
                                  fontSize: 12,
                                  color: isToday
                                      ? accentOrange
                                      : Colors.grey.shade600,
                                  fontWeight: isToday
                                      ? FontWeight.bold
                                      : FontWeight.normal,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            if (isToday) ...[
                              const SizedBox(width: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 5, vertical: 2),
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
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
              child: Row(
                children: [
                  Icon(Icons.location_on,
                      size: 16, color: Colors.grey.shade500),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      location.toString(),
                      style: const TextStyle(fontSize: 13),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Icon(Icons.chevron_right,
                      size: 18, color: Colors.grey.shade400),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _statusChip(String status) {
    final color = _statusColor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        _statusLabel(status),
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.bold,
          color: color,
        ),
      ),
    );
  }

  Color _statusColor(String s) {
    switch (s) {
      case "ACCEPTED":
        return accentGreen;
      case "REGRET":
        return accentRed;
      case "PENDING":
      default:
        return accentOrange;
    }
  }

  String _statusLabel(String s) {
    switch (s) {
      case "ACCEPTED":
        return "Accepted";
      case "REGRET":
        return "Regret";
      case "PENDING":
      default:
        return "Pending";
    }
  }
}

// =====================================================
// Read-only Event Detail Sheet (Material)
// =====================================================
class _EventDetailSheet extends StatelessWidget {
  final Map<String, dynamic> item;
  const _EventDetailSheet({required this.item});

  static const Color primaryBlue = Color(0xFF0A2E5C);
  static const Color accentGreen = Color(0xFF10B981);
  static const Color accentOrange = Color(0xFFF59E0B);
  static const Color accentRed = Color(0xFFEF4444);

  @override
  Widget build(BuildContext context) {
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
        formattedDate =
            DateFormat("EEEE, MMMM d, yyyy 'at' h:mm a").format(parsed);
      }
    } catch (_) {}

    String formattedCreatedAt = "";
    try {
      if (createdAt.isNotEmpty) {
        final parsed = DateTime.parse(createdAt);
        formattedCreatedAt = DateFormat('MMM d, yyyy h:mm a').format(parsed);
      }
    } catch (_) {}

    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) {
        return SingleChildScrollView(
          controller: scrollController,
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
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
              const SizedBox(height: 18),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    padding: const EdgeInsets.all(11),
                    decoration: BoxDecoration(
                      color: primaryBlue.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child:
                        const Icon(Icons.event, color: primaryBlue, size: 26),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title.toString(),
                          style: const TextStyle(
                              fontSize: 19, fontWeight: FontWeight.bold),
                        ),
                        const SizedBox(height: 6),
                        _statusChip(status),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 22),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.grey.shade200),
                ),
                child: Column(
                  children: [
                    _row(Icons.calendar_today, "Date & Time", formattedDate),
                    const SizedBox(height: 10),
                    _row(Icons.location_on, "Venue", location.toString()),
                    if (venueLink.toString().isNotEmpty) ...[
                      const SizedBox(height: 10),
                      _row(Icons.link, "Venue Link", venueLink.toString()),
                    ],
                    if (organizer.toString().isNotEmpty) ...[
                      const SizedBox(height: 10),
                      _row(Icons.business, "Organizer", organizer.toString()),
                    ],
                    if (chiefGuest.toString().isNotEmpty) ...[
                      const SizedBox(height: 10),
                      _row(Icons.person, "Chief Guest",
                          chiefGuest.toString()),
                    ],
                    if (contactPhone.toString().isNotEmpty) ...[
                      const SizedBox(height: 10),
                      _row(Icons.phone, "Contact",
                          contactPhone.toString()),
                    ],
                    if (expectedFootfall != null) ...[
                      const SizedBox(height: 10),
                      _row(Icons.groups, "Expected Footfall",
                          "$expectedFootfall people"),
                    ],
                    if (referencedBy.toString().isNotEmpty) ...[
                      const SizedBox(height: 10),
                      _row(Icons.person_outline, "Referenced By",
                          referencedBy.toString()),
                    ],
                  ],
                ),
              ),
              if (description.toString().isNotEmpty) ...[
                const SizedBox(height: 14),
                const Text("Description",
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: Colors.black54)),
                const SizedBox(height: 6),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.grey.shade100,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(description.toString(),
                      style: const TextStyle(fontSize: 13)),
                ),
              ],
              if (decisionNote.toString().isNotEmpty) ...[
                const SizedBox(height: 14),
                const Text("Decision Note",
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: Colors.black54)),
                const SizedBox(height: 6),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFFF8E1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(decisionNote.toString(),
                      style: const TextStyle(fontSize: 13)),
                ),
              ],
              if (formattedCreatedAt.isNotEmpty) ...[
                const SizedBox(height: 14),
                Center(
                  child: Text("Created: $formattedCreatedAt",
                      style: TextStyle(
                          fontSize: 11, color: Colors.grey.shade600)),
                ),
              ],
              const SizedBox(height: 20),
            ],
          ),
        );
      },
    );
  }

  Widget _row(IconData icon, String label, String value) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: Colors.grey.shade600),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label,
                  style: TextStyle(
                      fontSize: 11, color: Colors.grey.shade600)),
              const SizedBox(height: 2),
              Text(value,
                  style: const TextStyle(
                      fontSize: 14, fontWeight: FontWeight.w500)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _statusChip(String status) {
    Color bg, fg;
    String label;
    switch (status) {
      case "ACCEPTED":
        bg = accentGreen.withOpacity(0.12);
        fg = accentGreen;
        label = "Accepted";
        break;
      case "REGRET":
        bg = accentRed.withOpacity(0.12);
        fg = accentRed;
        label = "Regret";
        break;
      case "PENDING":
      default:
        bg = accentOrange.withOpacity(0.12);
        fg = accentOrange;
        label = "Pending";
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(label,
          style: TextStyle(
              fontSize: 11, fontWeight: FontWeight.bold, color: fg)),
    );
  }
}
