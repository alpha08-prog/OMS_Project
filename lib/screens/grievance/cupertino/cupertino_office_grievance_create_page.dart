import 'dart:convert';
import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';

import '../../../services/http_service.dart';
import '../../../services/image_upload_service.dart';
import '../../../services/temple_registry_service.dart';
import '../../../theme/app_theme.dart';
import '../../../services/auth_service.dart';
import '../../../utils/access_control.dart';
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
  final descriptionController = TextEditingController();
  final monetaryValueController = TextEditingController();
  final referencedByController = TextEditingController();
  final wardVillageController = TextEditingController();

  final memberCountController = TextEditingController();
  final originDistrictController = TextEditingController();
  final originStateController = TextEditingController();

  String? selectedConstituency;
  String selectedGrievanceType = 'WATER';
  String? selectedActionRequired;
  String? selectedLetterTemplate;
  String selectedPriority = 'MEDIUM';
  File? _attachment;

  static const List<String> letterTemplates = [
    'To DC',
    'To Police Commissioner',
    'To PWD',
  ];

  String? selectedTempleKey;
  DateTime? visitDateFrom;
  DateTime? visitDateTo;
  final Set<String> selectedServices = {};
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

  bool get isTempleVisit => selectedGrievanceType == 'TEMPLE_VISIT';

  // Canonical Dharwad constituency list — the deployed web's Office
  // Grievance form uses the same CONSTITUENCY_OPTIONS as the public form.
  // Keep the variable name `officeZones` for diff stability; values are
  // constituency labels, not internal zones.
  final List<String> officeZones = const [
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

  final List<Map<String, String>> actionRequiredOptions = const [
    {'value': 'GENERATE_LETTER', 'label': 'Generate Letter'},
    {'value': 'CALL_OFFICIAL', 'label': 'Call Official'},
    {'value': 'FORWARD_TO_DEPT', 'label': 'Forward to Department'},
    {'value': 'SCHEDULE_MEETING', 'label': 'Schedule Meeting'},
    {'value': 'NO_ACTION', 'label': 'No Action'},
  ];

  final List<Map<String, String>> priorityOptions = const [
    {'value': 'LOW', 'label': 'Low'},
    {'value': 'MEDIUM', 'label': 'Medium'},
    {'value': 'HIGH', 'label': 'High'},
    {'value': 'CRITICAL', 'label': 'Critical'},
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
    super.dispose();
  }

  Future<void> _pickAttachment() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'],
    );
    if (result == null || result.files.isEmpty) return;
    final path = result.files.first.path;
    if (path == null) return;
    final f = File(path);
    final size = await f.length();
    if (size > 10 * 1024 * 1024) {
      if (!mounted) return;
      CupertinoToast.show(context, 'File is larger than 10 MB.', isError: true);
      return;
    }
    setState(() => _attachment = f);
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
      setState(() => _templeError = 'Could not load temples');
    } finally {
      if (mounted) setState(() => _loadingTemples = false);
    }
  }

  void _onTempleChanged(String key) {
    setState(() {
      selectedTempleKey = key;
      _templeKeyError = null;
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
    final entry = _templeByKey(selectedTempleKey);
    final deity = entry?.deity ?? selectedTempleKey ?? 'temple';
    final name = petitionerNameController.text.trim();
    final n = memberCountController.text.trim();
    final from = visitDateFrom == null ? '' : ' from ${_formatDate(visitDateFrom)}';
    final to = visitDateTo == null ? '' : ' to ${_formatDate(visitDateTo)}';
    return 'Temple visit letter for $name and $n members to $deity$from$to'.trim();
  }

  bool _validate() {
    bool valid = true;

    _nameError = petitionerNameController.text.trim().isEmpty
        ? 'Required'
        : null;
    if (_nameError != null) valid = false;

    _mobileError = mobileNumberController.text.trim().length != 10
        ? 'Enter 10-digit number'
        : null;
    if (_mobileError != null) valid = false;

    _constituencyError = (selectedConstituency == null ||
            selectedConstituency!.isEmpty)
        ? 'Required'
        : null;
    if (_constituencyError != null) valid = false;

    _referencedByError = referencedByController.text.trim().isEmpty
        ? 'Required'
        : null;
    if (_referencedByError != null) valid = false;

    if (isTempleVisit) {
      _descriptionError = null;

      _templeKeyError = (selectedTempleKey == null || selectedTempleKey!.isEmpty)
          ? 'Select a temple'
          : null;
      if (_templeKeyError != null) valid = false;

      final n = int.tryParse(memberCountController.text.trim());
      _memberCountError = (n == null || n < 1)
          ? 'Must be a positive number'
          : null;
      if (_memberCountError != null) valid = false;

      _visitFromError = visitDateFrom == null ? 'Required' : null;
      if (_visitFromError != null) valid = false;
    } else {
      _descriptionError = descriptionController.text.trim().isEmpty
          ? 'Required'
          : null;
      if (_descriptionError != null) valid = false;

      _templeKeyError = null;
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
        'priority': selectedPriority,
        'source': 'OFFICE',
      };

      if (isTempleVisit) {
        body['actionRequired'] = 'GENERATE_LETTER';
      } else if (selectedActionRequired != null) {
        body['actionRequired'] = selectedActionRequired;
      }

      final ward = wardVillageController.text.trim();
      if (ward.isNotEmpty) body['wardVillage'] = ward;

      final monetaryVal = monetaryValueController.text.trim();
      if (monetaryVal.isNotEmpty) body['monetaryValue'] = monetaryVal;

      if (selectedLetterTemplate != null && selectedLetterTemplate!.isNotEmpty) {
        body['letterTemplate'] = selectedLetterTemplate;
      }

      if (isTempleVisit) {
        body['templeKey'] = selectedTempleKey;
        body['memberCount'] = int.parse(memberCountController.text.trim());
        final od = originDistrictController.text.trim();
        if (od.isNotEmpty) body['originDistrict'] = od;
        final os = originStateController.text.trim();
        if (os.isNotEmpty) body['originState'] = os;
        body['visitDateFrom'] = _isoDate(visitDateFrom!);
        if (visitDateTo != null) body['visitDateTo'] = _isoDate(visitDateTo!);
        if (selectedServices.isNotEmpty) {
          body['servicesRequested'] = selectedServices.toList();
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

        final role = await AuthService.getRole();
        final isStaff = role == Roles.staff;

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
              title: 'Office Grievance Generated',
              content: const Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                        text:
                            'Your office grievance has been created successfully.\n\nGo to '),
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
            CupertinoToast.show(
                context, 'Office grievance created successfully');
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
        backgroundColor: AppTheme.saffronDark,
        brightness: Brightness.dark,
        middle: const Text(
          'Office Grievance',
          style: TextStyle(color: CupertinoColors.white),
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
                  Icon(CupertinoIcons.building_2_fill,
                      color: AppTheme.saffronDark),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text(
                      'Internal Office Grievance - for office-level routing',
                      style: TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w500),
                    ),
                  ),
                ],
              ),
            ),
            _buildCard(title: 'PETITIONER DETAILS', children: [
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
            ]),
            const SizedBox(height: 16),
            _buildCard(title: 'GRIEVANCE INFORMATION', children: [
              _buildPickerField(
                label: 'Constituency / Ward *',
                currentValue:
                    selectedConstituency ?? 'Select constituency',
                icon: CupertinoIcons.location,
                error: _constituencyError,
                onTap: () {
                  CupertinoFormHelpers.showPicker(
                    context: context,
                    items: officeZones,
                    currentValue: selectedConstituency ?? officeZones.first,
                    title: 'Constituency / Ward',
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
              _buildPickerField(
                label: 'Grievance Type *',
                currentValue:
                    _getLabelForValue(grievanceTypes, selectedGrievanceType),
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
              const SizedBox(height: 12),
              _buildPickerField(
                label: 'Priority *',
                currentValue:
                    _getLabelForValue(priorityOptions, selectedPriority),
                icon: CupertinoIcons.flag,
                onTap: () {
                  CupertinoFormHelpers.showPicker(
                    context: context,
                    items: priorityOptions.map((e) => e['label']!).toList(),
                    currentValue:
                        _getLabelForValue(priorityOptions, selectedPriority),
                    title: 'Priority',
                    onSelected: (label) {
                      for (final e in priorityOptions) {
                        if (e['label'] == label) {
                          setState(() => selectedPriority = e['value']!);
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
              const SizedBox(height: 12),
              _buildTextField(
                controller: monetaryValueController,
                placeholder: 'Monetary Value (₹)',
                prefixIcon: CupertinoIcons.money_dollar,
                keyboardType: TextInputType.number,
              ),
            ]),
            if (isTempleVisit) ...[
              const SizedBox(height: 16),
              _buildTempleSection(),
            ],
            const SizedBox(height: 16),
            _buildSupportingDocsSection(),
            const SizedBox(height: 16),
            _buildActionAndLetterSection(),
            const SizedBox(height: 16),
            _buildCard(title: 'REFERENCE', children: [
              _buildTextField(
                controller: referencedByController,
                placeholder: 'Referenced By *',
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
                    : Text(
                        isTempleVisit
                            ? 'Generate Darshan Letter'
                            : 'Submit Office Grievance',
                        style: const TextStyle(
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
            'These fields populate the darshan / accommodation letter. The grievance will be auto-resolved once the PDF is downloaded.',
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
          else if (_templeError != null)
            Row(
              children: [
                const Icon(CupertinoIcons.exclamationmark_triangle,
                    color: CupertinoColors.destructiveRed, size: 18),
                const SizedBox(width: 8),
                Expanded(child: Text(_templeError!)),
                CupertinoButton(
                  padding: EdgeInsets.zero,
                  onPressed: _ensureTemplesLoaded,
                  child: const Text('Retry'),
                ),
              ],
            )
          else
            _buildPickerField(
              label: 'Temple *',
              currentValue: selectedTempleKey == null
                  ? 'Select temple / accommodation office'
                  : (_templeByKey(selectedTempleKey)?.deity ??
                      selectedTempleKey!),
              icon: CupertinoIcons.building_2_fill,
              error: _templeKeyError,
              onTap: temples.isEmpty
                  ? null
                  : () {
                      final labels = temples.map((t) => t.deity).toList();
                      final current =
                          _templeByKey(selectedTempleKey)?.deity ?? labels.first;
                      CupertinoFormHelpers.showPicker(
                        context: context,
                        items: labels,
                        currentValue: current,
                        title: 'Temple',
                        onSelected: (label) {
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
          const SizedBox(height: 12),
          _buildTextField(
            controller: memberCountController,
            placeholder: 'Total Members *',
            keyboardType: TextInputType.number,
            error: _memberCountError,
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
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: TempleRegistryService.serviceLabels.entries.map((e) {
              final selected = selectedServices.contains(e.key);
              return GestureDetector(
                onTap: () => setState(() {
                  if (selected) {
                    selectedServices.remove(e.key);
                  } else {
                    selectedServices.add(e.key);
                  }
                }),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: selected
                        ? AppTheme.saffronSoft
                        : CupertinoColors.white,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: selected
                          ? AppTheme.saffronDark
                          : CupertinoColors.systemGrey4,
                    ),
                  ),
                  child: Text(
                    e.value,
                    style: TextStyle(
                      fontSize: 13,
                      color: selected
                          ? AppTheme.saffronDark
                          : AppTheme.foreground,
                      fontWeight:
                          selected ? FontWeight.w600 : FontWeight.normal,
                    ),
                  ),
                ),
              );
            }).toList(),
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
                      ? AppTheme.saffronDark
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
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
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
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
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
              color: AppTheme.saffronSoft,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppTheme.saffron.withOpacity(0.3)),
            ),
            child: Row(
              children: [
                const Icon(CupertinoIcons.doc_fill,
                    color: AppTheme.saffronDark, size: 22),
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
              padding: const EdgeInsets.symmetric(
                  vertical: 24, horizontal: 16),
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

  Widget _buildActionAndLetterSection() {
    final actionLabel = selectedActionRequired == null
        ? 'Select action'
        : _getLabelForValue(actionRequiredOptions, selectedActionRequired!);
    return _buildCard(
      title: 'ACTION & LETTER PROCESSING',
      children: [
        _buildPickerField(
          label: 'Action Required',
          currentValue: actionLabel,
          icon: CupertinoIcons.clock,
          onTap: () {
            CupertinoFormHelpers.showPicker(
              context: context,
              items: actionRequiredOptions.map((e) => e['label']!).toList(),
              currentValue: selectedActionRequired == null
                  ? actionRequiredOptions.first['label']!
                  : _getLabelForValue(
                      actionRequiredOptions, selectedActionRequired!),
              title: 'Action Required',
              onSelected: (label) {
                for (final e in actionRequiredOptions) {
                  if (e['label'] == label) {
                    setState(() => selectedActionRequired = e['value']);
                    return;
                  }
                }
              },
            );
          },
        ),
        const SizedBox(height: 12),
        _buildPickerField(
          label: 'Letter Template',
          currentValue: selectedLetterTemplate ?? 'Select template',
          icon: CupertinoIcons.doc_text,
          onTap: () {
            CupertinoFormHelpers.showPicker(
              context: context,
              items: letterTemplates,
              currentValue: selectedLetterTemplate ?? letterTemplates.first,
              title: 'Letter Template',
              onSelected: (v) => setState(() => selectedLetterTemplate = v),
            );
          },
        ),
      ],
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
