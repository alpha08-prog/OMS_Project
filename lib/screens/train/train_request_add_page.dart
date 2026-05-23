import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../../services/auth_service.dart';
import '../../services/http_service.dart';
import '../../utils/access_control.dart';

/// Train EQ (Emergency Quota) request form.
///
/// Mirrors the deployed web `TrainEQCreate.tsx` layout (2026-05-22) — one
/// primary passenger + an "Additional Travellers" count, no per-extra-row
/// fields. AC / Non-AC bookings cap total at 6 passengers per PNR (1 primary
/// + up to 5 additional).
class TrainRequestAddPage extends StatefulWidget {
  final Future<void> Function()? onCreated;

  const TrainRequestAddPage({super.key, this.onCreated});

  @override
  State<TrainRequestAddPage> createState() => _TrainRequestAddPageState();
}

class _TrainRequestAddPageState extends State<TrainRequestAddPage> {
  static const Color primaryBlue = Color(0xFF0A2E5C);
  static const Color bgLight = Color(0xFFF4F6FB);

  // Web's MAX_PASSENGERS_GENERAL = 6 (AC / Non-AC). Primary takes one slot,
  // so additional travellers cap at 5.
  static const int _maxAdditional = 5;

  final _formKey = GlobalKey<FormState>();

  // Primary passenger
  final primaryNameController = TextEditingController();
  final primaryAgeController = TextEditingController();
  final primaryWaitlistController = TextEditingController();
  String _primaryGender = ''; // '' | MALE | FEMALE | OTHER

  // Additional travellers (other people on the same PNR, excluding primary)
  final additionalTravellersController = TextEditingController(text: '0');

  // Contact + PNR + referenced
  final pnrController = TextEditingController();
  final contactNumberController = TextEditingController();
  final referencedByController = TextEditingController();

  // Train details
  final trainNameController = TextEditingController();
  final trainNumberController = TextEditingController();
  final fromStationController = TextEditingController();
  final toStationController = TextEditingController();
  DateTime? dateOfJourney;
  String selectedClass = 'SL';

  // State
  bool submitting = false;
  bool fetchingPNR = false;

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
      _snack("PNR must be 10 digits");
      return;
    }

    setState(() => fetchingPNR = true);

    try {
      final res = await HttpService.get("/api/train-requests/pnr/$pnr");

      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final data = decoded["data"] ?? decoded;

        setState(() {
          // Train + journey
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

          // Auto-fill the primary passenger from the first row the PNR
          // returns; the remaining rows just bump the additional-travellers
          // count so staff doesn't have to re-type each name.
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

        _snack(data["isMock"] == true
            ? "PNR fetched (mock data)"
            : "PNR fetched successfully");
      } else {
        _snack("PNR fetch failed (${res.statusCode})");
      }
    } catch (_) {
      _snack("Server error");
    } finally {
      if (mounted) setState(() => fetchingPNR = false);
    }
  }

  Future<void> _pickDate() async {
    final date = await showDatePicker(
      context: context,
      initialDate: dateOfJourney ?? DateTime.now().add(const Duration(days: 1)),
      firstDate: DateTime.now().subtract(const Duration(days: 1)),
      lastDate: DateTime.now().add(const Duration(days: 120)),
    );
    if (date != null) setState(() => dateOfJourney = date);
  }

  void _snack(String msg) {
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
            const Icon(Icons.picture_as_pdf, color: primaryBlue),
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
    if (!(_formKey.currentState?.validate() ?? false)) return;

    if (dateOfJourney == null) {
      _snack("Please select date of journey");
      return;
    }

    final primaryName = primaryNameController.text.trim();
    final additional = int.tryParse(
            additionalTravellersController.text.trim().isEmpty
                ? '0'
                : additionalTravellersController.text.trim()) ??
        0;
    if (additional < 0 || additional > _maxAdditional) {
      _snack(
          "Maximum ${_maxAdditional + 1} total passengers per PNR (primary + up to $_maxAdditional additional)");
      return;
    }

    setState(() => submitting = true);

    try {
      final ageStr = primaryAgeController.text.trim();
      final waitlist = primaryWaitlistController.text.trim();
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
        final role = await AuthService.getRole();
        if (role == Roles.staff) {
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
          _snack("Train request created ✅");
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
        _snack(msg);
      }
    } catch (_) {
      _snack("Server error");
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: bgLight,
      appBar: AppBar(
        title: const Text("Train Emergency (EQ) Entry"),
        backgroundColor: primaryBlue,
        foregroundColor: Colors.white,
      ),
      body: Form(
        key: _formKey,
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
              const Icon(Icons.info_outline,
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
        TextFormField(
          controller: primaryNameController,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(
            labelText: "Primary Passenger Name *",
            hintText: "Full name of the primary passenger",
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.person),
          ),
          validator: (v) =>
              (v == null || v.trim().isEmpty) ? "Primary passenger name is required" : null,
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              flex: 3,
              child: DropdownButtonFormField<String>(
                value: _primaryGender,
                decoration: const InputDecoration(
                  labelText: "Gender",
                  border: OutlineInputBorder(),
                ),
                items: _genderOptions
                    .map((g) => DropdownMenuItem(
                          value: g['value'],
                          child: Text(g['label']!),
                        ))
                    .toList(),
                onChanged: (v) => setState(() => _primaryGender = v ?? ''),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              flex: 2,
              child: TextFormField(
                controller: primaryAgeController,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                maxLength: 3,
                decoration: const InputDecoration(
                  labelText: "Age",
                  border: OutlineInputBorder(),
                  counterText: "",
                ),
                validator: (v) {
                  final s = (v ?? '').trim();
                  if (s.isEmpty) return null;
                  final n = int.tryParse(s);
                  if (n == null || n <= 0 || n > 120) {
                    return "1–120";
                  }
                  return null;
                },
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              flex: 3,
              child: TextFormField(
                controller: primaryWaitlistController,
                decoration: const InputDecoration(
                  labelText: "W/L",
                  hintText: "e.g. WL/12",
                  border: OutlineInputBorder(),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: additionalTravellersController,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          maxLength: 1,
          decoration: InputDecoration(
            labelText: "Additional Travellers *",
            helperText:
                "Other people travelling on the same PNR (excluding the primary). Max $_maxAdditional.",
            border: const OutlineInputBorder(),
            counterText: "",
            prefixIcon: const Icon(Icons.group_add_outlined),
          ),
          validator: (v) {
            final s = (v ?? '').trim();
            final n = int.tryParse(s.isEmpty ? '0' : s);
            if (n == null || n < 0 || n > _maxAdditional) {
              return "0–$_maxAdditional";
            }
            return null;
          },
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: contactNumberController,
          keyboardType: TextInputType.phone,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          maxLength: 10,
          decoration: const InputDecoration(
            labelText: "Phone Number (Primary Passenger) *",
            hintText: "10-digit mobile number",
            helperText: "Contact number for the primary passenger",
            border: OutlineInputBorder(),
            counterText: "",
            prefixIcon: Icon(Icons.phone_outlined),
          ),
          validator: (v) {
            final s = (v ?? '').trim();
            if (s.isEmpty) return "Phone number is required";
            if (!RegExp(r'^\d{10}$').hasMatch(s)) {
              return "Enter a valid 10-digit phone number";
            }
            return null;
          },
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: TextFormField(
                controller: pnrController,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                maxLength: 10,
                decoration: const InputDecoration(
                  labelText: "PNR Number *",
                  hintText: "10-digit PNR",
                  helperText: "Click Fetch to auto-fill train details",
                  border: OutlineInputBorder(),
                  counterText: "",
                ),
                validator: (v) =>
                    (v == null || v.trim().length != 10) ? "Enter 10-digit PNR" : null,
              ),
            ),
            const SizedBox(width: 8),
            ElevatedButton.icon(
              onPressed: fetchingPNR ? null : _fetchPNRStatus,
              icon: fetchingPNR
                  ? const SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.search, size: 18),
              label: const Text("Fetch"),
              style: ElevatedButton.styleFrom(
                backgroundColor: primaryBlue,
                foregroundColor: Colors.white,
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: referencedByController,
          decoration: const InputDecoration(
            labelText: "Referenced By *",
            hintText: "Eg: MP Recommendation / Emergency Call",
            border: OutlineInputBorder(),
            prefixIcon: Icon(Icons.assignment_ind_outlined),
          ),
          validator: (v) => (v == null || v.trim().isEmpty)
              ? "Referenced By is required"
              : null,
        ),
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
          children: [
            Expanded(
              child: TextFormField(
                controller: trainNumberController,
                decoration: const InputDecoration(
                  labelText: "Train Number",
                  hintText: "e.g. 12301",
                  border: OutlineInputBorder(),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: TextFormField(
                controller: trainNameController,
                decoration: const InputDecoration(
                  labelText: "Train Name",
                  hintText: "e.g. Rajdhani Express",
                  border: OutlineInputBorder(),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: InkWell(
                onTap: _pickDate,
                child: InputDecorator(
                  decoration: const InputDecoration(
                    labelText: "Date of Journey *",
                    border: OutlineInputBorder(),
                    suffixIcon: Icon(Icons.calendar_today, size: 18),
                  ),
                  child: Text(
                    dateStr,
                    style: TextStyle(
                      color: dateOfJourney == null
                          ? Colors.grey.shade500
                          : Colors.black,
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: DropdownButtonFormField<String>(
                value: selectedClass,
                decoration: const InputDecoration(
                  labelText: "Class *",
                  border: OutlineInputBorder(),
                ),
                items: journeyClasses
                    .map((c) =>
                        DropdownMenuItem(value: c, child: Text(c)))
                    .toList(),
                onChanged: (v) =>
                    setState(() => selectedClass = v ?? selectedClass),
                validator: (v) =>
                    (v == null || v.isEmpty) ? "Required" : null,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: TextFormField(
                controller: fromStationController,
                decoration: const InputDecoration(
                  labelText: "From Station *",
                  hintText: "e.g. New Delhi (NDLS)",
                  border: OutlineInputBorder(),
                ),
                validator: (v) => (v == null || v.trim().isEmpty)
                    ? "From station is required"
                    : null,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: TextFormField(
                controller: toStationController,
                decoration: const InputDecoration(
                  labelText: "To Station *",
                  hintText: "e.g. Mumbai (BCT)",
                  border: OutlineInputBorder(),
                ),
                validator: (v) => (v == null || v.trim().isEmpty)
                    ? "To station is required"
                    : null,
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
      height: 50,
      child: ElevatedButton.icon(
        onPressed: submitting ? null : _submit,
        icon: submitting
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : const Icon(Icons.send),
        label: Text(submitting ? "Submitting..." : "Generate EQ Letter"),
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFFF59E0B),
          foregroundColor: Colors.black,
          textStyle:
              const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
        ),
      ),
    );
  }

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
}
