import 'dart:convert';
import 'package:flutter/cupertino.dart';

import '../../../services/http_service.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../widgets/cupertino/cupertino_form_helpers.dart';

class CupertinoOfficeGrievanceCreatePage extends StatefulWidget {
  final Future<void> Function()? onCreated;

  const CupertinoOfficeGrievanceCreatePage({super.key, this.onCreated});

  @override
  State<CupertinoOfficeGrievanceCreatePage> createState() =>
      _CupertinoOfficeGrievanceCreatePageState();
}

class _CupertinoOfficeGrievanceCreatePageState
    extends State<CupertinoOfficeGrievanceCreatePage> {
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

  // Validation errors
  String? _nameError;
  String? _mobileError;
  String? _constituencyError;
  String? _descriptionError;
  String? _referencedByError;

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

  String _getLabelForValue(List<Map<String, String>> items, String value) {
    final match = items.firstWhere(
      (e) => e['value'] == value,
      orElse: () => {'label': value},
    );
    return match['label'] ?? value;
  }

  bool _validate() {
    bool valid = true;

    if (petitionerNameController.text.trim().isEmpty) {
      _nameError = "Required";
      valid = false;
    } else {
      _nameError = null;
    }

    if (mobileNumberController.text.trim().length != 10) {
      _mobileError = "Enter 10-digit number";
      valid = false;
    } else {
      _mobileError = null;
    }

    if (constituencyController.text.trim().isEmpty) {
      _constituencyError = "Required";
      valid = false;
    } else {
      _constituencyError = null;
    }

    if (descriptionController.text.trim().isEmpty) {
      _descriptionError = "Required";
      valid = false;
    } else {
      _descriptionError = null;
    }

    if (referencedByController.text.trim().isEmpty) {
      _referencedByError = "Required";
      valid = false;
    } else {
      _referencedByError = null;
    }

    setState(() {});
    return valid;
  }

  Future<void> _submit() async {
    if (!_validate()) return;
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
        CupertinoToast.show(
            context, "Office grievance created successfully");
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
      navigationBar: CupertinoNavigationBar(
        backgroundColor: AppTheme.saffronDark,
        brightness: Brightness.dark,
        middle: const Text(
          "Office Grievance",
          style: TextStyle(color: CupertinoColors.white),
        ),
        leading: CupertinoButton(
          padding: EdgeInsets.zero,
          onPressed: () => Navigator.pop(context),
          child: const Icon(CupertinoIcons.back,
              color: CupertinoColors.white),
        ),
      ),
      child: SafeArea(
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
                border: Border.all(
                    color: AppTheme.saffron.withOpacity(0.3)),
              ),
              child: Row(
                children: [
                  Icon(CupertinoIcons.building_2_fill,
                      color: AppTheme.saffronDark),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text(
                      "Internal Office Grievance - for office-level routing",
                      style: TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w500),
                    ),
                  ),
                ],
              ),
            ),

            _buildCard(title: "PETITIONER DETAILS", children: [
              _buildTextField(
                controller: petitionerNameController,
                placeholder: "Petitioner Name *",
                prefixIcon: CupertinoIcons.person,
                error: _nameError,
              ),
              const SizedBox(height: 12),
              _buildTextField(
                controller: mobileNumberController,
                placeholder: "Mobile Number *",
                prefixIcon: CupertinoIcons.phone,
                keyboardType: TextInputType.phone,
                maxLength: 10,
                error: _mobileError,
              ),
              const SizedBox(height: 12),
              _buildTextField(
                controller: constituencyController,
                placeholder: "Constituency *",
                prefixIcon: CupertinoIcons.location,
                error: _constituencyError,
              ),
            ]),
            const SizedBox(height: 16),

            _buildCard(title: "GRIEVANCE DETAILS", children: [
              _buildPickerField(
                label: "Grievance Type *",
                currentValue: _getLabelForValue(
                    grievanceTypes, selectedGrievanceType),
                icon: CupertinoIcons.tag,
                onTap: () {
                  CupertinoFormHelpers.showPicker(
                    context: context,
                    items: grievanceTypes
                        .map((e) => e['label']!)
                        .toList(),
                    currentValue: _getLabelForValue(
                        grievanceTypes, selectedGrievanceType),
                    title: "Grievance Type",
                    onSelected: (label) {
                      final match = grievanceTypes.firstWhere(
                        (e) => e['label'] == label,
                        orElse: () => {'value': 'OTHER'},
                      );
                      setState(
                          () => selectedGrievanceType = match['value']!);
                    },
                  );
                },
              ),
              const SizedBox(height: 12),
              _buildTextField(
                controller: descriptionController,
                placeholder: "Description *",
                maxLines: 4,
                error: _descriptionError,
              ),
              const SizedBox(height: 12),
              _buildTextField(
                controller: monetaryValueController,
                placeholder: "Monetary Value (optional)",
                prefixIcon: CupertinoIcons.money_dollar,
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: 12),
              _buildPickerField(
                label: "Action Required",
                currentValue: _getLabelForValue(
                    actionRequiredOptions, selectedActionRequired),
                icon: CupertinoIcons.clock,
                onTap: () {
                  CupertinoFormHelpers.showPicker(
                    context: context,
                    items: actionRequiredOptions
                        .map((e) => e['label']!)
                        .toList(),
                    currentValue: _getLabelForValue(
                        actionRequiredOptions, selectedActionRequired),
                    title: "Action Required",
                    onSelected: (label) {
                      final match = actionRequiredOptions.firstWhere(
                        (e) => e['label'] == label,
                        orElse: () => {'value': 'NO_ACTION'},
                      );
                      setState(
                          () => selectedActionRequired = match['value']!);
                    },
                  );
                },
              ),
              const SizedBox(height: 12),
              _buildTextField(
                controller: letterTemplateController,
                placeholder: "Letter Template (optional)",
                prefixIcon: CupertinoIcons.doc_text,
              ),
            ]),
            const SizedBox(height: 16),

            _buildCard(title: "REFERENCE", children: [
              _buildTextField(
                controller: referencedByController,
                placeholder: "Referenced By *",
                prefixIcon: CupertinoIcons.person_2,
                error: _referencedByError,
              ),
            ]),
            const SizedBox(height: 24),

            SizedBox(
              width: double.infinity,
              child: CupertinoButton(
                color: AppTheme.saffronDark,
                borderRadius: BorderRadius.circular(12),
                onPressed: submitting ? null : _submit,
                child: submitting
                    ? const CupertinoActivityIndicator(
                        color: CupertinoColors.white)
                    : const Text(
                        "Submit Office Grievance",
                        style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: CupertinoColors.white),
                      ),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildTextField({
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

  Widget _buildPickerField({
    required String label,
    required String currentValue,
    required IconData icon,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        decoration: BoxDecoration(
          color: CupertinoColors.systemGrey6,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: CupertinoColors.systemGrey4),
        ),
        child: Row(
          children: [
            Icon(icon, color: CupertinoColors.systemGrey, size: 20),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: const TextStyle(
                      fontSize: 11,
                      color: CupertinoColors.systemGrey,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    currentValue,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
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
            child: Text(
              title,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.bold,
                color: AppTheme.saffronDark,
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
