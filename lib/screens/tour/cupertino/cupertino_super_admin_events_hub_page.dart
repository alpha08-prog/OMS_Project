import 'package:flutter/cupertino.dart';

import '../super_admin_events_list_page.dart' show EventsCategory;
import 'cupertino_super_admin_events_list_page.dart';
import '../../../widgets/cupertino/cupertino_page_header.dart';

class CupertinoSuperAdminEventsHubPage extends StatelessWidget {
  const CupertinoSuperAdminEventsHubPage({super.key});

  static const Color primaryBlue = Color(0xFF0A2E5C);
  static const Color bgLight = Color(0xFFF4F6FB);

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      backgroundColor: bgLight,
      child: Column(
        children: [
          OmsPageHeader(title: "Events", showBack: false),
          Expanded(
            child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _hubTile(
              context,
              icon: CupertinoIcons.sun_max_fill,
              iconColor: const Color(0xFFF59E0B),
              iconBg: const Color(0xFFFEF3C7),
              title: "Today's Events",
              subtitle: "Events scheduled for today",
              category: EventsCategory.today,
            ),
            const SizedBox(height: 12),
            _hubTile(
              context,
              icon: CupertinoIcons.calendar,
              iconColor: primaryBlue,
              iconBg: const Color(0xFFE0E7FF),
              title: "Upcoming Events",
              subtitle: "Events scheduled after today",
              category: EventsCategory.upcoming,
            ),
            const SizedBox(height: 12),
            _hubTile(
              context,
              icon: CupertinoIcons.calendar_today,
              iconColor: const Color(0xFF9333EA),
              iconBg: const Color(0xFFF3E8FF),
              title: "All Events",
              subtitle: "Complete event history",
              category: EventsCategory.all,
            ),
          ],
        ),
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
    required EventsCategory category,
  }) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () {
        Navigator.push(
          context,
          CupertinoPageRoute(
            builder: (_) =>
                CupertinoSuperAdminEventsListPage(category: category),
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
