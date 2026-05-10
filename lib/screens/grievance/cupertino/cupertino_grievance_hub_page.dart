import 'package:flutter/cupertino.dart';

import '../../../theme/app_theme.dart';
import '../../../widgets/cupertino/cupertino_page_header.dart';
import 'cupertino_grievance_create_page.dart';
import 'cupertino_office_grievance_create_page.dart';
import 'cupertino_grievance_list_page.dart';

class CupertinoGrievanceHubPage extends StatelessWidget {
  final String role;
  const CupertinoGrievanceHubPage({super.key, required this.role});

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      backgroundColor: AppTheme.background,
      child: Column(
        children: [
          OmsPageHeader(title: "Grievance"),
          Expanded(child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _headerCard(),
            const SizedBox(height: 16),
            _hubCard(
              context,
              icon: CupertinoIcons.globe,
              title: "Public Grievance",
              subtitle: "File a grievance from a citizen / petitioner",
              color: AppTheme.primaryIndigo,
              gradient: AppTheme.primaryGradient,
              onTap: () {
                Navigator.push(
                  context,
                  CupertinoPageRoute(
                    builder: (_) =>
                        CupertinoGrievanceCreatePage(role: role),
                  ),
                );
              },
            ),
            const SizedBox(height: 12),
            _hubCard(
              context,
              icon: CupertinoIcons.building_2_fill,
              title: "Office Grievance",
              subtitle: "File a grievance routed through the office",
              color: AppTheme.saffronDark,
              gradient: AppTheme.saffronGradient,
              onTap: () {
                Navigator.push(
                  context,
                  CupertinoPageRoute(
                    builder: (_) => const CupertinoOfficeGrievanceCreatePage(),
                  ),
                );
              },
            ),
            const SizedBox(height: 12),
            _hubCard(
              context,
              icon: CupertinoIcons.folder_fill,
              title: "Old Grievances",
              subtitle: "View, filter and download grievances you've created",
              color: AppTheme.successGreen,
              gradient: AppTheme.successGradient,
              onTap: () {
                Navigator.push(
                  context,
                  CupertinoPageRoute(
                    builder: (_) => CupertinoGrievanceListPage(role: role),
                  ),
                );
              },
            ),
          ],
        )),
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
              color: CupertinoColors.white.withOpacity(0.2),
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Icon(CupertinoIcons.doc_text_fill,
                color: CupertinoColors.white, size: 28),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  "Grievance Center",
                  style: TextStyle(
                    color: CupertinoColors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  "Choose what you want to do",
                  style: TextStyle(
                    color: CupertinoColors.white.withOpacity(0.85),
                    fontSize: 13,
                  ),
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
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: CupertinoColors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: AppTheme.shadowSm,
          border: Border.all(color: CupertinoColors.systemGrey5),
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
              child:
                  Icon(icon, color: CupertinoColors.white, size: 28),
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
                    style: const TextStyle(
                      fontSize: 12,
                      color: CupertinoColors.systemGrey,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(CupertinoIcons.chevron_right,
                color: CupertinoColors.systemGrey3, size: 18),
          ],
        ),
      ),
    );
  }
}
