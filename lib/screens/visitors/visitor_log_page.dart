import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/http_service.dart';
import '../../theme/app_theme.dart';

class VisitorLogPage extends StatefulWidget {
  const VisitorLogPage({super.key});

  @override
  State<VisitorLogPage> createState() => _VisitorLogPageState();
}

class _VisitorLogPageState extends State<VisitorLogPage> {
  final _formKey = GlobalKey<FormState>();

  final nameController = TextEditingController();
  final designationController = TextEditingController();
  final phoneController = TextEditingController();
  final purposeController = TextEditingController();
  final referencedByController = TextEditingController();
  final wardVillageController = TextEditingController();

  final FocusNode _nameFocus = FocusNode();

  String? _selectedConstituency;
  DateTime? _dob;
  bool _submitting = false;
  int _logged = 0;

  // Canonical Dharwad constituency list — AC numbers included so downstream
  // exports preserve official numbering. Must stay in sync with the deployed
  // web app (OMS_Project-main/frontend/src/lib/constituencies.ts).
  static const List<String> _constituencies = [
    'Navalagund 69',
    'Kundagol 70',
    'Dharwad 71',
    'Hubli-Dharwad East 72',
    'Hubli-Dharwad Central 73',
    'Dharwad West 74',
    'Kalaghatagi 75',
    'Shiggaon 83',
    'Out of Constituency',
  ];

  @override
  void dispose() {
    nameController.dispose();
    designationController.dispose();
    phoneController.dispose();
    purposeController.dispose();
    referencedByController.dispose();
    wardVillageController.dispose();
    _nameFocus.dispose();
    super.dispose();
  }

  Future<void> _pickDob() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _dob ?? DateTime(1990, 1, 1),
      firstDate: DateTime(1900),
      lastDate: DateTime.now(),
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.light(
              primary: AppTheme.primaryIndigo,
              onPrimary: Colors.white,
              surface: Colors.white,
              onSurface: Colors.black,
            ),
          ),
          child: child!,
        );
      },
    );
    if (picked != null) {
      setState(() => _dob = picked);
    }
  }

  void _resetForm() {
    _formKey.currentState?.reset();
    nameController.clear();
    designationController.clear();
    phoneController.clear();
    purposeController.clear();
    referencedByController.clear();
    wardVillageController.clear();
    setState(() {
      _dob = null;
      _selectedConstituency = null;
    });
    _nameFocus.requestFocus();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _submitting = true);

    try {
      final body = <String, dynamic>{
        "name": nameController.text.trim(),
        "designation": designationController.text.trim(),
        "purpose": purposeController.text.trim(),
      };

      final phone = phoneController.text.trim();
      if (phone.isNotEmpty) body["phone"] = phone;

      if (_dob != null) {
        body["dob"] = DateFormat('yyyy-MM-dd').format(_dob!);
      }

      final referencedBy = referencedByController.text.trim();
      if (referencedBy.isNotEmpty) body["referencedBy"] = referencedBy;

      if (_selectedConstituency != null && _selectedConstituency!.isNotEmpty) {
        body["constituency"] = _selectedConstituency;
      }
      final ward = wardVillageController.text.trim();
      if (ward.isNotEmpty) body["wardVillage"] = ward;

      final res = await HttpService.post("/api/visitors", body);

      if (!mounted) return;

      if (res.statusCode == 201 || res.statusCode == 200) {
        setState(() => _logged += 1);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Visitor logged successfully"),
            backgroundColor: AppTheme.successGreen,
            duration: Duration(seconds: 2),
          ),
        );
        _resetForm();
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
          "Log Visitor",
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _headerCard(),
            const SizedBox(height: 16),
            _buildCard(
              title: "VISITOR DETAILS",
              children: [
                TextFormField(
                  controller: nameController,
                  focusNode: _nameFocus,
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(
                    labelText: "Visitor Name *",
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.person),
                  ),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? "Name is required" : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: designationController,
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(
                    labelText: "Designation *",
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.badge),
                  ),
                  validator: (v) => (v == null || v.trim().isEmpty)
                      ? "Designation is required"
                      : null,
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: phoneController,
                  keyboardType: TextInputType.phone,
                  maxLength: 10,
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(
                    labelText: "Phone (optional)",
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.phone),
                    counterText: "",
                  ),
                  validator: (v) {
                    final text = v?.trim() ?? "";
                    if (text.isEmpty) return null;
                    if (text.length != 10 || int.tryParse(text) == null) {
                      return "Enter 10-digit number";
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 12),
                _dobPickerField(),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: _selectedConstituency,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: "Constituency",
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.location_on),
                  ),
                  hint: const Text("Select constituency"),
                  items: _constituencies
                      .map((c) =>
                          DropdownMenuItem(value: c, child: Text(c)))
                      .toList(),
                  onChanged: (v) => setState(() => _selectedConstituency = v),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: wardVillageController,
                  decoration: const InputDecoration(
                    labelText: "Ward / Village",
                    hintText: "Enter ward or village",
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.home_work_outlined),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _buildCard(
              title: "VISIT DETAILS",
              children: [
                TextFormField(
                  controller: purposeController,
                  maxLines: 3,
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(
                    labelText: "Purpose of Visit *",
                    border: OutlineInputBorder(),
                    alignLabelWithHint: true,
                  ),
                  validator: (v) => (v == null || v.trim().isEmpty)
                      ? "Purpose is required"
                      : null,
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
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              height: 54,
              child: ElevatedButton.icon(
                onPressed: _submitting ? null : _submit,
                style: AppTheme.primaryButton(),
                icon: _submitting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          valueColor: AlwaysStoppedAnimation(Colors.white),
                        ),
                      )
                    : const Icon(Icons.add_task, color: Colors.white),
                label: Text(
                  _submitting ? "Logging..." : "Log Visitor",
                  style: const TextStyle(
                      fontSize: 16, fontWeight: FontWeight.bold),
                ),
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: OutlinedButton.icon(
                onPressed: _submitting ? null : _resetForm,
                icon: const Icon(Icons.refresh),
                label: const Text("Clear Form"),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppTheme.primaryIndigo,
                  side: BorderSide(
                      color: AppTheme.primaryIndigo.withOpacity(0.4)),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _headerCard() {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: AppTheme.primaryGradient,
        borderRadius: BorderRadius.circular(16),
        boxShadow: AppTheme.shadowColored(AppTheme.primaryIndigo),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.2),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.how_to_reg,
                color: Colors.white, size: 26),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  "Log a new visitor",
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  _logged == 0
                      ? "Fill the details below"
                      : "$_logged visitor${_logged > 1 ? 's' : ''} logged in this session",
                  style: const TextStyle(color: Colors.white70, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _dobPickerField() {
    return InkWell(
      onTap: _pickDob,
      borderRadius: BorderRadius.circular(8),
      child: InputDecorator(
        decoration: const InputDecoration(
          labelText: "Date of Birth (optional)",
          border: OutlineInputBorder(),
          prefixIcon: Icon(Icons.cake),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                _dob != null
                    ? DateFormat('dd MMM yyyy').format(_dob!)
                    : "Tap to select",
                style: TextStyle(
                  color: _dob != null ? Colors.black87 : Colors.grey,
                ),
              ),
            ),
            if (_dob != null)
              GestureDetector(
                onTap: () => setState(() => _dob = null),
                child: const Icon(Icons.close,
                    size: 18, color: Colors.grey),
              ),
          ],
        ),
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
