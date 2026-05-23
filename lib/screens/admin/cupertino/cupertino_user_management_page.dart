import 'package:flutter/cupertino.dart';

import '../../../theme/app_theme.dart';
import 'cupertino_user_create_page.dart';
import 'cupertino_user_list_page.dart';

class CupertinoUserManagementPage extends StatelessWidget {
  const CupertinoUserManagementPage({super.key});

  @override
  Widget build(BuildContext context) {
    return CupertinoPageScaffold(
      backgroundColor: AppTheme.background,
      navigationBar: const CupertinoNavigationBar(
        middle: Text(
          "User Management",
          style: TextStyle(color: CupertinoColors.white),
        ),
        backgroundColor: AppTheme.primaryIndigo,
        brightness: Brightness.dark,
      ),
      child: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _buildOption(
              context: context,
              icon: CupertinoIcons.person_2_fill,
              iconBg: AppTheme.primaryIndigo,
              title: "View All Users",
              subtitle:
                  "Browse, search, change roles, and activate/deactivate users.",
              onTap: () => Navigator.push(
                context,
                CupertinoPageRoute(
                    builder: (_) => const CupertinoUserListPage()),
              ),
            ),
            const SizedBox(height: 14),
            _buildOption(
              context: context,
              icon: CupertinoIcons.person_badge_plus,
              iconBg: AppTheme.successGreen,
              title: "Create User",
              subtitle:
                  "Provision a new account with a role and an initial password.",
              onTap: () => Navigator.push(
                context,
                CupertinoPageRoute(
                    builder: (_) => const CupertinoUserCreatePage()),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildOption({
    required BuildContext context,
    required IconData icon,
    required Color iconBg,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: CupertinoColors.white,
          borderRadius: BorderRadius.circular(AppTheme.radiusLg),
          border: Border.all(color: AppTheme.border),
          boxShadow: AppTheme.shadowSm,
        ),
        child: Row(
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: iconBg.withOpacity(0.1),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Icon(icon, color: iconBg, size: 28),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: AppTheme.headingSm.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: AppTheme.bodySm.copyWith(color: AppTheme.muted),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            const Icon(CupertinoIcons.chevron_right,
                color: CupertinoColors.systemGrey3, size: 18),
          ],
        ),
      ),
    );
  }
}
