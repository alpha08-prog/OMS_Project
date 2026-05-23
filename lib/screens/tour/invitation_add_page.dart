import 'dart:convert';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/http_service.dart';
import '../../theme/app_theme.dart';

/// Staff-only "Add Invitation" form. Creates a TourProgram on the backend.
///
/// Includes a visual-only "Invitation Document" upload zone — the file is
/// picked locally and shown in the form, but is not transmitted (backend has
/// no upload endpoint and TourProgram has no document column).
class InvitationAddPage extends StatefulWidget {
  const InvitationAddPage({super.key});

  @override
  State<InvitationAddPage> createState() => _InvitationAddPageState();
}

class _InvitationAddPageState extends State<InvitationAddPage> {
  final _formKey = GlobalKey<FormState>();

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

  static const int _maxFileBytes = 10 * 1024 * 1024; // 10 MB
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

  Future<void> _pickDateTime() async {
    final date = await showDatePicker(
      context: context,
      initialDate:
          _eventDateTime ?? DateTime.now().add(const Duration(days: 1)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.light(
              primary: AppTheme.primaryIndigo,
              onPrimary: Colors.white,
            ),
          ),
          child: child!,
        );
      },
    );
    if (date == null || !mounted) return;

    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_eventDateTime ?? DateTime.now()),
    );
    if (time == null) return;

    setState(() {
      _eventDateTime =
          DateTime(date.year, date.month, date.day, time.hour, time.minute);
    });
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
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("File too large. Max 10 MB."),
          ),
        );
        return;
      }

      setState(() => _pickedFile = file);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Could not pick file")),
      );
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
    if (!_formKey.currentState!.validate()) return;

    if (_eventDateTime == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Please select event date & time")),
      );
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
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Invitation submitted successfully"),
            backgroundColor: AppTheme.successGreen,
            duration: Duration(seconds: 2),
          ),
        );
        Navigator.pop(context, true);
      } else {
        String msg = "Failed (${res.statusCode})";
        try {
          final data = jsonDecode(res.body);
          msg = data["message"] ?? msg;
        } catch (_) {}
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server error / No internet")),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        backgroundColor: AppTheme.primaryIndigo,
        title: const Text(
          "Add Invitation",
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _buildCard(
              title: "EVENT DETAILS",
              children: [
                TextFormField(
                  controller: eventNameController,
                  decoration: const InputDecoration(
                    labelText: "Event Name *",
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.event),
                  ),
                  validator: (v) => (v == null || v.trim().isEmpty)
                      ? "Event name is required"
                      : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: organizerController,
                  decoration: const InputDecoration(
                    labelText: "Organizer *",
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.business_center),
                  ),
                  validator: (v) => (v == null || v.trim().isEmpty)
                      ? "Organizer is required"
                      : null,
                ),
                const SizedBox(height: 12),
                InkWell(
                  onTap: _pickDateTime,
                  borderRadius: BorderRadius.circular(8),
                  child: InputDecorator(
                    decoration: const InputDecoration(
                      labelText: "Event Date & Time *",
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.calendar_today),
                    ),
                    child: Text(
                      _eventDateTime != null
                          ? DateFormat('dd MMM yyyy · hh:mm a')
                              .format(_eventDateTime!)
                          : "Tap to select",
                      style: TextStyle(
                        color: _eventDateTime != null
                            ? Colors.black87
                            : Colors.grey,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: venueController,
                  decoration: const InputDecoration(
                    labelText: "Venue *",
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.location_on),
                  ),
                  validator: (v) => (v == null || v.trim().isEmpty)
                      ? "Venue is required"
                      : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: venueLinkController,
                  keyboardType: TextInputType.url,
                  decoration: const InputDecoration(
                    labelText: "Venue Link (Maps URL, optional)",
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.link),
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: descriptionController,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: "Description (optional)",
                    border: OutlineInputBorder(),
                    alignLabelWithHint: true,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _buildCard(
              title: "ORGANIZER & EVENT EXTRAS",
              children: [
                TextFormField(
                  controller: chiefGuestController,
                  decoration: const InputDecoration(
                    labelText: "Chief Guest (optional)",
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.star),
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: expectedFootfallController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: "Expected Footfall (optional)",
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.groups),
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: contactPhoneController,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                    labelText: "Contact Phone (optional)",
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.phone),
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: organizerPhoneController,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                    labelText: "Organizer Phone (optional)",
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.contact_phone),
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: organizerEmailController,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                    labelText: "Organizer Email (optional)",
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.alternate_email),
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: referencedByController,
                  decoration: const InputDecoration(
                    labelText: "Referenced By *",
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.person_pin),
                  ),
                  validator: (v) => (v == null || v.trim().isEmpty)
                      ? "Referenced By is required"
                      : null,
                ),
              ],
            ),
            const SizedBox(height: 16),
            _buildUploadZoneCard(),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              height: 54,
              child: ElevatedButton(
                onPressed: _submitting ? null : _submit,
                style: AppTheme.primaryButton(),
                child: _submitting
                    ? const CircularProgressIndicator(color: Colors.white)
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
    );
  }

  Widget _buildUploadZoneCard() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: AppTheme.shadowSm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
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
    return InkWell(
      onTap: _pickFile,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 16),
        decoration: BoxDecoration(
          color: AppTheme.primaryIndigo50,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: AppTheme.primaryIndigo.withOpacity(0.4),
            width: 1.5,
            style: BorderStyle.solid,
          ),
        ),
        child: Column(
          children: [
            Icon(
              Icons.cloud_upload_outlined,
              size: 32,
              color: AppTheme.primaryIndigo,
            ),
            const SizedBox(height: 10),
            const Text(
              "Upload invitation card or letter",
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppTheme.primaryIndigo,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              "PNG, JPG, PDF up to 10MB",
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey.shade600,
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
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(
              isPdf ? Icons.picture_as_pdf : Icons.image,
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
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.grey.shade600,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: _removeFile,
            icon: const Icon(Icons.close, size: 20),
            tooltip: "Remove",
            color: Colors.grey.shade600,
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
        color: Colors.white,
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
