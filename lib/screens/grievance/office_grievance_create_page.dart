import 'dart:convert';
import 'package:flutter/material.dart';

import '../../services/http_service.dart';
import '../../theme/app_theme.dart';

class OfficeGrievanceCreatePage extends StatefulWidget {
  final Future<void> Function()? onCreated;

  const OfficeGrievanceCreatePage({super.key, this.onCreated});

  @override
  State<OfficeGrievanceCreatePage> createState() => _OfficeGrievanceCreatePageState();
}

class _OfficeGrievanceCreatePageState extends State<OfficeGrievanceCreatePage> {
  final _formKey = GlobalKey<FormState>();

  final petitionerNameController = TextEditingController();
  final mobileNumberController = TextEditingController();
  final constituencyController = TextEditingController();
  final descriptionController = TextEditingController();
  final monetaryValueController = TextEditingController();
  final referencedByController = TextEditingController();
  final letterTemplateController = TextEditingController();

  String selectedGrievanceType = 'OTHER';
  String selectedActionRequired = 'NO_ACTION';

  bool submitting = false;

  final List<Map<String, String>> grievanceTypes = [
    {'value': 'WATER', 'label': 'Water'},
    {'value': 'ROAD', 'label': 'Road'},
    {'value': 'POLICE', 'label': 'Police'},
    {'value': 'HEALTH', 'label': 'Health'},
    {'value': 'TRANSFER', 'label': 'Transfer'},
    {'value': 'FINANCIAL_AID', 'label': 'Financial Aid'},
    {'value': 'ELECTRICITY', 'label': 'Electricity'},
    {'value': 'EDUCATION', 'label': 'Education'},
    {'value': 'HOUSING', 'label': 'Housing'},
    {'value': 'OTHER', 'label': 'Other'},
  ];

  final List<Map<String, String>> actionRequiredOptions = [
    {'value': 'GENERATE_LETTER', 'label': 'Generate Letter'},
    {'value': 'CALL_OFFICIAL', 'label': 'Call Official'},
    {'value': 'FORWARD_TO_DEPT', 'label': 'Forward to Department'},
    {'value': 'SCHEDULE_MEETING', 'label': 'Schedule Meeting'},
    {'value': 'NO_ACTION', 'label': 'No Action'},
  ];

  @override
  void dispose() {
    petitionerNameController.dispose();
    mobileNumberController.dispose();
    constituencyController.dispose();
    descriptionController.dispose();
    monetaryValueController.dispose();
    referencedByController.dispose();
    letterTemplateController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => submitting = true);

    try {
      final body = <String, dynamic>{
        "petitionerName": petitionerNameController.text.trim(),
        "mobileNumber": mobileNumberController.text.trim(),
        "constituency": constituencyController.text.trim(),
        "grievanceType": selectedGrievanceType,
        "description": descriptionController.text.trim(),
        "actionRequired": selectedActionRequired,
        "referencedBy": referencedByController.text.trim(),
      };

      final monetaryVal = monetaryValueController.text.trim();
      if (monetaryVal.isNotEmpty) body["monetaryValue"] = monetaryVal;

      final letterTemplate = letterTemplateController.text.trim();
      if (letterTemplate.isNotEmpty) body["letterTemplate"] = letterTemplate;

      final res = await HttpService.post("/api/grievances", body);

      if (res.statusCode == 201 || res.statusCode == 200) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Office grievance created successfully")),
        );
        if (widget.onCreated != null) await widget.onCreated!();
        Navigator.pop(context, true);
      } else {
        String msg = "Failed (${res.statusCode})";
        try { final data = jsonDecode(res.body); msg = data["message"] ?? msg; } catch (_) {}
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Server error")));
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text("Office Grievance"),
        backgroundColor: AppTheme.saffronDark,
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Office badge
            Container(
              padding: const EdgeInsets.all(12),
              margin: const EdgeInsets.only(bottom: 16),
              decoration: BoxDecoration(
                color: AppTheme.saffronSoft,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppTheme.saffron.withOpacity(0.3)),
              ),
              child: Row(
                children: [
                  Icon(Icons.business, color: AppTheme.saffronDark),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text(
                      "Internal Office Grievance - for office-level routing",
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                    ),
                  ),
                ],
              ),
            ),

            _buildCard(title: "PETITIONER DETAILS", children: [
              TextFormField(
                controller: petitionerNameController,
                decoration: const InputDecoration(labelText: "Petitioner Name *", border: OutlineInputBorder(), prefixIcon: Icon(Icons.person)),
                validator: (v) => (v == null || v.trim().isEmpty) ? "Required" : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: mobileNumberController,
                keyboardType: TextInputType.phone,
                maxLength: 10,
                decoration: const InputDecoration(labelText: "Mobile Number *", border: OutlineInputBorder(), prefixIcon: Icon(Icons.phone), counterText: ""),
                validator: (v) => (v == null || v.trim().length != 10) ? "Enter 10-digit number" : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: constituencyController,
                decoration: const InputDecoration(labelText: "Constituency *", border: OutlineInputBorder(), prefixIcon: Icon(Icons.location_on)),
                validator: (v) => (v == null || v.trim().isEmpty) ? "Required" : null,
              ),
            ]),
            const SizedBox(height: 16),

            _buildCard(title: "GRIEVANCE DETAILS", children: [
              DropdownButtonFormField<String>(
                value: selectedGrievanceType,
                decoration: const InputDecoration(labelText: "Grievance Type *", border: OutlineInputBorder(), prefixIcon: Icon(Icons.category)),
                items: grievanceTypes.map((t) => DropdownMenuItem(value: t['value'], child: Text(t['label']!))).toList(),
                onChanged: (v) => setState(() => selectedGrievanceType = v!),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: descriptionController,
                maxLines: 4,
                decoration: const InputDecoration(labelText: "Description *", border: OutlineInputBorder(), alignLabelWithHint: true),
                validator: (v) => (v == null || v.trim().isEmpty) ? "Required" : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: monetaryValueController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: "Monetary Value (optional)", border: OutlineInputBorder(), prefixIcon: Icon(Icons.currency_rupee)),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: selectedActionRequired,
                decoration: const InputDecoration(labelText: "Action Required", border: OutlineInputBorder(), prefixIcon: Icon(Icons.pending_actions)),
                items: actionRequiredOptions.map((t) => DropdownMenuItem(value: t['value'], child: Text(t['label']!))).toList(),
                onChanged: (v) => setState(() => selectedActionRequired = v!),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: letterTemplateController,
                decoration: const InputDecoration(labelText: "Letter Template (optional)", border: OutlineInputBorder(), prefixIcon: Icon(Icons.description)),
              ),
            ]),
            const SizedBox(height: 16),

            _buildCard(title: "REFERENCE", children: [
              TextFormField(
                controller: referencedByController,
                decoration: const InputDecoration(labelText: "Referenced By *", border: OutlineInputBorder(), prefixIcon: Icon(Icons.person_pin)),
                validator: (v) => (v == null || v.trim().isEmpty) ? "Required" : null,
              ),
            ]),
            const SizedBox(height: 24),

            SizedBox(
              width: double.infinity,
              height: 54,
              child: ElevatedButton(
                onPressed: submitting ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.saffronDark,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: submitting
                    ? const CircularProgressIndicator(color: Colors.white)
                    : const Text("Submit Office Grievance", style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
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
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), boxShadow: AppTheme.shadowSm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Text(title, style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: AppTheme.saffronDark)),
          ),
          Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 16), child: Column(children: children)),
        ],
      ),
    );
  }
}
