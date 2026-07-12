import 'dart:convert';
import 'dart:io';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:open_filex/open_filex.dart';

import '../../../services/http_service.dart';
import '../../../theme/app_theme.dart';
import '../../../utils/csv_export.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../widgets/cupertino/cupertino_date_range_filter.dart';
import '../../../widgets/date_range_filter.dart' show dateInRange;

class CupertinoTrainQueuePage extends StatefulWidget {
  const CupertinoTrainQueuePage({super.key});

  @override
  State<CupertinoTrainQueuePage> createState() =>
      _CupertinoTrainQueuePageState();
}

class _CupertinoTrainQueuePageState extends State<CupertinoTrainQueuePage> {
  bool _loading = true;
  String? _error;

  List<Map<String, dynamic>> _requests = [];

  DateTime? _dateFrom;
  DateTime? _dateTo;

  final Set<String> _busyIds = {};

  @override
  void initState() {
    super.initState();
    _fetchRequests();
  }

  Future<void> _fetchRequests() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await HttpService.get("/api/train-requests?limit=200");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list = decoded is List ? decoded : (decoded["data"] ?? []);
        if (mounted) {
          setState(() {
            _requests = list
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

  Future<void> _downloadPdf(Map<String, dynamic> r) async {
    final id = r["id"]?.toString() ?? "";
    if (id.isEmpty || _busyIds.contains(id)) return;
    setState(() => _busyIds.add(id));
    try {
      final res = await HttpService.downloadFile("/api/pdf/train-eq/$id");
      if (res.statusCode == 200) {
        final dir = await getTemporaryDirectory();
        final file = File("${dir.path}/train_eq_$id.pdf");
        await file.writeAsBytes(res.bodyBytes);
        final result = await OpenFilex.open(file.path);
        if (!mounted) return;
        if (result.type != ResultType.done) {
          CupertinoToast.show(context,
              "Could not open PDF: ${result.message}",
              isError: true);
        }
      } else {
        if (!mounted) return;
        CupertinoToast.show(
            context, "PDF failed (${res.statusCode})",
            isError: true);
      }
    } catch (_) {
      if (!mounted) return;
      CupertinoToast.show(context, "Download error / No internet",
          isError: true);
    } finally {
      if (mounted) setState(() => _busyIds.remove(id));
    }
  }

  void _openPreview(Map<String, dynamic> r) {
    showCupertinoModalPopup(
      context: context,
      builder: (_) => _CupertinoTrainPreviewSheet(request: r),
    );
  }

  String _shortDate(String? iso) {
    if (iso == null || iso.isEmpty) return "—";
    try {
      return DateFormat('M/d/yyyy').format(DateTime.parse(iso));
    } catch (_) {
      return iso;
    }
  }

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      backgroundColor: AppTheme.background,
      navigationBar: CupertinoNavigationBar(
        backgroundColor: AppTheme.primaryIndigo,
        brightness: Brightness.dark,
        middle: const Text(
          "Train EQ Requests",
          style: TextStyle(color: CupertinoColors.white),
        ),
        leading: CupertinoButton(
          padding: EdgeInsets.zero,
          onPressed: () => Navigator.pop(context),
          child: const Icon(CupertinoIcons.back,
              color: CupertinoColors.white),
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CupertinoButton(
              padding: EdgeInsets.zero,
              onPressed: _visibleRequests.isEmpty ? null : _exportCsv,
              child: const Icon(CupertinoIcons.arrow_down_doc,
                  color: CupertinoColors.white, size: 22),
            ),
            GestureDetector(
              onTap: _fetchRequests,
              child: const Icon(CupertinoIcons.refresh,
                  color: CupertinoColors.white, size: 22),
            ),
          ],
        ),
      ),
      child: SafeArea(
        child: CustomScrollView(
          slivers: [
            CupertinoSliverRefreshControl(onRefresh: _fetchRequests),
            SliverPadding(
              padding: const EdgeInsets.all(16),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  if (_loading)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 60),
                      child: Center(child: CupertinoActivityIndicator()),
                    )
                  else ...[
                    Container(
                      decoration: BoxDecoration(
                        color: CupertinoColors.systemBackground,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: CupertinoColors.systemGrey5),
                      ),
                      child: CupertinoDateRangeFilter(
                        from: _dateFrom,
                        to: _dateTo,
                        tint: AppTheme.primaryIndigo,
                        onFromChanged: (d) => setState(() => _dateFrom = d),
                        onToChanged: (d) => setState(() => _dateTo = d),
                        onClear: () => setState(() {
                          _dateFrom = null;
                          _dateTo = null;
                        }),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      "Train EQ Requests (${_visibleRequests.length})",
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.foreground,
                      ),
                    ),
                    const SizedBox(height: 12),
                    if (_error != null)
                      _buildError()
                    else if (_visibleRequests.isEmpty)
                      _buildEmpty()
                    else
                      ..._visibleRequests.map(_buildCard),
                    const SizedBox(height: 24),
                  ],
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<Map<String, dynamic>> get _visibleRequests {
    if (_dateFrom == null && _dateTo == null) return _requests;
    return _requests.where((r) {
      final dt = DateTime.tryParse(r['createdAt']?.toString() ?? '');
      return dateInRange(dt, from: _dateFrom, to: _dateTo);
    }).toList();
  }

  void _exportCsv() {
    CsvExport.export(
      context,
      fileName: 'train_eq_requests',
      headers: [
        'Passenger',
        'PNR',
        'From',
        'To',
        'Journey Date',
        'Class',
        'Train',
        'Created By',
        'Created'
      ],
      rows: _visibleRequests.map((r) {
        String created = '';
        try {
          created = DateFormat('dd MMM yyyy')
              .format(DateTime.parse(r['createdAt'].toString()));
        } catch (_) {}
        String journey = '';
        try {
          journey = DateFormat('dd MMM yyyy')
              .format(DateTime.parse(r['dateOfJourney'].toString()));
        } catch (_) {}
        final trainNo = r['trainNumber']?.toString() ?? '';
        final trainName = r['trainName']?.toString() ?? '';
        final train = '$trainNo${trainName.isNotEmpty ? ' - $trainName' : ''}';
        return [
          r['passengerName'] ?? '',
          r['pnrNumber'] ?? '',
          r['fromStation'] ?? '',
          r['toStation'] ?? '',
          journey,
          r['journeyClass'] ?? '',
          train,
          r['createdBy']?['name'] ?? '',
          created,
        ];
      }).toList(),
    );
  }

  Widget _buildCard(Map<String, dynamic> r) {
    final passenger = r["passengerName"] ?? "—";
    final pnr = r["pnrNumber"] ?? "—";
    final from = r["fromStation"] ?? "—";
    final to = r["toStation"] ?? "—";
    final cls = r["journeyClass"] ?? "—";
    final dateOfJourney = _shortDate(r["dateOfJourney"]?.toString());
    final contact = r["contactNumber"]?.toString() ?? "";
    final trainNo = r["trainNumber"]?.toString() ?? "";
    final trainName = r["trainName"]?.toString() ?? "";
    final createdBy = r["createdBy"]?["name"] ?? "—";
    final createdAt = _shortDate(r["createdAt"]?.toString());

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.border),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: const Color(0xFFEFF6FF),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(CupertinoIcons.tram_fill,
                    color: Color(0xFF1D4ED8)),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      passenger,
                      style: const TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.foreground),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      "PNR: $pnr · $from → $to · $dateOfJourney · $cls",
                      style: const TextStyle(
                          fontSize: 12,
                          color: CupertinoColors.systemGrey),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (contact.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text("Contact: $contact",
                          style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.primaryIndigo)),
                    ],
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        const Icon(CupertinoIcons.train_style_one,
                            size: 12, color: CupertinoColors.systemGrey),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            "$trainNo${trainName.isNotEmpty ? ' - $trainName' : ''}",
                            style: const TextStyle(
                                fontSize: 11,
                                color: CupertinoColors.systemGrey),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    Text(
                      "Created by: $createdBy · $createdAt",
                      style: const TextStyle(
                          fontSize: 11,
                          color: CupertinoColors.systemGrey),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _cardActions(r),
        ],
      ),
    );
  }

  Widget _cardActions(Map<String, dynamic> r) {
    final id = r["id"]?.toString() ?? "";
    final isBusy = _busyIds.contains(id);

    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        _btn(
          label: "Preview",
          icon: CupertinoIcons.eye,
          bg: CupertinoColors.systemGrey6,
          fg: CupertinoColors.black,
          onTap: () => _openPreview(r),
        ),
        _btn(
          label: "Download PDF",
          icon: CupertinoIcons.cloud_download,
          bg: AppTheme.saffron,
          fg: CupertinoColors.white,
          loading: isBusy,
          onTap: () => _downloadPdf(r),
        ),
      ],
    );
  }

  Widget _btn({
    required String label,
    required IconData icon,
    required Color bg,
    required Color fg,
    bool loading = false,
    required VoidCallback onTap,
  }) {
    return CupertinoButton(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      color: bg,
      borderRadius: BorderRadius.circular(8),
      onPressed: loading ? null : onTap,
      child: loading
          ? CupertinoActivityIndicator(color: fg)
          : Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, color: fg, size: 14),
                const SizedBox(width: 4),
                Text(
                  label,
                  style: TextStyle(
                    color: fg,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
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
                style:
                    const TextStyle(color: CupertinoColors.systemGrey)),
            const SizedBox(height: 12),
            CupertinoButton.filled(
              onPressed: _fetchRequests,
              child: const Text("Retry"),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmpty() {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 60),
      child: Center(
        child: Column(
          children: [
            Icon(CupertinoIcons.tray,
                size: 56, color: CupertinoColors.systemGrey4),
            SizedBox(height: 12),
            Text("No train EQ requests",
                style: TextStyle(
                    color: CupertinoColors.systemGrey, fontSize: 14)),
          ],
        ),
      ),
    );
  }
}

// =====================================================
// CUPERTINO TRAIN PREVIEW MODAL
// =====================================================
class _CupertinoTrainPreviewSheet extends StatelessWidget {
  final Map<String, dynamic> request;
  const _CupertinoTrainPreviewSheet({required this.request});

  String _formatDateTime(dynamic v) {
    if (v == null) return "—";
    try {
      return DateFormat('d MMM yyyy, hh:mm a')
          .format(DateTime.parse(v.toString()));
    } catch (_) {
      return "—";
    }
  }

  String _formatDate(dynamic v) {
    if (v == null) return "—";
    try {
      return DateFormat('d MMM yyyy').format(DateTime.parse(v.toString()));
    } catch (_) {
      return "—";
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = request;
    final passengers = (r["train_passengers"] is List)
        ? List.from(r["train_passengers"])
        : <dynamic>[];

    return Container(
      decoration: const BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        top: false,
        child: ConstrainedBox(
          constraints: BoxConstraints(
              maxHeight: MediaQuery.of(context).size.height * 0.85),
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
                      child: Text("Train EQ Preview",
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
                const SizedBox(height: 12),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    if ((r["bookingType"] ?? "").toString().isNotEmpty)
                      _outlinedPill(r["bookingType"].toString()),
                    if ((r["journeyClass"] ?? "").toString().isNotEmpty)
                      _outlinedPill("Class: ${r["journeyClass"]}"),
                  ],
                ),
                const SizedBox(height: 12),
                _kv("Passenger", r["passengerName"]?.toString() ?? "—"),
                _kv("PNR", r["pnrNumber"]?.toString() ?? "—"),
                _kv("Contact", r["contactNumber"]?.toString() ?? "—"),
                _kv("Train",
                    "${r["trainNumber"] ?? ""} ${r["trainName"] ?? ""}".trim()),
                _kv("Route",
                    "${r["fromStation"] ?? "—"} → ${r["toStation"] ?? "—"}"),
                _kv("Date of Journey",
                    _formatDate(r["dateOfJourney"])),
                if ((r["referencedBy"] ?? "").toString().isNotEmpty)
                  _kv("Referenced By", r["referencedBy"].toString()),
                if ((r["remarks"] ?? "").toString().isNotEmpty)
                  _kv("Remarks", r["remarks"].toString()),
                if (passengers.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  const Text("Passengers",
                      style: TextStyle(
                          fontSize: 13, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 6),
                  ...passengers.map((p) {
                    final m = Map<String, dynamic>.from(p);
                    return Container(
                      margin: const EdgeInsets.only(bottom: 6),
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: CupertinoColors.systemGrey6,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        "${m["name"] ?? "—"} · ${m["age"] ?? "—"} ${m["gender"] ?? ""}${m["berthPreference"] != null ? " · ${m["berthPreference"]}" : ""}",
                        style: const TextStyle(fontSize: 12),
                      ),
                    );
                  }),
                ],
                const SizedBox(height: 12),
                _kv("Created by",
                    r["createdBy"]?["name"]?.toString() ?? "—"),
                _kv("Created at", _formatDateTime(r["createdAt"])),
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
                style: const TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w500)),
          ),
        ],
      ),
    );
  }

  Widget _outlinedPill(String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        border: Border.all(color: CupertinoColors.systemGrey4),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(text,
          style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: CupertinoColors.systemGrey)),
    );
  }
}
