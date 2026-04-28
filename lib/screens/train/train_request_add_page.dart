import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/http_service.dart';

class TrainRequestAddPage extends StatefulWidget {
  final Future<void> Function()? onCreated;

  const TrainRequestAddPage({super.key, this.onCreated});

  @override
  State<TrainRequestAddPage> createState() => _TrainRequestAddPageState();
}

class _TrainRequestAddPageState extends State<TrainRequestAddPage> {
  static const Color primaryBlue = Color(0xFF0A2E5C);
  static const Color bgLight = Color(0xFFF4F6FB);

  final _formKey = GlobalKey<FormState>();

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

  final List<Map<String, String>> bookingTypes = [
    {'value': 'GENERAL', 'label': 'General'},
    {'value': 'TATKAL', 'label': 'Tatkal'},
    {'value': 'PREMIUM_TATKAL', 'label': 'Premium Tatkal'},
    {'value': 'LADIES', 'label': 'Ladies Quota'},
    {'value': 'LOWER_BERTH', 'label': 'Lower Berth'},
    {'value': 'DUTY_PASS', 'label': 'Duty Pass'},
  ];

  final List<String> journeyClasses = [
    'SL',
    '3A',
    '2A',
    '1A',
    'CC',
    'EC',
    '2S',
    'FC',
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
        'gender': 'MALE',
        'berthPreference': '',
      });
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
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("PNR must be 10 digits")),
      );
      return;
    }

    setState(() => fetchingPNR = true);

    try {
      final res = await HttpService.get("/api/train-requests/pnr/$pnr");

      if (res.statusCode == 200) {
        final decoded = jsonDecode(res.body);
        final data = decoded["data"] ?? decoded;

        setState(() {
          // Fill train details
          trainNameController.text = data["trainName"] ?? '';
          trainNumberController.text = data["trainNumber"] ?? '';
          fromStationController.text = data["from"] ?? '';
          toStationController.text = data["to"] ?? '';

          // Parse date
          final doj = data["dateOfJourney"];
          if (doj != null && doj != 'N/A') {
            try {
              dateOfJourney = DateTime.parse(doj);
            } catch (_) {}
          }

          // Set class
          final cls = data["class"];
          if (cls != null && journeyClasses.contains(cls)) {
            selectedClass = cls;
          }

          // Fill passengers
          final passengerList = data["passengers"] as List? ?? [];
          passengers = passengerList.map<Map<String, dynamic>>((p) {
            return {
              'name': p["name"] ?? '',
              'age': (p["age"] ?? '').toString(),
              'gender': p["gender"] ?? 'MALE',
              'berthPreference': '',
              'bookingStatus': p["bookingStatus"] ?? '',
              'currentStatus': p["currentStatus"] ?? '',
            };
          }).toList();
        });

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(data["isMock"] == true
                ? "PNR fetched (mock data)"
                : "PNR fetched successfully"),
          ),
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("PNR fetch failed (${res.statusCode})")),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server error")),
      );
    } finally {
      setState(() => fetchingPNR = false);
    }
  }

  Future<void> _pickDate() async {
    final date = await showDatePicker(
      context: context,
      initialDate: dateOfJourney ?? DateTime.now().add(const Duration(days: 1)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 120)),
    );

    if (date != null) {
      setState(() => dateOfJourney = date);
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    if (dateOfJourney == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Please select date of journey")),
      );
      return;
    }

    setState(() => submitting = true);

    try {
      final body = {
        "pnrNumber": pnrController.text.trim(),
        "trainName": trainNameController.text.trim(),
        "trainNumber": trainNumberController.text.trim(),
        "bookingType": selectedBookingType,
        "journeyClass": selectedClass,
        "dateOfJourney": dateOfJourney!.toIso8601String(),
        "fromStation": fromStationController.text.trim(),
        "toStation": toStationController.text.trim(),
        "contactNumber": contactNumberController.text.trim(),
        "referencedBy": referencedByController.text.trim(),
        "remarks": remarksController.text.trim(),
        "passengers": passengers
            .where((p) => (p['name'] ?? '').toString().isNotEmpty)
            .map((p) => {
                  "name": p['name'],
                  "age": int.tryParse(p['age']?.toString() ?? '') ?? 30,
                  "gender": p['gender'] ?? 'MALE',
                  "berthPreference": p['berthPreference'] ?? '',
                  "bookingStatus": p['bookingStatus'] ?? '',
                  "currentStatus": p['currentStatus'] ?? '',
                })
            .toList(),
      };

      final res = await HttpService.post("/api/train-requests", body);

      if (res.statusCode == 201 || res.statusCode == 200) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Train request created ✅")),
        );

        if (widget.onCreated != null) {
          await widget.onCreated!();
        }

        Navigator.pop(context, true);
      } else {
        String msg = "Failed (${res.statusCode})";
        try {
          final data = jsonDecode(res.body);
          msg = data["message"] ?? msg;
        } catch (_) {}

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg)),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Server error")),
      );
    } finally {
      if (mounted) setState(() => submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: bgLight,
      appBar: AppBar(
        title: const Text("New Train Request"),
        backgroundColor: primaryBlue,
      ),
      body: Form(
        key: _formKey,
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
                      child: TextFormField(
                        controller: pnrController,
                        keyboardType: TextInputType.number,
                        maxLength: 10,
                        decoration: const InputDecoration(
                          labelText: "PNR Number *",
                          border: OutlineInputBorder(),
                          counterText: "",
                        ),
                        validator: (v) => (v == null || v.trim().length != 10)
                            ? "Enter 10-digit PNR"
                            : null,
                      ),
                    ),
                    const SizedBox(width: 12),
                    ElevatedButton.icon(
                      onPressed: fetchingPNR ? null : _fetchPNRStatus,
                      icon: fetchingPNR
                          ? const SizedBox(
                              width: 16,
                              height: 16,
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
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 14),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                DropdownButtonFormField<String>(
                  value: selectedBookingType,
                  decoration: const InputDecoration(
                    labelText: "Booking Type",
                    border: OutlineInputBorder(),
                  ),
                  items: bookingTypes.map((t) {
                    return DropdownMenuItem(
                      value: t['value'],
                      child: Text(t['label']!),
                    );
                  }).toList(),
                  onChanged: (v) => setState(() => selectedBookingType = v!),
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
                      child: TextFormField(
                        controller: trainNumberController,
                        decoration: const InputDecoration(
                          labelText: "Train Number",
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 2,
                      child: TextFormField(
                        controller: trainNameController,
                        decoration: const InputDecoration(
                          labelText: "Train Name",
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
                      child: TextFormField(
                        controller: fromStationController,
                        decoration: const InputDecoration(
                          labelText: "From Station *",
                          border: OutlineInputBorder(),
                        ),
                        validator: (v) =>
                            (v == null || v.trim().isEmpty) ? "Required" : null,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextFormField(
                        controller: toStationController,
                        decoration: const InputDecoration(
                          labelText: "To Station *",
                          border: OutlineInputBorder(),
                        ),
                        validator: (v) =>
                            (v == null || v.trim().isEmpty) ? "Required" : null,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: selectedClass,
                  decoration: const InputDecoration(
                    labelText: "Class *",
                    border: OutlineInputBorder(),
                  ),
                  items: journeyClasses.map((c) {
                    return DropdownMenuItem(value: c, child: Text(c));
                  }).toList(),
                  onChanged: (v) => setState(() => selectedClass = v!),
                ),
                const SizedBox(height: 12),
                InkWell(
                  onTap: _pickDate,
                  child: InputDecorator(
                    decoration: const InputDecoration(
                      labelText: "Date of Journey *",
                      border: OutlineInputBorder(),
                      suffixIcon: Icon(Icons.calendar_today),
                    ),
                    child: Text(
                      dateOfJourney != null
                          ? DateFormat('dd MMM yyyy').format(dateOfJourney!)
                          : "Select Date",
                      style: TextStyle(
                        color:
                            dateOfJourney != null ? Colors.black : Colors.grey,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Passengers Section
            _buildCard(
              title: "PASSENGERS",
              trailing: TextButton.icon(
                onPressed: _addPassenger,
                icon: const Icon(Icons.add, size: 18),
                label: const Text("Add"),
              ),
              children: [
                if (passengers.isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(16),
                    child: Text(
                      "No passengers added. Click 'Add' to add passengers.",
                      style: TextStyle(color: Colors.grey),
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
                TextFormField(
                  controller: contactNumberController,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                    labelText: "Contact Number",
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: referencedByController,
                  decoration: const InputDecoration(
                    labelText: "Referenced By",
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: remarksController,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText: "Remarks",
                    border: OutlineInputBorder(),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Digital Signature gate
            Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: _signatureAcknowledged
                      ? primaryBlue
                      : Colors.grey.shade300,
                  width: _signatureAcknowledged ? 1.5 : 1,
                ),
              ),
              child: CheckboxListTile(
                value: _signatureAcknowledged,
                onChanged: (v) =>
                    setState(() => _signatureAcknowledged = v ?? false),
                controlAffinity: ListTileControlAffinity.leading,
                activeColor: primaryBlue,
                title: const Text(
                  "Attach Digital Signature",
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
                subtitle: const Text(
                  "Appends Minister's stored digital signature to the PDF",
                  style: TextStyle(fontSize: 12),
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Submit Button
            SizedBox(
              width: double.infinity,
              height: 54,
              child: ElevatedButton(
                onPressed: (submitting || !_signatureAcknowledged)
                    ? null
                    : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: primaryBlue,
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: Colors.grey.shade300,
                  disabledForegroundColor: Colors.grey.shade600,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: submitting
                    ? const CircularProgressIndicator(color: Colors.white)
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
    );
  }

  Widget _buildCard({
    required String title,
    required List<Widget> children,
    Widget? trailing,
  }) {
    return Container(
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
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
            child: Row(
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: primaryBlue,
                  ),
                ),
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
        border: Border.all(color: Colors.grey.shade300),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 14,
                backgroundColor: primaryBlue,
                child: Text(
                  "${index + 1}",
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                "Passenger ${index + 1}",
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              const Spacer(),
              IconButton(
                icon: const Icon(Icons.delete, color: Colors.red, size: 20),
                onPressed: () => _removePassenger(index),
                constraints: const BoxConstraints(),
                padding: EdgeInsets.zero,
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextFormField(
            initialValue: passenger['name'],
            decoration: const InputDecoration(
              labelText: "Name *",
              border: OutlineInputBorder(),
              isDense: true,
            ),
            onChanged: (v) => passengers[index]['name'] = v,
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  initialValue: passenger['age']?.toString(),
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: "Age *",
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  onChanged: (v) => passengers[index]['age'] = v,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: DropdownButtonFormField<String>(
                  value: passenger['gender'] ?? 'MALE',
                  decoration: const InputDecoration(
                    labelText: "Gender",
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  items: const [
                    DropdownMenuItem(value: 'MALE', child: Text("Male")),
                    DropdownMenuItem(value: 'FEMALE', child: Text("Female")),
                    DropdownMenuItem(value: 'OTHER', child: Text("Other")),
                  ],
                  onChanged: (v) =>
                      setState(() => passengers[index]['gender'] = v),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          TextFormField(
            initialValue: passenger['berthPreference'],
            decoration: const InputDecoration(
              labelText: "Berth Preference (LB/MB/UB/SL/SU)",
              border: OutlineInputBorder(),
              isDense: true,
            ),
            onChanged: (v) => passengers[index]['berthPreference'] = v,
          ),
          if (passenger['bookingStatus']?.toString().isNotEmpty == true ||
              passenger['currentStatus']?.toString().isNotEmpty == true) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                if (passenger['bookingStatus']?.toString().isNotEmpty == true)
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.blue.shade50,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            "Booking Status",
                            style: TextStyle(fontSize: 10, color: Colors.grey),
                          ),
                          Text(
                            passenger['bookingStatus'].toString(),
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                              color: Colors.blue.shade700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                if (passenger['bookingStatus']?.toString().isNotEmpty == true &&
                    passenger['currentStatus']?.toString().isNotEmpty == true)
                  const SizedBox(width: 8),
                if (passenger['currentStatus']?.toString().isNotEmpty == true)
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.green.shade50,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            "Current Status",
                            style: TextStyle(fontSize: 10, color: Colors.grey),
                          ),
                          Text(
                            passenger['currentStatus'].toString(),
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                              color: Colors.green.shade700,
                            ),
                          ),
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
}
