import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_html/flutter_html.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:open_filex/open_filex.dart';

import '../../services/http_service.dart';
import '../../theme/app_theme.dart';

class PrintCenterPage extends StatefulWidget {
  const PrintCenterPage({super.key});

  @override
  State<PrintCenterPage> createState() => _PrintCenterPageState();
}

class _PrintCenterPageState extends State<PrintCenterPage> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  bool _loadingGrievances = true;
  bool _loadingTrainRequests = true;
  bool _loadingTempleVisits = true;
  bool _loadingTourPrograms = false;

  List<Map<String, dynamic>> _verifiedGrievances = [];
  List<Map<String, dynamic>> _approvedTrainRequests = [];
  List<Map<String, dynamic>> _templeVisits = [];

  DateTime? _tourStartDate;
  DateTime? _tourEndDate;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _fetchGrievances();
    _fetchTrainRequests();
    _fetchTempleVisits();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _fetchGrievances() async {
    setState(() => _loadingGrievances = true);
    try {
      final res = await HttpService.get("/api/grievances?isVerified=true&limit=100");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list = decoded is List ? decoded : (decoded["data"] ?? []);
        // Temple-visit grievances live in their own tab — keep this one for
        // regular verified letters only.
        _verifiedGrievances = list
            .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
            .where((g) => g['grievanceType'] != 'TEMPLE_VISIT')
            .toList();
      }
    } catch (_) {}
    if (mounted) setState(() => _loadingGrievances = false);
  }

  Future<void> _fetchTempleVisits() async {
    setState(() => _loadingTempleVisits = true);
    try {
      final res = await HttpService.get(
          "/api/grievances?grievanceType=TEMPLE_VISIT&limit=100");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list = decoded is List ? decoded : (decoded["data"] ?? []);
        _templeVisits = list
            .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
            .toList();
      }
    } catch (_) {}
    if (mounted) setState(() => _loadingTempleVisits = false);
  }

  Future<void> _fetchTrainRequests() async {
    setState(() => _loadingTrainRequests = true);
    try {
      final res = await HttpService.get("/api/train-requests?limit=100");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list = decoded is List ? decoded : (decoded["data"] ?? []);
        _approvedTrainRequests = list.map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e)).toList();
      }
    } catch (_) {}
    if (mounted) setState(() => _loadingTrainRequests = false);
  }

  Future<void> _downloadPDF(String endpoint, String filename) async {
    try {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Downloading PDF...")),
      );

      final res = await HttpService.downloadFile(endpoint);

      if (res.statusCode == 200) {
        final dir = await getApplicationDocumentsDirectory();
        final file = File('${dir.path}/$filename');
        await file.writeAsBytes(res.bodyBytes);

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text("PDF saved: $filename"),
              action: SnackBarAction(
                label: "Open",
                onPressed: () => OpenFilex.open(file.path),
              ),
            ),
          );
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text("Download failed (${res.statusCode})")),
          );
        }
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Download failed. Please try again.")),
        );
      }
    }
  }

  Future<void> _previewHTML(String endpoint, String title) async {
    try {
      final res = await HttpService.get(endpoint);
      if (res.statusCode != 200) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text("Preview failed (${res.statusCode})")),
          );
        }
        return;
      }
      if (!mounted) return;

      showDialog(
        context: context,
        builder: (ctx) => Dialog(
          insetPadding: const EdgeInsets.all(16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: const BoxDecoration(
                  color: AppTheme.primaryIndigo,
                  borderRadius:
                      BorderRadius.vertical(top: Radius.circular(12)),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        title,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close, color: Colors.white),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                      onPressed: () => Navigator.pop(ctx),
                    ),
                  ],
                ),
              ),
              Flexible(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                  child: Html(data: res.body),
                ),
              ),
            ],
          ),
        ),
      );
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Preview failed. Please try again.")),
        );
      }
    }
  }

  Future<void> _downloadTourProgramPDF() async {
    String query = "";
    if (_tourStartDate != null && _tourEndDate != null) {
      query = "?startDate=${_tourStartDate!.toIso8601String()}&endDate=${_tourEndDate!.toIso8601String()}";
    }
    await _downloadPDF("/api/pdf/tour-program$query", "tour_program_schedule.pdf");
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text("Print Center"),
        backgroundColor: AppTheme.primaryIndigo,
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: Colors.white,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white70,
          labelPadding: EdgeInsets.zero,
          labelStyle:
              const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          unselectedLabelStyle: const TextStyle(fontSize: 13),
          tabs: const [
            Tab(text: "Grievance"),
            Tab(text: "Temple"),
            Tab(text: "Train"),
            Tab(text: "Tour"),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildGrievanceTab(),
          _buildTempleVisitTab(),
          _buildTrainTab(),
          _buildTourTab(),
        ],
      ),
    );
  }

  Widget _buildTempleVisitTab() {
    if (_loadingTempleVisits) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_templeVisits.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.account_balance,
                size: 64, color: Colors.grey.shade300),
            const SizedBox(height: 16),
            Text(
              "No temple-visit grievances",
              style: TextStyle(color: Colors.grey.shade500),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _fetchTempleVisits,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _templeVisits.length,
        itemBuilder: (_, i) {
          final g = _templeVisits[i];
          final id = g['id'].toString();
          final shortId =
              id.length > 8 ? id.substring(0, 8) : id;
          final temple = (g['templeKey']?.toString() ?? '').trim();
          final status = (g['status']?.toString() ?? '').toUpperCase();

          String visitRange = '';
          try {
            final from = g['visitDateFrom']?.toString();
            final to = g['visitDateTo']?.toString();
            if (from != null && from.isNotEmpty) {
              final fromStr = DateFormat('dd MMM yyyy')
                  .format(DateTime.parse(from));
              if (to != null && to.isNotEmpty) {
                final toStr = DateFormat('dd MMM yyyy')
                    .format(DateTime.parse(to));
                visitRange = '$fromStr → $toStr';
              } else {
                visitRange = fromStr;
              }
            }
          } catch (_) {}

          final subtitleParts = <String>[
            if (temple.isNotEmpty) temple,
            if (visitRange.isNotEmpty) visitRange,
            if (g['constituency'] != null &&
                (g['constituency'] as String).isNotEmpty)
              g['constituency'].toString(),
          ];

          return _printCard(
            title: g['petitionerName']?.toString() ?? '-',
            subtitle: subtitleParts.isEmpty
                ? 'Temple visit'
                : subtitleParts.join(' • '),
            icon: Icons.account_balance,
            iconColor: AppTheme.saffronDark,
            badge: status,
            onDownload: () async {
              await _downloadPDF(
                "/api/pdf/grievance/$id/temple-visit",
                "Darshan_Letter_$shortId.pdf",
              );
              // Backend marks the grievance RESOLVED on a successful
              // download — refresh so the status badge flips.
              await _fetchTempleVisits();
            },
            onPreview: () => _previewHTML(
              "/api/pdf/grievance/$id/temple-visit/preview",
              "Darshan Letter",
            ),
          );
        },
      ),
    );
  }

  Widget _buildGrievanceTab() {
    if (_loadingGrievances) return const Center(child: CircularProgressIndicator());
    if (_verifiedGrievances.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.print_disabled, size: 64, color: Colors.grey.shade300),
            const SizedBox(height: 16),
            Text("No verified grievances to print", style: TextStyle(color: Colors.grey.shade500)),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _verifiedGrievances.length,
      itemBuilder: (_, i) {
        final g = _verifiedGrievances[i];
        return _printCard(
          title: g["petitionerName"] ?? "-",
          subtitle: "${g['grievanceType']?.toString().replaceAll('_', ' ') ?? '-'} | ${g['constituency'] ?? '-'}",
          icon: Icons.assignment,
          iconColor: Colors.indigo,
          onDownload: () => _downloadPDF("/api/pdf/grievance/${g['id']}", "grievance_${g['id'].toString().substring(0, 8)}.pdf"),
          onPreview: () => _previewHTML("/api/pdf/grievance/${g['id']}/preview", "Grievance Letter"),
        );
      },
    );
  }

  Widget _buildTrainTab() {
    if (_loadingTrainRequests) return const Center(child: CircularProgressIndicator());
    if (_approvedTrainRequests.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.print_disabled, size: 64, color: Colors.grey.shade300),
            const SizedBox(height: 16),
            Text("No train requests to print", style: TextStyle(color: Colors.grey.shade500)),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _approvedTrainRequests.length,
      itemBuilder: (_, i) {
        final r = _approvedTrainRequests[i];
        String dateStr = "";
        try { dateStr = DateFormat('dd MMM yyyy').format(DateTime.parse(r["dateOfJourney"])); } catch (_) {}

        return _printCard(
          title: "PNR: ${r['pnrNumber'] ?? '-'}",
          subtitle: "${r['trainName'] ?? ''} | $dateStr | ${r['fromStation']} -> ${r['toStation']}",
          icon: Icons.train,
          iconColor: Colors.blue,
          onDownload: () => _downloadPDF("/api/pdf/train-eq/${r['id']}", "train_eq_${r['id'].toString().substring(0, 8)}.pdf"),
          onPreview: () => _previewHTML("/api/pdf/train-eq/${r['id']}/preview", "Train EQ Letter"),
        );
      },
    );
  }

  Widget _buildTourTab() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              boxShadow: AppTheme.shadowSm,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text("Tour Program Schedule PDF",
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                Text("Generate a PDF of accepted tour programs for a date range",
                    style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: _dateButton("Start Date", _tourStartDate, () async {
                        final picked = await showDatePicker(
                          context: context,
                          initialDate: DateTime.now(),
                          firstDate: DateTime(2020),
                          lastDate: DateTime.now().add(const Duration(days: 365)),
                        );
                        if (picked != null) setState(() => _tourStartDate = picked);
                      }),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _dateButton("End Date", _tourEndDate, () async {
                        final picked = await showDatePicker(
                          context: context,
                          initialDate: DateTime.now().add(const Duration(days: 7)),
                          firstDate: DateTime(2020),
                          lastDate: DateTime.now().add(const Duration(days: 365)),
                        );
                        if (picked != null) setState(() => _tourEndDate = picked);
                      }),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  height: 48,
                  child: ElevatedButton.icon(
                    onPressed: _downloadTourProgramPDF,
                    icon: const Icon(Icons.download),
                    label: const Text("Download PDF"),
                    style: AppTheme.primaryButton(),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _dateButton(String label, DateTime? date, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          border: Border.all(color: Colors.grey.shade300),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            Icon(Icons.calendar_today, size: 16, color: Colors.grey.shade600),
            const SizedBox(width: 8),
            Text(
              date != null ? DateFormat('dd MMM yyyy').format(date) : label,
              style: TextStyle(fontSize: 13, color: date != null ? Colors.black : Colors.grey),
            ),
          ],
        ),
      ),
    );
  }

  Widget _printCard({
    required String title,
    required String subtitle,
    required IconData icon,
    required Color iconColor,
    required VoidCallback onDownload,
    required VoidCallback onPreview,
    String? badge,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: iconColor.withOpacity(0.1),
            child: Icon(icon, color: iconColor, size: 20),
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
                        title,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    if (badge != null && badge.isNotEmpty)
                      _statusPill(badge),
                  ],
                ),
                Text(
                  subtitle,
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: onPreview,
            icon: Icon(Icons.visibility, color: Colors.grey.shade600),
            tooltip: "Preview",
          ),
          IconButton(
            onPressed: onDownload,
            icon: const Icon(Icons.download, color: AppTheme.primaryIndigo),
            tooltip: "Download PDF",
          ),
        ],
      ),
    );
  }

  Widget _statusPill(String status) {
    final Color bg;
    final Color fg;
    switch (status) {
      case 'RESOLVED':
        bg = AppTheme.successGreen100;
        fg = AppTheme.successGreen;
        break;
      case 'REJECTED':
        bg = AppTheme.destructiveRed100;
        fg = AppTheme.destructiveRed;
        break;
      case 'VERIFIED':
        bg = AppTheme.primaryIndigo100;
        fg = AppTheme.primaryIndigo;
        break;
      case 'IN_PROGRESS':
        bg = AppTheme.warningAmber100;
        fg = AppTheme.saffronDark;
        break;
      case 'OPEN':
      default:
        bg = AppTheme.warningAmber50;
        fg = AppTheme.saffronDark;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        status.replaceAll('_', ' '),
        style: TextStyle(
          fontSize: 9,
          fontWeight: FontWeight.bold,
          color: fg,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}
