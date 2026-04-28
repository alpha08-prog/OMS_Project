import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/http_service.dart';
import '../../theme/app_theme.dart';

class TourProgramCreatePage extends StatefulWidget {
  final Future<void> Function()? onCreated;

  const TourProgramCreatePage({super.key, this.onCreated});

  @override
  State<TourProgramCreatePage> createState() => _TourProgramCreatePageState();
}

class _TourProgramCreatePageState extends State<TourProgramCreatePage> {
  final _formKey = GlobalKey<FormState>();

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

  Future<void> _pickDateTime() async {
    final date = await showDatePicker(
      context: context,
      initialDate: eventDateTime ?? DateTime.now().add(const Duration(days: 1)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (date == null || !mounted) return;

    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(eventDateTime ?? DateTime.now()),
    );
    if (time == null) return;

    setState(() {
      eventDateTime = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    });
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    if (eventDateTime == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Please select event date & time")),
      );
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
      if (footfall.isNotEmpty) body["expectedFootfall"] = int.tryParse(footfall);

      final res = await HttpService.post("/api/tour-programs", body);

      if (res.statusCode == 201 || res.statusCode == 200) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Tour program created successfully")),
        );
        if (widget.onCreated != null) await widget.onCreated!();
        Navigator.pop(context, true);
      } else {
        String msg = "Failed (${res.statusCode})";
        try {
          final data = jsonDecode(res.body);
          msg = data["message"] ?? msg;
        } catch (_) {}
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server error")),
      );
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text("New Tour Program"),
        backgroundColor: AppTheme.primaryIndigo,
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
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? "Event name is required" : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: organizerController,
                  decoration: const InputDecoration(
                    labelText: "Organizer *",
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.business),
                  ),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? "Organizer is required" : null,
                ),
                const SizedBox(height: 12),
                InkWell(
                  onTap: _pickDateTime,
                  child: InputDecorator(
                    decoration: const InputDecoration(
                      labelText: "Date & Time *",
                      border: OutlineInputBorder(),
                      suffixIcon: Icon(Icons.calendar_today),
                    ),
                    child: Text(
                      eventDateTime != null
                          ? DateFormat('dd MMM yyyy, hh:mm a').format(eventDateTime!)
                          : "Select Date & Time",
                      style: TextStyle(
                        color: eventDateTime != null ? Colors.black : Colors.grey,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _buildCard(
              title: "VENUE & CONTACT",
              children: [
                TextFormField(
                  controller: venueController,
                  decoration: const InputDecoration(
                    labelText: "Venue *",
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.location_on),
                  ),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? "Venue is required" : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: venueLinkController,
                  decoration: const InputDecoration(
                    labelText: "Venue Link (optional)",
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.link),
                  ),
                ),
                const SizedBox(height: 12),
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
                  controller: expectedFootfallController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: "Expected Footfall (optional)",
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.people),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _buildCard(
              title: "ADDITIONAL INFO",
              children: [
                TextFormField(
                  controller: descriptionController,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: "Description (optional)",
                    border: OutlineInputBorder(),
                    alignLabelWithHint: true,
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
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? "Referenced by is required" : null,
                ),
              ],
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              height: 54,
              child: ElevatedButton(
                onPressed: submitting ? null : _submit,
                style: AppTheme.primaryButton(),
                child: submitting
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Text(
                        "Submit Tour Program",
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                      ),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildCard({required String title, required List<Widget> children}) {
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
            child: Text(title,
                style: TextStyle(
                    fontSize: 13, fontWeight: FontWeight.bold, color: AppTheme.primaryIndigo)),
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
