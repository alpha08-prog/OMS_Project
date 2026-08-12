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

class GrievanceCreatePage extends StatefulWidget {
  final Future<void> Function()? onCreated;

  /// When non-null, the type was already chosen on [GrievanceTypePickerPage].
  /// The inline type dropdown is hidden and the AppBar title reflects it.
  final String? initialType;

  const GrievanceCreatePage({super.key, this.onCreated, this.initialType});

  @override
  State<GrievanceCreatePage> createState() => _GrievanceCreatePageState();
}

class _GrievanceCreatePageState extends State<GrievanceCreatePage> {
  final _formKey = GlobalKey<FormState>();

  final petitionerNameController = TextEditingController();
  final mobileNumberController = TextEditingController();
  final descriptionController = TextEditingController();
  final monetaryValueController = TextEditingController();
  final referencedByController = TextEditingController();

  final memberCountController = TextEditingController();
  final originDistrictController = TextEditingController();
  final originStateController = TextEditingController();

  String? selectedConstituency;
  final wardVillageController = TextEditingController();

  late String selectedGrievanceType = widget.initialType ?? 'WATER';
  File? _attachment;

  String? selectedTempleKey;
  // Sentinel value for the "Other (specify)" dropdown entry. When picked,
  // [customTempleNameController] + [customTempleRecipientController] become
  // the source of truth for `templeKey` and `templeRecipient` on submit.
  static const String _otherTempleKey = '__OTHER__';
  final customTempleNameController = TextEditingController();
  final customTempleRecipientController = TextEditingController();

  DateTime? visitDateFrom;
  DateTime? visitDateTo;
  final Set<String> selectedServices = {};
  // Custom "Other (specify)" service. Submitted as `OTHER:<note>` alongside
  // any predefined services — backend recognises the prefix and prints the
  // note verbatim on the letter.
  bool customServiceEnabled = false;
  final customServiceController = TextEditingController();
  bool showMobileOnLetter = false;

  List<TempleEntry> temples = const [];
  bool _loadingTemples = false;
  String? _templeError;

  bool submitting = false;

  bool get isTempleVisit => selectedGrievanceType == 'TEMPLE_VISIT';

  /// True when the temple dropdown has the "Other (specify)" sentinel
  /// selected — the form reveals two manual inputs for name + recipient.
  bool get _isOtherTemple => selectedTempleKey == _otherTempleKey;

  /// True when the type was preselected on the picker screen — the form
  /// hides its inline type dropdown and shows a read-only chip instead.
  bool get _typeLocked => widget.initialType != null;

  @override
  void initState() {
    super.initState();
    if (isTempleVisit) {
      WidgetsBinding.instance
          .addPostFrameCallback((_) => _ensureTemplesLoaded());
    }
  }

  String _labelForType(String value) {
    for (final t in grievanceTypes) {
      if (t['value'] == value) return t['label']!;
    }
    return value;
  }

  // Matches web GrievanceCreate.tsx — 8 fixed values.
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

  @override
  void dispose() {
    petitionerNameController.dispose();
    mobileNumberController.dispose();
    descriptionController.dispose();
    monetaryValueController.dispose();
    referencedByController.dispose();
    memberCountController.dispose();
    originDistrictController.dispose();
    originStateController.dispose();
    customTempleNameController.dispose();
    customTempleRecipientController.dispose();
    customServiceController.dispose();
    wardVillageController.dispose();
    super.dispose();
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

  TempleEntry? _templeByKey(String? key) {
    if (key == null) return null;
    for (final t in temples) {
      if (t.key == key) return t;
    }
    return null;
  }

  void _onTempleChanged(String? key) {
    setState(() {
      selectedTempleKey = key;
      // "Other" has no registry entry → clear any auto-selected services so
      // the staff explicitly picks what they want on the letter.
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

  bool _validateTempleVisit() {
    if (selectedTempleKey == null || selectedTempleKey!.isEmpty) {
      _toast('Please select a temple');
      return false;
    }
    if (_isOtherTemple) {
      if (customTempleNameController.text.trim().isEmpty) {
        _toast('Please enter the temple name');
        return false;
      }
      if (customTempleRecipientController.text.trim().isEmpty) {
        _toast('Please enter the letter recipient address');
        return false;
      }
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
          body['templeRecipient'] = customTempleRecipientController.text.trim();
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
          // Backend strips inner commas, but doing it here keeps the user's
          // intent visible if validation surfaces the value back.
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

        // Upload attachment if any (non-fatal — grievance is already saved).
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
          // Grievance stays OPEN until the staff downloads the Darshan
          // Letter from the Print Center — that download endpoint
          // atomically marks the grievance RESOLVED on success.
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
            _toast('Grievance created successfully');
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
        title: Text(
          _typeLocked
              ? '${_labelForType(selectedGrievanceType)} Grievance'
              : 'Public Grievance',
        ),
        backgroundColor: AppTheme.primaryIndigo,
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _buildCard(
              title: 'PETITIONER DETAILS',
              children: [
                TextFormField(
                  controller: petitionerNameController,
                  decoration: const InputDecoration(
                    labelText: 'Petitioner Name *',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.person),
                  ),
                  validator: (v) =>
                      (v == null || v.trim().isEmpty) ? 'Name is required' : null,
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
                      ? 'Enter 10-digit mobile number'
                      : null,
                ),
              ],
            ),
            const SizedBox(height: 16),
            _buildCard(
              title: 'GRIEVANCE INFORMATION',
              children: [
                DropdownButtonFormField<String>(
                  value: selectedConstituency,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Constituency *',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.location_on),
                  ),
                  hint: const Text('Select constituency'),
                  items: constituencies
                      .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                      .toList(),
                  onChanged: (v) => setState(() => selectedConstituency = v),
                  validator: (v) =>
                      (v == null || v.isEmpty) ? 'Constituency is required' : null,
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
                if (_typeLocked)
                  _buildTypeChip()
                else
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
                        ? 'Description is required'
                        : null,
                  ),
                ],
                if (!isTempleVisit) ...[
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: monetaryValueController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Monetary Value (₹)',
                      hintText: 'Estimated cost / aid amount',
                      border: OutlineInputBorder(),
                      prefixIcon: Icon(Icons.currency_rupee),
                    ),
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
                TextFormField(
                  controller: referencedByController,
                  decoration: const InputDecoration(
                    labelText: 'Referenced By *',
                    hintText: 'Eg: Hon. MLA, Party President, DC Office',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.person_pin),
                  ),
                  validator: (v) => (v == null || v.trim().isEmpty)
                      ? 'Referenced by is required'
                      : null,
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
            const Center(child: Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: CircularProgressIndicator(),
            ))
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
                  const Icon(Icons.error_outline,
                      color: AppTheme.destructiveRed, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _templeError!,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppTheme.destructiveRed,
                      ),
                    ),
                  ),
                  TextButton(
                    onPressed: _ensureTemplesLoaded,
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            // Fallback: even if the registry fails to load, staff can still
            // pick "Other (specify)" and type the temple manually.
            DropdownButtonFormField<String>(
              value: _isOtherTemple ? _otherTempleKey : null,
              isExpanded: true,
              decoration: const InputDecoration(
                labelText: 'Temple *',
                hintText: 'Pick Other (specify) to enter manually',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.account_balance),
                filled: true,
                fillColor: Colors.white,
              ),
              items: const [
                DropdownMenuItem(
                  value: _otherTempleKey,
                  child: Text('Other (specify)'),
                ),
              ],
              onChanged: _onTempleChanged,
            ),
          ]
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
              items: [
                ...temples.map((t) => DropdownMenuItem(
                      value: t.key,
                      child: Text(t.deity, overflow: TextOverflow.ellipsis),
                    )),
                const DropdownMenuItem(
                  value: _otherTempleKey,
                  child: Text('Other (specify)'),
                ),
              ],
              onChanged: _onTempleChanged,
            ),
          if (_isOtherTemple) ...[
            const SizedBox(height: 12),
            TextFormField(
              controller: customTempleNameController,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                labelText: 'Temple Name *',
                hintText: 'e.g. Shri Kashi Vishwanath',
                helperText:
                    'Name prints on the letter as the deity / temple line.',
                helperMaxLines: 2,
                border: OutlineInputBorder(),
                filled: true,
                fillColor: Colors.white,
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: customTempleRecipientController,
              maxLines: 4,
              minLines: 3,
              decoration: const InputDecoration(
                labelText: 'Letter Addressed To *',
                hintText: 'A.D.M. Protocol\nVaranasi.\nUttar Pradesh.',
                helperText:
                    'One line per row, exactly as it should appear on the letter. This block prints verbatim at the bottom (e.g. designation, city, state).',
                helperMaxLines: 3,
                alignLabelWithHint: true,
                border: OutlineInputBorder(),
                filled: true,
                fillColor: Colors.white,
              ),
            ),
          ],
          const SizedBox(height: 12),
          TextFormField(
            controller: memberCountController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Total Members *',
              hintText: 'e.g. 4',
              helperText:
                  'Total people incl. petitioner. Letter prints "<name> and N members".',
              helperMaxLines: 2,
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
          const SizedBox(height: 6),
          _buildServicesDropdown(),
          if (customServiceEnabled) ...[
            const SizedBox(height: 8),
            TextFormField(
              controller: customServiceController,
              decoration: const InputDecoration(
                hintText: 'Describe the requested service',
                border: OutlineInputBorder(),
                filled: true,
                fillColor: Colors.white,
              ),
            ),
          ],
          const SizedBox(height: 4),
          const Text(
            'Defaults are auto-selected based on the temple. Pick more or add a custom request.',
            style: TextStyle(fontSize: 11, color: AppTheme.muted),
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

  /// Comma-joined preview of currently-checked services for the closed
  /// dropdown row. Empty selection → "Select services...".
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
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: _openServicesSheet,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: Colors.grey.shade400),
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
                      : Colors.grey.shade600,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            Icon(Icons.expand_more, color: Colors.grey.shade600),
          ],
        ),
      ),
    );
  }

  Future<void> _openServicesSheet() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (sheetCtx) {
        return StatefulBuilder(
          builder: (ctx, setSheet) {
            void toggleService(String code, bool? v) {
              setSheet(() {
                if (v == true) {
                  selectedServices.add(code);
                } else {
                  selectedServices.remove(code);
                }
              });
              setState(() {});
            }

            return SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 40,
                      height: 4,
                      margin: const EdgeInsets.only(bottom: 8),
                      decoration: BoxDecoration(
                        color: Colors.grey.shade300,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                    const Padding(
                      padding: EdgeInsets.symmetric(
                          horizontal: 8, vertical: 4),
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
                      final selected = selectedServices.contains(e.key);
                      return CheckboxListTile(
                        value: selected,
                        onChanged: (v) => toggleService(e.key, v),
                        title: Text(e.value,
                            style: const TextStyle(fontSize: 14)),
                        controlAffinity: ListTileControlAffinity.leading,
                        dense: true,
                        contentPadding:
                            const EdgeInsets.symmetric(horizontal: 8),
                        activeColor: AppTheme.primaryIndigo,
                      );
                    }),
                    CheckboxListTile(
                      value: customServiceEnabled,
                      onChanged: (v) {
                        setSheet(() {
                          customServiceEnabled = v ?? false;
                          if (!customServiceEnabled) {
                            customServiceController.clear();
                          }
                        });
                        setState(() {});
                      },
                      title: const Text('Other (specify)',
                          style: TextStyle(fontSize: 14)),
                      controlAffinity: ListTileControlAffinity.leading,
                      dense: true,
                      contentPadding:
                          const EdgeInsets.symmetric(horizontal: 8),
                      activeColor: AppTheme.primaryIndigo,
                    ),
                    const SizedBox(height: 4),
                    SizedBox(
                      width: double.infinity,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        child: ElevatedButton(
                          onPressed: () => Navigator.pop(ctx),
                          style: AppTheme.primaryButton(),
                          child: const Text('Done'),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
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
            color: value == null ? AppTheme.mutedForeground : AppTheme.foreground,
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
              color: AppTheme.primaryIndigo50,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppTheme.primaryIndigo100),
            ),
            child: Row(
              children: [
                const Icon(Icons.insert_drive_file,
                    color: AppTheme.primaryIndigo),
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
                border: Border.all(
                  color: AppTheme.border,
                  style: BorderStyle.solid,
                ),
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

  Widget _buildTypeChip() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppTheme.primaryIndigo50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppTheme.primaryIndigo100),
      ),
      child: Row(
        children: [
          const Icon(Icons.category, color: AppTheme.primaryIndigo, size: 20),
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
                  _labelForType(selectedGrievanceType),
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.bold,
                    color: AppTheme.foreground,
                  ),
                ),
              ],
            ),
          ),
          TextButton.icon(
            onPressed: submitting ? null : () => Navigator.pop(context),
            icon: const Icon(Icons.swap_horiz, size: 18),
            label: const Text('Change'),
            style: TextButton.styleFrom(
              foregroundColor: AppTheme.primaryIndigo,
              padding: const EdgeInsets.symmetric(horizontal: 10),
            ),
          ),
        ],
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
              style: TextStyle(
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
