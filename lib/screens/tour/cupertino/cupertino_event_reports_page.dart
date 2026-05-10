import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';

import '../../../services/http_service.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../widgets/cupertino/cupertino_date_range_filter.dart';
import '../../../widgets/cupertino/cupertino_page_header.dart';
import '../../../widgets/date_range_filter.dart' show dateInRange;

class CupertinoEventReportsPage extends StatefulWidget {
  const CupertinoEventReportsPage({super.key});

  @override
  State<CupertinoEventReportsPage> createState() =>
      _CupertinoEventReportsPageState();
}

class _CupertinoEventReportsPageState extends State<CupertinoEventReportsPage> {
  bool _loading = true;
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
  String? _error;
  List<Map<String, dynamic>> _pending = [];

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

  Future<void> _openReportSheet(Map<String, dynamic> event) async {
    final submitted = await showCupertinoModalPopup<bool>(
      context: context,
      builder: (ctx) => _CupertinoPostEventReportSheet(event: event),
    );
    if (submitted == true) {
      _fetch();
    }
  }

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      backgroundColor: AppTheme.saffronSoft.withOpacity(0.4),
      child: Column(
        children: [
          OmsPageHeader(
            title: "Event Reports",
            trailing: GestureDetector(
              onTap: _fetch,
              child: const Icon(CupertinoIcons.refresh,
                  color: CupertinoColors.white, size: 22),
            ),
          ),
          Expanded(
            child: CustomScrollView(
              slivers: [
                CupertinoSliverRefreshControl(onRefresh: _fetch),
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                  sliver: SliverList(
                    delegate: SliverChildListDelegate([
                      _headerCard(),
                      const SizedBox(height: 12),
                      Container(
                        decoration: BoxDecoration(
                          color: CupertinoColors.white,
                          borderRadius: BorderRadius.circular(14),
                          boxShadow: AppTheme.shadowSm,
                        ),
                        child: CupertinoDateRangeFilter(
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

  Widget _headerCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: CupertinoColors.white,
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
        child: Center(child: CupertinoActivityIndicator()),
      );
    }

    if (_error != null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 40),
        child: Center(
          child: Column(
            children: [
              const Icon(CupertinoIcons.exclamationmark_circle,
                  size: 48, color: CupertinoColors.systemGrey3),
              const SizedBox(height: 12),
              Text(_error!,
                  style:
                      const TextStyle(color: CupertinoColors.systemGrey)),
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

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
      decoration: BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: AppTheme.shadowSm,
        border: Border.all(color: AppTheme.saffron.withOpacity(0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(CupertinoIcons.clock,
                  size: 18, color: AppTheme.saffronDark),
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
          Icon(CupertinoIcons.checkmark_seal,
              size: 56, color: AppTheme.successGreen.withOpacity(0.7)),
          const SizedBox(height: 12),
          const Text(
            "All caught up!",
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 4),
          const Text(
            "No pending event reports right now.",
            style: TextStyle(
                color: CupertinoColors.systemGrey, fontSize: 13),
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
                  color: CupertinoColors.white,
                  borderRadius: BorderRadius.circular(10),
                  border:
                      Border.all(color: AppTheme.saffron.withOpacity(0.4)),
                ),
                child: const Icon(CupertinoIcons.calendar,
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
          _metaLine(CupertinoIcons.person, organizer),
          const SizedBox(height: 4),
          _metaLine(CupertinoIcons.clock, dateTime),
          const SizedBox(height: 4),
          _metaLine(CupertinoIcons.location, venue),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: CupertinoButton(
              padding: const EdgeInsets.symmetric(vertical: 12),
              color: AppTheme.saffronDark,
              borderRadius: BorderRadius.circular(10),
              onPressed: () => _openReportSheet(event),
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(CupertinoIcons.doc_text,
                      size: 16, color: CupertinoColors.white),
                  SizedBox(width: 6),
                  Text(
                    "Submit Report",
                    style: TextStyle(
                      color: CupertinoColors.white,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
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
          child: Icon(icon, size: 13, color: CupertinoColors.systemGrey),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(
                fontSize: 12, color: CupertinoColors.systemGrey),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}

// =====================================================
// Cupertino Post-Event Report Modal
// =====================================================
class _CupertinoPostEventReportSheet extends StatefulWidget {
  final Map<String, dynamic> event;
  const _CupertinoPostEventReportSheet({required this.event});

  @override
  State<_CupertinoPostEventReportSheet> createState() =>
      _CupertinoPostEventReportSheetState();
}

class _CupertinoPostEventReportSheetState
    extends State<_CupertinoPostEventReportSheet> {
  final driveLinkController = TextEditingController();
  final mediaLinkController = TextEditingController();
  final attendeesController = TextEditingController();
  final keynotesController = TextEditingController();
  final outcomeController = TextEditingController();

  bool _submitting = false;
  String? _attendeesError;

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

  bool _validate() {
    final attendees = attendeesController.text.trim();
    if (attendees.isNotEmpty) {
      final parsed = int.tryParse(attendees);
      if (parsed == null || parsed < 0) {
        setState(() => _attendeesError = "Enter a valid positive number");
        return false;
      }
    }
    setState(() => _attendeesError = null);
    return true;
  }

  Future<void> _submit() async {
    if (!_validate()) return;
    setState(() => _submitting = true);

    try {
      final id = widget.event["id"]?.toString() ?? "";
      if (id.isEmpty) throw Exception("Missing event id");

      bool isValidUrl(String s) {
        final uri = Uri.tryParse(s);
        return uri != null && uri.isAbsolute &&
            (uri.scheme == 'http' || uri.scheme == 'https');
      }

      final body = <String, dynamic>{};
      final drive = driveLinkController.text.trim();
      if (drive.isNotEmpty) {
        if (!isValidUrl(drive)) {
          CupertinoToast.show(
              context, "Drive link must start with http:// or https://",
              isError: true);
          if (mounted) setState(() => _submitting = false);
          return;
        }
        body["driveLink"] = drive;
      }
      final media = mediaLinkController.text.trim();
      if (media.isNotEmpty) {
        if (!isValidUrl(media)) {
          CupertinoToast.show(
              context, "Media link must start with http:// or https://",
              isError: true);
          if (mounted) setState(() => _submitting = false);
          return;
        }
        body["mediaLink"] = media;
      }
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
        CupertinoToast.show(context, "Report submitted successfully");
        Navigator.pop(context, true);
      } else {
        String msg = "Failed (${res.statusCode})";
        try {
          final data = jsonDecode(res.body);
          msg = data["message"] ?? msg;
        } catch (_) {}
        CupertinoToast.show(context, msg, isError: true);
      }
    } catch (_) {
      if (!mounted) return;
      CupertinoToast.show(context, "Server error / No internet",
          isError: true);
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
          color: CupertinoColors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: SafeArea(
          top: false,
          child: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Center(
                    child: Container(
                      width: 36,
                      height: 4,
                      margin: const EdgeInsets.only(bottom: 16),
                      decoration: BoxDecoration(
                        color: CupertinoColors.systemGrey4,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(CupertinoIcons.doc_text,
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
                      CupertinoButton(
                        padding: EdgeInsets.zero,
                        minSize: 0,
                        onPressed: _submitting
                            ? null
                            : () => Navigator.pop(context),
                        child: const Icon(CupertinoIcons.xmark,
                            size: 20, color: CupertinoColors.systemGrey),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Padding(
                    padding: const EdgeInsets.only(left: 30),
                    child: Text(
                      "$eventName${eventDate.isNotEmpty ? ' — $eventDate' : ''}",
                      style: const TextStyle(
                        fontSize: 13,
                        color: CupertinoColors.systemGrey,
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  _label("Drive Link (Documents / Files)"),
                  const SizedBox(height: 6),
                  _input(
                    controller: driveLinkController,
                    placeholder: "https://drive.google.com/...",
                    keyboardType: TextInputType.url,
                  ),
                  const SizedBox(height: 14),
                  _label("Media / Photos Link"),
                  const SizedBox(height: 6),
                  _input(
                    controller: mediaLinkController,
                    placeholder:
                        "https://photos.google.com/... or Drive link",
                    keyboardType: TextInputType.url,
                  ),
                  const SizedBox(height: 14),
                  _label("Number of Attendees"),
                  const SizedBox(height: 6),
                  _input(
                    controller: attendeesController,
                    placeholder: "e.g. 150",
                    keyboardType: TextInputType.number,
                    error: _attendeesError,
                  ),
                  const SizedBox(height: 14),
                  _label("Keynotes / Highlights"),
                  const SizedBox(height: 6),
                  _input(
                    controller: keynotesController,
                    placeholder:
                        "Key points discussed, decisions made, important highlights...",
                    maxLines: 3,
                  ),
                  const SizedBox(height: 14),
                  _label("Outcome Summary"),
                  const SizedBox(height: 6),
                  _input(
                    controller: outcomeController,
                    placeholder:
                        "Overall outcome and result of the event...",
                    maxLines: 3,
                  ),
                  const SizedBox(height: 20),
                  Row(
                    children: [
                      Expanded(
                        child: CupertinoButton(
                          color: CupertinoColors.systemGrey6,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          borderRadius: BorderRadius.circular(10),
                          onPressed: _submitting
                              ? null
                              : () => Navigator.pop(context),
                          child: const Text(
                            "Cancel",
                            style: TextStyle(
                              fontWeight: FontWeight.w600,
                              color: CupertinoColors.black,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: CupertinoButton(
                          color: AppTheme.saffronDark,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          borderRadius: BorderRadius.circular(10),
                          onPressed: _submitting ? null : _submit,
                          child: _submitting
                              ? const CupertinoActivityIndicator(
                                  color: CupertinoColors.white)
                              : const Row(
                                  mainAxisAlignment:
                                      MainAxisAlignment.center,
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(CupertinoIcons.checkmark_circle,
                                        size: 18,
                                        color: CupertinoColors.white),
                                    SizedBox(width: 6),
                                    Text(
                                      "Submit Report",
                                      style: TextStyle(
                                        fontSize: 14,
                                        fontWeight: FontWeight.bold,
                                        color: CupertinoColors.white,
                                      ),
                                    ),
                                  ],
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
    required String placeholder,
    int maxLines = 1,
    TextInputType? keyboardType,
    String? error,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CupertinoTextField(
          controller: controller,
          placeholder: placeholder,
          keyboardType: keyboardType,
          maxLines: maxLines,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: BoxDecoration(
            color: CupertinoColors.systemGrey6,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: error != null
                  ? CupertinoColors.destructiveRed
                  : CupertinoColors.systemGrey4,
            ),
          ),
          placeholderStyle: const TextStyle(
              color: CupertinoColors.systemGrey, fontSize: 13),
        ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 4),
            child: Text(
              error,
              style: const TextStyle(
                fontSize: 12,
                color: CupertinoColors.destructiveRed,
              ),
            ),
          ),
      ],
    );
  }
}
