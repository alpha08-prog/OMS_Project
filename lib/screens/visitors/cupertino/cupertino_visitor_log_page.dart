import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';

import '../../../services/http_service.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../widgets/cupertino/cupertino_form_helpers.dart';
import '../../../widgets/cupertino/cupertino_page_header.dart';

class CupertinoVisitorLogPage extends StatefulWidget {
  const CupertinoVisitorLogPage({super.key});

  @override
  State<CupertinoVisitorLogPage> createState() =>
      _CupertinoVisitorLogPageState();
}

class _CupertinoVisitorLogPageState extends State<CupertinoVisitorLogPage> {
  final nameController = TextEditingController();
  final designationController = TextEditingController();
  final phoneController = TextEditingController();
  final purposeController = TextEditingController();
  final referencedByController = TextEditingController();
  final wardVillageController = TextEditingController();

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

  String? _nameError;
  String? _designationError;
  String? _phoneError;
  String? _purposeError;
  String? _referencedByError;

  @override
  void dispose() {
    nameController.dispose();
    designationController.dispose();
    phoneController.dispose();
    purposeController.dispose();
    referencedByController.dispose();
    wardVillageController.dispose();
    super.dispose();
  }

  bool _validate() {
    bool ok = true;

    if (nameController.text.trim().isEmpty) {
      _nameError = "Name is required";
      ok = false;
    } else {
      _nameError = null;
    }

    if (designationController.text.trim().isEmpty) {
      _designationError = "Designation is required";
      ok = false;
    } else {
      _designationError = null;
    }

    final phone = phoneController.text.trim();
    if (phone.isNotEmpty &&
        (phone.length != 10 || int.tryParse(phone) == null)) {
      _phoneError = "Enter 10-digit number";
      ok = false;
    } else {
      _phoneError = null;
    }

    if (purposeController.text.trim().isEmpty) {
      _purposeError = "Purpose is required";
      ok = false;
    } else {
      _purposeError = null;
    }

    if (referencedByController.text.trim().isEmpty) {
      _referencedByError = "Referenced By is required";
      ok = false;
    } else {
      _referencedByError = null;
    }

    setState(() {});
    return ok;
  }

  void _resetForm() {
    nameController.clear();
    designationController.clear();
    phoneController.clear();
    purposeController.clear();
    referencedByController.clear();
    wardVillageController.clear();
    setState(() {
      _dob = null;
      _selectedConstituency = null;
      _nameError = null;
      _designationError = null;
      _phoneError = null;
      _purposeError = null;
      _referencedByError = null;
    });
  }

  Future<void> _submit() async {
    if (!_validate()) return;
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
        CupertinoToast.show(context, "Visitor logged successfully");
        _resetForm();
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

  void _pickDob() {
    CupertinoFormHelpers.showDatePicker(
      context: context,
      initialDate: _dob ?? DateTime(1990, 1, 1),
      minimumDate: DateTime(1900),
      maximumDate: DateTime.now(),
      onDateSelected: (d) => setState(() => _dob = d),
    );
  }

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      backgroundColor: AppTheme.background,
      child: Column(
        children: [
          OmsPageHeader(title: "Log Visitor"),
          Expanded(
            child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _headerCard(),
            const SizedBox(height: 16),
            _buildCard(
              title: "VISITOR DETAILS",
              children: [
                _textField(
                  controller: nameController,
                  placeholder: "Visitor Name *",
                  prefixIcon: CupertinoIcons.person,
                  error: _nameError,
                ),
                const SizedBox(height: 12),
                _textField(
                  controller: designationController,
                  placeholder: "Designation *",
                  prefixIcon: CupertinoIcons.briefcase,
                  error: _designationError,
                ),
                const SizedBox(height: 12),
                _textField(
                  controller: phoneController,
                  placeholder: "Phone (optional)",
                  prefixIcon: CupertinoIcons.phone,
                  keyboardType: TextInputType.phone,
                  maxLength: 10,
                  error: _phoneError,
                ),
                const SizedBox(height: 12),
                _dobField(),
                const SizedBox(height: 12),
                _constituencyField(),
                const SizedBox(height: 12),
                _textField(
                  controller: wardVillageController,
                  placeholder: "Ward / Village",
                  prefixIcon: CupertinoIcons.house,
                ),
              ],
            ),
            const SizedBox(height: 16),
            _buildCard(
              title: "VISIT DETAILS",
              children: [
                _textField(
                  controller: purposeController,
                  placeholder: "Purpose of Visit *",
                  maxLines: 3,
                  error: _purposeError,
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
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: CupertinoButton.filled(
                onPressed: _submitting ? null : _submit,
                borderRadius: BorderRadius.circular(12),
                child: _submitting
                    ? const CupertinoActivityIndicator(
                        color: CupertinoColors.white)
                    : const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(CupertinoIcons.add_circled,
                              color: CupertinoColors.white),
                          SizedBox(width: 8),
                          Text(
                            "Log Visitor",
                            style: TextStyle(
                                fontSize: 16, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: CupertinoButton(
                padding: const EdgeInsets.symmetric(vertical: 12),
                color: CupertinoColors.systemGrey6,
                borderRadius: BorderRadius.circular(12),
                onPressed: _submitting ? null : _resetForm,
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(CupertinoIcons.refresh,
                        color: AppTheme.primaryIndigo, size: 18),
                    SizedBox(width: 8),
                    Text(
                      "Clear Form",
                      style: TextStyle(
                          color: AppTheme.primaryIndigo,
                          fontWeight: FontWeight.w600),
                    ),
                  ],
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
              color: CupertinoColors.white.withOpacity(0.2),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(CupertinoIcons.person_badge_plus,
                color: CupertinoColors.white, size: 26),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  "Log a new visitor",
                  style: TextStyle(
                    color: CupertinoColors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  _logged == 0
                      ? "Fill the details below"
                      : "$_logged visitor${_logged > 1 ? 's' : ''} logged in this session",
                  style: TextStyle(
                    color: CupertinoColors.white.withOpacity(0.85),
                    fontSize: 12,
                  ),
                ),
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

  Widget _constituencyField() {
    return GestureDetector(
      onTap: () {
        CupertinoFormHelpers.showPicker(
          context: context,
          items: _constituencies,
          currentValue: _selectedConstituency ?? _constituencies.first,
          title: 'Constituency',
          onSelected: (v) => setState(() => _selectedConstituency = v),
        );
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        decoration: BoxDecoration(
          color: CupertinoColors.systemGrey6,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: CupertinoColors.systemGrey4),
        ),
        child: Row(
          children: [
            const Icon(CupertinoIcons.location_solid,
                color: CupertinoColors.systemGrey, size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Constituency',
                    style: TextStyle(
                      fontSize: 11,
                      color: CupertinoColors.systemGrey,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _selectedConstituency ?? 'Tap to select',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
                      color: _selectedConstituency != null
                          ? CupertinoColors.black
                          : CupertinoColors.systemGrey,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(CupertinoIcons.chevron_down,
                size: 16, color: CupertinoColors.systemGrey),
          ],
        ),
      ),
    );
  }

  Widget _dobField() {
    return GestureDetector(
      onTap: _pickDob,
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
                    "Date of Birth (optional)",
                    style: TextStyle(
                      fontSize: 11,
                      color: CupertinoColors.systemGrey,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _dob != null
                        ? DateFormat('dd MMM yyyy').format(_dob!)
                        : "Tap to select",
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
                      color: _dob != null
                          ? CupertinoColors.black
                          : CupertinoColors.systemGrey,
                    ),
                  ),
                ],
              ),
            ),
            if (_dob != null)
              GestureDetector(
                onTap: () => setState(() => _dob = null),
                child: const Icon(CupertinoIcons.clear_circled_solid,
                    size: 18, color: CupertinoColors.systemGrey),
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
