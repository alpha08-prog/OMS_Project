import 'dart:convert';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';

import '../../../services/http_service.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../widgets/cupertino/cupertino_form_helpers.dart';
import '../../../widgets/cupertino/cupertino_page_header.dart';

/// Staff-only "Add Invitation" form (Cupertino). Visual-only file picker —
/// the picked file is not transmitted (backend has no upload endpoint).
class CupertinoInvitationAddPage extends StatefulWidget {
  const CupertinoInvitationAddPage({super.key});

  @override
  State<CupertinoInvitationAddPage> createState() =>
      _CupertinoInvitationAddPageState();
}

class _CupertinoInvitationAddPageState
    extends State<CupertinoInvitationAddPage> {
  final eventNameController = TextEditingController();
  final organizerController = TextEditingController();
  final venueController = TextEditingController();
  final venueLinkController = TextEditingController();
  final descriptionController = TextEditingController();
  final chiefGuestController = TextEditingController();
  final contactPhoneController = TextEditingController();
  final expectedFootfallController = TextEditingController();
  final organizerPhoneController = TextEditingController();
  final organizerEmailController = TextEditingController();
  final referencedByController = TextEditingController();

  DateTime? _eventDateTime;
  PlatformFile? _pickedFile;
  bool _submitting = false;

  String? _eventNameError;
  String? _organizerError;
  String? _venueError;
  String? _referencedByError;

  static const int _maxFileBytes = 10 * 1024 * 1024;
  static const List<String> _allowedExtensions = ['pdf', 'png', 'jpg', 'jpeg'];

  @override
  void dispose() {
    eventNameController.dispose();
    organizerController.dispose();
    venueController.dispose();
    venueLinkController.dispose();
    descriptionController.dispose();
    chiefGuestController.dispose();
    contactPhoneController.dispose();
    expectedFootfallController.dispose();
    organizerPhoneController.dispose();
    organizerEmailController.dispose();
    referencedByController.dispose();
    super.dispose();
  }

  bool _validate() {
    bool ok = true;
    _eventNameError =
        eventNameController.text.trim().isEmpty ? "Event name is required" : null;
    if (_eventNameError != null) ok = false;

    _organizerError =
        organizerController.text.trim().isEmpty ? "Organizer is required" : null;
    if (_organizerError != null) ok = false;

    _venueError =
        venueController.text.trim().isEmpty ? "Venue is required" : null;
    if (_venueError != null) ok = false;

    _referencedByError = referencedByController.text.trim().isEmpty
        ? "Referenced By is required"
        : null;
    if (_referencedByError != null) ok = false;

    setState(() {});
    return ok;
  }

  void _pickDateTime() {
    CupertinoFormHelpers.showDatePicker(
      context: context,
      initialDate:
          _eventDateTime ?? DateTime.now().add(const Duration(days: 1)),
      minimumDate: DateTime.now(),
      maximumDate: DateTime.now().add(const Duration(days: 365)),
      onDateSelected: (d) => setState(() => _eventDateTime = d),
    );
  }

  Future<void> _pickFile() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: _allowedExtensions,
      );

      if (result == null || result.files.isEmpty) return;

      final file = result.files.single;
      if (file.size > _maxFileBytes) {
        if (!mounted) return;
        CupertinoToast.show(context, "File too large. Max 10 MB.",
            isError: true);
        return;
      }

      setState(() => _pickedFile = file);
    } catch (_) {
      if (!mounted) return;
      CupertinoToast.show(context, "Could not pick file", isError: true);
    }
  }

  void _removeFile() {
    setState(() => _pickedFile = null);
  }

  String _formatBytes(int bytes) {
    if (bytes < 1024) return "$bytes B";
    if (bytes < 1024 * 1024) return "${(bytes / 1024).toStringAsFixed(1)} KB";
    return "${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB";
  }

  Future<void> _submit() async {
    if (!_validate()) return;
    if (_eventDateTime == null) {
      CupertinoToast.show(context, "Please select event date & time",
          isError: true);
      return;
    }

    setState(() => _submitting = true);

    try {
      final body = <String, dynamic>{
        "eventName": eventNameController.text.trim(),
        "organizer": organizerController.text.trim(),
        "dateTime": _eventDateTime!.toIso8601String(),
        "venue": venueController.text.trim(),
      };

      final venueLink = venueLinkController.text.trim();
      if (venueLink.isNotEmpty) body["venueLink"] = venueLink;

      final desc = descriptionController.text.trim();
      if (desc.isNotEmpty) body["description"] = desc;

      final chiefGuest = chiefGuestController.text.trim();
      if (chiefGuest.isNotEmpty) body["chiefGuest"] = chiefGuest;

      final contactPhone = contactPhoneController.text.trim();
      if (contactPhone.isNotEmpty) body["contactPhone"] = contactPhone;

      final footfall = expectedFootfallController.text.trim();
      if (footfall.isNotEmpty) {
        final parsed = int.tryParse(footfall);
        if (parsed != null) body["expectedFootfall"] = parsed;
      }

      final organizerPhone = organizerPhoneController.text.trim();
      if (organizerPhone.isNotEmpty) body["organizerPhone"] = organizerPhone;

      final organizerEmail = organizerEmailController.text.trim();
      if (organizerEmail.isNotEmpty) body["organizerEmail"] = organizerEmail;

      final referencedBy = referencedByController.text.trim();
      if (referencedBy.isNotEmpty) body["referencedBy"] = referencedBy;

      final res = await HttpService.post("/api/tour-programs", body);

      if (!mounted) return;
      if (res.statusCode == 201 || res.statusCode == 200) {
        CupertinoToast.show(context, "Invitation submitted successfully");
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
    return CupertinoPageScaffold(
      backgroundColor: AppTheme.background,
      child: Column(
        children: [
          OmsPageHeader(title: "Add Invitation"),
          Expanded(
            child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _buildCard(
              title: "EVENT DETAILS",
              children: [
                _textField(
                  controller: eventNameController,
                  placeholder: "Event Name *",
                  prefixIcon: CupertinoIcons.calendar_badge_plus,
                  error: _eventNameError,
                ),
                const SizedBox(height: 12),
                _textField(
                  controller: organizerController,
                  placeholder: "Organizer *",
                  prefixIcon: CupertinoIcons.briefcase,
                  error: _organizerError,
                ),
                const SizedBox(height: 12),
                _dateTimeField(),
                const SizedBox(height: 12),
                _textField(
                  controller: venueController,
                  placeholder: "Venue *",
                  prefixIcon: CupertinoIcons.location,
                  error: _venueError,
                ),
                const SizedBox(height: 12),
                _textField(
                  controller: venueLinkController,
                  placeholder: "Venue Link (Maps URL, optional)",
                  prefixIcon: CupertinoIcons.link,
                  keyboardType: TextInputType.url,
                ),
                const SizedBox(height: 12),
                _textField(
                  controller: descriptionController,
                  placeholder: "Description (optional)",
                  maxLines: 3,
                ),
              ],
            ),
            const SizedBox(height: 16),
            _buildCard(
              title: "ORGANIZER & EVENT EXTRAS",
              children: [
                _textField(
                  controller: chiefGuestController,
                  placeholder: "Chief Guest (optional)",
                  prefixIcon: CupertinoIcons.star,
                ),
                const SizedBox(height: 12),
                _textField(
                  controller: expectedFootfallController,
                  placeholder: "Expected Footfall (optional)",
                  prefixIcon: CupertinoIcons.person_3,
                  keyboardType: TextInputType.number,
                ),
                const SizedBox(height: 12),
                _textField(
                  controller: contactPhoneController,
                  placeholder: "Contact Phone (optional)",
                  prefixIcon: CupertinoIcons.phone,
                  keyboardType: TextInputType.phone,
                ),
                const SizedBox(height: 12),
                _textField(
                  controller: organizerPhoneController,
                  placeholder: "Organizer Phone (optional)",
                  prefixIcon: CupertinoIcons.phone_circle,
                  keyboardType: TextInputType.phone,
                ),
                const SizedBox(height: 12),
                _textField(
                  controller: organizerEmailController,
                  placeholder: "Organizer Email (optional)",
                  prefixIcon: CupertinoIcons.mail,
                  keyboardType: TextInputType.emailAddress,
                ),
                const SizedBox(height: 12),
                _textField(
                  controller: referencedByController,
                  placeholder: "Referenced By *",
                  prefixIcon: CupertinoIcons.person_2,
                  error: _referencedByError,
                ),
              ],
            ),
            const SizedBox(height: 16),
            _buildUploadZoneCard(),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: CupertinoButton.filled(
                onPressed: _submitting ? null : _submit,
                padding: const EdgeInsets.symmetric(vertical: 16),
                borderRadius: BorderRadius.circular(12),
                child: _submitting
                    ? const CupertinoActivityIndicator(
                        color: CupertinoColors.white)
                    : const Text(
                        "Submit Invitation",
                        style: TextStyle(
                            fontSize: 16, fontWeight: FontWeight.bold),
                      ),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
          ),
        ],
      ),
    );
  }

  Widget _textField({
    required TextEditingController controller,
    required String placeholder,
    IconData? prefixIcon,
    TextInputType? keyboardType,
    int maxLines = 1,
    int? maxLength,
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
          maxLength: maxLength,
          prefix: prefixIcon != null
              ? Padding(
                  padding: const EdgeInsets.only(left: 12),
                  child: Icon(prefixIcon,
                      color: CupertinoColors.systemGrey, size: 20),
                )
              : null,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: CupertinoColors.systemGrey6,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: error != null
                  ? CupertinoColors.destructiveRed
                  : CupertinoColors.systemGrey4,
            ),
          ),
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

  Widget _dateTimeField() {
    return GestureDetector(
      onTap: _pickDateTime,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        decoration: BoxDecoration(
          color: CupertinoColors.systemGrey6,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: CupertinoColors.systemGrey4),
        ),
        child: Row(
          children: [
            const Icon(CupertinoIcons.calendar,
                color: CupertinoColors.systemGrey, size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    "Event Date & Time *",
                    style: TextStyle(
                      fontSize: 11,
                      color: CupertinoColors.systemGrey,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _eventDateTime != null
                        ? DateFormat('dd MMM yyyy · hh:mm a')
                            .format(_eventDateTime!)
                        : "Tap to select",
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
                      color: _eventDateTime != null
                          ? CupertinoColors.black
                          : CupertinoColors.systemGrey,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildUploadZoneCard() {
    return Container(
      decoration: BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Text(
              "INVITATION DOCUMENT",
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.bold,
                color: AppTheme.primaryIndigo,
                letterSpacing: 0.5,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: _pickedFile == null
                ? _buildUploadZone()
                : _buildPickedFilePreview(),
          ),
        ],
      ),
    );
  }

  Widget _buildUploadZone() {
    return GestureDetector(
      onTap: _pickFile,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 16),
        decoration: BoxDecoration(
          color: AppTheme.primaryIndigo50,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: AppTheme.primaryIndigo.withOpacity(0.4),
            width: 1.5,
          ),
        ),
        child: const Column(
          children: [
            Icon(
              CupertinoIcons.cloud_upload,
              size: 32,
              color: AppTheme.primaryIndigo,
            ),
            SizedBox(height: 10),
            Text(
              "Upload invitation card or letter",
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppTheme.primaryIndigo,
              ),
            ),
            SizedBox(height: 4),
            Text(
              "PNG, JPG, PDF up to 10MB",
              style: TextStyle(
                fontSize: 12,
                color: CupertinoColors.systemGrey,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPickedFilePreview() {
    final file = _pickedFile!;
    final ext = (file.extension ?? '').toLowerCase();
    final isPdf = ext == 'pdf';

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.primaryIndigo50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.primaryIndigo.withOpacity(0.4)),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: CupertinoColors.white,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(
              isPdf
                  ? CupertinoIcons.doc_richtext
                  : CupertinoIcons.photo,
              color: AppTheme.primaryIndigo,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  file.name,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.foreground,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  _formatBytes(file.size),
                  style: const TextStyle(
                    fontSize: 11,
                    color: CupertinoColors.systemGrey,
                  ),
                ),
              ],
            ),
          ),
          CupertinoButton(
            padding: EdgeInsets.zero,
            onPressed: _removeFile,
            child: const Icon(CupertinoIcons.clear_circled_solid,
                size: 22, color: CupertinoColors.systemGrey),
          ),
        ],
      ),
    );
  }

  Widget _buildCard({
    required String title,
    required List<Widget> children,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Text(
              title,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.bold,
                color: AppTheme.primaryIndigo,
                letterSpacing: 0.5,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Column(children: children),
          ),
        ],
      ),
    );
  }
}
