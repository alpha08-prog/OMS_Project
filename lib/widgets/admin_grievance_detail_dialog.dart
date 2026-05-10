import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

class AdminGrievanceDetailDialog extends StatelessWidget {
  final Map<String, dynamic> grievance;
  final VoidCallback? onVerifyAssign;
  final VoidCallback? onDownloadPdf;
  final bool downloading;

  const AdminGrievanceDetailDialog({
    super.key,
    required this.grievance,
    this.onVerifyAssign,
    this.onDownloadPdf,
    this.downloading = false,
  });

  static Future<void> show({
    required BuildContext context,
    required Map<String, dynamic> grievance,
    VoidCallback? onVerifyAssign,
    VoidCallback? onDownloadPdf,
    bool downloading = false,
  }) {
    return showDialog<void>(
      context: context,
      barrierDismissible: true,
      builder: (_) => AdminGrievanceDetailDialog(
        grievance: grievance,
        onVerifyAssign: onVerifyAssign,
        onDownloadPdf: onDownloadPdf,
        downloading: downloading,
      ),
    );
  }

  String _statusOf(Map<String, dynamic> g) =>
      (g["status"] ?? "OPEN").toString().toUpperCase();

  bool get _canVerify {
    final s = _statusOf(grievance);
    return grievance["isVerified"] != true &&
        s != "REJECTED" &&
        s != "VERIFIED";
  }

  @override
  Widget build(BuildContext context) {
    final status = _statusOf(grievance);
    final isOffice =
        (grievance["source"] ?? "PUBLIC").toString().toUpperCase() == "OFFICE";

    final petitioner = (grievance["petitionerName"] ?? "-").toString();
    final mobile = (grievance["mobileNumber"] ?? "-").toString();
    final constituency = (grievance["constituency"] ?? "-").toString();
    final type = (grievance["grievanceType"] ?? "-")
        .toString()
        .replaceAll('_', ' ');
    final monetaryRaw = grievance["monetaryValue"];
    final monetary = (monetaryRaw == null || monetaryRaw.toString().isEmpty)
        ? "N/A"
        : "₹${monetaryRaw.toString()}";
    final description = (grievance["description"] ?? "-").toString();
    final action = (grievance["actionRequired"] ?? "-").toString();
    final referencedBy = (grievance["referencedBy"] ?? "-").toString();

    final media = MediaQuery.of(context);
    final maxW = media.size.width > 700 ? 640.0 : media.size.width - 32.0;
    final maxH = media.size.height * 0.88;

    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxW, maxHeight: maxH),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 12, 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.description_outlined,
                      size: 22, color: AppTheme.foreground),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          "Grievance Details",
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: AppTheme.foreground,
                          ),
                        ),
                        SizedBox(height: 2),
                        Text(
                          "Review full grievance information before taking action",
                          style: TextStyle(
                            fontSize: 12,
                            color: Color(0xFF6B7280),
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close,
                        size: 20, color: Color(0xFF6B7280)),
                    onPressed: () => Navigator.of(context).pop(),
                    padding: EdgeInsets.zero,
                    constraints:
                        const BoxConstraints(minWidth: 32, minHeight: 32),
                  ),
                ],
              ),
            ),

            // Body
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(child: _field("Petitioner Name", petitioner)),
                        Expanded(child: _field("Mobile Number", mobile)),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(child: _field("Constituency", constituency)),
                        Expanded(
                            child: _field(
                                "Grievance Type", type.toUpperCase())),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(child: _field("Monetary Value", monetary)),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                "Status",
                                style: TextStyle(
                                    fontSize: 12, color: Color(0xFF6B7280)),
                              ),
                              const SizedBox(height: 6),
                              Row(
                                children: [
                                  _statusPill(status),
                                  if (isOffice) ...[
                                    const SizedBox(width: 6),
                                    _officeChip(),
                                  ],
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    const Text(
                      "Description",
                      style: TextStyle(
                          fontSize: 12, color: Color(0xFF6B7280)),
                    ),
                    const SizedBox(height: 6),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF3F4F6),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        description,
                        style: const TextStyle(
                            fontSize: 14, color: AppTheme.foreground),
                      ),
                    ),
                    const SizedBox(height: 16),
                    _field("Action Required", action),
                    const SizedBox(height: 16),
                    _field("Referenced By", referencedBy),
                    const SizedBox(height: 18),
                    Container(
                      height: 0.5,
                      color: const Color(0xFFE5E7EB),
                    ),
                    const SizedBox(height: 12),
                    const Row(
                      children: [
                        Icon(Icons.attach_file,
                            size: 16, color: AppTheme.foreground),
                        SizedBox(width: 6),
                        Text(
                          "Attachments",
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.bold,
                            color: AppTheme.foreground,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      "No supporting files were uploaded with this grievance.",
                      style: TextStyle(
                          fontSize: 12, color: Color(0xFF6B7280)),
                    ),
                  ],
                ),
              ),
            ),

            // Footer
            Container(
              decoration: const BoxDecoration(
                border: Border(
                  top: BorderSide(color: Color(0xFFE5E7EB), width: 0.5),
                ),
              ),
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppTheme.foreground,
                      side: const BorderSide(color: Color(0xFFD1D5DB)),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 20, vertical: 10),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                      textStyle: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    child: const Text("Close"),
                  ),
                  if (onVerifyAssign != null && _canVerify) ...[
                    const SizedBox(width: 10),
                    ElevatedButton.icon(
                      icon: const Icon(Icons.check_circle, size: 16),
                      label: const Text("Verify & Assign"),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF10B981),
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 10),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        elevation: 0,
                        textStyle:
                            const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      onPressed: () {
                        Navigator.of(context).pop();
                        onVerifyAssign!();
                      },
                    ),
                  ],
                  if (onDownloadPdf != null) ...[
                    const SizedBox(width: 10),
                    ElevatedButton.icon(
                      icon: downloading
                          ? const SizedBox(
                              width: 14,
                              height: 14,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor:
                                    AlwaysStoppedAnimation(Colors.white),
                              ),
                            )
                          : const Icon(Icons.download, size: 16),
                      label: Text(downloading ? "Downloading..." : "Download PDF"),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.primaryIndigo,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 10),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        elevation: 0,
                        textStyle:
                            const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      onPressed: downloading
                          ? null
                          : () {
                              Navigator.of(context).pop();
                              onDownloadPdf!();
                            },
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _field(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 12, color: Color(0xFF6B7280)),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.bold,
            color: AppTheme.foreground,
          ),
        ),
      ],
    );
  }

  Widget _statusPill(String status) {
    Color bg;
    Color fg;
    switch (status) {
      case "OPEN":
        bg = const Color(0xFFEEF2FF);
        fg = const Color(0xFF4338CA);
        break;
      case "IN_PROGRESS":
        bg = const Color(0xFFFFFBEB);
        fg = const Color(0xFFB45309);
        break;
      case "VERIFIED":
        bg = const Color(0xFFECFDF5);
        fg = const Color(0xFF065F46);
        break;
      case "RESOLVED":
        bg = const Color(0xFFE0F2FE);
        fg = const Color(0xFF0369A1);
        break;
      case "REJECTED":
        bg = Colors.white;
        fg = const Color(0xFF6B7280);
        break;
      default:
        bg = const Color(0xFFE5E7EB);
        fg = const Color(0xFF6B7280);
    }
    final border = status == "REJECTED"
        ? Border.all(color: const Color(0xFFD1D5DB))
        : null;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
        border: border,
      ),
      child: Text(
        status,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.bold,
          color: fg,
          letterSpacing: 0.3,
        ),
      ),
    );
  }

  Widget _officeChip() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: AppTheme.primaryIndigo,
        borderRadius: BorderRadius.circular(20),
      ),
      child: const Text(
        "Office",
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.bold,
          color: Colors.white,
        ),
      ),
    );
  }
}
