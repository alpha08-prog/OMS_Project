import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:open_filex/open_filex.dart';

import '../../services/http_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/csv_export.dart';
import '../../widgets/date_range_filter.dart';

/// Admin-only "Train EQ Requests" page.
/// Read-only list of all train EQ requests. Per-card actions: Preview + Download.
class TrainQueuePage extends StatefulWidget {
  const TrainQueuePage({super.key});

  @override
  State<TrainQueuePage> createState() => _TrainQueuePageState();
}

class _TrainQueuePageState extends State<TrainQueuePage> {
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
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text("Could not open PDF: ${result.message}")),
          );
        }
      } else {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("PDF failed (${res.statusCode})")),
        );
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Download error / No internet")),
      );
    } finally {
      if (mounted) setState(() => _busyIds.remove(id));
    }
  }

  void _openPreview(Map<String, dynamic> r) {
    showDialog(
      context: context,
      builder: (_) => _TrainPreviewDialog(request: r),
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

  @override
  Widget build(BuildContext context) {
    final visible = _visibleRequests;
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        backgroundColor: AppTheme.primaryIndigo,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const [
            Text(
              "Train EQ Requests",
              style: TextStyle(
                  color: Colors.white, fontWeight: FontWeight.bold),
            ),
            Text(
              "View and download EQ letters",
              style: TextStyle(color: Colors.white70, fontSize: 11),
            ),
          ],
        ),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          IconButton(
            tooltip: "Export CSV",
            icon: const Icon(Icons.download, color: Colors.white),
            onPressed: _visibleRequests.isEmpty ? null : _exportCsv,
          ),
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white),
            onPressed: _fetchRequests,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _fetchRequests,
        child: _loading
            ? ListView(children: const [
                SizedBox(height: 60),
                Center(child: CircularProgressIndicator()),
              ])
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Card(
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                      side: BorderSide(color: Colors.grey.shade200),
                    ),
                    child: DateRangeFilter(
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
                  else if (visible.isEmpty)
                    _buildEmpty()
                  else
                    ...visible.map(_buildCard),
                  const SizedBox(height: 24),
                ],
              ),
      ),
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
        color: Colors.white,
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
                child:
                    const Icon(Icons.train, color: Color(0xFF1D4ED8)),
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
                        color: AppTheme.foreground,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      "PNR: $pnr · $from → $to · $dateOfJourney · $cls",
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey.shade700,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (contact.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        "Contact: $contact",
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.primaryIndigo,
                        ),
                      ),
                    ],
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(Icons.train_outlined,
                            size: 12, color: Colors.grey.shade600),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            "$trainNo${trainName.isNotEmpty ? ' - $trainName' : ''}",
                            style: TextStyle(
                                fontSize: 11,
                                color: Colors.grey.shade700),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    Text(
                      "Created by: $createdBy · $createdAt",
                      style: TextStyle(
                          fontSize: 11, color: Colors.grey.shade600),
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
      alignment: WrapAlignment.start,
      children: [
        _actionBtn(
          label: "Preview",
          icon: Icons.visibility_outlined,
          bg: Colors.white,
          fg: Colors.grey.shade800,
          border: Colors.grey.shade300,
          onPressed: () => _openPreview(r),
        ),
        _actionBtn(
          label: "Download PDF",
          icon: Icons.download_outlined,
          bg: AppTheme.saffron,
          fg: Colors.white,
          loading: isBusy,
          onPressed: () => _downloadPdf(r),
        ),
      ],
    );
  }

  Widget _actionBtn({
    required String label,
    required IconData icon,
    required Color bg,
    required Color fg,
    Color? border,
    bool loading = false,
    required VoidCallback onPressed,
  }) {
    final isOutlined = border != null;
    return ElevatedButton.icon(
      onPressed: loading ? null : onPressed,
      icon: loading
          ? SizedBox(
              width: 12,
              height: 12,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation(fg),
              ),
            )
          : Icon(icon, size: 14, color: fg),
      label: Text(label),
      style: ElevatedButton.styleFrom(
        backgroundColor: bg,
        foregroundColor: fg,
        elevation: 0,
        side: isOutlined ? BorderSide(color: border) : null,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8)),
        textStyle: const TextStyle(
            fontSize: 11, fontWeight: FontWeight.w600),
      ),
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
              onPressed: _fetchRequests,
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
            Text("No train EQ requests",
                style: TextStyle(
                    color: Colors.grey.shade600, fontSize: 14)),
          ],
        ),
      ),
    );
  }
}

// =====================================================
// TRAIN PREVIEW DIALOG
// =====================================================
class _TrainPreviewDialog extends StatelessWidget {
  final Map<String, dynamic> request;
  const _TrainPreviewDialog({required this.request});

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

    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      shape:
          RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 540, maxHeight: 600),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      "Train EQ Preview",
                      style: TextStyle(
                          fontSize: 18, fontWeight: FontWeight.bold),
                    ),
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
              _kv("Date of Journey", _formatDate(r["dateOfJourney"])),
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
                      color: Colors.grey.shade50,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: Colors.grey.shade200),
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
            child: Text(
              value,
              style: const TextStyle(
                  fontSize: 13, fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }

  Widget _outlinedPill(String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(text,
          style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: Colors.grey.shade800)),
    );
  }
}
