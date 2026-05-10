import 'dart:convert';
import 'dart:io';
import 'package:flutter/cupertino.dart';
import 'package:flutter_html/flutter_html.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:open_filex/open_filex.dart';

import '../../../services/http_service.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../widgets/cupertino/cupertino_form_helpers.dart';

class CupertinoPrintCenterPage extends StatefulWidget {
  const CupertinoPrintCenterPage({super.key});

  @override
  State<CupertinoPrintCenterPage> createState() =>
      _CupertinoPrintCenterPageState();
}

class _CupertinoPrintCenterPageState extends State<CupertinoPrintCenterPage> {
  int _selectedSegment = 0;

  bool _loadingGrievances = true;
  bool _loadingTrainRequests = true;

  List<Map<String, dynamic>> _verifiedGrievances = [];
  List<Map<String, dynamic>> _approvedTrainRequests = [];

  DateTime? _tourStartDate;
  DateTime? _tourEndDate;

  @override
  void initState() {
    super.initState();
    _fetchGrievances();
    _fetchTrainRequests();
  }

  Future<void> _fetchGrievances() async {
    setState(() => _loadingGrievances = true);
    try {
      final res =
          await HttpService.get("/api/grievances?status=VERIFIED&limit=100");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list = decoded is List ? decoded : (decoded["data"] ?? []);
        _verifiedGrievances = list
            .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
            .toList();
      }
    } catch (_) {}
    if (mounted) setState(() => _loadingGrievances = false);
  }

  Future<void> _fetchTrainRequests() async {
    setState(() => _loadingTrainRequests = true);
    try {
      final res = await HttpService.get("/api/train-requests?limit=100");
      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final List list = decoded is List ? decoded : (decoded["data"] ?? []);
        _approvedTrainRequests = list
            .map<Map<String, dynamic>>((e) => Map<String, dynamic>.from(e))
            .toList();
      }
    } catch (_) {}
    if (mounted) setState(() => _loadingTrainRequests = false);
  }

  Future<void> _downloadPDF(String endpoint, String filename) async {
    try {
      if (mounted) CupertinoToast.show(context, "Downloading PDF...");

      final res = await HttpService.downloadFile(endpoint);

      if (res.statusCode == 200) {
        final dir = await getApplicationDocumentsDirectory();
        final file = File('${dir.path}/$filename');
        await file.writeAsBytes(res.bodyBytes);

        if (mounted) {
          CupertinoToast.show(context, "PDF saved: $filename");
          // Attempt to open after short delay
          Future.delayed(const Duration(milliseconds: 500), () {
            OpenFilex.open(file.path);
          });
        }
      } else {
        if (mounted) {
          CupertinoToast.show(
              context, "Download failed (${res.statusCode})",
              isError: true);
        }
      }
    } catch (_) {
      if (mounted) {
        CupertinoToast.show(context, "Download failed. Please try again.", isError: true);
      }
    }
  }

  Future<void> _previewHTML(String endpoint, String title) async {
    try {
      final res = await HttpService.get(endpoint);
      if (res.statusCode != 200) {
        if (mounted) {
          CupertinoToast.show(context, "Preview failed (${res.statusCode})",
              isError: true);
        }
        return;
      }
      if (!mounted) return;

      showCupertinoDialog(
        context: context,
        builder: (ctx) => CupertinoPageScaffold(
          backgroundColor: AppTheme.background,
          navigationBar: CupertinoNavigationBar(
            middle: Text(title),
            backgroundColor: AppTheme.primaryIndigo,
            brightness: Brightness.dark,
            leading: CupertinoButton(
              padding: EdgeInsets.zero,
              onPressed: () => Navigator.pop(ctx),
              child: const Icon(CupertinoIcons.xmark,
                  color: CupertinoColors.white),
            ),
          ),
          child: SafeArea(
            child: Container(
              color: CupertinoColors.white,
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Html(data: res.body),
              ),
            ),
          ),
        ),
      );
    } catch (_) {
      if (mounted) {
        CupertinoToast.show(context, "Preview failed. Please try again.",
            isError: true);
      }
    }
  }

  Future<void> _downloadTourProgramPDF() async {
    String query = "";
    if (_tourStartDate != null && _tourEndDate != null) {
      query =
          "?startDate=${_tourStartDate!.toIso8601String()}&endDate=${_tourEndDate!.toIso8601String()}";
    }
    await _downloadPDF(
        "/api/pdf/tour-program$query", "tour_program_schedule.pdf");
  }

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      backgroundColor: AppTheme.background,
      navigationBar: CupertinoNavigationBar(
        middle: const Text("Print Center"),
        backgroundColor: AppTheme.primaryIndigo,
        brightness: Brightness.dark,
      ),
      child: SafeArea(
        child: Column(
          children: [
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: CupertinoSlidingSegmentedControl<int>(
                groupValue: _selectedSegment,
                children: const {
                  0: Padding(
                    padding: EdgeInsets.symmetric(horizontal: 8),
                    child: Text("Grievances", style: TextStyle(fontSize: 13)),
                  ),
                  1: Padding(
                    padding: EdgeInsets.symmetric(horizontal: 8),
                    child: Text("Train EQ", style: TextStyle(fontSize: 13)),
                  ),
                  2: Padding(
                    padding: EdgeInsets.symmetric(horizontal: 8),
                    child:
                        Text("Tour Program", style: TextStyle(fontSize: 13)),
                  ),
                },
                onValueChanged: (value) {
                  if (value != null) {
                    setState(() => _selectedSegment = value);
                  }
                },
              ),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: _selectedSegment == 0
                  ? _buildGrievanceTab()
                  : _selectedSegment == 1
                      ? _buildTrainTab()
                      : _buildTourTab(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGrievanceTab() {
    if (_loadingGrievances) {
      return const Center(child: CupertinoActivityIndicator());
    }
    if (_verifiedGrievances.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(CupertinoIcons.printer,
                size: 64, color: CupertinoColors.systemGrey4),
            const SizedBox(height: 16),
            Text("No verified grievances to print",
                style: TextStyle(color: CupertinoColors.systemGrey)),
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
          subtitle:
              "${g['grievanceType']?.toString().replaceAll('_', ' ') ?? '-'} | ${g['constituency'] ?? '-'}",
          icon: CupertinoIcons.doc_text,
          iconColor: AppTheme.primaryIndigo,
          onDownload: () => _downloadPDF(
              "/api/pdf/grievance/${g['id']}",
              "grievance_${g['id'].toString().substring(0, 8)}.pdf"),
          onPreview: () => _previewHTML(
              "/api/pdf/grievance/${g['id']}/preview", "Grievance Letter"),
        );
      },
    );
  }

  Widget _buildTrainTab() {
    if (_loadingTrainRequests) {
      return const Center(child: CupertinoActivityIndicator());
    }
    if (_approvedTrainRequests.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(CupertinoIcons.printer,
                size: 64, color: CupertinoColors.systemGrey4),
            const SizedBox(height: 16),
            Text("No train requests to print",
                style: TextStyle(color: CupertinoColors.systemGrey)),
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
        try {
          dateStr = DateFormat('dd MMM yyyy')
              .format(DateTime.parse(r["dateOfJourney"]));
        } catch (_) {}

        return _printCard(
          title: "PNR: ${r['pnrNumber'] ?? '-'}",
          subtitle:
              "${r['trainName'] ?? ''} | $dateStr | ${r['fromStation']} -> ${r['toStation']}",
          icon: CupertinoIcons.bus,
          iconColor: CupertinoColors.activeBlue,
          onDownload: () => _downloadPDF(
              "/api/pdf/train-eq/${r['id']}",
              "train_eq_${r['id'].toString().substring(0, 8)}.pdf"),
          onPreview: () => _previewHTML(
              "/api/pdf/train-eq/${r['id']}/preview", "Train EQ Letter"),
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
              color: CupertinoColors.white,
              borderRadius: BorderRadius.circular(12),
              boxShadow: AppTheme.shadowSm,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text("Tour Program Schedule PDF",
                    style:
                        TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                Text(
                    "Generate a PDF of accepted tour programs for a date range",
                    style: TextStyle(
                        fontSize: 13, color: CupertinoColors.systemGrey)),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: _dateButton("Start Date", _tourStartDate, () {
                        CupertinoFormHelpers.showDatePicker(
                          context: context,
                          initialDate: DateTime.now(),
                          minimumDate: DateTime(2020),
                          maximumDate:
                              DateTime.now().add(const Duration(days: 365)),
                          onDateSelected: (picked) =>
                              setState(() => _tourStartDate = picked),
                        );
                      }),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _dateButton("End Date", _tourEndDate, () {
                        CupertinoFormHelpers.showDatePicker(
                          context: context,
                          initialDate:
                              DateTime.now().add(const Duration(days: 7)),
                          minimumDate: DateTime(2020),
                          maximumDate:
                              DateTime.now().add(const Duration(days: 365)),
                          onDateSelected: (picked) =>
                              setState(() => _tourEndDate = picked),
                        );
                      }),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: CupertinoButton.filled(
                    onPressed: _downloadTourProgramPDF,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: const [
                        Icon(CupertinoIcons.arrow_down_doc,
                            color: CupertinoColors.white),
                        SizedBox(width: 8),
                        Text("Download PDF",
                            style: TextStyle(fontWeight: FontWeight.w600)),
                      ],
                    ),
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
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          border: Border.all(color: AppTheme.border),
          borderRadius: BorderRadius.circular(8),
          color: AppTheme.backgroundAlt,
        ),
        child: Row(
          children: [
            Icon(CupertinoIcons.calendar,
                size: 16, color: CupertinoColors.systemGrey),
            const SizedBox(width: 8),
            Text(
              date != null ? DateFormat('dd MMM yyyy').format(date) : label,
              style: TextStyle(
                  fontSize: 13,
                  color:
                      date != null ? AppTheme.foreground : AppTheme.muted),
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
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: iconColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Icon(icon, color: iconColor, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: const TextStyle(
                        fontSize: 14, fontWeight: FontWeight.bold)),
                Text(subtitle,
                    style: TextStyle(
                        fontSize: 12, color: CupertinoColors.systemGrey),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          CupertinoButton(
            padding: const EdgeInsets.all(8),
            onPressed: onPreview,
            child:
                Icon(CupertinoIcons.eye, color: CupertinoColors.systemGrey),
          ),
          CupertinoButton(
            padding: const EdgeInsets.all(8),
            onPressed: onDownload,
            child: const Icon(CupertinoIcons.arrow_down_doc,
                color: AppTheme.primaryIndigo),
          ),
        ],
      ),
    );
  }
}
