import 'package:flutter/cupertino.dart';

import '../super_admin_tour_list_page.dart' show TourCategory;
import 'cupertino_super_admin_tour_list_page.dart';

class CupertinoSuperAdminTourHubPage extends StatelessWidget {
  const CupertinoSuperAdminTourHubPage({super.key});

  static const Color primaryBlue = Color(0xFF0A2E5C);
  static const Color bgLight = Color(0xFFF4F6FB);

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      backgroundColor: bgLight,
      navigationBar: const CupertinoNavigationBar(
        middle:
            Text("Tour Programs", style: TextStyle(color: CupertinoColors.white)),
        backgroundColor: primaryBlue,
        brightness: Brightness.dark,
      ),
      child: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _hubTile(
              context,
              icon: CupertinoIcons.sun_max_fill,
              iconColor: const Color(0xFFF59E0B),
              iconBg: const Color(0xFFFEF3C7),
              title: "Today's Programs",
              subtitle: "Tour programs scheduled for today",
              category: TourCategory.today,
            ),
            const SizedBox(height: 12),
            _hubTile(
              context,
              icon: CupertinoIcons.calendar,
              iconColor: primaryBlue,
              iconBg: const Color(0xFFE0E7FF),
              title: "Upcoming Programs",
              subtitle: "Tour programs scheduled after today",
              category: TourCategory.upcoming,
            ),
            const SizedBox(height: 12),
            _hubTile(
              context,
              icon: CupertinoIcons.calendar_today,
              iconColor: const Color(0xFF9333EA),
              iconBg: const Color(0xFFF3E8FF),
              title: "All Programs",
              subtitle: "Complete tour program history",
              category: TourCategory.all,
            ),
          ],
        ),
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
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () {
        Navigator.push(
          context,
          CupertinoPageRoute(
            builder: (_) =>
                CupertinoSuperAdminTourListPage(category: category),
          ),
        );
      },
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: CupertinoColors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: CupertinoColors.systemGrey5),
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
                      style: const TextStyle(
                          fontSize: 13,
                          color: CupertinoColors.systemGrey)),
                ],
              ),
            ),
            const Icon(CupertinoIcons.chevron_right,
                size: 18, color: CupertinoColors.systemGrey3),
          ],
        ),
      ),
    );
  }
}
