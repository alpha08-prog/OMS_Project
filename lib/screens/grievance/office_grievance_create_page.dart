import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/auth_service.dart';
import '../../services/http_service.dart';
import '../../services/image_upload_service.dart';
import '../../services/temple_registry_service.dart';
import '../../theme/app_theme.dart';
import '../../utils/access_control.dart';
import '../../utils/attachment_picker.dart';

class OfficeGrievanceCreatePage extends StatefulWidget {
  final Future<void> Function()? onCreated;

  const OfficeGrievanceCreatePage({super.key, this.onCreated});

  @override
  State<OfficeGrievanceCreatePage> createState() =>
      _OfficeGrievanceCreatePageState();
}

class _OfficeGrievanceCreatePageState extends State<OfficeGrievanceCreatePage> {
  final _formKey = GlobalKey<FormState>();

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

  bool get isTempleVisit => selectedGrievanceType == 'TEMPLE_VISIT';

  // Office variant uses internal zones/wards (matches web OfficeGrievanceCreate.tsx).
  // Canonical Dharwad constituency list — the deployed web's Office
  // Grievance form (OMS_Project-main/frontend/src/pages/grievances/
  // OfficeGrievanceCreate.tsx) uses the same CONSTITUENCY_OPTIONS as the
  // public grievance form. Keep the variable name `officeZones` for diff
  // stability; values are constituency labels, not internal zones.
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
    final picked = await AttachmentPicker.pick(
      context,
      allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp'],
    );
    if (picked == null) return;
    if (picked.size > 10 * 1024 * 1024) {
      _toast('File is larger than 10 MB.');
      return;
    }
    setState(() => _attachment = picked.file);
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

  void _onTempleChanged(String? key) {
    setState(() {
      selectedTempleKey = key;
      final entry = _templeByKey(key);
      if (entry != null) {
        selectedServices
          ..clear()
          ..addAll(entry.defaultServices);
      }
    });
  }

  Future<void> _pickDate(bool isFrom) async {
    final now = DateTime.now();
    final initial = isFrom
        ? (visitDateFrom ?? now)
        : (visitDateTo ?? visitDateFrom ?? now);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 5),
    );
    if (picked == null) return;
    setState(() {
      if (isFrom) {
        visitDateFrom = picked;
        if (visitDateTo != null && visitDateTo!.isBefore(picked)) {
          visitDateTo = null;
        }
      } else {
        visitDateTo = picked;
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

  bool _validateTempleVisit() {
    if (selectedTempleKey == null || selectedTempleKey!.isEmpty) {
      _toast('Please select a temple');
      return false;
    }
    final n = int.tryParse(memberCountController.text.trim());
    if (n == null || n < 1) {
      _toast('Total members must be a positive number');
      return false;
    }
    if (visitDateFrom == null) {
      _toast('Please select Visit From date');
      return false;
    }
    return true;
  }

  void _toast(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  /// STAFF-only success popup shown after a record is created that has a
  /// downloadable PDF in the Print Center. Blocks until the user taps OK
  /// so they read where to go next.
  Future<void> _showPdfReadyDialog({
    required String title,
    required Widget content,
  }) async {
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: Row(
          children: [
            const Icon(Icons.picture_as_pdf, color: AppTheme.primaryIndigo),
            const SizedBox(width: 8),
            Expanded(child: Text(title)),
          ],
        ),
        content: content,
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (isTempleVisit && !_validateTempleVisit()) return;

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
            _toast('Grievance saved, attachment upload failed.');
          }
        }

        final role = await AuthService.getRole();
        final isStaff = role == Roles.staff;

        if (isTempleVisit) {
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
            _toast(
                'Grievance created. Download the Darshan Letter to mark resolved.');
          }
        } else {
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
            _toast('Office grievance created successfully');
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
        _toast(msg);
      }
    } catch (e) {
      _toast('Server error');
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('Office Grievance'),
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
                      'Internal Office Grievance - for office-level routing',
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                    ),
                  ),
                ],
              ),
            ),
            _buildCard(title: 'PETITIONER DETAILS', children: [
              TextFormField(
                controller: petitionerNameController,
                decoration: const InputDecoration(
                  labelText: 'Petitioner Name *',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.person),
                ),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Required' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: mobileNumberController,
                keyboardType: TextInputType.phone,
                maxLength: 10,
                decoration: const InputDecoration(
                  labelText: 'Mobile Number *',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.phone),
                  counterText: '',
                ),
                validator: (v) => (v == null || v.trim().length != 10)
                    ? 'Enter 10-digit number'
                    : null,
              ),
            ]),
            const SizedBox(height: 16),
            _buildCard(title: 'GRIEVANCE INFORMATION', children: [
              DropdownButtonFormField<String>(
                value: selectedConstituency,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Constituency / Ward *',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.location_on),
                ),
                hint: const Text('Select constituency'),
                items: officeZones
                    .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                    .toList(),
                onChanged: (v) => setState(() => selectedConstituency = v),
                validator: (v) => (v == null || v.isEmpty) ? 'Required' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: wardVillageController,
                decoration: const InputDecoration(
                  labelText: 'Ward / Village',
                  hintText: 'Enter ward or village',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.home_work_outlined),
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: selectedGrievanceType,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Grievance Type *',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.category),
                ),
                items: grievanceTypes
                    .map((t) => DropdownMenuItem(
                          value: t['value'],
                          child: Text(t['label']!),
                        ))
                    .toList(),
                onChanged: (v) {
                  if (v == null) return;
                  setState(() => selectedGrievanceType = v);
                  if (v == 'TEMPLE_VISIT') _ensureTemplesLoaded();
                },
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                value: selectedPriority,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Priority *',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.flag),
                ),
                items: priorityOptions
                    .map((p) => DropdownMenuItem(
                          value: p['value'],
                          child: Text(p['label']!),
                        ))
                    .toList(),
                onChanged: (v) => setState(() => selectedPriority = v!),
              ),
              if (!isTempleVisit) ...[
                const SizedBox(height: 12),
                TextFormField(
                  controller: descriptionController,
                  maxLines: 4,
                  decoration: const InputDecoration(
                    labelText: 'Description *',
                    border: OutlineInputBorder(),
                    alignLabelWithHint: true,
                  ),
                  validator: (v) => (!isTempleVisit &&
                          (v == null || v.trim().isEmpty))
                      ? 'Required'
                      : null,
                ),
              ],
              const SizedBox(height: 12),
              TextFormField(
                controller: monetaryValueController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Monetary Value (₹)',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.currency_rupee),
                ),
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
              TextFormField(
                controller: referencedByController,
                decoration: const InputDecoration(
                  labelText: 'Referenced By *',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.person_pin),
                ),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Required' : null,
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
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                child: submitting
                    ? const CircularProgressIndicator(color: Colors.white)
                    : Text(
                        isTempleVisit
                            ? 'Generate Darshan Letter'
                            : 'Submit Office Grievance',
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
            'These fields populate the darshan / accommodation letter. The grievance will be auto-resolved once the PDF is downloaded.',
            style: TextStyle(fontSize: 12, color: AppTheme.muted, height: 1.4),
          ),
          const SizedBox(height: 16),
          if (_loadingTemples)
            const Center(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: CircularProgressIndicator(),
              ),
            )
          else if (_templeError != null)
            Row(
              children: [
                const Icon(Icons.error_outline,
                    color: AppTheme.destructiveRed, size: 18),
                const SizedBox(width: 8),
                Expanded(child: Text(_templeError!)),
                TextButton(
                  onPressed: _ensureTemplesLoaded,
                  child: const Text('Retry'),
                ),
              ],
            )
          else
            DropdownButtonFormField<String>(
              value: selectedTempleKey,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'Temple *',
                hintText: 'Select temple / accommodation office',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.account_balance),
                filled: true,
                fillColor: Colors.white,
              ),
              items: temples
                  .map((t) => DropdownMenuItem(
                        value: t.key,
                        child: Text(t.deity, overflow: TextOverflow.ellipsis),
                      ))
                  .toList(),
              onChanged: _onTempleChanged,
            ),
          const SizedBox(height: 12),
          TextFormField(
            controller: memberCountController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Total Members *',
              hintText: 'e.g. 4',
              border: OutlineInputBorder(),
              filled: true,
              fillColor: Colors.white,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  controller: originDistrictController,
                  decoration: const InputDecoration(
                    labelText: 'Origin District',
                    hintText: 'e.g. Dharwad',
                    border: OutlineInputBorder(),
                    filled: true,
                    fillColor: Colors.white,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextFormField(
                  controller: originStateController,
                  decoration: const InputDecoration(
                    labelText: 'Origin State',
                    hintText: 'e.g. Karnataka',
                    border: OutlineInputBorder(),
                    filled: true,
                    fillColor: Colors.white,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: _dateField('Visit From *', visitDateFrom, true)),
              const SizedBox(width: 12),
              Expanded(child: _dateField('Visit To', visitDateTo, false)),
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
              return FilterChip(
                label: Text(e.value),
                selected: selected,
                onSelected: (s) => setState(() {
                  if (s) {
                    selectedServices.add(e.key);
                  } else {
                    selectedServices.remove(e.key);
                  }
                }),
                selectedColor: AppTheme.saffronSoft,
                checkmarkColor: AppTheme.saffronDark,
                backgroundColor: Colors.white,
              );
            }).toList(),
          ),
          const SizedBox(height: 12),
          CheckboxListTile(
            value: showMobileOnLetter,
            onChanged: (v) => setState(() => showMobileOnLetter = v ?? false),
            title: const Text(
              "Include the petitioner's mobile number on the letter",
              style: TextStyle(fontSize: 13),
            ),
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
            dense: true,
          ),
        ],
      ),
    );
  }

  Widget _dateField(String label, DateTime? value, bool isFrom) {
    return InkWell(
      onTap: () => _pickDate(isFrom),
      borderRadius: BorderRadius.circular(4),
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: label,
          border: const OutlineInputBorder(),
          filled: true,
          fillColor: Colors.white,
          suffixIcon: const Icon(Icons.calendar_today, size: 18),
        ),
        child: Text(
          value == null ? 'dd-mm-yyyy' : _formatDate(value),
          style: TextStyle(
            fontSize: 15,
            color: value == null
                ? AppTheme.mutedForeground
                : AppTheme.foreground,
          ),
        ),
      ),
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
                const Icon(Icons.insert_drive_file,
                    color: AppTheme.saffronDark),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _attachment!.path.split(Platform.pathSeparator).last,
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
                IconButton(
                  icon: const Icon(Icons.close, size: 20),
                  color: AppTheme.muted,
                  onPressed: () => setState(() => _attachment = null),
                ),
              ],
            ),
          )
        else
          InkWell(
            onTap: _pickAttachment,
            borderRadius: BorderRadius.circular(12),
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
              decoration: BoxDecoration(
                color: AppTheme.backgroundAlt,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppTheme.border),
              ),
              child: const Column(
                children: [
                  Icon(Icons.upload, color: AppTheme.muted, size: 28),
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
    return _buildCard(
      title: 'ACTION & LETTER PROCESSING',
      children: [
        DropdownButtonFormField<String>(
          value: selectedActionRequired,
          isExpanded: true,
          decoration: const InputDecoration(
            labelText: 'Action Required',
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.pending_actions),
          ),
          hint: const Text('Select action'),
          items: actionRequiredOptions
              .map((t) => DropdownMenuItem(
                    value: t['value'],
                    child: Text(t['label']!),
                  ))
              .toList(),
          onChanged: (v) => setState(() => selectedActionRequired = v),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          value: selectedLetterTemplate,
          isExpanded: true,
          decoration: const InputDecoration(
            labelText: 'Letter Template',
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.description),
          ),
          hint: const Text('Select template'),
          items: letterTemplates
              .map((t) => DropdownMenuItem(value: t, child: Text(t)))
              .toList(),
          onChanged: (v) => setState(() => selectedLetterTemplate = v),
        ),
      ],
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
