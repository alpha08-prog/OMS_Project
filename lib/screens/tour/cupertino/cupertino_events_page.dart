import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';

import '../../../services/http_service.dart';
import '../../../theme/app_theme.dart';
import '../../../utils/csv_export.dart';
import '../../../widgets/cupertino/cupertino_form_helpers.dart';
import '../../../widgets/cupertino/cupertino_page_header.dart';

class CupertinoEventsPage extends StatefulWidget {
  final String role;
  const CupertinoEventsPage({super.key, required this.role});

  @override
  State<CupertinoEventsPage> createState() => _CupertinoEventsPageState();
}

class _CupertinoEventsPageState extends State<CupertinoEventsPage> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _all = [];

  // View mode: "Today" (only today's events, no filter UI) or "All"
  String _viewMode = "Today";

  final _searchController = TextEditingController();
  String _searchQuery = "";
  DateTime? _startDate;
  DateTime? _endDate;
  String _reportStatus = "All";

  bool _showFilters = false;

  static bool _isSameLocalDay(DateTime a, DateTime b) {
    final la = a.toLocal();
    final lb = b.toLocal();
    return la.year == lb.year && la.month == lb.month && la.day == lb.day;
  }

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _fetch() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final params = <String, String>{
        "decision": "ACCEPTED",
        "limit": "200",
      };
      if (_searchQuery.isNotEmpty) params["search"] = _searchQuery;
      if (_startDate != null) {
        params["startDate"] = _startDate!.toIso8601String();
      }
      if (_endDate != null) {
        params["endDate"] =
            _endDate!.add(const Duration(days: 1)).toIso8601String();
      }
      final qs = params.entries
          .map((e) => "${e.key}=${Uri.encodeComponent(e.value)}")
          .join("&");
      final res = await HttpService.get("/api/tour-programs?$qs");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list = decoded is List ? decoded : (decoded["data"] ?? []);
        if (mounted) {
          setState(() {
            _all = list
                .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
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

  List<Map<String, dynamic>> get _filtered {
    Iterable<Map<String, dynamic>> list = _all;

    if (_viewMode == "Today") {
      final now = DateTime.now();
      list = list.where((e) {
        final raw = e["dateTime"]?.toString();
        if (raw == null || raw.isEmpty) return false;
        try {
          return _isSameLocalDay(DateTime.parse(raw), now);
        } catch (_) {
          return false;
        }
      });
      return list.toList();
    }

    if (_reportStatus != "All") {
      list = list.where((e) {
        final reported = e["isCompleted"] == true;
        return _reportStatus == "Reported" ? reported : !reported;
      });
    }
    return list.toList();
  }

  void _clearFilters() {
    setState(() {
      _searchController.clear();
      _searchQuery = "";
      _startDate = null;
      _endDate = null;
      _reportStatus = "All";
    });
    _fetch();
  }

  void _pickDate(bool isStart) {
    CupertinoFormHelpers.showDatePicker(
      context: context,
      initialDate: (isStart ? _startDate : _endDate) ?? DateTime.now(),
      minimumDate: DateTime(2020),
      maximumDate: DateTime.now().add(const Duration(days: 365)),
      onDateSelected: (d) {
        setState(() {
          if (isStart) {
            _startDate = d;
          } else {
            _endDate = d;
          }
        });
        _fetch();
      },
    );
  }

  void _viewDetails(Map<String, dynamic> e) {
    showCupertinoModalPopup(
      context: context,
      builder: (_) => _CupertinoEventDetailsSheet(event: e),
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
        'Date',
        'Report',
        'Created'
      ],
      rows: _filtered.map((e) {
        String eventDate = '';
        try {
          eventDate = DateFormat('dd MMM yyyy')
              .format(DateTime.parse(e['dateTime'].toString()));
        } catch (_) {}
        String created = '';
        try {
          created = DateFormat('dd MMM yyyy')
              .format(DateTime.parse(e['createdAt'].toString()));
        } catch (_) {}
        return [
          e['eventName'] ?? '',
          e['organizer'] ?? '',
          e['venue'] ?? '',
          eventDate,
          (e['isCompleted'] == true) ? 'Reported' : 'Pending',
          created,
        ];
      }).toList(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isAllMode = _viewMode == "All";
    final hasFilters = _searchQuery.isNotEmpty ||
        _startDate != null ||
        _endDate != null ||
        _reportStatus != "All";

    return CupertinoPageScaffold(
      backgroundColor: AppTheme.background,
      child: Column(
        children: [
          OmsPageHeader(
            title: "Events",
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (isAllMode) ...[
                  GestureDetector(
                    onTap: () => setState(() => _showFilters = !_showFilters),
                    child: Stack(
                      children: [
                        Icon(
                          _showFilters
                              ? CupertinoIcons
                                  .line_horizontal_3_decrease_circle_fill
                              : CupertinoIcons
                                  .line_horizontal_3_decrease_circle,
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
                ],
                CupertinoButton(
                  padding: EdgeInsets.zero,
                  onPressed: _filtered.isEmpty ? null : _exportCsv,
                  child: const Icon(CupertinoIcons.arrow_down_doc,
                      color: CupertinoColors.white, size: 22),
                ),
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: _fetch,
                  child: const Icon(CupertinoIcons.refresh,
                      color: CupertinoColors.white, size: 22),
                ),
              ],
            ),
          ),
          Expanded(
            child: CustomScrollView(
              slivers: [
                CupertinoSliverRefreshControl(onRefresh: _fetch),
                SliverPadding(
                  padding: const EdgeInsets.all(16),
                  sliver: SliverList(
                    delegate: SliverChildListDelegate([
                      _buildViewModeToggle(),
                      const SizedBox(height: 14),
                      if (isAllMode && _showFilters) ...[
                        _buildFilters(hasFilters),
                        const SizedBox(height: 12),
                      ],
                      Text(
                        isAllMode
                            ? "All Events (${_filtered.length})"
                            : "Today's Events (${_filtered.length})",
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.foreground,
                        ),
                      ),
                      const SizedBox(height: 12),
                      if (_loading)
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 60),
                          child: Center(child: CupertinoActivityIndicator()),
                        )
                      else if (_error != null)
                        _buildError()
                      else if (_filtered.isEmpty)
                        _buildEmpty()
                      else
                        ..._filtered.map(_buildCard),
                      const SizedBox(height: 24),
                    ]),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildViewModeToggle() {
    return SizedBox(
      width: double.infinity,
      child: CupertinoSlidingSegmentedControl<String>(
        groupValue: _viewMode,
        backgroundColor: CupertinoColors.systemGrey6,
        thumbColor: AppTheme.primaryIndigo,
        padding: const EdgeInsets.all(4),
        children: {
          "Today": Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Text(
              "Today",
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: _viewMode == "Today"
                    ? CupertinoColors.white
                    : CupertinoColors.label,
              ),
            ),
          ),
          "All": Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Text(
              "All Events",
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: _viewMode == "All"
                    ? CupertinoColors.white
                    : CupertinoColors.label,
              ),
            ),
          ),
        },
        onValueChanged: (v) {
          if (v == null || v == _viewMode) return;
          setState(() {
            _viewMode = v;
            if (v == "Today") _showFilters = false;
          });
        },
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
            placeholder: "Search by name / organizer / venue...",
            prefix: const Padding(
              padding: EdgeInsets.only(left: 12),
              child: Icon(CupertinoIcons.search,
                  color: CupertinoColors.systemGrey, size: 18),
            ),
            suffix: _searchQuery.isNotEmpty
                ? GestureDetector(
                    onTap: () {
                      _searchController.clear();
                      setState(() => _searchQuery = "");
                      _fetch();
                    },
                    child: const Padding(
                      padding: EdgeInsets.only(right: 8),
                      child: Icon(CupertinoIcons.clear_circled_solid,
                          size: 18, color: CupertinoColors.systemGrey),
                    ),
                  )
                : null,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: BoxDecoration(
              color: CupertinoColors.systemGrey6,
              borderRadius: BorderRadius.circular(10),
            ),
            onSubmitted: (v) {
              setState(() => _searchQuery = v.trim());
              _fetch();
            },
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _datePickerBtn(
                  "Start Date",
                  _startDate,
                  () => _pickDate(true),
                  () {
                    setState(() => _startDate = null);
                    _fetch();
                  },
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _datePickerBtn(
                  "End Date",
                  _endDate,
                  () => _pickDate(false),
                  () {
                    setState(() => _endDate = null);
                    _fetch();
                  },
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          GestureDetector(
            onTap: () {
              CupertinoFormHelpers.showPicker(
                context: context,
                items: const [
                  "All events",
                  "Report submitted",
                  "Pending report"
                ],
                currentValue: _reportStatus == "All"
                    ? "All events"
                    : (_reportStatus == "Reported"
                        ? "Report submitted"
                        : "Pending report"),
                title: "Report status",
                onSelected: (label) {
                  setState(() {
                    _reportStatus = switch (label) {
                      "Report submitted" => "Reported",
                      "Pending report" => "Pending",
                      _ => "All",
                    };
                  });
                },
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
                        const Text("Report status",
                            style: TextStyle(
                                fontSize: 10,
                                color: CupertinoColors.systemGrey)),
                        const SizedBox(height: 2),
                        Text(
                          _reportStatus == "All"
                              ? "All events"
                              : (_reportStatus == "Reported"
                                  ? "Report submitted"
                                  : "Pending report"),
                          style: const TextStyle(fontSize: 13),
                        ),
                      ],
                    ),
                  ),
                  const Icon(CupertinoIcons.chevron_down,
                      size: 14, color: CupertinoColors.systemGrey),
                ],
              ),
            ),
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
                      style: TextStyle(color: CupertinoColors.destructiveRed)),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _datePickerBtn(
    String label,
    DateTime? date,
    VoidCallback onTap,
    VoidCallback onClear,
  ) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        decoration: BoxDecoration(
          color: CupertinoColors.systemGrey6,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: date != null
                ? AppTheme.primaryIndigo
                : CupertinoColors.systemGrey4,
          ),
        ),
        child: Row(
          children: [
            Icon(CupertinoIcons.calendar,
                size: 14,
                color: date != null
                    ? AppTheme.primaryIndigo
                    : CupertinoColors.systemGrey),
            const SizedBox(width: 6),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label,
                      style: const TextStyle(
                          fontSize: 10, color: CupertinoColors.systemGrey)),
                  Text(
                    date != null
                        ? DateFormat('dd MMM yyyy').format(date)
                        : "Select",
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: date != null
                          ? CupertinoColors.black
                          : CupertinoColors.systemGrey,
                    ),
                  ),
                ],
              ),
            ),
            if (date != null)
              GestureDetector(
                onTap: onClear,
                child: const Icon(CupertinoIcons.clear_circled_solid,
                    size: 14, color: CupertinoColors.systemGrey),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildCard(Map<String, dynamic> e) {
    final eventName = e["eventName"] ?? "—";
    final organizer = e["organizer"] ?? "—";
    final venue = e["venue"] ?? "—";
    final date = e["dateTime"]?.toString();
    final isReported = e["isCompleted"] == true;

    String dateStr = "—";
    try {
      if (date != null) {
        dateStr = DateFormat('d MMM yyyy').format(DateTime.parse(date));
      }
    } catch (_) {}

    return GestureDetector(
      onTap: () => _viewDetails(e),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: CupertinoColors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppTheme.border),
          boxShadow: AppTheme.shadowSm,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: const Color(0xFFF5F3FF),
                borderRadius: BorderRadius.circular(10),
              ),
              child:
                  const Icon(CupertinoIcons.calendar, color: Color(0xFF7C3AED)),
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
                          eventName,
                          style: const TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.bold,
                              color: AppTheme.foreground),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 6),
                      _reportStatusPill(isReported),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(organizer,
                      style: const TextStyle(
                          fontSize: 12, color: CupertinoColors.systemGrey)),
                  const SizedBox(height: 2),
                  Text("$dateStr · $venue",
                      style: const TextStyle(
                          fontSize: 12, color: CupertinoColors.systemGrey),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                  const Text("↳ tap to view full event",
                      style: TextStyle(
                          fontSize: 11,
                          color: AppTheme.primaryIndigo,
                          fontStyle: FontStyle.italic)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _reportStatusPill(bool reported) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: reported ? const Color(0xFFECFDF5) : const Color(0xFFFFFBEB),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            reported ? CupertinoIcons.checkmark_circle : CupertinoIcons.clock,
            size: 11,
            color: reported ? const Color(0xFF065F46) : const Color(0xFFB45309),
          ),
          const SizedBox(width: 4),
          Text(
            reported ? "Reported" : "Pending",
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color:
                  reported ? const Color(0xFF065F46) : const Color(0xFFB45309),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildError() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 60),
      child: Center(
        child: Column(
          children: [
            const Icon(CupertinoIcons.exclamationmark_circle,
                size: 48, color: CupertinoColors.systemGrey3),
            const SizedBox(height: 12),
            Text(_error!,
                style: const TextStyle(color: CupertinoColors.systemGrey)),
            const SizedBox(height: 12),
            CupertinoButton.filled(
              onPressed: _fetch,
              child: const Text("Retry"),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmpty() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 60),
      child: Center(
        child: Column(
          children: [
            const Icon(CupertinoIcons.tray,
                size: 56, color: CupertinoColors.systemGrey4),
            const SizedBox(height: 12),
            Text(
              _viewMode == "Today"
                  ? "No events scheduled for today"
                  : "No events match",
              style: const TextStyle(
                  color: CupertinoColors.systemGrey, fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }
}

// =====================================================
// CUPERTINO EVENT DETAILS MODAL (with report)
// =====================================================
class _CupertinoEventDetailsSheet extends StatelessWidget {
  final Map<String, dynamic> event;
  const _CupertinoEventDetailsSheet({required this.event});

  String _fmt(dynamic v) {
    if (v == null) return "—";
    try {
      return DateFormat('d MMM yyyy, h:mm a')
          .format(DateTime.parse(v.toString()));
    } catch (_) {
      return "—";
    }
  }

  @override
  Widget build(BuildContext context) {
    final e = event;
    final isReported = e["isCompleted"] == true;

    return Container(
      decoration: const BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        top: false,
        child: ConstrainedBox(
          constraints: BoxConstraints(
              maxHeight: MediaQuery.of(context).size.height * 0.88),
          child: SingleChildScrollView(
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
                  children: [
                    const Expanded(
                      child: Text("Event Details",
                          style: TextStyle(
                              fontSize: 18, fontWeight: FontWeight.bold)),
                    ),
                    CupertinoButton(
                      padding: EdgeInsets.zero,
                      minSize: 0,
                      onPressed: () => Navigator.pop(context),
                      child: const Icon(CupertinoIcons.xmark,
                          size: 20, color: CupertinoColors.systemGrey),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  children: [
                    _pill("ACCEPTED", const Color(0xFFECFDF5),
                        const Color(0xFF065F46)),
                    if (isReported)
                      _pill("REPORT SUBMITTED", const Color(0xFFE0F2FE),
                          const Color(0xFF0369A1))
                    else
                      _pill("PENDING REPORT", const Color(0xFFFFFBEB),
                          const Color(0xFFB45309)),
                  ],
                ),
                const SizedBox(height: 12),
                Text(e["eventName"]?.toString() ?? "—",
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.bold)),
                const SizedBox(height: 12),
                _kv("Organizer", e["organizer"]?.toString() ?? "—"),
                _kv("Date / Time", _fmt(e["dateTime"])),
                _kv("Venue", e["venue"]?.toString() ?? "—"),
                if ((e["venueLink"] ?? "").toString().isNotEmpty)
                  _kv("Venue Link", e["venueLink"].toString()),
                if ((e["chiefGuest"] ?? "").toString().isNotEmpty)
                  _kv("Chief Guest", e["chiefGuest"].toString()),
                if (e["expectedFootfall"] != null)
                  _kv("Expected Footfall", e["expectedFootfall"].toString()),
                if ((e["contactPhone"] ?? "").toString().isNotEmpty)
                  _kv("Contact Phone", e["contactPhone"].toString()),
                if ((e["organizerPhone"] ?? "").toString().isNotEmpty)
                  _kv("Organizer Phone", e["organizerPhone"].toString()),
                if ((e["organizerEmail"] ?? "").toString().isNotEmpty)
                  _kv("Organizer Email", e["organizerEmail"].toString()),
                if ((e["description"] ?? "").toString().isNotEmpty) ...[
                  const SizedBox(height: 8),
                  const Text("Description",
                      style:
                          TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  Text(e["description"].toString(),
                      style: const TextStyle(fontSize: 13)),
                ],
                const SizedBox(height: 18),
                Container(height: 0.5, color: CupertinoColors.systemGrey4),
                const SizedBox(height: 14),
                const Text("Post-Event Report",
                    style:
                        TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                if (!isReported)
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFFBEB),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: const Color(0xFFFEF3C7)),
                    ),
                    child: const Row(
                      children: [
                        Icon(CupertinoIcons.info,
                            size: 16, color: Color(0xFFB45309)),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            "Report not submitted yet by the assigned staff.",
                            style: TextStyle(
                                fontSize: 12, color: Color(0xFFB45309)),
                          ),
                        ),
                      ],
                    ),
                  )
                else ...[
                  if (e["completedAt"] != null)
                    _kv("Submitted At", _fmt(e["completedAt"])),
                  _kv("Drive Link", e["driveLink"]?.toString() ?? "—"),
                  _kv("Media / Photos", e["mediaLink"]?.toString() ?? "—"),
                  _kv("Attendees", e["attendeesCount"]?.toString() ?? "—"),
                  if ((e["keynotes"] ?? "").toString().isNotEmpty) ...[
                    const SizedBox(height: 6),
                    const Text("Keynotes / Highlights",
                        style: TextStyle(
                            fontSize: 12, color: CupertinoColors.systemGrey)),
                    const SizedBox(height: 2),
                    Text(e["keynotes"].toString(),
                        style: const TextStyle(fontSize: 13)),
                  ],
                  if ((e["outcomeSummary"] ?? "").toString().isNotEmpty) ...[
                    const SizedBox(height: 6),
                    const Text("Outcome Summary",
                        style: TextStyle(
                            fontSize: 12, color: CupertinoColors.systemGrey)),
                    const SizedBox(height: 2),
                    Text(e["outcomeSummary"].toString(),
                        style: const TextStyle(fontSize: 13)),
                  ],
                ],
                const SizedBox(height: 18),
                Container(height: 0.5, color: CupertinoColors.systemGrey4),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    CupertinoButton(
                      color: CupertinoColors.systemGrey6,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 18, vertical: 10),
                      borderRadius: BorderRadius.circular(8),
                      onPressed: () => Navigator.pop(context),
                      child: const Text("Close",
                          style: TextStyle(
                              color: CupertinoColors.black,
                              fontWeight: FontWeight.w600)),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _kv(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 130,
            child: Text(label,
                style: const TextStyle(
                    fontSize: 12, color: CupertinoColors.systemGrey)),
          ),
          Expanded(
            child: Text(value,
                style:
                    const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
          ),
        ],
      ),
    );
  }

  Widget _pill(String text, Color bg, Color fg) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
      child: Text(text,
          style:
              TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: fg)),
    );
  }
}
