import 'dart:convert';

import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';

import '../../../services/http_service.dart';
import '../../../utils/csv_export.dart';
import '../../../widgets/cupertino/cupertino_date_range_filter.dart';
import '../../../widgets/cupertino/cupertino_page_header.dart';
import '../../../widgets/date_range_filter.dart' show dateInRange;
import 'cupertino_grievance_view_page.dart';

class CupertinoRejectedGrievancesPage extends StatefulWidget {
  final String role;

  const CupertinoRejectedGrievancesPage({super.key, required this.role});

  @override
  State<CupertinoRejectedGrievancesPage> createState() =>
      _CupertinoRejectedGrievancesPageState();
}

class _CupertinoRejectedGrievancesPageState
    extends State<CupertinoRejectedGrievancesPage> {
  static const Color _bg = Color(0xFFFEF2F2);
  static const Color _border = Color(0xFFFECACA);
  static const Color _accent = Color(0xFFDC2626);
  static const Color _pillBg = Color(0xFFFEE2E2);
  static const Color _muted = Color(0xFF94A3B8);
  static const Color _foreground = Color(0xFF0F172A);

  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _items = [];
  DateTime? _dateFrom;
  DateTime? _dateTo;

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
      final res =
          await HttpService.get("/api/grievances?status=REJECTED&limit=100");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final list = decoded is List ? decoded : (decoded["data"] ?? []);
        _items = (list as List)
            .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
            .toList();
      } else {
        _error = "Failed to load (${res.statusCode})";
      }
    } catch (e) {
      _error = "Network error";
    }
    if (mounted) setState(() => _loading = false);
  }

  String _fmtDate(String? iso) {
    if (iso == null || iso.isEmpty) return "-";
    try {
      return DateFormat('d MMM yyyy').format(DateTime.parse(iso));
    } catch (_) {
      return "-";
    }
  }

  /// Rejected grievances after applying the client-side From/To (createdAt)
  /// range.
  List<Map<String, dynamic>> get _visibleItems {
    if (_dateFrom == null && _dateTo == null) return _items;
    return _items.where((g) {
      final dt = DateTime.tryParse(g['createdAt']?.toString() ?? '');
      return dateInRange(dt, from: _dateFrom, to: _dateTo);
    }).toList();
  }

  void _exportCsv() {
    CsvExport.export(
      context,
      fileName: 'rejected_grievances',
      headers: const ['Petitioner', 'Type', 'Status', 'Created'],
      rows: _visibleItems.map((g) {
        String created = '';
        try {
          created = DateFormat('dd MMM yyyy')
              .format(DateTime.parse(g['createdAt'].toString()));
        } catch (_) {}
        return [
          g['petitionerName'] ?? '',
          (g['grievanceType'] ?? '').toString().replaceAll('_', ' '),
          'REJECTED',
          created,
        ];
      }).toList(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      child: Column(
        children: [
          OmsPageHeader(
            title: "Rejected Grievances",
            subtitle: !_loading
                ? Text(
                    "(${_visibleItems.length})",
                    style: const TextStyle(
                      color: CupertinoColors.white,
                      fontWeight: FontWeight.w500,
                      fontSize: 13,
                    ),
                  )
                : null,
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                CupertinoButton(
                  padding: EdgeInsets.zero,
                  onPressed: _visibleItems.isEmpty ? null : _exportCsv,
                  child: const Icon(CupertinoIcons.arrow_down_doc,
                      color: CupertinoColors.white, size: 22),
                ),
              ],
            ),
          ),
          Expanded(
              child: CustomScrollView(
            slivers: [
              CupertinoSliverRefreshControl(onRefresh: _fetch),
              if (!_loading && _error == null)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                    child: Container(
                      decoration: BoxDecoration(
                        color: CupertinoColors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: _border),
                      ),
                      child: CupertinoDateRangeFilter(
                        from: _dateFrom,
                        to: _dateTo,
                        tint: _accent,
                        onFromChanged: (d) => setState(() => _dateFrom = d),
                        onToChanged: (d) => setState(() => _dateTo = d),
                        onClear: () => setState(() {
                          _dateFrom = null;
                          _dateTo = null;
                        }),
                      ),
                    ),
                  ),
                ),
              SliverFillRemaining(
                hasScrollBody: false,
                child: _loading
                    ? const Center(child: CupertinoActivityIndicator())
                    : _error != null
                        ? _buildError()
                        : _visibleItems.isEmpty
                            ? _buildEmpty()
                            : _buildList(),
              ),
            ],
          )),
        ],
      ),
    );
  }

  Widget _buildError() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(CupertinoIcons.exclamationmark_circle,
                size: 48, color: _muted),
            const SizedBox(height: 12),
            Text(_error ?? "Error",
                style: const TextStyle(color: Color(0xFF64748B))),
            const SizedBox(height: 16),
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
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(CupertinoIcons.check_mark_circled, size: 48, color: _muted),
            SizedBox(height: 12),
            Text(
              "No rejected grievances",
              style: TextStyle(color: Color(0xFF64748B), fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildList() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: _bg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: _border),
        ),
        child: Column(
          children: [
            ..._visibleItems.map((g) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: _itemCard(g),
                )),
            const Padding(
              padding: EdgeInsets.only(top: 4, bottom: 2),
              child: Row(
                children: [
                  Text("Check the bell ",
                      style: TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                  Text("🔔", style: TextStyle(fontSize: 12)),
                  Text(" in the top bar for the rejection reason.",
                      style: TextStyle(fontSize: 12, color: Color(0xFF64748B))),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _itemCard(Map<String, dynamic> g) {
    final petitioner = (g["petitionerName"] ?? "-").toString();
    final type = (g["grievanceType"] ?? "-").toString().replaceAll("_", " ");
    final dateStr = _fmtDate(g["createdAt"]?.toString());
    final id = g["id"]?.toString() ?? "";

    return GestureDetector(
      onTap: () {
        Navigator.push(
          context,
          CupertinoPageRoute(
            builder: (_) => CupertinoGrievanceViewPage(
              grievanceId: id,
              role: widget.role,
            ),
          ),
        );
      },
      child: Container(
        decoration: BoxDecoration(
          color: CupertinoColors.white,
          borderRadius: BorderRadius.circular(10),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  RichText(
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    text: TextSpan(
                      children: [
                        TextSpan(
                          text: petitioner,
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 14,
                            color: _foreground,
                          ),
                        ),
                        const TextSpan(
                          text: "  —  ",
                          style: TextStyle(
                            fontSize: 14,
                            color: _muted,
                          ),
                        ),
                        TextSpan(
                          text: type.toUpperCase(),
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                            color: _accent,
                            letterSpacing: 0.4,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    "Submitted $dateStr",
                    style: const TextStyle(
                      fontSize: 12,
                      color: _muted,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: _pillBg,
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Text(
                "REJECTED",
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 0.6,
                  color: _accent,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
