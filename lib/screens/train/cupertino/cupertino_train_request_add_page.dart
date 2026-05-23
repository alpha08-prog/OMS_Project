import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show Colors;
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../../../services/http_service.dart';
import '../../../theme/app_theme.dart';
import '../../../utils/access_control.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../widgets/cupertino/cupertino_form_helpers.dart';

/// Train EQ (Emergency Quota) request form — Cupertino variant.
///
/// Mirrors the deployed web layout (2026-05-22) — one primary passenger + an
/// "Additional Travellers" count, no per-extra-row fields. Cap = 6 total
/// passengers per PNR (1 primary + up to 5 additional).
class CupertinoTrainRequestAddPage extends StatefulWidget {
  final String role;
  final Future<void> Function()? onCreated;

  const CupertinoTrainRequestAddPage({
    super.key,
    required this.role,
    this.onCreated,
  });

  @override
  State<CupertinoTrainRequestAddPage> createState() =>
      _CupertinoTrainRequestAddPageState();
}

class _CupertinoTrainRequestAddPageState
    extends State<CupertinoTrainRequestAddPage> {
  static const Color primaryBlue = Color(0xFF0A2E5C);
  static const Color bgLight = Color(0xFFF4F6FB);
  static const int _maxAdditional = 5;

  // Primary passenger
  final primaryNameController = TextEditingController();
  final primaryAgeController = TextEditingController();
  final primaryWaitlistController = TextEditingController();
  String _primaryGender = '';

  // Additional travellers
  final additionalTravellersController = TextEditingController(text: '0');

  // Contact + PNR + referenced
  final pnrController = TextEditingController();
  final contactNumberController = TextEditingController();
  final referencedByController = TextEditingController();

  // Train
  final trainNameController = TextEditingController();
  final trainNumberController = TextEditingController();
  final fromStationController = TextEditingController();
  final toStationController = TextEditingController();
  DateTime? dateOfJourney;
  String selectedClass = 'SL';

  bool submitting = false;
  bool fetchingPNR = false;

  // Validation errors
  String? _primaryNameError;
  String? _ageError;
  String? _additionalError;
  String? _phoneError;
  String? _pnrError;
  String? _referencedError;
  String? _fromError;
  String? _toError;

  final List<String> journeyClasses = const [
    'SL',
    '3A',
    '2A',
    '1A',
    'CC',
    'EC',
    '2S',
    'FC',
  ];

  static const List<Map<String, String>> _genderOptions = [
    {'value': '', 'label': 'Select'},
    {'value': 'MALE', 'label': 'Male'},
    {'value': 'FEMALE', 'label': 'Female'},
    {'value': 'OTHER', 'label': 'Other'},
  ];

  @override
  void dispose() {
    primaryNameController.dispose();
    primaryAgeController.dispose();
    primaryWaitlistController.dispose();
    additionalTravellersController.dispose();
    pnrController.dispose();
    contactNumberController.dispose();
    referencedByController.dispose();
    trainNameController.dispose();
    trainNumberController.dispose();
    fromStationController.dispose();
    toStationController.dispose();
    super.dispose();
  }

  Future<void> _fetchPNRStatus() async {
    final pnr = pnrController.text.trim();
    if (pnr.length != 10) {
      CupertinoToast.show(context, "PNR must be 10 digits", isError: true);
      return;
    }

    setState(() => fetchingPNR = true);

    try {
      final res = await HttpService.get("/api/train-requests/pnr/$pnr");

      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final data = decoded["data"] ?? decoded;

        setState(() {
          trainNameController.text = data["trainName"] ?? '';
          trainNumberController.text = data["trainNumber"] ?? '';
          fromStationController.text = data["from"] ?? '';
          toStationController.text = data["to"] ?? '';

          final doj = data["dateOfJourney"];
          if (doj != null && doj != 'N/A') {
            try {
              dateOfJourney = DateTime.parse(doj);
            } catch (_) {}
          }

          final cls = data["class"];
          if (cls != null && journeyClasses.contains(cls)) {
            selectedClass = cls;
          }

          final passengerList = data["passengers"] as List? ?? [];
          if (passengerList.isNotEmpty) {
            final p0 = passengerList.first as Map;
            primaryNameController.text = (p0["name"] ?? '').toString();
            primaryAgeController.text = (p0["age"] ?? '').toString();
            final g = (p0["gender"] ?? '').toString().toUpperCase();
            if (g == 'MALE' || g == 'FEMALE' || g == 'OTHER') {
              _primaryGender = g;
            }
            final cs = (p0["currentStatus"] ?? '').toString();
            final bs = (p0["bookingStatus"] ?? '').toString();
            primaryWaitlistController.text = cs.isNotEmpty ? cs : bs;
          }
          final extra =
              (passengerList.length > 1 ? passengerList.length - 1 : 0)
                  .clamp(0, _maxAdditional);
          additionalTravellersController.text = '$extra';
        });

        CupertinoToast.show(
          context,
          data["isMock"] == true
              ? "PNR fetched (mock data)"
              : "PNR fetched successfully",
        );
      } else {
        CupertinoToast.show(context, "PNR fetch failed (${res.statusCode})",
            isError: true);
      }
    } catch (_) {
      CupertinoToast.show(context, "Server error", isError: true);
    } finally {
      if (mounted) setState(() => fetchingPNR = false);
    }
  }

  Future<void> _pickDate() async {
    DateTime temp = dateOfJourney ?? DateTime.now().add(const Duration(days: 1));
    await showCupertinoModalPopup<void>(
      context: context,
      builder: (ctx) => Container(
        height: 280,
        color: AppTheme.surface,
        child: Column(
          children: [
            SizedBox(
              height: 44,
              child: Row(
                children: [
                  CupertinoButton(
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text('Cancel'),
                  ),
                  const Spacer(),
                  CupertinoButton(
                    onPressed: () {
                      setState(() => dateOfJourney = temp);
                      Navigator.pop(ctx);
                    },
                    child: const Text('Done'),
                  ),
                ],
              ),
            ),
            Expanded(
              child: CupertinoDatePicker(
                mode: CupertinoDatePickerMode.date,
                initialDateTime: temp,
                minimumDate: DateTime.now().subtract(const Duration(days: 1)),
                maximumDate: DateTime.now().add(const Duration(days: 120)),
                onDateTimeChanged: (d) => temp = d,
              ),
            ),
          ],
        ),
      ),
    );
  }

  bool _validate() {
    bool ok = true;
    _primaryNameError =
        primaryNameController.text.trim().isEmpty ? 'Required' : null;
    if (_primaryNameError != null) ok = false;

    final ageStr = primaryAgeController.text.trim();
    if (ageStr.isNotEmpty) {
      final n = int.tryParse(ageStr);
      _ageError = (n == null || n <= 0 || n > 120) ? '1–120' : null;
      if (_ageError != null) ok = false;
    } else {
      _ageError = null;
    }

    final addStr = additionalTravellersController.text.trim();
    final addN = int.tryParse(addStr.isEmpty ? '0' : addStr);
    _additionalError =
        (addN == null || addN < 0 || addN > _maxAdditional)
            ? '0–$_maxAdditional'
            : null;
    if (_additionalError != null) ok = false;

    final phone = contactNumberController.text.trim();
    if (phone.isEmpty) {
      _phoneError = 'Phone number is required';
      ok = false;
    } else if (!RegExp(r'^\d{10}$').hasMatch(phone)) {
      _phoneError = 'Enter a valid 10-digit phone number';
      ok = false;
    } else {
      _phoneError = null;
    }

    final pnr = pnrController.text.trim();
    if (pnr.length != 10) {
      _pnrError = 'Enter 10-digit PNR';
      ok = false;
    } else {
      _pnrError = null;
    }

    _referencedError = referencedByController.text.trim().isEmpty
        ? 'Referenced By is required'
        : null;
    if (_referencedError != null) ok = false;

    _fromError = fromStationController.text.trim().isEmpty
        ? 'From station is required'
        : null;
    if (_fromError != null) ok = false;

    _toError = toStationController.text.trim().isEmpty
        ? 'To station is required'
        : null;
    if (_toError != null) ok = false;

    setState(() {});
    return ok;
  }

  Future<void> _submit() async {
    if (!_validate()) return;
    if (dateOfJourney == null) {
      CupertinoToast.show(context, "Please select date of journey",
          isError: true);
      return;
    }

    setState(() => submitting = true);
    try {
      final primaryName = primaryNameController.text.trim();
      final ageStr = primaryAgeController.text.trim();
      final waitlist = primaryWaitlistController.text.trim();
      final addStr = additionalTravellersController.text.trim();
      final additional = int.tryParse(addStr.isEmpty ? '0' : addStr) ?? 0;
      final fromStation = fromStationController.text.trim();
      final toStation = toStationController.text.trim();

      final body = <String, dynamic>{
        "passengerName": primaryName,
        "pnrNumber": pnrController.text.trim(),
        "contactNumber": contactNumberController.text.trim(),
        "trainName": trainNameController.text.trim(),
        "trainNumber": trainNumberController.text.trim(),
        "journeyClass": selectedClass,
        "dateOfJourney": dateOfJourney!.toIso8601String(),
        "fromStation": fromStation,
        "toStation": toStation,
        "route": "$fromStation to $toStation",
        "referencedBy": referencedByController.text.trim(),
        "numberOfPassengers": 1 + additional,
        "passengers": [
          <String, dynamic>{
            "name": primaryName,
            if (_primaryGender.isNotEmpty) "gender": _primaryGender,
            if (ageStr.isNotEmpty) "age": int.tryParse(ageStr) ?? 0,
            if (waitlist.isNotEmpty) "currentStatus": waitlist,
          },
        ],
      };

      final res = await HttpService.post("/api/train-requests", body);

      if (res.statusCode == 201 || res.statusCode == 200) {
        if (widget.role == Roles.staff) {
          await _showPdfReadyDialog(
            title: 'Train EQ Request Generated',
            content: const Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                      text:
                          'Your Train EQ request has been created.\n\nGo to '),
                  TextSpan(
                    text: 'Print Center',
                    style: TextStyle(fontWeight: FontWeight.bold),
                  ),
                  TextSpan(
                      text:
                          ' to download the EQ Letter PDF once it is approved.'),
                ],
              ),
            ),
          );
        } else {
          CupertinoToast.show(context, "Train request created");
        }
        if (widget.onCreated != null) await widget.onCreated!();
        if (!mounted) return;
        Navigator.pop(context, true);
      } else {
        String msg = "Failed (${res.statusCode})";
        try {
          final data = jsonDecode(res.body);
          msg = data["message"] ?? msg;
          final errs = data["errors"];
          if (errs is List && errs.isNotEmpty) {
            final first = errs.first;
            if (first is Map && first["message"] != null) {
              msg = "$msg: ${first["message"]}";
            }
          }
        } catch (_) {}
        CupertinoToast.show(context, msg, isError: true);
      }
    } catch (_) {
      CupertinoToast.show(context, "Server error", isError: true);
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

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

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      backgroundColor: bgLight,
      navigationBar: const CupertinoNavigationBar(
        backgroundColor: primaryBlue,
        brightness: Brightness.dark,
        middle: Text(
          "Train EQ Entry",
          style: TextStyle(color: CupertinoColors.white),
        ),
      ),
      child: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              "Generate Railway Emergency Quota letter instantly",
              style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
            ),
            const SizedBox(height: 16),
            _buildPassengerCard(),
            const SizedBox(height: 16),
            _buildTrainCard(),
            const SizedBox(height: 20),
            _buildSubmitButton(),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  Widget _buildPassengerCard() {
    return _card(
      title: "PASSENGER INFORMATION",
      children: [
        // Cap banner
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFFEFF6FF),
            border: Border.all(color: const Color(0xFFBFDBFE)),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            children: [
              const Icon(CupertinoIcons.info,
                  color: Color(0xFF1D4ED8), size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  "General bookings (AC/Non-AC) allow maximum 6 passengers per PNR",
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.blue.shade900,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        _label("Primary Passenger Name *"),
        _textField(
          controller: primaryNameController,
          placeholder: "Full name of the primary passenger",
          textCapitalization: TextCapitalization.words,
        ),
        if (_primaryNameError != null) _errorText(_primaryNameError!),
        const SizedBox(height: 12),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              flex: 3,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _label("Gender"),
                  _pickerField(
                    value: _primaryGender,
                    options: _genderOptions,
                    onSelected: (v) => setState(() => _primaryGender = v),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              flex: 2,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _label("Age"),
                  _textField(
                    controller: primaryAgeController,
                    placeholder: "Age",
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  ),
                  if (_ageError != null) _errorText(_ageError!),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              flex: 3,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _label("W/L"),
                  _textField(
                    controller: primaryWaitlistController,
                    placeholder: "e.g. WL/12",
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        _label("Additional Travellers *"),
        _textField(
          controller: additionalTravellersController,
          placeholder: "0",
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
        ),
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(
            "Other people travelling on the same PNR (excluding the primary). Max $_maxAdditional.",
            style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
          ),
        ),
        if (_additionalError != null) _errorText(_additionalError!),
        const SizedBox(height: 12),
        _label("Phone Number (Primary Passenger) *"),
        _textField(
          controller: contactNumberController,
          placeholder: "10-digit mobile number",
          keyboardType: TextInputType.phone,
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly,
            LengthLimitingTextInputFormatter(10),
          ],
        ),
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(
            "Contact number for the primary passenger",
            style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
          ),
        ),
        if (_phoneError != null) _errorText(_phoneError!),
        const SizedBox(height: 12),
        _label("PNR Number *"),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: _textField(
                controller: pnrController,
                placeholder: "10-digit PNR",
                keyboardType: TextInputType.number,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(10),
                ],
              ),
            ),
            const SizedBox(width: 8),
            CupertinoButton(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              color: primaryBlue,
              borderRadius: BorderRadius.circular(8),
              onPressed: fetchingPNR ? null : _fetchPNRStatus,
              child: fetchingPNR
                  ? const CupertinoActivityIndicator(
                      color: CupertinoColors.white)
                  : const Text(
                      "Fetch",
                      style: TextStyle(color: CupertinoColors.white),
                    ),
            ),
          ],
        ),
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(
            "Click Fetch to auto-fill train details",
            style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
          ),
        ),
        if (_pnrError != null) _errorText(_pnrError!),
        const SizedBox(height: 12),
        _label("Referenced By *"),
        _textField(
          controller: referencedByController,
          placeholder: "Eg: MP Recommendation / Emergency Call",
        ),
        if (_referencedError != null) _errorText(_referencedError!),
      ],
    );
  }

  Widget _buildTrainCard() {
    final dateStr = dateOfJourney == null
        ? "dd-mm-yyyy"
        : DateFormat('dd-MM-yyyy').format(dateOfJourney!);

    return _card(
      title: "TRAIN DETAILS",
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _label("Train Number"),
                  _textField(
                    controller: trainNumberController,
                    placeholder: "e.g. 12301",
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _label("Train Name"),
                  _textField(
                    controller: trainNameController,
                    placeholder: "e.g. Rajdhani Express",
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _label("Date of Journey *"),
                  GestureDetector(
                    onTap: _pickDate,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 14),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        border: Border.all(color: AppTheme.border),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              dateStr,
                              style: TextStyle(
                                color: dateOfJourney == null
                                    ? Colors.grey.shade500
                                    : Colors.black,
                              ),
                            ),
                          ),
                          const Icon(CupertinoIcons.calendar,
                              size: 18, color: AppTheme.muted),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _label("Class *"),
                  GestureDetector(
                    onTap: () => CupertinoFormHelpers.showPicker(
                      context: context,
                      items: journeyClasses,
                      currentValue: selectedClass,
                      onSelected: (v) => setState(() => selectedClass = v),
                      title: 'Class',
                    ),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 14),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        border: Border.all(color: AppTheme.border),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              selectedClass,
                              style: const TextStyle(color: Colors.black),
                            ),
                          ),
                          const Icon(CupertinoIcons.chevron_down,
                              size: 16, color: AppTheme.muted),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _label("From Station *"),
                  _textField(
                    controller: fromStationController,
                    placeholder: "e.g. New Delhi (NDLS)",
                  ),
                  if (_fromError != null) _errorText(_fromError!),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _label("To Station *"),
                  _textField(
                    controller: toStationController,
                    placeholder: "e.g. Mumbai (BCT)",
                  ),
                  if (_toError != null) _errorText(_toError!),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildSubmitButton() {
    return SizedBox(
      width: double.infinity,
      child: CupertinoButton(
        padding: const EdgeInsets.symmetric(vertical: 14),
        color: const Color(0xFFF59E0B),
        borderRadius: BorderRadius.circular(10),
        onPressed: submitting ? null : _submit,
        child: submitting
            ? const CupertinoActivityIndicator(color: CupertinoColors.black)
            : const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(CupertinoIcons.arrow_up_right_square,
                      size: 18, color: CupertinoColors.black),
                  SizedBox(width: 8),
                  Text(
                    "Generate EQ Letter",
                    style: TextStyle(
                      color: CupertinoColors.black,
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                    ),
                  ),
                ],
              ),
      ),
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  Widget _card({required String title, required List<Widget> children}) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.bold,
              color: primaryBlue,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 14),
          ...children,
        ],
      ),
    );
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(
          text,
          style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: AppTheme.foreground,
          ),
        ),
      );

  Widget _textField({
    required TextEditingController controller,
    String? placeholder,
    TextInputType? keyboardType,
    List<TextInputFormatter>? inputFormatters,
    TextCapitalization textCapitalization = TextCapitalization.none,
  }) {
    return CupertinoTextField(
      controller: controller,
      placeholder: placeholder,
      keyboardType: keyboardType,
      inputFormatters: inputFormatters,
      textCapitalization: textCapitalization,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: AppTheme.border),
        borderRadius: BorderRadius.circular(8),
      ),
    );
  }

  Widget _pickerField({
    required String value,
    required List<Map<String, String>> options,
    required ValueChanged<String> onSelected,
  }) {
    final label =
        options.firstWhere((o) => o['value'] == value, orElse: () => options.first)['label']!;
    return GestureDetector(
      onTap: () {
        final items = options.map((o) => o['label']!).toList();
        final initial = options
            .firstWhere((o) => o['value'] == value, orElse: () => options.first);
        CupertinoFormHelpers.showPicker(
          context: context,
          items: items,
          currentValue: initial['label']!,
          onSelected: (selectedLabel) {
            final match = options.firstWhere(
              (o) => o['label'] == selectedLabel,
              orElse: () => options.first,
            );
            onSelected(match['value']!);
          },
        );
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: AppTheme.border),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                label,
                style: TextStyle(
                  color: value.isEmpty ? Colors.grey.shade500 : Colors.black,
                ),
              ),
            ),
            const Icon(CupertinoIcons.chevron_down,
                size: 16, color: AppTheme.muted),
          ],
        ),
      ),
    );
  }

  Widget _errorText(String msg) => Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Text(
          msg,
          style: const TextStyle(
            fontSize: 11,
            color: Color(0xFFDC2626),
            fontWeight: FontWeight.w600,
          ),
        ),
      );
}
