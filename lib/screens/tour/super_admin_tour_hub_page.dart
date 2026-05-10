import 'package:flutter/material.dart';

import 'super_admin_tour_list_page.dart';

class SuperAdminTourHubPage extends StatelessWidget {
  const SuperAdminTourHubPage({super.key});

  static const Color primaryBlue = Color(0xFF0A2E5C);
  static const Color bgLight = Color(0xFFF4F6FB);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: bgLight,
      appBar: AppBar(
        title: const Text("Tour Programs"),
        backgroundColor: primaryBlue,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        titleTextStyle: const TextStyle(
          color: Colors.white,
          fontSize: 18,
          fontWeight: FontWeight.bold,
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _hubTile(
            context,
            icon: Icons.wb_sunny,
            iconColor: const Color(0xFFF59E0B),
            iconBg: const Color(0xFFFEF3C7),
            title: "Today's Programs",
            subtitle: "Tour programs scheduled for today",
            category: TourCategory.today,
          ),
          const SizedBox(height: 12),
          _hubTile(
            context,
            icon: Icons.calendar_month,
            iconColor: primaryBlue,
            iconBg: const Color(0xFFE0E7FF),
            title: "Upcoming Programs",
            subtitle: "Tour programs scheduled after today",
            category: TourCategory.upcoming,
          ),
          const SizedBox(height: 12),
          _hubTile(
            context,
            icon: Icons.calendar_today,
            iconColor: const Color(0xFF9333EA),
            iconBg: const Color(0xFFF3E8FF),
            title: "All Programs",
            subtitle: "Complete tour program history",
            category: TourCategory.all,
          ),
        ],
      ),
    );
  }

  Widget _hubTile(
    BuildContext context, {
    required IconData icon,
    required Color iconColor,
    required Color iconBg,
    required String title,
    required String subtitle,
    required TourCategory category,
  }) {
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => SuperAdminTourListPage(category: category),
          ),
        );
      },
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.grey.shade300),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: iconBg,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: iconColor, size: 24),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: const TextStyle(
                          fontSize: 16, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 2),
                  Text(subtitle,
                      style: TextStyle(
                          fontSize: 13, color: Colors.grey.shade600)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: Color(0xFFBDBDBD)),
          ],
        ),
      ),
    );
  }
}
