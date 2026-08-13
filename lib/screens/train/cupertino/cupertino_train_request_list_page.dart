import 'dart:convert';
import 'dart:io';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:open_filex/open_filex.dart';

import '../../../services/http_service.dart';
import '../../../utils/access_control.dart';
import '../../../utils/csv_export.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../widgets/cupertino/cupertino_styled_card.dart';
import '../../../widgets/cupertino/cupertino_date_range_filter.dart';
import '../../../widgets/cupertino/cupertino_page_header.dart';
import '../../../widgets/date_range_filter.dart' show dateInRange;
import 'cupertino_train_request_add_page.dart';
import '../../../widgets/oms_loader.dart';

class CupertinoTrainRequestListPage extends StatefulWidget {
  final String role;
  const CupertinoTrainRequestListPage({super.key, required this.role});

  @override
  State<CupertinoTrainRequestListPage> createState() =>
      _CupertinoTrainRequestListPageState();
}

class _CupertinoTrainRequestListPageState
    extends State<CupertinoTrainRequestListPage> {
  static const Color primaryBlue = Color(0xFF0A2E5C);
  static const Color bgLight = Color(0xFFF4F6FB);
  static const Color successGreen = Color(0xFF10B981);
  static const Color warningOrange = Color(0xFFF59E0B);

  bool loading = true;
  String? error;
  String _searchQuery = "";
  DateTime? _dateFrom;
  DateTime? _dateTo;
  final _searchController = TextEditingController();

  List<Map<String, dynamic>> requests = [];

  int _totalCount = 0;

  @override
  void initState() {
    super.initState();
    fetchRequests();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> fetchRequests() async {
    setState(() {
      loading = true;
      error = null;
    });

    try {
      final Map<String, String> queryParams = {};
      if (_searchQuery.isNotEmpty) {
        queryParams['search'] = _searchQuery;
      }

      String queryString = "";
      if (queryParams.isNotEmpty) {
        queryString = "?" +
            queryParams.entries
                .map((e) => "${e.key}=${Uri.encodeComponent(e.value)}")
                .join("&");
      }

      final res = await HttpService.get("/api/train-requests$queryString");

      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list = decoded is List ? decoded : (decoded["data"] ?? []);

        final items = list
            .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
            .toList();

        setState(() {
          requests = items;
          _totalCount = items.length;
          loading = false;
        });
      } else {
        setState(() {
          error = "Failed to load train requests (${res.statusCode})";
          loading = false;
        });
      }
    } catch (_) {
      setState(() {
        error = "Server error / No internet";
        loading = false;
      });
    }
  }

  void _openCreate() {
    final canCreate = AccessControl.can(widget.role, ActionPermission.create);

    if (!canCreate) {
      CupertinoToast.show(context, "You have view-only access.", isError: true);
      return;
    }

    Navigator.push(
      context,
      CupertinoPageRoute(
        builder: (_) => CupertinoTrainRequestAddPage(
          role: widget.role,
          onCreated: () async {
            await fetchRequests();
          },
        ),
      ),
    );
  }

  String? _getId(Map<String, dynamic> item) {
    final id = item["id"];
    if (id is int) return id.toString();
    if (id is String) return id;
    return null;
  }


  Future<void> _downloadPdf(String id, String pnr) async {
    // Show loading overlay
    showCupertinoDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => Center(
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: CupertinoColors.systemBackground,
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              CupertinoActivityIndicator(),
              SizedBox(width: 16),
              Text("Downloading PDF..."),
            ],
          ),
        ),
      ),
    );

    try {
      final response = await HttpService.downloadFile("/api/pdf/train-eq/$id");

      if (mounted) Navigator.of(context).pop();

      if (response.statusCode == 200) {
        final directory = await getApplicationDocumentsDirectory();
        final fileName = "TrainEQ_$pnr.pdf";
        final filePath = "${directory.path}/$fileName";

        final file = File(filePath);
        await file.writeAsBytes(response.bodyBytes);

        final result = await OpenFilex.open(filePath);

        if (result.type != ResultType.done) {
          if (mounted) {
            CupertinoToast.show(
                context, "Could not open file: ${result.message}",
                isError: true);
          }
        } else {
          if (mounted) {
            CupertinoToast.show(context, "PDF saved: $fileName");
          }
        }
      } else {
        if (mounted) {
          CupertinoToast.show(
              context, "Download failed (${response.statusCode})",
              isError: true);
        }
      }
    } catch (_) {
      if (mounted) Navigator.of(context).pop();
      if (mounted) {
        CupertinoToast.show(context, "Something went wrong. Please try again.",
            isError: true);
      }
    }
  }

  void _showDetails(Map<String, dynamic> r) {
    final pnr = r["pnrNumber"] ?? r["pnr"] ?? "-";
    final trainName = r["trainName"] ?? "-";
    final trainNumber = r["trainNumber"] ?? "-";
    final from = r["fromStation"] ?? r["from"] ?? "-";
    final to = r["toStation"] ?? r["to"] ?? "-";
    final journeyClass = r["journeyClass"] ?? "-";
    final bookingType = r["bookingType"] ?? "-";
    final passengers = r["passengers"] as List? ?? [];
    final dateOfJourney = r["dateOfJourney"];
    final createdBy = r["createdBy"];
    final createdByName = createdBy?["name"] ?? "-";
    final contactNumber = r["contactNumber"] ?? "-";
    final referencedBy = r["referencedBy"] ?? "-";

    String formattedDate = "-";
    if (dateOfJourney != null) {
      try {
        final date = DateTime.parse(dateOfJourney);
        formattedDate = DateFormat('dd MMM yyyy').format(date);
      } catch (_) {}
    }

    showCupertinoModalPopup(
      context: context,
      builder: (ctx) => Container(
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
              // Handle
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
              const SizedBox(height: 20),

              // Header
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: primaryBlue.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(CupertinoIcons.train_style_one,
                        color: primaryBlue, size: 28),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          "PNR: $pnr",
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          "$trainNumber - $trainName",
                          style: TextStyle(color: CupertinoColors.systemGrey),
                        ),
                      ],
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: CupertinoButton.filled(
                  onPressed: () {
                    final id = r["id"]?.toString();
                    if (id != null) {
                      Navigator.pop(ctx);
                      _downloadPdf(id, pnr.toString());
                    }
                  },
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(CupertinoIcons.arrow_down_doc, size: 20),
                      SizedBox(width: 8),
                      Text("Download EQ Letter (PDF)"),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 20),

              // Route Card
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: bgLight,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text("FROM",
                              style: TextStyle(
                                  fontSize: 10,
                                  color: CupertinoColors.systemGrey,
                                  fontWeight: FontWeight.w500)),
                          const SizedBox(height: 4),
                          Text(from.toString(),
                              style: const TextStyle(
                                  fontSize: 16, fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ),
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 16),
                      child:
                          Icon(CupertinoIcons.arrow_right, color: primaryBlue),
                    ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text("TO",
                              style: TextStyle(
                                  fontSize: 10,
                                  color: CupertinoColors.systemGrey,
                                  fontWeight: FontWeight.w500)),
                          const SizedBox(height: 4),
                          Text(to.toString(),
                              style: const TextStyle(
                                  fontSize: 16, fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 16),

              // Details Grid
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: CupertinoColors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: CupertinoColors.systemGrey5),
                ),
                child: Column(
                  children: [
                    _detailRow(
                        CupertinoIcons.calendar, "Journey Date", formattedDate),
                    _detailRow(CupertinoIcons.person_2, "Class", journeyClass),
                    _detailRow(CupertinoIcons.bookmark, "Booking Type",
                        bookingType.toString().replaceAll('_', ' ')),
                    _detailRow(CupertinoIcons.phone, "Contact", contactNumber),
                    _detailRow(
                        CupertinoIcons.person, "Referenced By", referencedBy),
                    _detailRow(CupertinoIcons.person_fill, "Created By",
                        createdByName),
                  ],
                ),
              ),

              const SizedBox(height: 20),

              // Passengers
              Row(
                children: [
                  const Text("PASSENGERS",
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                          color: primaryBlue)),
                  const SizedBox(width: 8),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: primaryBlue,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text("${passengers.length}",
                        style: const TextStyle(
                            color: CupertinoColors.white,
                            fontSize: 12,
                            fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              if (passengers.isEmpty)
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: bgLight,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Center(
                    child: Text("No passengers",
                        style: TextStyle(color: CupertinoColors.systemGrey)),
                  ),
                )
              else
                ...passengers.asMap().entries.map((entry) {
                  final idx = entry.key;
                  final p = entry.value;
                  return _buildPassengerDetailCard(idx, p);
                }),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPassengerDetailCard(int index, dynamic p) {
    final name = p["name"] ?? "Unknown";
    final age = p["age"] ?? "-";
    final gender = p["gender"] ?? "-";
    final berthPref = p["berthPreference"] ?? "";
    final bookingStatus = p["bookingStatus"] ?? "";
    final currentStatus = p["currentStatus"] ?? "";

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: bgLight,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: primaryBlue,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Center(
              child: Text("${index + 1}",
                  style: const TextStyle(
                      color: CupertinoColors.white,
                      fontWeight: FontWeight.bold)),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name.toString(),
                    style: const TextStyle(
                        fontWeight: FontWeight.w600, fontSize: 15)),
                const SizedBox(height: 4),
                Text(
                  "Age: $age  |  $gender${berthPref.toString().isNotEmpty ? '  |  $berthPref' : ''}",
                  style: TextStyle(
                      fontSize: 12, color: CupertinoColors.systemGrey),
                ),
              ],
            ),
          ),
          if (currentStatus.toString().isNotEmpty ||
              bookingStatus.toString().isNotEmpty)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: _getPassengerStatusColor(currentStatus.toString().isEmpty
                    ? bookingStatus.toString()
                    : currentStatus.toString()),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                currentStatus.toString().isNotEmpty
                    ? currentStatus.toString()
                    : bookingStatus.toString(),
                style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: CupertinoColors.white),
              ),
            ),
        ],
      ),
    );
  }

  Color _getPassengerStatusColor(String status) {
    final s = status.toUpperCase();
    if (s.contains("CNF") || s.contains("CONFIRM")) return successGreen;
    if (s.contains("RAC")) return warningOrange;
    if (s.contains("WL") || s.contains("WAIT")) {
      return const Color(0xFFEF4444);
    }
    return CupertinoColors.systemGrey;
  }

  Widget _detailRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Icon(icon, size: 18, color: CupertinoColors.systemGrey),
          const SizedBox(width: 12),
          SizedBox(
            width: 100,
            child: Text(label,
                style:
                    TextStyle(fontSize: 13, color: CupertinoColors.systemGrey)),
          ),
          Expanded(
            child: Text(value,
                style:
                    const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
                textAlign: TextAlign.right),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final canCreate = AccessControl.can(widget.role, ActionPermission.create);
    final isAdmin =
        widget.role == Roles.admin || widget.role == Roles.superAdmin;

    return CupertinoPageScaffold(
      backgroundColor: bgLight,
      child: Column(
        children: [
          OmsPageHeader(
            title: "Train EQ Requests",
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (canCreate)
                  CupertinoButton(
                    padding: EdgeInsets.zero,
                    onPressed: _openCreate,
                    child: const Icon(CupertinoIcons.add,
                        color: CupertinoColors.white),
                  ),
                CupertinoButton(
                  padding: EdgeInsets.zero,
                  onPressed: _visibleRequests.isEmpty ? null : _exportCsv,
                  child: const Icon(CupertinoIcons.arrow_down_doc,
                      color: CupertinoColors.white, size: 22),
                ),
                CupertinoButton(
                  padding: EdgeInsets.zero,
                  onPressed: fetchRequests,
                  child: const Icon(CupertinoIcons.refresh,
                      color: CupertinoColors.white),
                ),
              ],
            ),
          ),
          Expanded(
            child: Column(
              children: [
                // Stats Card
                Container(
                  margin: const EdgeInsets.all(16),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [primaryBlue, primaryBlue.withOpacity(0.8)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: primaryBlue.withOpacity(0.3),
                        blurRadius: 12,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      _statItem(
                          "Total", _totalCount, CupertinoIcons.train_style_one),
                    ],
                  ),
                ),

                // Search
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: CupertinoTextField(
                    controller: _searchController,
                    placeholder: "Search by PNR, name, station...",
                    prefix: const Padding(
                      padding: EdgeInsets.only(left: 12),
                      child: Icon(CupertinoIcons.search,
                          color: CupertinoColors.systemGrey, size: 20),
                    ),
                    suffix: _searchQuery.isNotEmpty
                        ? CupertinoButton(
                            padding: const EdgeInsets.only(right: 8),
                            minSize: 0,
                            onPressed: () {
                              _searchController.clear();
                              setState(() => _searchQuery = "");
                              fetchRequests();
                            },
                            child: const Icon(CupertinoIcons.clear_circled,
                                size: 18, color: CupertinoColors.systemGrey),
                          )
                        : null,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 14),
                    decoration: BoxDecoration(
                      color: CupertinoColors.white,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    onSubmitted: (v) {
                      setState(() => _searchQuery = v);
                      fetchRequests();
                    },
                  ),
                ),

                const SizedBox(height: 12),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: CupertinoDateRangeFilter(
                    from: _dateFrom,
                    to: _dateTo,
                    tint: primaryBlue,
                    padding: EdgeInsets.zero,
                    onFromChanged: (d) => setState(() => _dateFrom = d),
                    onToChanged: (d) => setState(() => _dateTo = d),
                    onClear: () => setState(() {
                      _dateFrom = null;
                      _dateTo = null;
                    }),
                  ),
                ),

                const SizedBox(height: 12),

                // List
                Expanded(
                  child: loading
                      ? OmsLoader(size: 56)
                      : error != null
                          ? Center(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(CupertinoIcons.exclamationmark_circle,
                                      size: 48,
                                      color: CupertinoColors.systemGrey3),
                                  const SizedBox(height: 16),
                                  Text(error!,
                                      style: TextStyle(
                                          color: CupertinoColors.systemGrey)),
                                  const SizedBox(height: 16),
                                  CupertinoButton.filled(
                                    onPressed: fetchRequests,
                                    child: const Text("Retry"),
                                  ),
                                ],
                              ),
                            )
                          : _visibleRequests.isEmpty
                              ? Center(
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(CupertinoIcons.train_style_one,
                                          size: 64,
                                          color: CupertinoColors.systemGrey4),
                                      const SizedBox(height: 16),
                                      Text("No requests found",
                                          style: TextStyle(
                                              fontSize: 16,
                                              color:
                                                  CupertinoColors.systemGrey)),
                                    ],
                                  ),
                                )
                              : CustomScrollView(
                                  slivers: [
                                    CupertinoSliverRefreshControl(
                                      onRefresh: fetchRequests,
                                    ),
                                    SliverPadding(
                                      padding: const EdgeInsets.fromLTRB(
                                          16, 0, 16, 80),
                                      sliver: SliverList(
                                        delegate: SliverChildBuilderDelegate(
                                          (context, index) {
                                            final r = _visibleRequests[index];
                                            return _buildRequestCard(
                                                r, isAdmin);
                                          },
                                          childCount: _visibleRequests.length,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  List<Map<String, dynamic>> get _visibleRequests {
    if (_dateFrom == null && _dateTo == null) return requests;
    return requests.where((r) {
      final dt = DateTime.tryParse(r['createdAt']?.toString() ?? '');
      return dateInRange(dt, from: _dateFrom, to: _dateTo);
    }).toList();
  }

  void _exportCsv() {
    CsvExport.export(
      context,
      fileName: 'train_requests',
      headers: [
        'Passenger',
        'PNR',
        'From',
        'To',
        'Journey Date',
        'Class',
        'Train',
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
        final passengers = r['passengers'] as List? ?? [];
        final names = passengers
            .map((p) => p['name']?.toString() ?? '')
            .where((n) => n.isNotEmpty)
            .join(', ');
        final passenger =
            names.isNotEmpty ? names : (r['passengerName']?.toString() ?? '');
        final trainNo = r['trainNumber']?.toString() ?? '';
        final trainName = r['trainName']?.toString() ?? '';
        final train = '$trainNo${trainName.isNotEmpty ? ' - $trainName' : ''}';
        return [
          passenger,
          r['pnrNumber'] ?? r['pnr'] ?? '',
          r['fromStation'] ?? r['from'] ?? '',
          r['toStation'] ?? r['to'] ?? '',
          journey,
          r['journeyClass'] ?? '',
          train,
          created,
        ];
      }).toList(),
    );
  }

  Widget _statItem(String label, int count, IconData icon, [Color? iconColor]) {
    return Column(
      children: [
        Icon(icon, color: iconColor ?? CupertinoColors.white, size: 22),
        const SizedBox(height: 4),
        Text(count.toString(),
            style: const TextStyle(
                color: CupertinoColors.white,
                fontSize: 20,
                fontWeight: FontWeight.bold)),
        Text(label,
            style: TextStyle(
                color: CupertinoColors.white.withOpacity(0.7), fontSize: 11)),
      ],
    );
  }

  Widget _buildRequestCard(Map<String, dynamic> r, bool isAdmin) {
    final pnr = r["pnrNumber"] ?? r["pnr"] ?? "-";
    final trainName = r["trainName"] ?? "";
    final trainNumber = r["trainNumber"] ?? "";
    final from = r["fromStation"] ?? r["from"] ?? "-";
    final to = r["toStation"] ?? r["to"] ?? "-";
    final passengers = r["passengers"] as List? ?? [];
    final passengerCount = passengers.isNotEmpty
        ? passengers.length
        : (r["_count"]?["passengers"] ?? 0);
    final dateOfJourney = r["dateOfJourney"];
    final journeyClass = r["journeyClass"] ?? "";

    String formattedDate = "";
    if (dateOfJourney != null) {
      try {
        final date = DateTime.parse(dateOfJourney);
        formattedDate = DateFormat('dd MMM').format(date);
      } catch (_) {}
    }

    String passengerPreview = "";
    if (passengers.isNotEmpty) {
      final names = passengers
          .take(2)
          .map((p) => p["name"]?.toString() ?? "")
          .where((n) => n.isNotEmpty)
          .toList();
      if (names.isNotEmpty) {
        passengerPreview = names.join(", ");
        if (passengers.length > 2) {
          passengerPreview += " +${passengers.length - 2}";
        }
      }
    }

    return CupertinoStyledCard(
      margin: const EdgeInsets.only(bottom: 12),
      onTap: () => _showDetails(r),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: primaryBlue.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(CupertinoIcons.train_style_one,
                    color: primaryBlue, size: 24),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("PNR: $pnr",
                        style: const TextStyle(
                            fontSize: 15, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 4),
                    if (trainNumber.isNotEmpty || trainName.isNotEmpty)
                      Text(
                        "$trainNumber${trainName.isNotEmpty ? ' - $trainName' : ''}",
                        style: TextStyle(
                            fontSize: 12, color: CupertinoColors.systemGrey),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Route
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: bgLight,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(from.toString(),
                      style: const TextStyle(
                          fontWeight: FontWeight.w600, fontSize: 13)),
                ),
                const Icon(CupertinoIcons.arrow_right,
                    size: 16, color: primaryBlue),
                Expanded(
                  child: Text(to.toString(),
                      style: const TextStyle(
                          fontWeight: FontWeight.w600, fontSize: 13),
                      textAlign: TextAlign.right),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Info row
          Row(
            children: [
              Icon(CupertinoIcons.person_2,
                  size: 14, color: CupertinoColors.systemGrey),
              const SizedBox(width: 4),
              Text("$passengerCount",
                  style: TextStyle(
                      fontSize: 12,
                      color: CupertinoColors.systemGrey,
                      fontWeight: FontWeight.w500)),
              if (journeyClass.isNotEmpty) ...[
                const SizedBox(width: 12),
                Icon(CupertinoIcons.person_crop_square,
                    size: 14, color: CupertinoColors.systemGrey),
                const SizedBox(width: 4),
                Text(journeyClass,
                    style: TextStyle(
                        fontSize: 12,
                        color: CupertinoColors.systemGrey,
                        fontWeight: FontWeight.w500)),
              ],
              if (formattedDate.isNotEmpty) ...[
                const SizedBox(width: 12),
                Icon(CupertinoIcons.calendar,
                    size: 14, color: CupertinoColors.systemGrey),
                const SizedBox(width: 4),
                Text(formattedDate,
                    style: TextStyle(
                        fontSize: 12,
                        color: CupertinoColors.systemGrey,
                        fontWeight: FontWeight.w500)),
              ],
              const Spacer(),
              Icon(CupertinoIcons.chevron_right,
                  size: 18, color: CupertinoColors.systemGrey3),
            ],
          ),

          if (passengerPreview.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(passengerPreview,
                style: TextStyle(
                    fontSize: 11,
                    color: CupertinoColors.systemGrey,
                    fontStyle: FontStyle.italic),
                maxLines: 1,
                overflow: TextOverflow.ellipsis),
          ],
        ],
      ),
    );
  }
}
