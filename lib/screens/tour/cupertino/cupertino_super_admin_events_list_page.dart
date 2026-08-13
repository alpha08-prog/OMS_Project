import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';

import '../../../services/http_service.dart';
import '../../../utils/csv_export.dart';
import '../../../widgets/cupertino/cupertino_date_range_filter.dart';
import '../../../widgets/cupertino/cupertino_page_header.dart';
import '../../../widgets/date_range_filter.dart' show dateInRange;
import '../super_admin_events_list_page.dart' show EventsCategory;
import '../../../widgets/oms_loader.dart';

class CupertinoSuperAdminEventsListPage extends StatefulWidget {
  final EventsCategory category;
  const CupertinoSuperAdminEventsListPage({super.key, required this.category});

  @override
  State<CupertinoSuperAdminEventsListPage> createState() =>
      _CupertinoSuperAdminEventsListPageState();
}

class _CupertinoSuperAdminEventsListPageState
    extends State<CupertinoSuperAdminEventsListPage> {
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
        final List list = decoded is List ? decoded : (decoded["data"] ?? []);
        setState(() {
          _items = list
              .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
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
    showCupertinoModalPopup(
      context: context,
      builder: (_) => _CupertinoEventDetailSheet(item: item),
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

    return CupertinoPageScaffold(
      backgroundColor: bgLight,
      child: Column(
        children: [
          OmsPageHeader(
            title: _title,
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                CupertinoButton(
                  padding: EdgeInsets.zero,
                  onPressed: list.isEmpty ? null : _exportCsv,
                  child: const Icon(CupertinoIcons.arrow_down_doc,
                      size: 22, color: CupertinoColors.white),
                ),
                CupertinoButton(
                  padding: EdgeInsets.zero,
                  onPressed: _load,
                  child: const Icon(CupertinoIcons.refresh,
                      color: CupertinoColors.white),
                ),
              ],
            ),
          ),
          Expanded(
            child: Column(
              children: [
                if (_showFilters) ...[
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
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                    child: CupertinoSearchTextField(
                      controller: _nameCtrl,
                      placeholder: "Search by event name",
                      onChanged: (v) => setState(() => _nameQuery = v),
                      onSuffixTap: () {
                        _nameCtrl.clear();
                        setState(() => _nameQuery = "");
                      },
                    ),
                  ),
                ],
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
                  child: Row(
                    children: [
                      Text(
                        "${list.length} event${list.length == 1 ? '' : 's'}",
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
                      ? OmsLoader(size: 56)
                      : list.isEmpty
                          ? _emptyView()
                          : ListView.builder(
                              padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                              itemCount: list.length,
                              itemBuilder: (_, i) => _eventCard(list[i]),
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
        children: const [
          Icon(CupertinoIcons.calendar_badge_minus,
              size: 64, color: CupertinoColors.systemGrey3),
          SizedBox(height: 16),
          Text("No events found",
              style:
                  TextStyle(fontSize: 16, color: CupertinoColors.systemGrey)),
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
                    child: const Icon(CupertinoIcons.calendar,
                        color: primaryBlue, size: 22),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title.toString(),
                          style: const TextStyle(
                              fontSize: 15, fontWeight: FontWeight.bold),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            const Icon(CupertinoIcons.calendar_today,
                                size: 12, color: CupertinoColors.systemGrey),
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
                                      : CupertinoColors.systemGrey,
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
                                    color: CupertinoColors.white,
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
                  const Icon(CupertinoIcons.location,
                      size: 16, color: CupertinoColors.systemGrey),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      location.toString(),
                      style: const TextStyle(fontSize: 13),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const Icon(CupertinoIcons.chevron_right,
                      size: 16, color: CupertinoColors.systemGrey3),
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
        style:
            TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: color),
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
// Read-only Cupertino Event Detail Sheet
// =====================================================
class _CupertinoEventDetailSheet extends StatelessWidget {
  final Map<String, dynamic> item;
  const _CupertinoEventDetailSheet({required this.item});

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

    return Container(
      height: MediaQuery.of(context).size.height * 0.8,
      decoration: const BoxDecoration(
        color: CupertinoColors.systemBackground,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
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
                  child: const Icon(CupertinoIcons.calendar,
                      color: primaryBlue, size: 26),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title.toString(),
                          style: const TextStyle(
                              fontSize: 19, fontWeight: FontWeight.bold)),
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
                color: CupertinoColors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: CupertinoColors.systemGrey5),
              ),
              child: Column(
                children: [
                  _row(CupertinoIcons.calendar, "Date & Time", formattedDate),
                  const SizedBox(height: 10),
                  _row(CupertinoIcons.location, "Venue", location.toString()),
                  if (venueLink.toString().isNotEmpty) ...[
                    const SizedBox(height: 10),
                    _row(CupertinoIcons.link, "Venue Link",
                        venueLink.toString()),
                  ],
                  if (organizer.toString().isNotEmpty) ...[
                    const SizedBox(height: 10),
                    _row(CupertinoIcons.building_2_fill, "Organizer",
                        organizer.toString()),
                  ],
                  if (chiefGuest.toString().isNotEmpty) ...[
                    const SizedBox(height: 10),
                    _row(CupertinoIcons.person, "Chief Guest",
                        chiefGuest.toString()),
                  ],
                  if (contactPhone.toString().isNotEmpty) ...[
                    const SizedBox(height: 10),
                    _row(CupertinoIcons.phone, "Contact",
                        contactPhone.toString()),
                  ],
                  if (expectedFootfall != null) ...[
                    const SizedBox(height: 10),
                    _row(CupertinoIcons.person_3, "Expected Footfall",
                        "$expectedFootfall people"),
                  ],
                  if (referencedBy.toString().isNotEmpty) ...[
                    const SizedBox(height: 10),
                    _row(CupertinoIcons.person_circle, "Referenced By",
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
                      color: CupertinoColors.systemGrey)),
              const SizedBox(height: 6),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: CupertinoColors.systemGrey6,
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
                      color: CupertinoColors.systemGrey)),
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
                    style: const TextStyle(
                        fontSize: 11, color: CupertinoColors.systemGrey)),
              ),
            ],
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _row(IconData icon, String label, String value) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: CupertinoColors.systemGrey),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label,
                  style: const TextStyle(
                      fontSize: 11, color: CupertinoColors.systemGrey)),
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
          style:
              TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: fg)),
    );
  }
}
