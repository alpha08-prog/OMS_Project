import 'package:flutter/cupertino.dart';

import '../../../theme/app_theme.dart';
import '../../../widgets/cupertino/cupertino_form_helpers.dart';
import 'cupertino_grievance_create_page.dart';

/// iOS counterpart of [GrievanceTypePickerPage]. Same single-step gate:
/// staff picks the type, then the create form opens with it locked in.
class CupertinoGrievanceTypePickerPage extends StatefulWidget {
  final String role;
  final Future<void> Function()? onCreated;

  const CupertinoGrievanceTypePickerPage({
    super.key,
    required this.role,
    this.onCreated,
  });

  @override
  State<CupertinoGrievanceTypePickerPage> createState() =>
      _CupertinoGrievanceTypePickerPageState();
}

class _CupertinoGrievanceTypePickerPageState
    extends State<CupertinoGrievanceTypePickerPage> {
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

  String _labelFor(String value) {
    for (final t in _types) {
      if (t['value'] == value) return t['label']!;
    }
    return value;
  }

  void _showTypePicker() {
    CupertinoFormHelpers.showPicker(
      context: context,
      items: _types.map((e) => e['label']!).toList(),
      currentValue: _labelFor(_selectedType),
      title: 'Grievance Type',
      onSelected: (label) {
        for (final e in _types) {
          if (e['label'] == label) {
            setState(() => _selectedType = e['value']!);
            return;
          }
        }
      },
    );
  }

  Future<void> _onContinue() async {
    final result = await Navigator.push<bool>(
      context,
      CupertinoPageRoute(
        builder: (_) => CupertinoGrievanceCreatePage(
          role: widget.role,
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
    return CupertinoPageScaffold(
      backgroundColor: AppTheme.background,
      navigationBar: CupertinoNavigationBar(
        backgroundColor: AppTheme.primaryIndigo,
        brightness: Brightness.dark,
        middle: const Text(
          'Register New Grievance',
          style: TextStyle(
            color: CupertinoColors.white,
            fontWeight: FontWeight.bold,
          ),
        ),
        leading: CupertinoButton(
          padding: EdgeInsets.zero,
          onPressed: () => Navigator.pop(context),
          child:
              const Icon(CupertinoIcons.back, color: CupertinoColors.white),
        ),
      ),
      child: SafeArea(
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
              const Text(
                'Public Grievance & Letter Tracking',
                style: TextStyle(
                  fontSize: 14,
                  color: CupertinoColors.systemGrey,
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
        color: CupertinoColors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: AppTheme.shadowSm,
        border: Border.all(color: CupertinoColors.systemGrey5),
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
          const Text(
            'Select the type first — we will only ask the fields relevant to that type.',
            style: TextStyle(
              fontSize: 13,
              color: CupertinoColors.systemGrey,
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
                  style: TextStyle(color: CupertinoColors.destructiveRed),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          GestureDetector(
            onTap: _showTypePicker,
            child: Container(
              padding: const EdgeInsets.symmetric(
                horizontal: 14,
                vertical: 14,
              ),
              decoration: BoxDecoration(
                color: CupertinoColors.white,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: CupertinoColors.systemGrey3),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      _labelFor(_selectedType),
                      style: const TextStyle(
                        fontSize: 15,
                        color: AppTheme.foreground,
                      ),
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
          ),
          const SizedBox(height: 24),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              CupertinoButton(
                padding: const EdgeInsets.symmetric(
                  horizontal: 22,
                  vertical: 12,
                ),
                color: CupertinoColors.white,
                borderRadius: BorderRadius.circular(8),
                onPressed: () => Navigator.pop(context),
                child: const Text(
                  'Cancel',
                  style: TextStyle(
                    color: AppTheme.foreground,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              CupertinoButton(
                padding: const EdgeInsets.symmetric(
                  horizontal: 22,
                  vertical: 12,
                ),
                color: AppTheme.saffron,
                borderRadius: BorderRadius.circular(8),
                onPressed: _onContinue,
                child: const Text(
                  'Continue',
                  style: TextStyle(
                    color: CupertinoColors.black,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
