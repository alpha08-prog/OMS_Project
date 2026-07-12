import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/http_service.dart';
import '../../theme/app_theme.dart';

/// Combined "Add Visitor / Birthday" form — mirrors the web `/people/new`
/// screen. Logs a person via POST /api/visitors; if a date of birth is given
/// the backend auto-tracks it under View Birthdays + the dashboard. The
/// "This person is an official" toggle marks the birthday as Official.
class PeopleAddPage extends StatefulWidget {
  const PeopleAddPage({super.key});

  @override
  State<PeopleAddPage> createState() => _PeopleAddPageState();
}

class _PeopleAddPageState extends State<PeopleAddPage> {
  final _formKey = GlobalKey<FormState>();

  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _ward = TextEditingController();
  final _referencedBy = TextEditingController();
  final _purpose = TextEditingController();

  String? _designation;
  String? _constituency;
  DateTime? _dob;
  bool _isOfficial = false;
  bool _submitting = false;

  // Matches the web "Designation / Relation" dropdown exactly.
  static const List<String> _designations = [
    'Party Worker',
    'Official',
    'Public',
    'Business',
    'Media',
    'Family',
    'VIP',
    'Supporter',
    'Other',
  ];

  // Canonical Dharwad constituency list (AC numbers included).
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
    _name.dispose();
    _phone.dispose();
    _ward.dispose();
    _referencedBy.dispose();
    _purpose.dispose();
    super.dispose();
  }

  Future<void> _pickDob() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _dob ?? DateTime(1990, 1, 1),
      firstDate: DateTime(1900),
      lastDate: DateTime.now(),
      builder: (context, child) => Theme(
        data: Theme.of(context).copyWith(
          colorScheme: const ColorScheme.light(
            primary: AppTheme.primaryIndigo,
            onPrimary: Colors.white,
            surface: Colors.white,
            onSurface: Colors.black,
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null) setState(() => _dob = picked);
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _submitting = true);
    try {
      final body = <String, dynamic>{
        'name': _name.text.trim(),
        'designation': _designation ?? '',
        'purpose': _purpose.text.trim(),
        'isOfficial': _isOfficial,
      };
      final phone = _phone.text.trim();
      if (phone.isNotEmpty) body['phone'] = phone;
      if (_dob != null) body['dob'] = DateFormat('yyyy-MM-dd').format(_dob!);
      final ref = _referencedBy.text.trim();
      if (ref.isNotEmpty) body['referencedBy'] = ref;
      if (_constituency != null && _constituency!.isNotEmpty) {
        body['constituency'] = _constituency;
      }
      final ward = _ward.text.trim();
      if (ward.isNotEmpty) body['wardVillage'] = ward;

      final res = await HttpService.post('/api/visitors', body);
      if (!mounted) return;
      if (res.statusCode == 200 || res.statusCode == 201) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Saved successfully'),
            backgroundColor: AppTheme.successGreen,
          ),
        );
        Navigator.pop(context, true);
      } else {
        String msg = 'Failed (${res.statusCode})';
        try {
          msg = jsonDecode(res.body)['message'] ?? msg;
        } catch (_) {}
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(msg)));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Server error / No internet')),
        );
      }
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
        iconTheme: const IconThemeData(color: Colors.white),
        title: const Text('Add Visitor / Birthday',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Padding(
              padding: const EdgeInsets.only(bottom: 12, left: 4, right: 4),
              child: Text(
                "Log a person's details. If you enter a date of birth, it's "
                'automatically tracked in View Birthdays and the dashboard.',
                style: TextStyle(fontSize: 13, color: Colors.grey.shade600),
              ),
            ),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                boxShadow: AppTheme.shadowSm,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Person Details',
                      style: TextStyle(
                          fontSize: 16, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _name,
                    decoration: const InputDecoration(
                      labelText: 'Name *',
                      hintText: 'Full name',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.person),
                    ),
                    validator: (v) =>
                        (v == null || v.trim().isEmpty) ? 'Name is required' : null,
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    value: _designation,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Designation / Relation *',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.badge),
                    ),
                    hint: const Text('Select designation / relation'),
                    items: _designations
                        .map((d) => DropdownMenuItem(value: d, child: Text(d)))
                        .toList(),
                    onChanged: (v) => setState(() => _designation = v),
                    validator: (v) =>
                        (v == null || v.isEmpty) ? 'Required' : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _phone,
                    keyboardType: TextInputType.phone,
                    maxLength: 10,
                    decoration: const InputDecoration(
                      labelText: 'Phone Number',
                      hintText: '10-digit mobile number',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.phone),
                      counterText: '',
                    ),
                    validator: (v) {
                      final t = v?.trim() ?? '';
                      if (t.isEmpty) return null;
                      if (t.length != 10 || int.tryParse(t) == null) {
                        return 'Enter 10-digit number';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 12),
                  InkWell(
                    onTap: _pickDob,
                    child: InputDecorator(
                      decoration: const InputDecoration(
                        labelText: 'Date of Birth',
                        border: OutlineInputBorder(),
                        prefixIcon: Icon(Icons.cake),
                        helperText:
                            'Shows up in View Birthdays & the dashboard popup.',
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              _dob != null
                                  ? DateFormat('dd MMM yyyy').format(_dob!)
                                  : 'dd-mm-yyyy',
                              style: TextStyle(
                                  color: _dob != null
                                      ? Colors.black87
                                      : Colors.grey),
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
                  ),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppTheme.primaryIndigo50,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Checkbox(
                          value: _isOfficial,
                          activeColor: AppTheme.primaryIndigo,
                          onChanged: (v) =>
                              setState(() => _isOfficial = v ?? false),
                        ),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const SizedBox(height: 10),
                              const Text('This person is an official',
                                  style:
                                      TextStyle(fontWeight: FontWeight.w600)),
                              const SizedBox(height: 2),
                              Text(
                                "Tick if they're already a serving official — "
                                'their birthday is then marked as "Official". '
                                'Leave unchecked for a normal visitor.',
                                style: TextStyle(
                                    fontSize: 12, color: Colors.grey.shade600),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    value: _constituency,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Constituency',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.location_on),
                    ),
                    hint: const Text('Select constituency'),
                    items: _constituencies
                        .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                        .toList(),
                    onChanged: (v) => setState(() => _constituency = v),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _ward,
                    decoration: const InputDecoration(
                      labelText: 'Ward / Village',
                      hintText: 'Enter ward or village',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.home_work_outlined),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _referencedBy,
                    decoration: const InputDecoration(
                      labelText: 'Referenced By',
                      hintText: 'Eg: Local Leader, Office Staff',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.person_pin),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _purpose,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      labelText: 'Purpose / Notes *',
                      hintText: 'Purpose of visit, or any notes about this person',
                      border: OutlineInputBorder(),
                      alignLabelWithHint: true,
                    ),
                    validator: (v) => (v == null || v.trim().isEmpty)
                        ? 'Purpose is required'
                        : null,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed:
                        _submitting ? null : () => Navigator.pop(context),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppTheme.primaryIndigo,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      side: BorderSide(color: AppTheme.primaryIndigo),
                    ),
                    child: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: ElevatedButton(
                    onPressed: _submitting ? null : _submit,
                    style: AppTheme.primaryButton(),
                    child: _submitting
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white))
                        : const Text('Save',
                            style: TextStyle(fontWeight: FontWeight.bold)),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}
