import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/http_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/csv_export.dart';
import '../../widgets/date_range_filter.dart';

String? _validateOptionalUrl(String? v) {
  final t = v?.trim() ?? "";
  if (t.isEmpty) return null;
  final uri = Uri.tryParse(t);
  if (uri == null || !uri.isAbsolute ||
      (uri.scheme != 'http' && uri.scheme != 'https')) {
    return "Enter a valid http(s):// URL";
  }
  return null;
}

class EventReportsPage extends StatefulWidget {
  const EventReportsPage({super.key});

  @override
  State<EventReportsPage> createState() => _EventReportsPageState();
}

class _EventReportsPageState extends State<EventReportsPage> {
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _pending = [];
  DateTime? _dateFrom;
  DateTime? _dateTo;

  List<Map<String, dynamic>> get _visiblePending {
    if (_dateFrom == null && _dateTo == null) return _pending;
    return _pending.where((e) {
      final raw = (e['dateTime'] ?? e['createdAt'])?.toString();
      final dt = DateTime.tryParse(raw ?? '');
      return dateInRange(dt, from: _dateFrom, to: _dateTo);
    }).toList();
  }

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final res = await HttpService.get(
        "/api/tour-programs/events?isCompleted=false&limit=100",
      );

      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list =
            decoded is List ? decoded : (decoded["data"] ?? []);
        setState(() {
          _pending = list
              .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
              .toList();
          _loading = false;
        });
      } else {
        setState(() {
          _error = "Failed to load (${res.statusCode})";
          _loading = false;
        });
      }
    } catch (_) {
      setState(() {
        _error = "Server error / No internet";
        _loading = false;
      });
    }
  }

  String _formatEventDateTime(String? iso) {
    if (iso == null) return "";
    try {
      return DateFormat('EEE, d MMM, yyyy \'at\' h:mm a')
          .format(DateTime.parse(iso));
    } catch (_) {
      return iso;
    }
  }

  void _exportCsv() {
    CsvExport.export(
      context,
      fileName: 'event_reports',
      headers: const ['Event', 'Organizer', 'Venue', 'Date', 'Report Status'],
      rows: _visiblePending.map((r) {
        return [
          r['eventName'] ?? '',
          r['organizer'] ?? '',
          r['venue'] ?? '',
          _formatEventDateTime(r['dateTime']?.toString()),
          'Pending',
        ];
      }).toList(),
    );
  }

  Future<void> _openReportSheet(Map<String, dynamic> event) async {
    final submitted = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _PostEventReportSheet(event: event),
    );

    if (submitted == true) {
      _fetch();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.saffronSoft.withOpacity(0.4),
      appBar: AppBar(
        backgroundColor: AppTheme.saffronDark,
        title: const Text(
          "Event Reports",
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          IconButton(
            tooltip: "Export CSV",
            icon: const Icon(Icons.download, color: Colors.white),
            onPressed: _visiblePending.isEmpty ? null : _exportCsv,
          ),
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white),
            onPressed: _fetch,
            tooltip: "Refresh",
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _fetch,
        color: AppTheme.saffronDark,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          children: [
            _headerCard(),
            const SizedBox(height: 12),
            Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
                boxShadow: AppTheme.shadowSm,
              ),
              child: DateRangeFilter(
                from: _dateFrom,
                to: _dateTo,
                tint: AppTheme.saffronDark,
                onFromChanged: (d) => setState(() => _dateFrom = d),
                onToChanged: (d) => setState(() => _dateTo = d),
                onClear: () => setState(() {
                  _dateFrom = null;
                  _dateTo = null;
                }),
              ),
            ),
            const SizedBox(height: 12),
            _pendingSection(),
          ],
        ),
      ),
    );
  }

  Widget _headerCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: AppTheme.shadowSm,
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            "Event Reports",
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: AppTheme.primaryIndigoDark,
            ),
          ),
          SizedBox(height: 4),
          Text(
            "Submit post-event reports for completed tour programs",
            style: TextStyle(fontSize: 13, color: AppTheme.muted),
          ),
        ],
      ),
    );
  }

  Widget _pendingSection() {
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 60),
        child: Center(child: CircularProgressIndicator()),
      );
    }

    if (_error != null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 40),
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
                  backgroundColor: AppTheme.saffronDark,
                  foregroundColor: Colors.white,
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: AppTheme.shadowSm,
        border: Border.all(color: AppTheme.saffron.withOpacity(0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.access_time, size: 18, color: AppTheme.saffronDark),
              const SizedBox(width: 8),
              Text(
                "Pending Reports (${_visiblePending.length})",
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.saffronDark,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (_visiblePending.isEmpty)
            _emptyState()
          else
            ..._visiblePending.map(_eventCard),
        ],
      ),
    );
  }

  Widget _emptyState() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 32),
      child: Column(
        children: [
          Icon(Icons.celebration,
              size: 56, color: AppTheme.successGreen.withOpacity(0.7)),
          const SizedBox(height: 12),
          const Text(
            "All caught up!",
            style: TextStyle(
                fontSize: 16, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 4),
          Text(
            "No pending event reports right now.",
            style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
          ),
        ],
      ),
    );
  }

  Widget _eventCard(Map<String, dynamic> event) {
    final eventName = event["eventName"] ?? "-";
    final organizer = event["organizer"] ?? "-";
    final venue = event["venue"] ?? "-";
    final dateTime = _formatEventDateTime(event["dateTime"]?.toString());

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.saffronSoft,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.saffron.withOpacity(0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(10),
                  border:
                      Border.all(color: AppTheme.saffron.withOpacity(0.4)),
                ),
                child: Icon(Icons.event_note,
                    color: AppTheme.saffronDark, size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  eventName,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.primaryIndigoDark,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          _metaLine(Icons.person_outline, organizer),
          const SizedBox(height: 4),
          _metaLine(Icons.access_time, dateTime),
          const SizedBox(height: 4),
          _metaLine(Icons.location_on_outlined, venue),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () => _openReportSheet(event),
              icon: const Icon(Icons.description, size: 16),
              label: const Text("Submit Report"),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.saffronDark,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
                textStyle: const TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w600),
                elevation: 0,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _metaLine(IconData icon, String text) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 2),
          child: Icon(icon, size: 13, color: Colors.grey.shade700),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            text,
            style: TextStyle(fontSize: 12, color: Colors.grey.shade800),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}

// =====================================================
// Post-Event Report Bottom Sheet
// =====================================================
class _PostEventReportSheet extends StatefulWidget {
  final Map<String, dynamic> event;
  const _PostEventReportSheet({required this.event});

  @override
  State<_PostEventReportSheet> createState() => _PostEventReportSheetState();
}

class _PostEventReportSheetState extends State<_PostEventReportSheet> {
  final _formKey = GlobalKey<FormState>();
  final driveLinkController = TextEditingController();
  final mediaLinkController = TextEditingController();
  final attendeesController = TextEditingController();
  final keynotesController = TextEditingController();
  final outcomeController = TextEditingController();

  bool _submitting = false;

  @override
  void dispose() {
    driveLinkController.dispose();
    mediaLinkController.dispose();
    attendeesController.dispose();
    keynotesController.dispose();
    outcomeController.dispose();
    super.dispose();
  }

  String _formatEventDate(String? iso) {
    if (iso == null) return "";
    try {
      return DateFormat('EEE, d MMM, yyyy').format(DateTime.parse(iso));
    } catch (_) {
      return iso;
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _submitting = true);

    try {
      final id = widget.event["id"]?.toString() ?? "";
      if (id.isEmpty) {
        throw Exception("Missing event id");
      }

      final body = <String, dynamic>{};
      final drive = driveLinkController.text.trim();
      if (drive.isNotEmpty) body["driveLink"] = drive;
      final media = mediaLinkController.text.trim();
      if (media.isNotEmpty) body["mediaLink"] = media;
      final attendees = attendeesController.text.trim();
      if (attendees.isNotEmpty) {
        final parsed = int.tryParse(attendees);
        if (parsed != null) body["attendeesCount"] = parsed;
      }
      final keynotes = keynotesController.text.trim();
      if (keynotes.isNotEmpty) body["keynotes"] = keynotes;
      final outcome = outcomeController.text.trim();
      if (outcome.isNotEmpty) body["outcomeSummary"] = outcome;

      final res = await HttpService.patch(
        "/api/tour-programs/$id/complete",
        body,
      );

      if (!mounted) return;

      if (res.statusCode == 200 || res.statusCode == 201) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Report submitted successfully"),
            backgroundColor: AppTheme.successGreen,
          ),
        );
        Navigator.pop(context, true);
      } else {
        String msg = "Failed (${res.statusCode})";
        try {
          final data = jsonDecode(res.body);
          msg = data["message"] ?? msg;
        } catch (_) {}
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg)),
        );
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server error / No internet")),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final eventName = widget.event["eventName"] ?? "-";
    final eventDate = _formatEventDate(widget.event["dateTime"]?.toString());
    final viewInsetsBottom = MediaQuery.of(context).viewInsets.bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: viewInsetsBottom),
      child: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Drag handle
                    Center(
                      child: Container(
                        width: 36,
                        height: 4,
                        margin: const EdgeInsets.only(bottom: 16),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade300,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(Icons.description,
                            color: AppTheme.saffronDark, size: 22),
                        const SizedBox(width: 8),
                        const Expanded(
                          child: Text(
                            "Post-Event Report",
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                              color: AppTheme.primaryIndigoDark,
                            ),
                          ),
                        ),
                        IconButton(
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(),
                          onPressed: _submitting
                              ? null
                              : () => Navigator.pop(context),
                          icon: const Icon(Icons.close),
                          color: Colors.grey.shade600,
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Padding(
                      padding: const EdgeInsets.only(left: 30),
                      child: Text(
                        "$eventName${eventDate.isNotEmpty ? ' — $eventDate' : ''}",
                        style: TextStyle(
                          fontSize: 13,
                          color: Colors.grey.shade600,
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),
                    _label("Drive Link (Documents / Files)"),
                    const SizedBox(height: 6),
                    _input(
                      controller: driveLinkController,
                      hint: "https://drive.google.com/...",
                      keyboardType: TextInputType.url,
                      validator: _validateOptionalUrl,
                    ),
                    const SizedBox(height: 14),
                    _label("Media / Photos Link"),
                    const SizedBox(height: 6),
                    _input(
                      controller: mediaLinkController,
                      hint: "https://photos.google.com/... or Drive link",
                      keyboardType: TextInputType.url,
                      validator: _validateOptionalUrl,
                    ),
                    const SizedBox(height: 14),
                    _label("Number of Attendees"),
                    const SizedBox(height: 6),
                    _input(
                      controller: attendeesController,
                      hint: "e.g. 150",
                      keyboardType: TextInputType.number,
                      validator: (v) {
                        final t = v?.trim() ?? "";
                        if (t.isEmpty) return null;
                        final parsed = int.tryParse(t);
                        if (parsed == null || parsed < 0) {
                          return "Enter a valid positive number";
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 14),
                    _label("Keynotes / Highlights"),
                    const SizedBox(height: 6),
                    _input(
                      controller: keynotesController,
                      hint:
                          "Key points discussed, decisions made, important highlights...",
                      maxLines: 3,
                    ),
                    const SizedBox(height: 14),
                    _label("Outcome Summary"),
                    const SizedBox(height: 6),
                    _input(
                      controller: outcomeController,
                      hint: "Overall outcome and result of the event...",
                      maxLines: 3,
                    ),
                    const SizedBox(height: 20),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: _submitting
                                ? null
                                : () => Navigator.pop(context),
                            style: OutlinedButton.styleFrom(
                              padding:
                                  const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(10)),
                              side: BorderSide(color: Colors.grey.shade300),
                              foregroundColor: Colors.grey.shade800,
                            ),
                            child: const Text(
                              "Cancel",
                              style: TextStyle(fontWeight: FontWeight.w600),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: _submitting ? null : _submit,
                            icon: _submitting
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      valueColor: AlwaysStoppedAnimation(
                                          Colors.white),
                                    ),
                                  )
                                : const Icon(Icons.check_circle, size: 18),
                            label: Text(
                                _submitting ? "Submitting..." : "Submit Report"),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppTheme.saffronDark,
                              foregroundColor: Colors.white,
                              padding:
                                  const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(10)),
                              elevation: 0,
                              textStyle: const TextStyle(
                                  fontSize: 14, fontWeight: FontWeight.bold),
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
      ),
    );
  }

  Widget _label(String text) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: AppTheme.foreground,
      ),
    );
  }

  Widget _input({
    required TextEditingController controller,
    required String hint,
    int maxLines = 1,
    TextInputType? keyboardType,
    String? Function(String?)? validator,
  }) {
    return TextFormField(
      controller: controller,
      maxLines: maxLines,
      keyboardType: keyboardType,
      validator: validator,
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(color: Colors.grey.shade500, fontSize: 13),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: Colors.grey.shade300),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: Colors.grey.shade300),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide:
              const BorderSide(color: AppTheme.saffronDark, width: 1.5),
        ),
      ),
    );
  }
}
