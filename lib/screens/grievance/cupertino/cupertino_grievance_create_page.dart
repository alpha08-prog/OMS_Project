import 'dart:convert';
import 'dart:io';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';

import '../../../services/http_service.dart';
import '../../../services/image_upload_service.dart';
import '../../../services/temple_registry_service.dart';
import '../../../theme/app_theme.dart';
import '../../../utils/access_control.dart';
import '../../../utils/attachment_picker.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../widgets/cupertino/cupertino_form_helpers.dart';

class CupertinoGrievanceCreatePage extends StatefulWidget {
  final String role;
  final Future<void> Function()? onCreated;

  /// When non-null, the type was already chosen on
  /// [CupertinoGrievanceTypePickerPage]. The inline type picker row is
  /// replaced with a read-only chip.
  final String? initialType;

  const CupertinoGrievanceCreatePage({
    super.key,
    required this.role,
    this.onCreated,
    this.initialType,
  });

  @override
  State<CupertinoGrievanceCreatePage> createState() =>
      _CupertinoGrievanceCreatePageState();
}

class _CupertinoGrievanceCreatePageState
    extends State<CupertinoGrievanceCreatePage> {
  final petitionerNameController = TextEditingController();
  final mobileNumberController = TextEditingController();
  final descriptionController = TextEditingController();
  final monetaryValueController = TextEditingController();
  final referencedByController = TextEditingController();
  final wardVillageController = TextEditingController();

  final memberCountController = TextEditingController();
  final originDistrictController = TextEditingController();
  final originStateController = TextEditingController();

  String? selectedConstituency;
  late String selectedGrievanceType = widget.initialType ?? 'WATER';
  File? _attachment;

  String? selectedTempleKey;
  // Sentinel value for the "Other (specify)" picker entry. When picked,
  // [customTempleNameController] + [customTempleRecipientController] become
  // the source of truth for `templeKey` and `templeRecipient` on submit.
  static const String _otherTempleKey = '__OTHER__';
  static const String _otherTempleLabel = 'Other (specify)';
  final customTempleNameController = TextEditingController();
  final customTempleRecipientController = TextEditingController();

  DateTime? visitDateFrom;
  DateTime? visitDateTo;
  final Set<String> selectedServices = {};
  // Custom "Other (specify)" service. Submitted as `OTHER:<note>` alongside
  // any predefined services — backend recognises the prefix.
  bool customServiceEnabled = false;
  final customServiceController = TextEditingController();
  bool showMobileOnLetter = false;

  List<TempleEntry> temples = const [];
  bool _loadingTemples = false;
  String? _templeError;

  bool submitting = false;

  String? _nameError;
  String? _mobileError;
  String? _constituencyError;
  String? _descriptionError;
  String? _referencedByError;
  String? _memberCountError;
  String? _visitFromError;
  String? _templeKeyError;
  String? _customTempleNameError;
  String? _customTempleRecipientError;

  bool get isTempleVisit => selectedGrievanceType == 'TEMPLE_VISIT';

  /// True when the temple picker has the "Other (specify)" sentinel selected.
  bool get _isOtherTemple => selectedTempleKey == _otherTempleKey;

  /// True when the type was preselected on the picker screen — the form
  /// hides its inline type row and shows a read-only chip instead.
  bool get _typeLocked => widget.initialType != null;

  @override
  void initState() {
    super.initState();
    if (isTempleVisit) {
      WidgetsBinding.instance
          .addPostFrameCallback((_) => _ensureTemplesLoaded());
    }
  }

  // Canonical Dharwad constituency list — AC numbers included so downstream
  // letters / exports preserve official numbering. Must stay in sync with the
  // deployed web app (OMS_Project-main/frontend/src/lib/constituencies.ts).
  final List<String> constituencies = const [
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

  final List<Map<String, String>> grievanceTypes = const [
    {'value': 'WATER', 'label': 'Water'},
    {'value': 'ROAD', 'label': 'Road'},
    {'value': 'POLICE', 'label': 'Police'},
    {'value': 'HEALTH', 'label': 'Health'},
    {'value': 'TRANSFER', 'label': 'Transfer'},
    {'value': 'FINANCIAL_AID', 'label': 'Financial Aid'},
    {'value': 'ELECTRICITY', 'label': 'Electricity'},
    {'value': 'EDUCATION', 'label': 'Education'},
    {'value': 'HOUSING', 'label': 'Housing'},
    {'value': 'TEMPLE_VISIT', 'label': 'Temple Visit (Darshan Letter)'},
    {'value': 'OTHER', 'label': 'Other'},
  ];

  @override
  void dispose() {
    petitionerNameController.dispose();
    mobileNumberController.dispose();
    descriptionController.dispose();
    monetaryValueController.dispose();
    referencedByController.dispose();
    wardVillageController.dispose();
    memberCountController.dispose();
    originDistrictController.dispose();
    originStateController.dispose();
    customTempleNameController.dispose();
    customTempleRecipientController.dispose();
    customServiceController.dispose();
    super.dispose();
  }

  Future<void> _pickAttachment() async {
    final picked = await AttachmentPicker.pick(
      context,
      allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'],
    );
    if (picked == null) return;
    if (picked.size > 10 * 1024 * 1024) {
      if (!mounted) return;
      CupertinoToast.show(context, 'File is larger than 10 MB.', isError: true);
      return;
    }
    setState(() => _attachment = picked.file);
  }

  String _getLabelForValue(List<Map<String, String>> items, String value) {
    for (final e in items) {
      if (e['value'] == value) return e['label']!;
    }
    return value;
  }

  TempleEntry? _templeByKey(String? key) {
    if (key == null) return null;
    for (final t in temples) {
      if (t.key == key) return t;
    }
    return null;
  }

  Future<void> _ensureTemplesLoaded() async {
    if (temples.isNotEmpty || _loadingTemples) return;
    setState(() {
      _loadingTemples = true;
      _templeError = null;
    });
    try {
      final list = await TempleRegistryService.fetch();
      if (!mounted) return;
      setState(() => temples = list);
    } catch (e) {
      if (!mounted) return;
      final msg = e is Exception
          ? e.toString().replaceFirst('Exception: ', '')
          : e.toString();
      setState(() => _templeError = msg);
    } finally {
      if (mounted) setState(() => _loadingTemples = false);
    }
  }

  void _onTempleChanged(String key) {
    setState(() {
      selectedTempleKey = key;
      _templeKeyError = null;
      // "Other" has no registry entry → clear services so staff explicitly
      // picks them. Real registry entries keep their preset defaults.
      if (key == _otherTempleKey) {
        selectedServices.clear();
        return;
      }
      final entry = _templeByKey(key);
      if (entry != null) {
        selectedServices
          ..clear()
          ..addAll(entry.defaultServices);
      }
    });
  }

  String _formatDate(DateTime? d) =>
      d == null ? '' : DateFormat('dd-MM-yyyy').format(d);

  String _isoDate(DateTime d) => DateFormat('yyyy-MM-dd').format(d);

  String _synthesizeTempleDescription() {
    final String deity;
    if (_isOtherTemple) {
      final typed = customTempleNameController.text.trim();
      deity = typed.isEmpty ? 'temple' : typed;
    } else {
      final entry = _templeByKey(selectedTempleKey);
      deity = entry?.deity ?? selectedTempleKey ?? 'temple';
    }
    final name = petitionerNameController.text.trim();
    final n = memberCountController.text.trim();
    final from = visitDateFrom == null ? '' : ' from ${_formatDate(visitDateFrom)}';
    final to = visitDateTo == null ? '' : ' to ${_formatDate(visitDateTo)}';
    return 'Temple visit letter for $name and $n members to $deity$from$to'.trim();
  }

  bool _validate() {
    bool valid = true;

    _nameError = petitionerNameController.text.trim().isEmpty
        ? 'Name is required'
        : null;
    if (_nameError != null) valid = false;

    _mobileError = mobileNumberController.text.trim().length != 10
        ? 'Enter 10-digit mobile number'
        : null;
    if (_mobileError != null) valid = false;

    _constituencyError = (selectedConstituency == null ||
            selectedConstituency!.isEmpty)
        ? 'Select a constituency'
        : null;
    if (_constituencyError != null) valid = false;

    _referencedByError = referencedByController.text.trim().isEmpty
        ? 'Referenced by is required'
        : null;
    if (_referencedByError != null) valid = false;

    if (isTempleVisit) {
      _descriptionError = null;

      _templeKeyError = (selectedTempleKey == null || selectedTempleKey!.isEmpty)
          ? 'Select a temple'
          : null;
      if (_templeKeyError != null) valid = false;

      if (_isOtherTemple) {
        _customTempleNameError =
            customTempleNameController.text.trim().isEmpty
                ? 'Temple name is required'
                : null;
        if (_customTempleNameError != null) valid = false;

        _customTempleRecipientError =
            customTempleRecipientController.text.trim().isEmpty
                ? 'Letter recipient is required'
                : null;
        if (_customTempleRecipientError != null) valid = false;
      } else {
        _customTempleNameError = null;
        _customTempleRecipientError = null;
      }

      final n = int.tryParse(memberCountController.text.trim());
      _memberCountError = (n == null || n < 1)
          ? 'Must be a positive number'
          : null;
      if (_memberCountError != null) valid = false;

      _visitFromError = visitDateFrom == null ? 'Required' : null;
      if (_visitFromError != null) valid = false;
    } else {
      _descriptionError = descriptionController.text.trim().isEmpty
          ? 'Description is required'
          : null;
      if (_descriptionError != null) valid = false;

      _templeKeyError = null;
      _customTempleNameError = null;
      _customTempleRecipientError = null;
      _memberCountError = null;
      _visitFromError = null;
    }

    setState(() {});
    return valid;
  }

  /// STAFF-only success popup shown after a record is created that has a
  /// downloadable PDF in the Print Center. Blocks until the user taps OK
  /// so they read where to go next.
  Future<void> _showPdfReadyDialog({
    required String title,
    required Widget content,
  }) async {
    if (!mounted) return;
    await showCupertinoDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => CupertinoAlertDialog(
        title: Text(title),
        content: Padding(
          padding: const EdgeInsets.only(top: 8),
          child: content,
        ),
        actions: [
          CupertinoDialogAction(
            isDefaultAction: true,
            onPressed: () => Navigator.pop(ctx),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  Future<void> _submit() async {
    if (!_validate()) return;
    setState(() => submitting = true);

    try {
      final body = <String, dynamic>{
        'petitionerName': petitionerNameController.text.trim(),
        'mobileNumber': mobileNumberController.text.trim(),
        'constituency': selectedConstituency ?? '',
        'grievanceType': selectedGrievanceType,
        'description': isTempleVisit
            ? _synthesizeTempleDescription()
            : descriptionController.text.trim(),
        'referencedBy': referencedByController.text.trim(),
      };

      if (isTempleVisit) {
        body['actionRequired'] = 'GENERATE_LETTER';
      }

      final ward = wardVillageController.text.trim();
      if (ward.isNotEmpty) body['wardVillage'] = ward;

      final monetaryVal = monetaryValueController.text.trim();
      if (monetaryVal.isNotEmpty) body['monetaryValue'] = monetaryVal;

      if (isTempleVisit) {
        if (_isOtherTemple) {
          // Off-registry: store the typed name as the key and ship the
          // verbatim multi-line address block as `templeRecipient`. The
          // PDF generator falls back to this pair when the key is unknown.
          body['templeKey'] = customTempleNameController.text.trim();
          body['templeRecipient'] =
              customTempleRecipientController.text.trim();
        } else {
          body['templeKey'] = selectedTempleKey;
        }
        body['memberCount'] = int.parse(memberCountController.text.trim());
        final od = originDistrictController.text.trim();
        if (od.isNotEmpty) body['originDistrict'] = od;
        final os = originStateController.text.trim();
        if (os.isNotEmpty) body['originState'] = os;
        body['visitDateFrom'] = _isoDate(visitDateFrom!);
        if (visitDateTo != null) body['visitDateTo'] = _isoDate(visitDateTo!);
        final services = <String>[...selectedServices];
        if (customServiceEnabled) {
          final note =
              customServiceController.text.trim().replaceAll(',', ' ');
          if (note.isNotEmpty) services.add('OTHER:$note');
        }
        if (services.isNotEmpty) {
          body['servicesRequested'] = services;
        }
        body['showMobileOnLetter'] = showMobileOnLetter;
      }

      final res = await HttpService.post('/api/grievances', body);

      if (res.statusCode == 201 || res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final data = decoded is Map<String, dynamic>
            ? (decoded['data'] ?? decoded)
            : null;
        final newId = data is Map ? data['id']?.toString() : null;

        if (_attachment != null && newId != null && newId.isNotEmpty) {
          try {
            await ImageUploadService.uploadAttachment(
                _attachment!, 'GRIEVANCE', newId);
          } catch (e) {
            if (!mounted) return;
            CupertinoToast.show(
                context, 'Grievance saved, attachment upload failed.',
                isError: true);
          }
        }

        final isStaff = widget.role == Roles.staff;

        if (isTempleVisit) {
          if (!mounted) return;
          // Stay OPEN until the staff downloads the Darshan Letter from
          // the Print Center — that endpoint atomically resolves the
          // grievance on success.
          if (isStaff) {
            await _showPdfReadyDialog(
              title: 'Darshan Letter Ready',
              content: const Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                        text:
                            'Your Temple Visit grievance has been created.\n\nGo to '),
                    TextSpan(
                      text: 'Print Center',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                    TextSpan(
                        text:
                            ' to download the Darshan Letter PDF. The grievance will be marked Resolved on download.'),
                  ],
                ),
              ),
            );
          } else {
            CupertinoToast.show(
              context,
              'Grievance created. Download the Darshan Letter to mark resolved.',
            );
          }
        } else {
          if (!mounted) return;
          if (isStaff) {
            await _showPdfReadyDialog(
              title: 'Grievance Generated',
              content: const Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                        text:
                            'Your grievance has been created successfully.\n\nGo to '),
                    TextSpan(
                      text: 'Print Center',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                    TextSpan(text: ' to download the PDF.'),
                  ],
                ),
              ),
            );
          } else {
            CupertinoToast.show(context, 'Grievance created successfully');
          }
        }

        if (widget.onCreated != null) await widget.onCreated!();
        if (!mounted) return;
        Navigator.pop(context, true);
      } else {
        String msg = 'Failed (${res.statusCode})';
        try {
          final data = jsonDecode(res.body);
          msg = data['message'] ?? msg;
        } catch (_) {}
        if (!mounted) return;
        CupertinoToast.show(context, msg, isError: true);
      }
    } catch (e) {
      if (!mounted) return;
      CupertinoToast.show(context, 'Server error', isError: true);
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      backgroundColor: AppTheme.background,
      navigationBar: CupertinoNavigationBar(
        backgroundColor: AppTheme.primaryIndigo,
        brightness: Brightness.dark,
        middle: Text(
          _typeLocked
              ? '${_getLabelForValue(grievanceTypes, selectedGrievanceType)} Grievance'
              : 'Public Grievance',
          style: const TextStyle(color: CupertinoColors.white),
        ),
        leading: CupertinoButton(
          padding: EdgeInsets.zero,
          onPressed: () => Navigator.pop(context),
          child: const Icon(CupertinoIcons.back, color: CupertinoColors.white),
        ),
      ),
      child: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _buildCard(
              title: 'PETITIONER DETAILS',
              children: [
                _buildTextField(
                  controller: petitionerNameController,
                  placeholder: 'Petitioner Name *',
                  prefixIcon: CupertinoIcons.person,
                  error: _nameError,
                ),
                const SizedBox(height: 12),
                _buildTextField(
                  controller: mobileNumberController,
                  placeholder: 'Mobile Number *',
                  prefixIcon: CupertinoIcons.phone,
                  keyboardType: TextInputType.phone,
                  maxLength: 10,
                  error: _mobileError,
                ),
              ],
            ),
            const SizedBox(height: 16),
            _buildCard(
              title: 'GRIEVANCE INFORMATION',
              children: [
                _buildPickerField(
                  label: 'Constituency *',
                  currentValue: selectedConstituency ?? 'Select constituency',
                  icon: CupertinoIcons.location,
                  error: _constituencyError,
                  onTap: () {
                    CupertinoFormHelpers.showPicker(
                      context: context,
                      items: constituencies,
                      currentValue:
                          selectedConstituency ?? constituencies.first,
                      title: 'Constituency',
                      onSelected: (label) => setState(() {
                        selectedConstituency = label;
                        _constituencyError = null;
                      }),
                    );
                  },
                ),
                const SizedBox(height: 12),
                _buildTextField(
                  controller: wardVillageController,
                  placeholder: 'Ward / Village',
                  prefixIcon: CupertinoIcons.house,
                ),
                const SizedBox(height: 12),
                if (_typeLocked)
                  _buildLockedTypeChip()
                else
                  _buildPickerField(
                    label: 'Grievance Type *',
                    currentValue: _getLabelForValue(
                        grievanceTypes, selectedGrievanceType),
                    icon: CupertinoIcons.tag,
                    onTap: () {
                      CupertinoFormHelpers.showPicker(
                        context: context,
                        items: grievanceTypes.map((e) => e['label']!).toList(),
                        currentValue: _getLabelForValue(
                            grievanceTypes, selectedGrievanceType),
                        title: 'Grievance Type',
                        onSelected: (label) {
                          for (final e in grievanceTypes) {
                            if (e['label'] == label) {
                              setState(() {
                                selectedGrievanceType = e['value']!;
                              });
                              if (e['value'] == 'TEMPLE_VISIT') {
                                _ensureTemplesLoaded();
                              }
                              return;
                            }
                          }
                        },
                      );
                    },
                  ),
                if (!isTempleVisit) ...[
                  const SizedBox(height: 12),
                  _buildTextField(
                    controller: descriptionController,
                    placeholder: 'Description *',
                    maxLines: 4,
                    error: _descriptionError,
                  ),
                ],
                if (!isTempleVisit) ...[
                  const SizedBox(height: 12),
                  _buildTextField(
                    controller: monetaryValueController,
                    placeholder: 'Monetary Value (₹)',
                    prefixIcon: CupertinoIcons.money_dollar,
                    keyboardType: TextInputType.number,
                  ),
                ],
              ],
            ),
            if (isTempleVisit) ...[
              const SizedBox(height: 16),
              _buildTempleSection(),
            ],
            const SizedBox(height: 16),
            _buildSupportingDocsSection(),
            const SizedBox(height: 16),
            _buildCard(
              title: 'REFERENCE',
              children: [
                _buildTextField(
                  controller: referencedByController,
                  placeholder: 'Referenced By *',
                  prefixIcon: CupertinoIcons.person_2,
                  error: _referencedByError,
                ),
              ],
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: CupertinoButton.filled(
                onPressed: submitting ? null : _submit,
                borderRadius: BorderRadius.circular(12),
                child: submitting
                    ? const CupertinoActivityIndicator(
                        color: CupertinoColors.white)
                    : Text(
                        isTempleVisit
                            ? 'Register Temple Visit'
                            : 'Register Grievance',
                        style: const TextStyle(
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

  Widget _buildTempleSection() {
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.warningAmber50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.warningAmber.withOpacity(0.4)),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'TEMPLE VISIT DETAILS',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.bold,
              color: AppTheme.saffronDark,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'These fields populate the darshan / accommodation letter. The grievance will be auto-resolved once the PDF is downloaded. Use the petitioner name with honorific (e.g. "Sri. Amit Solanki") — it prints verbatim on the letter.',
            style: TextStyle(fontSize: 12, color: AppTheme.muted, height: 1.4),
          ),
          const SizedBox(height: 16),
          if (_loadingTemples)
            const Center(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: CupertinoActivityIndicator(),
              ),
            )
          else if (_templeError != null) ...[
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppTheme.destructiveRed50,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppTheme.destructiveRed100),
              ),
              child: Row(
                children: [
                  const Icon(CupertinoIcons.exclamationmark_triangle,
                      color: CupertinoColors.destructiveRed, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _templeError!,
                      style: const TextStyle(
                        fontSize: 12,
                        color: CupertinoColors.destructiveRed,
                      ),
                    ),
                  ),
                  CupertinoButton(
                    padding: EdgeInsets.zero,
                    onPressed: _ensureTemplesLoaded,
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            // Fallback: even if the registry fails to load, staff can still
            // pick "Other (specify)" and type the temple manually.
            _buildPickerField(
              label: 'Temple *',
              currentValue:
                  _isOtherTemple ? _otherTempleLabel : 'Pick Other (specify)',
              icon: CupertinoIcons.building_2_fill,
              error: _templeKeyError,
              onTap: () => _onTempleChanged(_otherTempleKey),
            ),
          ]
          else
            _buildPickerField(
              label: 'Temple *',
              currentValue: selectedTempleKey == null
                  ? 'Select temple / accommodation office'
                  : (_isOtherTemple
                      ? _otherTempleLabel
                      : (_templeByKey(selectedTempleKey)?.deity ??
                          selectedTempleKey!)),
              icon: CupertinoIcons.building_2_fill,
              error: _templeKeyError,
              onTap: temples.isEmpty
                  ? null
                  : () {
                      final labels = [
                        ...temples.map((t) => t.deity),
                        _otherTempleLabel,
                      ];
                      final current = _isOtherTemple
                          ? _otherTempleLabel
                          : (_templeByKey(selectedTempleKey)?.deity ??
                              labels.first);
                      CupertinoFormHelpers.showPicker(
                        context: context,
                        items: labels,
                        currentValue: current,
                        title: 'Temple',
                        onSelected: (label) {
                          if (label == _otherTempleLabel) {
                            _onTempleChanged(_otherTempleKey);
                            return;
                          }
                          for (final t in temples) {
                            if (t.deity == label) {
                              _onTempleChanged(t.key);
                              return;
                            }
                          }
                        },
                      );
                    },
            ),
          if (_isOtherTemple) ...[
            const SizedBox(height: 12),
            _buildTextField(
              controller: customTempleNameController,
              placeholder: 'Temple Name *',
              prefixIcon: CupertinoIcons.tag,
              error: _customTempleNameError,
            ),
            const SizedBox(height: 4),
            const Text(
              'Name prints on the letter as the deity / temple line.',
              style: TextStyle(fontSize: 11, color: AppTheme.muted),
            ),
            const SizedBox(height: 12),
            _buildTextField(
              controller: customTempleRecipientController,
              placeholder:
                  'Letter Addressed To *\nA.D.M. Protocol\nVaranasi.\nUttar Pradesh.',
              maxLines: 4,
              error: _customTempleRecipientError,
            ),
            const SizedBox(height: 4),
            const Text(
              'One line per row, exactly as it should appear on the letter. This block prints verbatim at the bottom (e.g. designation, city, state).',
              style: TextStyle(fontSize: 11, color: AppTheme.muted),
            ),
          ],
          const SizedBox(height: 12),
          _buildTextField(
            controller: memberCountController,
            placeholder: 'Total Members *',
            keyboardType: TextInputType.number,
            error: _memberCountError,
          ),
          const SizedBox(height: 4),
          const Text(
            'Total people incl. petitioner. Letter prints "<name> and N members".',
            style: TextStyle(fontSize: 11, color: AppTheme.muted),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _buildTextField(
                  controller: originDistrictController,
                  placeholder: 'Origin District',
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _buildTextField(
                  controller: originStateController,
                  placeholder: 'Origin State',
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _buildDatePickerField(
                  label: 'Visit From *',
                  value: visitDateFrom,
                  error: _visitFromError,
                  onChanged: (d) => setState(() {
                    visitDateFrom = d;
                    _visitFromError = null;
                    if (visitDateTo != null && visitDateTo!.isBefore(d)) {
                      visitDateTo = null;
                    }
                  }),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _buildDatePickerField(
                  label: 'Visit To',
                  value: visitDateTo,
                  onChanged: (d) => setState(() => visitDateTo = d),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          const Text(
            'Leave Visit To empty for a single-day visit.',
            style: TextStyle(fontSize: 11, color: AppTheme.muted),
          ),
          const SizedBox(height: 16),
          const Text(
            'Services Requested',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 6),
          _buildServicesDropdown(),
          if (customServiceEnabled) ...[
            const SizedBox(height: 8),
            _buildTextField(
              controller: customServiceController,
              placeholder: 'Describe the requested service',
            ),
          ],
          const SizedBox(height: 4),
          const Text(
            'Defaults are auto-selected based on the temple. Pick more or add a custom request.',
            style: TextStyle(fontSize: 11, color: AppTheme.muted),
          ),
          const SizedBox(height: 16),
          GestureDetector(
            onTap: () =>
                setState(() => showMobileOnLetter = !showMobileOnLetter),
            child: Row(
              children: [
                Icon(
                  showMobileOnLetter
                      ? CupertinoIcons.check_mark_circled_solid
                      : CupertinoIcons.circle,
                  color: showMobileOnLetter
                      ? AppTheme.primaryIndigo
                      : CupertinoColors.systemGrey,
                  size: 22,
                ),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    "Include the petitioner's mobile number on the letter",
                    style: TextStyle(fontSize: 13),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDatePickerField({
    required String label,
    required DateTime? value,
    required ValueChanged<DateTime> onChanged,
    String? error,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: () {
            CupertinoFormHelpers.showDatePicker(
              context: context,
              initialDate: value ?? DateTime.now(),
              onDateSelected: onChanged,
            );
          },
          child: Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
            decoration: BoxDecoration(
              color: CupertinoColors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: error != null
                    ? CupertinoColors.destructiveRed
                    : CupertinoColors.systemGrey4,
              ),
            ),
            child: Row(
              children: [
                const Icon(CupertinoIcons.calendar,
                    color: CupertinoColors.systemGrey, size: 18),
                const SizedBox(width: 8),
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
                        value == null ? 'dd-mm-yyyy' : _formatDate(value),
                        style: const TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w500),
                      ),
                    ],
                  ),
                ),
              ],
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

  String _servicesPreview() {
    final picks = <String>[
      for (final code in selectedServices)
        TempleRegistryService.serviceLabels[code] ?? code,
      if (customServiceEnabled) 'Other',
    ];
    if (picks.isEmpty) return 'Select services...';
    return picks.join(', ');
  }

  Widget _buildServicesDropdown() {
    final preview = _servicesPreview();
    final hasSelection = selectedServices.isNotEmpty || customServiceEnabled;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: _openServicesSheet,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: CupertinoColors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: CupertinoColors.systemGrey3),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                preview,
                style: TextStyle(
                  fontSize: 14,
                  color: hasSelection
                      ? AppTheme.foreground
                      : CupertinoColors.systemGrey,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const Icon(
              CupertinoIcons.chevron_down,
              size: 16,
              color: CupertinoColors.systemGrey,
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _openServicesSheet() async {
    await showCupertinoModalPopup<void>(
      context: context,
      builder: (popupCtx) {
        return StatefulBuilder(
          builder: (ctx, setSheet) {
            void toggleService(String code) {
              setSheet(() {
                if (selectedServices.contains(code)) {
                  selectedServices.remove(code);
                } else {
                  selectedServices.add(code);
                }
              });
              setState(() {});
            }

            return Container(
              decoration: const BoxDecoration(
                color: CupertinoColors.white,
                borderRadius:
                    BorderRadius.vertical(top: Radius.circular(16)),
              ),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(0, 8, 0, 12),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 40,
                        height: 4,
                        margin: const EdgeInsets.only(bottom: 8),
                        decoration: BoxDecoration(
                          color: CupertinoColors.systemGrey4,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                      const Padding(
                        padding: EdgeInsets.symmetric(
                            horizontal: 16, vertical: 4),
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: Text(
                            'Services Requested',
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ),
                      ...TempleRegistryService.serviceLabels.entries.map((e) {
                        return _serviceCheckboxRow(
                          label: e.value,
                          selected: selectedServices.contains(e.key),
                          onTap: () => toggleService(e.key),
                        );
                      }),
                      _serviceCheckboxRow(
                        label: 'Other (specify)',
                        selected: customServiceEnabled,
                        onTap: () {
                          setSheet(() {
                            customServiceEnabled = !customServiceEnabled;
                            if (!customServiceEnabled) {
                              customServiceController.clear();
                            }
                          });
                          setState(() {});
                        },
                        isLast: true,
                      ),
                      const SizedBox(height: 8),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        child: SizedBox(
                          width: double.infinity,
                          child: CupertinoButton.filled(
                            borderRadius: BorderRadius.circular(12),
                            onPressed: () => Navigator.pop(popupCtx),
                            child: const Text('Done'),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  /// One row in the Services Requested checklist. Looks like a Material
  /// CheckboxListTile but uses Cupertino-styled controls + colours.
  Widget _serviceCheckboxRow({
    required String label,
    required bool selected,
    required VoidCallback onTap,
    bool isLast = false,
  }) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          border: isLast
              ? null
              : const Border(
                  bottom: BorderSide(color: CupertinoColors.systemGrey5),
                ),
        ),
        child: Row(
          children: [
            Container(
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                color: selected ? AppTheme.primaryIndigo : CupertinoColors.white,
                borderRadius: BorderRadius.circular(4),
                border: Border.all(
                  color: selected
                      ? AppTheme.primaryIndigo
                      : CupertinoColors.systemGrey3,
                  width: 1.5,
                ),
              ),
              child: selected
                  ? const Icon(
                      CupertinoIcons.check_mark,
                      size: 16,
                      color: CupertinoColors.white,
                    )
                  : null,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                label,
                style: const TextStyle(
                  fontSize: 14,
                  color: AppTheme.foreground,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLockedTypeChip() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppTheme.primaryIndigo50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.primaryIndigo100),
      ),
      child: Row(
        children: [
          const Icon(
            CupertinoIcons.tag,
            color: AppTheme.primaryIndigo,
            size: 20,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'GRIEVANCE TYPE',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.6,
                    color: AppTheme.muted,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  _getLabelForValue(grievanceTypes, selectedGrievanceType),
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.foreground,
                  ),
                ),
              ],
            ),
          ),
          CupertinoButton(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            onPressed: submitting ? null : () => Navigator.pop(context),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(CupertinoIcons.arrow_2_squarepath,
                    size: 16, color: AppTheme.primaryIndigo),
                SizedBox(width: 4),
                Text(
                  'Change',
                  style: TextStyle(
                    color: AppTheme.primaryIndigo,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPickerField({
    required String label,
    required String currentValue,
    required IconData icon,
    required VoidCallback? onTap,
    String? error,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: onTap,
          child: Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
            decoration: BoxDecoration(
              color: CupertinoColors.systemGrey6,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: error != null
                    ? CupertinoColors.destructiveRed
                    : CupertinoColors.systemGrey4,
              ),
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
                            fontSize: 15, fontWeight: FontWeight.w500),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                const Icon(CupertinoIcons.chevron_down,
                    size: 16, color: CupertinoColors.systemGrey),
              ],
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

  Widget _buildSupportingDocsSection() {
    return _buildCard(
      title: 'SUPPORTING DOCUMENTS',
      children: [
        if (_attachment != null)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppTheme.primaryIndigo50,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppTheme.primaryIndigo100),
            ),
            child: Row(
              children: [
                const Icon(CupertinoIcons.doc_fill,
                    color: AppTheme.primaryIndigo, size: 22),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _attachment!.path
                            .split(Platform.pathSeparator)
                            .last,
                        style: const TextStyle(
                            fontWeight: FontWeight.w600, fontSize: 13),
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      FutureBuilder<int>(
                        future: _attachment!.length(),
                        builder: (_, snap) {
                          final kb = snap.hasData
                              ? (snap.data! / 1024).toStringAsFixed(1)
                              : '…';
                          return Text(
                            '$kb KB',
                            style: const TextStyle(
                                fontSize: 11, color: AppTheme.muted),
                          );
                        },
                      ),
                    ],
                  ),
                ),
                CupertinoButton(
                  padding: EdgeInsets.zero,
                  minSize: 32,
                  onPressed: () => setState(() => _attachment = null),
                  child: const Icon(CupertinoIcons.xmark,
                      size: 18, color: AppTheme.muted),
                ),
              ],
            ),
          )
        else
          GestureDetector(
            onTap: _pickAttachment,
            child: Container(
              padding:
                  const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
              decoration: BoxDecoration(
                color: CupertinoColors.systemGrey6,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: CupertinoColors.systemGrey4),
              ),
              child: const Column(
                children: [
                  Icon(CupertinoIcons.cloud_upload,
                      color: AppTheme.muted, size: 28),
                  SizedBox(height: 8),
                  Text(
                    'Click to attach a supporting document',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.foreground,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'Image or PDF, up to 10 MB. Optional.',
                    style: TextStyle(fontSize: 11, color: AppTheme.muted),
                  ),
                ],
              ),
            ),
          ),
      ],
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
