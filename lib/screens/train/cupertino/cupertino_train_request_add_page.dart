import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:intl/intl.dart';

import '../../../services/http_service.dart';
import '../../../theme/app_theme.dart';
import '../../../widgets/cupertino/cupertino_toast.dart';
import '../../../widgets/cupertino/cupertino_form_helpers.dart';
import '../../../widgets/cupertino/cupertino_page_header.dart';

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

  // Controllers
  final pnrController = TextEditingController();
  final trainNameController = TextEditingController();
  final trainNumberController = TextEditingController();
  final fromStationController = TextEditingController();
  final toStationController = TextEditingController();
  final contactNumberController = TextEditingController();
  final referencedByController = TextEditingController();
  final remarksController = TextEditingController();

  DateTime? dateOfJourney;
  String selectedBookingType = 'GENERAL';
  String selectedClass = 'SL';

  // Passengers
  List<Map<String, dynamic>> passengers = [];

  // State
  bool submitting = false;
  bool fetchingPNR = false;
  bool _signatureAcknowledged = false;

  // Validation errors
  String? _pnrError;
  String? _fromError;
  String? _toError;
  String? _passengersError;

  final List<Map<String, String>> bookingTypes = [
    {'value': 'GENERAL', 'label': 'General'},
    {'value': 'TATKAL', 'label': 'Tatkal'},
    {'value': 'PREMIUM_TATKAL', 'label': 'Premium Tatkal'},
    {'value': 'LADIES', 'label': 'Ladies Quota'},
    {'value': 'LOWER_BERTH', 'label': 'Lower Berth'},
    {'value': 'DUTY_PASS', 'label': 'Duty Pass'},
  ];

  final List<String> journeyClasses = [
    'SL', '3A', '2A', '1A', 'CC', 'EC', '2S', 'FC',
  ];

  @override
  void dispose() {
    pnrController.dispose();
    trainNameController.dispose();
    trainNumberController.dispose();
    fromStationController.dispose();
    toStationController.dispose();
    contactNumberController.dispose();
    referencedByController.dispose();
    remarksController.dispose();
    super.dispose();
  }

  void _addPassenger() {
    setState(() {
      passengers.add({
        'name': '',
        'age': '',
        'gender': '',
        'berthPreference': '',
        'waitingList': '',
      });
      _passengersError = null;
    });
  }

  void _removePassenger(int index) {
    setState(() {
      passengers.removeAt(index);
    });
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
          passengers = passengerList.map<Map<String, dynamic>>((p) {
            final cs = (p["currentStatus"] ?? '').toString();
            final bs = (p["bookingStatus"] ?? '').toString();
            return {
              'name': p["name"] ?? '',
              'age': (p["age"] ?? '').toString(),
              'gender': p["gender"] ?? '',
              'berthPreference': '',
              'bookingStatus': bs,
              'currentStatus': cs,
              'waitingList': cs.isNotEmpty ? cs : bs,
            };
          }).toList();
          _passengersError = null;
        });

        CupertinoToast.show(
          context,
          data["isMock"] == true
              ? "PNR fetched (mock data)"
              : "PNR fetched successfully",
        );
      } else {
        CupertinoToast.show(
            context, "PNR fetch failed (${res.statusCode})",
            isError: true);
      }
    } catch (e) {
      CupertinoToast.show(context, "Server error", isError: true);
    } finally {
      setState(() => fetchingPNR = false);
    }
  }

  void _pickDate() {
    CupertinoFormHelpers.showDatePicker(
      context: context,
      initialDate:
          dateOfJourney ?? DateTime.now().add(const Duration(days: 1)),
      minimumDate: DateTime.now(),
      maximumDate: DateTime.now().add(const Duration(days: 120)),
      onDateSelected: (date) {
        setState(() => dateOfJourney = date);
      },
    );
  }

  bool _validate() {
    bool valid = true;
    setState(() {
      _pnrError = (pnrController.text.trim().length != 10)
          ? "Enter 10-digit PNR"
          : null;
      _fromError = fromStationController.text.trim().isEmpty
          ? "Required"
          : null;
      _toError =
          toStationController.text.trim().isEmpty ? "Required" : null;

      if (passengers.isEmpty) {
        _passengersError = "Add at least one passenger";
      } else {
        _passengersError = null;
        for (final p in passengers) {
          final name = (p['name'] ?? '').toString().trim();
          final ageStr = (p['age'] ?? '').toString().trim();
          final gender = (p['gender'] ?? '').toString().trim();
          final wl = (p['waitingList'] ?? '').toString().trim();
          final ageNum = int.tryParse(ageStr);

          p['nameError'] = name.isEmpty ? "Required" : null;
          p['ageError'] = ageStr.isEmpty
              ? "Required"
              : (ageNum == null || ageNum <= 0 ? "Invalid" : null);
          p['genderError'] = gender.isEmpty ? "Required" : null;
          p['waitingListError'] = wl.isEmpty ? "Required" : null;
        }
      }
    });

    if (_pnrError != null || _fromError != null || _toError != null) {
      valid = false;
    }
    if (_passengersError != null) valid = false;
    for (final p in passengers) {
      if (p['nameError'] != null ||
          p['ageError'] != null ||
          p['genderError'] != null ||
          p['waitingListError'] != null) {
        valid = false;
      }
    }
    return valid;
  }

  /// Backend's express-validator on POST /api/train-requests requires a
  /// non-empty top-level `passengerName`. Derive it from the first named
  /// passenger; fall back to the PNR so the request still goes through
  /// when the staff hasn't filled the passengers list.
  String _leadPassengerName() {
    for (final p in passengers) {
      final n = (p['name'] ?? '').toString().trim();
      if (n.isNotEmpty) return n;
    }
    final pnr = pnrController.text.trim();
    return pnr.isNotEmpty ? 'PNR $pnr' : 'Not specified';
  }

  /// Backend allows an empty contact number, but if non-empty it MUST be
  /// exactly 10 digits. Strip non-digits; only forward when valid.
  String _sanitizedContactNumber() {
    final raw = contactNumberController.text.trim();
    final digits = raw.replaceAll(RegExp(r'\D'), '');
    return digits.length == 10 ? digits : '';
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
      final body = {
        "passengerName": _leadPassengerName(),
        "pnrNumber": pnrController.text.trim(),
        "trainName": trainNameController.text.trim(),
        "trainNumber": trainNumberController.text.trim(),
        "bookingType": selectedBookingType,
        "journeyClass": selectedClass,
        "dateOfJourney": dateOfJourney!.toIso8601String(),
        "fromStation": fromStationController.text.trim(),
        "toStation": toStationController.text.trim(),
        "contactNumber": _sanitizedContactNumber(),
        "referencedBy": referencedByController.text.trim(),
        "remarks": remarksController.text.trim(),
        "passengers": passengers
            .map((p) => {
                  "name": p['name'],
                  "age": int.tryParse(p['age']?.toString() ?? '') ?? 30,
                  "gender": p['gender'] ?? 'MALE',
                  "berthPreference": p['berthPreference'] ?? '',
                  "bookingStatus": p['bookingStatus'] ?? '',
                  // UI's "Waiting List" maps to backend's currentStatus
                  // column (no separate waitingList column in Catalyst).
                  "currentStatus": (p['waitingList']?.toString().trim().isNotEmpty ?? false)
                      ? p['waitingList']
                      : (p['currentStatus'] ?? ''),
                })
            .toList(),
      };

      final res = await HttpService.post("/api/train-requests", body);

      if (res.statusCode == 201 || res.statusCode == 200) {
        CupertinoToast.show(context, "Train request created");

        if (widget.onCreated != null) {
          await widget.onCreated!();
        }

        Navigator.pop(context, true);
      } else {
        String msg = "Failed (${res.statusCode})";
        try {
          final data = jsonDecode(res.body);
          msg = data["message"] ?? msg;
          // Surface the first specific field error for easier debugging.
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
    } catch (e) {
      CupertinoToast.show(context, "Server error", isError: true);
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      backgroundColor: bgLight,
      child: Column(
        children: [
          OmsPageHeader(title: "New Train Request", showBack: false),
          Expanded(
            child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // PNR Section
            _buildCard(
              title: "PNR DETAILS",
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          CupertinoTextField(
                            controller: pnrController,
                            keyboardType: TextInputType.number,
                            maxLength: 10,
                            placeholder: "PNR Number *",
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 14),
                            decoration: BoxDecoration(
                              color: AppTheme.backgroundAlt,
                              borderRadius:
                                  BorderRadius.circular(AppTheme.radiusMd),
                              border: Border.all(
                                  color: _pnrError != null
                                      ? AppTheme.destructiveRed
                                      : AppTheme.border),
                            ),
                          ),
                          if (_pnrError != null)
                            Padding(
                              padding: const EdgeInsets.only(top: 4, left: 4),
                              child: Text(_pnrError!,
                                  style: const TextStyle(
                                      color: AppTheme.destructiveRed,
                                      fontSize: 12)),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    CupertinoButton.filled(
                      onPressed: fetchingPNR ? null : _fetchPNRStatus,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 14),
                      child: fetchingPNR
                          ? const CupertinoActivityIndicator(
                              color: CupertinoColors.white)
                          : const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(CupertinoIcons.search, size: 18),
                                SizedBox(width: 6),
                                Text("Fetch"),
                              ],
                            ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                GestureDetector(
                  onTap: () {
                    CupertinoFormHelpers.showPicker(
                      context: context,
                      items: bookingTypes
                          .map((t) => t['label']!)
                          .toList(),
                      currentValue: bookingTypes
                          .firstWhere(
                              (t) => t['value'] == selectedBookingType)['label']!,
                      title: "Booking Type",
                      onSelected: (label) {
                        final type = bookingTypes
                            .firstWhere((t) => t['label'] == label);
                        setState(
                            () => selectedBookingType = type['value']!);
                      },
                    );
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 14),
                    decoration: BoxDecoration(
                      color: AppTheme.backgroundAlt,
                      borderRadius:
                          BorderRadius.circular(AppTheme.radiusMd),
                      border: Border.all(color: AppTheme.border),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            "Booking Type: ${bookingTypes.firstWhere((t) => t['value'] == selectedBookingType)['label']}",
                            style: const TextStyle(fontSize: 15),
                          ),
                        ),
                        const Icon(CupertinoIcons.chevron_down,
                            size: 16,
                            color: CupertinoColors.systemGrey),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Train Details
            _buildCard(
              title: "TRAIN DETAILS",
              children: [
                Row(
                  children: [
                    Expanded(
                      child: CupertinoTextField(
                        controller: trainNumberController,
                        placeholder: "Train Number",
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 14),
                        decoration: BoxDecoration(
                          color: AppTheme.backgroundAlt,
                          borderRadius:
                              BorderRadius.circular(AppTheme.radiusMd),
                          border: Border.all(color: AppTheme.border),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 2,
                      child: CupertinoTextField(
                        controller: trainNameController,
                        placeholder: "Train Name",
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 14),
                        decoration: BoxDecoration(
                          color: AppTheme.backgroundAlt,
                          borderRadius:
                              BorderRadius.circular(AppTheme.radiusMd),
                          border: Border.all(color: AppTheme.border),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          CupertinoTextField(
                            controller: fromStationController,
                            placeholder: "From Station *",
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 14),
                            decoration: BoxDecoration(
                              color: AppTheme.backgroundAlt,
                              borderRadius: BorderRadius.circular(
                                  AppTheme.radiusMd),
                              border: Border.all(
                                  color: _fromError != null
                                      ? AppTheme.destructiveRed
                                      : AppTheme.border),
                            ),
                          ),
                          if (_fromError != null)
                            Padding(
                              padding:
                                  const EdgeInsets.only(top: 4, left: 4),
                              child: Text(_fromError!,
                                  style: const TextStyle(
                                      color: AppTheme.destructiveRed,
                                      fontSize: 12)),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          CupertinoTextField(
                            controller: toStationController,
                            placeholder: "To Station *",
                            padding: const EdgeInsets.symmetric(
                                horizontal: 12, vertical: 14),
                            decoration: BoxDecoration(
                              color: AppTheme.backgroundAlt,
                              borderRadius: BorderRadius.circular(
                                  AppTheme.radiusMd),
                              border: Border.all(
                                  color: _toError != null
                                      ? AppTheme.destructiveRed
                                      : AppTheme.border),
                            ),
                          ),
                          if (_toError != null)
                            Padding(
                              padding:
                                  const EdgeInsets.only(top: 4, left: 4),
                              child: Text(_toError!,
                                  style: const TextStyle(
                                      color: AppTheme.destructiveRed,
                                      fontSize: 12)),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                GestureDetector(
                  onTap: () {
                    CupertinoFormHelpers.showPicker(
                      context: context,
                      items: journeyClasses,
                      currentValue: selectedClass,
                      title: "Class",
                      onSelected: (v) =>
                          setState(() => selectedClass = v),
                    );
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 14),
                    decoration: BoxDecoration(
                      color: AppTheme.backgroundAlt,
                      borderRadius: BorderRadius.circular(AppTheme.radiusMd),
                      border: Border.all(color: AppTheme.border),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text("Class: $selectedClass",
                              style: const TextStyle(fontSize: 15)),
                        ),
                        const Icon(CupertinoIcons.chevron_down,
                            size: 16, color: CupertinoColors.systemGrey),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                GestureDetector(
                  onTap: _pickDate,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 14),
                    decoration: BoxDecoration(
                      color: AppTheme.backgroundAlt,
                      borderRadius:
                          BorderRadius.circular(AppTheme.radiusMd),
                      border: Border.all(color: AppTheme.border),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            dateOfJourney != null
                                ? "Journey: ${DateFormat('dd MMM yyyy').format(dateOfJourney!)}"
                                : "Date of Journey *",
                            style: TextStyle(
                              fontSize: 15,
                              color: dateOfJourney != null
                                  ? AppTheme.foreground
                                  : CupertinoColors.systemGrey,
                            ),
                          ),
                        ),
                        const Icon(CupertinoIcons.calendar,
                            size: 18,
                            color: CupertinoColors.systemGrey),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Passengers Section
            _buildCard(
              title: "PASSENGERS",
              trailing: CupertinoButton(
                padding: EdgeInsets.zero,
                minSize: 0,
                onPressed: _addPassenger,
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(CupertinoIcons.add, size: 18),
                    SizedBox(width: 4),
                    Text("Add"),
                  ],
                ),
              ),
              children: [
                if (passengers.isEmpty)
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(
                      _passengersError ??
                          "No passengers added. Click 'Add' to add passengers.",
                      style: TextStyle(
                        color: _passengersError != null
                            ? AppTheme.destructiveRed
                            : CupertinoColors.systemGrey,
                      ),
                    ),
                  )
                else
                  ...passengers.asMap().entries.map((entry) {
                    final index = entry.key;
                    final passenger = entry.value;
                    return _buildPassengerCard(index, passenger);
                  }),
              ],
            ),
            const SizedBox(height: 16),

            // Contact & Reference
            _buildCard(
              title: "CONTACT & REFERENCE",
              children: [
                CupertinoTextField(
                  controller: contactNumberController,
                  keyboardType: TextInputType.phone,
                  placeholder: "Contact Number",
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 14),
                  decoration: BoxDecoration(
                    color: AppTheme.backgroundAlt,
                    borderRadius:
                        BorderRadius.circular(AppTheme.radiusMd),
                    border: Border.all(color: AppTheme.border),
                  ),
                ),
                const SizedBox(height: 12),
                CupertinoTextField(
                  controller: referencedByController,
                  placeholder: "Referenced By",
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 14),
                  decoration: BoxDecoration(
                    color: AppTheme.backgroundAlt,
                    borderRadius:
                        BorderRadius.circular(AppTheme.radiusMd),
                    border: Border.all(color: AppTheme.border),
                  ),
                ),
                const SizedBox(height: 12),
                CupertinoTextField(
                  controller: remarksController,
                  maxLines: 2,
                  placeholder: "Remarks",
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 14),
                  decoration: BoxDecoration(
                    color: AppTheme.backgroundAlt,
                    borderRadius:
                        BorderRadius.circular(AppTheme.radiusMd),
                    border: Border.all(color: AppTheme.border),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Digital Signature gate
            Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: CupertinoColors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: _signatureAcknowledged
                      ? AppTheme.primaryIndigo
                      : CupertinoColors.systemGrey4,
                  width: _signatureAcknowledged ? 1.5 : 1,
                ),
              ),
              child: Row(
                children: [
                  CupertinoSwitch(
                    value: _signatureAcknowledged,
                    activeTrackColor: AppTheme.primaryIndigo,
                    onChanged: (v) =>
                        setState(() => _signatureAcknowledged = v),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          "Attach Digital Signature",
                          style: TextStyle(
                              fontSize: 15, fontWeight: FontWeight.w600),
                        ),
                        SizedBox(height: 2),
                        Text(
                          "Appends Minister's stored digital signature to the PDF",
                          style: TextStyle(
                              fontSize: 12,
                              color: CupertinoColors.systemGrey),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Submit Button
            SizedBox(
              width: double.infinity,
              child: CupertinoButton.filled(
                onPressed: (submitting || !_signatureAcknowledged)
                    ? null
                    : _submit,
                padding: const EdgeInsets.symmetric(vertical: 16),
                borderRadius: BorderRadius.circular(12),
                child: submitting
                    ? const CupertinoActivityIndicator(
                        color: CupertinoColors.white)
                    : Text(
                        _signatureAcknowledged
                            ? "Submit Request"
                            : "Tick the signature box to enable",
                        style: const TextStyle(
                            fontSize: 16, fontWeight: FontWeight.bold),
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

  Widget _buildCard({
    required String title,
    required List<Widget> children,
    Widget? trailing,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: CupertinoColors.black.withOpacity(0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Row(
              children: [
                Text(title,
                    style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: primaryBlue)),
                const Spacer(),
                if (trailing != null) trailing,
              ],
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

  Widget _buildPassengerCard(int index, Map<String, dynamic> passenger) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: bgLight,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: CupertinoColors.systemGrey4),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: primaryBlue,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Center(
                  child: Text("${index + 1}",
                      style: const TextStyle(
                          color: CupertinoColors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.bold)),
                ),
              ),
              const SizedBox(width: 8),
              Text("Passenger ${index + 1}",
                  style: const TextStyle(fontWeight: FontWeight.w600)),
              const Spacer(),
              CupertinoButton(
                padding: EdgeInsets.zero,
                minSize: 0,
                onPressed: () => _removePassenger(index),
                child: const Icon(CupertinoIcons.delete,
                    color: AppTheme.destructiveRed, size: 20),
              ),
            ],
          ),
          const SizedBox(height: 12),
          CupertinoTextField(
            placeholder: "Name *",
            controller:
                TextEditingController(text: passenger['name'] ?? ''),
            padding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: BoxDecoration(
              color: CupertinoColors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: passenger['nameError'] != null
                    ? AppTheme.destructiveRed
                    : AppTheme.border,
              ),
            ),
            onChanged: (v) => passengers[index]['name'] = v,
          ),
          if (passenger['nameError'] != null)
            Padding(
              padding: const EdgeInsets.only(top: 4, left: 4),
              child: Text(
                passenger['nameError'],
                style: const TextStyle(
                    fontSize: 12, color: AppTheme.destructiveRed),
              ),
            ),
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    CupertinoTextField(
                      placeholder: "Age *",
                      controller: TextEditingController(
                          text: passenger['age']?.toString() ?? ''),
                      keyboardType: TextInputType.number,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 12),
                      decoration: BoxDecoration(
                        color: CupertinoColors.white,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: passenger['ageError'] != null
                              ? AppTheme.destructiveRed
                              : AppTheme.border,
                        ),
                      ),
                      onChanged: (v) => passengers[index]['age'] = v,
                    ),
                    if (passenger['ageError'] != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 4, left: 4),
                        child: Text(
                          passenger['ageError'],
                          style: const TextStyle(
                              fontSize: 12,
                              color: AppTheme.destructiveRed),
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
                    GestureDetector(
                      onTap: () {
                        CupertinoFormHelpers.showPicker(
                          context: context,
                          items: const ['Male', 'Female', 'Other'],
                          currentValue: _genderLabel(
                              passenger['gender'] ?? 'MALE'),
                          title: "Sex / Gender",
                          onSelected: (label) {
                            final value = label.toUpperCase();
                            setState(() {
                              passengers[index]['gender'] = value;
                              passengers[index]['genderError'] = null;
                            });
                          },
                        );
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 12),
                        decoration: BoxDecoration(
                          color: CupertinoColors.white,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: passenger['genderError'] != null
                                ? AppTheme.destructiveRed
                                : AppTheme.border,
                          ),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(
                                (passenger['gender']?.toString() ?? '')
                                        .isEmpty
                                    ? "Sex *"
                                    : _genderLabel(passenger['gender']),
                                style: TextStyle(
                                  fontSize: 15,
                                  color: (passenger['gender']?.toString() ??
                                              '')
                                          .isEmpty
                                      ? CupertinoColors.systemGrey
                                      : CupertinoColors.black,
                                ),
                              ),
                            ),
                            const Icon(CupertinoIcons.chevron_down,
                                size: 14,
                                color: CupertinoColors.systemGrey),
                          ],
                        ),
                      ),
                    ),
                    if (passenger['genderError'] != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 4, left: 4),
                        child: Text(
                          passenger['genderError'],
                          style: const TextStyle(
                              fontSize: 12,
                              color: AppTheme.destructiveRed),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          CupertinoTextField(
            placeholder: "Waiting List * (e.g., CNF, RAC, WL/15)",
            controller: TextEditingController(
                text: passenger['waitingList'] ?? ''),
            padding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: BoxDecoration(
              color: CupertinoColors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: passenger['waitingListError'] != null
                    ? AppTheme.destructiveRed
                    : AppTheme.border,
              ),
            ),
            onChanged: (v) => passengers[index]['waitingList'] = v,
          ),
          if (passenger['waitingListError'] != null)
            Padding(
              padding: const EdgeInsets.only(top: 4, left: 4),
              child: Text(
                passenger['waitingListError'],
                style: const TextStyle(
                    fontSize: 12, color: AppTheme.destructiveRed),
              ),
            ),
          const SizedBox(height: 10),
          CupertinoTextField(
            placeholder: "Berth Preference (LB/MB/UB/SL/SU)",
            controller: TextEditingController(
                text: passenger['berthPreference'] ?? ''),
            padding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            decoration: BoxDecoration(
              color: CupertinoColors.white,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppTheme.border),
            ),
            onChanged: (v) => passengers[index]['berthPreference'] = v,
          ),
          if (passenger['bookingStatus']?.toString().isNotEmpty == true ||
              passenger['currentStatus']?.toString().isNotEmpty ==
                  true) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                if (passenger['bookingStatus']?.toString().isNotEmpty ==
                    true)
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: const Color(0xFFE3F2FD),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text("Booking Status",
                              style: TextStyle(
                                  fontSize: 10,
                                  color: CupertinoColors.systemGrey)),
                          Text(passenger['bookingStatus'].toString(),
                              style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                  color: Color(0xFF1565C0))),
                        ],
                      ),
                    ),
                  ),
                if (passenger['bookingStatus']
                            ?.toString()
                            .isNotEmpty ==
                        true &&
                    passenger['currentStatus']
                            ?.toString()
                            .isNotEmpty ==
                        true)
                  const SizedBox(width: 8),
                if (passenger['currentStatus']
                        ?.toString()
                        .isNotEmpty ==
                    true)
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: const Color(0xFFE8F5E9),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text("Current Status",
                              style: TextStyle(
                                  fontSize: 10,
                                  color: CupertinoColors.systemGrey)),
                          Text(
                              passenger['currentStatus'].toString(),
                              style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                  color: Color(0xFF2E7D32))),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  String _genderLabel(dynamic value) {
    final s = (value ?? '').toString().toUpperCase();
    switch (s) {
      case 'MALE':
        return 'Male';
      case 'FEMALE':
        return 'Female';
      case 'OTHER':
        return 'Other';
      default:
        return '';
    }
  }
}
