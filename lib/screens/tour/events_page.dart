import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/http_service.dart';
import '../../theme/app_theme.dart';

/// Admin Events page — list of all ACCEPTED tour programs with filters
/// (search, date range, report status). Tap a card to view full event +
/// post-event report (if submitted by staff).
class EventsPage extends StatefulWidget {
  final String role;
  const EventsPage({super.key, required this.role});

  @override
  State<EventsPage> createState() => _EventsPageState();
}

class _EventsPageState extends State<EventsPage> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _all = [];

  // View mode: "Today" (only today's events, no filter UI) or "All"
  String _viewMode = "Today";

  // Filter state (used only in "All" mode)
  final _searchController = TextEditingController();
  String _searchQuery = "";
  DateTime? _startDate;
  DateTime? _endDate;
  String _reportStatus = "All"; // All / Reported / Pending

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

  // Apply view-mode + report-status filters
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
      // Filter UI hidden in Today mode → no report-status filter applied.
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

  Future<void> _pickDate(bool isStart) async {
    final picked = await showDatePicker(
      context: context,
      initialDate:
          (isStart ? _startDate : _endDate) ?? DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null) {
      setState(() {
        if (isStart) {
          _startDate = picked;
        } else {
          _endDate = picked;
        }
      });
      _fetch();
    }
  }

  void _viewDetails(Map<String, dynamic> e) {
    showDialog(
      context: context,
      builder: (_) => _EventDetailsDialog(event: e),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isAllMode = _viewMode == "All";
    final hasFilters = _searchQuery.isNotEmpty ||
        _startDate != null ||
        _endDate != null ||
        _reportStatus != "All";

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        backgroundColor: AppTheme.primaryIndigo,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text("Events",
                style: TextStyle(
                    color: Colors.white, fontWeight: FontWeight.bold)),
            Text(
              isAllMode
                  ? "All accepted tour programs"
                  : "Today's accepted events",
              style: const TextStyle(color: Colors.white70, fontSize: 11),
            ),
          ],
        ),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          if (isAllMode)
            Stack(
              children: [
                IconButton(
                  icon: Icon(
                    _showFilters
                        ? Icons.filter_list_off
                        : Icons.filter_list,
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
            onPressed: _fetch,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _fetch,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
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
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_error != null)
              _buildError()
            else if (_filtered.isEmpty)
              _buildEmpty()
            else
              ..._filtered.map(_buildCard),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildViewModeToggle() {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.border),
      ),
      child: Row(
        children: [
          Expanded(child: _viewModeBtn("Today")),
          Expanded(child: _viewModeBtn("All")),
        ],
      ),
    );
  }

  Widget _viewModeBtn(String mode) {
    final selected = _viewMode == mode;
    return InkWell(
      onTap: selected
          ? null
          : () => setState(() {
                _viewMode = mode;
                if (mode == "Today") _showFilters = false;
              }),
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: selected ? AppTheme.primaryIndigo : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
        ),
        alignment: Alignment.center,
        child: Text(
          mode == "Today" ? "Today" : "All Events",
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: selected ? Colors.white : Colors.grey.shade700,
          ),
        ),
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
              hintText: "Search by name / organizer / venue...",
              prefixIcon:
                  const Icon(Icons.search, color: Colors.grey, size: 20),
              suffixIcon: _searchQuery.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear, size: 18),
                      onPressed: () {
                        _searchController.clear();
                        setState(() => _searchQuery = "");
                        _fetch();
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
          DropdownButtonFormField<String>(
            value: _reportStatus,
            isExpanded: true,
            decoration: InputDecoration(
              labelText: "Report status",
              filled: true,
              fillColor: Colors.grey.shade50,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide.none,
              ),
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            ),
            items: const [
              DropdownMenuItem(value: "All", child: Text("All events")),
              DropdownMenuItem(
                  value: "Reported", child: Text("Report submitted")),
              DropdownMenuItem(
                  value: "Pending", child: Text("Pending report")),
            ],
            onChanged: (v) =>
                setState(() => _reportStatus = v ?? "All"),
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

  Widget _datePickerBtn(
    String label,
    DateTime? date,
    VoidCallback onTap,
    VoidCallback onClear,
  ) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.grey.shade50,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: date != null
                ? AppTheme.primaryIndigo
                : Colors.grey.shade200,
          ),
        ),
        child: Row(
          children: [
            Icon(Icons.calendar_today,
                size: 14,
                color: date != null
                    ? AppTheme.primaryIndigo
                    : Colors.grey),
            const SizedBox(width: 6),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label,
                      style: TextStyle(
                          fontSize: 10, color: Colors.grey.shade600)),
                  Text(
                    date != null
                        ? DateFormat('dd MMM yyyy').format(date)
                        : "Select",
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color:
                          date != null ? Colors.black87 : Colors.grey,
                    ),
                  ),
                ],
              ),
            ),
            if (date != null)
              GestureDetector(
                onTap: onClear,
                child: const Icon(Icons.close,
                    size: 14, color: Colors.grey),
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

    return InkWell(
      onTap: () => _viewDetails(e),
      borderRadius: BorderRadius.circular(14),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
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
              child: const Icon(Icons.event, color: Color(0xFF7C3AED)),
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
                      style: TextStyle(
                          fontSize: 12, color: Colors.grey.shade700)),
                  const SizedBox(height: 2),
                  Text("$dateStr · $venue",
                      style: TextStyle(
                          fontSize: 12, color: Colors.grey.shade600),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                  Text("↳ tap to view full event",
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
        color: reported
            ? const Color(0xFFECFDF5)
            : const Color(0xFFFFFBEB),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            reported ? Icons.check_circle : Icons.access_time,
            size: 11,
            color: reported
                ? const Color(0xFF065F46)
                : const Color(0xFFB45309),
          ),
          const SizedBox(width: 4),
          Text(
            reported ? "Reported" : "Pending",
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: reported
                  ? const Color(0xFF065F46)
                  : const Color(0xFFB45309),
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
            Icon(Icons.error_outline,
                size: 48, color: Colors.grey.shade400),
            const SizedBox(height: 12),
            Text(_error!,
                style: TextStyle(color: Colors.grey.shade700)),
            const SizedBox(height: 12),
            ElevatedButton.icon(
              onPressed: _fetch,
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
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 60),
      child: Center(
        child: Column(
          children: [
            Icon(Icons.inbox_outlined,
                size: 56, color: Colors.grey.shade300),
            const SizedBox(height: 12),
            Text(
              _viewMode == "Today"
                  ? "No events scheduled for today"
                  : "No events match",
              style: TextStyle(
                  color: Colors.grey.shade600, fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }
}

// =====================================================
// EVENT DETAILS DIALOG (with report section)
// =====================================================
class _EventDetailsDialog extends StatelessWidget {
  final Map<String, dynamic> event;
  const _EventDetailsDialog({required this.event});

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

    return Dialog(
      insetPadding:
          const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      shape:
          RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 540, maxHeight: 700),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text("Event Details",
                        style: TextStyle(
                            fontSize: 18, fontWeight: FontWeight.bold)),
                  ),
                  IconButton(
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    icon: const Icon(Icons.close),
                    color: Colors.grey.shade600,
                    onPressed: () => Navigator.pop(context),
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
                    style: TextStyle(
                        fontSize: 13, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                Text(e["description"].toString(),
                    style: const TextStyle(fontSize: 13)),
              ],
              const SizedBox(height: 18),
              const Divider(height: 1),
              const SizedBox(height: 14),
              const Text("Post-Event Report",
                  style: TextStyle(
                      fontSize: 14, fontWeight: FontWeight.bold)),
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
                      Icon(Icons.info_outline,
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
                _kv("Drive Link",
                    e["driveLink"]?.toString() ?? "—"),
                _kv("Media / Photos",
                    e["mediaLink"]?.toString() ?? "—"),
                _kv("Attendees",
                    e["attendeesCount"]?.toString() ?? "—"),
                if ((e["keynotes"] ?? "").toString().isNotEmpty) ...[
                  const SizedBox(height: 6),
                  const Text("Keynotes / Highlights",
                      style: TextStyle(
                          fontSize: 12, color: Colors.grey)),
                  const SizedBox(height: 2),
                  Text(e["keynotes"].toString(),
                      style: const TextStyle(fontSize: 13)),
                ],
                if ((e["outcomeSummary"] ?? "").toString().isNotEmpty) ...[
                  const SizedBox(height: 6),
                  const Text("Outcome Summary",
                      style: TextStyle(
                          fontSize: 12, color: Colors.grey)),
                  const SizedBox(height: 2),
                  Text(e["outcomeSummary"].toString(),
                      style: const TextStyle(fontSize: 13)),
                ],
              ],
              const SizedBox(height: 18),
              Divider(color: Colors.grey.shade200),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  OutlinedButton(
                    onPressed: () => Navigator.pop(context),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.grey.shade800,
                      side: BorderSide(color: Colors.grey.shade300),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8)),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 18, vertical: 10),
                    ),
                    child: const Text("Close"),
                  ),
                ],
              ),
            ],
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
                style: TextStyle(
                    fontSize: 12, color: Colors.grey.shade600)),
          ),
          Expanded(
            child: Text(value,
                style: const TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w500)),
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
          style: TextStyle(
              fontSize: 10, fontWeight: FontWeight.bold, color: fg)),
    );
  }
}
