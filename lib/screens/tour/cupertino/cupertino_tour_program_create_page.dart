import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';

import '../../../services/http_service.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../widgets/cupertino/cupertino_form_helpers.dart';
import '../../../widgets/cupertino/cupertino_page_header.dart';

class CupertinoTourProgramCreatePage extends StatefulWidget {
  final String role;
  final Future<void> Function()? onCreated;

  const CupertinoTourProgramCreatePage({
    super.key,
    required this.role,
    this.onCreated,
  });

  @override
  State<CupertinoTourProgramCreatePage> createState() =>
      _CupertinoTourProgramCreatePageState();
}

class _CupertinoTourProgramCreatePageState
    extends State<CupertinoTourProgramCreatePage> {
  final eventNameController = TextEditingController();
  final organizerController = TextEditingController();
  final venueController = TextEditingController();
  final venueLinkController = TextEditingController();
  final descriptionController = TextEditingController();
  final chiefGuestController = TextEditingController();
  final contactPhoneController = TextEditingController();
  final expectedFootfallController = TextEditingController();
  final referencedByController = TextEditingController();

  DateTime? eventDateTime;
  bool submitting = false;

  // Validation errors
  String? _eventNameError;
  String? _organizerError;
  String? _venueError;
  String? _referencedByError;

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
    referencedByController.dispose();
    super.dispose();
  }

  void _pickDateTime() {
    // First pick date
    CupertinoFormHelpers.showDatePicker(
      context: context,
      initialDate:
          eventDateTime ?? DateTime.now().add(const Duration(days: 1)),
      minimumDate: DateTime.now(),
      maximumDate: DateTime.now().add(const Duration(days: 365)),
      onDateSelected: (date) {
        // Then pick time
        _pickTime(date);
      },
    );
  }

  void _pickTime(DateTime date) {
    DateTime selectedTime = eventDateTime ?? DateTime.now();

    showCupertinoModalPopup(
      context: context,
      builder: (ctx) => Container(
        height: 300,
        color: CupertinoColors.systemBackground.resolveFrom(ctx),
        child: Column(
          children: [
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  CupertinoButton(
                    padding: EdgeInsets.zero,
                    child: const Text('Cancel'),
                    onPressed: () => Navigator.pop(ctx),
                  ),
                  CupertinoButton(
                    padding: EdgeInsets.zero,
                    child: const Text('Done'),
                    onPressed: () {
                      setState(() {
                        eventDateTime = DateTime(
                          date.year,
                          date.month,
                          date.day,
                          selectedTime.hour,
                          selectedTime.minute,
                        );
                      });
                      Navigator.pop(ctx);
                    },
                  ),
                ],
              ),
            ),
            Container(height: 1, color: AppTheme.border),
            Expanded(
              child: CupertinoDatePicker(
                initialDateTime: eventDateTime ?? DateTime.now(),
                mode: CupertinoDatePickerMode.time,
                onDateTimeChanged: (dt) => selectedTime = dt,
              ),
            ),
          ],
        ),
      ),
    );
  }

  bool _validate() {
    bool valid = true;
    setState(() {
      _eventNameError = eventNameController.text.trim().isEmpty
          ? "Event name is required"
          : null;
      _organizerError = organizerController.text.trim().isEmpty
          ? "Organizer is required"
          : null;
      _venueError =
          venueController.text.trim().isEmpty ? "Venue is required" : null;
      _referencedByError = referencedByController.text.trim().isEmpty
          ? "Referenced by is required"
          : null;
    });

    if (_eventNameError != null ||
        _organizerError != null ||
        _venueError != null ||
        _referencedByError != null) {
      valid = false;
    }
    return valid;
  }

  Future<void> _submit() async {
    if (!_validate()) return;

    if (eventDateTime == null) {
      CupertinoToast.show(context, "Please select event date & time",
          isError: true);
      return;
    }

    setState(() => submitting = true);

    try {
      final body = <String, dynamic>{
        "eventName": eventNameController.text.trim(),
        "organizer": organizerController.text.trim(),
        "dateTime": eventDateTime!.toIso8601String(),
        "venue": venueController.text.trim(),
        "referencedBy": referencedByController.text.trim(),
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
        body["expectedFootfall"] = int.tryParse(footfall);
      }

      final res = await HttpService.post("/api/tour-programs", body);

      if (res.statusCode == 201 || res.statusCode == 200) {
        if (!mounted) return;
        CupertinoToast.show(
            context, "Tour program created successfully");
        if (widget.onCreated != null) await widget.onCreated!();
        Navigator.pop(context, true);
      } else {
        String msg = "Failed (${res.statusCode})";
        try {
          final data = jsonDecode(res.body);
          msg = data["message"] ?? msg;
        } catch (_) {}
        if (!mounted) return;
        CupertinoToast.show(context, msg, isError: true);
      }
    } catch (e) {
      if (!mounted) return;
      CupertinoToast.show(context, "Server error", isError: true);
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      backgroundColor: AppTheme.background,
      child: Column(
        children: [
          OmsPageHeader(title: "New Tour Program", showBack: false),
          Expanded(
            child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _buildCard(
              title: "EVENT DETAILS",
              children: [
                _buildTextField(
                  controller: eventNameController,
                  placeholder: "Event Name *",
                  prefixIcon: CupertinoIcons.calendar,
                  error: _eventNameError,
                ),
                const SizedBox(height: 12),
                _buildTextField(
                  controller: organizerController,
                  placeholder: "Organizer *",
                  prefixIcon: CupertinoIcons.building_2_fill,
                  error: _organizerError,
                ),
                const SizedBox(height: 12),
                GestureDetector(
                  onTap: _pickDateTime,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 14),
                    decoration: BoxDecoration(
                      color: AppTheme.backgroundAlt,
                      borderRadius:
                          BorderRadius.circular(AppTheme.radiusMd),
                      border: Border.all(color: AppTheme.border),
                    ),
                    child: Row(
                      children: [
                        Icon(CupertinoIcons.calendar,
                            color: AppTheme.muted, size: 20),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            eventDateTime != null
                                ? DateFormat('dd MMM yyyy, hh:mm a')
                                    .format(eventDateTime!)
                                : "Select Date & Time *",
                            style: TextStyle(
                              fontSize: 15,
                              color: eventDateTime != null
                                  ? AppTheme.foreground
                                  : CupertinoColors.systemGrey,
                            ),
                          ),
                        ),
                        const Icon(CupertinoIcons.chevron_down,
                            size: 16,
                            color: CupertinoColors.systemGrey),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _buildCard(
              title: "VENUE & CONTACT",
              children: [
                _buildTextField(
                  controller: venueController,
                  placeholder: "Venue *",
                  prefixIcon: CupertinoIcons.location,
                  error: _venueError,
                ),
                const SizedBox(height: 12),
                _buildTextField(
                  controller: venueLinkController,
                  placeholder: "Venue Link (optional)",
                  prefixIcon: CupertinoIcons.link,
                  keyboardType: TextInputType.url,
                ),
                const SizedBox(height: 12),
                _buildTextField(
                  controller: chiefGuestController,
                  placeholder: "Chief Guest (optional)",
                  prefixIcon: CupertinoIcons.star,
                ),
                const SizedBox(height: 12),
                _buildTextField(
                  controller: contactPhoneController,
                  placeholder: "Contact Phone (optional)",
                  prefixIcon: CupertinoIcons.phone,
                  keyboardType: TextInputType.phone,
                ),
                const SizedBox(height: 12),
                _buildTextField(
                  controller: expectedFootfallController,
                  placeholder: "Expected Footfall (optional)",
                  prefixIcon: CupertinoIcons.person_3,
                  keyboardType: TextInputType.number,
                ),
              ],
            ),
            const SizedBox(height: 16),
            _buildCard(
              title: "ADDITIONAL INFO",
              children: [
                CupertinoTextField(
                  controller: descriptionController,
                  maxLines: 3,
                  placeholder: "Description (optional)",
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 14),
                  decoration: BoxDecoration(
                    color: AppTheme.backgroundAlt,
                    borderRadius:
                        BorderRadius.circular(AppTheme.radiusMd),
                    border: Border.all(color: AppTheme.border),
                  ),
                  style: const TextStyle(fontSize: 15),
                ),
                const SizedBox(height: 12),
                _buildTextField(
                  controller: referencedByController,
                  placeholder: "Referenced By *",
                  prefixIcon: CupertinoIcons.person_circle,
                  error: _referencedByError,
                ),
              ],
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: CupertinoButton.filled(
                onPressed: submitting ? null : _submit,
                padding: const EdgeInsets.symmetric(vertical: 16),
                borderRadius: BorderRadius.circular(12),
                child: submitting
                    ? const CupertinoActivityIndicator(
                        color: CupertinoColors.white)
                    : const Text("Submit Tour Program",
                        style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold)),
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

  Widget _buildCard(
      {required String title, required List<Widget> children}) {
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
            child: Text(title,
                style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.primaryIndigo)),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: Column(children: children),
          ),
        ],
      ),
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String placeholder,
    IconData? prefixIcon,
    TextInputType? keyboardType,
    String? error,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CupertinoTextField(
          controller: controller,
          placeholder: placeholder,
          keyboardType: keyboardType,
          prefix: prefixIcon != null
              ? Padding(
                  padding: const EdgeInsets.only(left: 12),
                  child: Icon(prefixIcon,
                      color: AppTheme.muted, size: 20),
                )
              : null,
          padding: const EdgeInsets.symmetric(
              horizontal: 12, vertical: 14),
          decoration: BoxDecoration(
            color: AppTheme.backgroundAlt,
            borderRadius: BorderRadius.circular(AppTheme.radiusMd),
            border: Border.all(
                color: error != null
                    ? AppTheme.destructiveRed
                    : AppTheme.border),
          ),
          style: const TextStyle(fontSize: 15),
        ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 4),
            child: Text(error,
                style: const TextStyle(
                    color: AppTheme.destructiveRed, fontSize: 12)),
          ),
      ],
    );
  }
}
