import 'package:flutter/material.dart';

import '../../theme/app_theme.dart';
import 'grievance_type_picker_page.dart';
import 'office_grievance_create_page.dart';
import 'grievance_list_page.dart';

class GrievanceHubPage extends StatelessWidget {
  final String role;
  const GrievanceHubPage({super.key, required this.role});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        backgroundColor: AppTheme.primaryIndigo,
        elevation: 0,
        title: const Text(
          "Grievance",
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _headerCard(),
          const SizedBox(height: 16),
          _hubCard(
            context,
            icon: Icons.public,
            title: "Public Grievance",
            subtitle: "File a grievance from a citizen / petitioner",
            color: AppTheme.primaryIndigo,
            gradient: AppTheme.primaryGradient,
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => const GrievanceTypePickerPage(),
              ),
            ),
          ),
          const SizedBox(height: 12),
          _hubCard(
            context,
            icon: Icons.business,
            title: "Office Grievance",
            subtitle: "File a grievance routed through the office",
            color: AppTheme.saffronDark,
            gradient: AppTheme.saffronGradient,
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(
                  builder: (_) => const OfficeGrievanceCreatePage()),
            ),
          ),
          const SizedBox(height: 12),
          _hubCard(
            context,
            icon: Icons.folder_copy,
            title: "Old Grievances",
            subtitle: "View, filter and download grievances you've created",
            color: AppTheme.successGreen,
            gradient: AppTheme.successGradient,
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(
                  builder: (_) => GrievanceListPage(role: role)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _headerCard() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: AppTheme.primaryGradient,
        borderRadius: BorderRadius.circular(20),
        boxShadow: AppTheme.shadowColored(AppTheme.primaryIndigo),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.2),
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Icon(Icons.assignment, color: Colors.white, size: 28),
          ),
          const SizedBox(width: 16),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  "Grievance Center",
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                SizedBox(height: 4),
                Text(
                  "Choose what you want to do",
                  style: TextStyle(color: Colors.white70, fontSize: 13),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _hubCard(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String subtitle,
    required Color color,
    required Gradient gradient,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: AppTheme.shadowSm,
            border: Border.all(color: AppTheme.border),
          ),
          child: Row(
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  gradient: gradient,
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: AppTheme.shadowColored(color),
                ),
                child: Icon(icon, color: Colors.white, size: 28),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                        color: AppTheme.foreground,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: Colors.grey.shade400),
            ],
          ),
        ),
      ),
    );
  }
}
