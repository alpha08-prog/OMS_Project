import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:open_filex/open_filex.dart';

import '../../services/http_service.dart';
import '../../utils/access_control.dart';
import '../../utils/csv_export.dart';
import '../../widgets/date_range_filter.dart';
import 'train_request_add_page.dart';

class TrainRequestListPage extends StatefulWidget {
  final String role;
  const TrainRequestListPage({super.key, required this.role});

  @override
  State<TrainRequestListPage> createState() => _TrainRequestListPageState();
}

class _TrainRequestListPageState extends State<TrainRequestListPage> {
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
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("You have view-only access.")),
      );
      return;
    }

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => TrainRequestAddPage(
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
    // Show loading indicator
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(
        child: Card(
          child: Padding(
            padding: EdgeInsets.all(20),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(),
                SizedBox(width: 16),
                Text("Downloading PDF..."),
              ],
            ),
          ),
        ),
      ),
    );

    try {
      final response = await HttpService.downloadFile("/api/pdf/train-eq/$id");

      // Close loading dialog
      if (mounted) Navigator.of(context).pop();

      if (response.statusCode == 200) {
        // Get downloads directory
        final directory = await getApplicationDocumentsDirectory();
        final fileName = "TrainEQ_$pnr.pdf";
        final filePath = "${directory.path}/$fileName";

        // Write file
        final file = File(filePath);
        await file.writeAsBytes(response.bodyBytes);

        // Open file
        final result = await OpenFilex.open(filePath);

        if (result.type != ResultType.done) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text("Could not open file: ${result.message}")),
            );
          }
        } else {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text("PDF saved: $fileName"),
                backgroundColor: successGreen,
              ),
            );
          }
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text("Download failed (${response.statusCode})")),
          );
        }
      }
    } catch (_) {
      // Close loading dialog if still open
      if (mounted) Navigator.of(context).pop();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Something went wrong. Please try again.")),
        );
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

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => DraggableScrollableSheet(
        initialChildSize: 0.75,
        maxChildSize: 0.95,
        minChildSize: 0.5,
        expand: false,
        builder: (ctx, scrollController) => SingleChildScrollView(
          controller: scrollController,
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
                    color: Colors.grey.shade300,
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
                    child: const Icon(Icons.train, color: primaryBlue, size: 28),
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
                          style: TextStyle(color: Colors.grey.shade600),
                        ),
                      ],
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () {
                    final id = r["id"]?.toString();
                    if (id != null) {
                      Navigator.pop(ctx);
                      _downloadPdf(id, pnr.toString());
                    }
                  },
                  icon: const Icon(Icons.download, size: 20),
                  label: const Text("Download EQ Letter (PDF)"),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: successGreen,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
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
                          Text(
                            "FROM",
                            style: TextStyle(
                              fontSize: 10,
                              color: Colors.grey.shade600,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            from.toString(),
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Icon(Icons.arrow_forward, color: primaryBlue),
                    ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            "TO",
                            style: TextStyle(
                              fontSize: 10,
                              color: Colors.grey.shade600,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            to.toString(),
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
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
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.grey.shade200),
                ),
                child: Column(
                  children: [
                    _detailRow(Icons.calendar_today, "Journey Date", formattedDate),
                    _detailRow(Icons.airline_seat_recline_normal, "Class", journeyClass),
                    _detailRow(Icons.bookmark, "Booking Type", bookingType.toString().replaceAll('_', ' ')),
                    _detailRow(Icons.phone, "Contact", contactNumber),
                    _detailRow(Icons.person_outline, "Referenced By", referencedBy),
                    _detailRow(Icons.person, "Created By", createdByName),
                  ],
                ),
              ),

              const SizedBox(height: 20),

              // Passengers Section
              Row(
                children: [
                  Text(
                    "PASSENGERS",
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.bold,
                      color: primaryBlue,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: primaryBlue,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      "${passengers.length}",
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
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
                    child: Text(
                      "No passengers",
                      style: TextStyle(color: Colors.grey),
                    ),
                  ),
                )
              else
                ...passengers.asMap().entries.map((entry) {
                  final idx = entry.key;
                  final p = entry.value;
                  return _buildPassengerCard(idx, p);
                }),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPassengerCard(int index, dynamic p) {
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
              child: Text(
                "${index + 1}",
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name.toString(),
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 15,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  "Age: $age  |  $gender${berthPref.toString().isNotEmpty ? '  |  $berthPref' : ''}",
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade600,
                  ),
                ),
              ],
            ),
          ),
          if (currentStatus.toString().isNotEmpty || bookingStatus.toString().isNotEmpty)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: _getStatusColor(currentStatus.toString().isEmpty ? bookingStatus.toString() : currentStatus.toString()),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                currentStatus.toString().isNotEmpty ? currentStatus.toString() : bookingStatus.toString(),
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Color _getStatusColor(String status) {
    final s = status.toUpperCase();
    if (s.contains("CNF") || s.contains("CONFIRM")) return successGreen;
    if (s.contains("RAC")) return warningOrange;
    if (s.contains("WL") || s.contains("WAIT")) return Colors.red.shade400;
    return Colors.grey;
  }

  Widget _detailRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Icon(icon, size: 18, color: Colors.grey.shade500),
          const SizedBox(width: 12),
          SizedBox(
            width: 100,
            child: Text(
              label,
              style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
              textAlign: TextAlign.right,
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final canCreate = AccessControl.can(widget.role, ActionPermission.create);
    final isAdmin = widget.role == Roles.admin || widget.role == Roles.superAdmin;

    return Scaffold(
      backgroundColor: bgLight,
      appBar: AppBar(
        elevation: 0,
        title: const Text("Train EQ Requests", style: TextStyle(fontWeight: FontWeight.w600)),
        backgroundColor: primaryBlue,
        actions: [
          IconButton(
            tooltip: "Export CSV",
            icon: const Icon(Icons.download, color: Colors.white),
            onPressed: _visibleRequests.isEmpty ? null : _exportCsv,
          ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: fetchRequests,
          ),
        ],
      ),
      floatingActionButton: canCreate
          ? FloatingActionButton.extended(
              backgroundColor: primaryBlue,
              onPressed: _openCreate,
              icon: const Icon(Icons.add, color: Colors.white),
              label: const Text("New Request", style: TextStyle(color: Colors.white)),
            )
          : null,
      body: Column(
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
                _statItem("Total", _totalCount, Icons.train),
              ],
            ),
          ),

          // Search
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: "Search by PNR, name, station...",
                prefixIcon: const Icon(Icons.search, color: Colors.grey),
                suffixIcon: _searchQuery.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear, size: 20),
                        onPressed: () {
                          _searchController.clear();
                          setState(() => _searchQuery = "");
                          fetchRequests();
                        },
                      )
                    : null,
                filled: true,
                fillColor: Colors.white,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              ),
              onSubmitted: (v) {
                setState(() => _searchQuery = v);
                fetchRequests();
              },
            ),
          ),

          const SizedBox(height: 12),
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
            ),
            child: DateRangeFilter(
              from: _dateFrom,
              to: _dateTo,
              tint: primaryBlue,
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
                ? const Center(child: CircularProgressIndicator())
                : error != null
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.error_outline, size: 48, color: Colors.grey.shade400),
                            const SizedBox(height: 16),
                            Text(error!, style: TextStyle(color: Colors.grey.shade600)),
                            const SizedBox(height: 16),
                            ElevatedButton.icon(
                              onPressed: fetchRequests,
                              icon: const Icon(Icons.refresh),
                              label: const Text("Retry"),
                            ),
                          ],
                        ),
                      )
                    : _visibleRequests.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.train_outlined, size: 64, color: Colors.grey.shade300),
                                const SizedBox(height: 16),
                                Text(
                                  "No requests found",
                                  style: TextStyle(fontSize: 16, color: Colors.grey.shade500),
                                ),
                              ],
                            ),
                          )
                        : RefreshIndicator(
                            onRefresh: fetchRequests,
                            child: ListView.builder(
                              padding: const EdgeInsets.fromLTRB(16, 0, 16, 80),
                              itemCount: _visibleRequests.length,
                              itemBuilder: (context, index) {
                                final r = _visibleRequests[index];
                                return _buildRequestCard(r, isAdmin);
                              },
                            ),
                          ),
          ),
        ],
      ),
    );
  }

  Widget _statItem(String label, int count, IconData icon, [Color? iconColor]) {
    return Column(
      children: [
        Icon(icon, color: iconColor ?? Colors.white70, size: 22),
        const SizedBox(height: 4),
        Text(
          count.toString(),
          style: const TextStyle(
            color: Colors.white,
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white70,
            fontSize: 11,
          ),
        ),
      ],
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

    // Get passenger names preview
    String passengerPreview = "";
    if (passengers.isNotEmpty) {
      final names = passengers.take(2).map((p) => p["name"]?.toString() ?? "").where((n) => n.isNotEmpty).toList();
      if (names.isNotEmpty) {
        passengerPreview = names.join(", ");
        if (passengers.length > 2) {
          passengerPreview += " +${passengers.length - 2}";
        }
      }
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: InkWell(
        onTap: () => _showDetails(r),
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
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
                    child: const Icon(Icons.train, color: primaryBlue, size: 24),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          "PNR: $pnr",
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 4),
                        if (trainNumber.isNotEmpty || trainName.isNotEmpty)
                          Text(
                            "$trainNumber${trainName.isNotEmpty ? ' - $trainName' : ''}",
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade600,
                            ),
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
                      child: Text(
                        from.toString(),
                        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                      ),
                    ),
                    Icon(Icons.arrow_forward, size: 16, color: primaryBlue),
                    Expanded(
                      child: Text(
                        to.toString(),
                        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                        textAlign: TextAlign.right,
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 12),

              // Info row
              Row(
                children: [
                  Icon(Icons.people, size: 14, color: Colors.grey.shade600),
                  const SizedBox(width: 4),
                  Text(
                    "$passengerCount",
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade700, fontWeight: FontWeight.w500),
                  ),
                  if (journeyClass.isNotEmpty) ...[
                    const SizedBox(width: 12),
                    Icon(Icons.airline_seat_recline_normal, size: 14, color: Colors.grey.shade600),
                    const SizedBox(width: 4),
                    Text(
                      journeyClass,
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade700, fontWeight: FontWeight.w500),
                    ),
                  ],
                  if (formattedDate.isNotEmpty) ...[
                    const SizedBox(width: 12),
                    Icon(Icons.calendar_today, size: 14, color: Colors.grey.shade600),
                    const SizedBox(width: 4),
                    Text(
                      formattedDate,
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade700, fontWeight: FontWeight.w500),
                    ),
                  ],
                  const Spacer(),
                  Icon(Icons.chevron_right, size: 18, color: Colors.grey.shade400),
                ],
              ),

              // Passenger names preview
              if (passengerPreview.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  passengerPreview,
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.grey.shade500,
                    fontStyle: FontStyle.italic,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],

            ],
          ),
        ),
      ),
    );
  }

}
