import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import 'grievance_create_page.dart';

/// Gateway shown before [GrievanceCreatePage] — staff picks the grievance
/// type up-front so the form below can render only the fields that apply.
class GrievanceTypePickerPage extends StatefulWidget {
  final Future<void> Function()? onCreated;

  const GrievanceTypePickerPage({super.key, this.onCreated});

  @override
  State<GrievanceTypePickerPage> createState() =>
      _GrievanceTypePickerPageState();
}

class _GrievanceTypePickerPageState extends State<GrievanceTypePickerPage> {
  String _selectedType = 'WATER';

  static const List<Map<String, String>> _types = [
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

  Future<void> _onContinue() async {
    final result = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => GrievanceCreatePage(
          initialType: _selectedType,
          onCreated: widget.onCreated,
        ),
      ),
    );
    if (result == true && mounted) {
      Navigator.pop(context, true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        backgroundColor: AppTheme.primaryIndigo,
        title: const Text(
          'Register New Grievance',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Register New Grievance',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.primaryIndigo,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Public Grievance & Letter Tracking',
                style: TextStyle(
                  fontSize: 14,
                  color: Colors.grey.shade600,
                ),
              ),
              const SizedBox(height: 20),
              _buildCard(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCard() {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: AppTheme.shadowSm,
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Choose Grievance Type',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: AppTheme.foreground,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Select the type first — we will only ask the fields relevant to that type.',
            style: TextStyle(
              fontSize: 13,
              color: Colors.grey.shade600,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 20),
          RichText(
            text: const TextSpan(
              text: 'Grievance Type ',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppTheme.foreground,
              ),
              children: [
                TextSpan(
                  text: '*',
                  style: TextStyle(color: Colors.red),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            value: _selectedType,
            isExpanded: true,
            decoration: InputDecoration(
              filled: true,
              fillColor: Colors.white,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 12,
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: BorderSide(color: Colors.grey.shade400),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: BorderSide(color: Colors.grey.shade400),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(
                  color: AppTheme.primaryIndigo,
                  width: 2,
                ),
              ),
            ),
            items: _types
                .map((t) => DropdownMenuItem(
                      value: t['value'],
                      child: Text(t['label']!),
                    ))
                .toList(),
            onChanged: (v) {
              if (v == null) return;
              setState(() => _selectedType = v);
            },
          ),
          const SizedBox(height: 24),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              OutlinedButton(
                onPressed: () => Navigator.pop(context),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppTheme.foreground,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 22,
                    vertical: 12,
                  ),
                  side: BorderSide(color: Colors.grey.shade400),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: const Text(
                  'Cancel',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
              const SizedBox(width: 10),
              ElevatedButton(
                onPressed: _onContinue,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.saffron,
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 22,
                    vertical: 12,
                  ),
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                child: const Text(
                  'Continue',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
